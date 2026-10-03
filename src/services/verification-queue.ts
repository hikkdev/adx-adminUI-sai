import { VERIFICATION_STATE_META, type ComplianceCase, type StatusMeta, type VerificationQueueRow, type VerificationState } from "@/types";

/**
 * Listings › Verification — the queue's vocabulary (3 Oct 2026, the owner:
 * "If verifications lapsed, what action can we take here? There's no
 * actionable button or bulk action or selection option").
 *
 * The page now reads like the other queues: one summary line under the title
 * where the four number cards were, the chips with their counts, the shared
 * table with a row menu and the bulk bar. This file holds the pure parts —
 * which chip a row sits under, the summary line, the permission each action
 * needs and which rows each action skips and why — so the screen and its
 * tests read the same rules.
 */

/* ------------------------------------------------------------------ */
/* Chips and the summary line                                          */
/* ------------------------------------------------------------------ */

/**
 * Where a row sits, one place each so the chips add up to All: suspended
 * (by the sweep past the 48-hour window, or by the desk), else lapsed (its
 * earnings paused), else due soon (inside its window, or about to enter it).
 */
export type VerificationBucket = "LAPSED" | "DUE_SOON" | "SUSPENDED";
export type VerificationChip = "all" | VerificationBucket;

export function verificationBucket(row: Pick<VerificationQueueRow, "status" | "state">): VerificationBucket {
    if (row.status === "SUSPENDED") return "SUSPENDED";
    if (row.state === "LAPSED") return "LAPSED";
    return "DUE_SOON";
}

export type VerificationCounts = Record<VerificationChip, number>;

export function verificationCounts(rows: readonly Pick<VerificationQueueRow, "status" | "state">[]): VerificationCounts {
    const counts: VerificationCounts = { all: rows.length, LAPSED: 0, DUE_SOON: 0, SUSPENDED: 0 };
    for (const row of rows) counts[verificationBucket(row)] += 1;
    return counts;
}

/**
 * 3 Oct 2026 — the owner: "There's some lapsed ones but it doesn't show in
 * renewals tab." Both tabs said "Lapsed" for different things: this page is
 * the photo re-check that the spot still stands; Renewals is the lease,
 * licence or permit running out. So this page never says "lapsed" — it says
 * "re-check overdue" and "re-check due soon"; Renewals says "expired".
 */
const CHIP_LABEL: Record<VerificationChip, string> = {
    all: "All",
    LAPSED: "Re-check overdue",
    DUE_SOON: "Re-check due soon",
    SUSPENDED: "Suspended",
};

/** The state pill on this page: the shared meta with this page's words for the two clock states. */
export const RECHECK_STATE_META: Record<VerificationState, StatusMeta> = {
    ...VERIFICATION_STATE_META,
    RISKY: { label: "Re-check due soon", tone: "warning" },
    LAPSED: { label: "Re-check overdue", tone: "danger" },
};

/** The page's title, its standing explanation, and the line that points at the other "running out" desk. */
export const RECHECK_PAGE = {
    title: "Spot re-checks",
    subtitle:
        "Each live spot is re-checked with a GPS photo on a schedule (permanent spots every 180 days). An overdue re-check pauses the publisher's earnings on that spot, not the campaign.",
    crossLink: { lead: "Looking for leases or permits running out?", label: "See Renewals", href: "/listings/renewals" },
} as const;

export const VERIFICATION_CHIPS: VerificationChip[] = ["all", "LAPSED", "DUE_SOON", "SUSPENDED"];

export function verificationChips(counts: VerificationCounts): { value: VerificationChip; label: string; count: number }[] {
    return VERIFICATION_CHIPS.map((value) => ({ value, label: CHIP_LABEL[value], count: counts[value] }));
}

export function inChip(row: Pick<VerificationQueueRow, "status" | "state">, chip: VerificationChip): boolean {
    return chip === "all" || verificationBucket(row) === chip;
}

/** A compliance case still waiting on the desk: opened and not yet answered, or contacted and not yet closed. */
export const caseWaiting = (item: Pick<ComplianceCase, "status">): boolean => item.status === "OPEN" || item.status === "CONTACTED";

const reChecks = (count: number) => `${count} ${count === 1 ? "re-check" : "re-checks"}`;

