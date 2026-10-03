import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * CR-1: the chase list — ADX designs with the advertiser, and for how long.
 */

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => "/creatives/awaiting-advertiser",
}));

import { AwaitingView, STALE_AFTER_DAYS, daysWaiting } from "./awaiting-view";
import type { CreativeReviewRow } from "@/services/moderation";

const READ_AT = new Date("2026-09-24T12:00:00Z");

const row = (over: Partial<CreativeReviewRow> = {}): CreativeReviewRow => ({
    id: "crt_1",
    campaignId: "cmp_1",
    spotId: null,
    path: "ADX_DESIGN_AGENCY",
    status: "AWAITING_ADVERTISER",
    fileUrl: "/files/f_1",
    fileName: "design.png",
    fileSize: 100_000,
    mimeType: "image/png",
    widthPx: 1920,
    heightPx: 960,
    durationMs: null,
    reviewNote: null,
    reviewedById: null,
    reviewedAt: null,
    submittedAt: "2026-09-23T08:00:00Z",
    flags: [],
    checks: [],
    resubmissionOfId: null,
    designedByAdx: true,
    advertiserAcceptedAt: null,
    advertiserAcceptedById: null,
    trackingCodeId: null,
    createdAt: "2026-09-23T08:00:00Z",
    updatedAt: "2026-09-23T08:00:00Z",
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
    spot: null,
    ...over,
});

describe("days waiting", () => {
    it("counts whole days from the delivery", () => {
        expect(daysWaiting({ submittedAt: "2026-09-20T08:00:00Z", createdAt: "2026-09-20T08:00:00Z" }, READ_AT)).toBe(4);
    });

    it("falls back to the row's creation when it was never stamped as submitted", () => {
        expect(daysWaiting({ submittedAt: null, createdAt: "2026-09-23T08:00:00Z" }, READ_AT)).toBe(1);
    });
});

describe("the chase list", () => {
    it("shows each design with how long the advertiser has had it", () => {
        render(<AwaitingView rows={[row()]} readAt={READ_AT} filter="ALL" onFilterChange={vi.fn()} />);
        expect(screen.getByTestId("waiting-days")).toHaveTextContent("1 day");
        expect(screen.getByText(/Delivered .* for the whole campaign/)).toBeInTheDocument();
    });

    it("reads a stale one in red", () => {
        const old = row({ submittedAt: "2026-09-19T08:00:00Z" });
        render(<AwaitingView rows={[old]} readAt={READ_AT} filter="ALL" onFilterChange={vi.fn()} />);
        const days = screen.getByTestId("waiting-days");
        expect(days).toHaveTextContent("5 days");
        expect(days.className).toMatch(/text-danger/);
    });

    it("keeps only the stale ones under that chip", () => {
        const fresh = row({ id: "crt_fresh" });
        const old = row({ id: "crt_old", submittedAt: "2026-09-19T08:00:00Z" });
        render(<AwaitingView rows={[fresh, old]} readAt={READ_AT} filter="STALE" onFilterChange={vi.fn()} />);
        expect(screen.getByTestId("waiting-crt_old")).toBeInTheDocument();
        expect(screen.queryByTestId("waiting-crt_fresh")).not.toBeInTheDocument();
        expect(screen.getByRole("tab", { name: (name) => name.startsWith(`${STALE_AFTER_DAYS}+ days`) })).toHaveTextContent("1");
    });

    it("names the spot when the design was for one", () => {
        const pinned = row({ spot: { id: "s1", listingId: "l1", listing: { id: "l1", title: "MG Road", city: "Bengaluru", widthFt: "20", heightFt: "10" } } });
        render(<AwaitingView rows={[pinned]} readAt={READ_AT} filter="ALL" onFilterChange={vi.fn()} />);
        expect(screen.getByText(/for MG Road/)).toBeInTheDocument();
    });

    it("says so when nobody is waiting", () => {
        render(<AwaitingView rows={[]} readAt={READ_AT} filter="ALL" onFilterChange={vi.fn()} />);
        expect(screen.getByText("Nobody is waiting")).toBeInTheDocument();
    });
});
