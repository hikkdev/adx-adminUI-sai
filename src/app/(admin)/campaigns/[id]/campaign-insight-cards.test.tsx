import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * The campaign page's new cards (2 Oct 2026).
 *
 * Pinned: Performance — the lifetime counts and the daily chart over
 * `GET /campaigns/:id/performance`, or a plain line when the read fails;
 * Landing page — status, the public address in a new tab, the AI-drafted
 * marker, the published date, its own numbers, the live page in a
 * script-less frame (a draft's blocks instead), Unpublish… with a reason;
 * Waiting on — the reasons (the server's `waitingOn`, else QR-16's
 * `launchBlockedBy` on a paid campaign) each with its one-click fix; the
 * shared "Placed by" line naming the advertiser.
 */

const { backend, toast } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string; body?: unknown }[],
        reset() {
            this.calls = [];
        },
    },
    toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/campaigns/cmp_1",
    useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/lib/auth", () => ({
    useAuth: () => ({ user: { id: "usr_admin" }, can: () => true }),
    useOptionalAuth: () => ({ user: { id: "usr_admin" }, can: () => true }),
}));
vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true, baseUrl: "https://api.adx.in/api/v1" }, isLive: () => true };
});
vi.mock("@/components/charts/lazy", () => ({
    ExploreChart: ({ data, series }: { data: unknown[]; series: { label: string }[] }) => (
        <div data-testid="explore-chart">{`${data.length} days · ${series.map((line) => line.label).join(", ")}`}</div>
    ),
}));
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const handle = (method: string) => async (path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        return {};
    };
    return { ...actual, api: { get: handle("GET"), post: handle("POST"), patch: handle("PATCH"), put: handle("PUT"), delete: handle("DELETE") } };
});

import { PlacedByLine } from "@/components/adx/placed-by";
import type { CampaignDetail } from "@/services/campaigns";
import type { LandingPageDetail } from "@/services/landing-pages";
import { LandingPageCard, PerformanceCard, WaitingOnBanner, campaignWaitingOn } from "./campaign-insight-cards";

const ASHA = { userId: "usr_asha", name: "Asha Rao", displayId: "ADX-0210-2601", business: { id: "adv_rao", name: "Rao Sweets", displayId: "ADV-0210-2601" } };

const detail = (over: Partial<CampaignDetail> = {}): CampaignDetail =>
    ({
        id: "cmp_1",
        reference: "ADX-CMP-2026-482913",
        name: "Diwali Season Push",
        status: "SCHEDULED",
        goal: null,
        brandName: "Rao Sweets",
        city: null,
        budget: null,
        total: "18400.00",
        startDate: "2026-10-01T00:00:00.000Z",
        endDate: "2026-10-30T00:00:00.000Z",
        spotCount: 2,
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-20T00:00:00.000Z",
        advertiserId: "adv_rao",
        agentId: null,
        step: 17,
        creatives: [],
        ...over,
    }) as CampaignDetail;

const LANDING: LandingPageDetail = {
    id: "lp_1",
    campaignId: "cmp_1",
    slug: "diwali-rao",
    blocks: [
        { type: "hero", headline: "Diwali sweets, 20% off" },
        { type: "cta", label: "Call us" },
    ],
    theme: null,
    version: 3,
    status: "PUBLISHED",
    generatedByAi: true,
    publishedAt: "2026-09-30T10:00:00.000Z",
    updatedAt: "2026-09-30T10:00:00.000Z",
    url: "/p/diwali-rao",
};

beforeEach(() => {
    backend.reset();
    vi.clearAllMocks();
});

describe("Performance", () => {
    it("draws the lifetime counts and the daily lines", () => {
        render(
            <PerformanceCard
                performance={{
                    lifetime: { scans: 1200, views: 640, ctaClicks: 90, enquiries: 14 },
                    series: [
                        { day: "2026-10-01", scans: 100, views: 50, ctaClicks: 5, enquiries: 1 },
                        { day: "2026-10-02", scans: 120, views: 60, ctaClicks: 7, enquiries: 2 },
                    ],
                }}
            />,
        );
        const card = within(screen.getByTestId("performance-card"));
        expect(card.getByText("1,200")).toBeTruthy();
        expect(card.getByText("14")).toBeTruthy();
        expect(card.getByTestId("explore-chart")).toHaveTextContent("2 days · QR scans, Landing views, CTA clicks, Enquiries");
    });

    it("says so when the read did not answer", () => {
        render(<PerformanceCard performance={null} />);
        expect(screen.getByText("The performance read did not answer; try again later.")).toBeTruthy();
    });
});

