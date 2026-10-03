"use client";

import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { rolesService, type Capabilities, type RoleConfig } from "@/services/roles";
import { RoleBuilder } from "./role-builder";
import { RolesOffline } from "./roles-nav";

interface Loaded {
    capabilities: Capabilities;
    roles: RoleConfig[];
}

/**
 * The builder's data: the catalogue from `/roles-config/capabilities` and
 * the roles from `/roles-config`, read together because the matrix is drawn
 * from the first and filled from the second.
 */
export function RolesLoader() {
    const live = isLive("roles");
    const resource = useApiResource<Loaded>(`roles:builder:${live}`, async () => {
        const [capabilities, roles] = await Promise.all([rolesService.capabilities(), rolesService.list()]);
        return { capabilities, roles };
    });

    if (!live) return <RolesOffline title="Roles and permissions" subtitle="What each admin role can see and do" />;

    return (
        <ResourceBoundary resource={resource}>
            {(data) => <RoleBuilder capabilities={data.capabilities} roles={data.roles} onChanged={resource.reload} />}
        </ResourceBoundary>
    );
}
