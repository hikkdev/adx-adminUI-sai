import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * LM-1: the layout desk's pure half — reordering, the FieldSpec → form model
 * round trip and what it refuses, the block rules — and the doors it calls.
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

import {
    audienceLine,
    canAdd,
    issuesByBlock,
    blockRuleProblems,
    cleanBlock,
    defaultProps,
    duplicateBlock,
    formProblems,
    fromFormModel,
    keepPinnedLast,
    layoutsService,
    mediaOf,
    moveBlock,
    newBlock,
    nudgeBlock,
    resolvedExtra,
    sameBlocks,
    toFormModel,
    typeRuleProblems,
    typesForSurface,
    type BlockTypeDef,
    type FieldSpec,
    type LayoutBlock,
} from "./layouts";

beforeEach(() => {
    calls.length = 0;
});

const block = (id: string, type = "popular_rail", extra: Partial<LayoutBlock> = {}): LayoutBlock => ({ id, type, props: {}, ...extra });

describe("reordering", () => {
    it("moves an item from one index to another, clamped, without touching the original", () => {
        const list = ["a", "b", "c", "d"];
        expect(moveBlock(list, 0, 2)).toEqual(["b", "c", "a", "d"]);
        expect(moveBlock(list, 3, 0)).toEqual(["d", "a", "b", "c"]);
        expect(moveBlock(list, 1, 99)).toEqual(["a", "c", "d", "b"]);
        expect(moveBlock(list, 7, 0)).toEqual(list);
        expect(list).toEqual(["a", "b", "c", "d"]);
    });

    it("nudges one step by keyboard and never past the ends or a pinned block", () => {
        const list = [block("a"), block("b"), block("r", "results")];
        expect(nudgeBlock(list, "b", -1).map((b) => b.id)).toEqual(["b", "a", "r"]);
        expect(nudgeBlock(list, "a", -1).map((b) => b.id)).toEqual(["a", "b", "r"]);
        expect(nudgeBlock(list, "b", 1, ["results"]).map((b) => b.id)).toEqual(["a", "b", "r"]);
        expect(nudgeBlock(list, "r", -1, ["results"]).map((b) => b.id)).toEqual(["a", "b", "r"]);
        expect(nudgeBlock(list, "b", 1).map((b) => b.id)).toEqual(["a", "r", "b"]);
    });

    it("keeps pinned blocks last after a drag", () => {
        const list = [block("r", "results"), block("a"), block("b")];
        expect(keepPinnedLast(list, ["results"]).map((b) => b.id)).toEqual(["a", "b", "r"]);
    });

    it("duplicates a block under a new id right after it", () => {
        const list = [block("a", "promo_banner", { props: { headline: "Diwali" }, hidden: true }), block("b")];
        const next = duplicateBlock(list, "a", "a2");
        expect(next.map((b) => b.id)).toEqual(["a", "a2", "b"]);
        expect(next[1]).toMatchObject({ type: "promo_banner", props: { headline: "Diwali" }, hidden: true });
        // A deep copy: editing the copy leaves the original alone.
        (next[1]!.props as { headline: string }).headline = "Holi";
        expect((list[0]!.props as { headline: string }).headline).toBe("Diwali");
    });
});

describe("a new block", () => {
    it("starts with the required select's first option, a required number's minimum and an Explore target", () => {
        const specs: FieldSpec[] = [
            { key: "source", label: "Source", input: "select", required: true, options: [{ value: "RATING", label: "Top rated" }] },
            { key: "count", label: "How many", input: "number", required: true, min: 1, max: 12 },
            { key: "target", label: "Opens", input: "target", required: true },
            { key: "title", label: "Title", input: "text" },
        ];
        expect(defaultProps(specs)).toEqual({ source: "RATING", count: 1, target: { kind: "EXPLORE" } });
        expect(newBlock({ type: "listing_rail", props: specs }, "x")).toEqual({ id: "x", type: "listing_rail", props: { source: "RATING", count: 1, target: { kind: "EXPLORE" } } });
    });
});

