"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import type { RoleConfig } from "@/services/roles";
import { USER_STATUS_META, usersService, type UserRow } from "@/services/users";
import { EnforcementBanner, RolesNav } from "../roles-nav";

/**
 * Who holds which console role — the Members tab under Roles.
 *
 * No DR 10 frame draws this screen (the README lists `/roles/users` among
 * the eight without one), so it is composed from the console's table. Each
 * row is an ADMIN account from `GET /users` with the role `GET /users/:id`
 * reports, and the picker writes `PUT /users/:id/role-config`. "Super admin"
 * in the picker is the launch rule spelled out: an admin with no role holds
 * every permission, so removing a role is a widening, and the API audits it
 * as one.
 */

export interface AdminMember extends UserRow {
    roleConfig: { id: string; name: string } | null;
}

/** The picker's value for "no role", which `PUT` takes as `null`. */
const NO_ROLE = "__none__";

interface AdminUsersViewProps {
    members: AdminMember[];
    roles: RoleConfig[];
    onChanged: () => void;
}

export function AdminUsersView({ members, roles, onChanged }: AdminUsersViewProps) {
    const [busyId, setBusyId] = React.useState<string | null>(null);

    const assign = React.useCallback(
        async (member: AdminMember, value: string) => {
            const roleConfigId = value === NO_ROLE ? null : value;
            if ((member.roleConfig?.id ?? null) === roleConfigId) return;
            setBusyId(member.id);
            try {
                const result = await usersService.setRoleConfig(member.id, roleConfigId);
                toast.success(
                    result.roleConfig
                        ? `${member.displayName} now holds ${result.roleConfig.name}`
                        : `${member.displayName} holds no role — every permission, under the launch rule`
                );
                onChanged();
            } catch (caught) {
                toast.error(caught instanceof ApiError ? caught.message : "Could not change the role.");
            } finally {
                setBusyId(null);
            }
        },
        [onChanged]
    );

    const columns = React.useMemo<ColumnDef<AdminMember>[]>(
        () => [
            {
                id: "name",
                accessorKey: "displayName",
                header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
                cell: ({ row }) => (
                    <Link
                        href={`/users/${row.original.id}`}
                        className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <InitialsAvatar name={row.original.displayName} size="sm" />
                        <span className="min-w-0">
                            <span className="block truncate font-medium text-foreground underline-offset-4 hover:underline">
                                {row.original.displayName}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                                {row.original.email ?? row.original.mobile}
                            </span>
                        </span>
                    </Link>
                ),
            },
            {
                id: "role",
                accessorFn: (row) => row.roleConfig?.name ?? "",
                header: "Console role",
                cell: ({ row }) => (
                    <Select
                        value={row.original.roleConfig?.id ?? NO_ROLE}
                        onValueChange={(value) => void assign(row.original, value)}
                        disabled={busyId === row.original.id}
                    >
                        <SelectTrigger
                            className="h-8 w-[14rem] bg-card"
                            aria-label={`Console role for ${row.original.displayName}`}
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NO_ROLE}>Super admin (no role — every permission)</SelectItem>
                            {roles.map((role) => (
                                <SelectItem key={role.id} value={role.id}>
                                    {role.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ),
            },
            {
                id: "last-active",
                accessorKey: "lastLoginAt",
                header: ({ column }) => <SortableHeader column={column}>Last active</SortableHeader>,
                cell: ({ row }) => (
                    <span className="text-muted-foreground">
                        {row.original.lastLoginAt ? formatDateTime(row.original.lastLoginAt) : "Never signed in"}
                    </span>
                ),
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => <StatusBadge status={USER_STATUS_META[row.original.status]} />,
            },
        ],
        [assign, busyId, roles]
    );

    return (
        <div className="space-y-5">
            <RolesNav />

            <PageHeader
                title="Members"
                subtitle="Everyone with access to this console, and the role each one holds"
                actions={
                    <Button variant="outline" className="bg-card" asChild>
                        <Link href="/users/accounts">Invite under Users</Link>
                    </Button>
                }
            />

            <EnforcementBanner />

            <DataTable
                columns={columns}
                data={members}
                searchPlaceholder="Search members"
                initialPageSize={20}
                emptyState={
                    <p className="px-5 py-12 text-center text-sm text-muted-foreground">
                        No admin accounts yet.
                    </p>
                }
            />
        </div>
    );
}
