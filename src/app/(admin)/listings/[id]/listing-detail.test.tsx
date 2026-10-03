import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * The listing page, redesigned 3 Oct 2026 — the owner: "UI looks really
 * weird, I don't see any analytical stats for every listing, there's no
 * description data, there's no data on footfall", and "I need to see
 * everything what we store on a listing."
 *
 * Pinned:
 *  - the heading: the title (exactly as stored), the status pill, the LST-
 *    reference, the publisher as a link · city · category · rate; the four
 *    big number tiles are gone;
 *  - the actions top right: View publisher, Open on the marketplace for a
 *    live spot (the website's `/spaces/<LST-…>`), Open review case only
 *    while it waits on the desk;
 *  - the cover strip and the gallery lead with the cover, a click opens
 *    the lightbox with the capture stamp, and the arrows move through;
 *  - About prints the description whole and the content rules; every
 *    section prints its columns, an empty one "Not stated"; footfall and
 *    the audience profile; the documents open through the private-file
 *    viewer; the blocked dates; the site QR is "Issued", never the token;
 *  - "All recorded data" is closed until asked, then lists every column;
 *  - cards sit two to a row with the odd one out taking the row;
 *  - the Checks tab lists the site verifications and the claims.
 */

const { backend, router } = vi.hoisted(() => ({
    backend: { calls: [] as string[], record: {} as Record<string, unknown> },
    router: { push: vi.fn(), replace: vi.fn(), search: "" },
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: router.push, replace: router.replace, refresh: vi.fn() }),
    usePathname: () => "/listings/lst_1",
    useSearchParams: () => new URLSearchParams(router.search),
}));
vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true, siteUrl: "https://adx.in" }, isLive: () => true };
});
vi.mock("@/lib/use-feature", () => ({ useFeature: () => ({ enabled: false }) }));
vi.mock("@/lib/auth", () => ({
    useAuth: () => ({ user: { id: "usr_admin" }, can: () => true }),
    useOptionalAuth: () => ({ user: { id: "usr_admin" }, can: () => true }),
}));
vi.mock("@/components/charts/lazy", () => ({ OverviewSeriesChart: () => <div data-testid="series-chart" /> }));
vi.mock("@/components/adx/mini-map", () => ({
    MiniMap: ({ latitude, longitude }: { latitude: number; longitude: number }) => <div data-testid="mini-map">{`${latitude},${longitude}`}</div>,
}));
/* The cards that read their own routes are pinned by their own tests. */
vi.mock("./audience-card", () => ({ ListingAudienceCard: () => <div data-testid="audience-card" /> }));
vi.mock("./pricing-tab", () => ({ ListingPricingTab: () => <div data-testid="pricing-tab" /> }));
vi.mock("@/components/adx/activity-timeline", () => ({ ActivityTimeline: () => <div /> }));
vi.mock("@/components/adx/custom-fields-card", () => ({ CustomFieldsCard: () => <div data-testid="custom-fields" /> }));
vi.mock("@/components/adx/reviews-card", () => ({ ReviewsCard: () => <div data-testid="reviews" /> }));
vi.mock("@/components/adx/suspension-card", () => ({ SuspensionCard: () => <div data-testid="suspension-card" /> }));
vi.mock("@/components/adx/suspend-dialog", () => ({ SuspensionActions: () => <button type="button">Suspend</button> }));
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const get = async (path: string) => {
        backend.calls.push(path);
        if (path === "/listings/lst_1") return backend.record;
        if (path.startsWith("/orders?")) return { items: [], total: 0, page: 1, pageSize: 100, counts: {} };
        throw new actual.ApiError(404, "NOT_FOUND", "Not here");
    };
    return { ...actual, api: { get, post: get, patch: get, put: get, delete: get } };
});

import { LISTING_FIELDS } from "@/services/listing-record";
import { ListingDetailLoader, marketplaceUrl } from "./listing-detail-loader";
import { splitBlocks } from "./listing-sections";

