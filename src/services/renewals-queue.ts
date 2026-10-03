import type { RightsQueueRow, StatusMeta } from "@/types";

/**
 * Listings › Renewals — the queue's vocabulary (3 Oct 2026).
 *
 * The owner: "There's some lapsed ones but it doesn't show in renewals tab."
 * Both tabs said "Lapsed" for different things. This page watches the lease,
 * licence or permit — the publisher's right to sell the space — running out;
 * Verification watches the photo re-check that the spot still stands. So
 * this page says "Expired" and "Ending soon", and Verification says
 * "Re-check overdue".
 *
 * Like `verification-queue`, this holds the pure parts — the chip a row sits
 * under, the summary line, the words, the permission each action needs and
 * which rows it skips — so the screen and its tests read the same rules.
 */

/** Where a row sits, one place each so the chips add up to All: past its end date, else inside the sixty-day horizon. */
export type RenewalBucket = "EXPIRED" | "ENDING_SOON";
export type RenewalChip = "all" | RenewalBucket;

export function renewalBucket(row: Pick<RightsQueueRow, "state">): RenewalBucket {
    return row.state === "LAPSED" ? "EXPIRED" : "ENDING_SOON";
}

export type RenewalCounts = Record<RenewalChip, number>;

export function renewalCounts(rows: readonly Pick<RightsQueueRow, "state">[]): RenewalCounts {
    const counts: RenewalCounts = { all: rows.length, EXPIRED: 0, ENDING_SOON: 0 };
    for (const row of rows) counts[renewalBucket(row)] += 1;
    return counts;
}

/** The pill and the chip say the same word. */
export const RENEWAL_STATE_META: Record<RenewalBucket, StatusMeta> = {
    EXPIRED: { label: "Expired", tone: "danger" },
    ENDING_SOON: { label: "Ending soon", tone: "warning" },
};

export const RENEWAL_CHIPS: RenewalChip[] = ["all", "EXPIRED", "ENDING_SOON"];

export function renewalChips(counts: RenewalCounts): { value: RenewalChip; label: string; count: number }[] {
    return RENEWAL_CHIPS.map((value) => ({ value, label: value === "all" ? "All" : RENEWAL_STATE_META[value].label, count: counts[value] }));
}

export function inRenewalChip(row: Pick<RightsQueueRow, "state">, chip: RenewalChip): boolean {
    return chip === "all" || renewalBucket(row) === chip;
}

/** How far the queue looks ahead, in days — the read's horizon and the words that name it. */
export const RENEWALS_HORIZON_DAYS = 60;

/** The summary line: "1 expired (no new bookings) · 2 ending soon (within 60 days)". */
export function renewalsSubtitle(counts: RenewalCounts): string {
    return [`${counts.EXPIRED} expired (no new bookings)`, `${counts.ENDING_SOON} ending soon (within ${RENEWALS_HORIZON_DAYS} days)`].join(" · ");
}

/** The page's title, its standing explanation, and the line that points at the other "running out" desk. */
export const RENEWALS_PAGE = {
    title: "Lease, licence and permit renewals",
    subtitle: `Spots sold under a lease, licence or permit whose end date is within ${RENEWALS_HORIZON_DAYS} days or has passed. An expired one takes no new bookings until the renewed document is approved.`,
    crossLink: { lead: "Looking for overdue photo re-checks?", label: "See Verification", href: "/listings/verification" },
} as const;

/** What each action's route asks — what the server checks, so what the screen asks before it offers the action. */
export const RENEWAL_ACTION_PERMISSION = {
    /** `POST /supply/listings/:id/rights/remind`. */
    remind: "supply.edit",
    /** `POST /supply/rights/sweep`. */
    sweep: "system.jobs",
} as const;

/** Why "Remind publisher to renew" leaves a row alone, or null. */
export const remindRenewalSkip = (row: Pick<RightsQueueRow, "publisherId">): string | null => (row.publisherId ? null : "no publisher");

/** What a failure is called in a run's summary: the title and its LST- reference. */
export const renewalRowLabel = (row: Pick<RightsQueueRow, "title" | "displayId">): string => (row.displayId ? `${row.title} (${row.displayId})` : row.title);

/** "in 15d", "today", "19d ago" — the days beside the end date. */
export function daysLeftLabel(daysLeft: number | null): string {
    if (daysLeft === null) return "";
    if (daysLeft === 0) return "today";
    return daysLeft < 0 ? `${Math.abs(daysLeft)}d ago` : `in ${daysLeft}d`;
}
