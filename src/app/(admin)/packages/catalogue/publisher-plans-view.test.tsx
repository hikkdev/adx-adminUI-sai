import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * The publisher plan editor. What this pins: every edit is one PATCH to the
 * tier's own route carrying the diff only — the price alone, or the whole
 * entitlements object with the one switch flipped — followed by the re-read;
 * the typed keys are drawn as the controls they are, with live chat named as
 * the one enforced; a retired plan says so.
 */

const { updatePlan } = vi.hoisted(() => ({ updatePlan: vi.fn() }));

vi.mock("@/services/revenue", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/revenue")>();
    return { ...actual, revenueService: { ...actual.revenueService, updatePlan } };
});

import type { PublisherPlan } from "@/services/revenue";
import { PublisherPlansView } from "./publisher-plans-view";

const plan = (over: Partial<PublisherPlan> = {}): PublisherPlan => ({
    id: "plan_2",
    tier: "PLUS",
    name: "Plus",
    pricePerMonth: "2499.00",
    ratePct: "0.1250",
    commissionPct: "12.5",
    description: "For growing publishers",
    isPopular: true,
    entitlements: { liveChat: true, prioritySupport: false, featuredListings: 1, analytics: "ADVANCED", bookingReportPdf: true, listingsPerMonth: 20 },
    enforcedKeys: ["liveChat"],
    active: true,
    sortOrder: 2,
    ...over,
});

beforeEach(() => {
    updatePlan.mockReset();
    updatePlan.mockResolvedValue(plan());
});

describe("what a card draws", () => {
    it("prints the price, the rate as a percentage, the typed controls and the free-form copy", () => {
        render(<PublisherPlansView plans={[plan()]} onChanged={vi.fn()} />);
        const card = within(screen.getByTestId("plan-card-PLUS"));
        expect(card.getByText("₹2,499.00")).toBeInTheDocument();
        expect(card.getByText("12.5%")).toBeInTheDocument();
        expect(card.getByText("Popular")).toBeInTheDocument();
        expect(card.getByRole("switch", { name: "Live chat on Plus" })).toBeChecked();
        expect(card.getByText("Enforced")).toBeInTheDocument();
        expect(card.getByRole("switch", { name: "Priority support on Plus" })).not.toBeChecked();
        expect(card.getByLabelText("Featured listings on Plus")).toHaveValue("1");
        expect(card.getByText("Listings per month")).toBeInTheDocument();
        expect(card.getByText("20")).toBeInTheDocument();
    });

    it("says a retired plan is off the shelf", () => {
        render(<PublisherPlansView plans={[plan({ active: false, isPopular: false })]} onChanged={vi.fn()} />);
        const card = within(screen.getByTestId("plan-card-PLUS"));
        expect(card.getByText("Inactive")).toBeInTheDocument();
        expect(card.getByText(/Retired: no new purchase or grant/)).toBeInTheDocument();
    });
});

describe("the editor's PATCH", () => {
    it("sends the price alone, then re-reads", async () => {
        const onChanged = vi.fn();
        render(<PublisherPlansView plans={[plan()]} onChanged={onChanged} />);
        fireEvent.click(screen.getByRole("button", { name: "Edit Plus price per month" }));
        const input = screen.getByLabelText("Plus price per month");
        fireEvent.change(input, { target: { value: "2999" } });
        fireEvent.click(screen.getByRole("button", { name: "Save Plus price per month" }));
        await waitFor(() => expect(updatePlan).toHaveBeenCalledTimes(1));
        expect(updatePlan).toHaveBeenCalledWith("PLUS", { pricePerMonth: "2999" });
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
    });

    it("sends the rate as the wire's fraction and nothing else", async () => {
        render(<PublisherPlansView plans={[plan()]} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Edit Plus commission rate" }));
        fireEvent.change(screen.getByLabelText("Plus commission rate"), { target: { value: "11.25" } });
        fireEvent.click(screen.getByRole("button", { name: "Save Plus commission rate" }));
        await waitFor(() => expect(updatePlan).toHaveBeenCalledWith("PLUS", { ratePct: "0.1125" }));
    });

    it("refuses a rate that is not a percentage in bounds", () => {
        render(<PublisherPlansView plans={[plan()]} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Edit Plus commission rate" }));
        fireEvent.change(screen.getByLabelText("Plus commission rate"), { target: { value: "120" } });
        expect(screen.getByRole("button", { name: "Save Plus commission rate" })).toBeDisabled();
    });

    it("flips one typed switch by sending the whole entitlements object, so the other promises are kept", async () => {
        render(<PublisherPlansView plans={[plan()]} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByRole("switch", { name: "Priority support on Plus" }));
        await waitFor(() => expect(updatePlan).toHaveBeenCalledTimes(1));
        expect(updatePlan).toHaveBeenCalledWith("PLUS", {
            entitlements: { liveChat: true, prioritySupport: true, featuredListings: 1, analytics: "ADVANCED", bookingReportPdf: true, listingsPerMonth: 20 },
        });
    });

    it("takes live chat away with an explicit false", async () => {
        render(<PublisherPlansView plans={[plan()]} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByRole("switch", { name: "Live chat on Plus" }));
        await waitFor(() => expect(updatePlan).toHaveBeenCalledTimes(1));
        expect(updatePlan.mock.calls[0][1].entitlements.liveChat).toBe(false);
    });

    it("sends the active flag alone when a plan is retired", async () => {
        render(<PublisherPlansView plans={[plan()]} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByRole("switch", { name: "Retire Plus" }));
        await waitFor(() => expect(updatePlan).toHaveBeenCalledWith("PLUS", { isActive: false }));
    });

    it("does not send a name and description that did not change", async () => {
        render(<PublisherPlansView plans={[plan()]} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: /Edit name & copy/ }));
        fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Plus+" } });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(updatePlan).toHaveBeenCalledWith("PLUS", { name: "Plus+" }));
    });
});
