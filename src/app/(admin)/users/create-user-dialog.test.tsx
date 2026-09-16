import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * K-B1 — creating a person from the desk: the body is `createUserSchema`'s
 * (mobile, the optional name and email, the roles), an empty email is not
 * sent, a role is required, and a taken mobile is printed as whose it is.
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
        return { id: "u_new", mobile: "+919900000001", name: "Priya", roles: ["AGENT_PUBLISHER"] };
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

import { CreateUserDialog } from "./create-user-dialog";

const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
});

describe("CreateUserDialog", () => {
    it("posts the schema's body — no empty email, the roles ticked — and tells the parent", async () => {
        const onCreated = vi.fn();
        render(<CreateUserDialog open onOpenChange={() => {}} roles={[]} onCreated={onCreated} />);

        type(/^name$/i, "Priya");
        type(/^mobile$/i, "+919900000001");
        fireEvent.click(screen.getByRole("checkbox", { name: /publisher agent/i }));
        fireEvent.click(screen.getByRole("button", { name: /create user/i }));

        await waitFor(() => expect(onCreated).toHaveBeenCalled());
        expect(backend.calls).toEqual([{ method: "POST", path: "/users", body: { mobile: "+919900000001", name: "Priya", roles: ["AGENT_PUBLISHER"] } }]);
        expect(toast.success).toHaveBeenCalledWith("Priya created", expect.anything());
    });

    it("refuses without a mobile or without a role, and never calls the API", () => {
        render(<CreateUserDialog open onOpenChange={() => {}} roles={[]} onCreated={() => {}} />);

        fireEvent.click(screen.getByRole("button", { name: /create user/i }));
        expect(screen.getByRole("alert")).toHaveTextContent(/mobile number/i);

        type(/^mobile$/i, "+919900000001");
        fireEvent.click(screen.getByRole("button", { name: /create user/i }));
        expect(screen.getByRole("alert")).toHaveTextContent(/at least one role/i);
        expect(backend.calls).toEqual([]);
    });

    it("prints a taken mobile as whose it is", async () => {
        backend.fails = {
            status: 409,
            code: "CONTACT_TAKEN",
            message: "Taken.",
            details: { which: "PRIMARY", userId: "u_other", kind: "PHONE", value: "+919900000001" },
        };
        render(<CreateUserDialog open onOpenChange={() => {}} roles={[]} onCreated={() => {}} />);

        type(/^mobile$/i, "+919900000001");
        fireEvent.click(screen.getByRole("checkbox", { name: /^publisher$/i }));
        fireEvent.click(screen.getByRole("button", { name: /create user/i }));

        await waitFor(() =>
            expect(screen.getByRole("alert")).toHaveTextContent("+919900000001 is already on account u_other as their sign-in mobile."),
        );
    });
});
