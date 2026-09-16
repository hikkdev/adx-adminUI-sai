"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterChips } from "@/components/adx/filter-chips";
import { KpiCard } from "@/components/adx/kpi-card";
import { PageHeader } from "@/components/adx/page-header";
import { SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import {
    PAYOUT_BATCH_STATUS_META,
    RAIL_LABEL,
    financeService,
    type ListPage,
    type PayoutBatch,
    type PayoutBatchStatus,
    type PayoutSchedule,
    type WithdrawalSummary,
} from "@/services/finance";
import { cadenceLabel } from "@/services/settings";

export type BatchChip = "all" | "draft" | "processing" | "completed" | "failed" | "cancelled";

/** The chip row's vocabulary, as status lists the API takes — the list read and the export share it. */
export const BATCH_CHIPS: Record<BatchChip, PayoutBatchStatus[] | null> = {
    all: null,
    draft: ["DRAFT", "IN_REVIEW", "APPROVED"],
    processing: ["RELEASING", "RELEASED"],
    completed: ["COMPLETED"],
    failed: ["PARTIALLY_FAILED", "FAILED"],
    cancelled: ["CANCELLED"],
};

interface PayoutsViewProps {
    batches: ListPage<PayoutBatch>;
    summary: WithdrawalSummary;
    /** Lot G (Q124): null when the schedule read failed. */
    schedule: PayoutSchedule | null;
    chip: BatchChip;
    onChipChange: (chip: BatchChip) => void;
}

/**
 * The DR 10 payouts list, on the real API.
 *
 * The frame is kept — the KPI row, the chip row, the five-column table — and
 * every figure in it comes from `/finance/payout-batches` and
 * `/finance/withdrawals/summary`. Lot G (package CG4, Q124) gave the two
 * tiles that used to have no source theirs: "Settled this month" is the
 * summary's `paidThisMonth` (net PAID inside the Indian calendar month),
 * and "Next scheduled run" is `GET /finance/payout-batches/schedule` — the
 * weekly draft's next instant, with its cadence editable on
 * /finance/settings (`finance.payoutBatchCadence`). A job drafts the batch;
 * a person still submits, approves and releases it.
 *
 * "Run payout batch" creates a DRAFT and opens it. G13-B/C: the frame's
 * list-level "Export" is `GET /finance/payout-batches/export.csv` under
 * the chip in force — one CSV line per batch, the actors by name — through
 * the blob helper; the per-batch bank file stays on the batch.
 */
export function PayoutsView({ batches, summary, schedule, chip, onChipChange }: PayoutsViewProps) {
    const router = useRouter();
    const [creating, setCreating] = React.useState(false);
    const [exporting, setExporting] = React.useState(false);

    async function exportList() {
        setExporting(true);
        try {
            const { filename, bytes } = await financeService.exportPayoutBatches({ status: BATCH_CHIPS[chip] ?? undefined });
            toast.success(`${filename} downloaded`, { description: `${formatNumber(bytes)} bytes — the batches under the "${chip}" chip, one line each.` });
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not export the batches.");
        } finally {
            setExporting(false);
        }
    }

    const counts = batches.counts;
    const sum = (keys: string[]) => keys.reduce((total, key) => total + (counts[key] ?? 0), 0);
    const failedBatches = sum(["PARTIALLY_FAILED", "FAILED"]);
    const paidCount = summary.counts.PAID;

    async function runBatch() {
        setCreating(true);
        try {
            const batch = await financeService.createPayoutBatch();
            toast.success(`${batch.reference} created`, {
                description: "A draft. Pick the approved withdrawals to pay, then send it for a second pair of eyes.",
            });
            router.push(`/finance/payouts/batch/${batch.id}`);
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not create a batch.");
            setCreating(false);
        }
    }

    return (
        <div className="space-y-5">
            <PageHeader
                title="Payouts"
                subtitle="Publisher, agent and print-partner settlement runs"
                actions={
                    <>
                        <Button variant="outline" className="bg-card" onClick={exportList} disabled={exporting || batches.total === 0}>
                            <Download className="size-4" />
                            {exporting ? "Exporting…" : "Export"}
                        </Button>
                        <Button onClick={runBatch} disabled={creating}>
                            {creating ? "Creating…" : "Run payout batch"}
                        </Button>
                    </>
                }
            />

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                    stat={{
                        id: "settled",
                        label: "Settled this month",
                        value: formatMoney(summary.paidThisMonth),
                        hint: `net paid this calendar month, IST · ${paidCount} paid ${paidCount === 1 ? "withdrawal" : "withdrawals"} all time`,
                    }}
                />
                <KpiCard
                    stat={{
                        id: "processing",
                        label: "With the rail",
                        value: String(summary.counts.PROCESSING),
                        delta: summary.processingOver24h > 0 ? `${summary.processingOver24h} over 24h` : undefined,
                        deltaTone: summary.processingOver24h > 0 ? "negative" : "neutral",
                        hint: summary.processingOver24h > 0 ? "waiting for a UTR" : "released, not yet confirmed",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "failed",
                        label: "Failed batches",
                        value: String(failedBatches),
                        deltaTone: failedBatches ? "negative" : "neutral",
                        hint: failedBatches ? "lines bounced and returned to wallets" : "all clear",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "next-run",
                        label: "Next scheduled run",
                        value: schedule ? (schedule.enabled && schedule.nextRunAt ? formatDateTime(schedule.nextRunAt) : "Off") : "—",
                        hint: schedule
                            ? schedule.enabled
                                ? `${cadenceLabel(schedule)} · drafts the batch; a person releases it`
                                : "no weekly draft — switch it on under Finance settings"
                            : "the schedule could not be read",
                    }}
                />
            </div>

            {schedule?.lastDraft && (
                <p className="text-xs text-muted-foreground">
                    Last drafted by the schedule:{" "}
                    <Link href={`/finance/payouts/batch/${schedule.lastDraft.batchId}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                        {schedule.lastDraft.reference}
                    </Link>{" "}
                    · {schedule.lastDraft.lineCount} {schedule.lastDraft.lineCount === 1 ? "line" : "lines"} · {formatMoney(schedule.lastDraft.totalNet)} ·{" "}
                    {PAYOUT_BATCH_STATUS_META[schedule.lastDraft.status].label} · {formatDateTime(schedule.lastDraft.createdAt)}.{" "}
                    <Link href="/finance/settings" className="underline-offset-4 hover:underline">
                        Edit the cadence
                    </Link>
                    .
                </p>
            )}

            <FilterChips<BatchChip>
                value={chip}
                onChange={onChipChange}
                chips={[
                    { value: "all", label: "All", count: sum(Object.keys(counts)) },
                    { value: "draft", label: "Open", count: sum(["DRAFT", "IN_REVIEW", "APPROVED"]) },
                    { value: "processing", label: "Processing", count: sum(["RELEASING", "RELEASED"]) },
                    { value: "completed", label: "Completed", count: counts.COMPLETED ?? 0 },
                    { value: "failed", label: "Failed", count: failedBatches },
                    { value: "cancelled", label: "Cancelled", count: counts.CANCELLED ?? 0 },
                ]}
            />

            <SimpleTable<PayoutBatch>
                rows={batches.items}
                rowKey={(batch) => batch.id}
                emptyMessage="No payout batches in this state."
                columns={[
                    {
                        key: "batch",
                        label: "Batch",
                        render: (batch) => (
                            <Link
                                href={`/finance/payouts/batch/${batch.id}`}
                                className="font-medium text-foreground underline-offset-4 hover:underline"
                            >
                                {batch.reference}
                            </Link>
                        ),
                    },
                    {
                        key: "payouts",
                        label: "Payouts",
                        render: (batch) => `${batch.lineCount} ${batch.lineCount === 1 ? "recipient" : "recipients"}`,
                    },
                    {
                        key: "amount",
                        label: "Amount",
                        render: (batch) => (
                            <span className="font-medium tabular-nums">{formatMoney(batch.totalNet)}</span>
                        ),
                    },
                    {
                        key: "rail",
                        label: "Rail",
                        render: (batch) => <span className="text-muted-foreground">{RAIL_LABEL[batch.rail]}</span>,
                    },
                    {
                        key: "when",
                        label: "Run",
                        render: (batch) => (
                            <span className="text-muted-foreground">
                                {batch.completedAt
                                    ? `Completed ${formatDateTime(batch.completedAt)}`
                                    : batch.releasedAt
                                      ? `Released ${formatDateTime(batch.releasedAt)}`
                                      : batch.scheduledFor
                                        ? `Scheduled ${formatDateTime(batch.scheduledFor)}`
                                        : `Created ${formatDateTime(batch.createdAt)}`}
                            </span>
                        ),
                    },
                    {
                        key: "status",
                        label: "Status",
                        render: (batch) => <StatusBadge status={PAYOUT_BATCH_STATUS_META[batch.status]} />,
                    },
                ]}
            />
        </div>
    );
}
