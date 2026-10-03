import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * OM-1 — the orders list, formerly the bookings board.
 *
 * What this pins: the table over the order contract — the columns with a
 * source drawn, the two without one (advertiser, publisher) gone — the
 * chips counting from the server's histogram, the sort and the pager being
 * the server's, a row opening the order, and the campaign linking up to its
 * page now that the row carries its id.
 */

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({
    useRouter: () => router,
    usePathname: () => "/orders",
    useSearchParams: () => new URLSearchParams(),
}));

/* Order screening: the bulk hold is behind the fraud desk's edit permission, read off the session when there is one. */
const auth = vi.hoisted(() => ({ value: null as null | { can: (permission: string) => boolean } }));
vi.mock("@/lib/auth", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/auth")>()),
    useOptionalAuth: () => auth.value,
}));

import { flightLabel, formatDateTime } from "@/lib/format";
import { orderScreeningService } from "@/services/order-screening";
import { pageOrders } from "@/services/orders";
import type { Order } from "@/types";
import { OrdersTable } from "./orders-table";

beforeEach(() => {
    router.push.mockReset();
    auth.value = null;
    vi.restoreAllMocks();
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
            campaignId: "cmp_diwali",
            agent: "Ravi Kumar",
            agentId: "agt_1",
            budget: 240000,
            startDate: "2026-05-01",
            endDate: "2026-05-31",
            slotTime: "2026-04-25T14:00:00+05:30",
            createdAt: "2026-04-24T10:00:00+05:30",
            placedBy: {
                userId: "usr_asha",
                name: "Asha Rao",
                displayId: "ADX-2404-2601",
                business: { id: "adv_rao", name: "Rao Sweets", displayId: "ADV-2404-2601" },
            },
        },
        {
            id: "cmz_order_2",
            status: "PENDING_PUBLISHER" as const,
            listing: "Phoenix Atrium 3F",
            listingId: "lst_px",
            city: "Mumbai",
            campaignName: null,
            campaignId: null,
            agent: null,
            agentId: null,
            budget: null,
            startDate: null,
            endDate: null,
            slotTime: null,
            createdAt: "2026-04-23T10:00:00+05:30",
            placedBy: { userId: "usr_vik", name: "Vikram Shah", displayId: "ADX-2304-2601", business: null },
        },
    ],
    total: 52,
    page: 2,
    pageSize: 25,
    counts: { SLOT_CONFIRMED: 30, PENDING_PUBLISHER: 22, COMPLETED: 0 },
};

function mount(over: Partial<React.ComponentProps<typeof OrdersTable>> = {}) {
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
    render(<OrdersTable {...props} />);
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
        expect(row.getByText("1 May – 31 May 2026")).toBeInTheDocument();
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
    });

    it("opens the order when a row is clicked", () => {
        mount();
        fireEvent.click(screen.getByText("MG Road Billboard"));
        expect(router.push).toHaveBeenCalledWith("/orders/cmz_order_1");
    });

    it("says how many are still open in the heading, from the server's counts", () => {
        mount();
        expect(screen.getByText(/52 still open · 52 orders/)).toBeInTheDocument();
    });
});

/* OM-1: the cross-link Orders never had. An order raised from a campaign
   links to it; one placed straight onto a listing has nothing to link to. */
describe("the campaign column", () => {
    it("links to the campaign when the order came from one", () => {
        mount();
        const link = rowOf("MG Road Billboard").getByTestId("order-campaign-link");
        expect(link).toHaveAttribute("href", "/campaigns/cmp_diwali");
        expect(link).toHaveTextContent("Diwali push");
    });

    it("does not open the order when the campaign link is clicked", () => {
        mount();
        fireEvent.click(rowOf("MG Road Billboard").getByTestId("order-campaign-link"));
        expect(router.push).not.toHaveBeenCalledWith("/orders/cmz_order_1");
    });

    it("prints a dash, not a link, for an order with no campaign", () => {
        mount();
        expect(rowOf("Phoenix Atrium 3F").queryByTestId("order-campaign-link")).not.toBeInTheDocument();
    });
});

