import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Custom fields › bulk (28 Sep 2026). What is pinned: a tab's fields are
 * selected and their switches set together through the ordinary PATCH,
 * each carrying only the switches it would move (so each field's audit row
 * names what changed on it); a field already as asked, or archived, is
 * skipped and counted up front; archive and restore run per field; and
 * every action is shut without settings.edit, naming it.
 */

const { backend, perms, toast } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string; body?: unknown }[],
        reset() {
            this.calls = [];
        },
        async handle(method: string, path: string, body?: unknown) {
            this.calls.push({ method, path, body });
            return {};
        },
    },
    perms: { held: new Set<string>() },
    toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = (method: string) => (path: string, body?: unknown) => backend.handle(method, path, body);
    return { ...actual, api: { get: wrap("GET"), post: wrap("POST"), patch: wrap("PATCH"), put: wrap("PUT"), delete: wrap("DELETE") } };
});

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ can: (id: string) => perms.held.has(id), user: null }) }));

import { LEAVE_ALL, switchPatch, type CustomFieldDef } from "@/services/custom-fields";
import { CustomFieldsView, FIELD_BULK_BLOCKED } from "./custom-fields-view";
import type { DefsByEntity } from "./custom-fields-loader";

const def = (over: Partial<CustomFieldDef> = {}): CustomFieldDef => ({
    id: "cf_1",
    entity: "PUBLISHER",
    key: "preferred_contact_time",
    label: "Preferred contact time",
    kind: "text",
    options: null,
    hint: null,
    required: false,
    showOnDesk: true,
    showInApps: false,
    showOnWebsite: false,
    editableByOwner: false,
    sortOrder: 0,
    archivedAt: null,
    ...over,
});

const contact = def();
const facing = def({ id: "cf_2", key: "facing", label: "Facing direction", showInApps: true, editableByOwner: true, sortOrder: 1 });
const source = def({ id: "cf_3", key: "source", label: "Source", showOnDesk: false, sortOrder: 2 });
const old = def({ id: "cf_4", key: "old_code", label: "Old code", archivedAt: "2026-09-01T00:00:00.000Z", sortOrder: 3 });

const defs = (publisher: CustomFieldDef[]): DefsByEntity => ({ PUBLISHER: publisher, ADVERTISER: [], LISTING: [], LEAD: [] });

/** Opens a Radix select by keyboard (jsdom has no pointer) and picks the option. */
async function pick(trigger: HTMLElement, option: string) {
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: option }));
}

beforeEach(() => {
    backend.reset();
    perms.held = new Set(["settings.view", "settings.edit"]);
    for (const fn of Object.values(toast)) fn.mockReset();
});

describe("setting where fields show", () => {
    it("PATCHes each field with only the switches it would move, skipping one already set", async () => {
        const onChanged = vi.fn();
        render(<CustomFieldsView defs={defs([contact, facing, source])} onChanged={onChanged} />);
        fireEvent.click(screen.getByRole("checkbox", { name: "Select all rows" }));
        fireEvent.click(screen.getByTestId("bulk-switches"));

        const dialog = await screen.findByRole("alertdialog");
        // Nothing chosen yet: nothing to confirm.
        expect(within(dialog).getByRole("button", { name: "Change 3 fields" })).toBeDisabled();

        await pick(within(dialog).getByTestId("cf-bulk-showInApps"), "On");
        await pick(within(dialog).getByTestId("cf-bulk-editableByOwner"), "On");
        expect(within(dialog).getByText(/^2 will be changed, 1 skipped \(already set\)\./)).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole("button", { name: "Change 2 fields" }));

        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
        expect(backend.calls).toEqual([
            { method: "PATCH", path: "/custom-fields/cf_1", body: { showInApps: true, editableByOwner: true } },
            { method: "PATCH", path: "/custom-fields/cf_3", body: { showInApps: true, editableByOwner: true } },
        ]);
        expect(toast.success).toHaveBeenCalledWith("2 changed", undefined);
    });

    it("turns a switch off where it is on, and skips an archived field", async () => {
        render(<CustomFieldsView defs={defs([contact, source, old])} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByRole("checkbox", { name: "Show 1 archived" }));
        fireEvent.click(screen.getByRole("checkbox", { name: "Select all rows" }));
        fireEvent.click(screen.getByTestId("bulk-switches"));
        const dialog = await screen.findByRole("alertdialog");
        await pick(within(dialog).getByTestId("cf-bulk-showOnDesk"), "Off");
        expect(within(dialog).getByText(/^1 will be changed, 1 skipped \(already set\), 1 skipped \(archived\)\./)).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole("button", { name: "Change 1 field" }));
        await waitFor(() => expect(backend.calls).toEqual([{ method: "PATCH", path: "/custom-fields/cf_1", body: { showOnDesk: false } }]));
    });

    it("builds the patch from the switches that move, or none", () => {
        expect(switchPatch(contact, LEAVE_ALL)).toBeNull();
        expect(switchPatch(contact, { ...LEAVE_ALL, showOnDesk: "on" })).toBeNull();
        expect(switchPatch(contact, { ...LEAVE_ALL, showOnDesk: "off", showOnWebsite: "on" })).toEqual({ showOnDesk: false, showOnWebsite: true });
    });
});

describe("archive and restore", () => {
    it("archives the live fields one by one and skips the archived", async () => {
        render(<CustomFieldsView defs={defs([contact, facing, old])} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByRole("checkbox", { name: "Show 1 archived" }));
        fireEvent.click(screen.getByRole("checkbox", { name: "Select all rows" }));
        fireEvent.click(screen.getByTestId("bulk-archive"));
        const dialog = await screen.findByRole("alertdialog");
        expect(within(dialog).getByText(/^2 will be archived, 1 skipped \(already archived\)\./)).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole("button", { name: "Archive 2 fields" }));
        await waitFor(() => expect(backend.calls.map((call) => `${call.method} ${call.path}`)).toEqual(["POST /custom-fields/cf_1/archive", "POST /custom-fields/cf_2/archive"]));
    });
});

describe("permissions", () => {
    it("shuts every action without settings.edit, naming it", () => {
        perms.held = new Set(["settings.view"]);
        render(<CustomFieldsView defs={defs([contact])} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByRole("checkbox", { name: "Select all rows" }));
        expect(screen.getByTestId("bulk-archive")).toHaveAttribute("title", FIELD_BULK_BLOCKED.archive);
        expect(screen.getByTestId("bulk-restore")).toHaveAttribute("title", FIELD_BULK_BLOCKED.restore);
        expect(screen.getByTestId("bulk-switches")).toBeDisabled();
        expect(screen.getByTestId("bulk-switches")).toHaveAttribute("title", FIELD_BULK_BLOCKED.switches);
    });
});
