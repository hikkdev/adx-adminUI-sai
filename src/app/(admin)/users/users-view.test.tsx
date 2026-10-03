import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Users › Accounts on the party directories' layout — 2 Oct 2026 (the
 * owner: "UI looks pretty weird compared to rest of the console and there is
 * no bulk action buttons, also no delete users button still"; and "as if
 * they're not linked at all").
 *
 * Pinned: no number cards, the shared filter bar's controls in the shared
 * order with the Status select over the users route's states and counts; the
 * roster's Name cell with what the login holds under it; the roster's row
 * menu with its permissions; Delete account… asking `/deletable` first and
 * offering Close account instead when blocked; the bulk bar's Deactivate,
 * Reactivate and Delete with mixed results and skips, the failed rows kept
 * ticked; and the one-line invitations notice.
 */

const { toast, router, auth, calls, backend } = vi.hoisted(() => ({
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
    router: { replace: vi.fn(), push: vi.fn() },
    auth: { id: "u_me", perms: new Set<string>(["system.edit", "system.accounts"]) },
    calls: { updates: [] as { id: string; isActive: boolean }[], deletes: [] as string[], checks: [] as string[] },
    backend: {
        failUpdate: new Map<string, string>(),
        failDelete: new Map<string, string>(),
        deletable: new Map<string, { deletable: boolean; blockers: { kind: string; label: string; count: number }[] }>(),
    },
}));

vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({
    useRouter: () => router,
    usePathname: () => "/users/accounts",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/auth")>();
    return {
        ...actual,
        useOptionalAuth: () => ({ user: { id: auth.id, name: "Me", email: "me@adx.in", roles: ["ADMIN"] }, can: (permission: string) => auth.perms.has(permission) }),
    };
});
vi.mock("@/services/users", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/users")>();
    return {
        ...actual,
        usersService: {
            ...actual.usersService,
            update: vi.fn(async (id: string, body: { isActive: boolean }) => {
                calls.updates.push({ id, isActive: body.isActive });
                const failure = backend.failUpdate.get(id);
                if (failure) throw new Error(failure);
                return {};
            }),
        },
        accountLifecycleService: {
            ...actual.accountLifecycleService,
            deletable: vi.fn(async (id: string) => {
                calls.checks.push(id);
                return backend.deletable.get(id) ?? { deletable: true, blockers: [] };
            }),
            deleteAccount: vi.fn(async (id: string) => {
                calls.deletes.push(id);
                const failure = backend.failDelete.get(id);
                if (failure) throw new Error(failure);
                return {};
            }),
            closureReview: vi.fn(() => new Promise(() => {})),
        },
    };
});

import { shapeUserRow, type UsersDirectory, type WireUserRow } from "@/services/users";
import { UsersView } from "./users-view";
import { facetsOf, facetsQuery, usersQueryOf } from "./users-loader";
import { planStatusMove, resultSummary, skippedSentence } from "./users-bulk";

const wire = (over: Partial<WireUserRow> = {}): WireUserRow => ({
    id: "u_1",
    displayId: "ADX-0210-2601",
    mobile: "+919876543210",
    name: "Vikram Rao",
    email: "vikram@skyline.in",
    language: null,
    isActive: true,
    closedAt: null,
    lastLoginAt: "2026-09-14T08:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    roles: ["PUBLISHER"],
    roleConfig: null,
    ...over,
});

const directory = (rows: WireUserRow[], counts = { ACTIVE: rows.length, INACTIVE: 0, CLOSED: 0, ERASED: 0 }): UsersDirectory => ({
    rows: rows.map(shapeUserRow),
    counts,
    total: rows.length,
});

function Harness({ rows, counts, invitesWaiting = 0, onFacetsChange = () => {} }: { rows: WireUserRow[]; counts?: UsersDirectory["counts"]; invitesWaiting?: number; onFacetsChange?: (next: unknown) => void }) {
    const [query, setQuery] = React.useState("");
    return (
        <UsersView
            directory={directory(rows, counts)}
            facets={{ status: "ACTIVE", role: null }}
            onFacetsChange={onFacetsChange}
            query={query}
            onQueryChange={setQuery}
            invitesWaiting={invitesWaiting}
            roles={[]}
            onChanged={() => {}}
        />
    );
}

const rowOf = (name: string) => {
    const row = within(screen.getByRole("table"))
        .getAllByRole("row")
        .find((candidate) => within(candidate).queryByText(name));
    if (!row) throw new Error(`No row for ${name}`);
    return row;
};

