import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * LM-1: the media library's spec check (the one the browser runs before a
 * file leaves), the tag parser, the 409's "used in" reader, and the doors.
 */

const { calls } = vi.hoisted(() => ({ calls: [] as { method: string; path: string; body?: unknown }[] }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (method: string, answer: unknown = {}) => async (path: string, body?: unknown) => {
        calls.push({ method, path, body });
        return answer;
    };
    return { ...actual, api: { ...actual.api, get: record("GET", { items: [{ id: "m1" }] }), post: record("POST"), patch: record("PATCH") } };
});

import { mediaRows, mediaService, parseTags, specLine, specProblems, usageLine, usagesOf, type MediaSpec } from "./media";

const PROMO_WIDE: MediaSpec = {
    key: "PROMO_WIDE",
    label: "Wide promo",
    width: 1600,
    height: 480,
    minWidth: 1200,
    minHeight: 360,
    maxBytes: 800 * 1024,
    formats: ["image/jpeg", "image/png", "image/webp"],
};

beforeEach(() => {
    calls.length = 0;
});

describe("the spec check", () => {
    it("passes a file of the right shape, size, weight and format", () => {
        expect(specProblems(PROMO_WIDE, { width: 1600, height: 480, bytes: 300_000, mime: "image/jpeg" })).toEqual([]);
        // A larger image of the same shape, and one within the 1% ratio tolerance.
        expect(specProblems(PROMO_WIDE, { width: 3200, height: 960, bytes: 300_000, mime: "image/webp" })).toEqual([]);
        expect(specProblems(PROMO_WIDE, { width: 1600, height: 484, bytes: 300_000, mime: "image/png" })).toEqual([]);
    });

    it("names the wrong shape, a too-small image, too many bytes and a foreign format", () => {
        expect(specProblems(PROMO_WIDE, { width: 1600, height: 600, bytes: 1, mime: "image/jpeg" })[0]).toMatch(/shape of 1600 × 480/);
        expect(specProblems(PROMO_WIDE, { width: 800, height: 240, bytes: 1, mime: "image/jpeg" })[0]).toMatch(/at least 1200 × 360/);
        expect(specProblems(PROMO_WIDE, { width: 1600, height: 480, bytes: 2 * 1024 * 1024, mime: "image/jpeg" })[0]).toMatch(/2.0 MB/);
        expect(specProblems(PROMO_WIDE, { width: 1600, height: 480, bytes: 1, mime: "image/gif" })[0]).toMatch(/GIF/);
    });

    it("checks only weight and format when the browser could not read the size", () => {
        expect(specProblems(PROMO_WIDE, { width: null, height: null, bytes: 1, mime: "image/jpeg" })).toEqual([]);
    });

    it("prints a spec as its hint line", () => {
        expect(specLine(PROMO_WIDE)).toBe("1600 × 480 (at least 1200 × 360) · JPEG, PNG or WebP · up to 800 KB");
    });
});

describe("tags and usages", () => {
    it("cleans typed tags", () => {
        expect(parseTags("Festive, diwali ,  home page,festive")).toEqual(["festive", "diwali", "home-page"]);
        expect(parseTags("  ")).toEqual([]);
    });

    it("reads where a 409 says the image is used, in any of its shapes", () => {
        expect(usagesOf({ usedIn: [{ surface: "WEB_HOME", number: 4, blockId: "b1", blockType: "promo_banner" }] }).map(usageLine)).toEqual(["WEB_HOME v4 (promo_banner)"]);
        expect(usagesOf([{ label: "Website · Explore v2" }]).map(usageLine)).toEqual(["Website · Explore v2"]);
        expect(usagesOf(undefined)).toEqual([]);
    });

    it("reads the list whether it came bare or paged", () => {
        expect(mediaRows([{ id: "a" } as never])).toHaveLength(1);
        expect(mediaRows({ items: [{ id: "a" } as never, { id: "b" } as never] })).toHaveLength(2);
        expect(mediaRows(null)).toEqual([]);
    });
});

describe("the routes", () => {
    it("takes each action to its own door, the upload as multipart", async () => {
        const rows = await mediaService.list({ q: "diwali", spec: "PROMO_WIDE", archived: false, owner: "adx" });
        await mediaService.specs();
        const file = new File(["x"], "banner.jpg", { type: "image/jpeg" });
        await mediaService.upload({ file, spec: "PROMO_WIDE", altText: "Diwali sale", tags: ["festive", "home"] });
        await mediaService.update("m1", { altText: "New" });
        await mediaService.archive("m1");
        await mediaService.restore("m1");
        expect(rows).toEqual([{ id: "m1" }]);
        expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
            "GET /media?q=diwali&spec=PROMO_WIDE&archived=false&owner=adx",
            "GET /media/specs",
            "POST /media",
            "PATCH /media/m1",
            "POST /media/m1/archive",
            "POST /media/m1/restore",
        ]);
        const form = calls[2]!.body as FormData;
        expect(form.get("file")).toBeInstanceOf(File);
        expect(form.get("spec")).toBe("PROMO_WIDE");
        expect(form.get("altText")).toBe("Diwali sale");
        expect(form.get("tags")).toBe("festive,home");
    });
});
