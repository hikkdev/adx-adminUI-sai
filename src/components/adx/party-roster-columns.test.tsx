import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

/**
 * 29 Sep 2026 — the party rosters, made uniform. The owner, comparing
 * Publishers › Directory with Advertisers: "Why this table columns look
 * different than advertisers?"
 *
 * What is pinned: every desk builds its columns from one helper and draws
 * the same headers in the same order — Name · Contact · Type · City · KYC
 * status · Activity · Joined · Onboarded — with Type left out only for the
 * print partners, who have no type; a desk's own extras stay hidden until
 * the "Columns" menu turns them on; the Name cell labels the account ID by
 * the ID rule (and says when none is issued); Contact prints every number
 * `+91 98765 43210`, the bare ten digits too; and the KYC pill is the
 * queue's state on every desk.
 *
 * 2 Oct 2026 — the owner, with Print partners, Advertisers and Publishers
 * side by side: "again 3 different variations". Pinned below as well: the
 * row's "⋯" menu is one helper's on all four desks — Actions · View
 * details · Review KYC · a separator · the party's status action(s), the
 * stopping one in the danger style, nothing in the slot on a closed account
 * or without the permission; Review KYC opens the case when there is one
 * and the queue searched for the party when there is not; and each
 * directory's header carries its one primary add button and no import.
 */

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/",
    useSearchParams: () => new URLSearchParams(),
}));

/* The city field reads the catalogue only when the geo domain is live — kept on fixtures here. */
vi.mock("@/services/geo", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/geo")>();
    return { ...actual, geoReadsApi: () => false };
});

/* The add dialogs are not under test, and closed they should draw nothing. */
vi.mock("@/app/(admin)/publishers/create-publisher-dialog", () => ({ CreatePublisherDialog: () => null }));
vi.mock("@/app/(admin)/advertisers/create-advertiser-dialog", () => ({ CreateAdvertiserDialog: () => null }));
vi.mock("@/app/(admin)/agents/create-agent-dialog", () => ({ CreateAgentDialog: () => null }));
vi.mock("@/app/(admin)/print-partners/partner-dialog", () => ({ PartnerDialog: () => null }));

import { DataTable } from "@/components/adx/data-table";
import {
    PARTY_ROSTER_COLUMNS,
    hiddenExtras,
    partyRosterColumns,
    partyRosterHeaders,
    rosterRowMenu,
    type PartyRosterSpec,
    type RosterMenuEntry,
} from "@/components/adx/party-roster-columns";
import { kycReviewHref, suspensionRowActions, type SuspensionRowFacts } from "@/components/adx/party-roster-row-actions";
import { PublishersTable, publisherKycHref, publisherRosterSpec, publisherSuspensionFacts } from "@/app/(admin)/publishers/publishers-table";
import { AdvertisersTable, advertiserKycHref, advertiserRosterSpec, advertiserSuspensionFacts } from "@/app/(admin)/advertisers/advertisers-table";
import { PrintPartnersView, printPartnerKycHref, printPartnerRosterSpec, printPartnerStatusActions } from "@/app/(admin)/print-partners/print-partners-view";
import { AgentsTable, agentKycHref, agentRosterSpec, agentSuspensionFacts } from "@/app/(admin)/agents/agents-table";
import type { PartyRosterFilterState } from "@/components/adx/party-roster-filter-bar";
import type { PartyRosterView } from "@/components/adx/party-roster-table";
import { EMPTY_ROSTER_FILTERS } from "@/services/party-roster";
import type { RosterPublisher } from "@/services/supply";
import type { PrintPartner } from "@/services/print-partners";
import type { Advertiser, Agent, KycSummary } from "@/types";

const kyc = (state: KycSummary["state"]): KycSummary => ({ state, kycId: null, submittedAt: null, requestedAt: null, requestedChannel: null, method: null });
const noop = () => undefined;

