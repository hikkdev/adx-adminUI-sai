import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

/**
 * 1 Oct 2026 — the print-partner roster's own facet in the one filter bar,
 * and the applications called out in one line above the table. 2 Oct 2026
 * (the owner: "again 3 different variations"): the "On the roster" dropdown
 * gave way to the shared Status select every directory draws, and the app
 * state took Type's slot — Search · Every door · Every KYC state · Any app
 * state · Any city · Status.
 *
 * What is pinned: the bar's order; the Status select shows the server's
 * counts and offers what the list route cuts (Active, Deactivated, Closed,
 * Everyone — a shop is never suspended), a pick going into the shared
 * filters; each row's account state draws the shared pill; the App state select
 * hands the page the value it names; the line counts the shops that applied
 * from the app (singular and plural), its Review button turns the App state
 * filter to "Applied from the app", and the line stays away when nobody
 * applied or that filter is already on; the header carries the one add
 * button.
 */

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/print-partners",
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/* The city field reads the catalogue only when the geo domain is live — kept on fixtures here. */
vi.mock("@/services/geo", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/geo")>();
    return { ...actual, geoReadsApi: () => false };
});

/* The add-partner dialog is not under test, and closed it should draw nothing. */
vi.mock("./partner-dialog", () => ({ PartnerDialog: () => null }));

import { PrintPartnersView, type SignInFilter } from "./print-partners-view";
import type { PartyRosterFilterState } from "@/components/adx/party-roster-filter-bar";
import type { PartyRosterView } from "@/components/adx/party-roster-table";
import { EMPTY_ROSTER_FILTERS } from "@/services/party-roster";
import type { PrintPartner } from "@/services/print-partners";

const base = {
    id: "prt_1",
    displayId: "PRT-2009-2601",
    userId: "usr_prt",
    name: "Balaji Prints",
    legalName: "Balaji Printers Pvt Ltd",
    gstin: null,
    panNumber: null,
    contactName: "Balaji",
    mobile: "+919845012345",
    email: "shop@balaji.in",
    city: "Pune",
    capabilities: [],
    maxWidthFt: null,
    turnaroundDays: null,
    isActive: true,
    activatedAt: null,
    appliedAt: null,
    acceptsQuoteRequests: true,
    rateCard: { hasRateCard: false },
    kycStatus: "PENDING",
    kyc: { status: null, submittedAt: null, method: null, requestedAt: null, state: "REQUESTED" },
    jobCount: 0,
    onboarding: { via: "IMPORT", viaLabel: "Import", byId: null, byName: null, byRole: null, at: "2026-09-20T09:00:00.000Z" },
    createdAt: "2026-09-20T09:00:00.000Z",
    updatedAt: "2026-09-20T09:00:00.000Z",
} as unknown as PrintPartner;

const partner = (id: string, name: string, patch: Partial<PrintPartner> = {}): PrintPartner => ({ ...base, id, name, displayId: null, ...patch });

/** Signed in (ACTIVE), invited (INVITED) and applied from the app (APPLIED) — per `signInState`. */
const signedIn = partner("prt_active", "Sai Signs", { activatedAt: "2026-09-21T09:00:00.000Z" });
const invited = partner("prt_invited", "Ganesh Flex");
const applied = (n: number) => partner(`prt_applied_${n}`, `Applied Shop ${n}`, { appliedAt: "2026-09-30T09:00:00.000Z" });

const viewOf = (rows: PrintPartner[]): PartyRosterView<PrintPartner> => ({
    rows,
    total: rows.length,
    hasMore: false,
    loadingMore: false,
    moreError: null,
    loadMore: () => undefined,
    refreshing: false,
    // The route's `statusCounts`, as `rosterPage` hands them to the Status select (Everyone their sum).
    statusCounts: { ACTIVE: 12, DEACTIVATED: 3, CLOSED: 2, ALL: 17 },
});

