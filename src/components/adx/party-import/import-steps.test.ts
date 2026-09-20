import { describe, expect, it } from "vitest";
import type { PartyImport } from "@/services/party-imports";
import { badColumnOf, rowsFor, stepOf, tilesOf } from "./import-steps";
import { IMPORT_KIT_CONFIGS, PARTY_IMPORT_CONFIGS, PUBLISHER_IMPORT_CONFIG } from "./party-import-config";

/**
 * The import kit's step machine — Lot D (Q43/Q86), one machine for every
 * party since package S.
 *
 * What is pinned, on a fixture per party: with no import there is only
 * the upload; a VALIDATED import stands at the report with the commit
 * ahead; a COMMITTED one is closed at the commit and a REVOKED one closed
 * at the report. The tiles count what the commit will do, warnings
 * included, because the server creates through a warning. And each
 * party's configuration is whole: mobile is required everywhere, the
 * format guide it reads is the party's own, the grid only draws columns
 * the party has, and the routes are the party's own.
 */

const PARTIES = Object.keys(IMPORT_KIT_CONFIGS) as (keyof typeof IMPORT_KIT_CONFIGS)[];

const fixture = (party: keyof typeof IMPORT_KIT_CONFIGS, status: PartyImport["status"]): PartyImport => ({
    id: `imp_${party}`,
    party,
    fileName: `${party}.csv`,
    note: null,
    uploadedById: "usr_admin",
    status,
    rowCount: 10,
    createdCount: 6,
    mergedCount: 2,
    skippedCount: 1,
    warningCount: 2,
    invalidCount: 1,
    createdAt: "2026-09-15T09:00:00.000Z",
    committedAt: status === "COMMITTED" ? "2026-09-15T09:05:00.000Z" : null,
});

describe("stepOf", () => {
    it("starts at the upload with nothing done", () => {
        expect(stepOf(null)).toEqual({ active: 0, done: [], closed: false });
    });

    it.each(PARTIES)("%s: stands at the report once validated, closes at the commit, or at the report when revoked", (party) => {
        expect(stepOf(fixture(party, "VALIDATED"))).toEqual({ active: 1, done: [0], closed: false });
        expect(stepOf(fixture(party, "COMMITTED"))).toEqual({ active: 2, done: [0, 1, 2], closed: true });
        expect(stepOf(fixture(party, "REVOKED"))).toEqual({ active: 1, done: [0], closed: true });
    });
});

describe("tilesOf", () => {
    it.each(PARTIES)("%s: counts creates and merges as valid, warnings included", (party) => {
        expect(tilesOf(fixture(party, "VALIDATED"))).toEqual({ rows: 10, valid: 8, errors: 1, warnings: 2, skipped: 1 });
    });
});

describe("the report grid", () => {
    it("filters by outcome and names the column an invalid row is about", () => {
        const rows = [
            { outcome: "CREATED" as const, message: "Will create as a pending publisher" },
            { outcome: "INVALID" as const, message: "panNumber: Invalid PAN" },
            { outcome: "INVALID" as const, message: "mobile is required" },
            { outcome: "INVALID" as const, message: "turnaroundDays: Use a whole number of days" },
        ];
        expect(rowsFor(rows, "INVALID")).toHaveLength(3);
        expect(rowsFor(rows, "all")).toHaveLength(4);
        expect(badColumnOf(rows[1])).toBe("panNumber");
        expect(badColumnOf(rows[2])).toBe("mobile");
        expect(badColumnOf(rows[3])).toBe("turnaroundDays");
        expect(badColumnOf(rows[0])).toBeNull();
    });
});

describe("the party configurations", () => {
    it.each(PARTIES)("%s: mobile is required, the guide is the party's own, the grid draws only columns the party has, the page is the section's", (party) => {
        const config = IMPORT_KIT_CONFIGS[party];
        const keys = config.columns.map((column) => column.key);
        expect(new Set(keys).size).toBe(keys.length);
        expect(config.columns.find((column) => column.key === "mobile")?.required).toBe(true);
        expect(config.formatKind).toBe(party);
        expect(config.needsPublisher).toBeFalsy();
        for (const column of config.grid) expect(keys).toContain(column.key);
        expect(config.href).toBe(`${config.section.href}/import`);
        expect(config.commitDescription({ createdCount: 1, mergedCount: 2 })).toMatch(/1 [a-z ]+ will be created/);
        expect(config.commitDescription({ createdCount: 3, mergedCount: 0 })).toMatch(/3 [a-z ]+s will be created/);
    });

    it("names the four parties' columns as the backend's schema does", () => {
        const keys = (party: keyof typeof PARTY_IMPORT_CONFIGS) => PARTY_IMPORT_CONFIGS[party].columns.map((column) => column.key);
        expect(keys("advertisers")).toEqual(["name", "mobile", "email", "type", "companyName", "industry", "gstin", "panNumber", "address", "city", "state", "contactName", "firstName", "lastName", "dateOfBirth", "gender"]);
        expect(keys("agents")).toEqual(["name", "mobile", "email", "side", "city", "state"]);
        expect(PARTY_IMPORT_CONFIGS.agents.columns.find((column) => column.key === "side")?.required).toBe(true);
        expect(keys("print-partners")).toEqual(["name", "mobile", "legalName", "gstin", "panNumber", "contactName", "email", "address", "city", "capabilities", "maxWidthFt", "turnaroundDays"]);
        expect(keys("employees")).toEqual(["name", "mobile", "email", "department", "designation", "region", "workMode", "employmentType"]);
    });

    it("opens a committed row on the party's own page, and an employee on the directory profile by the user id the row carries", () => {
        expect(PUBLISHER_IMPORT_CONFIG.targetHref("pub_1", null)).toBe("/publishers/pub_1");
        expect(PARTY_IMPORT_CONFIGS.advertisers.targetHref("adv_1", null)).toBe("/advertisers/adv_1");
        expect(PARTY_IMPORT_CONFIGS.agents.targetHref("agt_1", null)).toBe("/agents/agt_1");
        expect(PARTY_IMPORT_CONFIGS["print-partners"].targetHref("pp_1", null)).toBe("/print-partners/pp_1");
        expect(PARTY_IMPORT_CONFIGS.employees.targetHref("emp_1", "usr_1")).toBe("/employees/directory/usr_1");
        expect(PARTY_IMPORT_CONFIGS.employees.targetHref("emp_1", null)).toBeNull();
    });

    it("keeps the publisher on its own routes beside the four parties'", () => {
        expect(PUBLISHER_IMPORT_CONFIG.api(null).reportUrl("imp_1")).toBe("/publishers/imports/imp_1/report.csv");
        expect(PARTY_IMPORT_CONFIGS.employees.api(null).reportUrl("imp_1")).toBe("/party-imports/employees/imp_1/report.csv");
    });
});
