import type { OrderStatus } from "@/types";
import type { CalendarOrder, CalendarSite } from "@/services/orders";

/**
 * The gantt's arithmetic, kept apart from the component so it can be pinned.
 *
 * DECISION 17 (recorded): nothing in the platform records a Hold or a Block
 * on inventory. There is no hold table, no maintenance window, no manual
 * block — so the calendar draws ONLY what an order says: a Booked bar over
 * the flight, and everything else as Available. The Hold and Blocked legend
 * entries the seeded calendar drew described records that do not exist.
 *
 * Lot G (Q114, package CG1): the rows are the listings-first read,
 * `GET /orders/calendar` — every ACTIVE site in the filter, each with the
 * orders that hold a slot on it over the window — so a site with nothing
 * booked is an empty row rather than an absence.
 */

export type CalendarRange = "WEEK" | "FORTNIGHT" | "MONTH";
export const CALENDAR_RANGES: readonly CalendarRange[] = ["WEEK", "FORTNIGHT", "MONTH"];
export const CALENDAR_RANGE_LABEL: Record<CalendarRange, string> = {
    WEEK: "Week",
    FORTNIGHT: "2 weeks",
    MONTH: "Month",
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD in the browser's clock. */
export function dayKey(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local midnight of a YYYY-MM-DD. */
export function atMidnight(day: string): Date {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(y, m - 1, d);
}

export interface CalendarWindow {
    /** Local midnight of the first column. */
    start: Date;
    days: number;
    /** One entry per column. */
    columns: { key: string; weekday: string; date: string; weekend: boolean }[];
}

/**
 * The columns around an anchor day: the Monday-to-Sunday week it falls in,
 * two of those, or its calendar month. A month is the real month — 28 to 31
 * columns — rather than a round four weeks, because "Month" on the control
 * would otherwise be a lie by up to three days.
 */
export function windowFor(anchor: string, range: CalendarRange): CalendarWindow {
    const day = atMidnight(anchor);
    let start: Date;
    let days: number;
    if (range === "MONTH") {
        start = new Date(day.getFullYear(), day.getMonth(), 1);
        days = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
    } else {
        // Monday first. `getDay()` counts from Sunday.
        const offset = (day.getDay() + 6) % 7;
        start = new Date(day.getFullYear(), day.getMonth(), day.getDate() - offset);
        days = range === "WEEK" ? 7 : 14;
    }
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const columns = Array.from({ length: days }, (_, index) => {
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
        return {
            key: dayKey(date),
            weekday: weekdays[date.getDay()],
            date: String(date.getDate()),
            weekend: date.getDay() === 0 || date.getDay() === 6,
        };
    });
    return { start, days, columns };
}

/**
 * The window as the two ISO instants `GET /orders/calendar?from&to` takes: local
 * midnight of the first column to the last instant of the last, so a flight
 * ending on the last day is still inside.
 */
export function windowBounds(window: CalendarWindow): { from: string; to: string } {
    const end = new Date(window.start.getFullYear(), window.start.getMonth(), window.start.getDate() + window.days);
    return { from: window.start.toISOString(), to: new Date(end.getTime() - 1).toISOString() };
}

/** The anchor one window earlier or later. */
export function shiftAnchor(anchor: string, range: CalendarRange, direction: -1 | 1): string {
    const day = atMidnight(anchor);
    if (range === "MONTH") return dayKey(new Date(day.getFullYear(), day.getMonth() + direction, 1));
    const days = range === "WEEK" ? 7 : 14;
    return dayKey(new Date(day.getFullYear(), day.getMonth(), day.getDate() + direction * days));
}

/** "14 Apr to 27 Apr 2026" */
export function windowLabel(window: CalendarWindow): string {
    const end = new Date(window.start.getFullYear(), window.start.getMonth(), window.start.getDate() + window.days - 1);
    const short = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });
    const long = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
    return `${short.format(window.start)} to ${long.format(end)}`;
}

