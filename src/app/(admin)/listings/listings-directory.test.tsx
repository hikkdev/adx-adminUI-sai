import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * The Listings table (2 Oct 2026) — drafts inside it, the bulk bar, the row
 * menu and the formatting.
 *
 * Pinned:
 *  - the drafts read (`GET /listings/drafts/desk`, QR-8's) with its query,
 *    and one draft's read and delete on the desk's own routes;
 *  - under the "Drafts" status the drafts draw in the same table: the
 *    reference, the spot (or "Untitled"), the publisher and their number as
 *    a tel: link with the tick when verified, the category as a label (or
 *    "No category yet") with where they stopped, a Draft pill, and how long
 *    it has sat — a week or more in amber; the row menu opens or deletes;
 *  - a listing's category prints as a label, never the API's OUTDOOR, and
 *    its submitted day in the console's date format;
 *  - "Approve" runs `POST /listings/:id/publish` once per listing awaiting
 *    review and says how many it skipped; "Send back…" asks the outcome and
 *    a reason and sends the review desk's decision; a failure stays ticked;
 *  - a bulk action the viewer may not take is not offered;
 *  - `?status=` and `?category=` are read leniently off the URL.
 */

const { backend, perms, toast, router } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string; body?: unknown }[],
        refuse: new Set<string>(),
        page: { items: [] as unknown[], total: 0, page: 1, pageSize: 50 } as unknown,
        reset() {
            this.calls = [];
            this.refuse = new Set();
        },
    },
    perms: { held: new Set<string>() },
    toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
    router: { push: vi.fn(), replace: vi.fn() },
}));

vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: router.push, replace: router.replace, refresh: vi.fn() }),
    usePathname: () => "/listings/directory",
    useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/lib/auth", () => ({
    useAuth: () => ({ user: { id: "usr_admin" }, can: (id: string) => perms.held.has(id) }),
    useOptionalAuth: () => ({ user: { id: "usr_admin" }, can: (id: string) => perms.held.has(id) }),
}));
vi.mock("@/lib/use-feature", () => ({ useFeature: () => ({ enabled: false }) }));
vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, isLive: () => true };
});
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const handle = (method: string) => async (path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        if (backend.refuse.has(`${method} ${path}`)) throw new actual.ApiError(409, "BELOW_RATE_CARD_FLOOR", "The asking rate is below the rate-card floor");
        if (method === "GET") return backend.page;
        return { id: path.split("/")[2], status: "ACTIVE" };
    };
    return { ...actual, saveBlob: vi.fn(), api: { get: handle("GET"), post: handle("POST"), patch: handle("PATCH"), put: handle("PUT"), delete: handle("DELETE") } };
});

import { formatDate } from "@/lib/format";
import { listingsService, type AdminListing, type AdminListingsPage, type ListingDraftRow } from "@/services/listings";
import { draftRowMenu } from "./listing-drafts";
import { categoryFromQuery, statusFromQuery } from "./listings-loader";
import { ListingsTable } from "./listings-table";

const draft = (over: Partial<ListingDraftRow> = {}): ListingDraftRow => ({
    id: "drf_1",
    displayId: "LST-1709-2601",
    category: "indoor",
    title: "Gym mirror decal",
    stepIndex: 3,
    stepKey: "spot-details",
    createdAt: "2026-09-10T00:00:00.000Z",
    updatedAt: "2026-09-12T00:00:00.000Z",
    idleDays: 5,
    publisher: { id: "pub_1", displayId: "PUB-1009-2601", name: "Asha Rao", mobile: "+919876543210", city: "Bengaluru", kycStatus: "PENDING" },
    ...over,
});

const listing = (over: Partial<AdminListing> = {}): AdminListing => ({
    id: "lst_1",
    displayId: "LST-2409-2601",
    title: "MG Road hoarding",
    category: "OUTDOOR",
    subType: null,
    status: "PENDING_REVIEW",
    city: "Bengaluru",
    address: "MG Road",
    size: null,
    ratePerDay: "1200.00",
    latitude: null,
    longitude: null,
    publisherName: "Sharma Hoardings",
    publisherId: "pub_1",
    agentDisplayId: null,
    photoCount: 1,
    coverPhotoUrl: null,
    bookingCount: null,
    submittedAt: "2026-09-24T10:00:00.000Z",
    createdAt: "2026-09-20T10:00:00.000Z",
    suspensionScopes: [],
    suspensionReason: null,
    suspendedAt: null,
    ratingAvg: null,
    reviewCount: 0,
    instantBooking: null,
    belowFloor: null,
    slotsTotal: null,
    ...over,
});

