import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Listings › Verification (3 Oct 2026) — the owner: "If verifications
 * lapsed, what action can we take here? There's no actionable button or
 * bulk action or selection option".
 *
 * Pinned:
 *  - the other queues' layout: one summary line under the title instead of
 *    the four number cards, the chips All / Re-check overdue / Re-check due
 *    soon / Suspended
 *    with counts, the shared table with checkboxes; "Run enforcement sweep"
 *    top right, and only for a viewer who may run it;
 *  - the bulk bar: Remind publisher, Send an agent, Give more time… each
 *    confirm first, say how many they skip and why, call the single-row
 *    route per listing, and keep a failure ticked;
 *  - the row menu: Photos first, then the listing, then the queue actions
 *    that apply to the row, then the rosters' Suspend… / Reinstate;
 *  - the compliance cases: the same table with a row menu and a bar — Log
 *    contact attempt… (channel, outcome, note) and Resolve… (outcome, note);
 *  - what the viewer may not do is not offered;
 *  - 3 Oct 2026, the owner: "There's some lapsed ones but it doesn't show in
 *    renewals tab" — this page is "Spot re-checks": it never says "Lapsed",
 *    explains the photo re-check, and points at Renewals for leases and
 *    permits; a compliance case is named "Re-check case · LST-…" with the
 *    day it opened, never its database id.
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
    usePathname: () => "/listings/verification",
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
        return method === "GET" ? [] : { ok: true };
    };
    return { ...actual, api: { get: handle("GET"), post: handle("POST"), patch: handle("PATCH"), put: handle("PUT"), delete: handle("DELETE") } };
});

import {
    verificationChips,
    verificationCounts,
    verificationQueueSubtitle,
} from "@/services/verification-queue";
import type { ComplianceCase, VerificationQueueRow } from "@/types";
import { VerificationQueue } from "./verification-queue";

const DAY = 86_400_000;
const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString();

const row = (over: Partial<VerificationQueueRow> = {}): VerificationQueueRow => ({
    listingId: "lst_1",
    displayId: "LST-0110-2601",
    title: "MG Road hoarding",
    publisherId: "pub_1",
    publisherName: "Sharma Hoardings",
    removability: "PERMANENT",
    verifiedAt: inDays(-185),
    verificationExpiresAt: inDays(-5),
    status: "ACTIVE",
    state: "LAPSED",
    city: "Bengaluru",
    cityId: "city_blr",
    suspensionScopes: [],
    ...over,
});

const ROWS: VerificationQueueRow[] = [
    row(),
    row({ listingId: "lst_2", displayId: "LST-0110-2602", title: "Old flyover wall", publisherId: null, publisherName: null, city: "Pune", cityId: null }),
    row({ listingId: "lst_3", displayId: "LST-0110-2603", title: "Forum mall screen", state: "RISKY", verificationExpiresAt: inDays(6), removability: "REMOVABLE" }),
    row({ listingId: "lst_4", displayId: "LST-0110-2604", title: "Metro pillar wrap", status: "SUSPENDED", verificationExpiresAt: inDays(-9) }),
];

const kase = (over: Partial<ComplianceCase> = {}): ComplianceCase => ({
    id: "cc_1",
    listingId: "lst_1",
    listingTitle: "MG Road hoarding",
    listingDisplayId: "LST-0110-2601",
    publisherName: "Sharma Hoardings",
    status: "OPEN",
    openedAt: inDays(-2),
    dueAt: inDays(0),
    attemptCount: 0,
    lastAttemptAt: null,
    ...over,
});

const CASES: ComplianceCase[] = [
    kase(),
    kase({ id: "cc_2", listingId: "lst_4", listingTitle: "Metro pillar wrap", listingDisplayId: "LST-0110-2604", status: "RESOLVED", attemptCount: 2 }),
];

function renderQueue(props: Partial<React.ComponentProps<typeof VerificationQueue>> = {}) {
    const onChanged = vi.fn();
    render(<VerificationQueue rows={ROWS} cases={CASES} onChanged={onChanged} {...props} />);
    return { onChanged };
}

const rowOf = (text: string) => screen.getAllByText(text)[0]!.closest("tr")!;
const tick = (text: string) => fireEvent.click(within(rowOf(text)).getByRole("checkbox", { name: "Select row" }));
const openMenu = async (text: string) => {
    fireEvent.keyDown(within(rowOf(text)).getByRole("button", { name: "Row actions" }), { key: "ArrowDown" });
    return screen.findByTestId("roster-row-menu");
};
const menuItems = (menu: HTMLElement) => within(menu).getAllByRole("menuitem").map((item) => item.textContent);
const posts = () => backend.calls.filter((call) => call.method !== "GET").map((call) => [`${call.method} ${call.path}`, call.body]);

