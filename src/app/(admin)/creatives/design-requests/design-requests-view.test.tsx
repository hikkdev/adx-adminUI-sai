import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

/**
 * CR-1: the designs ADX owes, as the desk reads them.
 *
 * What is walked: a request shows its brief and its spots; an overdue one
 * says so in red; one the advertiser sent back shows their note; the chips
 * cut the list; and Deliver opens the dialog against that request.
 */

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => "/creatives/design-requests",
}));

vi.mock("../deliver-design-dialog", () => ({
    DeliverDesignDialog: ({ request, open }: { request: { campaign: { name: string } }; open: boolean }) =>
        open ? <div data-testid="deliver-dialog">{request.campaign.name}</div> : null,
}));

/* DQ-1: the quote dialog is its own component; here only that it opens against the right campaign. */
vi.mock("../design-quote-dialog", () => ({
    DesignQuoteDialog: ({ campaign }: { campaign: { name: string } | null }) => (campaign ? <div data-testid="quote-dialog">{campaign.name}</div> : null),
}));

/* The quote button needs `content.edit`; the test grants it unless a case says otherwise. */
const { auth } = vi.hoisted(() => ({ auth: { can: (_id: string): boolean => true } }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ can: auth.can }) }));

import { DesignRequestsView } from "./design-requests-view";
import type { DesignRequestRow } from "@/services/moderation";

const READ_AT = new Date("2026-09-24T12:00:00Z");

/** A request with sensible defaults; a partial `campaign` is merged rather than swapped in. */
const request = ({
    campaign: campaignOver,
    ...over
}: Partial<Omit<DesignRequestRow, "campaign">> & { campaign?: Partial<DesignRequestRow["campaign"]> } = {}): DesignRequestRow => ({
    campaign: {
        id: "cmp_1",
        reference: "ADX-CMP-2026-000001",
        name: "Diwali burst",
        status: "SCHEDULED",
        startDate: "2026-10-01T00:00:00Z",
        endDate: "2026-10-31T00:00:00Z",
        creativeConfig: { objective: "Footfall", keyMessage: "Two for one", style: "BOLD_AND_ENERGETIC" },
        advertiser: { id: "adv_1", name: "Anita", companyName: "Anita's Coffee" },
        ...campaignOver,
    },
    spots: [{ id: "s1", listing: { id: "l1", title: "MG Road hoarding", city: "Bengaluru", widthFt: "20", heightFt: "10", category: "OUTDOOR" } }],
    owedSince: "2026-09-20T00:00:00Z",
    lastDelivery: null,
    ...over,
});

function mount(rows: DesignRequestRow[], filter: "ALL" | "OVERDUE" | "SENT_BACK" = "ALL") {
    const onFilterChange = vi.fn();
    render(<DesignRequestsView rows={rows} readAt={READ_AT} filter={filter} onFilterChange={onFilterChange} onChanged={vi.fn()} />);
    return { onFilterChange };
}

describe("a design request", () => {
    it("shows the brief the advertiser wrote", () => {
        mount([request()]);
        const brief = screen.getByTestId("request-brief");
        expect(within(brief).getByText("Footfall")).toBeInTheDocument();
        expect(within(brief).getByText("Two for one")).toBeInTheDocument();
        expect(within(brief).getByText("Bold and energetic")).toBeInTheDocument();
    });

    it("lists the spots it prints on, with their size", () => {
        mount([request()]);
        expect(screen.getByText(/MG Road hoarding, Bengaluru — 20 × 10 ft/)).toBeInTheDocument();
    });

    it("counts down to the flight, and is not overdue before it", () => {
        mount([request()]);
        const due = screen.getByTestId("request-due");
        expect(due).toHaveTextContent("Due in 7 days");
        expect(due.className).not.toMatch(/text-danger/);
    });

    it("reads overdue in red once the flight has started", () => {
        mount([request({ campaign: { startDate: "2026-09-20T00:00:00Z" } })]);
        const due = screen.getByTestId("request-due");
        expect(due).toHaveTextContent(/started 4 days ago/);
        expect(due.className).toMatch(/text-danger/);
    });

    it("shows the advertiser's note when they sent a design back", () => {
        mount([
            request({
                lastDelivery: {
                    id: "crt_1",
                    status: "CHANGES_REQUESTED",
                    designedByAdx: true,
                    resubmissionOfId: null,
                    fileUrl: "/files/f_1",
                    reviewNote: "Logo too small",
                    reviewedAt: "2026-09-23T09:00:00Z",
                    createdAt: "2026-09-22T00:00:00Z",
                },
            }),
        ]);
        const sentBack = screen.getByTestId("request-sent-back");
        expect(within(sentBack).getByText("Changes requested")).toBeInTheDocument();
        expect(within(sentBack).getByText("Logo too small")).toBeInTheDocument();
    });

    it("says when no brief was written rather than showing nothing", () => {
        mount([request({ campaign: { creativeConfig: null } })]);
        expect(screen.getByText(/No brief was written/)).toBeInTheDocument();
    });
});

