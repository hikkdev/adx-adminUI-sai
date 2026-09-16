import { describe, expect, it } from "vitest";
import type { CalendarOrder, CalendarSite } from "@/services/orders";
import { barLabel, calendarRows, isBooked, shiftAnchor, windowFor, windowLabel } from "./calendar-window";

/**
 * D11 — the booking calendar's arithmetic, over Lot G's listings-first read.
 *
 * DECISION 17: nothing records a Hold or a Block, so the gantt draws Booked
 * bars from orders and nothing else. What this pins: the window's columns,
 * which orders count as booked, a flight clipped to the window, a slot-only
 * order drawn as one day, an order with no dates drawn nowhere, two flights
 * on one site stacking into lanes rather than hiding each other, and — the
 * point of the listings-first shape — a site with nothing booked still
 * being a row.
 */

const order = (over: Partial<CalendarOrder> = {}): CalendarOrder => ({
    id: "ord_1",
    status: "SLOT_CONFIRMED",
    campaign: { id: "cmp_1", reference: "ADX-CMP-0001", name: "Diwali push" },
    from: "2026-09-08",
    to: "2026-09-10",
    slot: null,
    ...over,
});

const site = (orders: CalendarOrder[], over: Partial<CalendarSite["listing"]> = {}): CalendarSite => ({
    listing: { id: "lst_mg", displayId: "ADX-LST-0001", title: "MG Road Billboard", city: "Bengaluru", category: "OUTDOOR", slotsTotal: 1, ...over },
    orders,
});

describe("the window", () => {
    it("starts a week on the Monday of the anchor's week and runs seven days", () => {
        // 11 September 2026 is a Friday.
        const window = windowFor("2026-09-11", "WEEK");
        expect(window.columns.map((column) => column.key)[0]).toBe("2026-09-07");
        expect(window.days).toBe(7);
        expect(window.columns.map((column) => column.weekday)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
        expect(window.columns.filter((column) => column.weekend).map((column) => column.date)).toEqual(["12", "13"]);
    });

    it("runs a fortnight from the same Monday, and a month from the first for as many days as it has", () => {
        expect(windowFor("2026-09-11", "FORTNIGHT").days).toBe(14);
        const month = windowFor("2026-09-11", "MONTH");
        expect(month.columns[0].key).toBe("2026-09-01");
        expect(month.days).toBe(30);
        expect(windowFor("2026-02-10", "MONTH").days).toBe(28);
    });

    it("shifts by the window's own length", () => {
        expect(shiftAnchor("2026-09-11", "WEEK", 1)).toBe("2026-09-18");
        expect(shiftAnchor("2026-09-11", "FORTNIGHT", -1)).toBe("2026-08-28");
        expect(shiftAnchor("2026-09-11", "MONTH", 1)).toBe("2026-10-01");
    });

    it("labels the window by its first and last day", () => {
        expect(windowLabel(windowFor("2026-09-11", "WEEK"))).toBe("7 Sept to 13 Sept 2026");
    });
});

describe("which orders book a spot", () => {
    it("counts everything from awaiting the publisher to completed, and not a draft or a stopped order", () => {
        expect(isBooked(order({ status: "PENDING_PUBLISHER" }))).toBe(true);
        expect(isBooked(order({ status: "COMPLETED" }))).toBe(true);
        expect(isBooked(order({ status: "DRAFT" }))).toBe(false);
        expect(isBooked(order({ status: "CANCELLED" }))).toBe(false);
        expect(isBooked(order({ status: "PUBLISHER_REJECTED" }))).toBe(false);
        expect(isBooked(order({ status: "AGENT_REJECTED" }))).toBe(false);
    });
});

describe("the rows", () => {
    const window = windowFor("2026-09-11", "WEEK"); // 7–13 September

    it("draws a flight as one Booked bar over its days, 1-based, and carries the site's category and slots", () => {
        const rows = calendarRows([site([order()], { slotsTotal: 6, category: "INDOOR" })], window);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ key: "lst_mg", listingId: "lst_mg", site: "MG Road Billboard", city: "Bengaluru", category: "INDOOR", slotsTotal: 6 });
        expect(rows[0].bars).toEqual([
            { orderId: "ord_1", label: "Diwali push", from: 2, to: 4, lane: 0, status: "SLOT_CONFIRMED" },
        ]);
    });

    it("keeps a site with nothing booked as an empty row, in the server's order", () => {
        const rows = calendarRows(
            [site([], { id: "lst_quiet", title: "Quiet wall" }), site([order()])],
            window,
        );
        expect(rows.map((row) => [row.key, row.bars.length, row.lanes])).toEqual([
            ["lst_quiet", 0, 1],
            ["lst_mg", 1, 1],
        ]);
    });

    it("clips a flight that runs past either edge, and drops one that never touches the window", () => {
        const rows = calendarRows(
            [
                site([
                    order({ id: "long", from: "2026-08-20", to: "2026-10-01" }),
                    order({ id: "gone", from: "2026-09-20", to: "2026-09-25" }),
                ]),
            ],
            window,
        );
        expect(rows[0].bars).toHaveLength(1);
        expect(rows[0].bars[0]).toMatchObject({ orderId: "long", from: 1, to: 7 });
    });

    it("draws a slot-only order on its install day, and an order with no dates nowhere", () => {
        const rows = calendarRows(
            [
                site([
                    order({ id: "slot", from: null, to: null, slot: "2026-09-09T10:30:00+05:30" }),
                    order({ id: "nothing", from: null, to: null, slot: null }),
                ]),
            ],
            window,
        );
        expect(rows[0].bars).toHaveLength(1);
        expect(rows[0].bars[0]).toMatchObject({ orderId: "slot", from: 3, to: 3 });
    });

    it("stacks two flights on one site into lanes rather than drawing one over the other", () => {
        const rows = calendarRows(
            [
                site([
                    order({ id: "a", from: "2026-09-07", to: "2026-09-09" }),
                    order({ id: "b", campaign: { id: null, reference: null, name: "Cashback" }, from: "2026-09-09", to: "2026-09-11" }),
                    order({ id: "c", campaign: { id: null, reference: null, name: "Later" }, from: "2026-09-12", to: "2026-09-13" }),
                ]),
            ],
            window,
        );
        expect(rows[0].lanes).toBe(2);
        expect(rows[0].bars.map((bar) => [bar.orderId, bar.lane])).toEqual([
            ["a", 0],
            ["b", 1],
            ["c", 0],
        ]);
    });

    it("captions a bar by the campaign's name, then its reference, then the order id", () => {
        expect(barLabel(order())).toBe("Diwali push");
        expect(barLabel(order({ campaign: { id: "c", reference: "ADX-CMP-0009", name: null } }))).toBe("ADX-CMP-0009");
        expect(barLabel(order({ campaign: { id: null, reference: null, name: null } }))).toBe("ord_1");
    });

    it("leaves a cancelled order off the calendar: the site stays a row, and it is available", () => {
        const rows = calendarRows([site([order({ status: "CANCELLED" })])], window);
        expect(rows).toHaveLength(1);
        expect(rows[0].bars).toEqual([]);
    });
});
