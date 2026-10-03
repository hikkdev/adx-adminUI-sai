import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Orders › Fraud review (order screening, 2 Oct 2026).
 *
 * What this pins: the one table layout (the list's own columns first, then
 * Risk, Why and the review Status), the watch-mode notice while automatic
 * holds are off, the Status select with the server's counts, the rosters'
 * row menu with its moves gated on permission and on the order's state, a
 * row opening the order, and the bulk bar — per-order results, failures
 * still ticked, Cancel as fraud showing the summed money first and needing
 * a reason.
 */

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
    useRouter: () => router,
    usePathname: () => "/orders/fraud-review",
    useSearchParams: () => new URLSearchParams(),
}));

const auth = vi.hoisted(() => ({ value: null as null | { can: (permission: string) => boolean } }));
vi.mock("@/lib/auth", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/auth")>()),
    useOptionalAuth: () => auth.value,
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, isLive: () => true };
});

import { orderScreeningService, type ReviewPage } from "@/services/order-screening";
import type { Order, OrderScreening } from "@/types";
import { FraudReviewTable, WATCH_MODE_NOTICE } from "./fraud-review-table";

beforeEach(() => {
    router.push.mockReset();
    auth.value = null;
    vi.restoreAllMocks();
});

const screening = (over: Partial<OrderScreening> = {}): OrderScreening => ({
    score: 0.72,
    band: "REVIEW",
    signals: [
        { key: "NEW_ACCOUNT_BIG_ORDER", weight: 0.35, value: 1, detail: "Account 2 days old, ₹2,40,000 order", side: "ADVERTISER" },
        { key: "ORDER_VELOCITY", weight: 0.3, value: 1, detail: "6 orders in 40 minutes", side: "ORDER" },
        { key: "LINKED_PARTIES", weight: 0.2, value: 1, detail: "Same device", side: "ORDER" },
        { key: "SHARED_PAN", weight: 0.35, value: 0, detail: "none", side: "PUBLISHER" },
    ],
    scoredAt: "2026-10-02T10:01:00+05:30",
    reviewStatus: "FLAGGED",
    reviewedById: null,
    reviewedByName: null,
    reviewedAt: null,
    reviewNote: null,
    clearedSignalKeys: [],
    heldAt: null,
    heldById: null,
    heldByName: null,
    holdReason: null,
    fraudCaseId: null,
    ...over,
});

const base: Order = {
    id: "ord_1",
    displayId: "BKG-0210-2601",
    status: "PENDING_PUBLISHER",
    listing: "MG Road Billboard",
    listingId: "lst_mg",
    city: "Bengaluru",
    campaignName: null,
    campaignId: null,
    agent: null,
    agentId: null,
    budget: 240000,
    startDate: null,
    endDate: null,
    slotTime: null,
    createdAt: "2026-10-02T10:00:00+05:30",
    placedBy: { userId: "usr_asha", name: "Asha Rao", displayId: "ADX-0210-2601", business: { id: "adv_rao", name: "Rao Sweets", displayId: "ADV-0210-2601" } },
    screening: screening(),
};

const flagged = base;
const held: Order = {
    ...base,
    id: "ord_2",
    displayId: "BKG-0210-2602",
    listing: "Phoenix Atrium 3F",
    budget: 90000,
    placedBy: { userId: "usr_vik", name: "Vikram Shah", displayId: "ADX-0210-2602", business: null },
    screening: screening({ score: 0.91, band: "HOLD", heldAt: "2026-10-02T11:00:00+05:30", heldById: "usr_admin", holdReason: "Same card as a chargeback" }),
};

const page: ReviewPage = { items: [flagged, held], total: 2, page: 1, pageSize: 25, counts: { FLAGGED: 3, HELD: 1, CLEARED: 4, CONFIRMED: 0, ALL: 8 } };

function mount(over: Partial<React.ComponentProps<typeof FraudReviewTable>> = {}) {
    const props = {
        page,
        q: "",
        onQChange: vi.fn(),
        status: "FLAGGED" as const,
        onStatusChange: vi.fn(),
        sort: "score" as const,
        onSortChange: vi.fn(),
        pageNumber: 1,
        onPageChange: vi.fn(),
        pageSize: 25,
        mode: { enabled: true, autoHold: false },
        onChanged: vi.fn(),
        ...over,
    };
    render(<FraudReviewTable {...props} />);
    return props;
}

