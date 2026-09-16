"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Wallet } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCompactINR, formatDate } from "@/lib/format";
import {
    ADVERTISER_GATE_META,
    ADVERTISER_TYPE_LABELS,
    advertiserGate,
    type AdvertiserFunnel,
    type AdvertiserFunnelRow,
    type AdvertiserGate,
} from "@/types";

interface Props {
    funnel: AdvertiserFunnel;
    rows: AdvertiserFunnelRow[];
}

/** The five gates, in order, with the count that has cleared each. */
function gates(funnel: AdvertiserFunnel) {
    return [
        { key: "accounts", label: "Account created", value: funnel.accountsCreated },
        { key: "profile", label: "Profile complete", value: funnel.profileComplete },
        { key: "kyc", label: "KYC verified", value: funnel.kycVerified },
        { key: "agreement", label: "Platform agreement", value: funnel.platformAgreementAccepted },
        { key: "funded", label: "Funded", value: funnel.funded },
    ];
}

const columns: ColumnDef<AdvertiserFunnelRow>[] = [
    {
        accessorKey: "name",
        header: ({ column }) => <SortableHeader column={column}>Advertiser</SortableHeader>,
        cell: ({ row }) => (
            <div className="flex items-center gap-2.5">
                <InitialsAvatar name={row.original.companyName ?? row.original.name} />
                <div className="min-w-0">
                    <Link
                        href={`/advertisers/${row.original.id}`}
                        className="font-medium text-foreground hover:underline"
                    >
                        {row.original.companyName ?? row.original.name}
                    </Link>
                    {row.original.displayId && (
                        <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                            {row.original.displayId}
                        </p>
                    )}
                </div>
            </div>
        ),
    },
    {
        id: "gate",
        header: "Held at",
        cell: ({ row }) => <StatusBadge status={ADVERTISER_GATE_META[advertiserGate(row.original)]} />,
    },
    {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => (
            <span className="text-xs text-muted-foreground">
                {ADVERTISER_TYPE_LABELS[row.original.type]}
                {row.original.city ? ` · ${row.original.city}` : ""}
            </span>
        ),
    },
    {
        accessorKey: "kycStatus",
        header: "KYC",
        cell: ({ row }) => (
            <span className="text-xs text-muted-foreground">
                {row.original.kycStatus === "VERIFIED"
                    ? "Verified"
                    : row.original.kycStatus === "REJECTED"
                      ? "Rejected"
                      : "Pending"}
            </span>
        ),
    },
    {
        accessorKey: "platformAgreementAcceptedAt",
        header: "Agreement",
        cell: ({ row }) => (
            <span className="text-xs text-muted-foreground">
                {row.original.platformAgreementAcceptedAt
                    ? formatDate(row.original.platformAgreementAcceptedAt)
                    : "Not accepted"}
            </span>
        ),
    },
    {
        accessorKey: "brandCount",
        header: ({ column }) => <SortableHeader column={column}>Brands</SortableHeader>,
        cell: ({ row }) => <span className="tabular-nums">{row.original.brandCount}</span>,
    },
    {
        accessorKey: "walletBalance",
        header: ({ column }) => <SortableHeader column={column}>Wallet</SortableHeader>,
        cell: ({ row }) => (
            <span className="tabular-nums">
                {Number(row.original.walletBalance) > 0
                    ? formatCompactINR(Number(row.original.walletBalance))
                    : "—"}
            </span>
        ),
    },
    {
        accessorKey: "createdAt",
        header: ({ column }) => <SortableHeader column={column}>Signed up</SortableHeader>,
        cell: ({ row }) => (
            <span className="text-xs text-muted-foreground">
                {formatDate(row.original.createdAt)}
            </span>
        ),
    },
];

