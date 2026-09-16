import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-client";

/**
 * Lot A — the console's own identity domain over `/users`.
 *
 * The DR 10 frames draw the list and the detail page; what this file pins is
 * the shaping and the wire, the things the screens get wrong if nobody is
 * watching:
 *
 * 1. Three states from two columns. A closed account is kept rather than
 *    deleted (Q21) and needs its own word; "deactivated" is `isActive: false`
 *    on an account that is still open. Closed wins.
 *
 * 2. `closed`, `q` and `role` reach the API (E6 gave the list the last two);
 *    the status facet is folded into `closed`, and active versus deactivated
 *    — the split the server still does not make — is applied to what it
 *    answered.
 *
 * 3. A nullable name never renders blank. The local part of the email stands
 *    in, then the mobile.
 *
 * 4. The bodies are the schemas'. An invite without a role does not send
 *    `roleConfigId: undefined`; the role-config write sends `null` to remove;
 *    accept-invite's two calls differ by the code alone.
 */

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, isLive: () => true };
});

const { backend } = vi.hoisted(() => {
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown; anonymous?: boolean }[],
        answer: undefined as unknown,
        reset() {
            this.calls = [];
            this.answer = undefined;
        },
    };
    return { backend };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown, options?: { anonymous?: boolean }) => {
        backend.calls.push({ method, path, body, anonymous: options?.anonymous });
        return backend.answer;
    };
    return {
        ...actual,
        api: {
            get: (path: string, options?: { anonymous?: boolean }) => wrap("GET", path, undefined, options),
            /* K-B1: the envelope read — `data` plus what sits beside it; the fake answers the whole envelope. */
            getEnvelope: (path: string) => wrap("GET", path),
            post: (path: string, body?: unknown, options?: { anonymous?: boolean }) => wrap("POST", path, body, options),
            patch: (path: string, body?: unknown) => wrap("PATCH", path, body),
            put: (path: string, body?: unknown) => wrap("PUT", path, body),
            delete: (path: string, options?: { body?: unknown }) => wrap("DELETE", path, options?.body),
        },
    };
});

import {
    buildUsersQuery,
    closedFacetOf,
    contactTakenMessage,
    contactTakenOf,
    displayNameOf,
    filterUsers,
    shapeUserRow,
    userEditDiff,
    userStatusOf,
    usersService,
    type WireUserRow,
} from "./users";

beforeEach(() => backend.reset());

const wire = (over: Partial<WireUserRow> = {}): WireUserRow => ({
    id: "cld_user_1",
    mobile: "+919845012345",
    name: "Sanjay Sharma",
    email: "sanjay@sharmahoardings.in",
    language: "en",
    isActive: true,
    closedAt: null,
    lastLoginAt: "2026-09-11T06:12:00.000Z",
    createdAt: "2025-11-14T09:00:00.000Z",
    updatedAt: "2026-09-11T06:12:00.000Z",
    roles: ["PUBLISHER"],
    roleConfig: null,
    ...over,
});

describe("status", () => {
    it("reads active, deactivated and closed off the two columns, closed winning", () => {
        expect(userStatusOf(wire())).toBe("active");
        expect(userStatusOf(wire({ isActive: false }))).toBe("deactivated");
        expect(userStatusOf(wire({ closedAt: "2026-09-01T00:00:00.000Z" }))).toBe("closed");
        expect(userStatusOf(wire({ isActive: false, closedAt: "2026-09-01T00:00:00.000Z" }))).toBe("closed");
    });
});

describe("display name", () => {
    it("falls back from name to the email's local part to the mobile, never blank", () => {
        expect(displayNameOf({ name: "  Asha Rao ", email: "a@adx.co" })).toBe("Asha Rao");
        expect(displayNameOf({ name: null, email: "kabir.m@adx.co" })).toBe("kabir.m");
        expect(displayNameOf({ name: "  ", email: null, mobile: "+919800000000" })).toBe("+919800000000");
        expect(displayNameOf({ name: null, email: null })).toBe("ADX user");
    });

    it("shapes a row with both derived fields", () => {
        const row = shapeUserRow(wire({ name: null, isActive: false }));
        expect(row.displayName).toBe("sanjay");
        expect(row.status).toBe("deactivated");
    });
});

