"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { SubNav } from "@/components/adx/sub-nav";
import { ADMIN_USER_STATUS_META, type AdminUser } from "@/types";

interface AdminUsersViewProps {
    users: AdminUser[];
    invites: { email: string; role: string; sent: string }[];
}

export function AdminUsersView({ users, invites }: AdminUsersViewProps) {
    const columns = React.useMemo<ColumnDef<AdminUser>[]>(
        () => [
            {
                id: "name",
                accessorKey: "name",
                header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
                cell: ({ row }) => (
                    <div className="flex items-center gap-2.5">
                        <InitialsAvatar name={row.original.name} size="sm" />
                        <span className="font-medium text-foreground">{row.original.name}</span>
                        {row.original.twoFactorEnabled && (
                            <ShieldCheck className="size-3.5 text-success" aria-label="2FA enabled" />
                        )}
                    </div>
                ),
            },
            {
                id: "email",
                accessorKey: "email",
                header: "Email",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">{row.original.email}</span>
                ),
            },
            {
                id: "role",
                accessorKey: "role",
                header: "Role",
                cell: ({ row }) => row.original.role,
            },
            {
                id: "last-active",
                accessorKey: "lastLogin",
                header: "Last active",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">{row.original.lastLogin}</span>
                ),
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => (
                    <StatusBadge status={ADMIN_USER_STATUS_META[row.original.status]} />
                ),
            },
        ],
        []
    );

    return (
        <div className="space-y-5">
            <SubNav
                items={[
                    { label: "Permissions", href: "/roles", exact: true },
                    { label: "Admin users", href: "/roles/users" },
                ]}
            />

            <PageHeader
                title="Admin users"
                subtitle="Everyone with access to this console"
                actions={
                    <>
                        <Button
                            variant="outline"
                            className="bg-card"
                            onClick={() => toast.success("Admin list exported")}
                        >
                            Export list
                        </Button>
                        <Button onClick={() => toast.info("Invites are sent to @adx.co.in work emails.")}>
                            <Plus className="mr-1.5 size-4" />
                            Invite admin
                        </Button>
                    </>
                }
            />

            <div className="grid gap-4 xl:grid-cols-3">
                <div className="xl:col-span-2">
                    <DataTable
                        columns={columns}
                        data={users}
                        searchPlaceholder="Search admins"
                        initialPageSize={10}
                    />
                </div>
                <Card className="h-fit rounded-lg border-border shadow-none">
                    <div className="border-b px-5 py-4">
                        <h3 className="text-base font-semibold text-foreground">Pending invites</h3>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            Expire automatically after 7 days
                        </p>
                    </div>
                    <ul className="divide-y">
                        {invites.map((invite) => (
                            <li key={invite.email} className="px-5 py-3.5">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-foreground">
                                            {invite.email}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {invite.role} · Sent {invite.sent}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2 text-xs"
                                            onClick={() => toast.success(`Invite resent to ${invite.email}`)}
                                        >
                                            Resend
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2 text-xs text-danger hover:text-danger"
                                            onClick={() => toast.success(`Invite revoked for ${invite.email}`)}
                                        >
                                            Revoke
                                        </Button>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                </Card>
            </div>
        </div>
    );
}
