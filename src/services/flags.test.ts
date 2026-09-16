import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    answerFor,
    bulkNoteError,
    changeSummary,
    coverageOf,
    flagPatch,
    flagStateOf,
    flagsPath,
    flagsService,
    isDarkLaunch,
    parseRollout,
    parseRolloutDraft,
    rolloutLabel,
    rolloutRulesLabel,
    manifestChecksOf,
    rolloutToDraft,
    sharedVariantsOf,
    type FeatureFlag,
    type RegistryEntry,
} from "./flags";

/* L-C: the two bulk calls and the paged read go on the wire; everything else here is pure. */
const backend = vi.hoisted(() => ({
    calls: [] as { method: string; path: string; body?: unknown }[],
    answer: undefined as unknown,
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        return backend.answer;
    };
    return {
        ...actual,
        api: {
            get: (path: string) => wrap("GET", path),
            post: (path: string, body?: unknown) => wrap("POST", path, body),
            patch: (path: string, body?: unknown) => wrap("PATCH", path, body),
            put: (path: string, body?: unknown) => wrap("PUT", path, body),
            delete: (path: string) => wrap("DELETE", path),
        },
    };
});

/**
 * The feature registry's switches (CG5).
 *
 * What the editor must get right is the patch: `PATCH /flags/:key` is a
 * patch, not a replacement, and a body naming none of the four is a 400.
 * Flipping the kill switch must not re-send a rollout somebody else is
 * widening, a variant off the row's list is refused before the server
 * does, and the rule lists are validated the way `rolloutSchema` validates
 * them. The Coverage card's arithmetic is pinned below that.
 */

const row = (over: Partial<FeatureFlag> = {}): FeatureFlag => ({
    key: "marketplace.instant-booking",
    enabled: true,
    rolloutPercent: 100,
    description: null,
    updatedById: null,
    surfaces: ["APP_USER", "APP_AGENT", "BACKEND"],
    kind: "FEATURE",
    source: "REGISTERED",
    owner: "marketplace",
    variant: null,
    variants: [],
    rollout: null,
    lastGoodState: null,
    registeredAt: "2026-09-13T00:00:00.000Z",
    aliases: ["instant-booking"],
    createdAt: "2026-09-13T00:00:00.000Z",
    updatedAt: "2026-09-13T00:00:00.000Z",
    lastChange: null,
    ...over,
});

describe("flagPatch", () => {
    const current = { enabled: true, rolloutPercent: 25, variant: null, variants: ["control", "treatment"], rollout: null };

    it("sends only the switch when only the switch moved", () => {
        expect(flagPatch(current, { enabled: false, rolloutPercent: 25, note: "" })).toEqual({ enabled: false });
    });

    it("sends only the rollout when only the rollout moved", () => {
        expect(flagPatch(current, { enabled: true, rolloutPercent: 40, note: "" })).toEqual({ rolloutPercent: 40 });
    });

    it("is null when nothing moved — the server would answer 400", () => {
        expect(flagPatch(current, { enabled: true, rolloutPercent: 25, note: "just a note" })).toBeNull();
        expect(flagPatch(current, { enabled: true, rolloutPercent: 25, variant: null, rollout: null, note: "" })).toBeNull();
    });

    it("sends the variant when it moved, and refuses one the row does not declare", () => {
        expect(flagPatch(current, { enabled: true, rolloutPercent: 25, variant: "treatment", note: "" })).toEqual({ variant: "treatment" });
        expect(flagPatch({ ...current, variant: "treatment" }, { enabled: true, rolloutPercent: 25, variant: null, note: "" })).toEqual({ variant: null });
        expect(flagPatch(current, { enabled: true, rolloutPercent: 25, variant: "placebo", note: "" })).toBeNull();
    });

    it("sends the rules when they moved, order and empty lists aside", () => {
        const withRules = { ...current, rollout: { roles: ["ADMIN", "AGENT"], cities: [] } };
        expect(flagPatch(withRules, { enabled: true, rolloutPercent: 25, rollout: { roles: ["AGENT", "ADMIN"] }, note: "" })).toBeNull();
        expect(flagPatch(withRules, { enabled: true, rolloutPercent: 25, rollout: null, note: "" })).toEqual({ rollout: null });
        expect(flagPatch(current, { enabled: true, rolloutPercent: 25, rollout: { userIds: ["u1"] }, note: "" })).toEqual({ rollout: { userIds: ["u1"] } });
    });

    it("carries a trimmed note only beside a real move", () => {
        expect(flagPatch(current, { enabled: false, rolloutPercent: 25, note: "  kill switch  " })).toEqual({
            enabled: false,
            note: "kill switch",
        });
        expect(flagPatch(current, { enabled: false, rolloutPercent: 25, note: "   " })).toEqual({ enabled: false });
    });

    it("caps the note at the schema's length", () => {
        const patch = flagPatch(current, { enabled: false, rolloutPercent: 25, note: "x".repeat(600) });
        expect(patch?.note).toHaveLength(500);
    });
});

