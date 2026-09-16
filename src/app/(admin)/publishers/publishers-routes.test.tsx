import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Package O-C — the Publishers section's routes after the overview
 * landed at the root.
 *
 * What is pinned: `/publishers/directory` renders the table (the roster
 * read, the header, the tab strip with Directory lit); `/publishers`
 * renders the overview over `GET /section-overviews/publishers` with the
 * window in the query — the tiles with their deltas, the KYC mix into
 * the queue, the funnel, the breakdowns with the rows' links mapped to
 * console routes, and the top ten; and a read that fails shows the
 * boundary's error, never a stand-in.
 */

const { backend, router } = vi.hoisted(() => ({
    backend: {
        calls: [] as string[],
        fail: false,
        reset() {
            this.calls = [];
            this.fail = false;
        },
    },
    router: { replace: vi.fn(), push: vi.fn(), pathname: "/publishers", search: "" },
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: router.push, replace: router.replace, refresh: vi.fn() }),
    usePathname: () => router.pathname,
    useSearchParams: () => new URLSearchParams(router.search),
}));

vi.mock("@/lib/auth", () => ({
    useAuth: () => ({ user: { id: "usr_admin", name: "Priya", roles: ["ADMIN"] }, loading: false, can: () => true }),
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("@/components/charts/lazy", () => ({
    OverviewSeriesChart: ({ id }: { id: string }) => <div data-testid={`series-${id}`} />,
}));

vi.mock("@/services/cities", () => ({ citiesService: { list: async () => [] } }));

vi.mock("@/services/supply", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/supply")>();
    return { ...actual, supplyService: { ...actual.supplyService, roster: async () => [] } };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const figure = (value: number, previous: number | null) => ({ value, previous, delta: previous === null ? null : value - previous });
    const money = (value: string, previous: string | null) => ({ value, previous, delta: previous === null ? null : (Number(value) - Number(previous)).toFixed(2) });
    const series = (values: number[]) => ({
        days: values.map((value, index) => ({ day: `2026-09-${String(9 + index).padStart(2, "0")}`, value })),
        previous: values.map((_, index) => ({ day: `2026-09-${String(2 + index).padStart(2, "0")}`, value: 1 })),
        total: figure(values.reduce((a, b) => a + b, 0), values.length),
    });
    const list = <T,>(items: T[]) => ({ items, total: items.length, page: 1, pageSize: 100, counts: {} });
    const overview = {
        section: "publishers",
        window: { from: "2026-09-09", to: "2026-09-15", start: "", end: "", days: 7 },
        previousWindow: { from: "2026-09-02", to: "2026-09-08", start: "", end: "", days: 7 },
        city: null,
        generatedAt: "2026-09-15T10:00:00.000Z",
        tiles: { total: figure(120, 110), newInWindow: figure(12, 9), active: figure(80, null), kyc: { awaitingDocuments: 3, requested: 1, pending: 4, needsInfo: 0, rejected: 2, verified: 110 }, suspended: figure(2, null), closed: figure(1, null) },
        funnel: { accountsCreated: 120, kycVerified: 110, platformAgreementAccepted: 100, withInventory: 90, listingAgreementAccepted: 85, listingsLive: 240, stuckOnPublisher: { awaitingAgreement: 5, awaitingDocuments: 3 }, stuckOnAdx: { pendingDocumentReview: 4, awaitingSiteVerification: 2 } },
        series: { newPublishers: series([1, 2, 3, 1, 2, 2, 1]), firstListingsPublished: series([0, 1, 0, 1, 0, 0, 1]), firstBookings: series([0, 0, 1, 0, 0, 1, 0]) },
        breakdowns: {
            /* Lot X-B: keyed by the catalogue slug, plus the one "Other (typed)" bucket with its strings. */
            byCity: list([
                { key: "bengaluru", label: "Bengaluru", href: "/publishers?city=bengaluru", cityId: "city_blr", typed: [], count: 40, listings: 90, gmv: "125000.00" },
                { key: "other", label: "Other (typed)", href: null, cityId: null, typed: ["Bangalore Rural", "Blore"], count: 3, listings: 4, gmv: "1200.00" },
            ]),
            byCategory: list([{ key: "OUTDOOR", label: "Outdoor", href: "/listings?category=OUTDOOR", publishers: 60, listings: 120 }]),
            bySubscriptionTier: list([{ key: "PRO", label: "Pro", href: null, count: 20 }]),
            byAgent: list([{ key: "agt_1", label: "Ravi Kumar", displayId: "AGT-0001", href: "/agents/agt_1", count: 14 }]),
        },
        top: { byEarnings: list([{ key: "pub_1", label: "Sharma Hoardings", displayId: "PUB-0001", href: "/publishers/pub_1", amount: "42000.00" }]) },
        money: { earningsPaid: money("250000.00", "200000.00"), payoutsReleased: money("180000.00", "0.00") },
    };
    return {
        ...actual,
        api: {
            ...actual.api,
            get: async (path: string) => {
                backend.calls.push(path);
                if (path.startsWith("/section-overviews/publishers")) {
                    if (backend.fail) throw new actual.ApiError(503, "UNAVAILABLE", "The overview is being recalculated.");
                    return overview;
                }
                throw new Error(`unexpected GET ${path}`);
            },
        },
    };
});

import PublishersDirectoryPage from "./directory/page";
import PublishersPage from "./page";

beforeEach(() => {
    backend.reset();
    router.replace.mockReset();
    router.pathname = "/publishers";
    router.search = "";
});

describe("/publishers/directory", () => {
    it("renders the table with the tab strip, Directory lit, and asks nothing of the overview", async () => {
        router.pathname = "/publishers/directory";
        render(<PublishersDirectoryPage />);
        expect(screen.getByRole("link", { name: "Directory" })).toHaveAttribute("aria-current", "page");
        await waitFor(() => expect(screen.getByText("No publishers yet")).toBeInTheDocument());
        expect(screen.getByRole("heading", { level: 1, name: "Publishers" })).toBeInTheDocument();
        expect(backend.calls.some((path) => path.startsWith("/section-overviews"))).toBe(false);
    });
});

describe("/publishers", () => {
    it("renders the overview over GET /section-overviews/publishers with the window in the query", async () => {
        router.search = "window=7D";
        render(<PublishersPage />);
        expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
        await waitFor(() => expect(screen.getByText("New in window")).toBeInTheDocument());
        expect(backend.calls).toHaveLength(1);
        expect(backend.calls[0]).toMatch(/^\/section-overviews\/publishers\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/);
        /* No roster read: the overview is one read. */
        expect(screen.queryByText("No publishers yet")).toBeNull();

        /* The tiles with their deltas. */
        const tiles = screen.getAllByTestId("stat-delta");
        expect(tiles.map((node) => node.textContent)).toEqual(expect.arrayContaining(["+10", "+3", "+25%"]));
        expect(screen.getByText("₹2,50,000.00")).toBeInTheDocument();

        /* The KYC mix into the publishers' queue with the chip on. */
        expect(screen.getByRole("link", { name: "Pending review" })).toHaveAttribute("href", "/kyc?state=pending");

        /* The funnel as supply answers it. */
        expect(screen.getByText("Supply funnel")).toBeInTheDocument();
        expect(screen.getByText("Listing agreement")).toBeInTheDocument();

        /* The series cards draw the chart. */
        expect(screen.getByTestId("series-new-publishers")).toBeInTheDocument();

        /* The rows' links, mapped: a city narrows this overview; a category has no route and stays a label; an agent opens its page. */
        expect(screen.getByRole("link", { name: "Bengaluru" })).toHaveAttribute("href", "/publishers?window=7D&city=bengaluru");
        /* The Other bucket: no link, its typed strings on hover. */
        expect(screen.queryByRole("link", { name: "Other (typed)" })).toBeNull();
        expect(screen.getByText("Other (typed)")).toHaveAttribute("title", expect.stringContaining("Typed as Bangalore Rural, Blore"));
        expect(screen.queryByRole("link", { name: "Outdoor" })).toBeNull();
        expect(screen.getByText("Outdoor")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Ravi Kumar" })).toHaveAttribute("href", "/agents/agt_1");
        expect(screen.getByRole("link", { name: "Sharma Hoardings" })).toHaveAttribute("href", "/publishers/pub_1");
    });

    it("a read that fails shows the boundary's error and nothing else", async () => {
        backend.fail = true;
        render(<PublishersPage />);
        await waitFor(() => expect(screen.getByText("Could not load this view")).toBeInTheDocument());
        expect(screen.getByText("The overview is being recalculated.")).toBeInTheDocument();
        expect(screen.queryByText("New in window")).toBeNull();
    });
});