async function openMenu(name: string) {
    fireEvent.keyDown(within(rowOf(name)).getByRole("button", { name: "Row actions" }), { key: "ArrowDown" });
    return screen.findByTestId("roster-row-menu");
}

const tick = (name: string) => fireEvent.click(within(rowOf(name)).getByRole("checkbox", { name: "Select row" }));
const isTicked = (name: string) => within(rowOf(name)).getByRole("checkbox", { name: "Select row" }).getAttribute("data-state") === "checked";

const ROWS = [
    wire({ id: "u_1", name: "Vikram Rao" }),
    wire({ id: "u_2", name: "Anjali Krishnan", email: "anjali@metro.in", isActive: false }),
    wire({ id: "u_3", name: "Farhan Khan", email: "farhan@mumbai.in", closedAt: "2026-09-01T00:00:00.000Z", isActive: false }),
    wire({ id: "u_me", name: "Me Myself", email: "me@adx.in", roles: ["ADMIN"] }),
    wire({ id: "u_5", name: "Lakshmi Hegde", email: "lakshmi@ktb.in" }),
];

beforeEach(() => {
    vi.clearAllMocks();
    auth.perms = new Set(["system.edit", "system.accounts"]);
    calls.updates = [];
    calls.deletes = [];
    calls.checks = [];
    backend.failUpdate.clear();
    backend.failDelete.clear();
    backend.deletable.clear();
});

describe("the layout", () => {
    it("has no number cards, the shared filter order with Columns on the right, and the roster header", () => {
        render(<Harness rows={ROWS} />);
        expect(screen.queryByText("Active accounts")).toBeNull();
        expect(screen.queryByRole("tab")).toBeNull();
        expect(screen.queryByRole("combobox", { name: "Sort" })).toBeNull();
        const controls = Array.from(screen.getByTestId("users-filters").querySelectorAll("input[aria-label], button[aria-label]")).map((element) => element.getAttribute("aria-label"));
        expect(controls).toEqual(["Search", "Role", "Status"]);
        expect(screen.getByPlaceholderText("Search name, business, ID, phone, email")).toBeInTheDocument();
        expect(screen.getByRole("combobox", { name: "Role" })).toHaveTextContent("Any role");
        expect(screen.getByRole("button", { name: /Columns/ })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Users" })).toBeInTheDocument();
        expect(screen.getByText("5 accounts on the marketplace")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Invite user/ })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Create user/ })).toBeInTheDocument();
        // The roster's paging and foot.
        expect(screen.getByText("Rows per page")).toBeInTheDocument();
        expect(screen.getByText("Showing 5 of 5 accounts")).toBeInTheDocument();
    });

    it("draws the columns in order, the roster's Name and Contact cells, and the account-state pill", () => {
        render(
            <Harness
                rows={[
                    wire({ id: "u_1", name: "Vikram Rao" }),
                    wire({ id: "u_9", name: "Former Owner", email: null, isActive: false, closedAt: "2026-09-01T00:00:00.000Z", erasedAt: "2026-10-01T00:00:00.000Z" }),
                ]}
            />,
        );
        const headers = within(screen.getByRole("table"))
            .getAllByRole("columnheader")
            .map((header) => header.textContent);
        expect(headers.slice(1, 8)).toEqual(["Name", "Contact", "Roles", "Console role", "Joined", "Last active", "Status"]);
        const vikram = rowOf("Vikram Rao");
        expect(within(vikram).getByText("ADX-0210-2601")).toHaveClass("font-mono");
        expect(vikram).toHaveTextContent("ADX ID ADX-0210-2601");
        expect(within(vikram).getByText("+91 98765 43210")).toBeInTheDocument();
        expect(within(vikram).getByText("vikram@skyline.in")).toBeInTheDocument();
        expect(within(vikram).getByTestId("account-state-pill")).toHaveTextContent("Active");
        expect(within(rowOf("Former Owner")).getByTestId("account-state-pill")).toHaveTextContent("Erased");
    });

    it("names what the login holds under the person, linking each, with +N more past two", () => {
        render(
            <Harness
                rows={[
                    wire({
                        id: "u_1",
                        name: "Vikram Rao",
                        parties: [
                            { kind: "PUBLISHER", id: "pub_1", name: "Skyline Outdoor Media", displayId: "PUB-1" },
                            { kind: "ADVERTISER", id: "adv_1", name: "Skyline Brands", displayId: null },
                            { kind: "AGENT", id: "agt_1", name: "Vikram Rao", displayId: "AGT-1" },
                        ],
                    }),
                ]}
            />,
        );
        const line = within(rowOf("Vikram Rao")).getByTestId("user-parties");
        expect(within(line).getByRole("link", { name: "Publisher · Skyline Outdoor Media" })).toHaveAttribute("href", "/publishers/pub_1");
        expect(within(line).getByRole("link", { name: "Advertiser · Skyline Brands" })).toHaveAttribute("href", "/advertisers/adv_1");
        expect(line).toHaveTextContent("+1 more");
    });

    it("offers the users route's states with their counts, Active first and Everyone their sum", async () => {
        const picked = vi.fn();
        render(<Harness rows={ROWS} counts={{ ACTIVE: 40, INACTIVE: 3, CLOSED: 2, ERASED: 1 }} onFacetsChange={picked} />);
        const status = screen.getByRole("combobox", { name: "Status" });
        expect(status).toHaveTextContent("Active · 40");
        fireEvent.keyDown(status, { key: "ArrowDown" });
        const options = await screen.findAllByRole("option");
        expect(options.map((option) => option.textContent)).toEqual([
            expect.stringMatching(/^Active40/),
            expect.stringMatching(/^Deactivated3/),
            expect.stringMatching(/^Closed2/),
            expect.stringMatching(/^Erased1/),
            expect.stringMatching(/^Everyone46/),
        ]);
        fireEvent.keyDown(screen.getByRole("option", { name: /^Deactivated/ }), { key: "Enter" });
        expect(picked).toHaveBeenCalledWith({ status: "INACTIVE", role: null });
    });

    it("maps the Status onto the route's `state`: Active by default and unwritten, Everyone sends none", () => {
        expect(facetsOf(new URLSearchParams())).toEqual({ status: "ACTIVE", role: null });
        expect(facetsOf(new URLSearchParams("state=ERASED&role=ADMIN"))).toEqual({ status: "ERASED", role: "ADMIN" });
        expect(facetsQuery({ status: "ACTIVE", role: null })).toBe("");
        expect(facetsQuery({ status: "ALL", role: null })).toBe("state=ALL");
        expect(usersQueryOf({ status: "ALL", role: null }, "skyline")).toEqual({ q: "skyline" });
        expect(usersQueryOf({ status: "INACTIVE", role: "PUBLISHER" }, "")).toEqual({ state: "INACTIVE", role: "PUBLISHER" });
    });
});

