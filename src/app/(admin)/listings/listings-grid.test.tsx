import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * The Listings table's grid view (3 Oct 2026) — the owner: "is it possible
 * to see the listings in a grid view with photos".
 *
 * Pinned:
 *  - a Table / Grid toggle in the header's actions beside Map view,
 *    remembered in this browser; drafts stay a table;
 *  - each card: the cover photograph (or a placeholder), the name, the LST-
 *    reference, the publisher, the city, the category, the rate a day, the
 *    status pill, and "12 bookings · ★4.2";
 *  - the grid is the same table: the search narrows it, a click on a card
 *    opens the listing, the checkbox on the card's corner ticks it and the
 *    same bulk bar runs the same actions; "select every card on this page".
 */

const { backend, perms, toast, router } = vi.hoisted(() => ({
    backend: { calls: [] as { method: string; path: string }[] },
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
    const handle = (method: string) => async (path: string) => {
        backend.calls.push({ method, path });
        return { id: path.split("/")[2], status: "ACTIVE" };
    };
    return { ...actual, saveBlob: vi.fn(), api: { get: handle("GET"), post: handle("POST"), patch: handle("PATCH"), put: handle("PUT"), delete: handle("DELETE") } };
});

import type { AdminListing, AdminListingsPage } from "@/services/listings";
import { DIRECTORY_VIEW_KEY, resetDirectoryViewForTests, trackRecordLine } from "./listing-grid-card";
import { ListingsTable } from "./listings-table";

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
    coverPhotoUrl: "https://cdn.example/front.jpg",
    bookingCount: 12,
    submittedAt: "2026-09-24T10:00:00.000Z",
    createdAt: "2026-09-20T10:00:00.000Z",
    suspensionScopes: [],
    suspensionReason: null,
    suspendedAt: null,
    ratingAvg: "4.20",
    reviewCount: 5,
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
            page={pageOf([
                listing(),
                listing({ id: "lst_2", displayId: "LST-2409-2602", title: "Forum mall screen", category: "INDOOR", status: "ACTIVE", coverPhotoUrl: null, bookingCount: 0, ratingAvg: null, reviewCount: 0, publisherName: "Forum Media" }),
            ])}
            drafts={null}
            draftsTotal={0}
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

const cardOf = (title: string) => screen.getByRole("article", { name: title }).closest("li")!;

beforeEach(() => {
    backend.calls = [];
    perms.held = new Set(["supply.view", "supply.edit", "supply.approve", "supply.suspend"]);
    for (const fn of Object.values(toast)) fn.mockReset();
    router.push.mockReset();
    window.localStorage.clear();
    resetDirectoryViewForTests();
});

describe("the Table / Grid toggle", () => {
    it("sits in the header beside Map view, opens on the table, and remembers the grid", () => {
        renderTable();
        const toggle = screen.getByRole("group", { name: "View" });
        expect(toggle.parentElement).toContainElement(screen.getByRole("link", { name: /Map view/ }));
        expect(within(toggle).getByRole("button", { name: "Table" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.queryByTestId("data-grid")).toBeNull();

        fireEvent.click(within(toggle).getByRole("button", { name: "Grid" }));
        expect(screen.getByTestId("data-grid")).toBeTruthy();
        expect(window.localStorage.getItem(DIRECTORY_VIEW_KEY)).toBe("grid");
    });

    it("opens on the grid for a viewer who left it there", () => {
        window.localStorage.setItem(DIRECTORY_VIEW_KEY, "grid");
        renderTable();
        expect(screen.getByTestId("data-grid")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Grid" })).toHaveAttribute("aria-pressed", "true");
    });

    it("is not offered over drafts, which have no photographs", () => {
        renderTable({ status: "DRAFTS", drafts: { items: [], total: 0, page: 1, pageSize: 100 } });
        expect(screen.queryByRole("group", { name: "View" })).toBeNull();
    });
});

describe("a card", () => {
    beforeEach(() => window.localStorage.setItem(DIRECTORY_VIEW_KEY, "grid"));

    it("carries the cover, the name, the reference, the publisher, the city, the category, the rate, the status and the track record", () => {
        renderTable();
        const card = cardOf("MG Road hoarding");
        expect(within(card).getByRole("img", { name: "MG Road hoarding — cover photograph" })).toHaveAttribute("src", "https://cdn.example/front.jpg");
        expect(card).toHaveTextContent("LST-2409-2601 · Bengaluru");
        expect(card).toHaveTextContent("Sharma Hoardings · Outdoor");
        expect(card).toHaveTextContent("₹1,200.00 / day");
        expect(card).toHaveTextContent("Pending review");
        expect(card).toHaveTextContent("12 bookings · ★4.2 (5)");
    });

    it("draws a placeholder where there is no photograph", () => {
        renderTable();
        const card = cardOf("Forum mall screen");
        expect(within(card).getByTestId("listing-card-placeholder")).toHaveTextContent("No photograph yet");
        expect(card).toHaveTextContent("No bookings yet");
    });

    it("opens the listing on a click", () => {
        renderTable();
        fireEvent.click(within(cardOf("Forum mall screen")).getByText("Forum mall screen"));
        expect(router.push).toHaveBeenCalledWith("/listings/lst_2");
    });

    it("is narrowed by the same search", () => {
        renderTable();
        fireEvent.change(screen.getByPlaceholderText("Search listings, publisher, category"), { target: { value: "forum" } });
        expect(screen.queryByRole("article", { name: "MG Road hoarding" })).toBeNull();
        expect(screen.getByRole("article", { name: "Forum mall screen" })).toBeTruthy();
    });
});

describe("bulk selection in the grid", () => {
    beforeEach(() => window.localStorage.setItem(DIRECTORY_VIEW_KEY, "grid"));

    it("ticks a card from its corner without opening it, and runs the same bulk bar", async () => {
        const { onChanged } = renderTable();
        fireEvent.click(within(cardOf("MG Road hoarding")).getByRole("checkbox", { name: "Select row" }));
        expect(router.push).not.toHaveBeenCalled();
        expect(screen.getByText("1 selected")).toBeTruthy();
        expect(screen.getByTestId("bulk-export")).toBeTruthy();

        fireEvent.click(screen.getByTestId("bulk-approve"));
        const dialog = await screen.findByRole("alertdialog");
        fireEvent.click(within(dialog).getByRole("button", { name: "Approve 1 listing" }));
        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
        expect(backend.calls.map((call) => `${call.method} ${call.path}`)).toEqual(["POST /listings/lst_1/publish"]);
    });

    it("selects every card on the page at once", () => {
        renderTable();
        act(() => {
            fireEvent.click(screen.getByRole("checkbox", { name: "Select all rows" }));
        });
        expect(screen.getByText("2 selected")).toBeTruthy();
        expect(cardOf("Forum mall screen")).toHaveAttribute("data-state", "selected");
    });
});

describe("the track-record line", () => {
    it("reads bookings and stars, each only when there is something to say", () => {
        expect(trackRecordLine({ bookingCount: 1, ratingAvg: null, reviewCount: 0 })).toBe("1 booking");
        expect(trackRecordLine({ bookingCount: null, ratingAvg: null, reviewCount: 0 })).toBe("No reviews yet");
        expect(trackRecordLine({ bookingCount: 3, ratingAvg: "4.25", reviewCount: 2 })).toBe("3 bookings · ★4.3 (2)");
    });
});
