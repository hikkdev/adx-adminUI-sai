"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { useAuth } from "@/lib/auth";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { rolesService, type RoleConfig } from "@/services/roles";
import {
    USER_SORTS,
    USER_STATES,
    usersService,
    type UserSort,
    type UserState,
    type UsersDirectory,
    type UsersQuery,
} from "@/services/users";
import { UsersOffline } from "../users-nav";
import { AdminsView } from "./admins-view";

interface Loaded {
    directory: UsersDirectory;
    roles: RoleConfig[];
    /** Whether the signed-in operator may hand out the system role — `GET /users/me`'s `isSuperAdmin`. */
    superAdmin: boolean;
}

/** The facets the tab keeps in the URL; the role is always ADMIN and never in it. */
export interface AdminsFacets {
    state: UserState | null;
    sort: UserSort;
}

const isState = (value: string | null): value is UserState => USER_STATES.includes(value as UserState);
const isSort = (value: string | null): value is UserSort => USER_SORTS.includes(value as UserSort);

/** `?state=&sort=` off the URL; anything the API would not take reads as unset. */
export function adminsFacetsOf(params: URLSearchParams): AdminsFacets {
    const state = params.get("state");
    const sort = params.get("sort");
    return { state: isState(state) ? state : null, sort: isSort(sort) ? sort : "newest" };
}

/** The URL for a set of facets — the default sort is not written. */
export function adminsFacetsQuery(facets: AdminsFacets): string {
    const next = new URLSearchParams();
    if (facets.state) next.set("state", facets.state);
    if (facets.sort !== "newest") next.set("sort", facets.sort);
    return next.toString();
}

/**
 * What `GET /users` is asked for: `role=ADMIN` always, the state and the
 * sort when set, the search when typed. Pure so the test can pin that the
 * tab never asks for anybody but the console's operators.
 */
export function adminsQueryOf(facets: AdminsFacets, q: string): UsersQuery {
    return {
        role: "ADMIN",
        ...(facets.state ? { state: facets.state } : {}),
        ...(facets.sort !== "newest" ? { sort: facets.sort } : {}),
        ...(q ? { q } : {}),
    };
}

/**
 * The Admin users tab's data (Lot K2).
 *
 * One `GET /users?role=ADMIN` under the state facet, the sort and the
 * search, all in the resource key so a change refetches. Every row carries
 * its `roleConfig`, its `twoFactor` summary and `lastLoginAt`, so the table
 * needs no per-row read. The role list rides along for the Change role,
 * Invite and Create dialogs, and `GET /users/me` is read once (M-C) for its
 * `isSuperAdmin` — the backend applies the same predicate the grant guard
 * does, so whether the Change role dialog lets the operator grant the
 * system role is decided in one read, with no `GET /users/:id` on the
 * session user. A failed read of either leaves the system option disabled
 * rather than failing the page: the server refuses the grant anyway
 * (SUPER_ADMIN_ONLY).
 */
export function AdminsLoader() {
    const live = isLive("users");
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const facets = adminsFacetsOf(params);
    const { user: operator } = useAuth();
    const operatorId = operator?.id ?? null;

    const [query, setQuery] = React.useState("");
    const q = useDebounced(query.trim(), 300);

    const setFacets = React.useCallback(
        (next: AdminsFacets) => {
            const qs = adminsFacetsQuery(next);
            router.replace(qs ? `${pathname}?${qs}` : pathname);
        },
        [pathname, router],
    );

    const resource = useApiResource<Loaded>(
        `users:admins:${facets.state ?? "all"}:${facets.sort}:${q}:${operatorId ?? "-"}:${live}`,
        async () => {
            const [directory, roles, me] = await Promise.all([
                usersService.directory(adminsQueryOf(facets, q)),
                isLive("roles") ? rolesService.list().catch(() => [] as RoleConfig[]) : Promise.resolve([] as RoleConfig[]),
                operatorId ? usersService.me().catch(() => null) : Promise.resolve(null),
            ]);
            return { directory, roles, superAdmin: me?.isSuperAdmin === true };
        },
    );

    if (!live) return <UsersOffline title="Admin users" subtitle="Everyone who can sign in to this console" />;

    return (
        <ResourceBoundary resource={resource}>
            {(data) => (
                <AdminsView
                    directory={data.directory}
                    facets={facets}
                    onFacetsChange={setFacets}
                    query={query}
                    onQueryChange={setQuery}
                    roles={data.roles}
                    operatorId={operatorId}
                    operatorIsSuperAdmin={data.superAdmin}
                    onChanged={resource.reload}
                />
            )}
        </ResourceBoundary>
    );
}