describe("the query", () => {
    it("sends only the facets that are set", () => {
        expect(buildUsersQuery()).toBe("");
        expect(buildUsersQuery({ closed: true })).toBe("closed=true");
        expect(buildUsersQuery({ closed: false })).toBe("closed=false");
    });

    it("E6: sends the search and the one role the API takes, and never a blank search", () => {
        expect(buildUsersQuery({ q: "  priya " })).toBe("q=priya");
        expect(buildUsersQuery({ q: "   " })).toBe("");
        expect(buildUsersQuery({ role: "ADMIN" })).toBe("role=ADMIN");
        expect(buildUsersQuery({ closed: false, q: "99000", role: "AGENT_PUBLISHER" })).toBe(
            "closed=false&q=99000&role=AGENT_PUBLISHER",
        );
    });

    it("folds the status facet into the one parameter the API takes", () => {
        expect(closedFacetOf([])).toBeUndefined();
        expect(closedFacetOf(["closed"])).toBe(true);
        expect(closedFacetOf(["active"])).toBe(false);
        expect(closedFacetOf(["active", "deactivated"])).toBe(false);
        expect(closedFacetOf(["active", "closed"])).toBeUndefined();
    });

    it("applies only the active/deactivated split to the answered list", () => {
        const rows = [
            shapeUserRow(wire()),
            shapeUserRow(wire({ id: "u2", name: "Priya Rao", email: "priya.rao@adx.co", roles: ["ADMIN"] })),
            shapeUserRow(wire({ id: "u3", name: null, email: null, mobile: "+919900011122", roles: ["AGENT_PUBLISHER"], isActive: false })),
        ];
        expect(filterUsers(rows, { status: ["deactivated"] }).map((r) => r.id)).toEqual(["u3"]);
        expect(filterUsers(rows, { status: ["active"] }).map((r) => r.id)).toEqual(["cld_user_1", "u2"]);
        expect(filterUsers(rows, {})).toHaveLength(3);
    });

    it("E6: the list call carries the facets on the wire", async () => {
        backend.answer = [wire()];
        await usersService.list({ q: "priya", role: "ADMIN", closed: false });
        expect(backend.calls).toEqual([{ method: "GET", path: "/users?closed=false&q=priya&role=ADMIN", body: undefined, anonymous: undefined }]);
    });
});