const publisher: RosterPublisher = {
    id: "pub_1",
    displayId: null,
    userId: null,
    name: "Suraj Kumar Prints",
    mobile: "9507842149",
    email: "suraj@example.com",
    city: "Bengaluru",
    type: "BUSINESS",
    kycStatus: "PENDING",
    kyc: kyc("AWAITING_DOCUMENTS"),
    onboardingStatus: null,
    listingCount: 3,
    onboardedByAgent: false,
    onboarding: { via: "DESK", viaLabel: "Desk", byId: "usr_asha", byName: "Asha Rao", byRole: "Ops manager", at: "2026-09-12T09:00:00.000Z" },
    entityType: null,
    entityTypeStored: false,
    createdAt: "2026-09-12T09:00:00.000Z",
    suspensionScopes: [],
    suspensionReason: null,
    suspendedAt: null,
};

const advertiser = {
    id: "adv_1",
    name: "Swiggy",
    displayId: "ADV-1409-2601",
    contact: "+919812340001",
    email: null,
    type: "COMMERCIAL",
    companyName: "Swiggy Ltd",
    industry: null,
    gstin: null,
    city: "Pune",
    state: null,
    kycStatus: "VERIFIED",
    kyc: kyc("VERIFIED"),
    status: "active",
    activatedAt: "2026-09-14T09:00:00.000Z",
    joinedAt: "2026-09-14T09:00:00.000Z",
    onboarding: { via: "SELF", viaLabel: "Self-serve", byId: null, byName: null, byRole: null, at: null },
    campaignCount: 1,
    suspensionScopes: [],
    suspensionReason: null,
    suspendedAt: null,
} as unknown as Advertiser;

const partner = {
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

const agent = {
    id: "agt_1",
    userId: "usr_agt",
    kyc: kyc("PENDING"),
    displayId: "AGT-0709-2601",
    name: "Ravi",
    mobile: "+919000000001",
    email: "ravi@example.com",
    city: "Pune",
    state: null,
    tier: "BRONZE",
    tierLevel: "I",
    status: "on_leave",
    referralCode: null,
    joinedAt: "2026-09-07T09:00:00.000Z",
    territory: null,
    homeZone: null,
    radiusKm: null,
    workingDays: [],
    hoursFrom: null,
    hoursTo: null,
    autoAcceptInZone: false,
    orderTypes: [],
    maxActiveOrders: null,
    businessName: null,
    engagement: null,
    side: "ADVERTISER",
    sourceKind: "FLEET",
    onboardedCount: 6,
    suspensionScopes: [],
    suspensionReason: null,
    suspendedAt: null,
} as unknown as Agent;

/** The suspension slot as a desk with the permission builds it. */
const suspendSlot = (allowed = true) => (facts: SuspensionRowFacts) => suspensionRowActions(facts, { allowed, live: true, onSuspend: noop, onReinstate: noop });
/** The print partner's slot as the desk with the permission builds it. */
const partnerSlot = (allowed = true) => (row: PrintPartner) =>
    printPartnerStatusActions(row, { allowed, busy: false, onActivate: noop, onDeactivate: noop, onReactivate: noop });

const DESKS = [
    {
        desk: "Publishers",
        spec: publisherRosterSpec(noop, noop, (row) => suspendSlot()(publisherSuspensionFacts(row))) as PartyRosterSpec<unknown>,
        row: publisher as unknown,
        hasType: true,
    },
    {
        desk: "Advertisers",
        spec: advertiserRosterSpec(noop, noop, (row) => suspendSlot()(advertiserSuspensionFacts(row))) as PartyRosterSpec<unknown>,
        row: advertiser as unknown,
        hasType: true,
    },
    {
        desk: "Print partners",
        spec: printPartnerRosterSpec(noop, noop, partnerSlot()) as PartyRosterSpec<unknown>,
        row: partner as unknown,
        hasType: false,
    },
    {
        desk: "Agents",
        spec: agentRosterSpec(noop, noop, (row) => suspendSlot()(agentSuspensionFacts(row))) as PartyRosterSpec<unknown>,
        row: agent as unknown,
        hasType: true,
    },
];

function renderDesk(spec: PartyRosterSpec<unknown>, row: unknown) {
    return render(<DataTable columns={partyRosterColumns(spec)} data={[row]} initialColumnVisibility={hiddenExtras(spec)} />);
}

const headers = () =>
    screen
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent?.trim() ?? "")
        .filter(Boolean);

