import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * RP-1 — only Super admin holds every permission; anyone else needs a role.
 *
 * What is pinned: the console reads "no role" off the token's `perms` claim
 * (the same claim every admin route judges), never off a role name; a party
 * account is not "role-less", it is simply not an admin; against fixtures the
 * question never arises; and the card a role-less admin lands on names the
 * account and offers the one way out.
 */
vi.mock("@/lib/api-config", () => ({
    apiConfig: { live: true, baseUrl: "http://api.test" },
    isLive: () => true,
}));

import { NoRoleYet } from "@/components/adx/no-role-yet";
import { lacksConsoleRole } from "./auth";

/** An unsigned token with the claims given — `permissionsOf` only decodes the payload. */
function tokenWith(claims: Record<string, unknown>): string {
    const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString("base64url");
    return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}.sig`;
}

describe("lacksConsoleRole", () => {
    it("is true for an admin whose token carries no permission, whether the claim is empty or missing", () => {
        expect(lacksConsoleRole({ roles: ["ADMIN"] }, tokenWith({ sub: "u1", roles: ["ADMIN"], perms: [] }))).toBe(true);
        expect(lacksConsoleRole({ roles: ["ADMIN"] }, tokenWith({ sub: "u1", roles: ["ADMIN"] }))).toBe(true);
        expect(lacksConsoleRole({ roles: ["ADMIN"] }, null)).toBe(true);
    });

    it("is false the moment the token carries a role's list — one id is enough, Super admin's whole catalogue is not required", () => {
        expect(lacksConsoleRole({ roles: ["ADMIN"] }, tokenWith({ sub: "u1", roles: ["ADMIN"], perms: ["finance.view"] }))).toBe(false);
    });

    it("is never true for a party account: not an admin is a different answer, given elsewhere", () => {
        expect(lacksConsoleRole({ roles: ["PUBLISHER"] }, tokenWith({ sub: "u1", roles: ["PUBLISHER"], perms: [] }))).toBe(false);
        expect(lacksConsoleRole(null, null)).toBe(false);
    });
});

describe("the card", () => {
    it("names the account, says who assigns the role and where, and offers to sign out", () => {
        const onSignOut = vi.fn();
        render(<NoRoleYet email="ops@adx.in" onSignOut={onSignOut} />);
        expect(screen.getByRole("heading", { name: "Ask a super admin to assign you a role" })).toBeInTheDocument();
        expect(screen.getByText(/ops@adx.in holds the Admin role/)).toBeInTheDocument();
        expect(screen.getByText(/Users › Admin users/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
        expect(onSignOut).toHaveBeenCalledTimes(1);
    });
});
