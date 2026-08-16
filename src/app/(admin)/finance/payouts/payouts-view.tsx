"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FilterChips } from "@/components/adx/filter-chips";
import { KpiCard } from "@/components/adx/kpi-card";
import { PageHeader } from "@/components/adx/page-header";
import { SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatCompactINR, formatINR } from "@/lib/format";
import {
    PAYOUT_BATCH_STATUS_META,
    type PayoutBatch,
    type PayoutBatchStatus,
} from "@/types";

interface PayoutsViewProps {
    batches: PayoutBatch[];
}

type ChipValue = "all" | Extract<PayoutBatchStatus, "completed" | "processing" | "failed">;

export function PayoutsView({ batches }: PayoutsViewProps) {
    const [chip, setChip] = React.useState<ChipValue>("all");

    const settled = batches.filter((batch) => batch.status === "completed");
    const processing = batches.filter((batch) => batch.status === "processing");
    const failed = batches.filter((batch) => batch.status === "failed");
    const totalPaid = settled.reduce((sum, batch) => sum + batch.amount, 0);

    const visible =
        chip === "all" ? batches : batches.filter((batch) => batch.status === chip);

    return (
        <div className="space-y-5">
            <PageHeader
                title="Payouts"
                subtitle="Weekly publisher and agent settlement runs"
                actions={
                    <>
                        <Button
                            variant="outline"
                            className="bg-card"
                            onClick={() => toast.success("Payout ledger exported")}
                        >
                            Export
                        </Button>
                        <Button asChild>
                            <Link href="/finance/payouts/batch">Run payout batch</Link>
                        </Button>
                    </>
                }
            />

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                    stat={{
                        id: "paid",
                        label: "Settled this month",
                        value: formatCompactINR(totalPaid),
                        hint: `${settled.length} batches`,
                    }}
                />
                <KpiCard
                    stat={{
                        id: "processing",
                        label: "Processing",
                        value: String(processing.length),
                        hint: processing[0]?.scheduledFor,
                    }}
                />
                <KpiCard
                    stat={{
                        id: "failed",
                        label: "Failed",
                        value: String(failed.length),
                        deltaTone: failed.length ? "negative" : "neutral",
                        hint: failed.length ? "needs retry" : "all clear",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "next",
                        label: "Next scheduled run",
                        value: "Fri 6 PM",
                        hint: "IST · weekly cadence",
                    }}
                />
            </div>

            <FilterChips<ChipValue>
                value={chip}
                onChange={setChip}
                chips={[
                    { value: "all", label: "All", count: batches.length },
                    { value: "completed", label: "Completed", count: settled.length },
                    { value: "processing", label: "Processing", count: processing.length },
                    { value: "failed", label: "Failed", count: failed.length },
                ]}
            />

            <SimpleTable<PayoutBatch>
                rows={visible}
                rowKey={(batch) => batch.id}
                emptyMessage="No payout batches in this state."
                columns={[
                    {
                        key: "batch",
                        label: "Batch",
                        render: (batch) => (
                            <Link
                                href={batch.status === "draft" ? "/finance/payouts/batch" : "/finance/payouts"}
                                className="font-medium text-foreground underline-offset-4 hover:underline"
                            >
                                #{batch.number}
                            </Link>
                        ),
                    },
                    {
                        key: "payouts",
                        label: "Payouts",
                        render: (batch) => `${batch.payouts} recipients`,
                    },
                    {
                        key: "amount",
                        label: "Amount",
                        render: (batch) => (
                            <span className="font-medium">{formatINR(batch.amount)}</span>
                        ),
                    },
                    {
                        key: "when",
                        label: "Run",
                        render: (batch) => (
                            <span className="text-muted-foreground">
                                {batch.completedAt ?? batch.scheduledFor ?? "-"}
                            </span>
                        ),
                    },
                    {
                        key: "status",
                        label: "Status",
                        render: (batch) => (
                            <StatusBadge status={PAYOUT_BATCH_STATUS_META[batch.status]} />
                        ),
                    },
                ]}
            />
        </div>
    );
}
