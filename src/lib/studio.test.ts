import { describe, expect, it, vi } from "vitest";

/**
 * PB-1: the Studio hand-off. The tokens ride in the fragment — never the
 * query — and a session with nothing stored hands over nothing.
 */

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, siteUrl: "https://adx.in" } };
});

import { studioFragment, studioPath, studioUrl } from "./studio";

describe("the Studio hand-off", () => {
    it("names the page or the app surface, and the index", () => {
        expect(studioPath({ kind: "page", key: "diwali-2026" })).toBe("/studio/pages/diwali-2026");
        expect(studioPath({ kind: "surface", surface: "APP_ADVERTISER_HOME" })).toBe("/studio/app/APP_ADVERTISER_HOME");
        expect(studioPath({ kind: "index" })).toBe("/studio");
    });

    it("carries both tokens in the fragment, encoded, and nothing when there is no session", () => {
        expect(studioFragment({ access: "a.b.c", refresh: "r&r" })).toBe("#token=a.b.c&refresh=r%26r");
        expect(studioFragment({ access: "a.b.c", refresh: null })).toBe("#token=a.b.c");
        expect(studioFragment({ access: null, refresh: null })).toBe("");
    });

    it("builds the full URL on the site's origin with no token in the query", () => {
        const url = studioUrl({ kind: "page", key: "help" }, { access: "acc", refresh: "ref" });
        expect(url).toBe("https://adx.in/studio/pages/help#token=acc&refresh=ref");
        expect(new URL(url).search).toBe("");
        expect(new URL(url).hash).toContain("token=acc");
    });
});
