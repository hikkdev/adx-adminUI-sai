import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lot A — modular suspension, the service half.
 *
 * What this pins: the per-party scope table matches the backend README
 * verbatim, the consequence sentences say what the README says, the writes
 * go to the party's own path with exactly the body `suspendBodySchema` and
 * `reinstateBodySchema` parse, and a reinstate that lifts everything sends no
 * scope list — because an empty one and an omitted one both mean "everything"
 * to the server, and sending a stale list is how something gets left behind.
 */

const { backend } = vi.hoisted(() => {
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        answer: null as unknown,
        status: 200,
        reset() {
            this.calls = [];
            this.answer = null;
            this.status = 200;
        },
    };
    return { backend };
});

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return {
        ...actual,
        apiConfig: { ...actual.apiConfig, live: true },
        isLive: () => true,
    };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        if (backend.status !== 200) throw new actual.ApiError(backend.status, "NOT_FOUND", "No such party");
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

import {
    SCOPES_BY_PARTY,
    SUSPENSION_SCOPES,
    admittedScopes,
    countRunningCampaigns,
    countRunningOrders,
    describeEffects,
    scopeConsequence,
    suspensionService,
    type SuspensionEffects,
} from "./suspension";

beforeEach(() => backend.reset());

describe("which scopes a party admits — the README's table", () => {
    it("a listing takes the three that are about the spot itself", () => {
        expect(admittedScopes("LISTING")).toEqual(["BLOCK_NEW", "STOP_OPEN_WORK", "STOP_ACCRUAL"]);
    });

    it("a publisher takes all five", () => {
        expect(admittedScopes("PUBLISHER")).toEqual(SUSPENSION_SCOPES);
    });

    it("an advertiser has no accrual to stop", () => {
        expect(admittedScopes("ADVERTISER")).toEqual(["BLOCK_NEW", "STOP_OPEN_WORK", "FREEZE_WALLET", "BLOCK_SIGNIN"]);
        expect(SCOPES_BY_PARTY.ADVERTISER).not.toContain("STOP_ACCRUAL");
    });

    it("an agent takes the same four as an advertiser", () => {
        expect(admittedScopes("AGENT")).toEqual(admittedScopes("ADVERTISER"));
    });

    it("never offers a scope outside the party's row, whatever order the table lists them in", () => {
        for (const party of ["LISTING", "PUBLISHER", "ADVERTISER", "AGENT"] as const) {
            for (const scope of admittedScopes(party)) expect(SCOPES_BY_PARTY[party]).toContain(scope);
        }
    });
});

describe("what each scope does — the README's consequence column", () => {
    it("says the five sentences for a publisher", () => {
        expect(scopeConsequence("BLOCK_NEW", "PUBLISHER")).toMatch(/^New bookings stop/);
        expect(scopeConsequence("STOP_OPEN_WORK", "PUBLISHER")).toBe(
            "Running orders are cancelled and their advertisers refunded through the refund desk",
        );
        expect(scopeConsequence("STOP_ACCRUAL", "PUBLISHER")).toMatch(/^Daily earnings stop/);
        expect(scopeConsequence("FREEZE_WALLET", "PUBLISHER")).toMatch(/^Withdrawals stop/);
        expect(scopeConsequence("BLOCK_SIGNIN", "PUBLISHER")).toBe("Sign-in stops and sessions end");
    });

    it("prints the count of running orders when the page has one, and no number when it does not", () => {
        expect(scopeConsequence("STOP_OPEN_WORK", "LISTING", { runningOrders: 3 })).toBe(
            "3 running orders are cancelled and their advertisers refunded through the refund desk",
        );
        expect(scopeConsequence("STOP_OPEN_WORK", "LISTING", { runningOrders: 1 })).toBe(
            "1 running order is cancelled and their advertisers refunded through the refund desk",
        );
        expect(scopeConsequence("STOP_OPEN_WORK", "LISTING", { runningOrders: null })).toBe(
            "Running orders are cancelled and their advertisers refunded through the refund desk",
        );
    });

    it("words an advertiser's and an agent's open work the way the README does", () => {
        expect(scopeConsequence("STOP_OPEN_WORK", "ADVERTISER", { runningCampaigns: 2 })).toMatch(
            /^2 scheduled or live campaigns are cancelled/,
        );
        expect(scopeConsequence("STOP_OPEN_WORK", "AGENT")).toMatch(/handed back and re-offered/);
        expect(scopeConsequence("BLOCK_NEW", "AGENT")).toMatch(/no offer, visit, milestone or lead/);
        expect(scopeConsequence("BLOCK_NEW", "ADVERTISER")).toMatch(/package purchases/);
    });

    it("counts running work the way the server does: anything but COMPLETED and CANCELLED", () => {
        expect(
            countRunningOrders([
                { status: "DRAFT" },
                { status: "PENDING_PUBLISHER" },
                { status: "IN_PROGRESS" },
                { status: "COMPLETED" },
                { status: "CANCELLED" },
            ]),
        ).toBe(3);
        expect(countRunningCampaigns([{ status: "SCHEDULED" }, { status: "LIVE" }, { status: "DRAFT" }, { status: "COMPLETED" }])).toBe(2);
    });
});