beforeEach(() => {
    backend.reset();
    perms.held = new Set(["supply.view", "supply.edit", "supply.approve", "supply.suspend", "system.jobs"]);
    for (const fn of Object.values(toast)) fn.mockReset();
    router.push.mockReset();
});

describe("the queue's vocabulary", () => {
    it("puts every row under one chip, and says the summary line in the owner's words", () => {
        const counts = verificationCounts([
            { status: "ACTIVE", state: "LAPSED" },
            { status: "ACTIVE", state: "LAPSED" },
            { status: "ACTIVE", state: "LAPSED" },
            { status: "SUSPENDED", state: "LAPSED" },
        ]);
        expect(counts).toEqual({ all: 4, LAPSED: 3, DUE_SOON: 0, SUSPENDED: 1 });
        expect(verificationQueueSubtitle(counts, 0)).toBe(
            "3 re-checks overdue (earnings paused) · 0 re-checks due soon · 0 compliance cases waiting · 1 suspended past the 48-hour window",
        );
        expect(verificationQueueSubtitle(counts, 1)).toContain("1 compliance case waiting");
        expect(verificationChips(counts).map((chip) => `${chip.label} ${chip.count}`)).toEqual(["All 4", "Re-check overdue 3", "Re-check due soon 0", "Suspended 1"]);
    });
});

describe("the words (3 Oct 2026)", () => {
    it("titles the page for the photo re-check, explains it, and points at Renewals for leases and permits", () => {
        renderQueue();
        expect(screen.getByRole("heading", { name: "Spot re-checks" })).toBeTruthy();
        expect(
            screen.getByText(
                "Each live spot is re-checked with a GPS photo on a schedule (permanent spots every 180 days). An overdue re-check pauses the publisher's earnings on that spot, not the campaign."
            )
        ).toBeTruthy();
        const crossLink = screen.getByTestId("queue-cross-link");
        expect(crossLink.textContent).toBe("Looking for leases or permits running out? See Renewals.");
        expect(within(crossLink).getByRole("link", { name: "See Renewals" }).getAttribute("href")).toBe("/listings/renewals");
    });

    it("never says Lapsed: the pill reads Re-check overdue, and Re-check due soon inside the window", () => {
        renderQueue();
        expect(screen.queryByText("Lapsed")).toBeNull();
        expect(within(rowOf("MG Road hoarding")).getByText("Re-check overdue")).toBeTruthy();
        expect(within(rowOf("Forum mall screen")).getByText("Re-check due soon")).toBeTruthy();
    });

    it("names a compliance case by its listing reference and the day it opened, never the database id", () => {
        renderQueue();
        const casesTable = screen.getAllByRole("table")[1]!;
        expect(within(casesTable).queryByText("cc_1")).toBeNull();
        const caseCell = within(casesTable).getByText("Re-check case · LST-0110-2601").closest("td")!;
        expect(within(caseCell).getByText(/^opened \d{1,2} [A-Z][a-z]{2} \d{4}$/)).toBeTruthy();
    });
});

describe("the layout", () => {
    it("draws the summary line, the chips with counts and the shared table — no number cards — with the sweep top right", () => {
        renderQueue();
        expect(screen.getByTestId("queue-summary").textContent).toBe("2 re-checks overdue (earnings paused) · 1 re-check due soon · 1 compliance case waiting · 1 suspended past the 48-hour window");
        expect(screen.queryByText("In the risk window")).toBeNull();
        const chips = screen.getAllByRole("tab").map((tab) => tab.textContent);
        expect(chips).toEqual(["All4", "Re-check overdue2", "Re-check due soon1", "Suspended1"]);
        expect(screen.getByRole("button", { name: "Run enforcement sweep" })).toBeTruthy();
        expect(within(rowOf("MG Road hoarding")).getByRole("checkbox", { name: "Select row" })).toBeTruthy();
        expect(screen.getAllByRole("button", { name: "Columns" }).length).toBeGreaterThan(0);
        /* The suspension for the overdue re-check says so beside the state. */
        expect(within(rowOf("Metro pillar wrap")).getByText("Suspended")).toBeTruthy();
    });

    it("narrows the table by chip", () => {
        renderQueue();
        fireEvent.click(screen.getByRole("tab", { name: /Re-check due soon/ }));
        expect(screen.getByText("Forum mall screen")).toBeTruthy();
        expect(screen.queryByText("Old flyover wall")).toBeNull();
        fireEvent.click(screen.getByRole("tab", { name: /Suspended/ }));
        expect(within(screen.getAllByRole("table")[0]!).getByText("Metro pillar wrap")).toBeTruthy();
        expect(within(screen.getAllByRole("table")[0]!).queryByText("Forum mall screen")).toBeNull();
    });

    it("offers nothing the viewer may not use", async () => {
        perms.held = new Set(["supply.view"]);
        renderQueue();
        expect(screen.queryByRole("button", { name: "Run enforcement sweep" })).toBeNull();
        expect(screen.queryAllByRole("checkbox", { name: "Select row" })).toHaveLength(0);
        const menu = await openMenu("Forum mall screen");
        expect(menuItems(menu)).toEqual(["Photos", "View listing"]);
    });
});

