import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

/**
 * D11 — the bookings board, live.
 *
 * The screen used to draw six seeded `BKG-*` rows with a status vocabulary
 * no order has. What this pins: the table over the order contract — the
 * columns with a source drawn, the two without one (advertiser, publisher)
 * gone — the chips counting from the server's histogram, the sort and the
 * pager being the server's, and a row opening the order.
 */

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({
    useRouter: () => router,
    usePathname: () => "/bookings",
    useSearchParams: () => new URLSearchParams(),
}));

import { pageOrders } from "@/services/orders";
import type { Order } from "@/types";
import { BookingsTable, flightLabel } from "./bookings-table";

beforeEach(() => {
    router.push.mockReset();
});

const page = {
    items: [
        {
            id: "cmz_order_1",
            status: "SLOT_CONFIRMED" as const,
            listing: "MG Road Billboard",
            listingId: "lst_mg",
            city: "Bengaluru",
            campaignName: "Diwali push",
            agent: "Ravi Kumar",
            agentId: "agt_1",
            budget: 240000,
            startDate: "2026-05-01",
            endDate: "2026-05-31",
            slotTime: "2026-04-25T14:00:00+05:30",
            createdAt: "2026-04-24T10:00:00+05:30",
        },
        {
            id: "cmz_order_2",
            status: "PENDING_PUBLISHER" as const,
            listing: "Phoenix Atrium 3F",
            listingId: "lst_px",
            city: "Mumbai",
            campaignName: null,
            agent: null,
            agentId: null,
            budget: null,
            startDate: null,
            endDate: null,
            slotTime: null,
            createdAt: "2026-04-23T10:00:00+05:30",
        },
    ],
    total: 52,
    page: 2,
    pageSize: 25,
    counts: { SLOT_CONFIRMED: 30, PENDING_PUBLISHER: 22, COMPLETED: 0 },
};

function mount(over: Partial<React.ComponentProps<typeof BookingsTable>> = {}) {
    const props = {
        page,
        q: "",
        onQChange: vi.fn(),
        status: "ALL" as const,
        onStatusChange: vi.fn(),
        sort: "NEWEST" as const,
        onSortChange: vi.fn(),
        pageNumber: 2,
        onPageChange: vi.fn(),
        pageSize: 25,
        live: true,
        ...over,
    };
    render(<BookingsTable {...props} />);
    return props;
}

const rowOf = (text: string) => within(screen.getByText(text).closest("tr")!);

describe("what the table draws", () => {
    it("prints the site, the campaign, the agent, the value, the flight, the slot and the status", () => {
        mount();
        const row = rowOf("MG Road Billboard");
        expect(row.getByText("Diwali push")).toBeInTheDocument();
        expect(row.getByText("Ravi Kumar")).toBeInTheDocument();
        expect(row.getByText("₹2,40,000")).toBeInTheDocument();
        expect(row.getByText("1 May 2026 to 31 May 2026")).toBeInTheDocument();
        expect(row.getByText("Slot confirmed")).toBeInTheDocument();
    });

    it("draws absence as a dash or a word, never as zero or blank", () => {
        mount();
        const row = rowOf("Phoenix Atrium 3F");
        expect(row.getByText("Unassigned")).toBeInTheDocument();
        expect(row.getAllByText("—").length).toBeGreaterThanOrEqual(3);
        expect(row.queryByText("₹0")).not.toBeInTheDocument();
    });

    it("has no Advertiser or Publisher column: neither is on the order the API sends", () => {
        mount();
        expect(screen.queryByRole("columnheader", { name: "Advertiser" })).not.toBeInTheDocument();
        expect(screen.queryByRole("columnheader", { name: "Publisher" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Export CSV/ })).not.toBeInTheDocument();
    });

    it("opens the order when a row is clicked", () => {
        mount();
        fireEvent.click(screen.getByText("MG Road Billboard"));
        expect(router.push).toHaveBeenCalledWith("/orders/cmz_order_1");
    });
});

