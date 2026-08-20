"use client";

import * as React from "react";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/adx/page-header";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { KpiCard } from "@/components/adx/kpi-card";
import { StatusBadge } from "@/components/adx/status-badge";
import {
    ActiveFilters,
    FilterPanel,
    type Facet,
    type FilterSelection,
} from "@/components/adx/filter-panel";
import { formatDate } from "@/lib/format";
import {
    USER_ACCOUNT_STATUS_META,
    USER_ROLE_META,
    type PlatformUser,
    type UserAccountStatus,
    type UserRole,
} from "@/types";

interface UsersViewProps {
    users: PlatformUser[];
}

const ROLES: UserRole[] = [
    "PUBLISHER",
    "ADVERTISER",
    "AGENT_PUBLISHER",
    "AGENT_ADVERTISER",
    "PARTNER",
    "ADMIN",
];
const STATUSES: UserAccountStatus[] = ["active", "invited", "suspended"];

export function UsersView({ users }: UsersViewProps) {
    const [query, setQuery] = React.useState("");
    const [selection, setSelection] = React.useState<FilterSelection>({});

    const facets: Facet[] = React.useMemo(
        () => [
            {
                id: "role",
                label: "Role",
                options: ROLES.map((role) => ({
                    value: role,
                    label: USER_ROLE_META[role].label,
                    count: users.filter((user) => user.roles.includes(role)).length,
                })),
            },
            {
                id: "status",
                label: "Status",
                options: STATUSES.map((status) => ({
                    value: status,
                    label: USER_ACCOUNT_STATUS_META[status].label,
                    count: users.filter((user) => user.status === status).length,
                })),
            },
            {
                id: "city",
                label: "City",
                options: Array.from(new Set(users.map((user) => user.city)))
                    .sort()
                    .map((city) => ({
                        value: city,
                        label: city,
                        count: users.filter((user) => user.city === city).length,
                    })),
            },
            {
                id: "security",
                label: "Security",
                options: [
                    {
                        value: "unverified",
                        label: "Identity not verified",
                        count: users.filter((user) => !user.kycVerified).length,
                    },
                    {
                        value: "no-2fa",
                        label: "Two-factor off",
                        count: users.filter((user) => !user.twoFactor).length,
                    },
                ],
            },
        ],
        [users]
    );

    const visible = React.useMemo(() => {
        const needle = query.trim().toLowerCase();
        const roles = selection.role ?? [];
        const statuses = selection.status ?? [];
        const cities = selection.city ?? [];
        const security = selection.security ?? [];

        return users.filter((user) => {
            if (roles.length && !roles.some((role) => user.roles.includes(role as UserRole)))
                return false;
            if (statuses.length && !statuses.includes(user.status)) return false;
            if (cities.length && !cities.includes(user.city)) return false;
            if (security.includes("unverified") && user.kycVerified) return false;
            if (security.includes("no-2fa") && user.twoFactor) return false;
            if (!needle) return true;
            return [user.name, user.email, user.mobile, user.city]
                .join(" ")
                .toLowerCase()
                .includes(needle);
        });
    }, [users, query, selection]);

    const active = users.filter((user) => user.status === "active").length;
    const unverified = users.filter((user) => !user.kycVerified).length;
    const noTwoFactor = users.filter((user) => user.status === "active" && !user.twoFactor).length;

    return (
        <div className="space-y-5">
            <PageHeader
                title="Users"
                subtitle="Every account on the marketplace"
                actions={
                    <Button onClick={() => toast.info("Invite a user by email and assign their role.")}>
                        <UserPlus className="size-4" />
                        Invite user
                    </Button>
                }
            />

            <div className="grid gap-4 md:grid-cols-3">
                <KpiCard
                    stat={{
                        id: "active",
                        label: "Active accounts",
                        value: String(active),
                        hint: `of ${users.length} total`,
                    }}
                />
                <KpiCard
                    stat={{
                        id: "unverified",
                        label: "Identity not verified",
                        value: String(unverified),
                        hint: unverified ? "Cannot transact until verified" : "Everyone is verified",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "2fa",
                        label: "Active without 2FA",
                        value: String(noTwoFactor),
                        hint: "Recommended for every role",
                    }}
                />
            </div>

            <div className="space-y-3">
                <FilterPanel
                    facets={facets}
                    selection={selection}
                    onChange={setSelection}
                    resultCount={visible.length}
                    search={{
                        value: query,
                        onChange: setQuery,
                        placeholder: "Name, email, mobile or city",
                    }}
                />
                <ActiveFilters
                    facets={facets}
                    selection={selection}
                    onChange={setSelection}
                    resultCount={visible.length}
                />
            </div>

            <Card className="overflow-hidden rounded-lg border-border shadow-none">
                {visible.length ? (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                <th className="px-4 py-2.5 font-medium">User</th>
                                <th className="px-4 py-2.5 font-medium">Roles</th>
                                <th className="px-4 py-2.5 font-medium">City</th>
                                <th className="px-4 py-2.5 font-medium">Joined</th>
                                <th className="px-4 py-2.5 font-medium">Last active</th>
                                <th className="px-4 py-2.5 font-medium">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((user) => (
                                <tr key={user.id} className="border-b last:border-0 hover:bg-muted/30">
                                    <td className="px-4 py-3">
                                        <Link
                                            href={`/users/${user.id}`}
                                            className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            <InitialsAvatar name={user.name} size="sm" />
                                            <span className="min-w-0">
                                                <span className="block truncate font-medium text-foreground underline-offset-4 hover:underline">
                                                    {user.name}
                                                </span>
                                                <span className="block truncate text-xs text-muted-foreground">
                                                    {user.email}
                                                </span>
                                            </span>
                                        </Link>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-wrap gap-1">
                                            {user.roles.map((role) => (
                                                <span
                                                    key={role}
                                                    className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                                                >
                                                    {USER_ROLE_META[role].label}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">{user.city}</td>
                                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                                        {formatDate(user.joinedAt)}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                        {user.lastActive}
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge status={USER_ACCOUNT_STATUS_META[user.status]} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p className="px-5 py-12 text-center text-sm text-muted-foreground">
                        No users match these filters.
                    </p>
                )}
            </Card>
        </div>
    );
}