const pageOf = (items: AdminListing[]): AdminListingsPage => ({ items, total: items.length, page: 1, pageSize: 100, counts: { PENDING_REVIEW: 1, ACTIVE: 1 } });

function renderTable(props: Partial<React.ComponentProps<typeof ListingsTable>> = {}) {
    const onChanged = vi.fn();
    render(
        <ListingsTable
            page={pageOf([listing(), listing({ id: "lst_2", displayId: "LST-2409-2602", title: "Forum mall screen", category: "INDOOR", subType: "Digital LED wall", status: "ACTIVE" })])}
            drafts={null}
            draftsTotal={3}
            status="ALL"
            onStatusChange={vi.fn()}
            category={null}
            onCategoryChange={vi.fn()}
            onChanged={onChanged}
            {...props}
        />,
    );
    return { onChanged };
}

const rowOf = (title: string) => screen.getByText(title).closest("tr")!;
const tick = (title: string) => fireEvent.click(within(rowOf(title)).getByRole("checkbox", { name: "Select row" }));

beforeEach(() => {
    backend.reset();
    perms.held = new Set(["supply.view", "supply.edit", "supply.approve", "supply.suspend", "marketplace.delete"]);
    for (const fn of Object.values(toast)) fn.mockReset();
    router.push.mockReset();
});

describe("the drafts reads", () => {
    it("reads the desk with the idle days, the search and the sort", async () => {
        await listingsService.drafts({ idleDays: 7, q: "asha", sort: "IDLE", pageSize: 100 });
        expect(backend.calls[0]!.path).toBe("/listings/drafts/desk?idleDays=7&q=asha&sort=IDLE&page=1&pageSize=100");
    });

    it("opens and deletes one draft on the desk's own routes", async () => {
        await listingsService.draft("drf_1");
        await listingsService.deleteDraft("drf_1");
        expect(backend.calls.map((call) => `${call.method} ${call.path}`)).toEqual(["GET /listings/drafts/desk/drf_1", "DELETE /listings/drafts/desk/drf_1"]);
    });
});

describe("drafts inside the table", () => {
    it("draws the reference, the spot, who to call, the category, where they stopped and how long it has sat", () => {
        renderTable({
            status: "DRAFTS",
            drafts: {
                items: [
                    draft(),
                    draft({ id: "drf_2", displayId: "LST-1709-2602", title: null, category: null, stepIndex: 0, stepKey: "select-category", idleDays: 9, publisher: { id: "pub_2", displayId: "PUB-1109-2601", name: "Ravi", mobile: "+919999999999", city: null, kycStatus: "VERIFIED" } }),
                ],
                total: 2,
                page: 1,
                pageSize: 100,
            },
        });
        expect(screen.getByText("LST-1709-2601")).toBeTruthy();
        expect(screen.getByText("Gym mirror decal")).toBeTruthy();
        expect(screen.getByText("Indoor")).toBeTruthy();
        expect(screen.getByText("Stopped at Spot details")).toBeTruthy();
        expect(screen.getByText("Idle 5 days")).toBeTruthy();
        expect(screen.getAllByText("Draft").length).toBeGreaterThanOrEqual(2);
        expect(screen.getByRole("link", { name: /Asha Rao/ }).getAttribute("href")).toBe("/publishers/pub_1");
        expect(screen.getByRole("link", { name: "+919876543210" }).getAttribute("href")).toBe("tel:+919876543210");

        expect(screen.getByText("Untitled")).toBeTruthy();
        expect(screen.getByText("No category yet")).toBeTruthy();
        expect(screen.getByText("Stopped at Category")).toBeTruthy();
        expect(screen.getByText("Idle 9 days").className).toContain("text-amber-700");
        expect(screen.getByRole("img", { name: /verified/i })).toBeTruthy();
        /* No bulk bar over drafts, and no listing's export. */
        expect(screen.queryByTestId("export-matching")).toBeNull();

        fireEvent.click(screen.getByText("Gym mirror decal"));
        expect(router.push).toHaveBeenCalledWith("/listings/drafts/drf_1");
    });

    it("its row menu opens the draft, and offers the delete only with the permission", () => {
        const open = vi.fn();
        const onDelete = vi.fn();
        const labels = (entries: ReturnType<typeof draftRowMenu>) => entries.map((entry) => (entry.kind === "item" ? entry.label : entry.kind === "label" ? `[${entry.label}]` : "—"));
        expect(labels(draftRowMenu(draft(), { open, onDelete }))).toEqual(["[Actions]", "Open draft", "—", "Delete draft…"]);
        expect(labels(draftRowMenu(draft(), { open, onDelete: null }))).toEqual(["[Actions]", "Open draft"]);
    });
});