export function AdvertiserActivationFunnel({ funnel, rows }: Props) {
    const [gateFilter, setGateFilter] = React.useState<AdvertiserGate | "all">("all");

    const steps = gates(funnel);
    const widest = steps[0]?.value || 1;

    const filtered = React.useMemo(
        () =>
            gateFilter === "all"
                ? rows
                : rows.filter((row) => advertiserGate(row) === gateFilter),
        [rows, gateFilter]
    );

    const waitingOnAdvertiser =
        funnel.stuckOnAdvertiser.awaitingProfile +
        funnel.stuckOnAdvertiser.awaitingKycSubmission +
        funnel.stuckOnAdvertiser.awaitingAgreement +
        funnel.stuckOnAdvertiser.awaitingFunds;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Advertiser activation"
                subtitle="Every advertiser between signing up and being able to book, and which gate they are held at."
                actions={
                    <Button variant="outline" size="sm" asChild>
                        <Link href="/kyc/advertisers">Advertiser KYC queue</Link>
                    </Button>
                }
            />

            {/* Bars are proportional to the first gate, so what you read is the
                drop-off between steps rather than the absolute count. */}
            <Card className="rounded-lg border-border p-5 shadow-none">
                <h2 className="text-sm font-semibold text-foreground">Demand funnel</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                    {funnel.funded} of {funnel.accountsCreated} accounts can place a booking today.
                </p>

                <div className="mt-5 space-y-3">
                    {steps.map((step, index) => {
                        const previous = index === 0 ? null : steps[index - 1]!.value;
                        const dropped = previous === null ? 0 : previous - step.value;
                        return (
                            <div key={step.key} className="flex items-center gap-3">
                                <span className="w-40 shrink-0 text-xs text-muted-foreground">
                                    {step.label}
                                </span>
                                <div className="h-7 flex-1 overflow-hidden rounded bg-muted">
                                    <div
                                        className="h-full rounded bg-primary/85"
                                        style={{
                                            width: `${Math.max(2, (step.value / widest) * 100)}%`,
                                        }}
                                    />
                                </div>
                                <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">
                                    {step.value}
                                </span>
                                <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                                    {dropped > 0 ? `−${dropped} dropped` : ""}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </Card>

            {/* Four of the five gates are the advertiser's own move; only KYC
                review is ours. They need different chasing. */}
            <div className="grid gap-4 md:grid-cols-2">
                <WaitingCard
                    tone="warning"
                    title="Waiting on the advertiser"
                    total={waitingOnAdvertiser}
                    rows={[
                        { label: "Profile incomplete", value: funnel.stuckOnAdvertiser.awaitingProfile },
                        { label: "KYC not submitted", value: funnel.stuckOnAdvertiser.awaitingKycSubmission },
                        { label: "Agreement not accepted", value: funnel.stuckOnAdvertiser.awaitingAgreement },
                        { label: "Wallet not funded", value: funnel.stuckOnAdvertiser.awaitingFunds },
                    ]}
                />
                <WaitingCard
                    tone="info"
                    title="Waiting on ADX"
                    total={funnel.stuckOnAdx.pendingKycReview}
                    rows={[
                        { label: "KYC cases to review", value: funnel.stuckOnAdx.pendingKycReview },
                    ]}
                    href="/kyc/advertisers"
                    hrefLabel="KYC queue"
                />
            </div>

            <div>
                <div className="flex flex-wrap items-center gap-2 pb-3">
                    <FilterChip active={gateFilter === "all"} onClick={() => setGateFilter("all")}>
                        All {rows.length}
                    </FilterChip>
                    {(Object.keys(ADVERTISER_GATE_META) as AdvertiserGate[]).map((gate) => {
                        const count = rows.filter((row) => advertiserGate(row) === gate).length;
                        if (count === 0) return null;
                        return (
                            <FilterChip
                                key={gate}
                                active={gateFilter === gate}
                                onClick={() => setGateFilter(gate)}
                            >
                                {ADVERTISER_GATE_META[gate].label} {count}
                            </FilterChip>
                        );
                    })}
                </div>

                <DataTable
                    columns={columns}
                    data={filtered}
                    searchPlaceholder="Search advertisers, ID, city"
                    emptyState={
                        <EmptyState
                            icon={Wallet}
                            title="Nobody held here"
                            description="No advertiser is currently stuck at this gate."
                        />
                    }
                />
            </div>
        </div>
    );
}

function WaitingCard({
    title,
    total,
    rows,
    tone,
    href,
    hrefLabel,
}: {
    title: string;
    total: number;
    rows: { label: string; value: number }[];
    tone: "warning" | "info";
    href?: string;
    hrefLabel?: string;
}) {
    return (
        <Card className="rounded-lg border-border p-5 shadow-none">
            <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                <span className={cn("text-metric", tone === "warning" ? "text-warning" : "text-info")}>
                    {total}
                </span>
            </div>
            <ul className="mt-3 space-y-1.5">
                {rows.map((row) => (
                    <li
                        key={row.label}
                        className="flex items-center justify-between text-xs text-muted-foreground"
                    >
                        <span>{row.label}</span>
                        <span className="tabular-nums text-foreground">{row.value}</span>
                    </li>
                ))}
            </ul>
            {href && (
                <Link
                    href={href}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                    {hrefLabel} <ArrowRight className="size-3" />
                </Link>
            )}
        </Card>
    );
}

function FilterChip({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
            )}
        >
            {children}
        </button>
    );
}
