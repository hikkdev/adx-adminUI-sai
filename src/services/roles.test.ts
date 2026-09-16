import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lot A — console roles over `/roles-config`.
 *
 * The DR 10 frame draws the builder; what this file pins is the matrix
 * arithmetic and the wire, the two things the screen gets wrong if nobody
 * is watching:
 *
 * 1. The tiers nest. `requirePermission` checks exactly the id it is given,
 *    so a role holding `approve` without `view` is a misconfiguration; the
 *    console writes every tier up to the one picked and clears them all on
 *    None, leaving the named capabilities alone either way.
 *
 * 2. The bodies are the schemas'. A create sends `permissions` even when
 *    empty; a delete goes to the row's own route and the 409 comes back
 *    with the API's sentence, not one invented here.
 */

const { backend } = vi.hoisted(() => {
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        answer: undefined as unknown,
        fail: null as null | { status: number; code: string; message: string },
        reset() {
            this.calls = [];
            this.answer = undefined;
            this.fail = null;
        },
    };
    return { backend };
});

vi.mock("@/lib/api-config", () => ({
    apiConfig: { live: true, baseUrl: "http://test" },
    liveDomains: { roles: true, users: true, auth: true },
    isLive: () => true,
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        if (backend.fail) {
            const { status, code, message } = backend.fail;
            throw new actual.ApiError(status, code, message);
        }
        return backend.answer;
    };
    return {
        ...actual,
        api: {
            get: (path: string) => wrap("GET", path),
            post: (path: string, body?: unknown) => wrap("POST", path, body),
            patch: (path: string, body?: unknown) => wrap("PATCH", path, body),
            put: (path: string, body?: unknown) => wrap("PUT", path, body),
            delete: (path: string) => wrap("DELETE", path),
        },
    };
});

import { ApiError } from "@/lib/api-client";
import {
    capabilitiesOf,
    countHeld,
    rolesService,
    tierOf,
    tiersOf,
    toggled,
    withTier,
    type PermissionGroup,
} from "./roles";

beforeEach(() => backend.reset());

const finance: PermissionGroup = {
    id: "finance",
    label: "Finance",
    permissions: [
        { id: "finance.view", label: "View", kind: "view" },
        { id: "finance.edit", label: "Edit", kind: "edit" },
        { id: "finance.approve", label: "Approve", kind: "approve" },
    ],
};

const system: PermissionGroup = {
    id: "system",
    label: "System",
    permissions: [
        { id: "system.view", label: "View", kind: "view" },
        { id: "system.edit", label: "Edit", kind: "edit" },
        { id: "system.impersonate", label: "Read the platform as a party sees it", kind: "capability" },
        { id: "system.roles", label: "Manage roles and their members", kind: "capability" },
    ],
};

const dpo: PermissionGroup = {
    id: "dpo",
    label: "Data protection",
    permissions: [{ id: "dpo.erasure", label: "Erase a person", kind: "capability" }],
};

describe("the matrix", () => {
    it("knows which tiers a group has, in order, and which capabilities are named", () => {
        expect(tiersOf(finance)).toEqual(["view", "edit", "approve"]);
        expect(tiersOf(system)).toEqual(["view", "edit"]);
        expect(tiersOf(dpo)).toEqual([]);
        expect(capabilitiesOf(system).map((p) => p.id)).toEqual(["system.impersonate", "system.roles"]);
    });

    it("reads the highest tier held, so a hand-built approve-only role still says Approve", () => {
        expect(tierOf(finance, [])).toBe("none");
        expect(tierOf(finance, ["finance.view"])).toBe("view");
        expect(tierOf(finance, ["finance.view", "finance.edit"])).toBe("edit");
        expect(tierOf(finance, ["finance.approve"])).toBe("approve");
    });

    it("nests on write: Approve grants view and edit, None clears all three", () => {
        const approved = withTier(["kyc.view"], finance, "approve");
        expect(approved).toEqual(["kyc.view", "finance.view", "finance.edit", "finance.approve"]);

        const narrowed = withTier(approved, finance, "view");
        expect(narrowed).toEqual(["kyc.view", "finance.view"]);

        expect(withTier(approved, finance, "none")).toEqual(["kyc.view"]);
    });

    it("repairs a broken nesting when the tier is re-picked", () => {
        expect(withTier(["finance.approve"], finance, "approve")).toEqual([
            "finance.view",
            "finance.edit",
            "finance.approve",
        ]);
    });

    it("leaves a group's named capabilities alone when its tier changes", () => {
        const held = ["system.view", "system.impersonate"];
        expect(withTier(held, system, "none")).toEqual(["system.impersonate"]);
        expect(withTier(held, system, "edit")).toEqual(["system.impersonate", "system.view", "system.edit"]);
    });

    it("only grants tiers the group actually has", () => {
        /* `system` has no approve tier; asking for it grants what exists. */
        expect(withTier([], system, "approve")).toEqual(["system.view", "system.edit"]);
    });

    it("toggles a named capability without touching anything else", () => {
        expect(toggled(["finance.view"], "system.roles")).toEqual(["finance.view", "system.roles"]);
        expect(toggled(["finance.view", "system.roles"], "system.roles")).toEqual(["finance.view"]);
    });

    it("counts only ids the catalogue knows, for the 'n of total' on the list", () => {
        const catalogue = ["finance.view", "finance.edit", "system.roles"];
        expect(countHeld(["finance.view", "system.roles", "old.made-up"], catalogue)).toBe(2);
    });
});

describe("the wire", () => {
    it("reads the catalogue and the roles from their own routes", async () => {
        backend.answer = { groups: [], permissions: [] };
        await rolesService.capabilities();
        backend.answer = [];
        await rolesService.list();
        expect(backend.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
            "GET /roles-config/capabilities",
            "GET /roles-config",
        ]);
    });

    it("answers an empty list when the API sends nothing", async () => {
        backend.answer = undefined;
        expect(await rolesService.list()).toEqual([]);
    });

    it("creates with the exact body, permissions included even when empty", async () => {
        backend.answer = { id: "r1" };
        await rolesService.create({ name: "Campaign manager", permissions: [] });
        expect(backend.calls[0]).toEqual({
            method: "POST",
            path: "/roles-config",
            body: { name: "Campaign manager", permissions: [] },
        });
    });

    it("updates through PUT on the row and deletes on it too", async () => {
        backend.answer = { id: "r1" };
        await rolesService.update("r1", { permissions: ["finance.view"] });
        await rolesService.remove("r1");
        expect(backend.calls).toEqual([
            { method: "PUT", path: "/roles-config/r1", body: { permissions: ["finance.view"] } },
            { method: "DELETE", path: "/roles-config/r1", body: undefined },
        ]);
    });

    it("surfaces the API's own 409 when a role cannot be deleted", async () => {
        backend.fail = { status: 409, code: "ROLE_HAS_MEMBERS", message: "3 people still hold this role. Move them first." };
        await expect(rolesService.remove("r1")).rejects.toMatchObject({
            status: 409,
            code: "ROLE_HAS_MEMBERS",
            message: "3 people still hold this role. Move them first.",
        });
        backend.fail = { status: 409, code: "CONFLICT", message: "System roles cannot be deleted." };
        const caught = await rolesService.remove("r0").catch((error: unknown) => error);
        expect(caught).toBeInstanceOf(ApiError);
        expect((caught as ApiError).message).toBe("System roles cannot be deleted.");
    });
});