describe("the wire", () => {
    it("lists with the closed facet in the path and shapes every row", async () => {
        backend.answer = [wire(), wire({ id: "u2", closedAt: "2026-09-01T00:00:00.000Z" })];
        const rows = await usersService.list({ closed: true });
        expect(backend.calls[0].path).toBe("/users?closed=true");
        expect(rows.map((r) => r.status)).toEqual(["active", "closed"]);

        backend.answer = undefined;
        expect(await usersService.list()).toEqual([]);
        expect(backend.calls[1].path).toBe("/users");
    });

    it("assigns a console role with PUT, and null to remove it", async () => {
        backend.answer = { userId: "u1", roleConfig: null };
        await usersService.setRoleConfig("u1", "r1");
        await usersService.setRoleConfig("u1", null);
        expect(backend.calls).toEqual([
            { method: "PUT", path: "/users/u1/role-config", body: { roleConfigId: "r1" }, anonymous: undefined },
            { method: "PUT", path: "/users/u1/role-config", body: { roleConfigId: null }, anonymous: undefined },
        ]);
    });

    it("grants a seeded role through POST /users/roles with the user in the body", async () => {
        backend.answer = { message: "Role AGENT_PUBLISHER assigned" };
        await usersService.grantRole("u1", "AGENT_PUBLISHER");
        expect(backend.calls[0]).toMatchObject({ method: "POST", path: "/users/roles", body: { userId: "u1", role: "AGENT_PUBLISHER" } });
    });

    it("resets the second factor on the person's own route", async () => {
        backend.answer = { message: "Email backup restored" };
        await usersService.resetTwoFactor("u1");
        expect(backend.calls[0]).toMatchObject({ method: "POST", path: "/users/u1/2fa/reset" });
    });

    it("invites without sending an undefined role, and works the invite's own routes", async () => {
        backend.answer = { id: "inv_1", email: "x@adx.co" };
        await usersService.invite({ email: "x@adx.co", method: "PASSWORD" });
        await usersService.invite({ email: "y@adx.co", method: "GOOGLE", roleConfigId: "r1" });
        await usersService.resendInvite("inv_1");
        await usersService.revokeInvite("inv_1");

        expect(backend.calls[0].body).toEqual({ email: "x@adx.co", method: "PASSWORD" });
        expect(Object.keys(backend.calls[0].body as object)).not.toContain("roleConfigId");
        expect(backend.calls[1].body).toEqual({ email: "y@adx.co", method: "GOOGLE", roleConfigId: "r1" });
        expect(backend.calls.slice(2).map((c) => `${c.method} ${c.path}`)).toEqual([
            "POST /users/invites/inv_1/resend",
            "DELETE /users/invites/inv_1",
        ]);
    });

    it("reads and accepts an invitation anonymously, the token URL-encoded", async () => {
        backend.answer = { email: "x@adx.co", method: "PASSWORD", expiresAt: null, valid: true };
        await usersService.describeInvite("ab/cd+ef");
        expect(backend.calls[0]).toEqual({
            method: "GET",
            path: "/auth/invites/ab%2Fcd%2Bef",
            body: undefined,
            anonymous: true,
        });

        backend.answer = { stage: "OTP_SENT", mobile: "+919845012345", expiresInSeconds: 300, resendAfterSeconds: 60, sendsRemaining: 2 };
        await usersService.acceptInvite({ token: "t", name: "Asha", mobile: "+919845012345" });
        backend.answer = { stage: "ACCEPTED", user: { id: "u9", email: "x@adx.co", mobile: "+919845012345", name: "Asha" }, roles: ["ADMIN"] };
        await usersService.acceptInvite({ token: "t", name: "Asha", mobile: "+919845012345", otpCode: "123456", password: "hunter22" });

        expect(backend.calls[1]).toMatchObject({
            method: "POST",
            path: "/auth/accept-invite",
            body: { token: "t", name: "Asha", mobile: "+919845012345" },
            anonymous: true,
        });
        expect(backend.calls[2].body).toEqual({
            token: "t",
            name: "Asha",
            mobile: "+919845012345",
            otpCode: "123456",
            password: "hunter22",
        });
    });

    it("keeps the operator's own record on the /me routes", async () => {
        backend.answer = [];
        await usersService.me();
        await usersService.mySessions();
        await usersService.revokeMySession("s1");
        await usersService.changeMyPassword({ currentPassword: "old", newPassword: "hunter22" });
        expect(backend.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
            "GET /users/me",
            "GET /users/me/sessions",
            "DELETE /users/me/sessions/s1",
            "POST /auth/change-password",
        ]);
    });
});

/* ================================================================== */
/* K-B1 — the manageable user system                                   */
/* ================================================================== */

describe("K-B1: the directory", () => {
    it("sends the state and the sort as the schema takes them", () => {
        expect(buildUsersQuery({ state: "INACTIVE", sort: "lastLogin", q: "office@" })).toBe("q=office%40&state=INACTIVE&sort=lastLogin");
    });

    it("reads the counts and the total beside the rows, and shapes every row", async () => {
        backend.answer = { data: [wire(), wire({ id: "u2", isActive: false })], counts: { ACTIVE: 4, INACTIVE: 1 }, total: 2 };
        const directory = await usersService.directory({ state: "ACTIVE" });
        expect(backend.calls[0].path).toBe("/users?state=ACTIVE");
        expect(directory.rows.map((row) => row.status)).toEqual(["active", "deactivated"]);
        expect(directory.counts).toEqual({ ACTIVE: 4, INACTIVE: 1, CLOSED: 0 });
        expect(directory.total).toBe(2);
    });

    it("creates through POST /users with the body as given", async () => {
        backend.answer = { id: "u_new", mobile: "+919900000001", name: null, roles: ["PUBLISHER"] };
        await usersService.create({ mobile: "+919900000001", roles: ["PUBLISHER"] });
        expect(backend.calls[0]).toMatchObject({ method: "POST", path: "/users", body: { mobile: "+919900000001", roles: ["PUBLISHER"] } });
    });
});

