import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Order screening on the order page (2 Oct 2026): the "Held — fraud
 * review" banner, and the card — score and band, every signal in plain
 * words with its side, who held or cleared it, the fraud case — with its
 * moves at the top right, offered by the order's state and gated on the
 * permission.
 */

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/orders/ord_1" }));

const auth = vi.hoisted(() => ({ value: null as null | { can: (permission: string) => boolean } }));
vi.mock("@/lib/auth", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/auth")>()),
    useOptionalAuth: () => auth.value,
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, isLive: () => true };
});

import { orderScreeningService } from "@/services/order-screening";
import type { Order, OrderScreening } from "@/types";
import { HeldBanner, OrderScreeningCard } from "./order-screening-card";

beforeEach(() => {
    auth.value = null;
    vi.restoreAllMocks();
});

const screening = (over: Partial<OrderScreening> = {}): OrderScreening => ({
    score: 0.84,
    band: "HOLD",
    signals: [
        { key: "PAYMENT_TROUBLE", weight: 0.3, value: 1, detail: "Two failed attempts before the card went through", side: "ORDER" },
        { key: "SHARED_DEVICE", weight: 0.2, value: 1, detail: "Same phone as publisher PUB-0110-2601", side: "ADVERTISER" },
        { key: "SHARED_PAN", weight: 0.35, value: 0, detail: "none", side: "PUBLISHER" },
    ],
    scoredAt: "2026-10-02T10:01:00+05:30",
    reviewStatus: "FLAGGED",
    reviewedById: null,
    reviewedByName: null,
    reviewedAt: null,
    reviewNote: null,
    clearedSignalKeys: ["ADVERTISER:SHARED_DEVICE"],
    heldAt: null,
    heldById: null,
    heldByName: null,
    holdReason: null,
    fraudCaseId: null,
    ...over,
});

const order = (over: Partial<OrderScreening> = {}, rest: Partial<Order> = {}): Order => ({
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
    screening: screening(over),
    ...rest,
});

describe("the held banner", () => {
    it("is drawn only while the order is held, naming who held it and why", () => {
        const { rerender } = render(<HeldBanner screening={screening()} />);
        expect(screen.queryByTestId("order-held-banner")).not.toBeInTheDocument();
        rerender(<HeldBanner screening={screening({ heldAt: "2026-10-02T11:00:00+05:30", heldById: "usr_1", heldByName: "Asha", holdReason: "Card under chargeback" })} />);
        const banner = screen.getByTestId("order-held-banner");
        expect(banner).toHaveTextContent("Held — fraud review");
        expect(banner).toHaveTextContent("by Asha");
        expect(banner).toHaveTextContent("Card under chargeback");
    });

    it("says an automatic hold was automatic", () => {
        render(<HeldBanner screening={screening({ heldAt: "2026-10-02T11:00:00+05:30", heldById: null })} />);
        expect(screen.getByTestId("order-held-banner")).toHaveTextContent("Held automatically");
    });
});

describe("the screening card", () => {
    it("draws nothing when the read carries no screening", () => {
        render(<OrderScreeningCard order={{ ...order(), screening: null }} />);
        expect(screen.queryByTestId("order-screening")).not.toBeInTheDocument();
    });

    it("prints the score, the band, the review and every found signal with its side", () => {
        render(<OrderScreeningCard order={order()} />);
        expect(screen.getByTestId("screening-score")).toHaveTextContent("84");
        expect(screen.getByText("High")).toBeInTheDocument();
        expect(screen.getByText("Flagged")).toBeInTheDocument();
        const signals = screen.getByTestId("screening-signals");
        const rows = within(signals).getAllByRole("listitem");
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveTextContent("Payment trouble");
        expect(rows[0]).toHaveTextContent("Order");
        expect(rows[0]).toHaveTextContent("Two failed attempts before the card went through");
        expect(rows[1]).toHaveTextContent("Same phone as another account");
        expect(rows[1]).toHaveTextContent("Advertiser");
        expect(rows[1]).toHaveTextContent("Cleared before");
    });

    it("offers Hold, Clear, Cancel as fraud and Rescore at the top right of a flagged order — off without the permission", () => {
        render(<OrderScreeningCard order={order()} />);
        for (const id of ["screening-hold", "screening-clear", "screening-confirm-fraud", "screening-rescore"]) expect(screen.getByTestId(id)).toBeDisabled();
        expect(screen.queryByTestId("screening-release")).not.toBeInTheDocument();
    });

    it("offers Release in place of Hold on a held order", () => {
        auth.value = { can: () => true };
        render(<OrderScreeningCard order={order({ heldAt: "2026-10-02T11:00:00+05:30" })} />);
        expect(screen.getByTestId("screening-release")).toBeEnabled();
        expect(screen.queryByTestId("screening-hold")).not.toBeInTheDocument();
    });

    it("offers nothing but the case on a confirmed order", () => {
        auth.value = { can: () => true };
        render(<OrderScreeningCard order={order({ reviewStatus: "CONFIRMED_FRAUD", fraudCaseId: "fc_1" }, { status: "CANCELLED" })} />);
        for (const id of ["screening-hold", "screening-release", "screening-clear", "screening-confirm-fraud", "screening-rescore"]) expect(screen.queryByTestId(id)).not.toBeInTheDocument();
        expect(screen.getByTestId("screening-case-link")).toHaveAttribute("href", "/disputes/fraud?case=fc_1");
    });

    it("holds with a reason through the single route and reloads the page", async () => {
        auth.value = { can: () => true };
        const hold = vi.spyOn(orderScreeningService, "hold").mockResolvedValue({});
        const onChanged = vi.fn();
        render(<OrderScreeningCard order={order()} onChanged={onChanged} />);
        fireEvent.click(screen.getByTestId("screening-hold"));
        fireEvent.change(await screen.findByLabelText("Reason"), { target: { value: "Card under chargeback" } });
        fireEvent.click(screen.getByRole("button", { name: "Hold" }));
        await waitFor(() => expect(hold).toHaveBeenCalledWith("ord_1", "Card under chargeback"));
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
    });

    it("rescores and reloads", async () => {
        auth.value = { can: () => true };
        const rescore = vi.spyOn(orderScreeningService, "rescore").mockResolvedValue({});
        const onChanged = vi.fn();
        render(<OrderScreeningCard order={order()} onChanged={onChanged} />);
        fireEvent.click(screen.getByTestId("screening-rescore"));
        await waitFor(() => expect(rescore).toHaveBeenCalledWith("ord_1"));
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
    });
});