describe("the party rosters' one column layout", () => {
    it("names the columns once, in order", () => {
        expect(PARTY_ROSTER_COLUMNS.map((column) => column.header)).toEqual(["Name", "Contact", "Type", "City", "KYC status", "Activity", "Joined", "Onboarded"]);
        expect(partyRosterHeaders(false)).toEqual(["Name", "Contact", "City", "KYC status", "Activity", "Joined", "Onboarded"]);
    });

    it.each(DESKS)("$desk draws the shared headers in the shared order", ({ spec, row, hasType }) => {
        renderDesk(spec, row);
        expect(headers()).toEqual(partyRosterHeaders(hasType));
    });

    it("draws the same headers on every desk that has a type, and the print partners' only without Type", () => {
        const drawn = DESKS.map(({ spec, row }) => {
            const { unmount } = renderDesk(spec, row);
            const out = headers();
            unmount();
            return out;
        });
        expect(drawn[0]).toEqual(drawn[1]);
        expect(drawn[0]).toEqual(drawn[3]);
        expect(drawn[2]).toEqual(drawn[0]!.filter((header) => header !== "Type"));
    });

    it("keeps a desk's own columns hidden until the Columns menu turns them on", () => {
        const spec = printPartnerRosterSpec(noop, noop);
        expect(hiddenExtras(spec)).toEqual({ "legal-name": false, "contact-person": false, prints: false, "gstin-pan": false, app: false, "last-sign-in": false, quotes: false });
        expect(hiddenExtras(agentRosterSpec(noop, noop))).toEqual({ zone: false, works: false, tier: false });
        expect(hiddenExtras(publisherRosterSpec(noop, noop))).toEqual({});
    });
});

describe("the shared cells", () => {
    it("labels the account ID by the ID rule, and says when none is issued", () => {
        renderDesk(DESKS[0]!.spec, publisher);
        expect(screen.getByText("Publisher account ID not issued yet")).toBeInTheDocument();
    });

    it("prints the ID with its label beneath the name", () => {
        renderDesk(DESKS[1]!.spec, advertiser);
        const cell = screen.getByText("ADV-1409-2601").parentElement!;
        expect(cell.textContent).toBe("Advertiser account ID ADV-1409-2601");
        // Verified: the tick beside the name.
        expect(screen.getByTestId("verified-tick")).toBeInTheDocument();
    });

    it("prints a number stored without +91 the same way as one stored canonically, with the email beneath", () => {
        renderDesk(DESKS[0]!.spec, publisher);
        expect(screen.getByText("+91 95078 42149")).toBeInTheDocument();
        expect(screen.getByText("suraj@example.com")).toBeInTheDocument();
        renderDesk(DESKS[3]!.spec, agent);
        expect(screen.getByText("+91 90000 00001")).toBeInTheDocument();
    });

    it("keeps Contact two lines when there is no email", () => {
        renderDesk(DESKS[1]!.spec, advertiser);
        expect(screen.getByText("+91 98123 40001")).toBeInTheDocument();
        expect(screen.getByText("No email")).toBeInTheDocument();
    });

    it("draws the queue's KYC pill, the activity count, the type and the door on each desk", () => {
        renderDesk(DESKS[0]!.spec, publisher);
        const row = screen.getAllByRole("row")[1]!;
        expect(within(row).getByText("Awaiting documents")).toBeInTheDocument();
        expect(within(row).getByText("3 spots")).toBeInTheDocument();
        expect(within(row).getByText("Business")).toBeInTheDocument();
        expect(within(row).getByText("Desk · Asha Rao (Ops manager)")).toBeInTheDocument();
    });

    it("gives the print partner its jobs and its door, and no type", () => {
        renderDesk(DESKS[2]!.spec, partner);
        const row = screen.getAllByRole("row")[1]!;
        expect(within(row).getByText("Requested")).toBeInTheDocument();
        expect(within(row).getByText("0 jobs")).toBeInTheDocument();
        expect(within(row).getByText("Import")).toBeInTheDocument();
        expect(within(row).getByText("Print partner ID", { exact: false })).toBeInTheDocument();
    });

    it("gives the agent its side, its accounts, its source and its work status beside the KYC pill", () => {
        renderDesk(DESKS[3]!.spec, agent);
        const row = screen.getAllByRole("row")[1]!;
        expect(within(row).getByText("Advertiser side")).toBeInTheDocument();
        expect(within(row).getByText("6 accounts")).toBeInTheDocument();
        expect(within(row).getByText("Fleet partner")).toBeInTheDocument();
        expect(within(row).getByText("Pending review")).toBeInTheDocument();
        expect(within(row).getByText("On leave")).toBeInTheDocument();
    });
});