describe("the S7 surface", () => {
    it("counts the chips from the server's histogram, All being their sum, and hides statuses with nothing behind them", () => {
        const props = mount();
        const all = screen.getByRole("tab", { name: /All/ });
        expect(within(all).getByText("52")).toBeInTheDocument();
        expect(within(screen.getByRole("tab", { name: /Slot confirmed/ })).getByText("30")).toBeInTheDocument();
        expect(screen.queryByRole("tab", { name: /Completed/ })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("tab", { name: /Awaiting publisher/ }));
        expect(props.onStatusChange).toHaveBeenCalledWith("PENDING_PUBLISHER");
    });

    it("sends the search up rather than filtering the page it holds", () => {
        const props = mount();
        fireEvent.change(screen.getByLabelText("Search bookings"), { target: { value: "Diwali" } });
        expect(props.onQChange).toHaveBeenCalledWith("Diwali");
        // Both rows still drawn: the page is the server's to cut.
        expect(screen.getByText("Phoenix Atrium 3F")).toBeInTheDocument();
    });

    it("walks the server's pages and says where it is", () => {
        const props = mount();
        expect(screen.getByText("26-50 of 52")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Next" }));
        expect(props.onPageChange).toHaveBeenCalledWith(3);
        fireEvent.click(screen.getByRole("button", { name: "Previous" }));
        expect(props.onPageChange).toHaveBeenCalledWith(1);
    });

    it("disables Next on the last page", () => {
        mount({ pageNumber: 3 });
        expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    });
});

describe("flightLabel", () => {
    it("prints both ends, one end, or a dash", () => {
        expect(flightLabel({ startDate: "2026-05-01", endDate: "2026-05-31" })).toBe("1 May 2026 to 31 May 2026");
        expect(flightLabel({ startDate: "2026-05-01", endDate: null })).toBe("From 1 May 2026");
        expect(flightLabel({ startDate: null, endDate: "2026-05-31" })).toBe("Until 31 May 2026");
        expect(flightLabel({ startDate: null, endDate: null })).toBe("—");
    });
});

/**
 * `pageOrders` is the client-side fold of the list contract — the same
 * counts, paging and search the server does, over rows already in hand.
 * The seeded orders it used to be tested against are gone (CE4); these
 * rows are built here, which is where a test's data belongs.
 */
describe("the client-side fold speaks the list contract", () => {
    const rows: Order[] = Array.from({ length: 12 }, (_, index) => ({
        ...page.items[index % 2],
        id: `cmz_order_${index + 1}`,
        status: index % 3 === 0 ? ("CANCELLED" as const) : page.items[index % 2].status,
        listing: index % 2 === 0 ? `MG Road Billboard ${index + 1}` : `Phoenix Atrium ${index + 1}`,
        createdAt: `2026-04-${String(24 - index).padStart(2, "0")}T10:00:00+05:30`,
    }));

    it("counts the chips without the status facet, and pages the sorted rows", () => {
        const all = pageOrders(rows, { pageSize: 5 });
        expect(all.items).toHaveLength(5);
        expect(all.total).toBe(rows.length);
        const cancelled = pageOrders(rows, { status: ["CANCELLED"], pageSize: 5 });
        // The histogram is the same whichever chip is in force.
        expect(cancelled.counts).toEqual(all.counts);
        expect(cancelled.items.every((order) => order.status === "CANCELLED")).toBe(true);
        expect(cancelled.total).toBe(all.counts.CANCELLED);

        const second = pageOrders(rows, { pageSize: 5, page: 2 });
        expect(second.items[0].id).toBe(pageOrders(rows, { pageSize: 10 }).items[5].id);
    });

    it("searches the fields the server searches", () => {
        const hits = pageOrders(rows, { q: "mg road" });
        expect(hits.items.length).toBeGreaterThan(0);
        expect(hits.items.every((order) => order.listing.toLowerCase().includes("mg road"))).toBe(true);
    });
});
