import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

/**
 * 2 Oct 2026 — the Campaigns section's routes after the overview landed at
 * the root, as Listings did.
 *
 * Pinned: the tab strip (Overview · Campaigns · Launch queue · Landing
 * pages); `/campaigns` renders the overview over
 * `GET /section-overviews/campaigns` with "New campaign" top right, the
 * tiles leading into the list by status, the work lists into the list or
 * the launch queue, the waiting-by-reason mix into the queue cut to the
 * reason, the breakdowns and the top advertisers; `/campaigns/directory`
 * renders the list and asks nothing of the overview; the old list links
 * (`/campaigns?advertiserId=…`) redirect to the directory with the query.
 */

const { backend, router } = vi.hoisted(() => ({
    backend: {
        calls: [] as string[],
        reset() {
            this.calls = [];
        },
    },
    router: { replace: vi.fn(), push: vi.fn(), pathname: "/campaigns", search: "" },
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: router.push, replace: router.replace, refresh: vi.fn() }),
    usePathname: () => router.pathname,
    useSearchParams: () => new URLSearchParams(router.search),
}));
vi.mock("@/lib/auth", () => ({
    useAuth: () => ({ user: { id: "usr_admin", name: "Priya", roles: ["ADMIN"] }, loading: false, can: () => true }),
    useOptionalAuth: () => ({ user: { id: "usr_admin", name: "Priya", roles: ["ADMIN"] }, loading: false, can: () => true }),
}));
vi.mock("@/lib/use-feature", () => ({ useFeature: () => ({ enabled: false }) }));
vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});
vi.mock("@/components/charts/lazy", () => ({
    OverviewSeriesChart: ({ id }: { id: string }) => <div data-testid={`series-${id}`} />,
    ExploreChart: () => <div data-testid="explore-chart" />,
}));
vi.mock("@/services/cities", () => ({ citiesService: { list: async () => [] } }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const figure = (value: number, previous: number | null) => ({ value, previous, delta: previous === null ? null : value - previous });
    const list = <T,>(items: T[]) => ({ items, total: items.length, page: 1, pageSize: 100, counts: {} });
    const series = (values: number[]) => ({
        days: values.map((value, index) => ({ day: `2026-09-${String(9 + index).padStart(2, "0")}`, value })),
        previous: values.map((_, index) => ({ day: `2026-09-${String(2 + index).padStart(2, "0")}`, value: 1 })),
        total: figure(values.reduce((a, b) => a + b, 0), values.length),
    });
    const moneySeries = (values: string[]) => ({
        days: values.map((value, index) => ({ day: `2026-09-${String(9 + index).padStart(2, "0")}`, value })),
        previous: values.map((_, index) => ({ day: `2026-09-${String(2 + index).padStart(2, "0")}`, value: "0.00" })),
        total: { value: "250000.00", previous: "200000.00", delta: "50000.00" },
    });
    const overview = {
        section: "campaigns",
        window: { from: "2026-09-09", to: "2026-09-15", start: "", end: "", days: 7 },
        previousWindow: { from: "2026-09-02", to: "2026-09-08", start: "", end: "", days: 7 },
        city: null,
        generatedAt: "2026-09-15T10:00:00.000Z",
        tiles: {
            live: figure(12, null),
            scheduled: figure(5, null),
            awaitingPayment: figure(3, null),
            waitingToLaunch: figure(4, null),
            paid: figure(9, 7),
            completed: figure(6, 2),
            cancelled: figure(1, 1),
            scans: figure(900, 600),
            landingViews: figure(300, 200),
            ctaClicks: figure(50, 50),
            enquiries: figure(40, 30),
        },
        series: { bookedValue: moneySeries(["100000.00", "150000.00"]), scans: series([400, 500]) },
        money: { bookedValue: { value: "250000.00", previous: "200000.00", delta: "50000.00" } },
        work: {
            launchingSoon: { count: 2, horizonDays: 7, href: "/campaigns/directory?status=SCHEDULED&from=2026-10-02&to=2026-10-08" },
            endingSoon: { count: 3, horizonDays: 7, href: "/campaigns/directory?status=LIVE&sort=ENDING_SOON" },
            waitingToLaunch: {
                total: 4,
                href: "/campaigns/launch-queue",
                byReason: list([
                    { key: "KYC", label: "KYC", href: "/campaigns/launch-queue?reason=KYC", count: 3 },
                    { key: "ARTWORK", label: "Artwork", href: "/campaigns/launch-queue?reason=ARTWORK", count: 1 },
                ]),
            },
        },
        breakdowns: {
            byStatus: list([
                { key: "LIVE", label: "Live", href: "/campaigns/directory?status=LIVE", count: 12 },
                { key: "PENDING_PAYMENT", label: "Pending payment", href: "/campaigns/directory?status=PENDING_PAYMENT", count: 3 },
            ]),
            byCity: list([{ key: "bengaluru", label: "Bengaluru", href: "/campaigns?city=bengaluru", cityId: "city_blr", typed: [], count: 9, live: 6, bookedValue: "125000.00" }]),
            byGoal: list([{ key: "BRAND_AWARENESS", label: "Brand awareness", href: "/campaigns/directory?goal=BRAND_AWARENESS", count: 8, live: 5 }]),
            byAdvertiser: list([{ key: "adv_rao", label: "Rao Sweets", displayId: "ADV-0210-2601", href: "/advertisers/adv_rao", amount: "80000.00", count: 2 }]),
        },
    };
    const campaignsPage = { items: [], total: 0, page: 1, pageSize: 25, counts: {} };
    return {
        ...actual,
        api: {
            ...actual.api,
            get: async (path: string) => {
                backend.calls.push(path);
                if (path.startsWith("/section-overviews/campaigns")) return overview;
                if (path.startsWith("/campaigns?")) return campaignsPage;
                throw new Error(`unexpected GET ${path}`);
            },
        },
    };
});

