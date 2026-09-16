import { ApiError, api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import type { StatusMeta, SuspensionScope } from "@/types";

/**
 * Modular suspension — Lot A, wired to the backend `suspension` module.
 *
 * ADX suspends *sections* of a party rather than the party. A listing can stop
 * taking bookings while the orders already on it run to the end; a publisher's
 * wallet can be frozen while their spots keep earning; an agent can be taken
 * off new work without losing the job they are half-way through. Five scopes
 * say which section, one vocabulary covers all four parties, and every step and
 * every reversal is a `PartySuspensionEvent` row with a reason and a name on it.
 *
 * No fixture fallback, and none is missing: no seed file has ever described a
 * suspension, so there is nothing a half-migrated screen could cross with. The
 * four party pages that mount this are all live already.
 *
 * Two rules from the README that the screens repeat rather than soften:
 * nothing here moves money — what a suspension costs an advertiser goes to
 * the refund desk as a request — and lifting STOP_OPEN_WORK does not un-cancel
 * anything. That work stopped, and the record says so.
 */

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

export type { SuspensionScope };

export const SUSPENSION_SCOPES: readonly SuspensionScope[] = [
    "BLOCK_NEW",
    "STOP_OPEN_WORK",
    "STOP_ACCRUAL",
    "FREEZE_WALLET",
    "BLOCK_SIGNIN",
];

export type SuspensionPartyType = "LISTING" | "PUBLISHER" | "ADVERTISER" | "AGENT";

/**
 * Which scopes each party admits — the README's table, verbatim.
 *
 * A listing has no wallet and cannot sign in. An advertiser earns nothing, so
 * STOP_ACCRUAL would be a scope that did nothing. A scope outside the party's
 * row is a 400 from the server naming what was rejected; the dialog never
 * offers one.
 */
export const SCOPES_BY_PARTY: Record<SuspensionPartyType, readonly SuspensionScope[]> = {
    LISTING: ["BLOCK_NEW", "STOP_OPEN_WORK", "STOP_ACCRUAL"],
    PUBLISHER: ["BLOCK_NEW", "STOP_OPEN_WORK", "STOP_ACCRUAL", "FREEZE_WALLET", "BLOCK_SIGNIN"],
    ADVERTISER: ["BLOCK_NEW", "STOP_OPEN_WORK", "FREEZE_WALLET", "BLOCK_SIGNIN"],
    AGENT: ["BLOCK_NEW", "STOP_OPEN_WORK", "FREEZE_WALLET", "BLOCK_SIGNIN"],
};

/** The scopes a party admits, in the vocabulary's order. */
export const admittedScopes = (partyType: SuspensionPartyType): SuspensionScope[] =>
    SUSPENSION_SCOPES.filter((scope) => SCOPES_BY_PARTY[partyType].includes(scope));

export const SCOPE_LABEL: Record<SuspensionScope, string> = {
    BLOCK_NEW: "Block new",
    STOP_OPEN_WORK: "Stop open work",
    STOP_ACCRUAL: "Stop accrual",
    FREEZE_WALLET: "Freeze wallet",
    BLOCK_SIGNIN: "Block sign-in",
};

/** The chip for a scope in force. Every one is a restriction, so every one is danger. */
export const scopeMeta = (scope: SuspensionScope): StatusMeta => ({
    label: SCOPE_LABEL[scope] ?? scope,
    tone: "danger",
});

/**
 * What each scope does — the README's "consequence" column, in the words the
 * dialog prints beside the checkbox.
 *
 * Where the consequence differs by party the README says so and this does
 * too: BLOCK_NEW on a listing stops bookings, on an advertiser it stops
 * checkout, on an agent it stops the offers reaching them. STOP_OPEN_WORK
 * takes the count of running orders when the page has it, because "3 running
 * orders are cancelled" is a different decision from "running orders are
 * cancelled".
 */
export function scopeConsequence(
    scope: SuspensionScope,
    partyType: SuspensionPartyType,
    counts: { runningOrders?: number | null; runningCampaigns?: number | null } = {},
): string {
    switch (scope) {
        case "BLOCK_NEW":
            if (partyType === "ADVERTISER") return "New bookings and package purchases stop";
            if (partyType === "AGENT") return "New work stops — no offer, visit, milestone or lead reaches them";
            if (partyType === "PUBLISHER") return "New bookings stop on every listing";
            return "New bookings stop";
        case "STOP_OPEN_WORK": {
            if (partyType === "AGENT") {
                const n = counts.runningOrders;
                const offers =
                    typeof n === "number"
                        ? `${n} unanswered offer${n === 1 ? " is" : "s are"} handed back and re-offered`
                        : "Unanswered offers are handed back and re-offered";
                return `${offers}, open visits cancelled and dispatched milestones returned to ADX`;
            }
            if (partyType === "ADVERTISER") {
                const n = counts.runningCampaigns;
                const campaigns =
                    typeof n === "number"
                        ? `${n} scheduled or live campaign${n === 1 ? " is" : "s are"}`
                        : "Scheduled and live campaigns are";
                return `${campaigns} cancelled and the unused days refunded through the refund desk`;
            }
            const n = counts.runningOrders;
            const orders =
                typeof n === "number"
                    ? `${n} running order${n === 1 ? " is" : "s are"}`
                    : "Running orders are";
            return `${orders} cancelled and their advertisers refunded through the refund desk`;
        }
        case "STOP_ACCRUAL":
            return partyType === "PUBLISHER" ? "Daily earnings stop on every listing" : "Daily earnings stop";
        case "FREEZE_WALLET":
            return "Withdrawals stop — money may land, nothing leaves";
        case "BLOCK_SIGNIN":
            return "Sign-in stops and sessions end";
    }
}

/**
 * Which scopes have a reversal at all. Lifting STOP_OPEN_WORK does not
 * un-cancel an order; lifting STOP_ACCRUAL only resumes tomorrow's run. The
 * reinstate dialog says so beside the checkbox rather than promising more.
 */
export function reinstateConsequence(scope: SuspensionScope, partyType: SuspensionPartyType): string {
    switch (scope) {
        case "BLOCK_NEW":
            if (partyType === "LISTING") return "Back on the marketplace, if it was published and its verification still stands";
            if (partyType === "PUBLISHER") return "Every listing takes bookings again, where its own verification still stands";
            if (partyType === "AGENT") return "Offered work again — ACTIVE, or ON_LEAVE if that is what they were";
            return "Checkout and package purchases open again";
        case "STOP_OPEN_WORK":
            return "Nothing comes back: the work that stopped stays cancelled. Only the flag is lifted";
        case "STOP_ACCRUAL":
            return "Daily earnings resume from the next accrual run";
        case "FREEZE_WALLET":
            return "Withdrawals open again";
        case "BLOCK_SIGNIN":
            return "Sign-in works again; they will need to sign in afresh";
    }
}

/* ------------------------------------------------------------------ */
/* The wire                                                            */
/* ------------------------------------------------------------------ */

export type SuspensionAction = "SUSPEND" | "REINSTATE";

/** One `PartySuspensionEvent` row, as `GET /suspension/:partyType/:partyId` sends it. */
export interface SuspensionEvent {
    id: string;
    partyType: SuspensionPartyType;
    partyId: string;
    action: SuspensionAction;
    scopes: SuspensionScope[];
    reason: string;
    byUserId: string;
    /** E6: the actor, joined — `name` null for an admin the platform no longer has. */
    byUser: { id: string; name: string | null };
    /** True on the listing rows a publisher suspension wrote on its behalf. */
    cascaded: boolean;
    at: string;
}

/** The current case and its whole history, for one party. */
export interface SuspensionView {
    partyType: SuspensionPartyType;
    partyId: string;
    /** In force now. Empty means not suspended on any section. */
    scopes: SuspensionScope[];
    /** When the case started. Kept through partial lifts; null once everything is lifted. */
    suspendedAt: string | null;
    suspensionReason: string | null;
    suspendedById: string | null;
    /** E10-1: the same person by name, the same lookup as the history; null while nobody has suspended the party. */
    suspendedBy?: { id: string; name: string | null } | null;
    name: string | null;
    /** What this party admits, from the server — the same table as `SCOPES_BY_PARTY`. */
    admits: SuspensionScope[];
    /** Newest first, up to the server's limit of a hundred. */
    events: SuspensionEvent[];
}

/** What a suspension actually did, reported back by the server. */
export interface SuspensionEffects {
    cascadedListingIds: string[];
    cancelledOrderIds: string[];
    cancelledCampaignIds: string[];
    releasedOrderIds: string[];
    cancelledVisitIds: string[];
    releasedMilestoneIds: string[];
    refunds: { campaignId: string; amount: string; requested: boolean; note?: string }[];
    walletFrozen: boolean;
    signinBlocked: boolean;
}

export type SuspendResult = Omit<SuspensionView, "name" | "admits" | "events"> & { effects: SuspensionEffects };
export type ReinstateResult = Omit<SuspensionView, "name" | "admits" | "events"> & { lifted: SuspensionScope[] };

export interface SuspendInput {
    scopes: SuspensionScope[];
    /** 3..500 characters; the server refuses a suspension with no stated reason. */
    reason: string;
}

export interface ReinstateInput {
    /** Left off or empty lifts everything the party is carrying. */
    scopes?: SuspensionScope[];
    reason: string;
}

/** The schema's bounds for a reason. */
export const SUSPENSION_REASON_MIN = 3;
export const SUSPENSION_REASON_MAX = 500;

/**
 * The write routes sit on the party's own path — `/listings/:id/suspend`,
 * `/agents/:id/reinstate` — because that is where the console reaches for
 * them. The read is the one place that knows all four.
 */
export const PARTY_PATH: Record<SuspensionPartyType, string> = {
    LISTING: "listings",
    PUBLISHER: "publishers",
    ADVERTISER: "advertisers",
    AGENT: "agents",
};

export const PARTY_LABEL: Record<SuspensionPartyType, string> = {
    LISTING: "Listing",
    PUBLISHER: "Publisher",
    ADVERTISER: "Advertiser",
    AGENT: "Agent",
};

/**
 * The two states an order is finished in. STOP_OPEN_WORK cancels everything
 * else — the server's `findOpenOrdersForListings` says "non-terminal means
 * anything but COMPLETED and CANCELLED", and the count the dialog prints has
 * to be the same count.
 */
export const TERMINAL_ORDER_STATUSES: ReadonlySet<string> = new Set(["COMPLETED", "CANCELLED"]);

/** How many of a page's orders STOP_OPEN_WORK would stop, counted the way the server counts them. */
export const countRunningOrders = (orders: { status: string }[]): number =>
    orders.filter((order) => !TERMINAL_ORDER_STATUSES.has(order.status)).length;

/** The two campaign states an advertiser's STOP_OPEN_WORK cancels. */
export const countRunningCampaigns = (campaigns: { status: string }[]): number =>
    campaigns.filter((campaign) => campaign.status === "SCHEDULED" || campaign.status === "LIVE").length;

/**
 * What a suspension summarised, for the toast: "Blocked new, froze wallet". The
 * effects are named only when the server reports one, so a wallet that was not
 * frozen because there is none is not claimed to be.
 */
export function describeEffects(effects: SuspensionEffects): string[] {
    const lines: string[] = [];
    const n = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;
    if (effects.cascadedListingIds.length) lines.push(`${n(effects.cascadedListingIds.length, "listing")} took the cascade`);
    if (effects.cancelledOrderIds.length) lines.push(`${n(effects.cancelledOrderIds.length, "order")} cancelled`);
    if (effects.cancelledCampaignIds.length) lines.push(`${n(effects.cancelledCampaignIds.length, "campaign")} cancelled`);
    if (effects.releasedOrderIds.length) lines.push(`${n(effects.releasedOrderIds.length, "offer")} handed back`);
    if (effects.cancelledVisitIds.length) lines.push(`${n(effects.cancelledVisitIds.length, "visit")} cancelled`);
    if (effects.releasedMilestoneIds.length) lines.push(`${n(effects.releasedMilestoneIds.length, "milestone")} returned`);
    const requested = effects.refunds.filter((refund) => refund.requested).length;
    const refused = effects.refunds.length - requested;
    if (requested) lines.push(`${n(requested, "refund request")} raised`);
    if (refused) lines.push(`${n(refused, "refund request")} refused by the desk — see the case`);
    if (effects.walletFrozen) lines.push("wallet frozen");
    if (effects.signinBlocked) lines.push("sign-in blocked");
    return lines;
}

/* ------------------------------------------------------------------ */
/* Calls                                                               */
/* ------------------------------------------------------------------ */

/**
 * Refuses to talk to the API while the console is on fixtures.
 *
 * There is nothing to fall back to. Throwing here, before a request goes out,
 * is what keeps a "suspended" toast from ever appearing over nothing.
 */
function live() {
    if (!isLive("suspension")) {
        throw new Error("Suspension reads the API; connect the console to the ADX backend first.");
    }
    return http;
}

export const suspensionService = {
    /** The case in force and the whole history. Null when the id names nobody. */
    history: async (partyType: SuspensionPartyType, partyId: string): Promise<SuspensionView | null> => {
        try {
            return await live().get<SuspensionView>(`/suspension/${partyType.toLowerCase()}/${partyId}`);
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 404) return null;
            throw cause;
        }
    },

    /**
     * Adds scopes. Suspending a scope already in force is a no-op on the list;
     * the case keeps the date and reason it started with, and the server
     * reports back what the step actually did.
     */
    suspend: (partyType: SuspensionPartyType, partyId: string, input: SuspendInput): Promise<SuspendResult> =>
        live().post<SuspendResult>(`/${PARTY_PATH[partyType]}/${partyId}/suspend`, {
            scopes: input.scopes,
            reason: input.reason,
        }),

    /**
     * Lifts scopes. With none named it lifts everything; with scopes named,
     * only those — so a wallet can be thawed while the listings stay blocked.
     */
    reinstate: (partyType: SuspensionPartyType, partyId: string, input: ReinstateInput): Promise<ReinstateResult> =>
        live().post<ReinstateResult>(`/${PARTY_PATH[partyType]}/${partyId}/reinstate`, {
            ...(input.scopes && input.scopes.length > 0 ? { scopes: input.scopes } : {}),
            reason: input.reason,
        }),
};
