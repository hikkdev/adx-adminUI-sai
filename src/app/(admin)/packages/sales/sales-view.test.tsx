import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

/**
 * The package-sales desk, live. What this pins: every rupee figure printed
 * from the decimal string, a null commission drawn as a dash and not as
 * ₹0.00, the agent named from the roster with a fallback to the AGT- id the
 * sale carries, the shelf chips counting from the server, and the facets
 * going up rather than cutting the page the desk holds.
 */

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/packages/sales",
    useSearchParams: () => new URLSearchParams(),
}));

import type { AgentSummary } from "@/services/agents";
import { SalesView, endsLabel, sellerLabel } from "./sales-view";

const page = {
    items: [
        {
            id: "sale_1",
            commission: "1250.50",
            reference: "PKG-1109-2601",
            advertiserId: "adv_1",
            advertiserName: "Zomato",
            agentId: "agt_ravi",
            tier: "GROWTH",
            packageName: "Growth",
            cycle: "MONTHLY",
            months: 1,
            pricePerMonth: "12500.00",
            total: "14750.00",
            status: "ACTIVE",
            paidAt: "2026-09-01T04:30:00.000Z",
            startsAt: "2026-09-01T04:30:00.000Z",
            endsAt: "2026-10-01T04:30:00.000Z",
            nextBillingAt: "2026-10-01T04:30:00.000Z",
            createdAt: "2026-09-01T04:00:00.000Z",
        },
        {
            id: "sale_2",
            commission: null,
            reference: "PKG-1110-2601",
            advertiserId: "adv_2",
            advertiserName: "PhonePe",
            agentId: "agt_unknown",
            tier: "PRO",
            packageName: "Pro",
            cycle: "ANNUAL",
            months: 12,
            pricePerMonth: "30000.00",
            total: "424800.00",
            status: "PENDING_PAYMENT",
            paidAt: null,
            startsAt: null,
            endsAt: null,
            nextBillingAt: null,
            createdAt: "2026-09-02T04:00:00.000Z",
        },
        {
            id: "sale_3",
            commission: null,
            reference: "PKG-1111-2601",
            advertiserId: "adv_3",
            advertiserName: "Cred",
            agentId: null,
            tier: "STARTER",
            packageName: "Starter",
            cycle: "MONTHLY",
            months: 1,
            pricePerMonth: "5000.00",
            total: "5900.00",
            status: "EXPIRED",
            paidAt: "2026-07-01T04:30:00.000Z",
            startsAt: "2026-07-01T04:30:00.000Z",
            endsAt: "2026-08-01T04:30:00.000Z",
            nextBillingAt: null,
            createdAt: "2026-07-01T04:00:00.000Z",
        },
    ],
    total: 30,
    page: 1,
    pageSize: 25,
    counts: { ACTIVE: 18, EXPIRING: 4, EXPIRED: 6 },
};

const agents: AgentSummary[] = [
    { id: "agt_ravi", userId: "usr_1", displayId: "AGT-1009-2601", city: "Bengaluru", tier: "SILVER", user: { name: "Ravi Kumar", mobile: "+919999999999" } },
];

function mount(over: Partial<React.ComponentProps<typeof SalesView>> = {}) {
    const props = {
        page,
        q: "",
        onQChange: vi.fn(),
        shelf: "ALL" as const,
        onShelfChange: vi.fn(),
        sort: "NEWEST" as const,
        onSortChange: vi.fn(),
        pageNumber: 1,
        onPageChange: vi.fn(),
        pageSize: 25,
        agents,
        ...over,
    };
    render(<SalesView {...props} />);
    return props;
}

const rowOf = (text: string) => within(screen.getByText(text).closest("tr")!);

describe("what the desk draws", () => {
    it("prints the money from the decimal strings, paise included", () => {
        mount();
        const zomato = rowOf("Zomato");
        expect(zomato.getByText("₹12,500.00")).toBeInTheDocument();
        expect(zomato.getByText("₹14,750.00")).toBeInTheDocument();
        expect(zomato.getByText("₹1,250.50")).toBeInTheDocument();
        expect(rowOf("PhonePe").getByText("₹4,24,800.00")).toBeInTheDocument();
    });

    it("draws a commission nobody recorded as a dash, never as ₹0.00", () => {
        mount();
        expect(rowOf("PhonePe").getAllByText("—").length).toBeGreaterThanOrEqual(1);
        expect(screen.queryByText("₹0.00")).not.toBeInTheDocument();
    });

    it("names the agent from the roster with their AGT- id, falls back to the id the sale carries, and says when there was none", () => {
        mount();
        expect(rowOf("Zomato").getByText("Ravi Kumar · Bengaluru · AGT-1009-2601")).toBeInTheDocument();
        expect(rowOf("PhonePe").getByText("agt_unknown")).toBeInTheDocument();
        expect(rowOf("Cred").getByText("Self-served")).toBeInTheDocument();
    });

    it("prints the cycle, the status and the renewal or the end", () => {
        mount();
        expect(rowOf("Zomato").getByText("Monthly")).toBeInTheDocument();
        expect(rowOf("Zomato").getByText("Renews 1 Oct 2026")).toBeInTheDocument();
        expect(rowOf("PhonePe").getByText("Annual")).toBeInTheDocument();
        expect(rowOf("PhonePe").getByText("Awaiting payment")).toBeInTheDocument();
        expect(rowOf("Cred").getByText("Ends 1 Aug 2026")).toBeInTheDocument();
    });
});

describe("the facets", () => {
    it("counts the shelf chips from the server and sends a choice up", () => {
        const props = mount();
        expect(within(screen.getByRole("tab", { name: /Active/ })).getByText("18")).toBeInTheDocument();
        expect(within(screen.getByRole("tab", { name: /Expiring/ })).getByText("4")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("tab", { name: /Expired/ }));
        expect(props.onShelfChange).toHaveBeenCalledWith("EXPIRED");
    });

    it("sends the search up rather than cutting the page it holds, and walks the server's pages", () => {
        const props = mount();
        fireEvent.change(screen.getByLabelText("Search sales"), { target: { value: "zom" } });
        expect(props.onQChange).toHaveBeenCalledWith("zom");
        expect(screen.getByText("PhonePe")).toBeInTheDocument();

        expect(screen.getByText("1-25 of 30")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Next" }));
        expect(props.onPageChange).toHaveBeenCalledWith(2);
    });
});

describe("labels", () => {
    it("names the seller", () => {
        const names = new Map([["agt_1", "Ravi"]]);
        expect(sellerLabel({ agentId: "agt_1" }, names)).toBe("Ravi");
        expect(sellerLabel({ agentId: "agt_2" }, names)).toBe("agt_2");
        expect(sellerLabel({ agentId: null }, names)).toBe("Self-served");
    });

    it("prefers the next billing on an active plan and the end otherwise", () => {
        expect(endsLabel({ status: "ACTIVE", endsAt: "2026-10-01", nextBillingAt: "2026-10-01" })).toBe("Renews 1 Oct 2026");
        expect(endsLabel({ status: "EXPIRED", endsAt: "2026-08-01", nextBillingAt: null })).toBe("Ends 1 Aug 2026");
        expect(endsLabel({ status: "PENDING_PAYMENT", endsAt: null, nextBillingAt: null })).toBe("—");
    });
});