const rowOf = (text: string) => within(screen.getByText(text).closest("tr")!);
const openMenu = async (text: string) => {
    fireEvent.keyDown(rowOf(text).getByRole("button", { name: "Row actions" }), { key: "ArrowDown" });
    return screen.findByTestId("roster-row-menu");
};
const items = (menu: HTMLElement) => within(menu).getAllByRole("menuitem");
const item = (menu: HTMLElement, name: string) => within(menu).getByRole("menuitem", { name });

describe("the layout", () => {
    it("draws the list's columns, then Risk, Why and Status — the order's own status one click away", () => {
        mount();
        const headers = screen
            .getAllByRole("columnheader")
            .map((cell) => cell.textContent?.trim())
            .filter(Boolean);
        expect(headers).toEqual(["Order · placed", "Placed by", "Site", "Value", "Risk", "Why", "Status", "Actions"]);
        expect(screen.getByRole("button", { name: "Columns" })).toBeInTheDocument();
    });

    it("prints the score 0–100 with its band, the top two reasons in plain words, and the review status", () => {
        mount();
        const row = rowOf("MG Road Billboard");
        expect(row.getByTestId("order-risk")).toHaveTextContent("72");
        expect(row.getByTestId("order-risk")).toHaveTextContent("Review");
        const why = row.getByTestId("order-why");
        expect(why).toHaveTextContent("New account, large order");
        expect(why).toHaveTextContent("Many orders in a short time");
        expect(why).toHaveTextContent("+1 more");
        expect(row.getByTestId("order-review-status")).toHaveTextContent("Flagged");
        expect(rowOf("Phoenix Atrium 3F").getByTestId("order-review-status")).toHaveTextContent("Held");
        expect(rowOf("Phoenix Atrium 3F").getByTestId("order-risk")).toHaveTextContent("High");
    });

    it("keeps the list's Placed by and booking id", () => {
        mount();
        expect(rowOf("MG Road Billboard").getByTestId("order-placed-by")).toHaveAttribute("href", "/advertisers/adv_rao");
        expect(rowOf("MG Road Billboard").getByTestId("order-label")).toHaveTextContent("BKG-0210-2601");
    });

    it("opens the order when a row is clicked", () => {
        mount();
        fireEvent.click(screen.getByText("MG Road Billboard"));
        expect(router.push).toHaveBeenCalledWith("/orders/ord_1");
    });

    it("puts the settings link at the top right", () => {
        mount();
        expect(screen.getByRole("link", { name: /Screening settings/ })).toHaveAttribute("href", "/settings/fraud");
    });

    it("reads the Status select's value with the server's count", () => {
        mount();
        expect(screen.getByTestId("roster-status")).toHaveTextContent("Flagged · 3");
    });

    it("says nothing is flagged in plain words when the queue is empty", () => {
        mount({ page: { ...page, items: [], total: 0 } });
        expect(screen.getByText("Nothing flagged")).toBeInTheDocument();
    });
});

describe("watch mode", () => {
    it("says so while automatic holds are off", () => {
        mount();
        expect(screen.getByTestId("watch-mode")).toHaveTextContent(WATCH_MODE_NOTICE);
    });

    it("says nothing once automatic holds are on, or when the settings could not be read", () => {
        mount({ mode: { enabled: true, autoHold: true } });
        expect(screen.queryByTestId("watch-mode")).not.toBeInTheDocument();
    });

    it("says screening is off when it is", () => {
        mount({ mode: { enabled: false, autoHold: false } });
        expect(screen.getByTestId("screening-off")).toBeInTheDocument();
        expect(screen.queryByTestId("watch-mode")).not.toBeInTheDocument();
    });
});

