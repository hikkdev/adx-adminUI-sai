import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * The grant dialog. What this pins: the price and the rate are prefilled
 * from the chosen plan — the first active one to begin with, then whichever
 * is picked — and stay editable; the grant is one POST carrying the figures
 * on screen, the rate as the wire's fraction, the end only when one was
 * typed; a fixed publisher is named rather than picked.
 */

const { grantSubscription, roster } = vi.hoisted(() => ({ grantSubscription: vi.fn(), roster: vi.fn() }));

vi.mock("@/services/revenue", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/revenue")>();
    return { ...actual, revenueService: { ...actual.revenueService, grantSubscription } };
});

vi.mock("@/services/supply", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/supply")>();
    return { ...actual, supplyService: { ...actual.supplyService, roster } };
});

import type { PublisherPlan } from "@/services/revenue";
import { GrantDialog, defaultTier, todayInput } from "./grant-dialog";

const plan = (over: Partial<PublisherPlan>): PublisherPlan => ({
    id: "plan",
    tier: "STANDARD",
    name: "Standard",
    pricePerMonth: "999.00",
    ratePct: "0.1400",
    commissionPct: "14",
    description: null,
    isPopular: false,
    entitlements: {},
    enforcedKeys: ["liveChat"],
    active: true,
    sortOrder: 1,
    ...over,
});

const plans = [
    plan({ id: "plan_1", tier: "STANDARD", name: "Standard", active: false }),
    plan({ id: "plan_2", tier: "PLUS", name: "Plus", pricePerMonth: "2499.00", ratePct: "0.1250", commissionPct: "12.5", sortOrder: 2 }),
    plan({ id: "plan_3", tier: "PRO", name: "Pro", pricePerMonth: "4999.00", ratePct: "0.1000", commissionPct: "10", sortOrder: 3 }),
];

beforeEach(() => {
    grantSubscription.mockReset();
    grantSubscription.mockResolvedValue({ id: "sub_1", publisherId: "pub_1", tier: "PRO", ratePct: "0.1000", pricePerMonth: "4999.00", startsAt: "2026-09-14", endsAt: null, source: "ADMIN_GRANT", planName: "Pro", createdAt: null });
    roster.mockReset();
    roster.mockResolvedValue([]);
});

describe("the prefill", () => {
    it("starts on the first active plan with its price and rate, and follows the tier that is picked", () => {
        render(<GrantDialog open onOpenChange={vi.fn()} plans={plans} publisher={{ id: "pub_1", name: "Asha Rao" }} onGranted={vi.fn()} />);
        expect(screen.getByRole("radio", { name: /Plus/ })).toHaveAttribute("aria-checked", "true");
        expect(screen.getByLabelText("Price per month")).toHaveValue("2499.00");
        expect(screen.getByLabelText("Commission rate")).toHaveValue("12.5");

        fireEvent.click(screen.getByRole("radio", { name: /Pro/ }));
        expect(screen.getByLabelText("Price per month")).toHaveValue("4999.00");
        expect(screen.getByLabelText("Commission rate")).toHaveValue("10");
    });

    it("names a fixed publisher rather than asking for one, and marks a retired plan", () => {
        render(<GrantDialog open onOpenChange={vi.fn()} plans={plans} publisher={{ id: "pub_1", name: "Asha Rao" }} onGranted={vi.fn()} />);
        expect(screen.getByText("Asha Rao")).toBeInTheDocument();
        expect(roster).not.toHaveBeenCalled();
        expect(screen.getByRole("radio", { name: /Standard/ })).toHaveTextContent("Retired");
    });

    it("picks the first active plan, or the first when none is", () => {
        expect(defaultTier(plans)).toBe("PLUS");
        expect(defaultTier(plans.map((row) => ({ ...row, active: false })))).toBe("STANDARD");
        expect(defaultTier([])).toBeNull();
        expect(todayInput(new Date(2026, 8, 4))).toBe("2026-09-04");
    });
});

describe("the grant", () => {
    it("POSTs the figures on screen — an edited rate as a fraction — with no end when none was typed", async () => {
        const onGranted = vi.fn();
        render(<GrantDialog open onOpenChange={vi.fn()} plans={plans} publisher={{ id: "pub_1", name: "Asha Rao" }} onGranted={onGranted} />);
        fireEvent.click(screen.getByRole("radio", { name: /Pro/ }));
        fireEvent.change(screen.getByLabelText("Commission rate"), { target: { value: "9.5" } });
        fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2026-10-01" } });
        fireEvent.click(screen.getByRole("button", { name: "Grant" }));
        await waitFor(() => expect(grantSubscription).toHaveBeenCalledTimes(1));
        expect(grantSubscription).toHaveBeenCalledWith({
            publisherId: "pub_1",
            tier: "PRO",
            startsAt: "2026-10-01",
            ratePct: "0.0950",
            pricePerMonth: "4999.00",
        });
        await waitFor(() => expect(onGranted).toHaveBeenCalled());
    });

    it("refuses an end before the start, and a rate that is not a percentage", () => {
        render(<GrantDialog open onOpenChange={vi.fn()} plans={plans} publisher={{ id: "pub_1", name: "Asha Rao" }} onGranted={vi.fn()} />);
        fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2026-10-01" } });
        fireEvent.change(screen.getByLabelText(/^Ends/), { target: { value: "2026-09-01" } });
        expect(screen.getByRole("button", { name: "Grant" })).toBeDisabled();
        fireEvent.change(screen.getByLabelText(/^Ends/), { target: { value: "2026-12-01" } });
        expect(screen.getByRole("button", { name: "Grant" })).toBeEnabled();
        fireEvent.change(screen.getByLabelText("Commission rate"), { target: { value: "abc" } });
        expect(screen.getByRole("button", { name: "Grant" })).toBeDisabled();
    });

    it("reads the roster when no publisher is fixed", async () => {
        render(<GrantDialog open onOpenChange={vi.fn()} plans={plans} onGranted={vi.fn()} />);
        await waitFor(() => expect(roster).toHaveBeenCalledTimes(1));
        expect(screen.getByRole("button", { name: "Grant" })).toBeDisabled();
    });
});
