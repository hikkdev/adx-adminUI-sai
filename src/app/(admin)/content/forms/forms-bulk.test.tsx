import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Forms › bulk (28 Sep 2026): a selection archives (content.delete) or
 * restores (content.edit) through the single-form routes, the forms already
 * in that state skipped and counted up front.
 */

const { backend, perms, toast } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string }[],
        async handle(method: string, path: string) {
            this.calls.push({ method, path });
            return {};
        },
    },
    perms: { held: new Set<string>() },
    toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = (method: string) => (path: string) => backend.handle(method, path);
    return { ...actual, api: { get: wrap("GET"), post: wrap("POST"), patch: wrap("PATCH"), put: wrap("PUT"), delete: wrap("DELETE") } };
});
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ can: (id: string) => perms.held.has(id), user: null }) }));

import type { FormRow } from "@/services/forms";
import { FORM_BULK_BLOCKED, FormsView } from "./forms-view";

const form = (over: Partial<FormRow>): FormRow => ({
    id: "frm_1",
    key: "event-signup",
    title: "Event sign-up",
    destination: "INBOX",
    leadSide: null,
    audience: "PUBLIC",
    archivedAt: null,
    updatedAt: "2026-09-27T00:00:00.000Z",
    live: { number: 1, publishedAt: "2026-09-27T00:00:00.000Z" },
    draft: null,
    submissionsNew: 0,
    ...over,
});

beforeEach(() => {
    backend.calls = [];
    perms.held = new Set(["content.view", "content.edit", "content.delete"]);
    for (const fn of Object.values(toast)) fn.mockReset();
});

describe("forms in bulk", () => {
    it("archives the live forms and skips the archived one", async () => {
        const onChanged = vi.fn();
        render(<FormsView forms={[form({}), form({ id: "frm_2", key: "quote", title: "Quote" }), form({ id: "frm_3", key: "old", title: "Old", archivedAt: "2026-09-01T00:00:00.000Z" })]} onChanged={onChanged} />);
        fireEvent.click(screen.getByRole("checkbox", { name: "Show 1 archived" }));
        fireEvent.click(screen.getByRole("checkbox", { name: "Select all rows" }));
        fireEvent.click(screen.getByTestId("bulk-archive"));
        const dialog = await screen.findByRole("alertdialog");
        expect(within(dialog).getByText(/^2 will be archived, 1 skipped \(already archived\)\./)).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole("button", { name: "Archive 2 forms" }));
        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
        expect(backend.calls).toEqual([
            { method: "POST", path: "/forms/event-signup/archive" },
            { method: "POST", path: "/forms/quote/archive" },
        ]);
    });

    it("shuts archive without content.delete, naming it", () => {
        perms.held = new Set(["content.view", "content.edit"]);
        render(<FormsView forms={[form({})]} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByRole("checkbox", { name: "Select all rows" }));
        expect(screen.getByTestId("bulk-archive")).toBeDisabled();
        expect(screen.getByTestId("bulk-archive")).toHaveAttribute("title", FORM_BULK_BLOCKED.archive);
        expect(screen.getByTestId("bulk-restore")).toBeEnabled();
    });
});
