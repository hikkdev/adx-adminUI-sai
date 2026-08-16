import type { Metadata } from "next";
import { api } from "@/services";
import { RolesMatrix } from "./roles-matrix";

export const metadata: Metadata = { title: "Roles & Permissions" };

export default async function RolesPage() {
    const [groups, roles] = await Promise.all([
        api.roles.capabilityGroups(),
        api.roles.roleColumns(),
    ]);
    return <RolesMatrix groups={groups} roles={roles} />;
}
