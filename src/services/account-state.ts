import { ApiError } from "@/lib/api-client";
import { ACCOUNT_STATES, type AccountState, type StatusMeta, type SuspensionScope } from "@/types";

/**
 * The account lifecycle — one meaning per word (the owner, 2 Oct 2026:
 * "when we suspend or deactivate someone's profile, first of all there's no
 * deletion option, KYC still shows up in QUEUE").
 *
 * The same four states for every party, plus the agent's own "left":
 *
 *   Suspended   — paused for now, with a reason; Reinstate undoes it.
 *   Deactivated — switched off by the desk; Reactivate undoes it.
 *   Closed      — closed for good; the records stay. Never undone.
 *   Left        — an agent who exited ADX (EXITED on the wire).
 *
 * The server says which on every queue and roster row as `accountState`;
 * a server one release behind sends nothing and the row reads as working.
 */

export { ACCOUNT_STATES, type AccountState };

/** The pill and the one-line explanation for each state. */
export const ACCOUNT_STATE_META: Record<AccountState, StatusMeta & { description: string }> = {
    ACTIVE: { label: "Active", tone: "success", description: "Working normally." },
    SUSPENDED: { label: "Suspended", tone: "danger", description: "Paused for now, with a reason. Reinstate to undo." },
    DEACTIVATED: { label: "Deactivated", tone: "danger", description: "Switched off by the desk. Reactivate to undo." },
    CLOSED: { label: "Closed", tone: "neutral", description: "Closed for good. The records stay." },
    EXITED: { label: "Left", tone: "neutral", description: "Left ADX. Kept for the records." },
};

/** `accountState` off the wire — null for a value the console does not know, or a server that sends none. */
export function accountStateOf(raw: unknown): AccountState | null {
    return typeof raw === "string" && (ACCOUNT_STATES as readonly string[]).includes(raw) ? (raw as AccountState) : null;
}

/** Whether the row is anything but a working account — what earns it a pill. */
export const isInactive = (state: AccountState | null | undefined): state is Exclude<AccountState, "ACTIVE"> => Boolean(state) && state !== "ACTIVE";

/* ------------------------------------------------------------------ */
/* The directories' Status filter                                      */
/* ------------------------------------------------------------------ */

/** What `?status=` takes on the publisher, advertiser and agent rosters; ACTIVE is the server's default. */
export type AccountStatusFacet = AccountState | "ALL";

export interface AccountStatusOption {
    value: AccountStatusFacet;
    label: string;
    description: string;
}

/** The option for everybody, last in the list. */
const EVERYONE: AccountStatusOption = { value: "ALL", label: "Everyone", description: "Every account, whatever its state." };

/**
 * The Status filter's options, in order: Active (the default), Suspended,
 * Deactivated, Closed, Left (agents only), Everyone — each with its line.
 */
export function accountStatusOptions(withLeft: boolean): AccountStatusOption[] {
    const states: AccountState[] = withLeft ? ["ACTIVE", "SUSPENDED", "DEACTIVATED", "CLOSED", "EXITED"] : ["ACTIVE", "SUSPENDED", "DEACTIVATED", "CLOSED"];
    return [...states.map((state) => ({ value: state, label: ACCOUNT_STATE_META[state].label, description: ACCOUNT_STATE_META[state].description })), EVERYONE];
}

export const DEFAULT_ACCOUNT_STATUS: AccountStatusFacet = "ACTIVE";

export function isAccountStatusFacet(value: string): value is AccountStatusFacet {
    return value === "ALL" || (ACCOUNT_STATES as readonly string[]).includes(value);
}

/** The roster's counts per status, as far as the server sent them. */
export type AccountStatusCounts = Partial<Record<AccountStatusFacet, number>>;

/**
 * The counts per status off a roster page. The server may send them as
 * their own `statusCounts`, or beside the KYC counts in `counts` (the
 * status words never clash with the KYC ones); either is read, and a
 * server one release behind sends neither — no counts are drawn then.
 */
export function accountStatusCountsOf(page: { statusCounts?: unknown; counts?: unknown } | null | undefined): AccountStatusCounts {
    const source = isRecord(page?.statusCounts) ? page.statusCounts : isRecord(page?.counts) ? page.counts : null;
    if (!source) return {};
    const out: AccountStatusCounts = {};
    for (const key of [...ACCOUNT_STATES, "ALL"] as const) {
        const value = source[key];
        if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    }
    return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/* ------------------------------------------------------------------ */
/* KYC requests on an inactive account                                 */
/* ------------------------------------------------------------------ */

/**
 * Why the desk may not ask this party for KYC, or null when it may. The
 * server refuses a closed account (409 `ACCOUNT_CLOSED`) and one suspended
 * from new work (409 `ACCOUNT_SUSPENDED`). Deactivating a person also
 * suspends their publisher, advertiser and agent profiles from new work, so
 * a deactivated one of those is refused too — `deactivationBlocksNew` is
 * false for a print partner off the roster or an inactive employee, which
 * the server still lets the desk ask. An agent who left has nothing to
 * verify. `scopes`, when the row carries them, narrows "suspended" to the
 * BLOCK_NEW case the server refuses.
 */
export function kycRequestBlockedReason(
    state: AccountState | null | undefined,
    scopes?: readonly SuspensionScope[] | null,
    deactivationBlocksNew = true,
): string | null {
    switch (state) {
        case "CLOSED":
            return "This account is closed, so KYC can't be requested.";
        case "EXITED":
            return "This agent has left ADX, so KYC can't be requested.";
        case "DEACTIVATED":
            return deactivationBlocksNew ? "This account is deactivated. Reactivate it before asking for KYC." : null;
        case "SUSPENDED":
            if (scopes && scopes.length > 0 && !scopes.includes("BLOCK_NEW")) return null;
            return "This account is suspended from new work. Reinstate it before asking for KYC.";
        default:
            return null;
    }
}

/**
 * A party page's account state, from what its own read carries — the
 * detail reads have no `accountState`, so it is put together from the
 * closure column, the active flags and the suspension sections, in the
 * order the server ranks them: closed, left, deactivated, suspended.
 */
export function accountStateFrom(facts: {
    closedAt?: string | null;
    exited?: boolean;
    /** `User.isActive`, `PrintPartner.isActive` or `Employee.isActive`, where the read carries one. */
    active?: boolean | null;
    scopes?: readonly SuspensionScope[] | null;
}): AccountState {
    if (facts.closedAt) return "CLOSED";
    if (facts.exited) return "EXITED";
    if (facts.active === false) return "DEACTIVATED";
    if (facts.scopes?.includes("BLOCK_NEW")) return "SUSPENDED";
    return "ACTIVE";
}

/** The server's two refusals of a KYC request on an inactive account. */
export const ACCOUNT_REFUSAL_CODES = ["ACCOUNT_CLOSED", "ACCOUNT_SUSPENDED"] as const;

/** 409 `ACCOUNT_CLOSED` / `ACCOUNT_SUSPENDED` — the server's sentence is meant for people and is shown as it comes. */
export function accountRefusal(cause: unknown): ApiError | null {
    return cause instanceof ApiError && cause.status === 409 && (ACCOUNT_REFUSAL_CODES as readonly string[]).includes(cause.code) ? cause : null;
}
