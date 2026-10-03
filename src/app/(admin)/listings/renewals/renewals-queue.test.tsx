import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Listings › Renewals — QR-24 (the owner, 17 Sep 2026), and since 3 Oct 2026
 * the owner: "There's some lapsed ones but it doesn't show in renewals tab."
 *
 * Pinned:
 *  - the words: "Lease, licence and permit renewals", the explanation, the
 *    line that points at Verification for overdue photo re-checks, and
 *    Expired / Ending soon — never "Lapsed";
 *  - the other queues' layout: one summary line instead of the number cards,
 *    the chips All / Expired / Ending soon with counts, the shared table with
 *    checkboxes and Columns; "Run the renewals sweep" top right, only for a
 *    viewer who may run it;
 *  - the row menu: View listing, Open documents, then Remind publisher to
 *    renew; the bulk bar runs the same reminder per listing, skipping one
 *    with no publisher and keeping a refusal ticked;
 *  - what the viewer may not do is not offered.
 */

const { backend, perms, toast, router } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string; body?: unknown }[],
        refuse: new Map<string, string>(),
        reset() {
            this.calls = [];
            this.refuse = new Map();
        },
    },
    perms: { held: new Set<string>() },
    toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
    router: { push: vi.fn(), replace: vi.fn() },
}));

vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: router.push, replace: router.replace, refresh: vi.fn() }),
    usePathname: () => "/listings/renewals",
    useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/lib/auth", () => ({
    useAuth: () => ({ user: { id: "usr_admin" }, can: (id: string) => perms.held.has(id) }),
    useOptionalAuth: () => ({ user: { id: "usr_admin" }, can: (id: string) => perms.held.has(id) }),
}));
vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, isLive: () => true };
});
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const handle = (method: string) => async (path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        const refusal = backend.refuse.get(`${method} ${path}`);
        if (refusal) throw new actual.ApiError(429, "TOO_MANY_REQUESTS", refusal);
        if (method === "GET") return [];
        if (path === "/supply/rights/sweep") return { considered: 3, lapsed: 1, reminded: 1 };
        return { ok: true };
    };
    return { ...actual, api: { get: handle("GET"), post: handle("POST"), patch: handle("PATCH"), put: handle("PUT"), delete: handle("DELETE") } };
});

import { supplyService } from "@/services/supply";
import { renewalChips, renewalCounts, renewalsSubtitle } from "@/services/renewals-queue";
import type { RightsQueueRow } from "@/types";
import { RenewalsQueue } from "./renewals-queue";

const row = (over: Partial<RightsQueueRow> = {}): RightsQueueRow => ({
    id: "lst_1",
    displayId: "LST-2009-2601",
    title: "Hebbal Flyover Approach — Airport Road Billboard",
    publisherId: "pub_1",
    publisherName: "Skyline Outdoor Media",
    status: "ACTIVE",
    availableNow: true,
    rightsBasis: "PERMIT",
    rightsValidUntil: "2026-10-05T23:59:59.999Z",
    rightsLapsedAt: null,
    rightsRemindedAt: null,
    state: "ENDING",
    daysLeft: 15,
    ...over,
});

const ROWS: RightsQueueRow[] = [
    row(),
    row({
        id: "lst_2",
        displayId: "LST-2009-2602",
        title: "Western Express Highway — Andheri Gantry",
        publisherName: "Mumbai Hoardings Co",
        rightsBasis: "LEASED",
        rightsLapsedAt: "2026-09-01T00:00:00.000Z",
        rightsRemindedAt: "2026-08-25T00:00:00.000Z",
        state: "LAPSED",
        daysLeft: -19,
        availableNow: false,
    }),
    row({ id: "lst_3", displayId: "LST-2009-2603", title: "Silk Board Flyover — Skywalk Panel", publisherId: null, publisherName: null, state: "CURRENT", daysLeft: 50 }),
];

function renderQueue(rows: RightsQueueRow[] = ROWS) {
    const onChanged = vi.fn();
    render(<RenewalsQueue rows={rows} onChanged={onChanged} />);
    return { onChanged };
}

