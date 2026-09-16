import { describe, expect, it, vi } from "vitest";

/**
 * The listing page's Pricing tab — the apply flow (Lot E, Q125).
 *
 * Applying a factor used to be a toggle nobody could distinguish from a
 * preference. Now a factor has a mode, and a BINDING one moves a price a
 * publisher is being paid. What is pinned is the seam the tab depends on:
 * the exact body the apply sends, the sentence shown before the button is
 * pressed for each mode, and how the 409 the server answers above the cap
 * is read — with the price case it raised, so the tab can link to it.
 */

const { calls } = vi.hoisted(() => ({ calls: [] as { method: string; path: string; body?: unknown }[] }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (method: string) => async (path: string, body?: unknown) => {
        calls.push({ method, path, body });
        return [];
    };
    return {
        ...actual,
        api: { get: record("GET"), post: record("POST"), patch: record("PATCH"), put: record("PUT"), delete: record("DELETE") },
    };
});

import { ApiError } from "@/lib/api-client";
import { applyConsequence, bindingRefusal, pricingService } from "./pricing";

describe("the routes the tab reads and writes", () => {
    it("sends the factor and the decision, nothing else, to the apply route", async () => {
        calls.length = 0;
        await pricingService.applyFactor("lst_1", "fac_9", true);
        expect(calls).toEqual([{ method: "POST", path: "/pricing/listings/lst_1/factors/apply", body: { factorId: "fac_9", applied: true } }]);
    });

    it("un-applies with the same body and applied: false", async () => {
        calls.length = 0;
        await pricingService.applyFactor("lst_1", "fac_9", false);
        expect(calls[0].body).toEqual({ factorId: "fac_9", applied: false });
    });

    it("reads the proposals, the refresh, the suggested rate and the indicator off the listing routes", async () => {
        calls.length = 0;
        await pricingService.listingFactors("lst_1");
        await pricingService.refreshFactors("lst_1");
        await pricingService.suggestedRate("lst_1");
        await pricingService.listingIndicator("lst_1");
        expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
            "GET /pricing/listings/lst_1/factors",
            "POST /pricing/listings/lst_1/factors/refresh",
            "GET /pricing/listings/lst_1/suggested-rate",
            "GET /pricing/listings/lst_1/indicator",
        ]);
    });
});

describe("what the confirmation says", () => {
    const advisory = { name: "Corner plot", mode: "ADVISORY" as const, bindingDuringSurgeOnly: false };
    const binding = { name: "Metro adjacency", mode: "BINDING" as const, bindingDuringSurgeOnly: false };
    const surge = { name: "Festival lift", mode: "BINDING" as const, bindingDuringSurgeOnly: true };

    it("says an advisory apply moves the offer and not the rate", () => {
        const sentence = applyConsequence(advisory, true, "0.25");
        expect(sentence).toContain("advisory");
        expect(sentence).toContain("does not move");
    });

    it("says a binding apply reprices the listing now, and names the cap", () => {
        const sentence = applyConsequence(binding, true, "0.25");
        expect(sentence).toContain("reprices this listing now");
        expect(sentence).toContain("25%");
        expect(sentence).toContain("price case");
    });

    it("says a surge-only factor binds only inside a window", () => {
        expect(applyConsequence(surge, true, "0.1")).toContain("surge window");
        expect(applyConsequence(surge, true, "0.1")).toContain("10%");
    });

    it("says un-applying a binding factor reprices back under the same cap", () => {
        expect(applyConsequence(binding, false, "0.25")).toContain("reprices the listing back");
    });

    it("does not invent a cap when the settings have not loaded", () => {
        expect(applyConsequence(binding, true, null)).toContain("the binding cap");
    });
});

describe("the 409 above the cap", () => {
    it("reads BINDING_CHANGE_TOO_LARGE with the price case it raised", () => {
        const error = new ApiError(409, "BINDING_CHANGE_TOO_LARGE", '"Metro adjacency" would move this rate by more than 25%. A price case has been raised for a person to decide.', {
            priceApprovalId: "pa_1",
            from: "1000.00",
            to: "1400.00",
            capPct: 25,
        });
        expect(bindingRefusal(error)).toEqual({
            message: error.message,
            priceApprovalId: "pa_1",
            from: "1000.00",
            to: "1400.00",
            capPct: 25,
        });
    });

    it("is null for any other failure, so it reaches the toast instead of the case banner", () => {
        expect(bindingRefusal(new ApiError(409, "CONFLICT", "No comparable spots within 200 m"))).toBeNull();
        expect(bindingRefusal(new Error("offline"))).toBeNull();
    });
});