describe("the listings", () => {
    it("prints the category as a label and the submitted day in the console's format", () => {
        renderTable();
        expect(screen.getByText("Outdoor")).toBeTruthy();
        expect(screen.queryByText("OUTDOOR")).toBeNull();
        expect(within(rowOf("Forum mall screen")).getByText("Indoor")).toBeTruthy();
        expect(within(rowOf("Forum mall screen")).getByText("Digital LED wall")).toBeTruthy();
        expect(screen.getAllByText(formatDate("2026-09-24T10:00:00.000Z")).length).toBe(2);
        expect(screen.queryByText("2026-09-24")).toBeNull();
    });

    it("approves the listings awaiting review and skips the rest, saying how many", async () => {
        const { onChanged } = renderTable();
        tick("MG Road hoarding");
        tick("Forum mall screen");
        expect(screen.getByText("2 selected")).toBeTruthy();

        fireEvent.click(screen.getByTestId("bulk-approve"));
        const dialog = await screen.findByRole("alertdialog");
        expect(within(dialog).getByText(/^1 will be approved and live, 1 skipped \(not awaiting review\)\./)).toBeTruthy();
        fireEvent.click(within(dialog).getByRole("button", { name: "Approve 1 listing" }));

        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
        expect(backend.calls.map((call) => `${call.method} ${call.path}`)).toEqual(["POST /listings/lst_1/publish"]);
        expect(toast.success).toHaveBeenCalledWith("1 approved and live", undefined);
    });

    it("sends back with the review desk's outcome and a reason, and keeps a failure ticked", async () => {
        backend.refuse.add("POST /listings/lst_1/send-back");
        renderTable({ page: pageOf([listing(), listing({ id: "lst_3", displayId: "LST-2409-2603", title: "Metro pillar wrap" })]) });
        tick("MG Road hoarding");
        tick("Metro pillar wrap");

        fireEvent.click(screen.getByTestId("bulk-send-back"));
        const dialog = await screen.findByRole("alertdialog");
        const confirm = within(dialog).getByRole("button", { name: "Send back 2 listings" });
        expect(confirm).toBeDisabled();
        fireEvent.click(within(dialog).getByLabelText(/Reject outright/));
        fireEvent.change(within(dialog).getByLabelText("What the publishers have to fix"), { target: { value: "Not a real spot." } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Reject 2 listings" }));

        await waitFor(() => expect(toast.warning).toHaveBeenCalled());
        expect(backend.calls.filter((call) => call.method === "POST").map((call) => [call.path, call.body])).toEqual([
            ["/listings/lst_1/send-back", { reason: "Not a real spot.", outcome: "REJECTED" }],
            ["/listings/lst_3/send-back", { reason: "Not a real spot.", outcome: "REJECTED" }],
        ]);
        expect(toast.warning.mock.calls[0]![0]).toBe("1 rejected · 1 failed: The asking rate is below the rate-card floor");
        expect(within(rowOf("MG Road hoarding")).getByRole("checkbox", { name: "Select row" })).toHaveAttribute("data-state", "checked");
        expect(within(rowOf("Metro pillar wrap")).getByRole("checkbox", { name: "Select row" })).toHaveAttribute("data-state", "unchecked");
    });

    it("does not offer a bulk action the viewer may not take", () => {
        perms.held = new Set(["supply.view", "supply.suspend"]);
        renderTable();
        tick("MG Road hoarding");
        expect(screen.queryByTestId("bulk-approve")).toBeNull();
        expect(screen.queryByTestId("bulk-send-back")).toBeNull();
        expect(screen.getByTestId("bulk-suspend")).toBeTruthy();
        expect(screen.getByTestId("bulk-reinstate")).toBeTruthy();
        expect(screen.getByTestId("bulk-export")).toBeTruthy();
    });
});

describe("the URL", () => {
    it("reads ?status= and ?category= leniently", () => {
        expect(statusFromQuery(null)).toBe("ALL");
        expect(statusFromQuery("DRAFTS")).toBe("DRAFTS");
        expect(statusFromQuery("pending_review")).toBe("PENDING_REVIEW");
        expect(statusFromQuery("nonsense")).toBe("ALL");
        expect(categoryFromQuery("outdoor")).toBe("OUTDOOR");
        expect(categoryFromQuery("billboards")).toBeNull();
    });
});
