import { describe, expect, it, vi } from "vitest";

/**
 * The New campaign wizard's step machine (DR 10 `5102:27803`).
 *
 * The frame draws four steps; the API insists on a draft first and a flight
 * before a cart. What is pinned is the reconciliation: the order the person
 * walks, what stops them leaving each step, and the exact bodies the two
 * writes send — because a wrong cart body books nothing, and a wrong flight
 * body prices every spot at zero days.
 */

const { calls } = vi.hoisted(() => ({ calls: [] as { method: string; path: string; body?: unknown }[] }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (method: string) => async (path: string, body?: unknown) => {
        calls.push({ method, path, body });
        return {};
    };
    return {
        ...actual,
        api: { get: record("GET"), post: record("POST"), patch: record("PATCH"), put: record("PUT"), delete: record("DELETE") },
    };
});

import {
    WIZARD_STEPS,
    browseQuery,
    campaignWizardService,
    cartBody,
    estimatedCost,
    flightDays,
    flightPatch,
    initialWizardState,
    nextStep,
    previousStep,
    stepBlocker,
    type WizardState,
} from "./campaign-wizard";

const state = (over: Partial<WizardState> = {}): WizardState => ({
    ...initialWizardState(),
    advertiserId: "adv_1",
    campaignId: "cmp_1",
    name: "Diwali push",
    selected: ["lst_1", "lst_2"],
    startDate: "2026-05-01",
    endDate: "2026-05-28",
    budget: "250000",
    contentCategoryId: "cat_1",
    ...over,
});

describe("the order", () => {
    it("walks the frame's four steps with the advertiser in front", () => {
        expect(WIZARD_STEPS).toEqual(["ADVERTISER", "SITES", "FLIGHT", "CREATIVES", "REVIEW"]);
        expect(nextStep("ADVERTISER")).toBe("SITES");
        expect(nextStep("REVIEW")).toBeNull();
        expect(previousStep("SITES")).toBe("ADVERTISER");
        expect(previousStep("ADVERTISER")).toBeNull();
    });
});

describe("what blocks a step", () => {
    it("needs an advertiser and a name before a draft exists", () => {
        expect(stepBlocker(state({ step: "ADVERTISER", advertiserId: null }))).toMatch(/advertiser/);
        expect(stepBlocker(state({ step: "ADVERTISER", name: "  " }))).toMatch(/name/);
        expect(stepBlocker(state({ step: "ADVERTISER" }))).toBeNull();
    });

    it("needs at least one site", () => {
        expect(stepBlocker(state({ step: "SITES", selected: [] }))).toMatch(/site/);
        expect(stepBlocker(state({ step: "SITES" }))).toBeNull();
    });

    it("needs a flight, a well-formed budget and a content category — the venue check's input", () => {
        expect(stepBlocker(state({ step: "FLIGHT", endDate: "2026-04-01" }))).toMatch(/flight/);
        expect(stepBlocker(state({ step: "FLIGHT", budget: "12.345" }))).toMatch(/budget/);
        expect(stepBlocker(state({ step: "FLIGHT", budget: "" }))).toBeNull();
        expect(stepBlocker(state({ step: "FLIGHT", contentCategoryId: null }))).toMatch(/creative advertises/);
        expect(stepBlocker(state({ step: "FLIGHT" }))).toBeNull();
    });

    it("never blocks on artwork — the advertiser may upload later and the review lists it as outstanding", () => {
        expect(stepBlocker(state({ step: "CREATIVES", uploaded: 0 }))).toBeNull();
    });
});

describe("the flight", () => {
    it("counts days inclusive of both ends", () => {
        expect(flightDays("2026-05-01", "2026-05-28")).toBe(28);
        expect(flightDays("2026-05-01", "2026-05-01")).toBe(1);
    });

    it("is not a flight when the end precedes the start or a date is malformed", () => {
        expect(flightDays("2026-05-28", "2026-05-01")).toBeNull();
        expect(flightDays("May 1", "2026-05-01")).toBeNull();
    });

    it("prices the pick as rate × days in paise arithmetic, and skips a spot nobody has priced", () => {
        expect(estimatedCost(["1607.14", "2857.15", null], 28)).toBe("125000.12");
        expect(estimatedCost(["1000"], null)).toBeNull();
        expect(estimatedCost([], 28)).toBe("0.00");
    });
});

describe("the bodies", () => {
    it("writes the flight, the budget, the category and the creative path in one patch", () => {
        expect(flightPatch(state())).toEqual({
            startDate: "2026-05-01",
            endDate: "2026-05-28",
            budget: "250000",
            contentCategoryId: "cat_1",
            creative: { creativePath: "STATIC_IMAGES" },
            step: 9,
        });
    });

    it("leaves a blank budget off rather than sending zero", () => {
        expect(flightPatch(state({ budget: " " }))).not.toHaveProperty("budget");
    });

    it("sends every picked listing once, in the order picked", () => {
        expect(cartBody(state())).toEqual({
            items: [
                { listingId: "lst_1", quantity: 1 },
                { listingId: "lst_2", quantity: 1 },
            ],
        });
    });

    it("builds the browse query the route takes, and nothing it does not", () => {
        expect(browseQuery({})).toBe("");
        expect(browseQuery({ city: "Bengaluru", display: "DIGITAL", maxRate: "5000", instant: true, pageSize: 20 })).toBe(
            "?city=Bengaluru&display=DIGITAL&maxRate=5000&instant=true&pageSize=20",
        );
    });
});

describe("the routes", () => {
    it("creates the draft, patches the flight, puts the cart and browses the inventory", async () => {
        calls.length = 0;
        await campaignWizardService.createDraft({ advertiserId: "adv_1", name: "Diwali push" });
        await campaignWizardService.patch("cmp_1", flightPatch(state()));
        await campaignWizardService.setSpots("cmp_1", cartBody(state()));
        await campaignWizardService.browse({ q: "MG Road" });
        expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
            "POST /campaigns",
            "PATCH /campaigns/cmp_1",
            "PUT /campaigns/cmp_1/spots",
            "GET /listings/browse?q=MG+Road",
        ]);
        expect(calls[0].body).toEqual({ advertiserId: "adv_1", name: "Diwali push" });
    });
});
