import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

/**
 * CR-1: approved artwork and whether a shop has it.
 *
 * The owner's ask was to review artwork and push it to print partners with
 * the specs. What is pinned: a row shows its spot's size and category and
 * the artwork's pixels; readiness is read off the order and job; the row
 * with no job says where to go; the chips cut by readiness.
 */

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push }),
    usePathname: () => "/creatives/print-ready",
}));

import { PrintReadyView } from "./print-ready-view";
import type { CreativeReviewRow } from "@/services/moderation";

const listing = { id: "l1", title: "MG Road hoarding", city: "Bengaluru", widthFt: "20", heightFt: "10", category: "OUTDOOR" };

const row = (over: Partial<CreativeReviewRow> = {}): CreativeReviewRow => ({
    id: "crt_1",
    campaignId: "cmp_1",
    spotId: "s1",
    path: "STATIC_IMAGES",
    status: "APPROVED",
    fileUrl: "/files/f_1",
    fileName: "hoarding.png",
    fileSize: 860_160,
    mimeType: "image/png",
    widthPx: 1920,
    heightPx: 960,
    durationMs: null,
    reviewNote: null,
    reviewedById: "usr_ops",
    reviewedAt: "2026-09-23T10:00:00Z",
    submittedAt: "2026-09-22T08:00:00Z",
    flags: [],
    checks: [],
    resubmissionOfId: null,
    designedByAdx: false,
    advertiserAcceptedAt: null,
    advertiserAcceptedById: null,
    trackingCodeId: null,
    createdAt: "2026-09-22T08:00:00Z",
    updatedAt: "2026-09-23T10:00:00Z",
    campaign: {
        id: "cmp_1",
        reference: "ADX-CMP-2026-000001",
        name: "Diwali burst",
        status: "SCHEDULED",
        advertiserId: "adv_1",
        agentId: null,
        createdByUserId: "usr_1",
        trackingMethod: "QR_OR_DEEPLINK",
        contentCategoryId: null,
        advertiser: { id: "adv_1", name: "Anita", companyName: "Anita's Coffee" },
    },
    spot: { id: "s1", listingId: "l1", listing, order: { id: "ord_1", status: "PENDING_PRINT", printJob: null } },
    ...over,
});

const atShop = row({
    id: "crt_shop",
    spot: {
        id: "s2",
        listingId: "l1",
        listing,
        order: { id: "ord_2", status: "PENDING_PRINT", printJob: { id: "job_1", status: "PRINTING", printPartner: { id: "pp_1", name: "Sharma Printers" } } },
    },
});

function mount(rows: CreativeReviewRow[], filter: Parameters<typeof PrintReadyView>[0]["filter"] = "ALL") {
    render(<PrintReadyView rows={rows} filter={filter} onFilterChange={vi.fn()} />);
}

describe("an approved artwork", () => {
    it("shows the spot's specs and the artwork's pixels", () => {
        mount([row()]);
        expect(screen.getByText("MG Road hoarding")).toBeInTheDocument();
        expect(screen.getByText(/Bengaluru · 20 × 10 ft · OUTDOOR/)).toBeInTheDocument();
        expect(screen.getByText("1920 × 960 px")).toBeInTheDocument();
    });

    it("points at the order when the spot is booked but no job exists", () => {
        mount([row()]);
        const cell = screen.getByTestId("ready-crt_1");
        expect(within(cell).getByText("No print job yet")).toBeInTheDocument();
        expect(within(cell).getByRole("link", { name: "Open the order to print it" })).toHaveAttribute("href", "/orders/ord_1");
    });

    it("names the shop and its stage once a job exists", () => {
        mount([atShop]);
        const cell = screen.getByTestId("ready-crt_shop");
        expect(within(cell).getByText("With a shop")).toBeInTheDocument();
        expect(within(cell).getByText("Sharma Printers · Printing")).toBeInTheDocument();
    });

    it("says whole campaign for artwork pinned to no spot", () => {
        mount([row({ id: "crt_wide", spotId: null, spot: null })]);
        expect(within(screen.getByTestId("ready-crt_wide")).getByText("Whole campaign")).toBeInTheDocument();
    });
});

describe("the chips", () => {
    it("count by readiness and cut the table", () => {
        mount([row(), atShop], "AT_SHOP");
        expect(screen.getByRole("tab", { name: /^No print job yet/ })).toHaveTextContent("1");
        expect(screen.getByTestId("ready-crt_shop")).toBeInTheDocument();
        expect(screen.queryByTestId("ready-crt_1")).not.toBeInTheDocument();
    });
});

describe("with nothing approved", () => {
    it("says so", () => {
        mount([]);
        expect(screen.getByText("Nothing approved yet")).toBeInTheDocument();
    });
});