describe("parseRollout", () => {
    it("takes a whole number from 0 to 100 and nothing else", () => {
        expect(parseRollout("0")).toBe(0);
        expect(parseRollout(" 100 ")).toBe(100);
        expect(parseRollout("101")).toBeNull();
        expect(parseRollout("12.5")).toBeNull();
        expect(parseRollout("")).toBeNull();
        expect(parseRollout("-1")).toBeNull();
    });
});

describe("parseRolloutDraft — the rollout editor's validation", () => {
    it("is null with no rules, not an object of empty lists", () => {
        expect(parseRolloutDraft({ roles: "", cities: "  ", userIds: "\n" })).toEqual({ rollout: null, errors: {} });
    });

    it("splits on commas and newlines, trims, de-duplicates and upper-cases roles", () => {
        expect(parseRolloutDraft({ roles: "admin, Agent\nADMIN", cities: "Bengaluru\nPune, Bengaluru", userIds: "u1,u2\nu1" })).toEqual({
            rollout: { roles: ["ADMIN", "AGENT"], cities: ["Bengaluru", "Pune"], userIds: ["u1", "u2"] },
            errors: {},
        });
    });

    it("names the line that is not a role", () => {
        const result = parseRolloutDraft({ roles: "ADMIN, agent-publisher", cities: "", userIds: "" });
        expect(result.rollout).toBeNull();
        expect(result.errors.roles).toContain("AGENT-PUBLISHER");
    });

    it("refuses a city over 80 characters and a user id over 64", () => {
        expect(parseRolloutDraft({ roles: "", cities: "x".repeat(81), userIds: "" }).errors.cities).toMatch(/80/);
        expect(parseRolloutDraft({ roles: "", cities: "", userIds: "y".repeat(65) }).errors.userIds).toMatch(/64/);
    });

    it("holds each list to the schema's ceiling", () => {
        const roles = Array.from({ length: 21 }, (_, index) => `ROLE_${String.fromCharCode(65 + index)}`).join(",");
        expect(parseRolloutDraft({ roles, cities: "", userIds: "" }).errors.roles).toMatch(/20/);
        const userIds = Array.from({ length: 501 }, (_, index) => `u${index}`).join("\n");
        expect(parseRolloutDraft({ roles: "", cities: "", userIds }).errors.userIds).toMatch(/500/);
    });

    it("leaves the other axes' errors standing beside a bad one", () => {
        const result = parseRolloutDraft({ roles: "1ADMIN", cities: "", userIds: "z".repeat(70) });
        expect(Object.keys(result.errors).sort()).toEqual(["roles", "userIds"]);
    });

    it("round-trips what the row holds", () => {
        const rollout = { roles: ["ADMIN"], cities: ["Pune"], userIds: ["u1", "u2"] };
        expect(parseRolloutDraft(rolloutToDraft(rollout)).rollout).toEqual(rollout);
        expect(rolloutToDraft(null)).toEqual({ roles: "", cities: "", userIds: "" });
    });
});

describe("labels", () => {
    it("says what the flag does for a caller", () => {
        expect(rolloutLabel({ enabled: false, rolloutPercent: 100 })).toBe("Off");
        expect(rolloutLabel({ enabled: true, rolloutPercent: 100 })).toBe("On for everyone");
        expect(rolloutLabel({ enabled: true, rolloutPercent: 0 })).toBe("On, 0% rollout");
        expect(rolloutLabel({ enabled: true, rolloutPercent: 40 })).toBe("On for 40% of users");
    });

    it("names the rules beside the percentage", () => {
        expect(rolloutRulesLabel(null)).toBeNull();
        expect(rolloutRulesLabel({ roles: [], cities: [] })).toBeNull();
        expect(rolloutRulesLabel({ userIds: ["a"], roles: ["ADMIN", "AGENT"], cities: ["Pune"] })).toBe("1 named account · ADMIN, AGENT · Pune");
    });

    it("badges a registered feature that arrived off and never moved", () => {
        expect(isDarkLaunch(row({ enabled: false }))).toBe(true);
        expect(isDarkLaunch(row({ enabled: false, source: "MANUAL" }))).toBe(false);
        expect(isDarkLaunch(row({ enabled: false, lastChange: { id: "c1" } as FeatureFlag["lastChange"] }))).toBe(false);
        expect(isDarkLaunch(row({ enabled: true }))).toBe(false);
    });
});

