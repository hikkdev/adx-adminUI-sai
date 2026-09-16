import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Lot K2 — the Admin users tab.
 *
 * What this pins: the tab never asks `GET /users` for anybody but the
 * console's operators (`role=ADMIN` on every read, the state facet beside
 * it), the Change role dialog draws the system role disabled for an
 * operator who does not hold it and live for one who does, the PUT carries
 * the picked id, and the Reset 2FA confirm names exactly what the reset
 * clears.
 */

const { backend, toast, session } = vi.hoisted(() => {
    const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        reset() {
            this.calls = [];
        },
    };
    const session = { user: { id: "u_me", name: "Me", email: "me@adx.in", roles: ["ADMIN"] } as { id: string } | null };
    return { backend, toast, session };
});

vi.mock("sonner", () => ({ toast }));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
    usePathname: () => "/users/admins",
    useSearchParams: () => new URLSearchParams("state=INACTIVE"),
}));

vi.mock("@/lib/auth", () => ({
    useAuth: () => ({ user: session.user, loading: false, can: () => true }),
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const rows = [
        {
            id: "u_me",
            mobile: "+919900000001",
            name: "Me",
            email: "me@adx.in",
            language: null,
            isActive: true,
            closedAt: null,
            lastLoginAt: "2026-09-14T08:00:00.000Z",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            roles: ["ADMIN"],
            roleConfig: null,
            twoFactor: { required: true, method: "AUTHENTICATOR", enrolledAt: "2026-09-01T00:00:00.000Z", recoveryCodesLeft: 7 },
        },
        {
            id: "u_ops",
            mobile: "+919900000002",
            name: "Ops Person",
            email: "ops@adx.in",
            language: null,
            isActive: false,
            closedAt: null,
            lastLoginAt: null,
            createdAt: "2026-02-01T00:00:00.000Z",
            updatedAt: "2026-02-01T00:00:00.000Z",
            roles: ["ADMIN"],
            roleConfig: { id: "r_ops", name: "Ops" },
            twoFactor: { required: true, method: "SMS", enrolledAt: null, recoveryCodesLeft: 0 },
        },
    ];
    const wrap = async (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        if (method === "GET" && path === "/users/me") return { id: "u_me", roleConfig: null, isSuperAdmin: true, roles: ["ADMIN"] };
        if (method === "GET" && path === "/roles-config") return [];
        if (method === "PUT") return { userId: "u_ops", roleConfig: { id: "r_sys", name: "Super admin" } };
        return { message: "ok" };
    };
    return {
        ...actual,
        api: {
            get: (path: string) => wrap("GET", path),
            getEnvelope: async (path: string) => {
                backend.calls.push({ method: "GET", path });
                return { data: rows, counts: { ACTIVE: 1, INACTIVE: 1, CLOSED: 0 }, total: 2 };
            },
            post: (path: string, body?: unknown) => wrap("POST", path, body),
            patch: (path: string, body?: unknown) => wrap("PATCH", path, body),
            put: (path: string, body?: unknown) => wrap("PUT", path, body),
            delete: (path: string) => wrap("DELETE", path),
        },
    };
});

import type { RoleConfig } from "@/services/roles";
import { twoFactorResetClears } from "@/services/users";
import { AdminsLoader, adminsQueryOf } from "./admins-loader";
import { ChangeRoleDialog, operatorIsSuperAdmin, roleChoices } from "./change-role-dialog";

const role = (over: Partial<RoleConfig>): RoleConfig => ({
    id: "r",
    name: "Role",
    description: null,
    permissions: [],
    isSystem: false,
    memberCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
});

const roles = [role({ id: "r_sys", name: "Super admin", isSystem: true }), role({ id: "r_ops", name: "Ops", description: "The desk" })];

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
});

