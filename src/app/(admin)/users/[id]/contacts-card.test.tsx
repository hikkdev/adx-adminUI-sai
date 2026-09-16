import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * K-B1 — the contacts card on a person's page.
 *
 * Pinned: the primary pair is marked, every row's state is drawn, and the
 * three moves the desk makes most go to their own routes with the bodies
 * the schemas take — add (kind, value, label, reason), verify (the code the
 * person read back), make-primary (the reason; the confirm says that a
 * phone swap ends the sessions on the old number).
 */

const { backend, toast } = vi.hoisted(() => {
    const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        reset() {
            this.calls = [];
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
        if (path.endsWith("/make-primary")) {
            return { kind: "PHONE", before: "+919845012345", after: "+919900000002", wasVerified: false, primary: { mobile: "+919900000002", email: "s@x.in" }, sessionsRevoked: true };
        }
        return { id: "c_new", kind: "EMAIL", value: "office@x.in", label: null, verifiedAt: null, addedBy: { id: "adm", name: "Ops" }, createdAt: "2026-09-14T00:00:00.000Z" };
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

import { ContactsCard } from "./contacts-card";
import type { WireContacts } from "@/services/users";

const contacts: WireContacts = {
    primary: { mobile: "+919845012345", mobileVerifiedAt: "2026-01-01T00:00:00.000Z", email: "s@x.in", emailVerified: false },
    contacts: [
        {
            id: "c1",
            kind: "PHONE",
            value: "+919900000002",
            label: "Office",
            verifiedAt: null,
            addedBy: { id: "adm", name: "Ops desk" },
            createdAt: "2026-09-10T00:00:00.000Z",
        },
    ],
};

const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const openMenu = () => fireEvent.keyDown(screen.getByRole("button", { name: /^actions$/i }), { key: "ArrowDown" });
const pick = async (name: RegExp) => {
    const item = await screen.findByRole("menuitem", { name });
    fireEvent.keyDown(item, { key: "Enter" });
};

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
});

describe("ContactsCard", () => {
    it("marks the primary pair and draws every row's state", () => {
        render(<ContactsCard userId="u1" name="Sanjay" contacts={contacts} closed={false} onChanged={() => {}} />);
        expect(screen.getAllByText("PRIMARY")).toHaveLength(2);
        expect(screen.getByText("+919900000002")).toBeInTheDocument();
        expect(screen.getByText("Office")).toBeInTheDocument();
        expect(screen.getByText("Unverified")).toBeInTheDocument();
        expect(screen.getByText(/added .* by Ops desk/)).toBeInTheDocument();
    });

    it("adds a contact with kind, value, label and reason", async () => {
        const onChanged = vi.fn();
        render(<ContactsCard userId="u1" name="Sanjay" contacts={contacts} closed={false} onChanged={onChanged} />);

        fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
        fireEvent.click(await screen.findByRole("radio", { name: /email/i }));
        type(/email address/i, "Office@X.in");
        type(/label/i, "Accounts");
        type(/^reason$/i, "Owner asked on ticket 42 for the accounts address.");
        fireEvent.click(screen.getByRole("button", { name: /add contact/i }));

        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.calls).toEqual([
            {
                method: "POST",
                path: "/users/u1/contacts",
                body: { kind: "EMAIL", value: "Office@X.in", label: "Accounts", reason: "Owner asked on ticket 42 for the accounts address." },
            },
        ]);
    });

    it("verifies with the code the person read back", async () => {
        const onChanged = vi.fn();
        render(<ContactsCard userId="u1" name="Sanjay" contacts={contacts} closed={false} onChanged={onChanged} />);

        openMenu();
        await pick(/verify with a code/i);
        type(/^code$/i, " 482913 ");
        fireEvent.click(screen.getByRole("button", { name: /^verify$/i }));

        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.calls).toEqual([{ method: "POST", path: "/users/u1/contacts/c1/verify", body: { code: "482913" } }]);
    });

    it("makes a phone primary with a reason, naming the swap and the sessions that end", async () => {
        const onChanged = vi.fn();
        render(<ContactsCard userId="u1" name="Sanjay" contacts={contacts} closed={false} onChanged={onChanged} />);

        openMenu();
        await pick(/make primary/i);
        expect(screen.getByText(/signs in with \+919900000002 from now on/i)).toBeInTheDocument();
        expect(screen.getByText(/every session on the old number ends/i)).toBeInTheDocument();
        expect(screen.getByText(/this contact is unverified/i)).toBeInTheDocument();

        type(/^reason$/i, "Owner lost the old SIM; confirmed on the support call.");
        fireEvent.click(screen.getByRole("button", { name: /make primary/i }));

        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.calls).toEqual([
            { method: "POST", path: "/users/u1/contacts/c1/make-primary", body: { reason: "Owner lost the old SIM; confirmed on the support call." } },
        ]);
        expect(toast.success).toHaveBeenCalledWith("Sign-in moved to +919900000002 — every session ended");
    });

    it("offers nothing on a closed account", () => {
        render(<ContactsCard userId="u1" name="Sanjay" contacts={contacts} closed onChanged={() => {}} />);
        expect(screen.queryByRole("button", { name: /^add$/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /^actions$/i })).not.toBeInTheDocument();
    });
});
