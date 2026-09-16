"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { rolesService, type RoleConfig } from "@/services/roles";
import {
    USERS_ROLE_FACETS,
    USER_SORTS,
    USER_STATES,
    usersService,
    type Invite,
    type UserSort,
    type UserState,
    type UsersDirectory,
    type UsersRoleFacet,
} from "@/services/users";
import { UsersOffline } from "./users-nav";
import { UsersView } from "./users-view";

interface Loaded {
    directory: UsersDirectory;
    invites: Invite[];
    roles: RoleConfig[];
}

/** The facets the directory keeps in the URL, so a filtered view is a link. */
export interface UsersFacets {
    state: UserState | null;
    role: UsersRoleFacet | null;
    sort: UserSort;
}

const isState = (value: string | null): value is UserState => USER_STATES.includes(value as UserState);
const isRole = (value: string | null): value is UsersRoleFacet => USERS_ROLE_FACETS.includes(value as UsersRoleFacet);
const isSort = (value: string | null): value is UserSort => USER_SORTS.includes(value as UserSort);

/** `?state=&role=&sort=` off the URL; anything the API would not take reads as unset. */
export function facetsOf(params: URLSearchParams): UsersFacets {
    const state = params.get("state");
    const role = params.get("role");
    const sort = params.get("sort");
    return { state: isState(state) ? state : null, role: isRole(role) ? role : null, sort: isSort(sort) ? sort : "newest" };
}

/** The URL for a set of facets — the default sort is not written. */
export function facetsQuery(facets: UsersFacets): string {
    const next = new URLSearchParams();
    if (facets.state) next.set("state", facets.state);
    if (facets.role) next.set("role", facets.role);
    if (facets.sort !== "newest") next.set("sort", facets.sort);
    return next.toString();
}

/**
 * The directory's data.
 *
 * K-B1: every facet goes to the API — `state`, `role`, `sort` and the
 * search (which reaches the contact rows now) — and sits in the resource
 * key, so a change refetches rather than cutting a page the console holds.
 * The state and the role live in the URL so a filtered view is a link; the
 * per-state counts come back beside the rows with the state facet removed,
 * which is what lets every chip say how many it would show. The
 * invitations and the role list ride along: the panel beside the table
 * needs the first, the invite and create dialogs the second. A failed roles
 * read leaves the pickers with "Super admin" only rather than failing the
 * page — roles is a separate domain with its own screen.
 */
export function UsersLoader() {
    const live = isLive("users");
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const facets = facetsOf(params);

    const [query, setQuery] = React.useState("");
    const q = useDebounced(query.trim(), 300);

    const setFacets = React.useCallback(
        (next: UsersFacets) => {
            const qs = facetsQuery(next);
            router.replace(qs ? `${pathname}?${qs}` : pathname);
        },
        [pathname, router],
    );

    const resource = useApiResource<Loaded>(
        `users:list:${facets.state ?? "all"}:${facets.role ?? "any"}:${facets.sort}:${q}:${live}`,
        async () => {
            const [directory, invites, roles] = await Promise.all([
                usersService.directory({
                    ...(facets.state ? { state: facets.state } : {}),
                    ...(facets.role ? { role: facets.role } : {}),
                    ...(facets.sort !== "newest" ? { sort: facets.sort } : {}),
                    ...(q ? { q } : {}),
                }),
                usersService.invites().catch(() => [] as Invite[]),
                isLive("roles") ? rolesService.list().catch(() => [] as RoleConfig[]) : Promise.resolve([] as RoleConfig[]),
            ]);
            return { directory, invites, roles };
        },
    );

    if (!live) return <UsersOffline title="Users" subtitle="Every account on the marketplace" />;

    return (
        <ResourceBoundary resource={resource}>
            {(data) => (
                <UsersView
                    directory={data.directory}
                    facets={facets}
                    onFacetsChange={setFacets}
                    query={query}
                    onQueryChange={setQuery}
                    invites={data.invites}
                    roles={data.roles}
                    onChanged={resource.reload}
                />
            )}
        </ResourceBoundary>
    );
}