import nextConfig from "../../../../next.config";
import CampaignsDirectoryPage from "./directory/page";
import CampaignsPage from "./page";

beforeEach(() => {
    backend.reset();
    router.pathname = "/campaigns";
    router.search = "";
});

describe("the tab strip", () => {
    it("runs Overview, Campaigns, Launch queue, Landing pages", async () => {
        render(<CampaignsPage />);
        const nav = screen.getAllByRole("navigation").find((node) => within(node).queryByRole("link", { name: "Overview" }))!;
        expect(within(nav).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
            ["Overview", "/campaigns"],
            ["Campaigns", "/campaigns/directory"],
            ["Launch queue", "/campaigns/launch-queue"],
            ["Landing pages", "/campaigns/landing-pages"],
        ]);
        expect(within(nav).getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
        await waitFor(() => expect(screen.getByText("Launching soon")).toBeInTheDocument());
    });
});

describe("/campaigns", () => {
    it("renders the overview over GET /section-overviews/campaigns", async () => {
        router.search = "window=7D";
        render(<CampaignsPage />);
        await waitFor(() => expect(screen.getByText("Launching soon")).toBeInTheDocument());
        expect(backend.calls).toHaveLength(1);
        expect(backend.calls[0]).toMatch(/^\/section-overviews\/campaigns\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/);

        /* The primary action, top right. */
        expect(screen.getByRole("link", { name: "New campaign" })).toHaveAttribute("href", "/campaigns/new");

        /* The state tiles open the list on their status; waiting to launch opens the queue. */
        expect(screen.getAllByText("Awaiting payment")[0]!.closest("a")).toHaveAttribute("href", "/campaigns/directory?status=PENDING_PAYMENT");
        expect(screen.getByText("Waiting to launch").closest("a")).toHaveAttribute("href", "/campaigns/launch-queue");
        expect(screen.getAllByText("₹2,50,000.00").length).toBeGreaterThanOrEqual(1);
        expect(screen.getByTestId("series-campaigns-booked")).toBeInTheDocument();
        expect(screen.getByTestId("series-campaign-scans")).toBeInTheDocument();
        expect(screen.getAllByTestId("stat-delta").map((node) => node.textContent)).toEqual(expect.arrayContaining(["+4", "+25%"]));

        /* The work lists. */
        expect(screen.getByText("Launching soon").closest("a")).toHaveAttribute("href", "/campaigns/directory?status=SCHEDULED&from=2026-10-02&to=2026-10-08");
        expect(screen.getByText("Ending soon").closest("a")).toHaveAttribute("href", "/campaigns/directory?status=LIVE&sort=ENDING_SOON");
        expect(screen.getByText("scheduled, starting in the next 7 days")).toBeInTheDocument();

        /* The reasons open the queue cut to them; a status the list; a city narrows the overview; an advertiser their page. */
        expect(screen.getByRole("link", { name: "Advertiser KYC" })).toHaveAttribute("href", "/campaigns/launch-queue?reason=KYC");
        expect(screen.getByRole("link", { name: "Awaiting payment" })).toHaveAttribute("href", "/campaigns/directory?status=PENDING_PAYMENT");
        expect(screen.getByRole("link", { name: "Bengaluru" })).toHaveAttribute("href", "/campaigns?window=7D&city=bengaluru");
        expect(screen.getByRole("link", { name: "Rao Sweets" })).toHaveAttribute("href", "/advertisers/adv_rao");
        expect(screen.getByRole("link", { name: "Brand awareness" })).toHaveAttribute("href", "/campaigns/directory?goal=BRAND_AWARENESS");
    });
});