describe("the writes", () => {
    it("suspends on the party's own path with scopes and a reason", async () => {
        backend.answer = { partyType: "LISTING", partyId: "lst_1", scopes: ["BLOCK_NEW"], effects: {} };
        await suspensionService.suspend("LISTING", "lst_1", { scopes: ["BLOCK_NEW"], reason: "Site unsafe" });
        expect(backend.calls).toEqual([
            { method: "POST", path: "/listings/lst_1/suspend", body: { scopes: ["BLOCK_NEW"], reason: "Site unsafe" } },
        ]);
    });

    it("uses each party's route prefix", async () => {
        backend.answer = { scopes: [], effects: {} };
        await suspensionService.suspend("PUBLISHER", "p1", { scopes: ["FREEZE_WALLET"], reason: "Chargebacks" });
        await suspensionService.suspend("ADVERTISER", "a1", { scopes: ["BLOCK_SIGNIN"], reason: "Chargebacks" });
        await suspensionService.suspend("AGENT", "g1", { scopes: ["BLOCK_NEW"], reason: "Chargebacks" });
        expect(backend.calls.map((call) => call.path)).toEqual([
            "/publishers/p1/suspend",
            "/advertisers/a1/suspend",
            "/agents/g1/suspend",
        ]);
    });

    it("reinstates everything by sending no scope list at all", async () => {
        backend.answer = { scopes: [], lifted: ["BLOCK_NEW", "FREEZE_WALLET"] };
        await suspensionService.reinstate("PUBLISHER", "p1", { reason: "Investigation closed" });
        await suspensionService.reinstate("PUBLISHER", "p1", { scopes: [], reason: "Investigation closed" });
        expect(backend.calls.map((call) => call.body)).toEqual([
            { reason: "Investigation closed" },
            { reason: "Investigation closed" },
        ]);
    });

    it("reinstates some by naming them", async () => {
        backend.answer = { scopes: ["BLOCK_NEW"], lifted: ["FREEZE_WALLET"] };
        await suspensionService.reinstate("AGENT", "g1", { scopes: ["FREEZE_WALLET"], reason: "Wallet cleared" });
        expect(backend.calls).toEqual([
            { method: "POST", path: "/agents/g1/reinstate", body: { scopes: ["FREEZE_WALLET"], reason: "Wallet cleared" } },
        ]);
    });
});

describe("the read", () => {
    it("asks /suspension/:partyType/:partyId in lower case", async () => {
        backend.answer = { partyType: "AGENT", partyId: "g1", scopes: [], events: [], admits: [] };
        await suspensionService.history("AGENT", "g1");
        expect(backend.calls).toEqual([{ method: "GET", path: "/suspension/agent/g1", body: undefined }]);
    });

    it("turns a 404 into null so the page can say so rather than fail", async () => {
        backend.status = 404;
        expect(await suspensionService.history("LISTING", "nobody")).toBeNull();
    });
});

describe("describeEffects — what the toast says a suspension did", () => {
    const effects = (over: Partial<SuspensionEffects> = {}): SuspensionEffects => ({
        cascadedListingIds: [],
        cancelledOrderIds: [],
        cancelledCampaignIds: [],
        releasedOrderIds: [],
        cancelledVisitIds: [],
        releasedMilestoneIds: [],
        refunds: [],
        walletFrozen: false,
        signinBlocked: false,
        ...over,
    });

    it("names only what the server reports, and a refund the desk refused is not called raised", () => {
        expect(describeEffects(effects())).toEqual([]);
        expect(
            describeEffects(
                effects({
                    cancelledOrderIds: ["o1", "o2"],
                    refunds: [
                        { campaignId: "c1", amount: "1200.00", requested: true },
                        { campaignId: "c2", amount: "300.00", requested: false, note: "cap" },
                    ],
                    walletFrozen: true,
                }),
            ),
        ).toEqual(["2 orders cancelled", "1 refund request raised", "1 refund request refused by the desk — see the case", "wallet frozen"]);
    });
});