describe("the row menu", () => {
    it("lists the moves in the rosters' style, every one off without the permission", async () => {
        mount();
        const menu = await openMenu("MG Road Billboard");
        expect(within(menu).getByText("Actions")).toBeInTheDocument();
        expect(items(menu).map((entry) => entry.textContent)).toEqual([
            "View order",
            "Hold…",
            "Release",
            "Clear (not fraud)",
            "Cancel as fraud…",
            "Suspend advertiser…",
            "Open a fraud case",
        ]);
        expect(within(menu).getAllByRole("separator")).toHaveLength(2);
        for (const name of ["Hold…", "Clear (not fraud)", "Cancel as fraud…", "Suspend advertiser…", "Open a fraud case"]) expect(item(menu, name)).toHaveAttribute("data-disabled");
        expect(item(menu, "View order")).not.toHaveAttribute("data-disabled");
    });

    it("offers what the order can take: hold on a flagged order, release on a held one, no suspend without a business", async () => {
        auth.value = { can: () => true };
        mount();
        let menu = await openMenu("MG Road Billboard");
        expect(item(menu, "Hold…")).not.toHaveAttribute("data-disabled");
        expect(item(menu, "Release")).toHaveAttribute("data-disabled");
        expect(item(menu, "Suspend advertiser…")).not.toHaveAttribute("data-disabled");
        fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
        await waitFor(() => expect(screen.queryByTestId("roster-row-menu")).toBeNull());
        menu = await openMenu("Phoenix Atrium 3F");
        expect(item(menu, "Hold…")).toHaveAttribute("data-disabled");
        expect(item(menu, "Release")).not.toHaveAttribute("data-disabled");
        expect(item(menu, "Suspend advertiser…")).toHaveAttribute("data-disabled");
    });

    it("cancels as fraud only with the cancel permission too", async () => {
        auth.value = { can: (permission) => permission !== "marketplace.edit" };
        mount();
        expect(item(await openMenu("MG Road Billboard"), "Cancel as fraud…")).toHaveAttribute("data-disabled");
    });

    it("cancels one order as fraud: the impact first, a reason, then the single route", async () => {
        auth.value = { can: () => true };
        vi.spyOn(orderScreeningService, "cancelImpact").mockResolvedValue({
            cancellable: true,
            blockedReason: null,
            refund: { amount: "240000.00", to: "ADVERTISER_WALLET", note: "Unused days" },
            publisherReversal: { amount: "0.00", accruedToDate: "0.00", note: "Stays" },
            agentsReleased: 0,
            campaignEffects: [],
        });
        const confirm = vi.spyOn(orderScreeningService, "confirmFraud").mockResolvedValue({});
        const props = mount();
        fireEvent.click(item(await openMenu("MG Road Billboard"), "Cancel as fraud…"));
        expect(await screen.findByText("Cancel as fraud BKG-0210-2601?")).toBeInTheDocument();
        await waitFor(() => expect(screen.getByTestId("cancel-impact")).toHaveTextContent("₹2,40,000.00"));
        expect(screen.getByTestId("cancel-impact")).toHaveTextContent("to the advertiser's wallet");
        const button = screen.getByRole("button", { name: "Cancel as fraud" });
        expect(button).toBeDisabled();
        fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Stolen card" } });
        fireEvent.click(button);
        await waitFor(() => expect(confirm).toHaveBeenCalledWith("ord_1", "Stolen card"));
        await waitFor(() => expect(props.onChanged).toHaveBeenCalled());
    });

    it("shows the server's sentence for an order already live, and keeps the button off", async () => {
        auth.value = { can: () => true };
        const sentence = "The advertisement on this order is already up. Cancelling now would not undo what has run — raise a dispute on the order instead.";
        vi.spyOn(orderScreeningService, "cancelImpact").mockResolvedValue({ cancellable: false, blockedReason: sentence, refund: { amount: "0.00", to: "NONE" }, publisherReversal: { amount: "0.00", accruedToDate: "4000.00" }, agentsReleased: 0, campaignEffects: [] });
        mount({ page: { ...page, items: [{ ...flagged, status: "PENDING_OTP" }] } });
        fireEvent.click(item(await openMenu("MG Road Billboard"), "Cancel as fraud…"));
        await waitFor(() => expect(screen.getByTestId("cancel-blocked")).toHaveTextContent(sentence));
        fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Stolen card" } });
        expect(screen.getByRole("button", { name: "Cancel as fraud" })).toBeDisabled();
    });

    it("shows the server's sentence when the cancel itself is refused", async () => {
        auth.value = { can: () => true };
        const { ApiError } = await import("@/lib/api-client");
        const { toast } = await import("sonner");
        const error = vi.spyOn(toast, "error");
        vi.spyOn(orderScreeningService, "cancelImpact").mockResolvedValue({ cancellable: true, refund: { amount: "0", to: "NONE" }, publisherReversal: { amount: "0", accruedToDate: "0" }, agentsReleased: 0 });
        vi.spyOn(orderScreeningService, "confirmFraud").mockRejectedValue(new ApiError(409, "ORDER_LIVE", "The advertisement on this order is already up — raise a dispute instead."));
        mount();
        fireEvent.click(item(await openMenu("MG Road Billboard"), "Cancel as fraud…"));
        await waitFor(() => expect(screen.getByTestId("cancel-impact")).toHaveTextContent("Agents released"));
        fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Stolen card" } });
        fireEvent.click(screen.getByRole("button", { name: "Cancel as fraud" }));
        await waitFor(() => expect(error).toHaveBeenCalledWith("The advertisement on this order is already up — raise a dispute instead."));
    });

    it("goes straight to the fraud case the order is already on", async () => {
        auth.value = { can: () => true };
        mount({ page: { ...page, items: [{ ...flagged, screening: screening({ fraudCaseId: "fc_9" }) }] } });
        fireEvent.click(item(await openMenu("MG Road Billboard"), "Open fraud case"));
        expect(router.push).toHaveBeenCalledWith("/disputes/fraud?case=fc_9");
    });

    it("opens a fraud case and goes to it", async () => {
        auth.value = { can: () => true };
        const open = vi.spyOn(orderScreeningService, "openFraudCase").mockResolvedValue({ fraudCaseId: "fc_new" });
        mount();
        fireEvent.click(item(await openMenu("MG Road Billboard"), "Open a fraud case"));
        await waitFor(() => expect(router.push).toHaveBeenCalledWith("/disputes/fraud?case=fc_new"));
        expect(open).toHaveBeenCalledWith("ord_1");
    });
});