describe("Landing page", () => {
    it("shows a live page: its address in a new tab, the AI marker, its numbers and the page itself without scripts", () => {
        render(
            <LandingPageCard
                campaign={{ id: "cmp_1", landingPage: { id: "lp_1", slug: "diwali-rao", status: "PUBLISHED", url: "/p/diwali-rao", publishedAt: LANDING.publishedAt } }}
                landing={LANDING}
                numbers={{ views: 640, ctaClicks: 90, enquiries: 14 }}
                onChanged={vi.fn()}
            />,
        );
        const card = within(screen.getByTestId("landing-card"));
        const address = card.getByRole("link", { name: /\/p\/diwali-rao/ });
        expect(address).toHaveAttribute("href", "https://api.adx.in/p/diwali-rao");
        expect(address).toHaveAttribute("target", "_blank");
        expect(card.getByText("AI, from the brief")).toBeTruthy();
        expect(card.getByText("640 · 90 · 14")).toBeTruthy();
        const frame = card.getByTestId("landing-iframe");
        expect(frame).toHaveAttribute("src", "https://api.adx.in/p/diwali-rao");
        expect(frame).toHaveAttribute("sandbox", "");
    });

    it("unpublishes with a reason", async () => {
        const onChanged = vi.fn();
        render(
            <LandingPageCard
                campaign={{ id: "cmp_1", landingPage: { id: "lp_1", slug: "diwali-rao", status: "PUBLISHED", url: "/p/diwali-rao", publishedAt: null } }}
                landing={LANDING}
                numbers={null}
                onChanged={onChanged}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Unpublish…" }));
        const dialog = await screen.findByRole("alertdialog");
        const confirm = within(dialog).getByRole("button", { name: "Unpublish" });
        expect(confirm).toBeDisabled();
        fireEvent.change(within(dialog).getByLabelText("Reason — what the advertiser reads"), { target: { value: "Promises a discount the brief does not." } });
        fireEvent.click(confirm);
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.calls).toEqual([{ method: "POST", path: "/campaigns/cmp_1/landing-page/unpublish", body: { reason: "Promises a discount the brief does not." } }]);
    });

    it("draws a draft's blocks rather than a page that does not answer, with no Unpublish", () => {
        render(
            <LandingPageCard
                campaign={{ id: "cmp_1", landingPage: { id: "lp_1", slug: "diwali-rao", status: "DRAFT", url: "/p/diwali-rao", publishedAt: null } }}
                landing={{ ...LANDING, status: "DRAFT", generatedByAi: false, publishedAt: null }}
                numbers={null}
                onChanged={vi.fn()}
            />,
        );
        expect(screen.queryByTestId("landing-iframe")).toBeNull();
        expect(screen.getByTestId("landing-blocks")).toHaveTextContent("Diwali sweets, 20% off");
        expect(screen.getByText("/p/diwali-rao — not live")).toBeTruthy();
        expect(screen.getByText("The advertiser")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Unpublish…" })).toBeNull();
    });

    it("says how a page comes to be when there is none", () => {
        render(<LandingPageCard campaign={{ id: "cmp_1", landingPage: null }} landing={null} numbers={null} onChanged={vi.fn()} />);
        expect(screen.getByText(/No landing page\. The advertiser drafts one with AI/)).toBeTruthy();
    });
});

describe("Waiting on", () => {
    it("reads the server's reasons, else the KYC hold on a paid campaign, else nothing", () => {
        expect(campaignWaitingOn(detail({ waitingOn: ["ARTWORK"], launchBlockedBy: ["KYC"] }))).toEqual(["ARTWORK"]);
        expect(campaignWaitingOn(detail({ launchBlockedBy: ["KYC"] }))).toEqual(["KYC"]);
        expect(campaignWaitingOn(detail({ status: "DRAFT", launchBlockedBy: ["KYC"] }))).toEqual([]);
    });

    it("draws each reason with its fix — the artwork awaiting approval opens its review", () => {
        render(
            <WaitingOnBanner
                campaign={detail({
                    waitingOn: ["KYC", "ARTWORK"],
                    placedBy: ASHA,
                    creatives: [
                        { id: "cr_ok", status: "APPROVED" } as never,
                        { id: "cr_new", status: "IN_REVIEW" } as never,
                    ],
                })}
                onChanged={vi.fn()}
            />,
        );
        const banner = within(screen.getByTestId("waiting-on-banner"));
        expect(banner.getByText("Waiting on Advertiser KYC · Artwork approval")).toBeTruthy();
        expect(banner.getByRole("button", { name: "Request KYC" })).toBeEnabled();
        expect(banner.getByRole("link", { name: "Review artwork" })).toHaveAttribute("href", "/creatives/cr_new");
    });

    it("draws nothing when nothing holds it back", () => {
        render(<WaitingOnBanner campaign={detail({ waitingOn: [] })} onChanged={vi.fn()} />);
        expect(screen.queryByTestId("waiting-on-banner")).toBeNull();
    });
});

describe("the advertiser line", () => {
    it("names the business and the person, each a link — the orders' Placed by line", () => {
        render(<PlacedByLine placedBy={ASHA} lead="Advertiser" when={null} fallback="" testId="campaign-advertiser-line" />);
        expect(screen.getByTestId("campaign-advertiser-line")).toHaveTextContent("Advertiser Rao Sweets (Asha Rao)");
        expect(screen.getByRole("link", { name: "Rao Sweets" })).toHaveAttribute("href", "/advertisers/adv_rao");
        expect(screen.getByRole("link", { name: "Asha Rao" })).toHaveAttribute("href", "/users/usr_asha");
    });
});
