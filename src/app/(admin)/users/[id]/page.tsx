import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { SectionCard } from "@/components/adx/section-card";
import { FieldList } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate, formatDateTime } from "@/lib/format";
import { api } from "@/services";
import { UserPayrollCard } from "./user-payroll-card";
import { USER_ACCOUNT_STATUS_META, USER_ROLE_META } from "@/types";

export const metadata: Metadata = { title: "User" };

export default async function UserDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const user = await api.users.get(id);
    if (!user) notFound();

    return (
        <div className="space-y-5">
            <div>
                <Link
                    href="/users"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="size-4" />
                    Users
                </Link>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <InitialsAvatar name={user.name} size="lg" />
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2.5">
                                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                                    {user.name}
                                </h1>
                                <StatusBadge status={USER_ACCOUNT_STATUS_META[user.status]} />
                            </div>
                            <p className="mt-0.5 text-sm text-muted-foreground">
                                {user.email} · {user.mobile}
                            </p>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <Button variant="outline" className="bg-card">
                            Reset password
                        </Button>
                        <Button variant="outline" className="bg-card">
                            {user.status === "suspended" ? "Reinstate" : "Suspend"}
                        </Button>
                    </div>
                </div>
            </div>

            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="min-w-0 space-y-4">
                    <SectionCard title="Recent activity" contentClassName="p-0">
                        <ol className="divide-y">
                            {user.activity.map((entry) => (
                                <li
                                    key={entry.id}
                                    className="grid gap-1 px-5 py-3.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4"
                                >
                                    <time
                                        dateTime={entry.at}
                                        className="text-xs tabular-nums text-muted-foreground"
                                    >
                                        {formatDateTime(entry.at)}
                                    </time>
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-foreground">
                                            {entry.action}
                                        </p>
                                        <p className="mt-0.5 text-sm text-muted-foreground">
                                            {entry.detail}
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </SectionCard>

                    <SectionCard
                        title="Active sessions"
                        description={`${user.sessions.length} signed in`}
                        contentClassName="p-0"
                    >
                        {user.sessions.length ? (
                            <ul className="divide-y">
                                {user.sessions.map((session) => (
                                    <li
                                        key={session.id}
                                        className="flex flex-wrap items-center gap-3 px-5 py-3.5"
                                    >
                                        <Monitor className="size-4 shrink-0 text-muted-foreground" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-foreground">
                                                {session.device}
                                                {session.current && (
                                                    <span className="ml-2 text-xs font-normal text-success">
                                                        This device
                                                    </span>
                                                )}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {session.location} · {session.lastSeen}
                                            </p>
                                        </div>
                                        {!session.current && (
                                            <Button variant="ghost" size="sm">
                                                Revoke
                                            </Button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                                No active sessions.
                            </p>
                        )}
                    </SectionCard>
                </div>

                <div className="space-y-4">
                    <UserPayrollCard user={user} />

                    <SectionCard title="Roles" contentClassName="px-5 py-1">
                        <ul className="divide-y">
                            {user.roles.map((role) => (
                                <li key={role} className="py-3">
                                    <p className="text-sm font-medium text-foreground">
                                        {USER_ROLE_META[role].label}
                                    </p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {USER_ROLE_META[role].description}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    </SectionCard>
                </div>
            </div>
        </div>
    );
}
