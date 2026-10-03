import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * The campaigns list (2 Oct 2026) — the stronger list.
 *
 * Pinned:
 *  - the columns: Campaign (name + reference), Advertiser (the orders'
 *    Placed by cell — business, ADV-… · person, opening the advertiser),
 *    Brand, Status with the "Waiting on …" pill, Spots live ("2 of 3"),
 *    Flight ("1 Oct – 30 Oct 2026" + "6 days left" while live), Booked / Paid
 *    in rupees (no "N% committed" bar), Performance (scans · views ·
 *    enquiries);
 *  - the filter bar in its order: Search · Advertiser · City · Status ·
 *    Waiting on · the two flight dates, each reported to the loader;
 *  - the rosters' row menu: View · Open landing page (published only) ·
 *    Remind advertiser (awaiting payment) · Cancel… (status allows);
 *  - the bulk bar: Remind advertiser skips what is not awaiting payment;
 *    Cancel… shows the refund each would open before anything is sent,
 *    needs a reason, and keeps a failure ticked; Export CSV of the ticked
 *    rows and of the filtered set.
 */

const { backend, toast, router, saved } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string; body?: unknown }[],
        refuse: new Map<string, { status: number; code: string; message: string }>(),
        previews: new Map<string, unknown>(),
        page: { items: [] as unknown[], total: 0, page: 1, pageSize: 100, counts: {} } as unknown,
        reset() {
            this.calls = [];
            this.refuse = new Map();
            this.previews = new Map();
        },
    },
    toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
    router: { push: vi.fn(), replace: vi.fn() },
    saved: [] as string[],
}));

vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: router.push, replace: router.replace, refresh: vi.fn() }),
    usePathname: () => "/campaigns/directory",
    useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/lib/auth", () => ({
    useAuth: () => ({ user: { id: "usr_admin" }, can: () => true }),
    useOptionalAuth: () => ({ user: { id: "usr_admin" }, can: () => true }),
}));
vi.mock("@/lib/use-feature", () => ({ useFeature: () => ({ enabled: false }) }));
vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true, baseUrl: "https://api.adx.in/api/v1" }, isLive: () => true };
});
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const handle = (method: string) => async (path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        const refusal = backend.refuse.get(`${method} ${path}`);
        if (refusal) throw new actual.ApiError(refusal.status, refusal.code, refusal.message);
        if (method === "GET" && path.endsWith("/cancel-impact")) {
            const preview = backend.previews.get(path);
            if (!preview) throw new actual.ApiError(404, "NOT_FOUND", "Not found");
            return preview;
        }
        if (method === "GET") return backend.page;
        return { about: "PAYMENT", amountDue: "18400.00", remindedAt: "2026-10-02T10:00:00.000Z", nextAllowedAt: "2026-10-03T10:00:00.000Z" };
    };
    return {
        ...actual,
        saveBlob: (_blob: Blob, name: string) => saved.push(name),
        api: { get: handle("GET"), post: handle("POST"), patch: handle("PATCH"), put: handle("PUT"), delete: handle("DELETE") },
    };
});

import { shapeCampaign, type CampaignsPage, type WireCampaign } from "@/services/campaigns";
import { CampaignsTable } from "./campaigns-table";
import { filtersFromQuery, listQueryOf, type CampaignsFilters } from "./campaigns-loader";

const ASHA = { userId: "usr_asha", name: "Asha Rao", displayId: "ADX-0210-2601", business: { id: "adv_rao", name: "Rao Sweets", displayId: "ADV-0210-2601" } };

const wire = (over: Partial<WireCampaign> = {}): WireCampaign => ({
    id: "cmp_1",
    reference: "ADX-CMP-2026-482913",
    name: "Diwali Season Push",
    status: "LIVE",
    goal: "BRAND_AWARENESS",
    brandName: "Rao Sweets",
    city: "MG Road",
    budget: "50000.00",
    total: "18400.00",
    startDate: "2026-10-01T00:00:00.000Z",
    endDate: "2026-10-30T00:00:00.000Z",
    spotCount: 3,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
    advertiser: ASHA,
    waitingOn: [],
    spotsLive: 2,
    spotsTotal: 3,
    performance: { scans: 120, views: 80, ctaClicks: 9, enquiries: 4 },
    paidAmount: "18400.00",
    daysLeft: 6,
    landingPage: null,
    ...over,
});

