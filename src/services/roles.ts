import { api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";

/**
 * Console roles — the backend `access-control` module (Lot A).
 *
 * A `RoleConfig` is a named list of permission ids: what an operator may do
 * *inside the console*. It is not the Prisma `Role` enum (ADMIN, PUBLISHER…),
 * which says which app you are using; only an account holding ADMIN may be
 * given one, and the membership route lives with the person, under `/users`.
 *
 * The catalogue comes from `GET /roles-config/capabilities` — the module
 * groups (fourteen since Lot AA added `work`), each with the tiers it has
 * (view / edit / approve) plus a handful of named capabilities; the matrix
 * draws whatever the backend lists, so a new group needs no change here. Ids are `<group>.<tier>` or `<group>.<name>`.
 *
 * The tiers nest by convention, not by code: `requirePermission` checks
 * exactly the id it is given, so a role holding `approve` without `view` is a
 * misconfiguration. The console prevents it here — `withTier` writes every
 * tier up to the one picked — rather than trusting each screen to remember.
 *
 * No fixture fallback. The five seeded columns and their thirteen made-up
 * capability ids are gone; the real catalogue has a different shape entirely.
 */

/* ------------------------------------------------------------------ */
/* The wire                                                            */
/* ------------------------------------------------------------------ */

export type PermissionTier = "view" | "edit" | "approve";

/** In ascending order. `approve` implies the two below it. */
export const PERMISSION_TIERS: readonly PermissionTier[] = ["view", "edit", "approve"];

export const TIER_LABEL: Record<PermissionTier | "none", string> = {
    none: "None",
    view: "View",
    edit: "Edit",
    approve: "Approve",
};

export interface PermissionEntry {
    id: string;
    label: string;
    /** The tier for `<group>.<tier>` ids; `capability` for the named ones. */
    kind: PermissionTier | "capability";
}

export interface PermissionGroup {
    id: string;
    label: string;
    permissions: PermissionEntry[];
}

export interface Capabilities {
    groups: PermissionGroup[];
    /** Every id, in matrix order — what "every permission" means for the super admin. */
    permissions: string[];
}

/** One role as `GET /roles-config` lists it. */
export interface RoleConfig {
    id: string;
    name: string;
    description: string | null;
    permissions: string[];
    isSystem: boolean;
    memberCount: number;
    createdAt: string;
    updatedAt: string;
}

export interface CreateRoleInput {
    name: string;
    description?: string;
    permissions: string[];
}

export interface UpdateRoleInput {
    name?: string;
    description?: string;
    permissions?: string[];
}

/* ------------------------------------------------------------------ */
/* The matrix                                                          */
/* ------------------------------------------------------------------ */

/** The tiers a group has, in ascending order. */
export function tiersOf(group: PermissionGroup): PermissionTier[] {
    return PERMISSION_TIERS.filter((tier) => group.permissions.some((p) => p.kind === tier));
}

/** The named capabilities a group has, in catalogue order. */
export function capabilitiesOf(group: PermissionGroup): PermissionEntry[] {
    return group.permissions.filter((p) => p.kind === "capability");
}

/**
 * The highest tier a role holds in a group, or "none".
 *
 * Highest rather than "all up to": a role someone hand-built with `approve`
 * and no `view` still reads as Approve, and saving it through `withTier`
 * repairs the nesting.
 */
export function tierOf(group: PermissionGroup, permissions: readonly string[]): PermissionTier | "none" {
    const held = new Set(permissions);
    for (let i = PERMISSION_TIERS.length - 1; i >= 0; i -= 1) {
        const tier = PERMISSION_TIERS[i];
        if (held.has(`${group.id}.${tier}`)) return tier;
    }
    return "none";
}

/**
 * The permissions with one group set to `tier`, nested: picking Approve
 * grants view and edit too; picking None clears the group's tiers and leaves
 * its named capabilities alone.
 */
export function withTier(
    permissions: readonly string[],
    group: PermissionGroup,
    tier: PermissionTier | "none",
): string[] {
    const groupTiers = tiersOf(group);
    const keep = permissions.filter((id) => !groupTiers.some((t) => id === `${group.id}.${t}`));
    if (tier === "none") return keep;
    const upTo = PERMISSION_TIERS.indexOf(tier);
    const granted = groupTiers.filter((t) => PERMISSION_TIERS.indexOf(t) <= upTo).map((t) => `${group.id}.${t}`);
    return [...keep, ...granted];
}

/** The permissions with one named capability toggled. */
export function toggled(permissions: readonly string[], id: string): string[] {
    return permissions.includes(id) ? permissions.filter((p) => p !== id) : [...permissions, id];
}

/** "8 of 33" on the role list: how many of the catalogue the role holds. */
export function countHeld(permissions: readonly string[], catalogue: readonly string[]): number {
    const known = new Set(catalogue);
    return permissions.filter((id) => known.has(id)).length;
}

/* ------------------------------------------------------------------ */
/* The service                                                         */
/* ------------------------------------------------------------------ */

function live() {
    if (!isLive("roles")) throw new Error("Roles read the API; connect the console to the ADX backend first.");
    return http;
}

export const rolesService = {
    capabilities: (): Promise<Capabilities> => live().get<Capabilities>("/roles-config/capabilities"),

    list: async (): Promise<RoleConfig[]> => (await live().get<RoleConfig[]>("/roles-config")) ?? [],

    get: (id: string): Promise<RoleConfig> => live().get<RoleConfig>(`/roles-config/${id}`),

    /** 201; every id validated — an unknown one is 400 UNKNOWN_PERMISSION. */
    create: (input: CreateRoleInput): Promise<RoleConfig> => live().post<RoleConfig>("/roles-config", input),

    /** Ends the members' sessions: the permissions live in the access token. */
    update: (id: string, input: UpdateRoleInput): Promise<RoleConfig> =>
        live().put<RoleConfig>(`/roles-config/${id}`, input),

    /** 409 on a system role, 409 ROLE_HAS_MEMBERS on one somebody still holds. */
    remove: (id: string): Promise<{ message: string }> => live().delete(`/roles-config/${id}`),
};