describe("dirty and clean", () => {
    it("reads two lists as the same whatever their key order", () => {
        const a = [{ id: "a", type: "t", props: { x: 1, y: 2 } }];
        const b = [{ props: { y: 2, x: 1 }, type: "t", id: "a" }];
        expect(sameBlocks(a, b)).toBe(true);
        expect(sameBlocks(a, [{ id: "a", type: "t", props: { x: 1 } }])).toBe(false);
    });

    it("drops empty visibility and schedule and a false hidden", () => {
        expect(cleanBlock({ id: "a", type: "t", props: {}, visibility: { sides: [], cityIds: [] }, schedule: { startsAt: "" }, hidden: false })).toEqual({ id: "a", type: "t", props: {} });
        expect(cleanBlock({ id: "a", type: "t", props: {}, visibility: { sides: ["ADVERTISER"], stages: [] }, schedule: { endsAt: "2026-10-01T00:00:00.000Z" }, hidden: true })).toEqual({
            id: "a",
            type: "t",
            props: {},
            visibility: { sides: ["ADVERTISER"] },
            schedule: { endsAt: "2026-10-01T00:00:00.000Z" },
            hidden: true,
        });
    });

    it("says who and when in a line, or nothing for everyone always", () => {
        expect(audienceLine(block("a"))).toBeNull();
        expect(audienceLine(block("a", "t", { visibility: { sides: ["ADVERTISER"], cityIds: ["c1", "c2"] } }))).toBe("Advertiser · 2 cities");
        expect(audienceLine(block("a", "t", { schedule: { startsAt: "2026-10-01T00:00:00.000Z" } }))).toMatch(/^from /);
    });

    it("refuses a schedule that ends before it starts", () => {
        expect(blockRuleProblems(block("a", "t", { schedule: { startsAt: "2026-10-02T00:00:00.000Z", endsAt: "2026-10-01T00:00:00.000Z" } }))).toEqual(["The block would stop before it starts."]);
        expect(blockRuleProblems(block("a", "t", { schedule: { startsAt: "2026-10-01T00:00:00.000Z", endsAt: "2026-10-02T00:00:00.000Z" } }))).toEqual([]);
    });
});

describe("FieldSpec → form model and back", () => {
    const specs: FieldSpec[] = [
        { key: "headline", label: "Headline", input: "text", max: 10 },
        { key: "body", label: "Body", input: "markdown" },
        { key: "mediaId", label: "Image", input: "media", required: true, spec: "PROMO_WIDE" },
        { key: "target", label: "Opens", input: "target", required: true },
        { key: "aspect", label: "Shape", input: "select", options: [{ value: "WIDE", label: "Wide" }] },
        { key: "count", label: "How many", input: "number", min: 1, max: 12 },
        { key: "listingIds", label: "Listings", input: "listingIds", max: 2 },
        { key: "weird", label: "Something new", input: "colourWheel" },
    ];

    it("reads props into a model a form can edit", () => {
        const model = toFormModel(specs, { headline: "Diwali", mediaId: "m1", target: { kind: "LISTING", value: "l1" }, count: 4, listingIds: ["l1"], weird: { r: 1 } });
        expect(model).toEqual({
            headline: "Diwali",
            body: "",
            mediaId: "m1",
            target: { kind: "LISTING", value: "l1" },
            aspect: "",
            count: "4",
            listingIds: ["l1"],
            weird: JSON.stringify({ r: 1 }, null, 2),
        });
    });

    it("writes the model back, leaving empties out, numbers as numbers, keeping props it did not edit", () => {
        const model = toFormModel(specs, {});
        model.headline = "  Diwali  ";
        model.mediaId = "m1";
        model.target = { kind: "NEW_CAMPAIGN", value: "ignored" };
        model.count = "6";
        model.weird = '{"r":2}';
        expect(fromFormModel(specs, model, { legacy: true, headline: "old" })).toEqual({
            legacy: true,
            headline: "Diwali",
            mediaId: "m1",
            target: { kind: "NEW_CAMPAIGN" },
            count: 6,
            weird: { r: 2 },
        });
    });

    it("names what is missing, out of bounds or unparseable", () => {
        const model = toFormModel(specs, {});
        model.headline = "far too long a headline";
        model.target = { kind: "LISTING", value: "" };
        model.count = "20";
        model.listingIds = ["a", "b", "c"];
        model.weird = "{not json";
        expect(formProblems(specs, model)).toEqual({
            headline: "At most 10 characters.",
            mediaId: "Required.",
            target: "Name the a listing.",
            count: "At most 12.",
            listingIds: "At most 2.",
            weird: "Not valid JSON.",
        });
    });

    it("handles a repeated group, item by item", () => {
        const tiles: FieldSpec[] = [
            {
                key: "tiles",
                label: "Tiles",
                input: "list",
                required: true,
                min: 1,
                max: 12,
                of: [
                    { key: "mediaId", label: "Image", input: "media", required: true },
                    { key: "label", label: "Label", input: "text", required: true },
                ],
            },
        ];
        const model = toFormModel(tiles, { tiles: [{ mediaId: "m1", label: "Malls" }, { mediaId: "m2" }] });
        expect(model.tiles).toEqual([
            { mediaId: "m1", label: "Malls" },
            { mediaId: "m2", label: "" },
        ]);
        expect(formProblems(tiles, model)).toEqual({ "tiles.1.label": "Required." });
        expect(fromFormModel(tiles, model)).toEqual({ tiles: [{ mediaId: "m1", label: "Malls" }, { mediaId: "m2" }] });
        expect(formProblems(tiles, { tiles: [] })).toEqual({ tiles: "Add at least one." });
    });
});

