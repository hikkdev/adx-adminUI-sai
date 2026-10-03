import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ST-4: the Storage page's arithmetic and doors — the byte sizes, the
 * public/private split, the unreferenced totals, the sweep's lines, the
 * "Removable on" cell (never for a purpose with its own retention), the
 * paged query, and the three routes.
 */

const { calls } = vi.hoisted(() => ({ calls: [] as { method: string; path: string; body?: unknown }[] }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (method: string) => async (path: string, body?: unknown) => {
        calls.push({ method, path, body });
        return {};
    };
    return { ...actual, api: { ...actual.api, get: record("GET"), post: record("POST") } };
});

import {
    formatStorageBytes,
    listableUnreferenced,
    purposeLabel,
    purposeRowKey,
    purposesBySize,
    removableLine,
    storageService,
    sweepLine,
    sweepFailureLine,
    sweepRunLine,
    unreferencedSearch,
    unreferencedTotals,
    visibilityTotals,
    type StoragePurposeRow,
    type StorageSweepState,
} from "./storage";

const row = (purpose: string, visibility: "PUBLIC" | "PRIVATE", files: number, bytes: number, unreferencedFiles = 0, unreferencedBytes = 0): StoragePurposeRow => ({
    purpose,
    folder: purpose.toLowerCase(),
    visibility,
    files,
    bytes,
    unreferencedFiles,
    unreferencedBytes,
});

const ROWS = [row("LISTING_PHOTO", "PUBLIC", 120, 480_000_000, 6, 12_000_000), row("KYC", "PRIVATE", 40, 90_000_000, 2, 1_000_000), row("BRANDING", "PUBLIC", 4, 200_000), row("VERIFICATION", "PRIVATE", 30, 60_000_000, 3, 4_500_000)];

const SWEEP: StorageSweepState = { lastRunAt: null, lastMarked: null, lastRemoved: null, removeEnabled: false, graceDays: 30, protectedPurposes: ["KYC", "INVOICE"] };

beforeEach(() => {
    calls.length = 0;
});

describe("sizes and names", () => {
    it("prints a size in the unit that reads", () => {
        expect(formatStorageBytes(0)).toBe("0 B");
        expect(formatStorageBytes(812)).toBe("812 B");
        expect(formatStorageBytes(14 * 1024)).toBe("14 KB");
        expect(formatStorageBytes(3.4 * 1024 * 1024)).toBe("3.4 MB");
        expect(formatStorageBytes(1.25 * 1024 * 1024 * 1024)).toBe("1.25 GB");
        expect(formatStorageBytes(Number.NaN)).toBe("0 B");
    });

    it("names a known purpose, and one it has not met in plain words", () => {
        expect(purposeLabel("VERIFICATION")).toBe("Venue papers & site photos");
        expect(purposeLabel("SOME_NEW_THING")).toBe("Some new thing");
    });
});

describe("the totals", () => {
    it("splits the register at the public/private line and sums what the sweep marked", () => {
        expect(visibilityTotals(ROWS, "PUBLIC")).toEqual({ files: 124, bytes: 480_200_000 });
        expect(visibilityTotals(ROWS, "PRIVATE")).toEqual({ files: 70, bytes: 150_000_000 });
        expect(unreferencedTotals(ROWS)).toEqual({ files: 11, bytes: 17_500_000 });
    });

    it("lists the heaviest folder first", () => {
        expect(purposesBySize(ROWS).map((item) => item.purpose)).toEqual(["LISTING_PHOTO", "KYC", "VERIFICATION", "BRANDING"]);
    });

    it("keys a folder by purpose and visibility — a half-done move has both — and offers the list only what the sweep may remove", () => {
        const halfMoved = [...ROWS, row("VERIFICATION", "PUBLIC", 5, 9_000_000, 1, 2_000_000)];
        expect(new Set(halfMoved.map(purposeRowKey)).size).toBe(halfMoved.length);
        expect(listableUnreferenced(halfMoved, SWEEP.protectedPurposes)).toEqual([
            { purpose: "LISTING_PHOTO", files: 6, bytes: 12_000_000 },
            { purpose: "VERIFICATION", files: 4, bytes: 6_500_000 },
        ]);
    });
});

describe("the sweep's lines", () => {
    it("says when the sweep has not run, and what the last run did when it has", () => {
        expect(sweepLine(SWEEP)).toBe("The sweep has not run yet.");
        const ran = sweepLine({ ...SWEEP, lastRunAt: "2026-09-27T21:30:00.000Z", lastMarked: 12, lastRemoved: 0 });
        expect(ran).toMatch(/^Last checked /);
        expect(ran).toMatch(/12 files marked · none removed$/);
        expect(sweepLine({ ...SWEEP, lastRunAt: "2026-09-27T21:30:00.000Z", lastMarked: 1, lastRemoved: 3 })).toMatch(/1 file marked · 3 removed$/);
        expect(sweepRunLine({ checked: 1_204, marked: 5, cleared: 1 })).toBe("1,204 files checked · 5 newly unreferenced · 1 referred to again");
    });

    it("gives a date to a file the sweep may remove, and never to one with its own retention", () => {
        expect(removableLine({ purpose: "LISTING_PHOTO", removableAt: "2026-10-27T12:00:00.000Z" }, SWEEP.protectedPurposes)).toMatch(/^Removable on 27 Oct 2026$/);
        expect(removableLine({ purpose: "KYC", removableAt: "2026-10-27T12:00:00.000Z" }, SWEEP.protectedPurposes)).toBe("Never — kept by its own retention rule");
        expect(removableLine({ purpose: "LISTING_PHOTO", removableAt: null }, SWEEP.protectedPurposes)).toBe("Never — kept by its own retention rule");
    });
});

describe("the routes", () => {
    it("pages the unreferenced list, by purpose when one is picked", () => {
        expect(unreferencedSearch()).toBe("?page=1&pageSize=25");
        expect(unreferencedSearch({ purpose: "LISTING_PHOTO", page: 3, pageSize: 10 })).toBe("?purpose=LISTING_PHOTO&page=3&pageSize=10");
        expect(unreferencedSearch({ purpose: null, page: 2 })).toBe("?page=2&pageSize=25");
    });

    it("takes each read and the check to its own door", async () => {
        await storageService.summary();
        await storageService.unreferenced({ purpose: "BRANDING", page: 2 });
        await storageService.sweep();
        expect(calls).toEqual([
            { method: "GET", path: "/storage/summary", body: undefined },
            { method: "GET", path: "/storage/unreferenced?purpose=BRANDING&page=2&pageSize=25", body: undefined },
            { method: "POST", path: "/storage/sweep", body: {} },
        ]);
    });
});

describe("sweepFailureLine", () => {
    it("names a failure newer than the last good run, and nothing otherwise", () => {
        expect(sweepFailureLine({ lastRunAt: null, lastFailedAt: null, lastError: null })).toBeNull();
        expect(sweepFailureLine({ lastRunAt: "2026-09-28T10:00:00.000Z", lastFailedAt: "2026-09-28T09:00:00.000Z", lastError: "Redis down" })).toBeNull();
        expect(sweepFailureLine({ lastRunAt: "2026-09-21T10:00:00.000Z", lastFailedAt: "2026-09-28T09:00:00.000Z", lastError: "Redis down" })).toMatch(/^The last sweep failed on .+: Redis down$/);
    });
});
