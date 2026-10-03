import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CT-1: the content desk's reads and the rules it draws with — the slug it
 * suggests and the ones it refuses, how versions gather into one page, and
 * the routes each action takes.
 */

const { calls } = vi.hoisted(() => ({ calls: [] as { method: string; path: string; body?: unknown }[] }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (method: string) => async (path: string, body?: unknown) => {
        calls.push({ method, path, body });
        return {};
    };
    return { ...actual, api: { ...actual.api, get: record("GET"), post: record("POST"), patch: record("PATCH"), delete: record("DELETE") } };
});

import { contentService, groupPages, nextVersion, slugProblem, slugify, type ContentPage } from "./content";

const page = (over: Partial<ContentPage> = {}): ContentPage => ({
    id: "cnt_1",
    slug: "how-it-works",
    version: 1,
    category: "PAGE",
    title: "How it works",
    summary: "Three steps",
    body: "# How it works",
    surfaces: ["WEBSITE"],
    tags: [],
    seoTitle: null,
    seoDescription: null,
    sortOrder: 0,
    isActive: false,
    publishedAt: null,
    retiredAt: null,
    createdByUserId: "usr_1",
    changeNote: null,
    createdAt: "2026-09-24T09:00:00.000Z",
    updatedAt: "2026-09-24T09:00:00.000Z",
    state: "DRAFT",
    ...over,
});

beforeEach(() => {
    calls.length = 0;
});

describe("the slug", () => {
    it("is suggested from the title and held to one shape", () => {
        expect(slugify("How It Works!")).toBe("how-it-works");
        expect(slugify("Anita’s guide  to   walls")).toBe("anitas-guide-to-walls");
        expect(slugProblem("how-it-works")).toBeNull();
        expect(slugProblem("")).toMatch(/needs an address/);
        expect(slugProblem("How-It-Works")).toMatch(/Lowercase/);
        expect(slugProblem("pages")).toMatch(/reserved/);
    });
});

describe("versions gathered into pages", () => {
    it("names the live version, the newest, and what the next one will be", () => {
        const groups = groupPages([
            page({ id: "a1", version: 1, isActive: false, publishedAt: "2026-09-20T00:00:00.000Z", retiredAt: "2026-09-22T00:00:00.000Z", state: "RETIRED" }),
            page({ id: "a2", version: 2, isActive: true, publishedAt: "2026-09-22T00:00:00.000Z", state: "PUBLISHED", title: "How ADX works" }),
            page({ id: "a3", version: 3, state: "DRAFT", title: "How ADX works (rewrite)" }),
            page({ id: "b1", slug: "for-publishers", title: "For publishers", category: "PAGE", state: "DRAFT" }),
        ]);
        expect(groups.map((group) => group.slug)).toEqual(["for-publishers", "how-it-works"]);
        const works = groups.find((group) => group.slug === "how-it-works")!;
        // The title shown is the live one's, not the unpublished rewrite's.
        expect(works.title).toBe("How ADX works");
        expect(works.live?.version).toBe(2);
        expect(works.versions.map((version) => version.version)).toEqual([3, 2, 1]);
        expect(nextVersion(works.versions)).toBe(4);
        expect(works.takenDown).toBe(false);

        const fresh = groups.find((group) => group.slug === "for-publishers")!;
        expect(fresh.live).toBeNull();
        expect(fresh.takenDown).toBe(false);
        expect(nextVersion(fresh.versions)).toBe(2);
    });

    it("says a page is taken down only when it was once live and is not now", () => {
        const [group] = groupPages([page({ isActive: false, publishedAt: "2026-09-20T00:00:00.000Z", retiredAt: "2026-09-23T00:00:00.000Z", state: "RETIRED" })]);
        expect(group!.takenDown).toBe(true);
    });
});

describe("the routes", () => {
    it("takes each action to its own door", async () => {
        await contentService.list();
        await contentService.list("how-it-works");
        await contentService.create({ slug: "how-it-works", category: "PAGE", title: "How it works", body: "x", surfaces: ["WEBSITE"] });
        await contentService.update("cnt_1", { title: "How ADX works" });
        await contentService.publish("cnt_1");
        await contentService.unpublish("cnt_1");
        await contentService.discard("cnt_2");
        expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
            "GET /content/pages",
            "GET /content/pages?slug=how-it-works",
            "POST /content/pages",
            "PATCH /content/pages/cnt_1",
            "POST /content/pages/cnt_1/publish",
            "POST /content/pages/cnt_1/unpublish",
            "DELETE /content/pages/cnt_2",
        ]);
        expect(calls[2]!.body).toMatchObject({ slug: "how-it-works", surfaces: ["WEBSITE"] });
    });
});
