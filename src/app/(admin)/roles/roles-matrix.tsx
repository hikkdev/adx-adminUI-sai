"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/adx/page-header";
import { SubNav } from "@/components/adx/sub-nav";
import type { CapabilityGroup, RoleColumn } from "@/types";

interface RolesMatrixProps {
    groups: CapabilityGroup[];
    roles: RoleColumn[];
}

export function RolesMatrix({ groups, roles }: RolesMatrixProps) {
    const [grants, setGrants] = React.useState<Record<string, Set<string>>>(() =>
        Object.fromEntries(roles.map((role) => [role.id, new Set(role.grants)]))
    );
    const [dirty, setDirty] = React.useState(false);

    const toggle = (roleId: string, capabilityId: string) => {
        const role = roles.find((candidate) => candidate.id === roleId);
        if (role?.system) {
            toast.info("Super admin always holds every capability.");
            return;
        }
        setGrants((current) => {
            const next = { ...current, [roleId]: new Set(current[roleId]) };
            if (next[roleId].has(capabilityId)) {
                next[roleId].delete(capabilityId);
            } else {
                next[roleId].add(capabilityId);
            }
            return next;
        });
        setDirty(true);
    };

    return (
        <div className="space-y-5">
            <SubNav
                items={[
                    { label: "Permissions", href: "/roles", exact: true },
                    { label: "Admin users", href: "/roles/users" },
                ]}
            />

            <PageHeader
                title="Roles and permissions"
                subtitle="What each admin role can see and do"
                actions={
                    <>
                        <Button
                            variant="outline"
                            className="bg-card"
                            onClick={() => toast.info("Name the role, then grant capabilities below.")}
                        >
                            <Plus className="mr-1.5 size-4" />
                            New role
                        </Button>
                        <Button
                            disabled={!dirty}
                            onClick={() => {
                                setDirty(false);
                                toast.success("Permissions saved", {
                                    description: "Changes apply to affected admins on their next request.",
                                });
                            }}
                        >
                            Save changes
                        </Button>
                    </>
                }
            />

            <Card className="overflow-x-auto rounded-lg border-border shadow-none">
                <table className="w-full min-w-[860px] text-sm">
                    <thead>
                        <tr className="border-b bg-muted/50 text-left">
                            <th className="w-[320px] px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Capability
                            </th>
                            {roles.map((role) => (
                                <th key={role.id} className="px-4 py-3 text-center">
                                    <p className="text-sm font-semibold text-foreground">{role.name}</p>
                                    <p className="text-xs font-normal text-muted-foreground">
                                        {role.members} member{role.members === 1 ? "" : "s"}
                                    </p>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {groups.map((group) => (
                            <React.Fragment key={group.id}>
                                <tr className="border-b bg-muted/30">
                                    <td
                                        colSpan={roles.length + 1}
                                        className="px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                                    >
                                        {group.label}
                                    </td>
                                </tr>
                                {group.capabilities.map((capability) => (
                                    <tr key={capability.id} className="border-b last:border-0">
                                        <td className="px-5 py-3 text-foreground">{capability.label}</td>
                                        {roles.map((role) => (
                                            <td key={role.id} className="px-4 py-3 text-center">
                                                <Checkbox
                                                    checked={grants[role.id]?.has(capability.id) ?? false}
                                                    onCheckedChange={() => toggle(role.id, capability.id)}
                                                    aria-label={`${role.name}: ${capability.label}`}
                                                    className="mx-auto"
                                                />
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </Card>
        </div>
    );
}
