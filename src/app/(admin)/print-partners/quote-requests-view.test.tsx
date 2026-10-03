import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * The Quote requests tab, on the one question the owner asked of it on 24
 * September 2026: "there's no way to send quote request to anyone."
 *
 * The tab read requests and cancelled them. Raising one was on an order's
 * Printing card, and nothing here linked to it — so the tab listed an empty
 * desk and described, in prose, a screen the operator then had to go and
 * find. Now the button is on the tab: beside Refresh, and again inside the
 * empty state, which is the moment it is most wanted.
 *
 * What it does once pressed is walked in `raise-quote-request.test.tsx`.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { QuoteRequestsView } from "./quote-requests-view";
import type { PrintQuoteRequestPage, PrintQuoteRequestRow } from "@/services/print-partners";

const row: PrintQuoteRequestRow = {
    id: "pqr_1",
    orderId: "ord_1",
    order: { id: "ord_1", status: "PENDING_PRINT", campaignName: "Monsoon sale", site: { id: "lst_1", title: "MG Road hoarding", city: "Bengaluru" } },
    status: "OPEN",
    city: "Bengaluru",
    deadlineAt: "2026-09-26T00:00:00.000Z",
    inviteMode: "AUTO",
    invitedCount: 3,
    reinvitedAt: null,
    standingQuotes: 1,
    lowest: { quoteId: "q_1", amount: "4200.00", turnaroundDays: 2, partner: { id: "pp_1", name: "Sharma Printers" } },
    awardedQuoteId: null,
    cancelReason: null,
    createdAt: "2026-09-24T00:00:00.000Z",
};

function pageOf(items: PrintQuoteRequestRow[]): PrintQuoteRequestPage {
    return { items, total: items.length, page: 1, pageSize: 100, counts: items.length ? { OPEN: items.length } : {} };
}

function mount({ items = [row], featureOff = false }: { items?: PrintQuoteRequestRow[]; featureOff?: boolean } = {}) {
    render(
        <QuoteRequestsView
            page={pageOf(items)}
            readAt={new Date("2026-09-24T12:00:00.000Z")}
            filter="OPEN"
            onFilterChange={vi.fn()}
            featureOff={featureOff}
            onRefresh={vi.fn()}
        />,
    );
}

describe("the quote requests desk", () => {
    it("offers a way to send a request", () => {
        mount();
        expect(screen.getByTestId("raise-quote-request")).toBeInTheDocument();
    });

    it("offers it again on an empty desk, where it is most wanted", () => {
        mount({ items: [] });
        expect(screen.getByTestId("raise-quote-request")).toBeInTheDocument();
        expect(screen.getByTestId("raise-quote-request-empty")).toBeInTheDocument();
    });

    it("offers nothing while quote requests are switched off", () => {
        mount({ featureOff: true });
        expect(screen.queryByTestId("raise-quote-request")).not.toBeInTheDocument();
        expect(screen.getByText("Quote requests are switched off")).toBeInTheDocument();
    });
});