const wireRecord = (over: Record<string, unknown> = {}) => ({
    id: "lst_1",
    displayId: "LST-2509-2601",
    title: "Web test � delete me",
    category: "OUTDOOR",
    subType: "Gantry",
    status: "ACTIVE",
    address: "12 MG Road",
    city: "Bengaluru",
    cityId: "c_blr",
    latitude: 12.9716,
    longitude: 77.5946,
    widthFt: "40.00",
    heightFt: "20.00",
    areaSqFt: "800.00",
    size: null,
    ratePerDay: "1200.00",
    submittedAt: "2026-09-24T10:00:00.000Z",
    createdAt: "2026-09-20T10:00:00.000Z",
    description: "A forty-foot gantry over the junction.\n\nLit till midnight; the long line is never cut short by the page.",
    uniqueSellingPoint: "Faces the signal",
    targetAudience: "Office commuters",
    footfallNote: "Peak at 6 pm",
    estimatedDailyFootfall: 45000,
    audienceDemographics: { ageBand: "25-34", genderSplit: "55/45" },
    illumination: "Front-lit",
    facing: "North",
    placement: "Lobby �",
    elevation: null,
    visibility: "200 m",
    trafficGrade: null,
    rightsBasis: "LEASED",
    rightsValidUntil: "2027-03-31T00:00:00.000Z",
    slotsTotal: 1,
    instantBooking: false,
    ratingAvg: "4.20",
    reviewCount: 5,
    suspensionScopes: [],
    hasSiteQr: true,
    carriesLoop: false,
    mediaType: { name: "Gantry", formatGroup: "Outdoor" },
    publisher: { id: "pub_1", name: "Sharma Hoardings", displayId: "PUB-1", city: "Bengaluru", type: "BUSINESS", isPartnerPublisher: false },
    agent: { id: "agt_1", displayId: "AGT-7", user: { name: "Lata Iyer" } },
    photos: [
        { id: "ph_front", url: "https://cdn.example/front.jpg", type: "FRONT", createdAt: "2026-09-02T00:00:00.000Z", takenAt: "2026-09-02T05:00:00.000Z", gps: { latitude: 12.97161, longitude: 77.59462, accuracyM: 8 } },
        { id: "ph_left", url: "https://cdn.example/left.jpg", type: "LEFT", createdAt: "2026-09-01T00:00:00.000Z", takenAt: null, gps: null },
    ],
    venueType: { id: "vt_1", name: "Junction", slug: "junction", category: "OUTDOOR" },
    contentRules: [{ stance: "NOT_ALLOWED", category: { id: "cc_1", name: "Alcohol", slug: "alcohol", isSensitive: true } }],
    documents: [
        { id: "doc_1", kind: "DISPLAY_AGREEMENT", url: "/api/v1/files/f_1", status: "VERIFIED", rejectionReason: null, expiresAt: "2027-03-31T00:00:00.000Z", submittedAt: "2026-09-20T00:00:00.000Z", reviewedAt: "2026-09-21T00:00:00.000Z", reviewedBy: { id: "usr_r", name: "Rhea Reviewer" } },
    ],
    blockedDates: [{ id: "blk_1", from: "2026-12-24T00:00:00.000Z", to: "2026-12-26T00:00:00.000Z", reason: "Festival", createdAt: "2026-10-01T00:00:00.000Z", createdBy: { id: "usr_p", name: "Pavan" } }],
    verifications: [
        { id: "lv_1", type: "AGENT_INITIAL", status: "ACCEPTED", photoUrl: "https://cdn.example/visit.jpg", latitude: 12.97, longitude: 77.59, distanceMeters: 14, qrScanned: true, capturedAt: "2026-09-22T00:00:00.000Z", orderId: null, reviewedAt: null, rejectionReason: null, createdAt: "2026-09-22T00:00:00.000Z", submittedBy: { id: "usr_a", name: "Imran" }, reviewedBy: null, photos: [] },
    ],
    claims: [{ id: "clm_1", status: "PENDING", decisionNote: null, decidedAt: null, createdAt: "2026-09-25T00:00:00.000Z", claimant: { id: "pub_9", name: "Rival Media", displayId: "PUB-9" } }],
    customFields: [],
    priceApprovals: [
        { id: "pa_1", status: "APPROVED", source: "PUBLISH_REQUEST", requestedRatePerDay: "900.00", cardRatePerDay: "1500.00", floorRatePerDay: "1000.00", reason: "Launch offer", decidedAt: "2026-09-23T00:00:00.000Z", decisionNote: "Fine for a month", graceUntil: null, heldByRunningOrder: false, createdAt: "2026-09-22T00:00:00.000Z", requestedBy: { id: "usr_p", name: "Pavan" }, decidedBy: { id: "usr_o", name: "Ops Desk" } },
    ],
    boosts: [{ id: "bst_1", displayId: "BST-0110-2601", placements: ["SEARCH_TOP"], status: "LIVE", startDate: "2026-10-01T00:00:00.000Z", endDate: "2026-10-07T00:00:00.000Z", days: 7, total: "700.00", paidAt: "2026-09-30T00:00:00.000Z", createdAt: "2026-09-30T00:00:00.000Z" }],
    counts: { orders: 3, verifications: 1, claims: 1, documents: 1, photos: 2, priceApprovals: 1, boosts: 1 },
    ...over,
});