describe("changeSummary", () => {
    it("writes the transition from two states, since the server stores states", () => {
        expect(changeSummary({ enabled: true, rolloutPercent: 40 }, { enabled: true, rolloutPercent: 25 })).toBe("25% → 40%");
        expect(changeSummary({ enabled: true, rolloutPercent: 0 }, { enabled: false, rolloutPercent: 0 })).toBe("Off → On · 0%");
        expect(changeSummary({ enabled: false, rolloutPercent: 40 }, { enabled: true, rolloutPercent: 40 })).toBe("On · 40% → Off");
        expect(changeSummary({ enabled: true, rolloutPercent: 40 }, null)).toBe("Set to On · 40%");
        expect(changeSummary({ enabled: true, rolloutPercent: 40 }, { enabled: true, rolloutPercent: 40 })).toBe("No change");
    });

    it("names a variant move and a rules move", () => {
        expect(changeSummary({ enabled: true, rolloutPercent: 40, variant: "treatment" }, { enabled: true, rolloutPercent: 40, variant: null })).toBe(
            "Variant default → treatment",
        );
        expect(
            changeSummary({ enabled: true, rolloutPercent: 40, rollout: { roles: ["ADMIN"] } }, { enabled: true, rolloutPercent: 40, rollout: null }),
        ).toBe("Rules: ADMIN");
        expect(changeSummary({ enabled: true, rolloutPercent: 40, rollout: null }, { enabled: true, rolloutPercent: 40, rollout: { roles: ["ADMIN"] } })).toBe(
            "Rules: none",
        );
    });

    it("names a rollback as one, whatever it moved", () => {
        expect(changeSummary({ enabled: true, rolloutPercent: 25, variant: "control", rollbackOfId: "c9" }, { enabled: true, rolloutPercent: 40 })).toBe(
            "Rolled back to On · 25% · control",
        );
    });
});

describe("answerFor — the operator's answers from GET /flags/me (G11-2)", () => {
    const answers = {
        "marketplace.instant-booking": { enabled: true, variant: null },
        "campaigns.multi-market": { enabled: false, variant: "treatment" },
        "publisher.spot-insights": { enabled: true, variant: "treatment" },
    };

    it("prints what the server answered and treats a key it did not answer as unknown", () => {
        expect(answerFor(answers, "marketplace.instant-booking")).toEqual({ enabled: true, variant: null });
        expect(answerFor(answers, "publisher.spot-insights")).toEqual({ enabled: true, variant: "treatment" });
        expect(answerFor(answers, "no.such-feature")).toBeNull();
        // An alias is not a key the server answers — call sites name the canonical key.
        expect(answerFor(answers, "instant-booking")).toBeNull();
    });

    it("carries the variant only while on", () => {
        expect(answerFor(answers, "campaigns.multi-market")).toEqual({ enabled: false, variant: null });
    });
});