describe("the invitations notice", () => {
    it("says how many are waiting and links to Admin users, only when there are some", () => {
        const { rerender } = render(<Harness rows={ROWS} invitesWaiting={2} />);
        const notice = screen.getByTestId("users-invites-notice");
        expect(notice).toHaveTextContent("2 invitations are waiting to be accepted");
        expect(within(notice).getByRole("link", { name: "View" })).toHaveAttribute("href", "/users/admins#invitations");
        rerender(<Harness rows={ROWS} invitesWaiting={0} />);
        expect(screen.queryByTestId("users-invites-notice")).toBeNull();
        expect(screen.queryByText("Pending invites")).toBeNull();
    });
});

describe("the row menu", () => {
    const items = (menu: HTMLElement) => within(menu).getAllByRole("menuitem").map((item) => item.textContent);

    it("is the roster's menu: Actions, View details, then the status slot and Delete", async () => {
        render(<Harness rows={ROWS} />);
        const menu = await openMenu("Vikram Rao");
        expect(menu.className).toContain("w-52");
        expect(within(menu).getByText("Actions")).toBeInTheDocument();
        expect(items(menu)).toEqual(["View details", "Deactivate", "Delete account…"]);
        expect(within(menu).getAllByRole("separator")).toHaveLength(1);
    });

    it("offers Reactivate on a deactivated account, nothing to move on a closed one, nothing on one's own", async () => {
        render(<Harness rows={ROWS} />);
        expect(items(await openMenu("Anjali Krishnan"))).toEqual(["View details", "Reactivate", "Delete account…"]);
        fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
        await waitFor(() => expect(screen.queryByTestId("roster-row-menu")).toBeNull());
        expect(items(await openMenu("Farhan Khan"))).toEqual(["View details", "Delete account…"]);
        fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
        await waitFor(() => expect(screen.queryByTestId("roster-row-menu")).toBeNull());
        const own = await openMenu("Me Myself");
        expect(items(own)).toEqual(["View details"]);
        expect(within(own).queryByRole("separator")).toBeNull();
    });

    it("needs system.edit to move an account and system.accounts to delete one", async () => {
        auth.perms = new Set(["system.edit"]);
        const { unmount } = render(<Harness rows={ROWS} />);
        expect(items(await openMenu("Vikram Rao"))).toEqual(["View details", "Deactivate"]);
        unmount();
        auth.perms = new Set(["system.accounts"]);
        render(<Harness rows={ROWS} />);
        expect(items(await openMenu("Vikram Rao"))).toEqual(["View details", "Delete account…"]);
    });

    it("deactivates through the activation call after a confirm", async () => {
        render(<Harness rows={ROWS} />);
        fireEvent.click(within(await openMenu("Vikram Rao")).getByRole("menuitem", { name: "Deactivate" }));
        fireEvent.click(await screen.findByRole("button", { name: "Deactivate" }));
        await waitFor(() => expect(calls.updates).toEqual([{ id: "u_1", isActive: false }]));
    });
});

