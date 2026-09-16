"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatMoney } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import {
    PAYOUT_BATCH_STATUS_META,
    financeReadsApi,
    financeService,
    type PayoutBatch,
} from "@/services/finance";

/** Three rows, as the frame draws. */
const SHOWN = 3;

/**
 * Dashboard "Payout runs" widget — the last few payout batches, read from
 * `GET /finance/payout-batches`.
 *
 * The frame's layout is kept: title, one-line subtitle, the filter box, a
 * three-row table, "View all" bottom right. A draft is not a run and is not
 * listed. The row's "…" menu is gone: it offered "Download report", which
 * called nothing, and "View batch", which is what the row itself now links
 * to. The footer's "Runs weekly · Fridays 6 PM IST" is gone too — no schedule
 * runs a batch; a person builds one and a second person approves it.
 */
export function PayoutRunsCard() {
    const live = financeReadsApi();
    const [filter, setFilter] = React.useState("");

    const resource = useApiResource<PayoutBatch[]>(`dashboard:payout-runs:${live}`, async () => {
        if (!live) return [];
        // A handful more than shown, so hiding the drafts still leaves three.
        const page = await financeService.payoutBatches({ pageSize: 10 });
        return page.items.filter((batch) => batch.status !== "DRAFT");
    });

    const needle = filter.trim().toLowerCase();
    const visible = (resource.data ?? [])
        .filter((batch) => !needle || batch.reference.toLowerCase().includes(needle))
        .slice(0, SHOWN);

    return (
        <Card className="flex flex-col rounded-lg border-border p-5 shadow-none">
            <div>
                <h2 className="text-base font-semibold text-foreground">Payout runs</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">Last three payout batches</p>
            </div>

            <div className="mt-4 flex items-center gap-2">
                <Input
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    placeholder="Filter batches…"
                    className="h-9"
                    disabled={!live}
                />
            </div>

            {!live ? (
                <p className="mt-4 text-sm text-muted-foreground">
                    Payout batches are read from the API. Nothing to show while it is off.
                </p>
            ) : resource.error ? (
                <p className="mt-4 text-sm text-muted-foreground">{resource.error}</p>
            ) : resource.data && visible.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                    {needle ? "No batch matches that." : "No batch has been run yet."}
                </p>
            ) : (
                <div className="mt-3 overflow-hidden rounded-md border">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                <th className="px-3 py-2">Status</th>
                                <th className="px-3 py-2">Batch</th>
                                <th className="px-3 py-2 text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((batch) => (
                                <tr key={batch.id} className="border-b last:border-0">
                                    <td className="px-3 py-2.5">
                                        <StatusBadge status={PAYOUT_BATCH_STATUS_META[batch.status]} />
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <Link
                                            href={`/finance/payouts/batch/${batch.id}`}
                                            className="font-medium text-foreground hover:underline"
                                        >
                                            {batch.reference}
                                        </Link>{" "}
                                        <span className="text-muted-foreground">
                                            {batch.lineCount} {batch.lineCount === 1 ? "payout" : "payouts"}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                                        {formatMoney(batch.totalNet)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="mt-auto flex items-center justify-end pt-4">
                <Button variant="outline" size="sm" className="h-8" asChild>
                    <Link href="/finance/payouts">View all</Link>
                </Button>
            </div>
        </Card>
    );
}