const LIVE = wire();
const AWAITING = wire({
    id: "cmp_2",
    reference: "ADX-CMP-2026-100200",
    name: "Monsoon Coffee Launch",
    status: "PENDING_PAYMENT",
    paidAmount: null,
    spotsLive: 0,
    daysLeft: null,
    waitingOn: ["PAYMENT"],
    landingPage: { id: "lp_1", slug: "monsoon-coffee", status: "PUBLISHED", url: "/p/monsoon-coffee", publishedAt: "2026-09-30T10:00:00.000Z" },
});
const DONE = wire({ id: "cmp_3", reference: "ADX-CMP-2026-300300", name: "Summer Fitness Push", status: "COMPLETED", daysLeft: null, waitingOn: [] });
const HELD = wire({ id: "cmp_4", reference: "ADX-CMP-2026-400400", name: "Hampi Utsav", status: "SCHEDULED", daysLeft: null, waitingOn: ["KYC", "ARTWORK"] });

const pageOf = (items: WireCampaign[]): CampaignsPage => ({ items: items.map(shapeCampaign), total: items.length, page: 1, pageSize: 25, counts: { LIVE: 1, PENDING_PAYMENT: 1, COMPLETED: 1, SCHEDULED: 1 } });

const NO_FILTERS: CampaignsFilters = { status: "ALL", q: "", advertiserId: null, city: "", from: "", to: "", waitingOn: null, goal: null, sort: "NEWEST", page: 1 };

function renderTable(props: Partial<React.ComponentProps<typeof CampaignsTable>> = {}) {
    const onChanged = vi.fn();
    const onFilters = vi.fn();
    render(
        <CampaignsTable
            page={pageOf([LIVE, AWAITING, DONE, HELD])}
            filters={NO_FILTERS}
            searchText=""
            onSearchText={vi.fn()}
            city={{ text: "", slug: null }}
            onCity={vi.fn()}
            advertiser={null}
            onFilters={onFilters}
            onClear={vi.fn()}
            refreshing={false}
            exportQuery={{ sort: "NEWEST" }}
            pageSize={25}
            onChanged={onChanged}
            {...props}
        />,
    );
    return { onChanged, onFilters };
}

const rowOf = (name: string) => screen.getByText(name).closest("tr")!;
const tick = (name: string) => fireEvent.click(within(rowOf(name)).getByRole("checkbox", { name: "Select row" }));
const openMenu = async (name: string) => {
    fireEvent.keyDown(within(rowOf(name)).getByRole("button", { name: "Row actions" }), { key: "ArrowDown" });
    return screen.findByTestId("roster-row-menu");
};
const menuItems = (menu: HTMLElement) => within(menu).getAllByRole("menuitem").map((item) => item.textContent);

beforeEach(() => {
    backend.reset();
    saved.length = 0;
    vi.clearAllMocks();
});

describe("the columns", () => {
    it("draws the advertiser, the gates, the spots, the flight, the money and the counts", () => {
        renderTable();
        const live = within(rowOf("Diwali Season Push"));
        expect(live.getByText("ADX-CMP-2026-482913")).toHaveClass("font-mono");
        const advertiser = live.getByTestId("campaign-advertiser");
        expect(advertiser).toHaveAttribute("href", "/advertisers/adv_rao");
        expect(advertiser).toHaveTextContent("Rao SweetsADV-0210-2601 · Asha Rao");
        expect(live.getByTestId("spots-live")).toHaveTextContent("2 of 3");
        expect(live.getByText("1 Oct – 30 Oct 2026")).toBeTruthy();
        expect(live.getByText("6 days left")).toBeTruthy();
        expect(live.getByTestId("booked-paid")).toHaveTextContent("₹18,400.00₹18,400.00 paid");
        expect(live.getByText("120 scans · 80 views · 4 enquiries")).toBeTruthy();
        /* The unexplained bar is gone. */
        expect(screen.queryByText(/% committed/)).toBeNull();

        expect(within(rowOf("Monsoon Coffee Launch")).getByTestId("booked-paid")).toHaveTextContent("Not paid");
        expect(within(rowOf("Monsoon Coffee Launch")).queryByText(/days left/)).toBeNull();
        expect(within(rowOf("Hampi Utsav")).getByTestId("waiting-on")).toHaveTextContent("Waiting on Advertiser KYC · Artwork approval");
        expect(within(rowOf("Diwali Season Push")).queryByTestId("waiting-on")).toBeNull();
    });

    it("prints a dash for an advertiser and the counts a read one release behind does not send", () => {
        renderTable({ page: pageOf([wire({ advertiser: undefined, performance: undefined, spotsLive: undefined })]) });
        const row = within(rowOf("Diwali Season Push"));
        expect(row.queryByTestId("campaign-advertiser")).toBeNull();
        expect(row.queryByTestId("spots-live")).toBeNull();
        expect(row.getByText("3")).toBeTruthy();
    });
});