/**
 * The summary line: "2 re-checks overdue (earnings paused) · 1 re-check due
 * soon · 0 compliance cases waiting · 1 suspended past the 48-hour window".
 */
export function verificationQueueSubtitle(counts: VerificationCounts, casesWaiting: number): string {
    const cases = `${casesWaiting} compliance ${casesWaiting === 1 ? "case" : "cases"} waiting`;
    return [
        `${reChecks(counts.LAPSED)} overdue (earnings paused)`,
        `${reChecks(counts.DUE_SOON)} due soon`,
        cases,
        `${counts.SUSPENDED} suspended past the 48-hour window`,
    ].join(" · ");
}

/* ------------------------------------------------------------------ */
/* Who may do what, and to which rows                                  */
/* ------------------------------------------------------------------ */

/** What each action's route asks — what the server checks, so what the screen asks before it offers the action. */
export const VERIFICATION_ACTION_PERMISSION = {
    remind: "supply.edit",
    siteCheck: "supply.edit",
    extend: "supply.approve",
    logAttempt: "supply.edit",
    resolve: "supply.approve",
    /** `POST /supply/enforcement/sweep`. */
    sweep: "system.jobs",
} as const;

/** "Give more time": the most one decision may add, and what the field starts at. */
export const EXTEND_MAX_DAYS = 30;
export const EXTEND_DEFAULT_DAYS = 7;
export const EXTEND_REASON_MIN = 3;

/** Why "Remind publisher" leaves a row alone, or null. */
export const remindSkip = (row: Pick<VerificationQueueRow, "publisherId">): string | null => (row.publisherId ? null : "no publisher");

/** Why "Send an agent" leaves a row alone, or null — a visit is booked against the publisher, and the agent is picked from the spot's city. */
export const siteCheckSkip = (row: Pick<VerificationQueueRow, "publisherId" | "city" | "cityId">): string | null => {
    if (!row.publisherId) return "no publisher";
    if (!row.city && !row.cityId) return "no city";
    return null;
};

/** Why "Give more time" leaves a row alone, or null — the server refuses a suspended listing, so the screen says so first. */
export const extendSkip = (row: Pick<VerificationQueueRow, "status" | "suspensionScopes">): string | null => {
    if ((row.suspensionScopes ?? []).length > 0) return "suspended — reinstate first";
    if (row.status === "SUSPENDED") return "suspended for the overdue re-check — a new check lifts it";
    return null;
};

/** Suspended by the sweep for the lapse itself: no section in force, nothing to reinstate. */
export const lapseSuspended = (row: Pick<VerificationQueueRow, "status" | "suspensionScopes">): boolean =>
    row.status === "SUSPENDED" && (row.suspensionScopes ?? []).length === 0;

/** Why a case action leaves a case alone, or null. */
export const caseClosedSkip = (item: Pick<ComplianceCase, "status">): string | null => (item.status === "RESOLVED" ? "already resolved" : null);

/** The channels a contact attempt is logged under — the owner's four. The server also takes EMAIL and IN_APP. */
export const CONTACT_CHANNEL_CHOICES = [
    { value: "CALL", label: "Call" },
    { value: "SMS", label: "SMS" },
    { value: "WHATSAPP", label: "WhatsApp" },
    { value: "VISIT", label: "Visit" },
] as const;
export type ContactChannelChoice = (typeof CONTACT_CHANNEL_CHOICES)[number]["value"];

/** What a failure is called in a run's summary: the title and its LST- reference. */
export const queueRowLabel = (row: Pick<VerificationQueueRow, "title" | "displayId">): string => (row.displayId ? `${row.title} (${row.displayId})` : row.title);
export const caseRowLabel = (item: Pick<ComplianceCase, "listingTitle" | "listingDisplayId" | "id">): string =>
    item.listingDisplayId ? `${item.listingTitle} (${item.listingDisplayId})` : item.listingTitle || item.id;

/**
 * A compliance case has no reference series of its own, and a raw database
 * id means nothing at the desk; the case is named by what it is about and
 * the listing's LST- reference — "Re-check case · LST-2009-2601" — with the
 * day it was opened under it. Never a new identifier series.
 */
export const caseReference = (item: Pick<ComplianceCase, "listingDisplayId" | "listingTitle">): string =>
    `Re-check case · ${item.listingDisplayId || item.listingTitle || "listing"}`;
