import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

/**
 * OM-1: the campaign page's link down to its orders.
 *
 * Campaigns never linked to Orders. Each spot on a campaign becomes one
 * order for fulfilment, and the aggregate's `include` has always sent the
 * spot's `orderId`; the console just never drew it. What is pinned: a spot
 * with an order links to it, a spot without one says so, and the heading
 * counts how many have one.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/campaigns/cmp_1" }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ can: () => true, user: null }) }));

import { SpotsCard } from "./campaign-cards";
import type { CampaignDetail } from "@/services/campaigns";

const campaign = (spots: NonNullable<CampaignDetail["spots"]>): CampaignDetail =>
    ({
        id: "cmp_1",
        reference: "ADX-CMP-2026-000001",
        name: "Diwali burst",
        status: "SCHEDULED",
        spots,
    }) as unknown as CampaignDetail;

const spot = (id: string, orderId: string | null) => ({
    id,
    listingId: `lst_${id}`,
    status: "BOOKED",
    lineTotal: "12000.00",
    orderId,
    listing: { id: `lst_${id}`, title: `Site ${id}`, city: "Bengaluru" },
});

describe("the spots card", () => {
    it("links a spot to the order that puts it up", () => {
        render(<SpotsCard campaign={campaign([spot("a", "ord_a")])} />);
        expect(screen.getByTestId("spot-order-a")).toHaveAttribute("href", "/orders/ord_a");
    });

    it("says so for a spot with no order yet, rather than linking nowhere", () => {
        render(<SpotsCard campaign={campaign([spot("b", null)])} />);
        expect(screen.queryByTestId("spot-order-b")).not.toBeInTheDocument();
        expect(screen.getByText("Not yet")).toBeInTheDocument();
    });

    it("counts how many spots have an order in the heading", () => {
        render(<SpotsCard campaign={campaign([spot("a", "ord_a"), spot("b", null), spot("c", "ord_c")])} />);
        expect(within(screen.getByTestId("campaign-spots")).getByText("3 spots, 2 with an order to put it up.")).toBeInTheDocument();
    });

    it("links each site to its listing and prints its value", () => {
        render(<SpotsCard campaign={campaign([spot("a", "ord_a")])} />);
        expect(screen.getByRole("link", { name: /Site a/ })).toHaveAttribute("href", "/listings/lst_a");
        expect(screen.getByText("₹12,000.00")).toBeInTheDocument();
    });

    it("says when no spots are chosen", () => {
        render(<SpotsCard campaign={campaign([])} />);
        expect(screen.getByText("No spots chosen yet.")).toBeInTheDocument();
    });
});