describe("Delete account…", () => {
    it("asks /deletable, then confirms and deletes an account with no history", async () => {
        render(<Harness rows={ROWS} />);
        fireEvent.click(within(await openMenu("Vikram Rao")).getByRole("menuitem", { name: "Delete account…" }));
        expect(await screen.findByText("Delete Vikram Rao permanently?")).toBeInTheDocument();
        expect(calls.checks).toEqual(["u_1"]);
        fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
        await waitFor(() => expect(calls.deletes).toEqual(["u_1"]));
        expect(toast.success).toHaveBeenCalledWith("Vikram Rao deleted", expect.anything());
    });

    it("lists the blockers of an account with history and offers Close account instead", async () => {
        backend.deletable.set("u_1", { deletable: false, blockers: [{ kind: "orders", label: "orders", count: 3 }, { kind: "kycRecords", label: "KYC records", count: 1 }] });
        render(<Harness rows={ROWS} />);
        fireEvent.click(within(await openMenu("Vikram Rao")).getByRole("menuitem", { name: "Delete account…" }));
        const dialog = await screen.findByTestId("delete-blocked");
        expect(dialog).toHaveTextContent("Vikram Rao can't be deleted");
        expect(dialog).toHaveTextContent("3 orders");
        expect(dialog).toHaveTextContent("1 KYC records");
        fireEvent.click(within(dialog).getByRole("button", { name: "Close account instead" }));
        // The existing Close account flow opens (its review is read when it mounts).
        expect(await screen.findByRole("dialog")).toBeInTheDocument();
        expect(calls.deletes).toEqual([]);
    });
});