function renderView({ rows = [signedIn, invited], status = "ACTIVE", signIn = "ALL", waiting }: { rows?: PrintPartner[]; status?: string; signIn?: SignInFilter; waiting?: number } = {}) {
    // The notice reads the server's count of applications; by default the applied rows in hand stand in for it.
    const applicationsWaiting = waiting ?? rows.filter((row) => row.appliedAt && !row.activatedAt && row.isActive).length;
    const set = vi.fn();
    const filters: PartyRosterFilterState = {
        filters: { ...EMPTY_ROSTER_FILTERS, status },
        set,
        clear: () => undefined,
        query: { status: status as "ACTIVE" },
        key: `status=${status}`,
    };
    const onSignInChange = vi.fn();
    render(
        <PrintPartnersView
            view={viewOf(rows)}
            filters={filters}
            signIn={signIn}
            onSignInChange={onSignInChange}
            applicationsWaiting={applicationsWaiting}
            onChanged={() => undefined}
        />,
    );
    return { set, onSignInChange };
}

/** The bar's labelled controls, in document order. */
const controls = () =>
    Array.from(screen.getByTestId("party-roster-filters").querySelectorAll("input[aria-label], button[aria-label]")).map((element) => element.getAttribute("aria-label"));

/** Opens a Radix select by keyboard and picks an option — the way jsdom can drive it. */
async function choose(label: string, option: string) {
    fireEvent.keyDown(screen.getByRole("combobox", { name: label }), { key: "ArrowDown" });
    fireEvent.keyDown(await screen.findByRole("option", { name: option }), { key: "Enter" });
}

describe("the print-partner roster's filter bar", () => {
    it("draws the directories' one order, the app state in Type's slot and no Roster dropdown", () => {
        renderView();
        expect(controls()).toEqual(["Search", "Onboarded via", "KYC state", "App state", "City", "Status"]);
        expect(screen.queryByRole("combobox", { name: "Roster" })).toBeNull();
        expect(screen.queryByText("On the roster")).toBeNull();
    });

    it("shows the current choice on each trigger, Status with the server's count", () => {
        renderView({ status: "ACTIVE", signIn: "ALL" });
        expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent("Active · 12");
        expect(screen.getByRole("combobox", { name: "App state" })).toHaveTextContent("Any app state");
    });

    it("offers Active, Deactivated, Closed and Everyone, each with its count, and hands a pick to the shared filters", async () => {
        const { set, onSignInChange } = renderView({ status: "ACTIVE" });
        fireEvent.keyDown(screen.getByRole("combobox", { name: "Status" }), { key: "ArrowDown" });
        const options = await screen.findAllByRole("option");
        expect(options.map((option) => option.textContent)).toEqual([
            expect.stringMatching(/^Active12Working normally\./),
            expect.stringMatching(/^Deactivated3Switched off by the desk/),
            expect.stringMatching(/^Closed2Closed for good/),
            expect.stringMatching(/^Everyone17Every account/),
        ]);
        // A shop is never suspended by sections, so Suspended is not offered.
        expect(screen.queryByRole("option", { name: /^Suspended/ })).toBeNull();
        fireEvent.keyDown(screen.getByRole("option", { name: /^Deactivated/ }), { key: "Enter" });
        expect(set).toHaveBeenCalledWith({ status: "DEACTIVATED" });
        expect(onSignInChange).not.toHaveBeenCalled();
    });

    it("reads Deactivated on the trigger once picked", () => {
        renderView({ status: "DEACTIVATED" });
        expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent("Deactivated · 3");
    });

    it("reads Closed and Everyone on the trigger once picked", async () => {
        const { set } = renderView({ status: "CLOSED" });
        expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent("Closed · 2");
        fireEvent.keyDown(screen.getByRole("combobox", { name: "Status" }), { key: "ArrowDown" });
        fireEvent.keyDown(await screen.findByRole("option", { name: /^Everyone/ }), { key: "Enter" });
        expect(set).toHaveBeenCalledWith({ status: "ALL" });
    });

    it.each([
        ["Signed in", "ACTIVE"],
        ["Applied from the app", "APPLIED"],
        ["Invited, not signed in", "INVITED"],
    ])("App state › %s hands the page %s", async (option, value) => {
        const { set, onSignInChange } = renderView({ signIn: "ALL" });
        await choose("App state", option);
        expect(onSignInChange).toHaveBeenCalledWith(value);
        expect(set).not.toHaveBeenCalled();
    });

    it("App state › Any app state hands the page ALL", async () => {
        const { onSignInChange } = renderView({ signIn: "INVITED" });
        await choose("App state", "Any app state");
        expect(onSignInChange).toHaveBeenCalledWith("ALL");
    });
});

