import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { Publisher } from "@/types";

/**
 * The publisher page over what `GET /publishers/:id` actually serves.
 *
 * What this pins is the row a fresh `POST /publishers` leaves behind: KYC
 * `PENDING`, a KYC row with no PAN typed in yet, no listings, no contact
 * person, no city. The page used to be written against a fixture row whose
 * `kycStatus` was lower-case and whose `pan` and `monthlyEarnings` were always
 * there, so opening a publisher created from the desk threw on the first KPI
 * (ERR-7F3A21C9). Now what the API does not carry reads as such, and a KYC
 * value the enum grows labels itself rather than taking the page down.
 *
 * The action widgets around the header read or write on their own and are
 * each tested where they live; here they are stubs so the page is the thing
 * under test.
 */

/* Lot N: the KYC tab's desk doors push to the workbench after a recording; the page renders under the App Router. */
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/publishers/pub_1",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/adx/account-closure", () => ({
    AccountClosure: ({ children }: { children: (closure: { requestClose?: () => void }) => React.ReactNode }) =>
        children({}),
}));
vi.mock("@/components/adx/view-as-panel", () => ({
    PUBLISHER_READS: [],
    ViewAs: ({ children }: { children: (props: { start?: () => void }) => React.ReactNode }) => children({}),
}));
vi.mock("@/components/adx/suspend-dialog", () => ({ SuspensionActions: () => null }));
vi.mock("@/components/adx/scan-for-signals", () => ({ ScanForSignalsButton: () => null }));
vi.mock("@/components/adx/activity-timeline", () => ({ ActivityTimeline: () => null }));
vi.mock("./subscription-card", () => ({ SubscriptionCard: () => null }));
/* R-C: the action log reads and writes on its own; tested in publisher-activity-log.test.tsx. */
vi.mock("./publisher-activity-log", () => ({ PublisherActivityLog: () => null }));

import { shapeListing, type AdminListing } from "@/services/listings";
import type { PublisherSummary } from "@/services/publishers";
import { PublisherDetail } from "./publisher-detail";

/** A listing as `GET /publishers/:id/listings` sends it — no publisher or agent join — through the desk's shaper. */
function site(overrides: Partial<Parameters<typeof shapeListing>[0]> = {}): AdminListing {
    return shapeListing({
        id: "lst_1",
        displayId: "LST-0001",
        title: "MG Road hoarding",
        category: "HOARDING",
        subType: "Unipole",
        status: "ACTIVE",
        address: "MG Road, Pune",
        city: "Pune",
        widthFt: "40.00",
        heightFt: "20.00",
        ratePerDay: "1500.00",
        submittedAt: null,
        createdAt: "2026-09-14T15:00:00.000Z",
        photos: [],
        ...overrides,
    });
}

/** Exactly what `shapePublisherDetail` makes of a publisher opened from the desk a moment ago. */
const fresh: Publisher = {
    id: "pub_new",
    displayId: "PUB-1409-2601",
    userId: null,
    user: null,
    openOrders: 0,
    name: "Sharma Hoardings",
    mobile: "+919845012345",
    email: null,
    city: null,
    type: "INDIVIDUAL",
    kycStatus: "PENDING",
    contactName: null,
    contactMobile: null,
    contactEmail: null,
    gstin: null,
    pan: null,
    sites: 0,
    agentId: null,
    onboardingStatus: "PENDING_ONBOARDING",
    createdAt: "2026-09-14T15:00:00.000Z",
    activatedAt: null,
    suspensionScopes: [],
    suspensionReason: null,
    suspendedAt: null,
    kyc: { state: "AWAITING_DOCUMENTS", kycId: null, submittedAt: null, requestedAt: null, requestedChannel: null, method: null },
};

/** `GET /publishers/:id/summary` as P-B serves it: money as decimal strings, the agent joined, the feed merged newest first. */
const summary: PublisherSummary = {
    publisher: { id: "pub_new", agent: { id: "agt_1", displayId: "AGT-0007", name: "Ravi Kulkarni" } },
    metrics: {
        earningsThisMonth: "12500.50",
        earningsLifetime: "248000.00",
        payoutsReleased: { lifetime: "200000.00", thisMonth: "10000.00" },
        walletBalance: "48000.50",
        withdrawable: "45000.00",
        listingsTotal: 3,
        listingsLive: 2,
        bookingsThisMonth: 4,
        bookingsLifetime: 31,
        ratingAvg: "4.60",
        subscription: { tier: "PLUS", endsAt: "2026-09-30T18:29:59.999Z" },
    },
    listings: [],
    activity: [
        { kind: "PAYOUT_RELEASED", at: "2026-09-14T09:00:00.000Z", title: "Payout released", detail: "₹10,000.00 to HDFC ••1234" },
        { kind: "BOOKING_AUTHORISED", at: "2026-09-12T06:30:00.000Z", title: "Booking authorised", detail: "MG Road hoarding · 14 days" },
        { kind: "FIELD_VISIT", at: "2026-09-10T04:00:00.000Z", title: "Onboarding visit", detail: null },
        { kind: "SOMETHING_NEW", at: "2026-09-09T04:00:00.000Z", title: "A kind the server grew", detail: null },
    ],
};

