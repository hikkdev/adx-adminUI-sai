"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronLeft, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { KpiCard } from "@/components/adx/kpi-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatCompactINR, formatINR } from "@/lib/format";
import {
    KYC_STATUS_META,
    LISTING_STATUS_META,
    WITHDRAWAL_STATUS_META,
    type AuditEvent,
    type KpiStat,
    type KycCase,
    type Listing,
    type Publisher,
    type Withdrawal,
} from "@/types";

interface PublisherDetailProps {
    publisher: Publisher;
    sites: Listing[];
    kycCase?: KycCase;
    withdrawals: Withdrawal[];
    activity: AuditEvent[];
}

const checkTone = { pass: "success", fail: "danger", manual: "warning" } as const;

export function PublisherDetail({
    publisher,
    sites,
    kycCase,
    withdrawals,
    activity,
}: PublisherDetailProps) {
    const kpis: KpiStat[] = [
        {
            id: "earnings",
            label: "Earnings this month",
            value: formatCompactINR(publisher.monthlyEarnings),
            delta: "+12.1%",
            deltaTone: "positive",
            hint: "from last month",
        },
        { id: "sites", label: "Listed sites", value: String(publisher.sites) },
        {
            id: "live",
            label: "Live sites",
            value: String(sites.filter((site) => site.status === "live").length),
            hint: "of the sites on this page",
        },
        {
            id: "kyc",
            label: "KYC status",
            value: KYC_STATUS_META[publisher.kycStatus].label,
            hint: `PAN ${publisher.pan}`,
        },
    ];

    const siteColumns = React.useMemo<ColumnDef<Listing>[]>(
        () => [
            {
                id: "site",
                accessorKey: "title",
                header: ({ column }) => <SortableHeader column={column}>Site</SortableHeader>,
                cell: ({ row }) => (
                    <div className="flex items-center gap-2.5">
                        <InitialsAvatar name={row.original.title} size="sm" />
                        <div>
                            <p className="font-medium text-foreground">{row.original.title}</p>
                            <p className="text-xs text-muted-foreground">{row.original.sizeFt}</p>
                        </div>
                    </div>
                ),
            },
            {
                id: "type",
                accessorKey: "type",
                header: "Type",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">{row.original.type}</span>
                ),
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => <StatusBadge status={LISTING_STATUS_META[row.original.status]} />,
            },
            {
                id: "monthly-rate",
                accessorKey: "monthlyRate",
                header: ({ column }) => (
                    <SortableHeader column={column}>Monthly rate</SortableHeader>
                ),
                cell: ({ row }) => (
                    <span className="font-medium">{formatINR(row.original.monthlyRate)}</span>
                ),
            },
        ],
        []
    );

    return (
        <div className="space-y-5">
            <div>
                <Link
                    href="/publishers"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="size-4" />
                    Publishers
                </Link>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                            {publisher.name}
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {publisher.sites} sites, {KYC_STATUS_META[publisher.kycStatus].label},{" "}
                            {formatCompactINR(publisher.monthlyEarnings)}/mo earned ·{" "}
                            {publisher.city}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            className="bg-card"
                            onClick={() => toast.success(`Statement emailed to ${publisher.email}`)}
                        >
                            Email statement
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="icon" className="size-9 bg-card">
                                    <MoreHorizontal className="size-4" />
                                    <span className="sr-only">More actions</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                    onSelect={() => toast.success("Login link sent to the owner")}
                                >
                                    Send login link
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => toast.info("Opening audited session…")}>
                                    Start audited session
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    className="text-danger focus:text-danger"
                                    onSelect={() => toast.success(`${publisher.name} suspended`)}
                                >
                                    Suspend account
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {kpis.map((stat) => (
                    <KpiCard key={stat.id} stat={stat} />
                ))}
            </div>

            <Tabs defaultValue="sites">
                <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b bg-transparent p-0">
                    {[
                        { value: "sites", label: "Sites" },
                        { value: "kyc", label: "KYC & documents" },
                        { value: "payouts", label: "Payouts" },
                        { value: "activity", label: "Activity" },
                    ].map((tab) => (
                        <TabsTrigger
                            key={tab.value}
                            value={tab.value}
                            className="rounded-none border-b-2 border-transparent px-0 pb-2.5 pt-1 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                        >
                            {tab.label}
                        </TabsTrigger>
                    ))}
                </TabsList>

                <TabsContent value="sites" className="mt-5">
                    <DataTable
                        columns={siteColumns}
                        data={sites}
                        searchPlaceholder="Search sites, format, location"
                        initialPageSize={10}
                    />
                </TabsContent>

                <TabsContent value="kyc" className="mt-5">
                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card className="rounded-lg border-border p-5 shadow-none">
                            <h3 className="text-base font-semibold text-foreground">Identity</h3>
                            <dl className="mt-4 space-y-3 text-sm">
                                {[
                                    ["Owner", publisher.owner],
                                    ["Email", publisher.email],
                                    ["Phone", publisher.phone],
                                    ["PAN", publisher.pan],
                                    ["GSTIN", publisher.gstin ?? "-"],
                                    ["Business type", publisher.businessType === "company" ? "Company" : "Individual"],
                                    ["Onboarded by", publisher.onboardedBy ?? "Self-signup"],
                                ].map(([label, value]) => (
                                    <div key={label} className="flex items-center justify-between gap-4">
                                        <dt className="text-muted-foreground">{label}</dt>
                                        <dd className="font-medium text-foreground">{value}</dd>
                                    </div>
                                ))}
                            </dl>
                        </Card>
                        <Card className="rounded-lg border-border p-5 shadow-none">
                            <div className="flex items-center justify-between">
                                <h3 className="text-base font-semibold text-foreground">
                                    Verification checks
                                </h3>
                                {kycCase && (
                                    <Button variant="outline" size="sm" className="h-8" asChild>
                                        <Link href={`/kyc/${kycCase.id}`}>Open in workbench</Link>
                                    </Button>
                                )}
                            </div>
                            {kycCase ? (
                                <ul className="mt-4 space-y-3">
                                    {kycCase.checks.map((check) => (
                                        <li
                                            key={check.label}
                                            className="flex items-center justify-between gap-4 text-sm"
                                        >
                                            <div>
                                                <p className="font-medium text-foreground">{check.label}</p>
                                                <p className="text-xs text-muted-foreground">{check.detail}</p>
                                            </div>
                                            <StatusBadge
                                                status={{
                                                    label:
                                                        check.result === "pass"
                                                            ? "Pass"
                                                            : check.result === "fail"
                                                              ? "Fail"
                                                              : "Manual",
                                                    tone: checkTone[check.result],
                                                }}
                                            />
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="mt-4 text-sm text-muted-foreground">
                                    KYC {KYC_STATUS_META[publisher.kycStatus].label.toLowerCase()}, no
                                    open review case for this publisher.
                                </p>
                            )}
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="payouts" className="mt-5">
                    <Card className="rounded-lg border-border shadow-none">
                        {withdrawals.length ? (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                        <th className="px-4 py-2.5">Requested</th>
                                        <th className="px-4 py-2.5">Amount</th>
                                        <th className="px-4 py-2.5">Destination</th>
                                        <th className="px-4 py-2.5">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {withdrawals.map((withdrawal) => (
                                        <tr key={withdrawal.id} className="border-b last:border-0">
                                            <td className="px-4 py-3 text-muted-foreground">
                                                {withdrawal.requestedAgo}
                                            </td>
                                            <td className="px-4 py-3 font-medium">
                                                {formatINR(withdrawal.amount)}
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground">
                                                {withdrawal.destination}
                                            </td>
                                            <td className="px-4 py-3">
                                                <StatusBadge
                                                    status={WITHDRAWAL_STATUS_META[withdrawal.status]}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                                No withdrawal requests from this publisher yet.
                            </p>
                        )}
                    </Card>
                </TabsContent>

                <TabsContent value="activity" className="mt-5">
                    <Card className="rounded-lg border-border p-5 shadow-none">
                        {activity.length ? (
                            <ul className="space-y-4">
                                {activity.map((event) => (
                                    <li key={event.id} className="flex items-start gap-3 text-sm">
                                        <InitialsAvatar name={event.actor} size="sm" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-foreground">
                                                <span className="font-medium">{event.actor}</span>{" "}
                                                {event.action.toLowerCase()} · {event.target}
                                            </p>
                                            <p className="mt-0.5 text-xs text-muted-foreground">{event.at}</p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="py-6 text-center text-sm text-muted-foreground">
                                No recent admin activity for this publisher.
                            </p>
                        )}
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