describe("the bulk bar", () => {
    const tickAll = () => fireEvent.click(screen.getByLabelText("Select all rows"));

    it("offers the four moves, each off without the permission", () => {
        mount();
        tickAll();
        expect(screen.getByText("2 selected")).toBeInTheDocument();
        for (const id of ["bulk-hold", "bulk-release", "bulk-clear", "bulk-confirm-fraud"]) expect(screen.getByTestId(id)).toBeDisabled();
        expect(screen.getByTestId("bulk-confirm-fraud")).toHaveTextContent("Cancel as fraud…");
    });

    it("plans the hold — the held order skipped and said so — and runs the rest", async () => {
        auth.value = { can: () => true };
        const hold = vi.spyOn(orderScreeningService, "hold").mockResolvedValue({});
        const props = mount();
        tickAll();
        fireEvent.click(screen.getByTestId("bulk-hold"));
        expect(await screen.findByText(/1 will be held, 1 skipped \(already held\)\./)).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Checking the card" } });
        fireEvent.click(screen.getByRole("button", { name: "Hold 1 order" }));
        await waitFor(() => expect(hold).toHaveBeenCalledWith("ord_1", "Checking the card"));
        await waitFor(() => expect(props.onChanged).toHaveBeenCalled());
    });

    it("cancels several as fraud with the summed money shown first, and keeps the failures ticked", async () => {
        auth.value = { can: () => true };
        vi.spyOn(orderScreeningService, "cancelImpact").mockImplementation(async (id) =>
            id === "ord_1"
                ? { cancellable: true, refund: { amount: "240000", to: "ADVERTISER_WALLET" }, publisherReversal: { amount: "1000", accruedToDate: "0" }, agentsReleased: 1 }
                : { cancellable: true, refund: { amount: "90000", to: "ADVERTISER_WALLET" }, publisherReversal: { amount: "500", accruedToDate: "0" }, agentsReleased: 0 },
        );
        const bulk = vi.spyOn(orderScreeningService, "bulk").mockResolvedValue([
            { id: "ord_1", ok: true },
            { id: "ord_2", ok: false, code: "ORDER_COMPLETED", message: "This order has finished — raise a dispute." },
        ]);
        const props = mount();
        tickAll();
        fireEvent.click(screen.getByTestId("bulk-confirm-fraud"));
        await waitFor(() => expect(screen.getByTestId("cancel-impact")).toHaveTextContent("₹3,30,000.00"));
        expect(screen.getByTestId("cancel-impact")).toHaveTextContent("₹1,500.00");
        expect(screen.getByTestId("cancel-impact")).toHaveTextContent("Agents released1");
        const button = screen.getByRole("button", { name: "Cancel as fraud 2 orders" });
        expect(button).toBeDisabled();
        fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Ring of stolen cards" } });
        fireEvent.click(button);
        await waitFor(() => expect(bulk).toHaveBeenCalledWith("CONFIRM_FRAUD", ["ord_1", "ord_2"], "Ring of stolen cards"));
        await waitFor(() => expect(props.onChanged).toHaveBeenCalled());
        expect(screen.getByText("1 selected")).toBeInTheDocument();
        expect(rowOf("Phoenix Atrium 3F").getByLabelText("Select row")).toBeChecked();
    });
});
