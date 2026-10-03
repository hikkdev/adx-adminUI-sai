"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { ROSTER_ANY } from "@/services/party-roster";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { rolesService, type RoleConfig } from "@/services/roles";
import {
    DEFAULT_USERS_STATUS,
    USERS_ROLE_FACETS,
    isUsersStatusFacet,
    usersService,
    type Invite,
    type UsersDirectory,
    type UsersQuery,
    type UsersRoleFacet,
    type UsersStatusFacet,
} from "@/services/users";
import { UsersOffline } from "./users-nav";
import { UsersView } from "./users-view";

interface Loaded {
    directory: UsersDirectory;
    invites: Invite[];
    roles: RoleConfig[];
}

/** The facets the list keeps in the URL, so a filtered view is a link. */
export interface UsersFacets {
    /** The Status select: Active unless the URL says otherwise; ALL is Everyone. */
    status: UsersStatusFacet;
    role: UsersRoleFacet | null;
}

const isRole = (value: string | null): value is UsersRoleFacet => USERS_ROLE_FACETS.includes(value as UsersRoleFacet);

/** `?state=&role=` off the URL; anything the API would not take reads as the default. */
export function facetsOf(params: URLSearchParams): UsersFacets {
    const state = params.get("state");
    const role = params.get("role");
    return { status: isUsersStatusFacet(state) ? state : DEFAULT_USERS_STATUS, role: isRole(role) ? role : null };
}

/** The URL for a set of facets: the default Status is not written. */
export function facetsQuery(facets: UsersFacets): string {
    const next = new URLSearchParams();
    if (facets.status !== DEFAULT_USERS_STATUS) next.set("state", facets.status);
    if (facets.role) next.set("role", facets.role);
    return next.toString();
}

/** What `GET /users` is asked for: Everyone sends no state; the search once it settles. */
export function usersQueryOf(facets: UsersFacets, q: string): UsersQuery {
    return {
        ...(facets.status !== "ALL" ? { state: facets.status } : {}),
        ...(facets.role ? { role: facets.role } : {}),
        ...(q ? { q } : {}),
    };
}

/** The Any-role value the shared select uses, mapped onto the facet. */
export const roleFacetOf = (value: string): UsersRoleFacet | null => (value === ROSTER_ANY || !isRole(value) ? null : value);

/**
 * Users › Accounts' data.
 *
 * Every facet goes to the API: the Status (`state`), the role and the
 * search, which reaches the contact rows and, since 2 Oct 2026, the
 * businesses the login holds. They sit in the resource key, so a change
 * refetches under the rows on screen. The per-state counts come back beside
 * the rows with the state facet removed, which is what lets every Status
 * option say how many it would show. The invitations ride along for the
 * one-line notice (the list itself is on Admin users); the role list for
 * the invite and create dialogs. A failed roles read leaves the pickers with
 * "Super admin" only rather than failing the page.
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

    const resource = useApiResource<Loaded>(`users:list:${facets.status}:${facets.role ?? "any"}:${q}:${live}`, async () => {
        const [directory, invites, roles] = await Promise.all([
            usersService.directory(usersQueryOf(facets, q)),
            usersService.invites().catch(() => [] as Invite[]),
            isLive("roles") ? rolesService.list().catch(() => [] as RoleConfig[]) : Promise.resolve([] as RoleConfig[]),
        ]);
        return { directory, invites, roles };
    });

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
                    invitesWaiting={data.invites.filter((invite) => invite.status === "OPEN").length}
                    roles={data.roles}
                    refreshing={resource.loading}
                    onChanged={resource.reload}
                />
            )}
        </ResourceBoundary>
    );
}