describe("coverageOf — the Coverage card", () => {
    const entry = (over: Partial<RegistryEntry>): RegistryEntry => ({
        key: "k",
        surfaces: ["CONSOLE"],
        kind: "FEATURE",
        owner: "platform",
        launch: "on",
        description: "",
        variants: [],
        aliases: [],
        routes: [],
        jobs: [],
        paths: {},
        declaredIn: ["backend"],
        flag: null,
        ...over,
    });
    const check = {
        current: false,
        surfaces: [
            { surface: "APP_USER" as const, behind: false, reasons: [] },
            { surface: "APP_AGENT" as const, behind: false, reasons: ["the APP_AGENT manifest is not on disk; not compared"] },
            { surface: "CONSOLE" as const, behind: true, reasons: ["console.new-desk is in the code but not in the document", "console.overview differs (paths)"] },
            { surface: "BACKEND" as const, behind: false, reasons: [] },
            { surface: "WEBSITE" as const, behind: false, reasons: [] },
        ],
    };

    it("counts features per surface, registered against manual, and dark launches", () => {
        const overview = row({ key: "console.overview", surfaces: ["CONSOLE"] });
        const dark = row({ key: "campaigns.multi-market", surfaces: ["APP_USER", "BACKEND"], enabled: false });
        const manual = row({ key: "ops.legacy", surfaces: ["CONSOLE"], source: "MANUAL", registeredAt: null });
        const registry = {
            generatedBy: "scripts/features-sync.ts",
            features: [
                entry({ key: "console.overview", paths: { CONSOLE: ["dashboard"] }, declaredIn: ["backend", "CONSOLE"], flag: overview }),
                entry({ key: "campaigns.multi-market", surfaces: ["APP_USER", "BACKEND"], flag: dark }),
                entry({ key: "ops.legacy", surfaces: ["CONSOLE"], declaredIn: [], flag: manual }),
            ],
            check: { current: true, surfaces: check.surfaces.map((verdict) => ({ ...verdict, behind: false, reasons: [] })) },
        };
        const coverage = coverageOf([overview, dark, manual], registry);
        expect(coverage).toMatchObject({ total: 3, registered: 2, manual: 1, dark: 1, generatedBy: "scripts/features-sync.ts" });
        expect(coverage.surfaces.find((s) => s.surface === "CONSOLE")).toEqual({ surface: "CONSOLE", features: 2, withRow: 2, manual: 1 });
        expect(coverage.surfaces.find((s) => s.surface === "APP_USER")).toEqual({ surface: "APP_USER", features: 1, withRow: 1, manual: 0 });
        expect(coverage.check?.current).toBe(true);
        expect(manifestChecksOf(coverage.check).every((line) => line.ok)).toBe(true);
    });

    it("prints the registry's own per-surface verdict (G11-2) rather than deriving one", () => {
        const coverage = coverageOf([row()], { generatedBy: "scripts/features-sync.ts", features: [], check });
        expect(coverage.check).toBe(check);
        const lines = manifestChecksOf(coverage.check);
        expect(lines.map((line) => line.surface)).toEqual(["APP_USER", "APP_AGENT", "CONSOLE", "BACKEND", "WEBSITE"]);
        const console = lines.find((line) => line.surface === "CONSOLE")!;
        expect(console.ok).toBe(false);
        expect(console.problems).toEqual(["console.new-desk is in the code but not in the document", "console.overview differs (paths)"]);
        // A manifest not on disk is "not compared" — ok, with the reason kept for the card.
        const agentApp = lines.find((line) => line.surface === "APP_AGENT")!;
        expect(agentApp.ok).toBe(true);
        expect(agentApp.problems).toEqual(["the APP_AGENT manifest is not on disk; not compared"]);
    });

    it("has no verdict on a backend that does not serve the check", () => {
        const coverage = coverageOf([row()], { generatedBy: null, features: [] });
        expect(coverage.check).toBeNull();
        expect(manifestChecksOf(coverage.check)).toEqual([]);
    });
});

/* ------------------------------------------------------------------ */
/* L-B / L-C: the filters, the paged shape and the bulk write          */
/* ------------------------------------------------------------------ */

describe("flagsPath — the query GET /flags takes", () => {
    it("is the bare path with nothing asked, and sends only what was", () => {
        expect(flagsPath()).toBe("/flags");
        expect(flagsPath({ surface: "APP_AGENT", state: "DARK_LAUNCH" })).toBe("/flags?surface=APP_AGENT&state=DARK_LAUNCH");
        expect(flagsPath({ kind: "EXPERIMENT", source: "MANUAL", owner: " demand ", q: " book " })).toBe(
            "/flags?kind=EXPERIMENT&source=MANUAL&owner=demand&q=book",
        );
        // A blank owner or search is not a filter.
        expect(flagsPath({ owner: "  ", q: "" })).toBe("/flags");
    });

    it("switches to the list contract only when a page is named", () => {
        expect(flagsPath({ page: 2, pageSize: 25 })).toBe("/flags?page=2&pageSize=25");
        expect(flagsPath({ page: 1 })).toBe("/flags?page=1");
    });
});

describe("flagStateOf — the state chip, by the server's rule", () => {
    it("calls a registered flag that arrived off and never moved a dark launch, off otherwise, on when enabled", () => {
        expect(flagStateOf(row({ enabled: false }))).toBe("DARK_LAUNCH");
        expect(flagStateOf(row({ enabled: false, source: "MANUAL" }))).toBe("OFF");
        expect(flagStateOf(row({ enabled: false, lastChange: { id: "c1" } as FeatureFlag["lastChange"] }))).toBe("OFF");
        expect(flagStateOf(row({ enabled: true }))).toBe("ON");
    });
});