describe("the bulk bar", () => {
    it("counts what each action would change, and skips the viewer and closed accounts", () => {
        render(<Harness rows={ROWS} />);
        ["Vikram Rao", "Anjali Krishnan", "Farhan Khan", "Me Myself"].forEach(tick);
        expect(screen.getByTestId("users-deactivate-selected")).toHaveTextContent("Deactivate selected (1)");
        expect(screen.getByTestId("users-reactivate-selected")).toHaveTextContent("Reactivate selected (1)");
        expect(screen.getByTestId("users-delete-selected")).toHaveTextContent("Delete selected (3)");

        const rows = ROWS.map(shapeUserRow).slice(0, 4);
        const plan = planStatusMove(rows, "deactivate", "u_me");
        expect(plan.apply.map((row) => row.id)).toEqual(["u_1"]);
        expect(skippedSentence(plan)).toBe("Skipped: 1 already deactivated, 1 closed account, your own account.");
    });

    it("hides the actions the viewer may not take", () => {
        auth.perms = new Set(["system.accounts"]);
        render(<Harness rows={ROWS} />);
        tick("Vikram Rao");
        expect(screen.queryByTestId("users-deactivate-selected")).toBeNull();
        expect(screen.getByTestId("users-delete-selected")).toBeInTheDocument();
    });

    it("deactivates once per account after a confirm, reports the mixed result and keeps the failed ones ticked", async () => {
        backend.failUpdate.set("u_5", "The last active super admin can't be deactivated");
        render(<Harness rows={ROWS} />);
        ["Vikram Rao", "Lakshmi Hegde", "Farhan Khan", "Me Myself"].forEach(tick);
        fireEvent.click(screen.getByTestId("users-deactivate-selected"));
        const confirm = await screen.findByRole("alertdialog");
        expect(confirm).toHaveTextContent("Deactivate 2 accounts?");
        expect(confirm).toHaveTextContent("Skipped: 1 closed account, your own account.");
        fireEvent.click(within(confirm).getByRole("button", { name: "Deactivate 2 accounts" }));
        await waitFor(() => expect(toast.warning).toHaveBeenCalled());
        expect(calls.updates).toEqual([
            { id: "u_1", isActive: false },
            { id: "u_5", isActive: false },
        ]);
        expect(toast.warning.mock.calls[0]![0]).toBe("1 done, 1 couldn't be changed: The last active super admin can't be deactivated");
        await waitFor(() => expect(isTicked("Lakshmi Hegde")).toBe(true));
        expect(isTicked("Vikram Rao")).toBe(false);
        expect(isTicked("Farhan Khan")).toBe(false);
    });

    it("reactivates once per account and says done", async () => {
        render(<Harness rows={ROWS} />);
        ["Anjali Krishnan", "Vikram Rao"].forEach(tick);
        fireEvent.click(screen.getByTestId("users-reactivate-selected"));
        const confirm = await screen.findByRole("alertdialog");
        expect(confirm).toHaveTextContent("Skipped: 1 already active.");
        fireEvent.click(within(confirm).getByRole("button", { name: "Reactivate 1 account" }));
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith("1 done", undefined));
        expect(calls.updates).toEqual([{ id: "u_2", isActive: true }]);
    });

    it("checks each account before deleting, lists what can't go with its first blocker, and deletes only the rest", async () => {
        backend.deletable.set("u_2", { deletable: false, blockers: [{ kind: "orders", label: "orders", count: 3 }, { kind: "invoices", label: "invoices", count: 2 }] });
        backend.failDelete.set("u_5", "Something changed");
        render(<Harness rows={ROWS} />);
        ["Vikram Rao", "Anjali Krishnan", "Lakshmi Hegde", "Me Myself"].forEach(tick);
        fireEvent.click(screen.getByTestId("users-delete-selected"));
        const plan = await screen.findByTestId("users-delete-plan");
        expect(calls.checks.sort()).toEqual(["u_1", "u_2", "u_5"]);
        const confirm = screen.getByRole("alertdialog");
        expect(confirm).toHaveTextContent("Delete 2 accounts permanently?");
        expect(confirm).toHaveTextContent("2 can be deleted, 1 can't.");
        expect(plan).toHaveTextContent("These have history, so they can't be deleted: close their accounts instead.");
        expect(plan).toHaveTextContent("Anjali Krishnan: 3 orders");
        expect(plan).toHaveTextContent("Your own account is never deleted");
        fireEvent.click(within(confirm).getByRole("button", { name: "Delete 2 accounts" }));
        await waitFor(() => expect(toast.warning).toHaveBeenCalled());
        expect(calls.deletes).toEqual(["u_1", "u_5"]);
        expect(toast.warning.mock.calls[0]![0]).toBe("1 done, 1 couldn't be changed: Something changed");
        await waitFor(() => expect(isTicked("Lakshmi Hegde")).toBe(true));
        expect(isTicked("Vikram Rao")).toBe(false);
    });

    it("deletes nothing when nothing ticked can go", async () => {
        backend.deletable.set("u_1", { deletable: false, blockers: [{ kind: "listings", label: "listings", count: 4 }] });
        render(<Harness rows={ROWS} />);
        tick("Vikram Rao");
        fireEvent.click(screen.getByTestId("users-delete-selected"));
        const confirm = await screen.findByRole("alertdialog");
        expect(confirm).toHaveTextContent("None of these can be deleted");
        expect(within(confirm).getByRole("button", { name: "Delete" })).toBeDisabled();
        expect(calls.deletes).toEqual([]);
    });

    it("words the result: N done, or N done and M couldn't be changed with the reasons", () => {
        const [a, b] = ROWS.map(shapeUserRow);
        expect(resultSummary({ done: [a!, b!], failed: [] }).title).toBe("2 done");
        const mixed = resultSummary({ done: [a!], failed: [{ row: b!, message: "Refused" }] });
        expect(mixed).toMatchObject({ tone: "warning", title: "1 done, 1 couldn't be changed: Refused", lines: ["Anjali Krishnan: Refused"] });
    });
});