describe("the chips", () => {
    const overdue = request({ campaign: { id: "cmp_late", name: "Late one", startDate: "2026-09-01T00:00:00Z" } });
    const onTime = request();

    it("count the overdue and the sent-back", () => {
        mount([overdue, onTime]);
        /* The chips are tabs, not buttons: the row is a `tablist`. */
        expect(screen.getByRole("tab", { name: /^Overdue/ })).toHaveTextContent("1");
        expect(screen.getByRole("tab", { name: /^All/ })).toHaveTextContent("2");
    });

    it("show only the overdue under that chip", () => {
        mount([overdue, onTime], "OVERDUE");
        expect(screen.getByTestId("request-cmp_late")).toBeInTheDocument();
        expect(screen.queryByTestId("request-cmp_1")).not.toBeInTheDocument();
    });
});

describe("delivering", () => {
    it("opens the dialog against the request that was clicked", () => {
        mount([request()]);
        expect(screen.queryByTestId("deliver-dialog")).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId("request-deliver"));
        expect(screen.getByTestId("deliver-dialog")).toHaveTextContent("Diwali burst");
    });
});

/* DQ-1: the price ADX names for the design, and where it stands. A quote goes on before the campaign is paid, so the quotable cases are unpaid. */
describe("the design quote", () => {
    it("reads Awaiting quote with a Quote button while no price was named on an unpaid campaign", () => {
        mount([request({ campaign: { status: "PENDING_PAYMENT" } })]);
        expect(within(screen.getByTestId("request-quote")).getByText("Awaiting quote")).toBeInTheDocument();
        expect(screen.getByTestId("request-quote-button")).toHaveTextContent("Quote the design");
    });

    it("draws the chip but no button once the campaign is paid — the backend would refuse the quote", () => {
        mount([request()]);
        expect(within(screen.getByTestId("request-quote")).getByText("Awaiting quote")).toBeInTheDocument();
        expect(screen.queryByTestId("request-quote-button")).not.toBeInTheDocument();
    });

    it("shows the standing quote with its note, and offers a re-quote while it is not accepted", () => {
        mount([
            request({
                campaign: {
                    status: "PENDING_PAYMENT",
                    designQuote: { amount: "5000.00", status: "DECLINED", note: "Two rounds of changes", quotedAt: "2026-09-22T00:00:00Z", respondedAt: "2026-09-23T00:00:00Z" },
                },
            }),
        ]);
        const quote = screen.getByTestId("request-quote");
        expect(within(quote).getByText("Declined")).toBeInTheDocument();
        expect(quote).toHaveTextContent(/₹5,000\.00 \+ GST/);
        expect(within(quote).getByText("Two rounds of changes")).toBeInTheDocument();
        expect(screen.getByTestId("request-quote-button")).toHaveTextContent("Re-quote");
    });

    it("draws no button on an accepted quote — the fee is on the booking — nor for a desk without content.edit", () => {
        mount([request({ campaign: { designQuote: { amount: "5000.00", status: "ACCEPTED", note: null, quotedAt: "2026-09-22T00:00:00Z", respondedAt: "2026-09-23T00:00:00Z" } } })]);
        expect(within(screen.getByTestId("request-quote")).getByText("Accepted")).toBeInTheDocument();
        expect(screen.queryByTestId("request-quote-button")).not.toBeInTheDocument();

        auth.can = () => false;
        try {
            mount([request({ campaign: { id: "cmp_2", status: "PENDING_PAYMENT" } })]);
            expect(screen.queryByTestId("request-quote-button")).not.toBeInTheDocument();
        } finally {
            auth.can = () => true;
        }
    });

    it("opens the quote dialog against the request that was clicked", () => {
        mount([request({ campaign: { status: "DRAFT" } })]);
        expect(screen.queryByTestId("quote-dialog")).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId("request-quote-button"));
        expect(screen.getByTestId("quote-dialog")).toHaveTextContent("Diwali burst");
    });
});

describe("with nothing owed", () => {
    it("says so", () => {
        mount([]);
        expect(screen.getByText("Nothing owed")).toBeInTheDocument();
    });
});