beforeEach(() => {
    backend.calls = [];
    backend.record = wireRecord();
    router.push.mockReset();
    router.replace.mockReset();
    router.search = "";
});

async function renderPage() {
    render(<ListingDetailLoader id="lst_1" />);
    return screen.findByRole("heading", { level: 1 });
}

describe("the heading", () => {
    it("prints the title as stored, the status pill, the reference, and publisher · city · category · rate", async () => {
        const heading = await renderPage();
        expect(heading).toHaveTextContent("Web test � delete me");
        expect(within(heading).getByText("Live")).toBeInTheDocument();
        expect(heading.parentElement).toHaveTextContent("LST-2509-2601");
        const byline = screen.getByTestId("listing-byline");
        expect(within(byline).getByRole("link", { name: "Sharma Hoardings" })).toHaveAttribute("href", "/publishers/pub_1");
        expect(byline).toHaveTextContent("Bengaluru");
        expect(byline).toHaveTextContent("Outdoor · Gantry");
        expect(byline).toHaveTextContent("₹1,200.00 / day");
    });

    it("draws no big number tiles any more", async () => {
        await renderPage();
        expect(screen.queryByText("Orders on this spot")).not.toBeInTheDocument();
        expect(screen.queryByText("Rate / day")).not.toBeInTheDocument();
    });

    it("offers the marketplace page for a live spot, and the review case only while it waits", async () => {
        await renderPage();
        expect(screen.getByRole("link", { name: /Open on the marketplace/ })).toHaveAttribute("href", "https://adx.in/spaces/LST-2509-2601");
        expect(screen.getByRole("link", { name: "View publisher" })).toHaveAttribute("href", "/publishers/pub_1");
        expect(screen.queryByRole("link", { name: "Open review case" })).not.toBeInTheDocument();
        expect(marketplaceUrl({ status: "PENDING_REVIEW", displayId: "LST-1", id: "x" })).toBeNull();
    });
});