/**
 * The statuses under which a spot is NOT occupied. A draft has not been
 * placed; a declined or cancelled order has let the spot go. Everything else
 * — from awaiting the publisher through completed — is a flight somebody
 * has committed to, and the spot is booked for it. The server's own rule
 * (`slotHoldingOrdersWhere`) is what put an order on a row; this is kept
 * so a row the server hands over is still read the same way here.
 */
const NOT_BOOKED: readonly OrderStatus[] = ["DRAFT", "PUBLISHER_REJECTED", "AGENT_REJECTED", "CANCELLED"];

export const isBooked = (order: Pick<CalendarOrder, "status">): boolean => !NOT_BOOKED.includes(order.status);

export interface CalendarBar {
    orderId: string;
    label: string;
    /** 1-based column the bar starts in, after clipping to the window. */
    from: number;
    /** 1-based column the bar ends in, inclusive. */
    to: number;
    /** Which sub-row of the site the bar sits in, so overlapping flights stack rather than hide. */
    lane: number;
    status: OrderStatus;
}

export interface CalendarRow {
    /** The listing's id — the grouping key. */
    key: string;
    listingId: string;
    site: string;
    city: string | null;
    category: string;
    /** How many advertisers the spot carries at once: 1 for a static wall, a screen's loop above it. */
    slotsTotal: number;
    bars: CalendarBar[];
    lanes: number;
}

/**
 * The days an order occupies: its flight when it has one, the install day
 * when only a slot is agreed, nothing when neither is known. Half-open
 * `[from, to)` in whole days from the window's first column.
 */
function occupancy(order: CalendarOrder, window: CalendarWindow): { from: number; to: number } | null {
    const startMs = window.start.getTime();
    const dayIndex = (iso: string) => Math.floor((Date.parse(iso) - startMs) / DAY_MS);
    if (order.from && order.to) {
        return { from: dayIndex(order.from), to: dayIndex(order.to) + 1 };
    }
    if (order.from) return { from: dayIndex(order.from), to: dayIndex(order.from) + 1 };
    if (order.slot) return { from: dayIndex(order.slot), to: dayIndex(order.slot) + 1 };
    return null;
}

/** The bar's caption: the campaign's name, its reference, or the order id. */
export function barLabel(order: CalendarOrder): string {
    return order.campaign.name ?? order.campaign.reference ?? order.id;
}

/**
 * The calendar's sites folded into one row each, in the order the server
 * listed them, with a Booked bar per order that touches the window, clipped
 * to it, and stacked into lanes where flights overlap. A site with nothing
 * in the window is still a row — the read is listings-first, so an empty
 * row is the server saying the site has nothing booked, not the console
 * guessing.
 */
export function calendarRows(sites: CalendarSite[], window: CalendarWindow): CalendarRow[] {
    return sites.map((site) => {
        const row: CalendarRow = {
            key: site.listing.id,
            listingId: site.listing.id,
            site: site.listing.title,
            city: site.listing.city,
            category: site.listing.category,
            slotsTotal: site.listing.slotsTotal ?? 1,
            bars: [],
            lanes: 1,
        };
        for (const order of site.orders) {
            if (!isBooked(order)) continue;
            const span = occupancy(order, window);
            if (!span || span.to <= 0 || span.from >= window.days) continue;
            row.bars.push({
                orderId: order.id,
                label: barLabel(order),
                from: Math.max(0, span.from) + 1,
                to: Math.min(window.days, span.to),
                lane: 0,
                status: order.status,
            });
        }
        row.bars.sort((a, b) => a.from - b.from || a.to - b.to);
        const laneEnds: number[] = [];
        for (const bar of row.bars) {
            let lane = laneEnds.findIndex((end) => end < bar.from);
            if (lane === -1) {
                lane = laneEnds.length;
                laneEnds.push(bar.to);
            } else {
                laneEnds[lane] = bar.to;
            }
            bar.lane = lane;
        }
        row.lanes = Math.max(1, laneEnds.length);
        return row;
    });
}
