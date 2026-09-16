import { describe, expect, it, vi } from "vitest";

/**
 * Lot D (Q56/Q93): the sheet in, the report out, and the three writes the
 * desk gained.
 *
 * The parser is pinned because a row the schema refuses fails the whole
 * batch — so the console has to read the sheet the way the server will
 * before a byte goes up: headers folded, empty cells left off rather than
 * sent as "", the two enums checked, coordinates as numbers.
 */

const { calls } = vi.hoisted(() => ({ calls: [] as { method: string; path: string; body?: unknown }[] }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (method: string) => async (path: string, body?: unknown) => {
        calls.push({ method, path, body });
        return { pill: { label: "New", tone: "new" }, activity: [] };
    };
    return { ...actual, api: { get: record("GET"), post: record("POST"), patch: record("PATCH"), put: record("PUT"), delete: record("DELETE") } };
});

import { leadsService, parseLeadCsv, splitCsv } from "./leads";

describe("reading a sheet", () => {
    it("splits quoted fields, doubled quotes and either line ending, dropping blank lines", () => {
        expect(splitCsv('a,"b, c","say ""hi"""\r\n\n1,2,3\n')).toEqual([
            ["a", "b, c", 'say "hi"'],
            ["1", "2", "3"],
        ]);
    });

    it("folds the header onto the schema's keys and leaves empty cells off the row", () => {
        const parsed = parseLeadCsv(
            ["Side,Business name,Phone,City,lat,lng,Notes", "publisher,Sharma Stationers,9876543210,Bengaluru,12.93,77.62,ignored", "ADVERTISER,Cafe Blue,,,,,"].join("\n")
        );
        expect(parsed.ignored).toEqual(["notes"]);
        expect(parsed.problems).toEqual([]);
        expect(parsed.rows).toEqual([
            { side: "PUBLISHER", businessName: "Sharma Stationers", phone: "9876543210", city: "Bengaluru", latitude: 12.93, longitude: 77.62 },
            { side: "ADVERTISER", businessName: "Cafe Blue" },
        ]);
    });

    it("names the rows the API would refuse, by their sheet number", () => {
        const parsed = parseLeadCsv(["side,businessName,latitude", "PUBLISHER,,", "SHOP,Cafe Blue,north", "ADVERTISER,Fine,"].join("\n"));
        expect(parsed.problems).toEqual([
            { row: 1, message: "No business name" },
            { row: 2, message: '"north" is not a latitude' },
            { row: 2, message: 'Side must be PUBLISHER or ADVERTISER, not "SHOP"' },
        ]);
        expect(parsed.rows).toHaveLength(3);
    });

    it("answers empty for an empty sheet rather than a header-only row", () => {
        expect(parseLeadCsv("  \n")).toEqual({ rows: [], problems: [], ignored: [] });
    });
});

describe("the writes the desk gained", () => {
    it("creates, imports (dry run then commit) and converts on the leads routes", async () => {
        calls.length = 0;
        await leadsService.create({ side: "PUBLISHER", businessName: "Sharma Stationers", phone: "9876543210" });
        const rows = [{ side: "PUBLISHER" as const, businessName: "Sharma Stationers" }];
        await leadsService.import("Walk sheet", rows, true);
        await leadsService.import("Walk sheet", rows, false);
        await leadsService.convert("led_1", { publisherId: "pub_1" });
        await leadsService.convert("led_1", {});
        await leadsService.get("led_1");
        expect(calls).toEqual([
            { method: "POST", path: "/leads", body: { side: "PUBLISHER", businessName: "Sharma Stationers", phone: "9876543210" } },
            { method: "POST", path: "/leads/import", body: { source: "Walk sheet", rows, dryRun: true } },
            { method: "POST", path: "/leads/import", body: { source: "Walk sheet", rows, dryRun: false } },
            { method: "POST", path: "/leads/led_1/convert", body: { publisherId: "pub_1" } },
            { method: "POST", path: "/leads/led_1/convert", body: {} },
            { method: "GET", path: "/leads/led_1", body: undefined },
        ]);
    });
});