describe("the photographs", () => {
    it("leads the strip and the gallery with the cover, and opens the lightbox with the camera's stamp", async () => {
        await renderPage();
        const strip = screen.getByTestId("cover-strip");
        expect(within(strip).getByText("Cover")).toBeInTheDocument();
        const gallery = screen.getByTestId("photo-gallery");
        const figures = within(gallery).getAllByRole("listitem");
        expect(figures[0]).toHaveTextContent("Cover · Front");
        expect(figures[0]).toHaveTextContent("12.97161, 77.59462 (±8 m)");
        expect(figures[1]).toHaveTextContent("No GPS stamp");

        fireEvent.click(within(gallery).getByRole("button", { name: /Enlarge the front photograph/ }));
        const dialog = await screen.findByRole("dialog");
        expect(dialog).toHaveTextContent("Front · 1 of 2");
        expect(within(dialog).getByTestId("lightbox-stamp")).toHaveTextContent("12.97161, 77.59462");
        fireEvent.click(within(dialog).getByRole("button", { name: "Next photograph" }));
        expect(await screen.findByText("Left angle · 2 of 2")).toBeInTheDocument();
        expect(within(screen.getByRole("dialog")).getByTestId("lightbox-stamp")).toHaveTextContent("Not stamped");
    });

    it("says so when nothing is filed", async () => {
        backend.record = wireRecord({ photos: [] });
        await renderPage();
        expect(screen.getByTestId("cover-strip-empty")).toBeInTheDocument();
    });
});

describe("the Overview sections", () => {
    it("prints the description whole, the selling point, the venue and the content rules", async () => {
        await renderPage();
        const about = screen.getByText("About").closest("div.rounded-lg") as HTMLElement;
        expect(about).toHaveTextContent("A forty-foot gantry over the junction.");
        expect(about).toHaveTextContent("the long line is never cut short by the page.");
        expect(about).toHaveTextContent("Faces the signal");
        expect(about).toHaveTextContent("Junction");
        expect(within(screen.getByTestId("content-rules")).getByText("Alcohol")).toBeInTheDocument();
    });

    it("prints footfall, the audience profile and visibility, and Not stated where nothing was given", async () => {
        await renderPage();
        expect(screen.getByText("Daily footfall (stated)").nextSibling).toHaveTextContent("45,000");
        expect(screen.getByText("Peak at 6 pm")).toBeInTheDocument();
        expect(within(screen.getByTestId("demographics")).getByText("25-34")).toBeInTheDocument();
        expect(screen.getByText("Viewing distance").nextSibling).toHaveTextContent("200 m");
        expect(screen.getByText("Elevation").nextSibling).toHaveTextContent("Not stated");
        expect(screen.getByText("Placement").nextSibling).toHaveTextContent("Lobby �");
        expect(screen.getByTestId("audience-card")).toBeInTheDocument();
    });

    it("draws the listing form's other answers in their own card, and no card when there are none", async () => {
        backend.record = wireRecord({ extraAnswers: [{ key: "parking", label: "Is there parking nearby?", value: true }] });
        await renderPage();
        const card = screen.getByText("Other answers", { selector: "h3" }).closest("div.rounded-lg") as HTMLElement;
        expect(within(card).getByText("Is there parking nearby?").nextSibling).toHaveTextContent("Yes");
    });

    it("draws no Other answers card for a listing without any", async () => {
        await renderPage();
        expect(screen.queryByText("Is there parking nearby?")).not.toBeInTheDocument();
        expect(screen.queryByText("Questions the listing form asked that have no place of their own on the listing, with the answers given.")).not.toBeInTheDocument();
    });

    it("prints the new answers in the forms' words: traffic, distance, elevation, terms and the area covered", async () => {
        backend.record = wireRecord({ trafficGrade: "VERY_HIGH", elevation: "ROOFTOP", visibility: "OVER_300M", coverage: "Route 500D", termsAcceptedAt: "2026-10-02T10:00:00.000Z", termsVersion: "2026-09" });
        await renderPage();
        expect(screen.getByText("How busy").nextSibling).toHaveTextContent("Very high");
        expect(screen.getByText("Elevation").nextSibling).toHaveTextContent("Rooftop");
        expect(screen.getByText("Viewing distance").nextSibling).toHaveTextContent("Over 300 m");
        expect(screen.getByText("Area covered").nextSibling).toHaveTextContent("Route 500D");
        expect(screen.getByText("Terms version accepted").nextSibling).toHaveTextContent("2026-09");
    });

    it("pins the address on the map, never as two inputs", async () => {
        await renderPage();
        expect(screen.getByTestId("mini-map")).toHaveTextContent("12.9716,77.5946");
        expect(screen.queryByRole("spinbutton", { name: /latitude/i })).not.toBeInTheDocument();
    });

    it("lists the documents through the private-file viewer, the right's end and the blocked dates", async () => {
        await renderPage();
        const link = screen.getByRole("link", { name: "Display agreement" });
        expect(link).toHaveAttribute("href", "/api/v1/files/f_1");
        expect(screen.getByText("Right runs out on").nextSibling).toHaveTextContent("31 Mar 2027");
        expect(within(screen.getByTestId("blocked-dates")).getByText(/Festival/)).toBeInTheDocument();
    });

    it("reads the site QR as issued and never prints a token", async () => {
        backend.record = wireRecord({ qrToken: undefined });
        await renderPage();
        expect(screen.getByText("Site QR").nextSibling).toHaveTextContent("Issued");
    });

    it("keeps All recorded data closed until asked, then lists every column", async () => {
        await renderPage();
        expect(screen.queryByTestId("all-recorded-data")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /Show all/ }));
        const all = await screen.findByTestId("all-recorded-data");
        for (const field of LISTING_FIELDS) expect(within(all).getAllByText(field.label).length).toBeGreaterThan(0);
        expect(within(all).getByText("Rows on record")).toBeInTheDocument();
    });

    it("never leaves a half-empty row: the odd card out takes the whole row", async () => {
        await renderPage();
        const site = screen.getByRole("region", { name: "Site and visibility" });
        const grid = site.querySelector(".grid") as HTMLElement;
        const cells = Array.from(grid.children);
        // About, Site, Footfall and audience, Location, Slots and formats: five, so the fifth spans.
        expect(cells).toHaveLength(5);
        expect(cells[4]!.className).toContain("lg:col-span-2");
        expect(cells[3]!.className).not.toContain("lg:col-span-2");
    });
});