describe("bulkNoteError — a bulk move always carries a reason", () => {
    it("wants 4 to 500 characters once trimmed", () => {
        expect(bulkNoteError("")).toMatch(/At least 4/);
        expect(bulkNoteError("  abc  ")).toMatch(/At least 4/);
        expect(bulkNoteError("abcd")).toBeNull();
        expect(bulkNoteError("  incident 4231  ")).toBeNull();
        expect(bulkNoteError("x".repeat(501))).toMatch(/At most 500/);
    });
});

describe("sharedVariantsOf — the Set variant button's guard", () => {
    it("offers the one list every selected row declares, order aside", () => {
        expect(
            sharedVariantsOf([
                { key: "a", variants: ["treatment", "control"] },
                { key: "b", variants: ["control", "treatment"] },
            ]),
        ).toEqual({ variants: ["control", "treatment"], reason: null });
    });

    it("explains, rather than offers, when the sets differ or a row declares none", () => {
        expect(sharedVariantsOf([])).toMatchObject({ variants: null, reason: "Nothing selected." });
        expect(sharedVariantsOf([{ key: "a", variants: [] }, { key: "b", variants: [] }])).toMatchObject({
            variants: null,
            reason: "None of the selected flags declares a variant.",
        });
        const some = sharedVariantsOf([{ key: "a", variants: ["control"] }, { key: "b", variants: [] }]);
        expect(some.variants).toBeNull();
        expect(some.reason).toContain("1 of the selected flags declares no variant (b)");
        const differ = sharedVariantsOf([{ key: "a", variants: ["control"] }, { key: "b", variants: ["control", "treatment"] }]);
        expect(differ.variants).toBeNull();
        expect(differ.reason).toContain("a and b differ");
    });
});

describe("flagsService — the bulk calls and the paged read", () => {
    beforeEach(() => {
        backend.calls = [];
        backend.answer = { updated: [], skipped: [] };
    });

    it("POSTs one request to /flags/bulk with the keys, the patch and the trimmed note", async () => {
        await flagsService.bulk(["a.one", "b.two"], { enabled: false }, "  incident 4231  ");
        expect(backend.calls).toEqual([
            { method: "POST", path: "/flags/bulk", body: { keys: ["a.one", "b.two"], patch: { enabled: false }, note: "incident 4231" } },
        ]);
    });

    it("carries a percentage, a variant or a rules patch unchanged, the note capped at 500", async () => {
        await flagsService.bulk(["a.one"], { rolloutPercent: 40 }, "x".repeat(600));
        await flagsService.bulk(["a.one"], { variant: null }, "back to the default");
        await flagsService.bulk(["a.one"], { rollout: { roles: ["ADMIN"] } }, "admins only");
        expect(backend.calls.map((call) => call.body)).toEqual([
            { keys: ["a.one"], patch: { rolloutPercent: 40 }, note: "x".repeat(500) },
            { keys: ["a.one"], patch: { variant: null }, note: "back to the default" },
            { keys: ["a.one"], patch: { rollout: { roles: ["ADMIN"] } }, note: "admins only" },
        ]);
    });

    it("POSTs one request to /flags/bulk/rollback with the keys and the note", async () => {
        await flagsService.bulkRollback(["a.one", "b.two"], " the 40% step broke checkout ");
        expect(backend.calls).toEqual([
            { method: "POST", path: "/flags/bulk/rollback", body: { keys: ["a.one", "b.two"], note: "the 40% step broke checkout" } },
        ]);
    });

    it("reads the bare array with the filters, and the list contract with a page", async () => {
        backend.answer = [row()];
        expect(await flagsService.list({ state: "ON", owner: "marketplace" })).toEqual([row()]);
        backend.answer = {
            items: [row()],
            total: 1,
            page: 2,
            pageSize: 25,
            counts: { surface: { APP_USER: 1 }, kind: { FEATURE: 1 }, state: { ON: 1 } },
        };
        const page = await flagsService.page({ page: 2, pageSize: 25, surface: "APP_USER" });
        expect(backend.calls.map((call) => call.path)).toEqual(["/flags?state=ON&owner=marketplace", "/flags?surface=APP_USER&page=2&pageSize=25"]);
        expect(page.total).toBe(1);
        // Every bucket present, the missing ones zero.
        expect(page.counts.surface).toEqual({ APP_USER: 1, APP_AGENT: 0, CONSOLE: 0, BACKEND: 0, WEBSITE: 0 });
        expect(page.counts.state).toEqual({ ON: 1, OFF: 0, DARK_LAUNCH: 0 });
        expect(page.counts.kind).toEqual({ FEATURE: 1, KILL_SWITCH: 0, EXPERIMENT: 0 });
    });
});
