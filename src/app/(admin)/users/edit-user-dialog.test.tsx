import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * K-B1 — editing a person from the desk.
 *
 * What is pinned is the wire: the body is the diff alone, a form saved
 * unchanged sends nothing, moving the email or the mobile carries the
 * reason, and a 409 CONTACT_TAKEN is printed as whose the value already is
 * rather than as the server's one-line message.
 */

const { backend, toast } = vi.hoisted(() => {
    const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        fails: null as null | { status: number; code: string; message: string; details?: unknown },
        reset() {
            this.calls = [];
            this.fails = null;
        },
    };
    return { backend, toast };
});

vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        if (backend.fails) {
            const { status, code, message, details } = backend.fails;
            throw new actual.ApiError(status, code, message, details);
        }
        return { id: "u1", mobile: "+919845012345", name: "Sanjay", email: "s@x.in", isActive: true, roles: ["PUBLISHER"] };
    };
    return {
        ...actual,
        api: {
            get: (path: string) => wrap("GET", path),
            post: (path: string, body?: unknown) => wrap("POST", path, body),
            patch: (path: string, body?: unknown) => wrap("PATCH", path, body),
            put: (path: string, body?: unknown) => wrap("PUT", path, body),
            delete: (path: string, options?: { body?: unknown }) => wrap("DELETE", path, options?.body),
        },
    };
});

import { EditUserDialog } from "./edit-user-dialog";

const user = {
    id: "u1",
    name: "Sanjay Sharma",
    email: "sanjay@sharmahoardings.in",
    mobile: "+919845012345",
    language: "en",
    avatarUrl: null,
    roles: ["PUBLISHER"] as const,
};

const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
    toast.error.mockReset();
});

describe("EditUserDialog", () => {
    it("sends only the fields that changed, and never a reason for a profile edit", async () => {
        const onSaved = vi.fn();
        render(<EditUserDialog user={user} open onOpenChange={() => {}} onSaved={onSaved} />);

        type(/^name$/i, "Sanjay S. Sharma");
        type(/^language$/i, "kn");
        fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(backend.calls).toEqual([{ method: "PATCH", path: "/users/u1", body: { name: "Sanjay S. Sharma", language: "kn" } }]);
    });

    it("refuses to send an unchanged form", () => {
        render(<EditUserDialog user={user} open onOpenChange={() => {}} onSaved={() => {}} />);
        const button = screen.getByRole("button", { name: /nothing changed/i });
        expect(button).toBeDisabled();
        expect(backend.calls).toEqual([]);
    });

    it("demands a reason when the email moves, and sends it with the diff", async () => {
        const onSaved = vi.fn();
        render(<EditUserDialog user={user} open onOpenChange={() => {}} onSaved={onSaved} />);

        type(/^email$/i, "Sanjay@NewDomain.in");
        expect(screen.getByText(/the email moves from sanjay@sharmahoardings.in to sanjay@newdomain.in/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /save changes/i })).toBeDisabled();

        type(/^reason$/i, "Owner asked by phone; identity confirmed against KYC.");
        fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(backend.calls).toEqual([
            {
                method: "PATCH",
                path: "/users/u1",
                body: { email: "sanjay@newdomain.in", reason: "Owner asked by phone; identity confirmed against KYC." },
            },
        ]);
    });

    it("prints a 409 CONTACT_TAKEN as whose the value already is", async () => {
        backend.fails = {
            status: 409,
            code: "CONTACT_TAKEN",
            message: "This value belongs to another account.",
            details: { which: "CONTACT", userId: "u_other", contactId: "c9", kind: "PHONE", value: "+919900000000" },
        };
        render(<EditUserDialog user={user} open onOpenChange={() => {}} onSaved={() => {}} />);

        type(/^mobile$/i, "+919900000000");
        type(/^reason$/i, "Owner replaced the SIM and asked for the move.");
        fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("+919900000000 is already on account u_other as a contact."));
        expect(backend.calls[0].body).toEqual({ mobile: "+919900000000", reason: "Owner replaced the SIM and asked for the move." });
    });

    it("locks the mobile on an admin — the server refuses that move from the desk", () => {
        render(<EditUserDialog user={{ ...user, roles: ["ADMIN"] }} open onOpenChange={() => {}} onSaved={() => {}} />);
        expect(screen.getByLabelText(/^mobile$/i)).toBeDisabled();
    });
});