describe("the Checks tab", () => {
    it("lists the site verifications and the claims", async () => {
        await renderPage();
        fireEvent.mouseDown(screen.getByRole("tab", { name: "Checks" }));
        fireEvent.click(screen.getByRole("tab", { name: "Checks" }));
        expect(await screen.findByText("14 m from the pin · QR scanned")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Rival Media" })).toHaveAttribute("href", "/publishers/pub_9");
    });
});

describe("the Pricing tab", () => {
    it("adds the price approvals and the sponsored placements under the pricing panel", async () => {
        await renderPage();
        fireEvent.mouseDown(screen.getByRole("tab", { name: "Pricing" }));
        fireEvent.click(screen.getByRole("tab", { name: "Pricing" }));
        expect(await screen.findByTestId("pricing-tab")).toBeInTheDocument();
        expect(screen.getByText("₹900.00 / day")).toBeInTheDocument();
        expect(screen.getByText(/Fine for a month/)).toBeInTheDocument();
        expect(screen.getByText("BST-0110-2601")).toBeInTheDocument();
        expect(screen.getByText("Search top")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Sponsored desk" })).toHaveAttribute("href", "/ads/sponsored");
    });
});

describe("blocked dates", () => {
    it("puts the ones still to come first and the past after", () => {
        const block = (id: string, from: string, to: string) => ({ id, from, to, reason: null, createdAt: from, createdBy: null });
        const { upcoming, past } = splitBlocks([block("a", "2026-09-01", "2026-09-02"), block("b", "2026-10-10", "2026-10-11"), block("c", "2026-09-20", "2026-09-21")], "2026-10-03");
        expect(upcoming.map((b) => b.id)).toEqual(["b"]);
        expect(past.map((b) => b.id)).toEqual(["c", "a"]);
    });
});

describe("the read", () => {
    it("asks for the listing and its orders", async () => {
        await renderPage();
        await waitFor(() => expect(backend.calls).toEqual(expect.arrayContaining(["/listings/lst_1", "/orders?listingId=lst_1&pageSize=100&sort=NEWEST"])));
    });
});
