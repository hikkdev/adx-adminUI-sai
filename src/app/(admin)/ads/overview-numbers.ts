import type { PromotionsStats, SlotAvailability } from "@/services/promotions";

/** Booked against capacity over some days: `ratio` is null when there is no capacity to fill. */
export interface Fill {
    booked: number;
    capacity: number;
    ratio: number | null;
}

/** The days of a week counted from today — today and the six after it. */
export const WEEK_DAYS = 7;

function fillOver(days: SlotAvailability["days"], maxConcurrent: number): Fill {
    const booked = days.reduce((sum, day) => sum + day.booked, 0);
    const capacity = days.length * Math.max(0, maxConcurrent);
    return { booked, capacity, ratio: capacity > 0 ? booked / capacity : null };
}

/**
 * How full a slot is today and over the week from today: the ads holding a
 * place each day (paid, waiting on review or payment) against the slot's
 * `maxConcurrent` a day, summed. The availability read answers the days it
 * was asked for; today is the first of them.
 */
export function slotFill(availability: Pick<SlotAvailability, "days" | "maxConcurrent">, today: string): { today: Fill; week: Fill } {
    const sorted = [...availability.days].sort((a, b) => a.date.localeCompare(b.date));
    const fromToday = sorted.filter((day) => day.date >= today).slice(0, WEEK_DAYS);
    return {
        today: fillOver(fromToday.filter((day) => day.date === today), availability.maxConcurrent),
        week: fillOver(fromToday, availability.maxConcurrent),
    };
}

/** "2 of 3 · 67%", or "—" with nothing to fill. */
export function fillLabel(fill: Fill): string {
    if (fill.ratio === null) return "—";
    return `${fill.booked} of ${fill.capacity} · ${Math.round(fill.ratio * 100)}%`;
}

const paise = (amount: string): number => {
    const value = Number(amount);
    return Number.isFinite(value) ? Math.round(value * 100) : 0;
};

/**
 * The window's revenue before GST, split: display ads (the slots' rows) and
 * sponsored listings (the placements' rows — the server splits a listing
 * sponsored on both evenly between them). Both net of refunds, in rupees
 * with two decimals, the way the server writes money.
 */
export function revenueSplit(stats: Pick<PromotionsStats, "bySlot" | "byPlacement">): { ads: string; sponsored: string } {
    const sum = (rows: readonly { revenue: string }[]) => (rows.reduce((total, row) => total + paise(row.revenue), 0) / 100).toFixed(2);
    return { ads: sum(stats.bySlot), sponsored: sum(stats.byPlacement) };
}