/**
 * 2 Oct 2026 (the account lifecycle): a row's `accountState` draws its pill
 * beside the KYC pill on the three desks with the Status select, and speaks
 * for the suspension while it shows — never "Suspended" twice.
 */
describe("the account-state pill", () => {
    it.each([
        ["Publishers", { ...publisher, accountState: "CLOSED" }, "Closed"],
        ["Advertisers", { ...advertiser, accountState: "DEACTIVATED" }, "Deactivated"],
        ["Agents", { ...agent, status: "active", accountState: "EXITED" }, "Left"],
        ["Print partners", { ...partner, isActive: false, accountState: "CLOSED" }, "Closed"],
        ["Print partners", { ...partner, isActive: false, accountState: "DEACTIVATED" }, "Deactivated"],
    ] as const)("%s: drawn beside the KYC pill", (desk, row, label) => {
        const spec = DESKS.find((entry) => entry.desk === desk)!.spec;
        renderDesk(spec, row);
        expect(within(screen.getAllByRole("row")[1]!).getByTestId("account-state-pill")).toHaveTextContent(label);
    });

    it("a suspended row says Suspended once, with the sections on the tooltip", () => {
        renderDesk(DESKS[0]!.spec, { ...publisher, accountState: "SUSPENDED", suspensionScopes: ["BLOCK_NEW", "FREEZE_WALLET"] });
        const row = screen.getAllByRole("row")[1]!;
        expect(within(row).getAllByText("Suspended")).toHaveLength(1);
        expect(within(row).getByTestId("account-state-pill").getAttribute("title")).toMatch(/Stopped:/);
    });

    it("a suspended agent says Suspended once too — the work status gives way to the pill", () => {
        renderDesk(DESKS[3]!.spec, { ...agent, status: "suspended", accountState: "SUSPENDED" });
        expect(within(screen.getAllByRole("row")[1]!).getAllByText("Suspended")).toHaveLength(1);
    });

    it("a working row draws no pill, and a frozen wallet alone still shows the suspension chip", () => {
        renderDesk(DESKS[0]!.spec, { ...publisher, accountState: "ACTIVE", suspensionScopes: ["FREEZE_WALLET"] });
        const row = screen.getAllByRole("row")[1]!;
        expect(within(row).queryByTestId("account-state-pill")).toBeNull();
        expect(within(row).getByText("Suspended")).toBeInTheDocument();
    });
});

/* ------------------------------------------------------------------ */
/* The row menu                                                        */
/* ------------------------------------------------------------------ */

/** A menu as words: "#" for the heading, "—" for a separator, "!" after a danger item. */
const shape = (entries: RosterMenuEntry[]) =>
    entries.map((entry) => (entry.kind === "label" ? `#${entry.label}` : entry.kind === "separator" ? "—" : `${entry.label}${entry.destructive ? "!" : ""}`));

const SHARED_HEAD = ["#Actions", "View details", "Review KYC"];