/* PB-1 (the owner, 2 Oct 2026): "who placed the order or what business, also date and time". */
describe("who placed it, and when", () => {
    it("draws the order with when it was placed in one column, then Placed by", () => {
        mount();
        // The first header is the selection checkbox (order screening's bulk hold); the named columns follow it.
        expect(within(screen.getAllByRole("columnheader")[0]!).getByLabelText("Select all rows")).toBeInTheDocument();
        const headers = screen
            .getAllByRole("columnheader")
            .map((cell) => cell.textContent?.trim())
            .filter(Boolean);
        expect(headers.slice(0, 2)).toEqual(["Order · placed", "Placed by"]);
        // The install slot is in the Columns menu, off until asked for.
        expect(headers).not.toContain("Install slot");
    });

    it("leads with the business, ADV- id and the person beneath, linking to the advertiser", () => {
        mount();
        const cell = rowOf("MG Road Billboard").getByTestId("order-placed-by");
        expect(cell).toHaveAttribute("href", "/advertisers/adv_rao");
        expect(within(cell).getByText("Rao Sweets")).toBeInTheDocument();
        expect(within(cell).getByText("ADV-2404-2601 · Asha Rao")).toBeInTheDocument();
    });

    it("falls back to the person and their ADX- id, linking to the user, when there is no business", () => {
        mount();
        const cell = rowOf("Phoenix Atrium 3F").getByTestId("order-placed-by");
        expect(cell).toHaveAttribute("href", "/users/usr_vik");
        expect(within(cell).getByText("Vikram Shah")).toBeInTheDocument();
        expect(within(cell).getByText("ADX-2304-2601")).toBeInTheDocument();
    });

    it("does not open the order when the Placed by link is clicked", () => {
        mount();
        fireEvent.click(rowOf("MG Road Billboard").getByTestId("order-placed-by"));
        expect(router.push).not.toHaveBeenCalledWith("/orders/cmz_order_1");
    });

    it("prints a dash for a row that does not carry who placed it", () => {
        mount({ page: { ...page, items: [{ ...page.items[0], placedBy: null }] } });
        expect(screen.queryByTestId("order-placed-by")).not.toBeInTheDocument();
    });

    it("prints the date and time it was placed", () => {
        mount();
        expect(rowOf("MG Road Billboard").getByTestId("order-placed-on")).toHaveTextContent(formatDateTime("2026-04-24T10:00:00+05:30"));
    });

    it("sorts by Placed on through the server: newest first flips to oldest, and back", () => {
        const props = mount();
        fireEvent.click(screen.getByRole("button", { name: /Order · placed/ }));
        expect(props.onSortChange).toHaveBeenCalledWith("OLDEST");
        const oldest = mount({ sort: "OLDEST" });
        fireEvent.click(screen.getAllByRole("button", { name: /Order · placed/ }).at(-1)!);
        expect(oldest.onSortChange).toHaveBeenCalledWith("NEWEST");
    });

    it("offline, the search finds an order by the business, the ADV- id, the person and the ADX- id", () => {
        const rows = page.items as Order[];
        for (const q of ["rao sweets", "ADV-2404", "asha", "adx-2404-2601"]) {
            expect(pageOrders(rows, { q }).items.map((order) => order.id)).toEqual(["cmz_order_1"]);
        }
        expect(pageOrders(rows, { q: "vikram" }).items.map((order) => order.id)).toEqual(["cmz_order_2"]);
    });
});

describe("the list surface", () => {
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
        fireEvent.change(screen.getByLabelText("Search orders"), { target: { value: "Diwali" } });
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

/* Order screening (2 Oct 2026): a "Held" pill beside the status, and a bulk "Hold for review" over a selection. */
describe("held for review", () => {
    const held = {
        ...page.items[0],
        screening: {
            score: 0.84,
            band: "HOLD" as const,
            signals: [],
            scoredAt: null,
            reviewStatus: "FLAGGED" as const,
            reviewedById: null,
            reviewedByName: null,
            reviewedAt: null,
            reviewNote: null,
            clearedSignalKeys: [],
            heldAt: "2026-10-02T11:00:00+05:30",
            heldById: "usr_admin",
            heldByName: "Asha",
            holdReason: "Large first order",
            fraudCaseId: null,
        },
    };

    it("draws a Held pill beside the status of a held order, and none on the others", () => {
        mount({ page: { ...page, items: [held, page.items[1]] } });
        expect(rowOf("MG Road Billboard").getByTestId("order-held-pill")).toHaveTextContent("Held");
        expect(rowOf("MG Road Billboard").getByText("Slot confirmed")).toBeInTheDocument();
        expect(rowOf("Phoenix Atrium 3F").queryByTestId("order-held-pill")).not.toBeInTheDocument();
    });

    it("raises the bulk bar on a selection, with the hold off for a viewer without the permission", () => {
        mount();
        fireEvent.click(rowOf("MG Road Billboard").getByLabelText("Select row"));
        expect(screen.getByText("1 selected")).toBeInTheDocument();
        expect(screen.getByTestId("bulk-hold")).toBeDisabled();
    });

    it("holds the ticked orders with a reason through the bulk route, keeps the failure ticked and reloads", async () => {
        auth.value = { can: () => true };
        const bulk = vi.spyOn(orderScreeningService, "bulk").mockResolvedValue([
            { id: "cmz_order_1", ok: true },
            { id: "cmz_order_2", ok: false, code: "ORDER_COMPLETED", message: "This order has finished." },
        ]);
        const props = mount({ onChanged: vi.fn() });
        fireEvent.click(screen.getByLabelText("Select all rows"));
        fireEvent.click(screen.getByTestId("bulk-hold"));

        const confirm = await screen.findByRole("button", { name: "Hold 2 orders" });
        expect(confirm).toBeDisabled();
        fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Same card on both" } });
        fireEvent.click(confirm);

        await waitFor(() => expect(props.onChanged).toHaveBeenCalled());
        expect(bulk).toHaveBeenCalledWith("HOLD", ["cmz_order_1", "cmz_order_2"], "Same card on both");
        expect(screen.getByText("1 selected")).toBeInTheDocument();
        expect(rowOf("Phoenix Atrium 3F").getByLabelText("Select row")).toBeChecked();
    });
});

describe("flightLabel (shared with campaigns, @/lib/format)", () => {
    it("prints both ends, one end, or a dash", () => {
        expect(flightLabel({ startDate: "2026-05-01", endDate: "2026-05-31" })).toBe("1 May – 31 May 2026");
        expect(flightLabel({ startDate: "2026-12-20", endDate: "2027-01-10" })).toBe("20 Dec 2026 – 10 Jan 2027");
        expect(flightLabel({ startDate: "2026-05-01", endDate: null })).toBe("From 1 May 2026");
        expect(flightLabel({ startDate: null, endDate: "2026-05-31" })).toBe("Until 31 May 2026");
        expect(flightLabel({ startDate: null, endDate: null })).toBe("—");
        /* A campaign draft says so in words. */
        expect(flightLabel({ startDate: null, endDate: null }, "Not scheduled")).toBe("Not scheduled");
    });
});

/**
 * `pageOrders` is the client-side fold of the list contract — the same
 * counts, paging and search the server does, over rows already in hand.
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