describe("PB-1: a call to action, a form key and a page target", () => {
    const specs: FieldSpec[] = [
        { key: "primaryCta", label: "Button", input: "cta", max: 40 },
        { key: "formKey", label: "Form", input: "formKey", required: true },
        { key: "target", label: "Opens", input: "target" },
    ];

    it("reads and writes a cta as its label and target, dropping an empty one", () => {
        const model = toFormModel(specs, { primaryCta: { label: "Book now", target: { kind: "PAGE", value: "diwali-2026" } }, formKey: "event-signup" });
        expect(model).toEqual({ primaryCta: { label: "Book now", target: { kind: "PAGE", value: "diwali-2026" } }, formKey: "event-signup", target: { kind: "", value: "" } });
        expect(fromFormModel(specs, model)).toEqual({ primaryCta: { label: "Book now", target: { kind: "PAGE", value: "diwali-2026" } }, formKey: "event-signup" });
        expect(fromFormModel(specs, { ...model, primaryCta: { label: "  ", target: { kind: "", value: "" } } })).toEqual({ formKey: "event-signup" });
        expect(fromFormModel(specs, { ...model, primaryCta: { label: "Explore", target: { kind: "EXPLORE", value: "" } } }).primaryCta).toEqual({ label: "Explore", target: { kind: "EXPLORE" } });
    });

    it("wants a label with a target, a target with a label, and a page for a PAGE target", () => {
        expect(formProblems(specs, { primaryCta: { label: "Book", target: { kind: "", value: "" } }, formKey: "x" })).toEqual({ primaryCta: "Say where the button opens." });
        expect(formProblems(specs, { primaryCta: { label: "", target: { kind: "EXPLORE", value: "" } }, formKey: "x" })).toEqual({ primaryCta: "Give the button a label." });
        expect(formProblems(specs, { primaryCta: { label: "Book", target: { kind: "PAGE", value: "" } }, formKey: "x" })).toEqual({ primaryCta: "Name the a page." });
        expect(formProblems(specs, { primaryCta: { label: "x".repeat(41), target: { kind: "EXPLORE", value: "" } }, formKey: "x" })).toEqual({ primaryCta: "At most 40 characters." });
        expect(formProblems(specs, { primaryCta: { label: "", target: { kind: "", value: "" } }, formKey: "" })).toEqual({ formKey: "Required." });
        expect(formProblems(specs, { primaryCta: { label: "", target: { kind: "", value: "" } }, formKey: "x", target: { kind: "PAGE", value: "help" } })).toEqual({});
    });
});

describe("rules the specs cannot say", () => {
    it("wants rich text OR a content page, and a curated rail's listings", () => {
        expect(typeRuleProblems("rich_text", {})).toHaveLength(1);
        expect(typeRuleProblems("rich_text", { markdown: "# Hi", contentSlug: "faq" })).toHaveLength(1);
        expect(typeRuleProblems("rich_text", { contentSlug: "faq" })).toEqual([]);
        expect(typeRuleProblems("listing_rail", { source: "CURATED" })).toEqual(["A curated rail needs its listings."]);
        expect(typeRuleProblems("listing_rail", { source: "CATEGORY" })).toHaveLength(1);
        expect(typeRuleProblems("listing_rail", { source: "RATING" })).toEqual([]);
    });
});

