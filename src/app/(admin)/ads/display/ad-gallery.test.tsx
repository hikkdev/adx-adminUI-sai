import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Display ads › Gallery (28 Sep 2026). The artwork advertisers upload left
 * Content › Media library and lives here with its ads. Pinned: the list
 * stays the default; the Gallery toggle draws every ad the desk loaded —
 * artwork, booking reference, advertiser, slot, status and dates on each
 * card, an empty frame for an ad with no artwork yet — under the same
 * filters; a card opens the ad's existing detail.
 */

const { service } = vi.hoisted(() => ({
    service: {
        slots: vi.fn(),
        ads: vi.fn(),
        ad: vi.fn(),
    },
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/ads/display" }));
vi.mock("@/services/promotions", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/promotions")>();
    return { ...actual, promotionsReadApi: () => true, promotionsService: { ...actual.promotionsService, ...service } };
});

import type { AdBookingRow } from "@/services/promotions";
import { DisplayAds } from "./display-ads";

const ad = (over: Partial<AdBookingRow>): AdBookingRow => ({
    id: "adb_1",
    displayId: "ADB-2809-2601",
    status: "LIVE",
    advertiserId: "adv_1",
    title: "Diwali sale",
    headline: "Up to 40% off",
    ctaLabel: "Shop",
    targetUrl: "https://brand.example/diwali",
    cityIds: [],
    startDate: "2026-10-12",
    endDate: "2026-10-18",
    days: 7,
    ratePerDay: "500.00",
    subtotal: "3500.00",
    gstAmount: "630.00",
    total: "4130.00",
    reviewNote: null,
    reviewedAt: null,
    paidAt: null,
    refundedAt: null,
    cancelledAt: null,
    cancelReason: null,
    createdAt: "2026-09-28T00:00:00.000Z",
    slot: { key: "WEB_LISTING_SIDEBAR", label: "Listing sidebar", spec: "AD_SIDEBAR" },
    media: { id: "med_1", url: "https://cdn.adx.in/media/diwali.jpg", width: 600, height: 750, altText: "Diwali sale banner" },
    advertiser: { id: "adv_1", name: "Brand Co", displayId: "ADV-0001" },
    ...over,
});

const live = ad({});
const draft = ad({ id: "adb_2", displayId: null, status: "DRAFT", title: "Holi teaser", media: null, advertiser: { id: "adv_2", name: "Colour Co", displayId: null }, slot: { key: "WEB_HOME_BANNER", label: "Home banner", spec: "AD_BANNER" } });

beforeEach(() => {
    vi.clearAllMocks();
    service.slots.mockResolvedValue([]);
    service.ads.mockResolvedValue({ items: [live, draft], total: 2, page: 1, pageSize: 100, counts: { LIVE: 1, DRAFT: 1 } });
    service.ad.mockImplementation(async (id: string) => (id === live.id ? live : draft));
});

describe("Display ads › Gallery", () => {
    it("keeps the list as the default", async () => {
        render(<DisplayAds />);
        expect(await screen.findByTestId("ad-open-adb_1")).toBeInTheDocument();
        expect(screen.queryByTestId("ad-gallery")).not.toBeInTheDocument();
        expect(screen.getByTestId("ads-view-list")).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByTestId("ads-view-gallery")).toHaveAttribute("aria-pressed", "false");
    });

    it("draws every loaded ad as its artwork with the reference, advertiser, slot, status and dates", async () => {
        render(<DisplayAds />);
        await screen.findByTestId("ad-open-adb_1");
        fireEvent.click(screen.getByTestId("ads-view-gallery"));

        const gallery = screen.getByTestId("ad-gallery");
        expect(within(gallery).getAllByRole("button")).toHaveLength(2);

        const card = within(screen.getByTestId("ad-gallery-card-adb_1"));
        expect(card.getByRole("img")).toHaveAttribute("src", "https://cdn.adx.in/media/diwali.jpg");
        expect(card.getByRole("img")).toHaveAttribute("alt", "Diwali sale banner");
        expect(card.getByText("Diwali sale")).toBeInTheDocument();
        expect(card.getByText("ADB-2809-2601")).toBeInTheDocument();
        expect(card.getByText("Brand Co · ADV-0001")).toBeInTheDocument();
        expect(card.getByText("Listing sidebar")).toBeInTheDocument();
        expect(card.getByText("Live")).toBeInTheDocument();
        expect(card.getByText(/12 Oct – 18 Oct 2026 · 7 days/)).toBeInTheDocument();

        const empty = within(screen.getByTestId("ad-gallery-card-adb_2"));
        expect(empty.queryByRole("img")).not.toBeInTheDocument();
        expect(empty.getByText("No artwork uploaded")).toBeInTheDocument();
        expect(empty.getByText("adb_2")).toBeInTheDocument();
        expect(empty.getByText("Colour Co")).toBeInTheDocument();
        expect(empty.getByText("Home banner")).toBeInTheDocument();
    });

    it("reads the same ads the list does — the status chip still cuts on the server", async () => {
        render(<DisplayAds />);
        await screen.findByTestId("ad-open-adb_1");
        fireEvent.click(screen.getByTestId("ads-view-gallery"));
        expect(service.ads).toHaveBeenCalledTimes(1);
        expect(service.ads).toHaveBeenLastCalledWith(expect.objectContaining({ pageSize: 100 }));
    });

    it("opens the ad's own detail from a card", async () => {
        render(<DisplayAds />);
        await screen.findByTestId("ad-open-adb_1");
        fireEvent.click(screen.getByTestId("ads-view-gallery"));
        fireEvent.click(screen.getByTestId("ad-gallery-card-adb_1"));
        await waitFor(() => expect(service.ad).toHaveBeenCalledWith("adb_1"));
        expect(await screen.findByTestId("ad-detail")).toBeInTheDocument();
    });

    it("says so when no ad matches", async () => {
        service.ads.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100, counts: {} });
        render(<DisplayAds />);
        await screen.findByText("No ads match.");
        fireEvent.click(screen.getByTestId("ads-view-gallery"));
        expect(screen.getByText("No ads match")).toBeInTheDocument();
    });
});