describe("the filter bar", () => {
    it("runs Search · Advertiser · City · Status · Waiting on · the flight dates, with the export and Columns after", () => {
        renderTable();
        const labels = Array.from(screen.getByTestId("campaign-filters").querySelectorAll("input[aria-label], button[aria-label]")).map((node) => node.getAttribute("aria-label"));
        expect(labels).toEqual(["Search", "Advertiser", "City", "Status", "Waiting on", "Flight from", "Flight to"]);
        expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent("All statuses · 4");
        expect(screen.getByRole("button", { name: "Columns" })).toBeTruthy();
    });

    it("reports a status, a reason and the dates to the loader", async () => {
        const { onFilters } = renderTable();
        fireEvent.keyDown(screen.getByRole("combobox", { name: "Status" }), { key: "ArrowDown" });
        fireEvent.keyDown(await screen.findByRole("option", { name: /^Awaiting payment/ }), { key: "Enter" });
        expect(onFilters).toHaveBeenCalledWith({ status: "PENDING_PAYMENT" });
        fireEvent.keyDown(screen.getByRole("combobox", { name: "Waiting on" }), { key: "ArrowDown" });
        fireEvent.keyDown(await screen.findByRole("option", { name: /^Advertiser KYC/ }), { key: "Enter" });
        expect(onFilters).toHaveBeenCalledWith({ waitingOn: "KYC" });
        fireEvent.change(screen.getByLabelText("Flight from"), { target: { value: "2026-10-01" } });
        expect(onFilters).toHaveBeenCalledWith({ from: "2026-10-01" });
    });

    it("reads the URL leniently and sends only what is set", () => {
        const filters = filtersFromQuery(new URLSearchParams("status=scheduled&waitingOn=kyc&from=2026-10-01&to=nope&page=-3&advertiserId=adv_rao&goal=local_footfall&sort=ending_soon"));
        expect(filters).toEqual({ status: "SCHEDULED", q: "", advertiserId: "adv_rao", city: "", from: "2026-10-01", to: "", waitingOn: "KYC", goal: "LOCAL_FOOTFALL", sort: "ENDING_SOON", page: 1 });
        expect(listQueryOf(filters, "rao")).toEqual({ status: ["SCHEDULED"], q: "rao", advertiserId: "adv_rao", from: "2026-10-01", waitingOn: ["KYC"], goal: ["LOCAL_FOOTFALL"], sort: "ENDING_SOON" });
        expect(filtersFromQuery(new URLSearchParams("status=WHATEVER&goal=nope&sort=nope"))).toMatchObject({ status: "ALL", goal: null, sort: "NEWEST" });
    });
});

describe("the row menu", () => {
    it("offers View, the live landing page and the reminder while awaiting payment, then Cancel…", async () => {
        renderTable();
        expect(menuItems(await openMenu("Monsoon Coffee Launch"))).toEqual(["View", "Open landing page", "Remind advertiser", "Authorise and launch", "Cancel…"]);
    });

    it("offers View alone on a finished campaign", async () => {
        renderTable();
        expect(menuItems(await openMenu("Summer Fitness Push"))).toEqual(["View"]);
    });

    it("reminds the advertiser, and says plainly when one already went today", async () => {
        renderTable();
        fireEvent.click(within(await openMenu("Monsoon Coffee Launch")).getByRole("menuitem", { name: "Remind advertiser" }));
        await waitFor(() => expect(toast.success).toHaveBeenCalled());
        expect(backend.calls.at(-1)).toEqual({ method: "POST", path: "/campaigns/cmp_2/remind-payment", body: {} });
        expect(toast.success.mock.calls[0]![1].description).toMatch(/^The advertiser was asked to pay the campaign \(₹18,400\.00\)\. The next reminder can go after /);

        backend.refuse.set("POST /campaigns/cmp_2/remind-payment", { status: 429, code: "RATE_LIMITED", message: "Too many" });
        fireEvent.click(within(await openMenu("Monsoon Coffee Launch")).getByRole("menuitem", { name: "Remind advertiser" }));
        await waitFor(() => expect(toast.error).toHaveBeenCalled());
        expect(toast.error.mock.calls[0]![1]).toEqual({ description: "Already reminded in the last 24 hours — one reminder a day per campaign." });
    });

    it("cancels one with the refund shown first and a reason", async () => {
        backend.previews.set("/campaigns/cmp_1/cancel-impact", { cancellable: true, refundNeeded: true, refundAmount: "9200.00", holdReleased: null, unusedDays: 15 });
        const { onChanged } = renderTable();
        fireEvent.click(within(await openMenu("Diwali Season Push")).getByRole("menuitem", { name: "Cancel…" }));
        const dialog = await screen.findByRole("alertdialog");
        await waitFor(() => expect(within(dialog).getByTestId("cancel-impact")).toHaveTextContent("₹9,200.00 to refund across 1 campaign"));
        const confirm = within(dialog).getByRole("button", { name: "Cancel campaign" });
        expect(confirm).toBeDisabled();
        fireEvent.change(within(dialog).getByLabelText("Reason — the advertiser is told"), { target: { value: "The advertiser asked to stop." } });
        fireEvent.click(confirm);
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.calls.at(-1)).toEqual({ method: "POST", path: "/campaigns/cmp_1/cancel", body: { reason: "The advertiser asked to stop." } });
    });
});

