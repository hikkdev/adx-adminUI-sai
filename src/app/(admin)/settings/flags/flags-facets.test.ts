import { describe, expect, it } from "vitest";

import type { FeatureFlag } from "@/services/flags";
import { DEFAULT_FLAG_FACETS, filterFlags, flagFacetCounts, flagFacetsHref, flagFacetsKey, ownersOf, readFlagFacets } from "./flags-facets";

/**
 * L-C — the desk's facets.
 *
 * What this pins: the URL round-trips every facet and drops the defaults;
 * a value outside the vocabulary is the default, not a crash; the rows
 * the facets leave are the rows `GET /flags?…` would answer by the same
 * rules (state by the dark-launch rule, owner exact case-insensitive, the
 * search a substring over key, description, owner and aliases); and the
 * chip counts follow the chip rule — each facet tallied with its own
 * filter removed, so "Off" still counts while "On" is pressed.
 */

const row = (over: Partial<FeatureFlag> = {}): FeatureFlag => ({
    key: "marketplace.instant-booking",
    enabled: true,
    rolloutPercent: 100,
    description: null,
    updatedById: null,
    surfaces: ["APP_USER", "BACKEND"],
    kind: "FEATURE",
    source: "REGISTERED",
    owner: "marketplace",
    variant: null,
    variants: [],
    rollout: null,
    lastGoodState: null,
    registeredAt: "2026-09-13T00:00:00.000Z",
    aliases: [],
    createdAt: "2026-09-13T00:00:00.000Z",
    updatedAt: "2026-09-13T00:00:00.000Z",
    lastChange: null,
    ...over,
});

const change = (at: string): FeatureFlag["lastChange"] => ({
    id: `c-${at}`,
    flagKey: "k",
    enabled: true,
    rolloutPercent: 100,
    variant: null,
    rollout: null,
    byUserId: "u1",
    byUser: { id: "u1", name: "Asha" },
    note: null,
    rollbackOfId: null,
    at,
});

const flags: FeatureFlag[] = [
    row({ key: "marketplace.instant-booking", aliases: ["instant-booking"], description: "Book a slot without a quote." }),
    row({ key: "campaigns.multi-market", enabled: false, surfaces: ["APP_USER", "CONSOLE"], owner: "Demand" }), // dark launch
    row({ key: "ops.legacy-export", enabled: false, source: "MANUAL", kind: "KILL_SWITCH", surfaces: ["CONSOLE"], owner: null }), // off
    row({ key: "checkout.paused", enabled: false, kind: "KILL_SWITCH", surfaces: ["APP_AGENT"], owner: "demand", lastChange: change("2026-09-14T01:00:00.000Z") }), // off, moved
    row({ key: "agent.pricing-experiment", kind: "EXPERIMENT", surfaces: ["APP_AGENT"], owner: "growth", variants: ["control", "treatment"] }),
];

describe("the URL", () => {
    it("round-trips every facet and writes nothing that is the default", () => {
        const facets = { surface: "APP_AGENT", kind: "KILL_SWITCH", source: "MANUAL", state: "DARK_LAUNCH", owner: "demand", q: "check" } as const;
        const href = flagFacetsHref("/settings/flags", facets);
        expect(href).toBe("/settings/flags?surface=APP_AGENT&kind=KILL_SWITCH&source=MANUAL&state=DARK_LAUNCH&owner=demand&q=check");
        expect(readFlagFacets(new URL(`http://x${href}`).searchParams)).toEqual(facets);
        expect(flagFacetsHref("/settings/flags", DEFAULT_FLAG_FACETS)).toBe("/settings/flags");
        expect(flagFacetsHref("/settings/flags", { ...DEFAULT_FLAG_FACETS, owner: "  ", q: " " })).toBe("/settings/flags");
    });

    it("reads a value outside the vocabulary as the default", () => {
        expect(readFlagFacets(new URLSearchParams("surface=MOON&kind=x&source=&state=on&owner=%20growth%20"))).toEqual({
            ...DEFAULT_FLAG_FACETS,
            owner: "growth",
        });
    });

    it("keys the table on the facets so a selection dies with its filter", () => {
        expect(flagFacetsKey(DEFAULT_FLAG_FACETS)).toBe("");
        expect(flagFacetsKey({ ...DEFAULT_FLAG_FACETS, state: "ON" })).not.toBe(flagFacetsKey({ ...DEFAULT_FLAG_FACETS, state: "OFF" }));
    });
});