describe("the facet path", () => {
    it("asks for ADMIN whatever the facets, and carries the state, the sort and the search beside it", () => {
        expect(adminsQueryOf({ state: null, sort: "newest" }, "")).toEqual({ role: "ADMIN" });
        expect(adminsQueryOf({ state: "INACTIVE", sort: "name" }, "pri")).toEqual({ role: "ADMIN", state: "INACTIVE", sort: "name", q: "pri" });
    });

    it("reads GET /users?role=ADMIN under the URL's state facet and draws the 2FA column off twoFactor", async () => {
        render(<AdminsLoader />);

        await waitFor(() => expect(backend.calls.some((call) => call.path === "/users?role=ADMIN&state=INACTIVE")).toBe(true));
        expect(backend.calls.filter((call) => call.path.startsWith("/users?")).every((call) => call.path.includes("role=ADMIN"))).toBe(true);
        /* M-C: one GET /users/me decides whether the system role can be granted — never a GET /users/:id on the session user. */
        expect(backend.calls.filter((call) => call.method === "GET" && call.path === "/users/me")).toHaveLength(1);
        expect(backend.calls.some((call) => call.method === "GET" && call.path === "/users/u_me")).toBe(false);

        expect(await screen.findByText("Ops Person")).toBeInTheDocument();
        expect(screen.getByText("Authenticator")).toBeInTheDocument();
        expect(screen.getByText("7 codes left")).toBeInTheDocument();
        expect(screen.getByText("SMS")).toBeInTheDocument();
        expect(screen.getByText("Never signed in")).toBeInTheDocument();
    });
});

describe("who may grant the system role", () => {
    it("is a member of the system role, or an admin with no role under the launch rule", () => {
        expect(operatorIsSuperAdmin(null, roles)).toBe(true);
        expect(operatorIsSuperAdmin({ id: "r_sys" }, roles)).toBe(true);
        expect(operatorIsSuperAdmin({ id: "r_ops" }, roles)).toBe(false);
        expect(operatorIsSuperAdmin({ id: "r_unknown" }, roles)).toBe(false);
    });

    it("draws the system role disabled for a non-holder and keeps an unknown current role selectable", () => {
        const choices = roleChoices(roles, { id: "r_old", name: "Retired" }, false);
        expect(choices.map((choice) => [choice.value, choice.disabled])).toEqual([
            ["__none__", false],
            ["r_sys", true],
            ["r_ops", false],
            ["r_old", false],
        ]);
        expect(roleChoices(roles, null, true).find((choice) => choice.value === "r_sys")?.disabled).toBe(false);
    });
});

describe("ChangeRoleDialog", () => {
    const user = { id: "u_ops", displayName: "Ops Person", roleConfig: { id: "r_ops", name: "Ops" } };

    it("disables the system option for an operator who does not hold it", () => {
        render(<ChangeRoleDialog user={user} roles={roles} operatorIsSuperAdmin={false} onOpenChange={() => {}} onChanged={() => {}} />);
        expect(screen.getByRole("radio", { name: "Super admin" })).toBeDisabled();
        expect(screen.getByRole("radio", { name: "Ops" })).not.toBeDisabled();
        expect(screen.getByText(/only a super admin can grant/i)).toBeInTheDocument();
    });

    it("lets a super admin pick it and PUTs the id", async () => {
        const onChanged = vi.fn();
        render(<ChangeRoleDialog user={user} roles={roles} operatorIsSuperAdmin onOpenChange={() => {}} onChanged={onChanged} />);
        const system = screen.getByRole("radio", { name: "Super admin" });
        expect(system).not.toBeDisabled();
        /* Nothing moved yet: the save is off. */
        expect(screen.getByRole("button", { name: /change role/i })).toBeDisabled();

        fireEvent.click(system);
        fireEvent.click(screen.getByRole("button", { name: /change role/i }));

        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.calls).toEqual([{ method: "PUT", path: "/users/u_ops/role-config", body: { roleConfigId: "r_sys" } }]);
        expect(toast.success).toHaveBeenCalledWith("Ops Person now holds Super admin");
    });
});

describe("what Reset 2FA says it clears", () => {
    it("names the email backup alone for an SMS admin, and the app and its codes for an enrolled one", () => {
        expect(twoFactorResetClears({ required: true, method: "SMS", enrolledAt: null, recoveryCodesLeft: 0 })).toEqual([
            "the email backup count for the last thirty days",
        ]);
        expect(twoFactorResetClears({ required: true, method: "AUTHENTICATOR", enrolledAt: "2026-09-01T00:00:00.000Z", recoveryCodesLeft: 1 })).toEqual([
            "the email backup count for the last thirty days",
            "the authenticator app enrolled on 1 Sept 2026",
            "the 1 unused recovery code",
        ]);
        expect(twoFactorResetClears(undefined)).toEqual(["the email backup count for the last thirty days"]);
    });
});