describe("/campaigns/directory", () => {
    it("renders the list with Campaigns lit and asks nothing of the overview", async () => {
        router.pathname = "/campaigns/directory";
        render(<CampaignsDirectoryPage />);
        expect(screen.getByRole("link", { name: "Campaigns" })).toHaveAttribute("aria-current", "page");
        await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Campaigns" })).toBeInTheDocument());
        expect(backend.calls.some((path) => path.startsWith("/section-overviews"))).toBe(false);
        expect(backend.calls).toEqual(["/campaigns?sort=NEWEST&pageSize=25"]);
    });

    it("reads every facet off the URL — the advertiser page's link among them", async () => {
        router.pathname = "/campaigns/directory";
        router.search = "advertiserId=adv_rao&status=live&waitingOn=kyc&from=2026-10-01&to=bad&page=2";
        render(<CampaignsDirectoryPage />);
        await waitFor(() => expect(backend.calls.some((path) => path.startsWith("/campaigns?"))).toBe(true));
        expect(backend.calls.find((path) => path.startsWith("/campaigns?"))).toBe(
            "/campaigns?status=LIVE&advertiserId=adv_rao&from=2026-10-01&waitingOn=KYC&sort=NEWEST&pageSize=25&page=2",
        );
    });
});

describe("the old list addresses", () => {
    it("send a /campaigns link that named a facet of the list to the directory, query and all", async () => {
        const redirects = await nextConfig.redirects!();
        const campaigns = redirects.filter((rule) => rule.source === "/campaigns");
        expect(campaigns.map((rule) => [rule.has?.[0] && "key" in rule.has[0] ? rule.has[0].key : null, rule.destination])).toEqual([
            ["advertiserId", "/campaigns/directory"],
            ["status", "/campaigns/directory"],
            ["q", "/campaigns/directory"],
            ["waitingOn", "/campaigns/directory"],
            ["from", "/campaigns/directory"],
            ["to", "/campaigns/directory"],
        ]);
        /* `?city=` is the overview's own filter, so it stays. */
        expect(campaigns.some((rule) => rule.has?.some((has) => "key" in has && has.key === "city"))).toBe(false);
        expect(campaigns.every((rule) => rule.permanent === false)).toBe(true);
    });
});