describe("the vocabulary and the resolution", () => {
    it("offers only the types a surface may hold, system blocks first", () => {
        const types: BlockTypeDef[] = [
            { type: "promo_banner", label: "Promo banner", kind: "CONTENT", surfaces: ["WEB_EXPLORE", "APP_ADVERTISER_HOME"], props: [] },
            { type: "results", label: "Results", kind: "SYSTEM", surfaces: ["WEB_EXPLORE"], props: [] },
            { type: "greeting", label: "Greeting", kind: "SYSTEM", surfaces: ["APP_ADVERTISER_HOME"], props: [] },
        ];
        expect(typesForSurface(types, "WEB_EXPLORE").map((def) => def.type)).toEqual(["results", "promo_banner"]);
    });

    it("reads resolved media and extras wherever the resolution put them", () => {
        expect(mediaOf({ mediaId: "m1", media: { url: "https://x/y.jpg", width: 1600, height: 480, altText: "Diwali" } })).toEqual({ url: "https://x/y.jpg", width: 1600, height: 480, altText: "Diwali" });
        expect(mediaOf({ mediaId: "m1" })).toBeNull();
        expect(resolvedExtra({ id: "a", type: "ad_slot", props: {}, ads: [] }, "ads")).toEqual([]);
        expect(resolvedExtra({ id: "a", type: "ad_slot", props: { ads: [1] } }, "ads")).toEqual([1]);
    });
});

describe("the add menu and the server's refusals", () => {
    it("offers a system block once per surface, content blocks as often as wanted", () => {
        const blocks = [block("a", "greeting")];
        expect(canAdd({ type: "greeting", kind: "SYSTEM" }, blocks)).toBe(false);
        expect(canAdd({ type: "popular_rail", kind: "SYSTEM" }, blocks)).toBe(true);
        expect(canAdd({ type: "promo_banner", kind: "CONTENT" }, [block("b", "promo_banner")])).toBe(true);
    });

    it("files a 400's issues under the block they name", () => {
        const map = issuesByBlock({
            issues: [
                { index: 0, blockId: "a", type: "promo_banner", path: "props.mediaId", message: "has no alt text" },
                { index: 1, blockId: null, type: null, path: "(block)", message: "bad block" },
                { index: -1, blockId: null, type: null, path: "blocks", message: "At most 40 blocks" },
            ],
        });
        expect(map.get("a")?.[0]?.message).toBe("has no alt text");
        expect(map.get("#1")?.[0]?.message).toBe("bad block");
        expect(map.get("")?.[0]?.message).toBe("At most 40 blocks");
        expect(issuesByBlock(undefined).size).toBe(0);
    });
});

describe("the routes", () => {
    it("takes each action to its own door", async () => {
        await layoutsService.list();
        await layoutsService.blockTypes();
        await layoutsService.get("WEB_EXPLORE");
        await layoutsService.saveDraft("WEB_EXPLORE", [block("a")], "Diwali banner");
        await layoutsService.discardDraft("WEB_EXPLORE");
        await layoutsService.preview("WEB_EXPLORE", { side: "ADVERTISER", cityId: "c1", version: "draft" });
        await layoutsService.publish("WEB_EXPLORE", "Diwali");
        await layoutsService.versions("WEB_EXPLORE");
        await layoutsService.restore("WEB_EXPLORE", 3);
        expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
            "GET /layouts",
            "GET /layouts/block-types",
            "GET /layouts/WEB_EXPLORE",
            "PUT /layouts/WEB_EXPLORE/draft",
            "DELETE /layouts/WEB_EXPLORE/draft",
            "GET /layouts/WEB_EXPLORE/preview?side=ADVERTISER&cityId=c1&version=draft",
            "POST /layouts/WEB_EXPLORE/publish",
            "GET /layouts/WEB_EXPLORE/versions",
            "POST /layouts/WEB_EXPLORE/versions/3/restore",
        ]);
        expect(calls[3]!.body).toEqual({ blocks: [block("a")], changeNote: "Diwali banner" });
        expect(calls[6]!.body).toEqual({ changeNote: "Diwali" });
    });
});