/* 2 Oct 2026: the roster row carries its `accountState`, and draws the pill every desk draws. */
describe("the print-partner rows' account state", () => {
    const rowOf = (name: string) => screen.getByText(name).closest("tr")!;

    it("draws Closed and Deactivated beside the KYC pill, and nothing on a working shop", () => {
        renderView({
            status: "ALL",
            rows: [
                partner("prt_ok", "Working Shop", { accountState: "ACTIVE" }),
                partner("prt_off", "Off Shop", { isActive: false, accountState: "DEACTIVATED" }),
                partner("prt_shut", "Shut Shop", { isActive: false, accountState: "CLOSED" }),
            ],
        });
        expect(within(rowOf("Working Shop")).queryByTestId("account-state-pill")).toBeNull();
        expect(within(rowOf("Off Shop")).getByTestId("account-state-pill")).toHaveTextContent("Deactivated");
        expect(within(rowOf("Shut Shop")).getByTestId("account-state-pill")).toHaveTextContent("Closed");
        // The pill speaks for the switch — never "Off the roster" beside it.
        expect(screen.queryByText("Off the roster")).toBeNull();
    });

    it("still says Off the roster for a row from a server that sends no state", () => {
        renderView({ status: "ALL", rows: [partner("prt_old", "Old Shop", { isActive: false })] });
        expect(within(rowOf("Old Shop")).getByText("Off the roster")).toBeInTheDocument();
        expect(within(rowOf("Old Shop")).queryByTestId("account-state-pill")).toBeNull();
    });
});

describe("the print-partner header", () => {
    it("carries the one primary add button and no import button — Import is the section's tab", () => {
        renderView();
        expect(screen.getAllByRole("button", { name: /add partner/i }).length).toBeGreaterThan(0);
        expect(screen.queryByRole("link", { name: /import/i })).toBeNull();
        expect(screen.queryByRole("button", { name: /import/i })).toBeNull();
    });
});

describe("the applications line", () => {
    it("counts one applied shop in the singular", () => {
        renderView({ rows: [signedIn, invited, applied(1)] });
        expect(screen.getByTestId("pp-applications-notice")).toHaveTextContent("1 shop applied from the app and waits for review");
    });

    it("counts several applied shops in the plural", () => {
        renderView({ rows: [signedIn, applied(1), applied(2), applied(3)] });
        expect(screen.getByTestId("pp-applications-notice")).toHaveTextContent("3 shops applied from the app and wait for review");
    });

    it("turns the App state filter to Applied from its Review button", () => {
        const { onSignInChange } = renderView({ rows: [invited, applied(1), applied(2)] });
        fireEvent.click(screen.getByRole("button", { name: "Review" }));
        expect(onSignInChange).toHaveBeenCalledWith("APPLIED");
    });

    it("stays away when no shop applied from the app", () => {
        renderView({ rows: [signedIn, invited] });
        expect(screen.queryByTestId("pp-applications-notice")).not.toBeInTheDocument();
    });

    it("stays away when the roster is empty", () => {
        renderView({ rows: [] });
        expect(screen.queryByTestId("pp-applications-notice")).not.toBeInTheDocument();
    });

    it("stays away once the App state filter is already Applied", () => {
        renderView({ rows: [applied(1), applied(2)], signIn: "APPLIED" });
        expect(screen.queryByTestId("pp-applications-notice")).not.toBeInTheDocument();
        // The applied shops are what the table shows instead.
        expect(screen.getByText("Applied Shop 1")).toBeInTheDocument();
    });

    it("counts the server's applications, not only the rows on this page", () => {
        renderView({ rows: [signedIn], waiting: 4 });
        expect(screen.getByTestId("pp-applications-notice")).toHaveTextContent("4 shops applied from the app and wait for review");
    });

    it("still shows under another App state filter", () => {
        renderView({ rows: [invited, applied(1)], signIn: "INVITED" });
        expect(screen.getByTestId("pp-applications-notice")).toHaveTextContent("1 shop applied from the app");
    });
});