const rowOf = (text: string) => screen.getAllByText(text)[0]!.closest("tr")!;
const tick = (text: string) => fireEvent.click(within(rowOf(text)).getByRole("checkbox", { name: "Select row" }));
const openMenu = async (text: string) => {
    fireEvent.keyDown(within(rowOf(text)).getByRole("button", { name: "Row actions" }), { key: "ArrowDown" });
    return screen.findByTestId("roster-row-menu");
};
const menuItems = (menu: HTMLElement) => within(menu).getAllByRole("menuitem").map((item) => item.textContent);
const posts = () => backend.calls.filter((call) => call.method !== "GET").map((call) => `${call.method} ${call.path}`);

beforeEach(() => {
    backend.reset();
    perms.held = new Set(["supply.view", "supply.edit", "system.jobs"]);
    for (const fn of Object.values(toast)) fn.mockReset();
    router.push.mockReset();
});

describe("the service", () => {
    it("reads the queue with its horizon, posts the sweep and the reminder", async () => {
        await supplyService.rightsQueue(90);
        await supplyService.runRightsSweep();
        await supplyService.remindRightsRenewal("lst_9");
        expect(backend.calls.map((call) => `${call.method} ${call.path}`)).toEqual([
            "GET /supply/rights-queue?horizonDays=90",
            "POST /supply/rights/sweep",
            "POST /supply/listings/lst_9/rights/remind",
        ]);
    });
});

describe("the words", () => {
    it("counts each row under one chip and says the summary line plainly", () => {
        const counts = renewalCounts(ROWS);
        expect(counts).toEqual({ all: 3, EXPIRED: 1, ENDING_SOON: 2 });
        expect(renewalsSubtitle(counts)).toBe("1 expired (no new bookings) · 2 ending soon (within 60 days)");
        expect(renewalChips(counts).map((chip) => `${chip.label} ${chip.count}`)).toEqual(["All 3", "Expired 1", "Ending soon 2"]);
    });

    it("titles the page for leases, licences and permits, explains it, and points at Verification for photo re-checks", () => {
        renderQueue();
        expect(screen.getByRole("heading", { name: "Lease, licence and permit renewals" })).toBeTruthy();
        expect(
            screen.getByText(
                "Spots sold under a lease, licence or permit whose end date is within 60 days or has passed. An expired one takes no new bookings until the renewed document is approved."
            )
        ).toBeTruthy();
        const crossLink = screen.getByTestId("queue-cross-link");
        expect(crossLink.textContent).toBe("Looking for overdue photo re-checks? See Verification.");
        expect(within(crossLink).getByRole("link", { name: "See Verification" }).getAttribute("href")).toBe("/listings/verification");
        expect(screen.queryByText("Lapsed")).toBeNull();
        expect(within(rowOf("Western Express Highway — Andheri Gantry")).getByText("Expired")).toBeTruthy();
        expect(within(rowOf("Hebbal Flyover Approach — Airport Road Billboard")).getByText("Ending soon")).toBeTruthy();
    });
});

describe("the layout", () => {
    it("draws the summary line, the chips with counts and the shared table — no number cards — with the sweep top right", () => {
        renderQueue();
        expect(screen.getByTestId("queue-summary").textContent).toBe("1 expired (no new bookings) · 2 ending soon (within 60 days)");
        expect(screen.queryByText("Ending within 30 days")).toBeNull();
        expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["All3", "Expired1", "Ending soon2"]);
        expect(screen.getByRole("button", { name: "Run the renewals sweep" })).toBeTruthy();
        expect(within(rowOf("Hebbal Flyover Approach — Airport Road Billboard")).getByRole("checkbox", { name: "Select row" })).toBeTruthy();
        expect(screen.getAllByRole("button", { name: "Columns" }).length).toBeGreaterThan(0);
        /* How each spot is held, when it ends, the reference and the last reminder. */
        expect(screen.getByText("Lease")).toBeTruthy();
        expect(screen.getByText("LST-2009-2602")).toBeTruthy();
        expect(screen.getByText(/19d ago/)).toBeTruthy();
        expect(screen.getByText(/in 15d/)).toBeTruthy();
        expect(screen.getAllByText("Not yet").length).toBe(2);
    });

    it("narrows the table by chip", () => {
        renderQueue();
        fireEvent.click(screen.getByRole("tab", { name: /Expired/ }));
        expect(screen.getByText("Western Express Highway — Andheri Gantry")).toBeTruthy();
        expect(screen.queryByText("Hebbal Flyover Approach — Airport Road Billboard")).toBeNull();
        fireEvent.click(screen.getByRole("tab", { name: /Ending soon/ }));
        expect(screen.getByText("Hebbal Flyover Approach — Airport Road Billboard")).toBeTruthy();
        expect(screen.getByText("Silk Board Flyover — Skywalk Panel")).toBeTruthy();
        expect(screen.queryByText("Western Express Highway — Andheri Gantry")).toBeNull();
    });

    it("the sweep button posts the sweep and reloads the page", async () => {
        const { onChanged } = renderQueue();
        fireEvent.click(screen.getByTestId("renewals-sweep"));
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(posts()).toEqual(["POST /supply/rights/sweep"]);
    });

    it("says so when nothing is due", () => {
        renderQueue([]);
        expect(screen.getByText("Nothing due")).toBeTruthy();
    });

    it("offers nothing the viewer may not use", async () => {
        perms.held = new Set(["supply.view"]);
        renderQueue();
        expect(screen.queryByRole("button", { name: "Run the renewals sweep" })).toBeNull();
        expect(screen.queryAllByRole("checkbox", { name: "Select row" })).toHaveLength(0);
        const menu = await openMenu("Hebbal Flyover Approach — Airport Road Billboard");
        expect(menuItems(menu)).toEqual(["View listing", "Open documents"]);
    });
});