describe("the party rosters' one row menu", () => {
    it.each([
        ["Publishers", ["—", "Suspend…!"]],
        ["Advertisers", ["—", "Suspend…!"]],
        // An invited shop not yet switched on: Activate, then the stopping action.
        ["Print partners", ["—", "Activate", "Deactivate!"]],
        ["Agents", ["—", "Suspend…!"]],
    ] as const)("%s: Actions · View details · Review KYC · separator · the status slot", (desk, slot) => {
        const { spec, row } = DESKS.find((entry) => entry.desk === desk)!;
        expect(shape(rosterRowMenu(spec, row))).toEqual([...SHARED_HEAD, ...slot]);
    });

    it("draws the same head on every desk, and the status slot after the one separator", () => {
        const menus = DESKS.map(({ spec, row }) => shape(rosterRowMenu(spec, row)));
        for (const menu of menus) {
            expect(menu.slice(0, 3)).toEqual(SHARED_HEAD);
            expect(menu[3]).toBe("—");
            expect(menu.filter((entry) => entry === "—")).toHaveLength(1);
        }
    });

    it("offers Reinstate once a section is in force, never Suspend beside it", () => {
        for (const desk of ["Publishers", "Advertisers", "Agents"]) {
            const { spec, row } = DESKS.find((entry) => entry.desk === desk)!;
            const suspended = { ...(row as object), suspensionScopes: ["BLOCK_NEW"], accountState: "SUSPENDED" };
            expect(shape(rosterRowMenu(spec, suspended))).toEqual([...SHARED_HEAD, "—", "Reinstate"]);
        }
    });

    it("a signed-in shop is Deactivated, one off the roster Reactivated — in the same slot", () => {
        const spec = DESKS[2]!.spec;
        expect(shape(rosterRowMenu(spec, { ...partner, activatedAt: "2026-09-21T09:00:00.000Z" }))).toEqual([...SHARED_HEAD, "—", "Deactivate!"]);
        expect(shape(rosterRowMenu(spec, { ...partner, isActive: false }))).toEqual([...SHARED_HEAD, "—", "Reactivate"]);
        expect(shape(rosterRowMenu(spec, { ...partner, isActive: false, accountState: "DEACTIVATED" }))).toEqual([...SHARED_HEAD, "—", "Reactivate"]);
    });

    it("a closed shop offers neither Activate, Deactivate nor Reactivate — the server would refuse them", () => {
        // An invited shop whose account was closed: switched off, never activated.
        const closed = { ...partner, isActive: false, activatedAt: null, accountState: "CLOSED" } as PrintPartner;
        expect(printPartnerStatusActions(closed, { allowed: true, busy: false, onActivate: noop, onDeactivate: noop, onReactivate: noop })).toEqual([]);
        expect(shape(rosterRowMenu(DESKS[2]!.spec, closed))).toEqual(SHARED_HEAD);
    });

    it("draws no status slot, and no separator, on a closed account", () => {
        for (const [desk, state] of [
            ["Publishers", "CLOSED"],
            ["Advertisers", "CLOSED"],
            ["Print partners", "CLOSED"],
            ["Agents", "CLOSED"],
            ["Agents", "EXITED"],
        ] as const) {
            const { spec, row } = DESKS.find((entry) => entry.desk === desk)!;
            expect(shape(rosterRowMenu(spec, { ...(row as object), accountState: state }))).toEqual(SHARED_HEAD);
        }
    });

    it("draws no status slot without the permission, on any desk", () => {
        const specs = [
            publisherRosterSpec(noop, noop, (row) => suspendSlot(false)(publisherSuspensionFacts(row))),
            advertiserRosterSpec(noop, noop, (row) => suspendSlot(false)(advertiserSuspensionFacts(row))),
            printPartnerRosterSpec(noop, noop, partnerSlot(false)),
            agentRosterSpec(noop, noop, (row) => suspendSlot(false)(agentSuspensionFacts(row))),
        ] as PartyRosterSpec<unknown>[];
        specs.forEach((spec, index) => expect(shape(rosterRowMenu(spec, DESKS[index]!.row))).toEqual(SHARED_HEAD));
    });

    it.each(DESKS)("$desk: the rendered menu is the shared one — same heading, items, separator and width", async ({ spec, row }) => {
        renderDesk(spec, row);
        const trigger = screen.getByRole("button", { name: "Row actions" });
        fireEvent.keyDown(trigger, { key: "ArrowDown" });
        const menu = await screen.findByTestId("roster-row-menu");
        expect(menu.className).toContain("w-52");
        expect(within(menu).getByText("Actions")).toBeInTheDocument();
        const items = within(menu).getAllByRole("menuitem").map((item) => item.textContent);
        expect(items.slice(0, 2)).toEqual(["View details", "Review KYC"]);
        expect(within(menu).getAllByRole("separator")).toHaveLength(1);
        const danger = within(menu).getAllByRole("menuitem").filter((item) => item.className.includes("text-danger"));
        expect(danger.map((item) => item.textContent)).toEqual([spec === DESKS[2]!.spec ? "Deactivate" : "Suspend…"]);
    });
});

