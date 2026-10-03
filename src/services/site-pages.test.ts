import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PB-1: the pages desk's pure half — the key a title suggests, the address
 * rules applied before the server does, the order the desk lists rows in —
 * and the doors each action takes.
 */

const { calls } = vi.hoisted(() => ({ calls: [] as { method: string; path: string; body?: unknown }[] }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (method: string) => async (path: string, body?: unknown) => {
        calls.push({ method, path, body });
        return {};
    };
    return { ...actual, api: { ...actual.api, get: record("GET"), post: record("POST"), patch: record("PATCH"), put: record("PUT"), delete: record("DELETE") } };
});

import { keyProblem, pageKeyForSurface, pageKeyFrom, pageStateMeta, pathProblem, sitePagesService, sortPages, suggestedPath, type SitePageRow } from "./site-pages";

beforeEach(() => {
    calls.length = 0;
});

const row = (over: Partial<SitePageRow> = {}): SitePageRow => ({
    id: "pg_1",
    key: "diwali-2026",
    kind: "CUSTOM",
    title: "Diwali offers",
    path: "/diwali-offers",
    internalPath: null,
    surface: null,
    channels: ["WEBSITE"],
    addressLocked: false,
    archivedAt: null,
    live: null,
    draft: { number: 1, updatedAt: "2026-09-27T09:00:00.000Z" },
    updatedAt: "2026-09-27T09:00:00.000Z",
    redirectCount: 0,
    ...over,
});

describe("the key", () => {
    it("is suggested from the title and refused when taken or malformed", () => {
        expect(pageKeyFrom("Diwali Offers 2026!")).toBe("diwali-offers-2026");
        expect(keyProblem("diwali-2026")).toBeNull();
        expect(keyProblem("")).toMatch(/needs a key/);
        expect(keyProblem("Diwali")).toMatch(/Lowercase/);
        expect(keyProblem("home")).toMatch(/already a page/);
        expect(keyProblem("events", ["events"])).toMatch(/already a page/);
        expect(keyProblem("a".repeat(65))).toMatch(/At most 64/);
        expect(suggestedPath("diwali-2026")).toBe("/diwali-2026");
    });

    it("knows which system page a website surface belongs to", () => {
        expect(pageKeyForSurface("WEB_HELP")).toBe("help");
        expect(pageKeyForSurface("APP_ADVERTISER_HOME")).toBeNull();
    });
});

describe("the address", () => {
    it("holds a custom page to the server's shape", () => {
        expect(pathProblem("/diwali-offers")).toBeNull();
        expect(pathProblem("/events/diwali/2026")).toBeNull();
        expect(pathProblem("")).toMatch(/needs an address/);
        expect(pathProblem("diwali")).toMatch(/starts with/);
        expect(pathProblem("/diwali/")).toMatch(/trailing slash/);
        expect(pathProblem("/Diwali")).toMatch(/lowercase/);
        expect(pathProblem("/diwali.html")).toMatch(/dots/);
        expect(pathProblem("/a/b/c/d/e/f")).toMatch(/At most 5 segments/);
        expect(pathProblem("/api/x")).toMatch(/kept by the website/);
        expect(pathProblem("/studio")).toMatch(/kept by the website/);
        expect(pathProblem("/spaces/:id")).toMatch(/param/);
        expect(pathProblem(`/${"a".repeat(121)}`)).toMatch(/At most 120/);
    });

    it("keeps “/” for home and a param only where the page's own address has one", () => {
        expect(pathProblem("/", { key: "home", kind: "SYSTEM", internalPath: "/" })).toBeNull();
        expect(pathProblem("/", { key: "explore", kind: "SYSTEM", internalPath: "/spaces" })).toMatch(/home page/);
        expect(pathProblem("/spaces/:id", { key: "listing", kind: "SYSTEM", internalPath: "/spaces/:id" })).toBeNull();
        expect(pathProblem("/spots/:id", { key: "listing", kind: "SYSTEM", internalPath: "/spaces/:id" })).toBeNull();
        expect(pathProblem("/spots", { key: "listing", kind: "SYSTEM", internalPath: "/spaces/:id" })).toMatch(/carries 1 param/);
        expect(pathProblem("/:id/spots", { key: "listing", kind: "SYSTEM", internalPath: "/spaces/:id" })).toMatch(/belongs only where/);
    });
});

