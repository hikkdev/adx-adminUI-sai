import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

/**
 * 2 Oct 2026 — the Listings section's routes after the overview landed at
 * the root, as Publishers did.
 *
 * Pinned: the tab strip in the owner's order (Overview, Listings, Review,
 * Verification, Renewals, Claims, Import — no Drafts tab); `/listings`
 * renders the overview over `GET /section-overviews/listings` with "Add
 * listing" at the top right, the tiles, the three queues each linking to
 * its tab, the status mix into the table, the breakdowns with their links,
 * and the top publishers; `/listings/directory` renders the table and asks
 * nothing of the overview.
 */

const { backend, router } = vi.hoisted(() => ({
    backend: {
        calls: [] as string[],
        reset() {
            this.calls = [];
        },
    },
    router: { replace: vi.fn(), push: vi.fn(), pathname: "/listings", search: "" },
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
}));
vi.mock("@/services/cities", () => ({ citiesService: { list: async () => [] } }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const figure = (value: number, previous: number | null) => ({ value, previous, delta: previous === null ? null : value - previous });
    const series = (values: number[]) => ({
        days: values.map((value, index) => ({ day: `2026-09-${String(9 + index).padStart(2, "0")}`, value })),
        previous: values.map((_, index) => ({ day: `2026-09-${String(2 + index).padStart(2, "0")}`, value: 1 })),
        total: figure(values.reduce((a, b) => a + b, 0), values.length),
    });
    const list = <T,>(items: T[]) => ({ items, total: items.length, page: 1, pageSize: 100, counts: {} });
    const overview = {
        section: "listings",
        window: { from: "2026-09-09", to: "2026-09-15", start: "", end: "", days: 7 },
        previousWindow: { from: "2026-09-02", to: "2026-09-08", start: "", end: "", days: 7 },
        city: null,
        generatedAt: "2026-09-15T10:00:00.000Z",
        tiles: {
            total: figure(240, 220),
            live: figure(180, null),
            awaitingReview: figure(7, null),
            suspended: figure(3, null),
            newInWindow: figure(20, 14),
            published: figure(12, 9),
            bookings: figure(31, 25),
        },
        series: { newListings: series([1, 2, 3, 4, 3, 4, 3]), published: series([1, 1, 2, 3, 2, 2, 1]) },
        work: { renewals: { due: 4, lapsed: 1, horizonDays: 60 }, claimsOpen: 2, verification: { due: 9, lapsed: 0, horizonDays: 15 } },
        breakdowns: {
            byStatus: list([
                { key: "PENDING_REVIEW", label: "Pending review", href: "/listings/directory?status=PENDING_REVIEW", count: 7 },
                { key: "ACTIVE", label: "Live", href: "/listings/directory?status=ACTIVE", count: 180 },
            ]),
            byCity: list([{ key: "bengaluru", label: "Bengaluru", href: "/listings?city=bengaluru", cityId: "city_blr", typed: [], count: 90, live: 70, gmv: "125000.00" }]),
            byCategory: list([{ key: "OUTDOOR", label: "Outdoor", href: "/listings/directory?category=OUTDOOR", count: 120, live: 100, gmv: "90000.00" }]),
            byPublisher: list([{ key: "pub_1", label: "Sharma Hoardings", displayId: "PUB-0001", href: "/publishers/pub_1", count: 14, live: 11 }]),
        },
        money: { gmv: { value: "250000.00", previous: "200000.00", delta: "50000.00" } },
    };
    const listingsPage = { items: [], total: 0, page: 1, pageSize: 100, counts: {} };
    const draftsPage = { items: [], total: 3, page: 1, pageSize: 1 };
    return {
        ...actual,
        api: {
            ...actual.api,
            get: async (path: string) => {
                backend.calls.push(path);
                if (path.startsWith("/section-overviews/listings")) return overview;
                if (path.startsWith("/listings/drafts/desk")) return draftsPage;
                if (path.startsWith("/listings?")) return listingsPage;
                throw new Error(`unexpected GET ${path}`);
            },
        },
    };
});

import ListingsDirectoryPage from "./directory/page";
import ListingsPage from "./page";

beforeEach(() => {
    backend.reset();
    router.pathname = "/listings";
    router.search = "";
});

describe("the tab strip", () => {
    it("runs Overview, Listings, Review, Verification, Renewals, Claims, Import — no Drafts", async () => {
        render(<ListingsPage />);
        const nav = screen.getAllByRole("navigation").find((node) => within(node).queryByRole("link", { name: "Overview" }))!;
        expect(within(nav).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
            ["Overview", "/listings"],
            ["Listings", "/listings/directory"],
            ["Review", "/listings/review"],
            ["Verification", "/listings/verification"],
            ["Renewals", "/listings/renewals"],
            ["Claims", "/listings/claims"],
            ["Import", "/listings/import"],
        ]);
        expect(within(nav).getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    });
});

describe("/listings", () => {
    it("renders the overview over GET /section-overviews/listings", async () => {
        router.search = "window=7D";
        render(<ListingsPage />);
        await waitFor(() => expect(screen.getByText("Awaiting review")).toBeInTheDocument());
        expect(backend.calls).toHaveLength(1);
        expect(backend.calls[0]).toMatch(/^\/section-overviews\/listings\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/);

        /* The primary action, top right. */
        expect(screen.getByRole("link", { name: "Add listing" })).toHaveAttribute("href", "/listings/new");

        /* The tiles, with their movement where the figure has a previous. */
        expect(screen.getAllByTestId("stat-delta").map((node) => node.textContent)).toEqual(expect.arrayContaining(["+20", "+6", "+25%"]));
        expect(screen.getByText("₹2,50,000.00")).toBeInTheDocument();

        /* The three queues, each its tab. */
        expect(screen.getByText("Renewals due").closest("a")).toHaveAttribute("href", "/listings/renewals");
        expect(screen.getByText("1 already lapsed · next 60 days")).toBeInTheDocument();
        expect(screen.getByText("Open claims").closest("a")).toHaveAttribute("href", "/listings/claims");
        expect(screen.getByText("Spot re-checks").closest("a")).toHaveAttribute("href", "/listings/verification");

        /* The status mix opens the table on the status; a city narrows the overview; a category opens the table; a publisher their page. */
        expect(screen.getByRole("link", { name: "Pending review" })).toHaveAttribute("href", "/listings/directory?status=PENDING_REVIEW");
        expect(screen.getByRole("link", { name: "Bengaluru" })).toHaveAttribute("href", "/listings?window=7D&city=bengaluru");
        expect(screen.getByRole("link", { name: "Outdoor" })).toHaveAttribute("href", "/listings/directory?category=OUTDOOR");
        expect(screen.getByRole("link", { name: "Sharma Hoardings" })).toHaveAttribute("href", "/publishers/pub_1");
        expect(screen.getByTestId("series-new-listings")).toBeInTheDocument();
    });
});

describe("/listings/directory", () => {
    it("renders the table with Listings lit, the drafts counted, and asks nothing of the overview", async () => {
        router.pathname = "/listings/directory";
        render(<ListingsDirectoryPage />);
        expect(screen.getByRole("link", { name: "Listings" })).toHaveAttribute("aria-current", "page");
        await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Listings" })).toBeInTheDocument());
        expect(backend.calls.some((path) => path.startsWith("/section-overviews"))).toBe(false);
        expect(backend.calls).toEqual(expect.arrayContaining([expect.stringMatching(/^\/listings\?sort=SUBMITTED&page=1&pageSize=100$/), "/listings/drafts/desk?sort=NEWEST&page=1&pageSize=1"]));
    });
});