function draw(publisher: Publisher, sites: AdminListing[] = [], card: PublisherSummary | null = null) {
    return render(
        <PublisherDetail
            publisher={publisher}
            sites={sites}
            withdrawals={null}
            suspension={null}
            subscription={null}
            summary={card}
            onChanged={() => {}}
        />,
    );
}

/** The Identity card sits on the KYC tab, which Radix mounts only once it is picked — on pointer-down, not click. */
function openIdentity() {
    fireEvent.mouseDown(screen.getByRole("tab", { name: "KYC & documents" }), { button: 0 });
}

const row = (label: string) => within(screen.getByText(label).closest("div")!);

describe("PublisherDetail over a publisher opened from the desk", () => {
    it("renders the fresh row, saying what the API does not carry rather than throwing", () => {
        draw(fresh);

        expect(screen.getByRole("heading", { level: 1, name: "Sharma Hoardings" })).toBeInTheDocument();
        expect(screen.getByText("PUB-1409-2601")).toBeInTheDocument();
        expect(screen.getByText("0 sites, KYC pending")).toBeInTheDocument();

        // The KYC KPI: the enum value labelled, and no PAN invented.
        expect(screen.getByText("PAN not on file yet")).toBeInTheDocument();
        // The summary could not be read: the money tiles say so, never a zero beside real records.
        expect(screen.getAllByText("The summary could not be read")).toHaveLength(5);
        expect(screen.getByText("Earnings this month").nextElementSibling).toHaveTextContent("—");
        expect(screen.queryByTestId("subscription-line")).not.toBeInTheDocument();
        expect(screen.queryByText(/NaN|undefined/)).not.toBeInTheDocument();
    });

    it("fills the Identity card from the columns that hold each fact", () => {
        draw(fresh);
        openIdentity();

        expect(row("Owner").getByText("Sharma Hoardings")).toBeInTheDocument();
        expect(row("Phone").getByText("+919845012345")).toBeInTheDocument();
        expect(row("Business type").getByText("Individual")).toBeInTheDocument();
        expect(row("Onboarded by").getByText("Self-signup")).toBeInTheDocument();
        expect(row("PAN").getByText("-")).toBeInTheDocument();
        expect(row("GSTIN").getByText("-")).toBeInTheDocument();
    });

    it("names the contact person on a business, links the agent, and labels NEEDS_INFO", () => {
        draw({
            ...fresh,
            type: "BUSINESS",
            kycStatus: "NEEDS_INFO",
            city: "Pune",
            contactName: "Priya Sharma",
            contactEmail: "priya@sharma.in",
            pan: "ABCDE1234F",
            gstin: "27ABCDE1234F1Z5",
            agentId: "agt_1",
            sites: 3,
        });

        expect(screen.getByText("3 sites, KYC needs info · Pune")).toBeInTheDocument();
        expect(screen.getByText("PAN ABCDE1234F")).toBeInTheDocument();
        openIdentity();
        expect(row("Owner").getByText("Priya Sharma")).toBeInTheDocument();
        expect(row("Email").getByText("priya@sharma.in")).toBeInTheDocument();
        expect(row("Business type").getByText("Business")).toBeInTheDocument();
        expect(row("Onboarded by").getByRole("link", { name: "Agent · open profile" })).toHaveAttribute(
            "href",
            "/agents/agt_1",
        );
    });

    it("draws the Sites tab in the API's ten-status vocabulary, priced per day", () => {
        draw({ ...fresh, sites: 2 }, [
            site(),
            site({ id: "lst_2", title: "Station screen", subType: null, category: "DIGITAL_SCREEN", status: "PENDING_REVIEW", ratePerDay: null, widthFt: null, heightFt: null }),
        ]);

        // The Live sites KPI counts ACTIVE, not the fixture's "live".
        expect(screen.getByText("Live sites").nextElementSibling).toHaveTextContent("1");
        // Statuses labelled off the desk's own record — "ACTIVE" used to index a record keyed "live".
        expect(screen.getByText("Live")).toBeInTheDocument();
        expect(screen.getByText("Pending review")).toBeInTheDocument();
        expect(screen.getByText("Pune · 40 × 20 ft")).toBeInTheDocument();
        expect(screen.getByText("Unipole")).toBeInTheDocument();
        expect(screen.getByText("DIGITAL_SCREEN")).toBeInTheDocument();
        expect(screen.getByText("Rate / day")).toBeInTheDocument();
        expect(screen.getByText("₹1,500.00")).toBeInTheDocument();
        // An unpriced spot is unpriced, not ₹0.
        expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    });

    it("labels a KYC value the enum grew after the page was written instead of throwing", () => {
        draw({ ...fresh, kycStatus: "ESCALATED_TO_LEGAL" as Publisher["kycStatus"] });
        expect(screen.getByText("0 sites, KYC escalated to legal")).toBeInTheDocument();
    });

    /* P-C: the card reads `GET /publishers/:id/summary`. */
    it("prints the money tiles, the bookings and the tier line off the summary", () => {
        draw({ ...fresh, sites: 3 }, [], summary);

        const tile = (label: string) => screen.getByText(label).nextElementSibling;
        expect(tile("Earnings this month")).toHaveTextContent("₹12,500.50");
        expect(screen.getByText("net of commission, this calendar month")).toBeInTheDocument();
        expect(tile("Lifetime earnings")).toHaveTextContent("₹2,48,000.00");
        expect(screen.getByText("net · rated 4.60 / 5")).toBeInTheDocument();
        expect(tile("Payouts released")).toHaveTextContent("₹2,00,000.00");
        expect(screen.getByText("₹10,000.00 this month")).toBeInTheDocument();
        expect(tile("Wallet balance")).toHaveTextContent("₹48,000.50");
        expect(screen.getByText("₹45,000.00 withdrawable")).toBeInTheDocument();
        expect(tile("Bookings this month")).toHaveTextContent("4");
        expect(screen.getByText("31 lifetime")).toBeInTheDocument();
        expect(screen.getByTestId("subscription-line")).toHaveTextContent(/^Plus plan until 30 Sept? 2026$/);
        expect(screen.queryByText("The summary could not be read")).not.toBeInTheDocument();
    });

    it("says no reviews and no plan when the summary carries neither", () => {
        draw(fresh, [], { ...summary, metrics: { ...summary.metrics, ratingAvg: null, subscription: null } });

        expect(screen.getByText("net · no reviews yet")).toBeInTheDocument();
        expect(screen.queryByTestId("subscription-line")).not.toBeInTheDocument();
    });

    it("names the agent who onboarded the publisher, with the display id beside the link", () => {
        draw({ ...fresh, agentId: "agt_1" }, [], summary);
        openIdentity();

        expect(row("Onboarded by").getByRole("link", { name: "Ravi Kulkarni" })).toHaveAttribute("href", "/agents/agt_1");
        expect(row("Onboarded by").getByText("AGT-0007")).toBeInTheDocument();
        expect(screen.queryByText("Agent · open profile")).not.toBeInTheDocument();
    });

    it("reads a self-signup off the summary's null agent", () => {
        draw(fresh, [], { ...summary, publisher: { id: "pub_new", agent: null } });
        openIdentity();

        expect(row("Onboarded by").getByText("Self-signup")).toBeInTheDocument();
    });

    it("draws the summary's feed on the Activity tab, newest first, a grown kind labelled off itself", () => {
        draw(fresh, [], summary);
        fireEvent.mouseDown(screen.getByRole("tab", { name: "Activity" }), { button: 0 });

        const feed = within(screen.getByTestId("publisher-feed"));
        const rows = feed.getAllByRole("listitem");
        expect(rows).toHaveLength(4);
        expect(rows[0]).toHaveTextContent("Payout released");
        expect(rows[0]).toHaveTextContent("₹10,000.00 to HDFC ••1234");
        expect(rows[1]).toHaveTextContent("Booking authorised · MG Road hoarding · 14 days");
        expect(rows[2]).toHaveTextContent("Onboarding visit");
        expect(rows[2]).toHaveTextContent("Field visit");
        expect(rows[3]).toHaveTextContent("Something new");
        expect(rows[0].querySelector("time")).toHaveAttribute("dateTime", "2026-09-14T09:00:00.000Z");
    });

    it("says when the feed is empty and when the summary could not be read", () => {
        const { unmount } = draw(fresh, [], { ...summary, activity: [] });
        fireEvent.mouseDown(screen.getByRole("tab", { name: "Activity" }), { button: 0 });
        expect(within(screen.getByTestId("publisher-feed")).getByText("No activity on the account yet.")).toBeInTheDocument();
        unmount();

        draw(fresh);
        fireEvent.mouseDown(screen.getByRole("tab", { name: "Activity" }), { button: 0 });
        expect(screen.getByText(/could not be read just now/)).toBeInTheDocument();
    });
});