describe("the bulk bar", () => {
    it("reminds only the ones awaiting payment, saying how many it skipped", async () => {
        const { onChanged } = renderTable();
        tick("Diwali Season Push");
        tick("Monsoon Coffee Launch");
        fireEvent.click(screen.getByTestId("bulk-remind"));
        const dialog = await screen.findByRole("alertdialog");
        expect(within(dialog).getByText(/^1 will be reminded, 1 skipped \(not awaiting payment\)\./)).toBeTruthy();
        fireEvent.click(within(dialog).getByRole("button", { name: "Remind about 1 campaign" }));
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.calls.filter((call) => call.method === "POST").map((call) => call.path)).toEqual(["/campaigns/cmp_2/remind-payment"]);
    });

    it("shows the refund impact before cancelling, needs one reason, and keeps a failure ticked", async () => {
        backend.previews.set("/campaigns/cmp_1/cancel-impact", { cancellable: true, refundNeeded: true, refundAmount: "9200.00", holdReleased: null });
        backend.previews.set("/campaigns/cmp_4/cancel-impact", { cancellable: true, refundNeeded: false, refundAmount: "0.00", holdReleased: "18400.00" });
        backend.refuse.set("POST /campaigns/cmp_4/cancel", { status: 409, code: "CONFLICT", message: "Already moving" });
        renderTable();
        tick("Diwali Season Push");
        tick("Hampi Utsav");
        tick("Summer Fitness Push");
        fireEvent.click(screen.getByTestId("bulk-cancel"));
        const dialog = await screen.findByRole("alertdialog");
        expect(within(dialog).getByText(/^2 will be cancelled, 1 skipped \(already finished or cancelled\)\./)).toBeTruthy();
        await waitFor(() => expect(within(dialog).getByTestId("cancel-impact")).toHaveTextContent("₹9,200.00 to refund across 1 campaign"));
        expect(within(dialog).getByTestId("cancel-impact")).toHaveTextContent("1 not started yet");
        expect(within(dialog).getByTestId("cancel-impact")).toHaveTextContent("₹18,400.00 back to the wallet");
        /* Nothing is sent before the confirm. */
        expect(backend.calls.filter((call) => call.method === "POST")).toEqual([]);
        const confirm = within(dialog).getByRole("button", { name: "Cancel 2 campaigns" });
        expect(confirm).toBeDisabled();
        fireEvent.change(within(dialog).getByLabelText("Reason — the advertiser is told"), { target: { value: "Booked twice by mistake." } });
        fireEvent.click(confirm);
        await waitFor(() => expect(toast.warning).toHaveBeenCalled());
        expect(backend.calls.filter((call) => call.method === "POST").map((call) => [call.path, call.body])).toEqual([
            ["/campaigns/cmp_1/cancel", { reason: "Booked twice by mistake." }],
            ["/campaigns/cmp_4/cancel", { reason: "Booked twice by mistake." }],
        ]);
        expect(within(rowOf("Hampi Utsav")).getByRole("checkbox", { name: "Select row" })).toHaveAttribute("data-state", "checked");
        expect(within(rowOf("Diwali Season Push")).getByRole("checkbox", { name: "Select row" })).toHaveAttribute("data-state", "unchecked");
    });

    it("says so when the dry run is not there, rather than guessing", async () => {
        renderTable();
        tick("Diwali Season Push");
        fireEvent.click(screen.getByTestId("bulk-cancel"));
        const dialog = await screen.findByRole("alertdialog");
        await waitFor(() => expect(within(dialog).getByTestId("cancel-impact")).toHaveTextContent("could not be worked out in advance"));
    });

    it("exports the ticked rows, and the filtered set from the toolbar", async () => {
        backend.page = { items: [LIVE, AWAITING], total: 2, page: 1, pageSize: 100, counts: {} };
        renderTable();
        tick("Diwali Season Push");
        fireEvent.click(screen.getByTestId("bulk-export"));
        expect(saved).toEqual(["campaigns-selected.csv"]);
        fireEvent.click(screen.getByTestId("export-matching"));
        await waitFor(() => expect(saved).toEqual(["campaigns-selected.csv", "campaigns.csv"]));
        expect(backend.calls.find((call) => call.method === "GET")?.path).toBe("/campaigns?sort=NEWEST&pageSize=100");
    });
});
