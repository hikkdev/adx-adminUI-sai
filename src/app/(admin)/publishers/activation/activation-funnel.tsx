"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Rocket } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import {
    FUNNEL_GATE_META,
    funnelGate,
    type FunnelGate,
    type PublisherFunnelRow,
    type SupplyFunnel,
} from "@/types";

interface Props {
    funnel: SupplyFunnel;
    rows: PublisherFunnelRow[];
}

/** The five gates, in order, with the count that has cleared each. */
function gates(funnel: SupplyFunnel) {
    return [
        { key: "accounts", label: "Account created", value: funnel.accountsCreated },
        { key: "kyc", label: "KYC verified", value: funnel.kycVerified },
        { key: "platform", label: "Platform agreement", value: funnel.platformAgreementAccepted },
        { key: "inventory", label: "Inventory listed", value: funnel.withInventory },
        { key: "listing", label: "Listing agreement", value: funnel.listingAgreementAccepted },
    ];
}

const publisherColumns: ColumnDef<PublisherFunnelRow>[] = [
    {
        accessorKey: "name",
        header: ({ column }) => <SortableHeader column={column}>Publisher</SortableHeader>,
        cell: ({ row }) => (
            <div className="flex items-center gap-2.5">
                <InitialsAvatar name={row.original.name} />
                <div className="min-w-0">
                    <Link
                        href={`/publishers/${row.original.id}`}
                        className="font-medium text-foreground hover:underline"
                    >
                        {row.original.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                        {row.original.city ?? "—"}
                        {row.original.isPartnerPublisher && " · Partner publisher"}
                    </p>
                </div>
            </div>
        ),
    },
    {
        id: "gate",
        header: "Held at",
        cell: ({ row }) => <StatusBadge status={FUNNEL_GATE_META[funnelGate(row.original)]} />,
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
        accessorKey: "listingCount",
        header: ({ column }) => <SortableHeader column={column}>Listings</SortableHeader>,
        cell: ({ row }) => <span className="tabular-nums">{row.original.listingCount}</span>,
    },
    {
        accessorKey: "liveListingCount",
        header: ({ column }) => <SortableHeader column={column}>Live</SortableHeader>,
        cell: ({ row }) => <span className="tabular-nums">{row.original.liveListingCount}</span>,
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

export function ActivationFunnel({ funnel, rows }: Props) {
    const [gateFilter, setGateFilter] = React.useState<FunnelGate | "all">("all");

    const steps = gates(funnel);
    const widest = steps[0]?.value || 1;

    const filtered = React.useMemo(
        () => (gateFilter === "all" ? rows : rows.filter((row) => funnelGate(row) === gateFilter)),
        [rows, gateFilter]
    );

    const waitingOnPublisher =
        funnel.stuckOnPublisher.awaitingAgreement + funnel.stuckOnPublisher.awaitingDocuments;
    const waitingOnAdx =
        funnel.stuckOnAdx.pendingDocumentReview + funnel.stuckOnAdx.awaitingSiteVerification;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Publisher activation"
                subtitle="Every publisher between signing up and earning, and which gate they are held at."
                actions={
                    <Button variant="outline" size="sm" asChild>
                        <Link href="/listings/attempts">Listing attempts</Link>
                    </Button>
                }
            />

            {/* The funnel itself. Bars are proportional to the first gate, so the
                drop-off between steps is the thing you read, not the absolute. */}
            <Card className="rounded-lg border-border p-5 shadow-none">
                <h2 className="text-sm font-semibold text-foreground">Supply funnel</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                    {funnel.listingsLive.toLocaleString("en-IN")} listings live across{" "}
                    {funnel.listingAgreementAccepted} accepted batches.
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
                                        style={{ width: `${Math.max(2, (step.value / widest) * 100)}%` }}
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

            {/* Who is being waited on. Two of the gates are the publisher's and
                two are ours, and they need different chasing. */}
            <div className="grid gap-4 md:grid-cols-2">
                <WaitingCard
                    tone="warning"
                    title="Waiting on the publisher"
                    total={waitingOnPublisher}
                    rows={[
                        { label: "Listing agreement not accepted", value: funnel.stuckOnPublisher.awaitingAgreement },
                        { label: "Documents outstanding", value: funnel.stuckOnPublisher.awaitingDocuments },
                    ]}
                />
                <WaitingCard
                    tone="info"
                    title="Waiting on ADX"
                    total={waitingOnAdx}
                    rows={[
                        { label: "Documents to review", value: funnel.stuckOnAdx.pendingDocumentReview },
                        { label: "Site visits to run", value: funnel.stuckOnAdx.awaitingSiteVerification },
                    ]}
                />
            </div>

            <div>
                <div className="flex flex-wrap items-center gap-2 pb-3">
                    <FilterChip active={gateFilter === "all"} onClick={() => setGateFilter("all")}>
                        All {rows.length}
                    </FilterChip>
                    {(Object.keys(FUNNEL_GATE_META) as FunnelGate[]).map((gate) => {
                        const count = rows.filter((row) => funnelGate(row) === gate).length;
                        if (count === 0) return null;
                        return (
                            <FilterChip
                                key={gate}
                                active={gateFilter === gate}
                                onClick={() => setGateFilter(gate)}
                            >
                                {FUNNEL_GATE_META[gate].label} {count}
                            </FilterChip>
                        );
                    })}
                </div>

                <DataTable
                    columns={publisherColumns}
                    data={filtered}
                    searchPlaceholder="Search publishers or city"
                    emptyState={
                        <EmptyState
                            icon={Rocket}
                            title="Nobody held here"
                            description="No publisher is currently stuck at this gate."
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
}: {
    title: string;
    total: number;
    rows: { label: string; value: number }[];
    tone: "warning" | "info";
}) {
    return (
        <Card className="rounded-lg border-border p-5 shadow-none">
            <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                <span
                    className={cn(
                        "text-metric",
                        tone === "warning" ? "text-warning" : "text-info"
                    )}
                >
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
            {tone === "info" && (
                <Link
                    href="/listings/verification"
                    className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                    Verification queue <ArrowRight className="size-3" />
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