describe("filterFlags — the server's rules, client-side", () => {
    const keys = (rows: FeatureFlag[]) => rows.map((flag) => flag.key);

    it("leaves everything with the defaults", () => {
        expect(filterFlags(flags, DEFAULT_FLAG_FACETS)).toHaveLength(5);
    });

    it("cuts by state with the dark-launch rule: registered, off and never moved", () => {
        expect(keys(filterFlags(flags, { ...DEFAULT_FLAG_FACETS, state: "DARK_LAUNCH" }))).toEqual(["campaigns.multi-market"]);
        expect(keys(filterFlags(flags, { ...DEFAULT_FLAG_FACETS, state: "OFF" }))).toEqual(["ops.legacy-export", "checkout.paused"]);
        expect(keys(filterFlags(flags, { ...DEFAULT_FLAG_FACETS, state: "ON" }))).toEqual(["marketplace.instant-booking", "agent.pricing-experiment"]);
    });

    it("matches the owner exactly, case aside, and the search as a substring over key, description, owner and aliases", () => {
        expect(keys(filterFlags(flags, { ...DEFAULT_FLAG_FACETS, owner: "DEMAND" }))).toEqual(["campaigns.multi-market", "checkout.paused"]);
        expect(keys(filterFlags(flags, { ...DEFAULT_FLAG_FACETS, owner: "dem" }))).toEqual([]);
        expect(keys(filterFlags(flags, { ...DEFAULT_FLAG_FACETS, q: "instant-booking" }))).toEqual(["marketplace.instant-booking"]);
        expect(keys(filterFlags(flags, { ...DEFAULT_FLAG_FACETS, q: "QUOTE" }))).toEqual(["marketplace.instant-booking"]);
        expect(keys(filterFlags(flags, { ...DEFAULT_FLAG_FACETS, q: "growth" }))).toEqual(["agent.pricing-experiment"]);
    });

    it("ANDs the facets", () => {
        expect(keys(filterFlags(flags, { ...DEFAULT_FLAG_FACETS, surface: "APP_AGENT", kind: "KILL_SWITCH" }))).toEqual(["checkout.paused"]);
        expect(keys(filterFlags(flags, { ...DEFAULT_FLAG_FACETS, surface: "CONSOLE", source: "MANUAL", state: "OFF" }))).toEqual(["ops.legacy-export"]);
        expect(keys(filterFlags(flags, { ...DEFAULT_FLAG_FACETS, surface: "CONSOLE", source: "REGISTERED", state: "OFF" }))).toEqual([]);
    });
});

describe("flagFacetCounts — the chip rule", () => {
    it("tallies each facet with its own filter removed, the others in force", () => {
        const counts = flagFacetCounts(flags, { ...DEFAULT_FLAG_FACETS, state: "ON", surface: "APP_AGENT" });
        // The state row ignores the state facet but keeps the surface: the two agent-app flags.
        expect(counts.state).toEqual({ ALL: 2, ON: 1, OFF: 1, DARK_LAUNCH: 0 });
        // The surface row ignores the surface facet but keeps the state: the two on flags.
        expect(counts.surface).toEqual({ ALL: 2, APP_USER: 1, APP_AGENT: 1, CONSOLE: 0, BACKEND: 1, WEBSITE: 0 });
        // Kind and source keep both facets in force: the one on flag on the agent app.
        expect(counts.kind).toEqual({ ALL: 1, FEATURE: 0, KILL_SWITCH: 0, EXPERIMENT: 1 });
        expect(counts.source).toEqual({ ALL: 1, REGISTERED: 1, MANUAL: 0 });
    });
});

describe("ownersOf — the Owner select", () => {
    it("lists the distinct owners of the rows and the registry, one spelling each, sorted", () => {
        expect(ownersOf(flags, ["Growth", "platform", ""])).toEqual(["Demand", "growth", "marketplace", "platform"]);
        expect(ownersOf([])).toEqual([]);
    });
});