describe("the actions", () => {
    it("the row menu opens the listing and its documents, and reminds the publisher after a confirm", async () => {
        const { onChanged } = renderQueue();
        let menu = await openMenu("Hebbal Flyover Approach — Airport Road Billboard");
        expect(menuItems(menu)).toEqual(["View listing", "Open documents", "Remind publisher to renew"]);
        fireEvent.click(within(menu).getByRole("menuitem", { name: "Open documents" }));
        expect(router.push).toHaveBeenCalledWith("/listings/review/lst_1");

        menu = await openMenu("Hebbal Flyover Approach — Airport Road Billboard");
        fireEvent.click(within(menu).getByRole("menuitem", { name: "View listing" }));
        expect(router.push).toHaveBeenCalledWith("/listings/lst_1");

        menu = await openMenu("Hebbal Flyover Approach — Airport Road Billboard");
        fireEvent.click(within(menu).getByRole("menuitem", { name: "Remind publisher to renew" }));
        const dialog = await screen.findByRole("alertdialog");
        expect(within(dialog).getByText("Remind publisher to renew — Hebbal Flyover Approach — Airport Road Billboard (LST-2009-2601)")).toBeTruthy();
        fireEvent.click(within(dialog).getByRole("button", { name: "Remind publisher to renew" }));
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(posts()).toEqual(["POST /supply/listings/lst_1/rights/remind"]);
    });

    it("does not offer the reminder on a spot with no publisher", async () => {
        renderQueue();
        const menu = await openMenu("Silk Board Flyover — Skywalk Panel");
        expect(menuItems(menu)).toEqual(["View listing", "Open documents"]);
    });

    it("the bulk bar reminds each publisher, skipping a spot with none and keeping a refusal ticked", async () => {
        backend.refuse.set("POST /supply/listings/lst_2/rights/remind", "Reminded within the last 24 hours");
        const { onChanged } = renderQueue();
        tick("Hebbal Flyover Approach — Airport Road Billboard");
        tick("Western Express Highway — Andheri Gantry");
        tick("Silk Board Flyover — Skywalk Panel");
        expect(screen.getByText("3 selected")).toBeTruthy();
        fireEvent.click(screen.getByTestId("bulk-remind-renewal"));
        const dialog = await screen.findByRole("alertdialog");
        expect(within(dialog).getByText(/^2 will be reminded, 1 skipped \(no publisher\)\./)).toBeTruthy();
        fireEvent.click(within(dialog).getByRole("button", { name: "Remind the publishers of 2 listings" }));
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(posts()).toEqual(["POST /supply/listings/lst_1/rights/remind", "POST /supply/listings/lst_2/rights/remind"]);
        expect(toast.warning.mock.calls[0]![0]).toBe("1 reminded · 1 failed: Reminded within the last 24 hours");
        /* The refusal stays ticked. */
        expect(screen.getByText("1 selected")).toBeTruthy();
    });
});