describe("the list", () => {
    it("puts the website's own pages first in their order, then Studio pages by title, archived last", () => {
        const rows = sortPages([
            row({ key: "zebra", title: "Zebra" }),
            row({ key: "help", kind: "SYSTEM", title: "Help", path: "/help", internalPath: "/help", surface: "WEB_HELP" }),
            row({ key: "old", title: "Old", archivedAt: "2026-09-01T00:00:00.000Z" }),
            row({ key: "home", kind: "SYSTEM", title: "Home", path: "/", internalPath: "/", surface: "WEB_HOME", addressLocked: true }),
            row({ key: "apple", title: "Apple" }),
        ]);
        expect(rows.map((item) => item.key)).toEqual(["home", "help", "apple", "zebra", "old"]);
    });

    it("says what state a row is in", () => {
        expect(pageStateMeta(row()).label).toBe("Not published");
        expect(pageStateMeta(row({ live: { number: 3, publishedAt: null } })).label).toBe("Live v3");
        expect(pageStateMeta(row({ kind: "SYSTEM" })).label).toBe("Default order");
        expect(pageStateMeta(row({ archivedAt: "2026-09-01T00:00:00.000Z" })).label).toBe("Archived");
    });
});

describe("the routes", () => {
    it("takes each action to its own door", async () => {
        await sitePagesService.list();
        await sitePagesService.create({ key: "diwali-2026", title: "Diwali offers", path: "/diwali-offers", template: "event" });
        await sitePagesService.fromContent("how-it-works");
        await sitePagesService.get("diwali-2026");
        await sitePagesService.update("diwali-2026", { path: "/diwali" });
        await sitePagesService.archive("diwali-2026");
        await sitePagesService.restorePage("diwali-2026");
        await sitePagesService.previewToken("diwali-2026");
        await sitePagesService.saveDraft("diwali-2026", [], { meta: { noindex: true }, changeNote: "seo" });
        await sitePagesService.discardDraft("diwali-2026");
        await sitePagesService.preview("diwali-2026", { side: "VISITOR", version: "draft" });
        await sitePagesService.publish("diwali-2026", "go");
        await sitePagesService.versions("diwali-2026");
        await sitePagesService.restoreVersion("diwali-2026", 2);
        await sitePagesService.redirects();
        await sitePagesService.createRedirect({ fromPath: "/old", toPath: "/new" });
        await sitePagesService.deleteRedirect("rd_1");
        expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
            "GET /site/pages",
            "POST /site/pages",
            "POST /site/pages/from-content/how-it-works",
            "GET /site/pages/diwali-2026",
            "PATCH /site/pages/diwali-2026",
            "POST /site/pages/diwali-2026/archive",
            "POST /site/pages/diwali-2026/restore-page",
            "POST /site/pages/diwali-2026/preview-token",
            "PUT /site/pages/diwali-2026/draft",
            "DELETE /site/pages/diwali-2026/draft",
            "GET /site/pages/diwali-2026/preview?side=VISITOR&version=draft",
            "POST /site/pages/diwali-2026/publish",
            "GET /site/pages/diwali-2026/versions",
            "POST /site/pages/diwali-2026/versions/2/restore",
            "GET /site/redirects",
            "POST /site/redirects",
            "DELETE /site/redirects/rd_1",
        ]);
        expect(calls[1]!.body).toEqual({ key: "diwali-2026", title: "Diwali offers", path: "/diwali-offers", template: "event" });
        expect(calls[8]!.body).toEqual({ blocks: [], meta: { noindex: true }, changeNote: "seo" });
        expect(calls[11]!.body).toEqual({ changeNote: "go" });
    });
});
