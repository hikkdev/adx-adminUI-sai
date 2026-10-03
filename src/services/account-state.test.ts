import { describe, expect, it } from "vitest";

/**
 * The account lifecycle — 2 Oct 2026 (the owner: "when we suspend or
 * deactivate someone's profile, first of all there's no deletion option,
 * KYC still shows up in QUEUE").
 *
 * What is pinned: the four states and the agent's "left" read off the wire
 * (and nothing else does); the directories' Status options in their order
 * with a line each, Left only for agents; the counts read from either
 * place the server may put them; which accounts the desk may not ask for
 * KYC, and why, in plain words; a party page's state put together from its
 * own read; and the two 409 refusals recognised.
 */

import { ApiError } from "@/lib/api-client";
import {
    ACCOUNT_STATE_META,
    accountRefusal,
    accountStateFrom,
    accountStateOf,
    accountStatusCountsOf,
    accountStatusOptions,
    isAccountStatusFacet,
    isInactive,
    kycRequestBlockedReason,
} from "./account-state";
import { buildAdvertiserKycQuery } from "./advertiser-kyc";
import { buildAgentKycQuery } from "./agent-kyc";
import { buildEmployeeKycQuery } from "./employee-kyc";
import { buildKycQueueQuery } from "./kyc";
import { buildPrintPartnerKycQuery } from "./print-partner-kyc";

describe("the account states", () => {
    it("reads the five words off the wire and nothing else", () => {
        expect(accountStateOf("SUSPENDED")).toBe("SUSPENDED");
        expect(accountStateOf("EXITED")).toBe("EXITED");
        expect(accountStateOf("ARCHIVED")).toBeNull();
        expect(accountStateOf(undefined)).toBeNull();
        expect(accountStateOf(null)).toBeNull();
    });

    it("names an agent who exited 'Left', and gives every state one plain line", () => {
        expect(ACCOUNT_STATE_META.EXITED.label).toBe("Left");
        for (const meta of Object.values(ACCOUNT_STATE_META)) expect(meta.description.length).toBeGreaterThan(0);
    });

    it("counts a working account (or one the server said nothing about) as active", () => {
        expect(isInactive("ACTIVE")).toBe(false);
        expect(isInactive(null)).toBe(false);
        expect(isInactive(undefined)).toBe(false);
        expect(isInactive("CLOSED")).toBe(true);
    });
});

describe("the directories' Status options", () => {
    it("are Active, Suspended, Deactivated, Closed, Everyone — with Left before Everyone for agents", () => {
        expect(accountStatusOptions(false).map((option) => option.label)).toEqual(["Active", "Suspended", "Deactivated", "Closed", "Everyone"]);
        expect(accountStatusOptions(true).map((option) => option.label)).toEqual(["Active", "Suspended", "Deactivated", "Closed", "Left", "Everyone"]);
        expect(accountStatusOptions(true).map((option) => option.value)).toEqual(["ACTIVE", "SUSPENDED", "DEACTIVATED", "CLOSED", "EXITED", "ALL"]);
        expect(accountStatusOptions(true).every((option) => option.description.length > 0)).toBe(true);
    });

    it("takes only the values `?status=` takes", () => {
        expect(isAccountStatusFacet("ALL")).toBe(true);
        expect(isAccountStatusFacet("CLOSED")).toBe(true);
        expect(isAccountStatusFacet("all")).toBe(false);
        expect(isAccountStatusFacet("")).toBe(false);
    });

    it("reads the counts from `statusCounts`, else from beside the KYC counts, else none", () => {
        expect(accountStatusCountsOf({ statusCounts: { ACTIVE: 12, CLOSED: 2, ALL: 15 }, counts: { PENDING: 4 } })).toEqual({ ACTIVE: 12, CLOSED: 2, ALL: 15 });
        expect(accountStatusCountsOf({ counts: { PENDING: 4, VERIFIED: 8, ACTIVE: 10, SUSPENDED: 1 } })).toEqual({ ACTIVE: 10, SUSPENDED: 1 });
        expect(accountStatusCountsOf({ counts: { PENDING: 4 } })).toEqual({});
        expect(accountStatusCountsOf(undefined)).toEqual({});
    });
});

describe("asking an inactive account for KYC", () => {
    it("is refused for a closed account, one suspended from new work, a deactivated one and an agent who left", () => {
        expect(kycRequestBlockedReason("CLOSED")).toMatch(/closed/i);
        expect(kycRequestBlockedReason("SUSPENDED")).toMatch(/suspended from new work/i);
        expect(kycRequestBlockedReason("SUSPENDED", ["BLOCK_NEW", "FREEZE_WALLET"])).toMatch(/Reinstate/);
        expect(kycRequestBlockedReason("DEACTIVATED")).toMatch(/Reactivate/);
        expect(kycRequestBlockedReason("EXITED")).toMatch(/left ADX/);
    });

    it("stays open for a working account, a suspension without BLOCK_NEW, and an off-roster shop or inactive employee", () => {
        expect(kycRequestBlockedReason("ACTIVE")).toBeNull();
        expect(kycRequestBlockedReason(null)).toBeNull();
        expect(kycRequestBlockedReason("SUSPENDED", ["FREEZE_WALLET"])).toBeNull();
        expect(kycRequestBlockedReason("DEACTIVATED", null, false)).toBeNull();
    });

    it("puts a party page's state together from its own read, worst first", () => {
        expect(accountStateFrom({ closedAt: "2026-10-01T00:00:00.000Z", active: false, scopes: ["BLOCK_NEW"] })).toBe("CLOSED");
        expect(accountStateFrom({ exited: true, scopes: ["BLOCK_NEW"] })).toBe("EXITED");
        expect(accountStateFrom({ active: false, scopes: ["BLOCK_NEW"] })).toBe("DEACTIVATED");
        expect(accountStateFrom({ scopes: ["BLOCK_NEW"] })).toBe("SUSPENDED");
        expect(accountStateFrom({ scopes: ["FREEZE_WALLET"] })).toBe("ACTIVE");
        expect(accountStateFrom({})).toBe("ACTIVE");
    });

    it("recognises the server's two refusals and nothing else", () => {
        expect(accountRefusal(new ApiError(409, "ACCOUNT_CLOSED", "This account is closed."))?.message).toBe("This account is closed.");
        expect(accountRefusal(new ApiError(409, "ACCOUNT_SUSPENDED", "Suspended."))).not.toBeNull();
        expect(accountRefusal(new ApiError(409, "KYC_ALREADY_VERIFIED", "Verified."))).toBeNull();
        expect(accountRefusal(new Error("boom"))).toBeNull();
    });
});

describe("the five KYC queues and `include=inactive`", () => {
    it.each([
        ["publishers", buildKycQueueQuery],
        ["advertisers", buildAdvertiserKycQuery],
        ["print partners", buildPrintPartnerKycQuery],
        ["agents", buildAgentKycQuery],
        ["employees", buildEmployeeKycQuery],
    ] as const)("%s: sent only when the switch is on", (_party, build) => {
        expect(new URLSearchParams(build({ includeInactive: true })).get("include")).toBe("inactive");
        expect(new URLSearchParams(build({})).has("include")).toBe(false);
        expect(new URLSearchParams(build({ includeInactive: false })).has("include")).toBe(false);
    });
});