describe("Review KYC", () => {
    const withCase = { state: "PENDING", kycId: "kyc_9" };

    it("opens each party's case when there is one", () => {
        expect(publisherKycHref({ ...publisher, kyc: { ...publisher.kyc, ...withCase } } as RosterPublisher)).toBe("/kyc/pub_1");
        expect(advertiserKycHref({ ...advertiser, kyc: { ...advertiser.kyc!, ...withCase } } as Advertiser)).toBe("/kyc/advertisers/adv_1");
        expect(printPartnerKycHref({ ...partner, kyc: { ...partner.kyc!, kycId: "ppk_7" } })).toBe("/kyc/print-partners/ppk_7");
        expect(agentKycHref({ ...agent, kyc: { ...agent.kyc, ...withCase } } as Agent)).toBe("/kyc/agents/agt_1");
    });

    it("sends a party with no case to its queue, searched for its account ID (or its name before one is issued)", () => {
        expect(publisherKycHref(publisher)).toBe("/kyc?q=Suraj%20Kumar%20Prints");
        expect(advertiserKycHref(advertiser)).toBe("/kyc/advertisers?q=ADV-1409-2601");
        expect(printPartnerKycHref(partner)).toBe("/kyc/print-partners?q=PRT-2009-2601");
        expect(agentKycHref(agent)).toBe("/kyc/agents?q=AGT-0709-2601");
        expect(kycReviewHref("AGENT", { id: "agt_1", kycId: null, search: "  " })).toBe("/kyc/agents");
    });
});

/* ------------------------------------------------------------------ */
/* The header                                                          */
/* ------------------------------------------------------------------ */

const emptyView = <T,>(): PartyRosterView<T> => ({
    rows: [],
    total: 0,
    hasMore: false,
    loadingMore: false,
    moreError: null,
    loadMore: noop,
    refreshing: false,
    statusCounts: {},
});

const emptyFilters: PartyRosterFilterState = {
    filters: { ...EMPTY_ROSTER_FILTERS, status: "ACTIVE" },
    set: noop,
    clear: noop,
    query: { status: "ACTIVE" },
    key: "status=ACTIVE",
};

describe("the directories' one header", () => {
    it.each([
        ["Publishers", () => <PublishersTable view={emptyView()} filters={emptyFilters} onChanged={noop} />, "Onboard a publisher"],
        ["Advertisers", () => <AdvertisersTable view={emptyView()} filters={emptyFilters} onChanged={noop} />, "Onboard an advertiser"],
        [
            "Print partners",
            () => <PrintPartnersView view={emptyView()} filters={emptyFilters} signIn="ALL" onSignInChange={noop} onChanged={noop} />,
            "Add partner",
        ],
        ["Agents", () => <AgentsTable view={emptyView()} filters={emptyFilters} onCreated={noop} />, "Add agent"],
    ] as const)("%s: the one primary add button, and Import left to the section's tab", (_desk, draw, add) => {
        render(draw());
        const header = screen.getByRole("heading", { level: 1 }).closest("div[class*='sm:justify-between']") as HTMLElement;
        expect(within(header).getAllByRole("button").map((button) => button.textContent?.trim())).toEqual([add]);
        expect(screen.queryByRole("link", { name: /import/i })).toBeNull();
    });
});