describe("the bulk bar", () => {
    it("reminds the publishers, skipping a listing with none and saying so", async () => {
        const { onChanged } = renderQueue();
        tick("MG Road hoarding");
        tick("Old flyover wall");
        expect(screen.getByText("2 selected")).toBeTruthy();
        fireEvent.click(screen.getByTestId("bulk-remind"));
        const dialog = await screen.findByRole("alertdialog");
        expect(within(dialog).getByText(/^1 will be reminded, 1 skipped \(no publisher\)\./)).toBeTruthy();
        fireEvent.click(within(dialog).getByRole("button", { name: "Remind the publishers of 1 listing" }));
        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
        expect(posts()).toEqual([["POST /supply/listings/lst_1/reverification/remind", undefined]]);
        expect(toast.success).toHaveBeenCalledWith("1 reminded", undefined);
    });

    it("gives more time with the days and a reason, skips the suspended, and keeps a refusal ticked", async () => {
        backend.refuse.set("POST /supply/listings/lst_3/reverification/extend", "Refused for the test");
        renderQueue();
        tick("MG Road hoarding");
        tick("Forum mall screen");
        tick("Metro pillar wrap");
        fireEvent.click(screen.getByTestId("bulk-extend"));
        const dialog = await screen.findByRole("alertdialog");
        expect(within(dialog).getByText(/2 will be given more time, 1 skipped \(suspended for the overdue re-check — a new check lifts it\)\./)).toBeTruthy();
        const confirm = within(dialog).getByRole("button", { name: "Give 2 listings more time" });
        expect(confirm).toBeDisabled();
        fireEvent.change(within(dialog).getByLabelText("Days (1 to 30)"), { target: { value: "10" } });
        fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Publisher out of town" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Give 2 listings more time" }));
        await waitFor(() => expect(toast.warning).toHaveBeenCalled());
        expect(posts()).toEqual([
            ["POST /supply/listings/lst_1/reverification/extend", { days: 10, reason: "Publisher out of town" }],
            ["POST /supply/listings/lst_3/reverification/extend", { days: 10, reason: "Publisher out of town" }],
        ]);
        expect(toast.warning.mock.calls[0]![0]).toBe("1 given more time · 1 failed: Refused for the test");
        expect(within(rowOf("Forum mall screen")).getByRole("checkbox", { name: "Select row" })).toHaveAttribute("data-state", "checked");
        expect(within(rowOf("MG Road hoarding")).getByRole("checkbox", { name: "Select row" })).toHaveAttribute("data-state", "unchecked");
    });

    it("sends an agent to each spot with a publisher and a city, with the line for the agent", async () => {
        renderQueue();
        tick("MG Road hoarding");
        tick("Old flyover wall");
        fireEvent.click(screen.getByTestId("bulk-site-check"));
        const dialog = await screen.findByRole("alertdialog");
        expect(within(dialog).getByText(/^1 will be sent an agent, 1 skipped \(no publisher\)\./)).toBeTruthy();
        fireEvent.change(within(dialog).getByLabelText("A line for the agent (optional)"), { target: { value: "Gate code 4411" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Send an agent to 1 listing" }));
        await waitFor(() => expect(toast.success).toHaveBeenCalled());
        expect(posts()).toEqual([["POST /supply/listings/lst_1/reverification/site-check", { note: "Gate code 4411" }]]);
    });
});

describe("the row menu", () => {
    it("lists Photos first, the listing, the queue actions that apply, then the status slot", async () => {
        renderQueue();
        const menu = await openMenu("MG Road hoarding");
        expect(menuItems(menu)).toEqual(["Photos", "View listing", "Remind publisher", "Send an agent", "Give more time…", "Suspend…"]);
    });

    it("leaves out what does not apply to the row", async () => {
        renderQueue();
        const menu = await openMenu("Old flyover wall");
        expect(menuItems(menu)).toEqual(["Photos", "View listing", "Give more time…", "Suspend…"]);
    });

    it("runs one action on one row through the same route, after a confirm", async () => {
        const { onChanged } = renderQueue();
        const menu = await openMenu("MG Road hoarding");
        fireEvent.click(within(menu).getByRole("menuitem", { name: "Remind publisher" }));
        const dialog = await screen.findByRole("alertdialog");
        expect(within(dialog).getByText("Remind publisher — MG Road hoarding (LST-0110-2601)")).toBeTruthy();
        fireEvent.click(within(dialog).getByRole("button", { name: "Remind publisher" }));
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(posts()).toEqual([["POST /supply/listings/lst_1/reverification/remind", undefined]]);
    });

    it("gives one listing more time from the menu with its own days and reason", async () => {
        renderQueue();
        const menu = await openMenu("Forum mall screen");
        fireEvent.click(within(menu).getByRole("menuitem", { name: "Give more time…" }));
        const dialog = await screen.findByRole("alertdialog");
        expect(within(dialog).getByRole("button", { name: "Give more time" })).toBeDisabled();
        fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Monsoon week" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Give more time" }));
        await waitFor(() => expect(posts()).toEqual([["POST /supply/listings/lst_3/reverification/extend", { days: 7, reason: "Monsoon week" }]]));
    });

    it("opens the photos from the menu — the listing's submitted checks are read", async () => {
        renderQueue();
        const menu = await openMenu("MG Road hoarding");
        fireEvent.click(within(menu).getByRole("menuitem", { name: "Photos" }));
        await waitFor(() => expect(backend.calls.some((call) => call.method === "GET" && call.path === "/supply/listings/lst_1/verifications")).toBe(true));
    });
});

