"use client";

import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { rolesService, type RoleConfig } from "@/services/roles";
import { usersService } from "@/services/users";
import { AdminUsersView, type AdminMember } from "./admin-users-view";
import { RolesOffline } from "../roles-nav";

interface Loaded {
    members: AdminMember[];
    roles: RoleConfig[];
}

/**
 * The roster's data.
 *
 * E6: `GET /users?role=ADMIN` narrows the list on the server and every row
 * carries its `roleConfig`, so the roster is one read rather than a list
 * plus a `GET /users/:id` per admin.
 */
export function AdminUsersLoader() {
    const live = isLive("roles") && isLive("users");
    const resource = useApiResource<Loaded>(`roles:members:${live}`, async () => {
        const [admins, roles] = await Promise.all([usersService.list({ role: "ADMIN" }), rolesService.list()]);
        const members: AdminMember[] = admins.map((row) => ({ ...row, roleConfig: row.roleConfig }));
        return { members, roles };
    });

    if (!live) return <RolesOffline title="Members" subtitle="Everyone with access to this console, and the role each one holds" />;

    return (
        <ResourceBoundary resource={resource}>
            {(data) => <AdminUsersView members={data.members} roles={data.roles} onChanged={resource.reload} />}
        </ResourceBoundary>
    );
}