describe("K-B1: the editor's diff", () => {
    const row = { id: "u1", name: "Sanjay Sharma", email: "sanjay@x.in", mobile: "+919845012345", language: "en", avatarUrl: null };

    it("sends nothing for an unchanged form and never asks for a reason", () => {
        const { body, movesIdentity } = userEditDiff(row, { name: "Sanjay Sharma", email: "sanjay@x.in", mobile: "+919845012345", language: "en", avatarUrl: "" });
        expect(body).toEqual({});
        expect(movesIdentity).toBe(false);
    });

    it("sends only what changed, lower-cases the email, and flags an identity move", () => {
        const { body, movesIdentity } = userEditDiff(row, { name: "Sanjay Sharma", email: "Sanjay@New.in", mobile: "+919845012345", language: "kn", avatarUrl: "" });
        expect(body).toEqual({ email: "sanjay@new.in", language: "kn" });
        expect(movesIdentity).toBe(true);
    });

    it("clears the avatar with null only when the row had one", () => {
        expect(userEditDiff(row, { name: "Sanjay Sharma", email: "sanjay@x.in", mobile: "+919845012345", language: "en", avatarUrl: "" }).body).toEqual({});
        expect(
            userEditDiff({ ...row, avatarUrl: "https://a/b.png" }, { name: "Sanjay Sharma", email: "sanjay@x.in", mobile: "+919845012345", language: "en", avatarUrl: "" }).body,
        ).toEqual({ avatarUrl: null });
    });

    it("prints a 409 CONTACT_TAKEN as whose the value is, and nothing for any other error", () => {
        const taken = contactTakenOf(new ApiError(409, "CONTACT_TAKEN", "Taken.", { which: "PRIMARY", userId: "u9", kind: "EMAIL", value: "a@b.in" }));
        expect(taken && contactTakenMessage(taken)).toBe("a@b.in is already on account u9 as their sign-in email.");
        expect(contactTakenOf(new ApiError(409, "CONFLICT", "No."))).toBeNull();
    });
});

describe("K-B1: contacts", () => {
    it("works the desk's routes with the bodies the schemas take", async () => {
        backend.answer = { id: "c1" };
        await usersService.contactsOf("u1");
        await usersService.addContact("u1", { kind: "PHONE", value: " +919900000002 ", label: " ", reason: " Owner asked on the call. " });
        await usersService.sendContactCode("u1", "c1");
        await usersService.verifyContact("u1", "c1", " 123456 ");
        await usersService.markContactVerified("u1", "c1", "Read back on the call.");
        await usersService.makeContactPrimary("u1", "c1", "Old SIM lost.");
        await usersService.updateContactLabel("u1", "c1", "");
        await usersService.removeContact("u1", "c1", "Wrong number.");
        expect(backend.calls.map((call) => [`${call.method} ${call.path}`, call.body])).toEqual([
            ["GET /users/u1/contacts", undefined],
            ["POST /users/u1/contacts", { kind: "PHONE", value: "+919900000002", reason: "Owner asked on the call." }],
            ["POST /users/u1/contacts/c1/send-code", undefined],
            ["POST /users/u1/contacts/c1/verify", { code: "123456" }],
            ["POST /users/u1/contacts/c1/mark-verified", { reason: "Read back on the call." }],
            ["POST /users/u1/contacts/c1/make-primary", { reason: "Old SIM lost." }],
            ["PATCH /users/u1/contacts/c1", { label: null }],
            ["DELETE /users/u1/contacts/c1", { reason: "Wrong number." }],
        ]);
    });
});