describe("the compliance cases", () => {
    it("logs one contact attempt on each open case, skipping a resolved one", async () => {
        renderQueue();
        const casesTable = screen.getAllByRole("table")[1]!;
        fireEvent.click(within(within(casesTable).getByText("Re-check case · LST-0110-2601").closest("tr")!).getByRole("checkbox", { name: "Select row" }));
        fireEvent.click(within(within(casesTable).getByText("Re-check case · LST-0110-2604").closest("tr")!).getByRole("checkbox", { name: "Select row" }));
        fireEvent.click(screen.getByTestId("bulk-log-attempt"));
        const dialog = await screen.findByRole("alertdialog");
        expect(within(dialog).getByText(/^1 will be logged, 1 skipped \(already resolved\)\./)).toBeTruthy();
        fireEvent.change(within(dialog).getByLabelText("Outcome"), { target: { value: "No answer" } });
        fireEvent.change(within(dialog).getByLabelText("Note (optional)"), { target: { value: "Rang twice" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Log an attempt on 1 case" }));
        await waitFor(() => expect(toast.success).toHaveBeenCalled());
        expect(posts()).toEqual([["POST /supply/compliance/cases/cc_1/attempts", { channel: "CALL", outcome: "No answer", note: "Rang twice" }]]);
    });

    it("resolves from the row menu with an outcome and a note", async () => {
        renderQueue();
        const casesTable = screen.getAllByRole("table")[1]!;
        fireEvent.keyDown(within(within(casesTable).getByText("Re-check case · LST-0110-2601").closest("tr")!).getByRole("button", { name: "Row actions" }), { key: "ArrowDown" });
        const menu = await screen.findByTestId("roster-row-menu");
        expect(menuItems(menu)).toEqual(["View listing", "Log contact attempt…", "Resolve…"]);
        fireEvent.click(within(menu).getByRole("menuitem", { name: "Resolve…" }));
        const dialog = await screen.findByRole("alertdialog");
        fireEvent.change(within(dialog).getByLabelText("Outcome"), { target: { value: "Publisher re-verified" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Resolve" }));
        await waitFor(() => expect(posts()).toEqual([["PATCH /supply/compliance/cases/cc_1/resolve", { outcome: "Publisher re-verified" }]]));
    });

    it("offers no case action without the permission", async () => {
        perms.held = new Set(["supply.view", "supply.edit"]);
        renderQueue();
        const casesTable = screen.getAllByRole("table")[1]!;
        fireEvent.keyDown(within(within(casesTable).getByText("Re-check case · LST-0110-2601").closest("tr")!).getByRole("button", { name: "Row actions" }), { key: "ArrowDown" });
        const menu = await screen.findByTestId("roster-row-menu");
        expect(menuItems(menu)).toEqual(["View listing", "Log contact attempt…"]);
    });
});
