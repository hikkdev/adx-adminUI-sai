"use client";

import * as React from "react";
import { FileImage, FileText, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FilterChips } from "@/components/adx/filter-chips";
import { KpiCard } from "@/components/adx/kpi-card";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatCompactINR, formatINR } from "@/lib/format";
import {
    DISPUTE_STATUS_META,
    type Dispute,
    type DisputeStatus,
} from "@/types";

interface DisputesViewProps {
    disputes: Dispute[];
    summary: {
        open: number;
        valueAtRisk: number;
        slaBreaches: number;
        avgResolutionDays: number;
        refundedThisMonth: number;
        rejectedThisMonth: number;
    };
}

type ChipValue = "open" | "escalated" | "resolved";

const OPEN_STATUSES: DisputeStatus[] = ["sla_breach", "in_review", "awaiting_publisher"];

export function DisputesView({ disputes, summary }: DisputesViewProps) {
    const [chip, setChip] = React.useState<ChipValue>("open");
    const [search, setSearch] = React.useState("");
    const [selectedId, setSelectedId] = React.useState(disputes[0]?.id);
    const [note, setNote] = React.useState("");

    const matchesChip = (dispute: Dispute) =>
        chip === "open"
            ? OPEN_STATUSES.includes(dispute.status)
            : chip === "escalated"
              ? dispute.status === "escalated"
              : ["resolved", "refunded", "rejected"].includes(dispute.status);

    const visible = disputes
        .filter(matchesChip)
        .filter((dispute) =>
            `${dispute.id} ${dispute.advertiser} ${dispute.publisher}`
                .toLowerCase()
                .includes(search.toLowerCase())
        );

    const selected =
        disputes.find((dispute) => dispute.id === selectedId) ?? visible[0] ?? disputes[0];

    const resolveWith = (verdict: string) => {
        if (!note.trim()) {
            toast.error("Add a resolution note first, it goes on the case record.");
            return;
        }
        toast.success(`${selected.id}: ${verdict}`, {
            description: `Note recorded and both parties notified.`,
        });
        setNote("");
    };

    return (
        <div className="space-y-5">
            <PageHeader
                title="Disputes & refunds"
                actions={
                    <Button
                        variant="outline"
                        className="bg-card"
                        onClick={() => toast.success("Dispute ledger exported")}
                    >
                        Export CSV
                    </Button>
                }
            />

            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                <KpiCard stat={{ id: "open", label: "Open disputes", value: String(summary.open) }} />
                <KpiCard
                    stat={{
                        id: "risk",
                        label: "Value at risk",
                        value: formatCompactINR(summary.valueAtRisk),
                    }}
                />
                <KpiCard
                    stat={{
                        id: "sla",
                        label: "SLA breaches",
                        value: String(summary.slaBreaches),
                        deltaTone: "negative",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "avg",
                        label: "Avg resolution",
                        value: `${summary.avgResolutionDays} days`,
                    }}
                />
                <KpiCard
                    stat={{
                        id: "refunded",
                        label: "Refunded this month",
                        value: formatCompactINR(summary.refundedThisMonth),
                    }}
                />
                <KpiCard
                    stat={{
                        id: "rejected",
                        label: "Rejected this month",
                        value: String(summary.rejectedThisMonth),
                    }}
                />
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
                {/* Queue */}
                <Card className="flex flex-col overflow-hidden rounded-lg border-border shadow-none">
                    <div className="space-y-3 border-b p-4">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Search disputes"
                                className="h-9 pl-8"
                            />
                        </div>
                        <FilterChips<ChipValue>
                            value={chip}
                            onChange={setChip}
                            chips={[
                                { value: "open", label: "Open" },
                                { value: "escalated", label: "Escalated" },
                                { value: "resolved", label: "Resolved" },
                            ]}
                        />
                    </div>
                    <ul className="flex-1 divide-y overflow-y-auto">
                        {visible.map((dispute) => {
                            const active = dispute.id === selected?.id;
                            return (
                                <li key={dispute.id}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedId(dispute.id)}
                                        className={cn(
                                            "w-full px-4 py-3 text-left transition-colors",
                                            active ? "bg-primary/[0.04]" : "hover:bg-muted/50"
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm font-semibold text-foreground">
                                                {dispute.id}
                                            </span>
                                            <StatusBadge status={DISPUTE_STATUS_META[dispute.status]} />
                                        </div>
                                        <div className="mt-1 flex items-center justify-between gap-2">
                                            <span className="truncate text-xs text-muted-foreground">
                                                {dispute.advertiser}
                                            </span>
                                            <span className="shrink-0 text-xs text-muted-foreground">
                                                {dispute.ageDays}d old
                                            </span>
                                        </div>
                                        <p className="mt-0.5 text-xs font-medium text-foreground">
                                            {formatINR(dispute.amount)}
                                        </p>
                                    </button>
                                </li>
                            );
                        })}
                        {visible.length === 0 && (
                            <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                                No disputes match.
                            </li>
                        )}
                    </ul>
                </Card>

                {/* Detail */}
                {selected && (
                    <div className="space-y-4 xl:col-span-2">
                        <Card className="rounded-lg border-border p-5 shadow-none">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-2.5">
                                        <h2 className="text-lg font-semibold text-foreground">
                                            {selected.id}
                                        </h2>
                                        {selected.slaNote && (
                                            <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger">
                                                {selected.slaNote}
                                            </span>
                                        )}
                                    </div>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {selected.orderRef} · {selected.advertiser} · {selected.site} ·
                                        Filed {selected.filedAt}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                        Disputed amount
                                    </p>
                                    <p className="text-metric text-foreground">
                                        {formatINR(selected.amount)}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-5 grid gap-5 lg:grid-cols-2">
                                <div>
                                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        Reason
                                    </h3>
                                    <p className="mt-2 text-sm font-medium text-foreground">
                                        {selected.reason}
                                    </p>
                                    <p className="mt-1.5 text-sm text-muted-foreground">
                                        {selected.detail}
                                    </p>

                                    {selected.publisherResponse && (
                                        <div className="mt-5">
                                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                Publisher response
                                            </h3>
                                            <div className="mt-2 rounded-lg bg-muted/60 p-3">
                                                <p className="text-xs font-medium text-foreground">
                                                    {selected.publisherResponse.by}{" "}
                                                    <span className="font-normal text-muted-foreground">
                                                        {selected.publisherResponse.repliedAt}
                                                    </span>
                                                </p>
                                                <p className="mt-1.5 text-sm text-foreground">
                                                    {selected.publisherResponse.body}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        Evidence
                                    </h3>
                                    <ul className="mt-2 space-y-2">
                                        {selected.evidence.map((item) => (
                                            <li key={item.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => toast.info(`${item.fileName} opens in the viewer.`)}
                                                    className="flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/50"
                                                >
                                                    <span className="flex size-9 items-center justify-center rounded-md bg-muted">
                                                        {item.kind === "IMG" ? (
                                                            <FileImage className="size-4 text-muted-foreground" />
                                                        ) : (
                                                            <FileText className="size-4 text-muted-foreground" />
                                                        )}
                                                    </span>
                                                    <span className="min-w-0">
                                                        <span className="block truncate text-sm font-medium text-foreground">
                                                            {item.fileName}
                                                        </span>
                                                        <span className="block text-xs text-muted-foreground">
                                                            {item.uploadedAt}
                                                        </span>
                                                    </span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </Card>

                        <Card className="rounded-lg border-border p-5 shadow-none">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Resolution
                            </h3>
                            <Textarea
                                value={note}
                                onChange={(event) => setNote(event.target.value)}
                                placeholder="Add a resolution note for the case record…"
                                className="mt-3 min-h-20 resize-none"
                            />
                            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                                <Button
                                    variant="outline"
                                    className="bg-card text-danger hover:text-danger"
                                    onClick={() => resolveWith("Dispute rejected")}
                                >
                                    Reject dispute
                                </Button>
                                <Button
                                    variant="outline"
                                    className="bg-card"
                                    onClick={() => resolveWith("Partial refund issued")}
                                >
                                    Partial refund
                                </Button>
                                <Button onClick={() => resolveWith("Refunded in full")}>
                                    Refund in full
                                </Button>
                            </div>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
}
