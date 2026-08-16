"use client";

import * as React from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilterChips } from "@/components/adx/filter-chips";
import { KpiCard } from "@/components/adx/kpi-card";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import type { StatusMeta } from "@/types";

type MatchStatus = "matched" | "unmatched" | "differs" | "ignored";

const matchMeta: Record<MatchStatus, StatusMeta> = {
    matched: { label: "Matched", tone: "success" },
    unmatched: { label: "Unmatched", tone: "danger" },
    differs: { label: "Amount differs", tone: "warning" },
    ignored: { label: "Ignored", tone: "neutral" },
};

interface ReconRow {
    id: string;
    bank?: { date: string; description: string; amount: string };
    ledger?: { reference: string; kind: string; amount: string };
    status: MatchStatus;
}

const reconRows: ReconRow[] = [
    { id: "r1", bank: { date: "22 Apr", description: "NEFT ADX PAYOUT BATCH 88", amount: "₹6,20,000" }, ledger: { reference: "BATCH-88", kind: "Payout", amount: "₹6,20,000" }, status: "matched" },
    { id: "r2", bank: { date: "22 Apr", description: "IMPS ZOMATO MEDIA PVT", amount: "₹5,42,800" }, ledger: { reference: "INV-2026-0412", kind: "Collection", amount: "₹5,42,800" }, status: "matched" },
    { id: "r3", bank: { date: "22 Apr", description: "UPI CRED CLUB 88291", amount: "₹1,12,000" }, status: "unmatched" },
    { id: "r4", bank: { date: "21 Apr", description: "NEFT PHONEPE PVT LTD", amount: "₹3,71,700" }, ledger: { reference: "INV-2026-0409", kind: "Collection", amount: "₹3,71,700" }, status: "matched" },
    { id: "r5", bank: { date: "21 Apr", description: "IMPS SWIGGY LIMITED", amount: "₹6,04,000" }, ledger: { reference: "INV-2026-0322", kind: "Collection", amount: "₹6,04,160" }, status: "differs" },
    { id: "r6", bank: { date: "21 Apr", description: "NEFT ADX PAYOUT BATCH 87", amount: "₹5,84,500" }, ledger: { reference: "BATCH-87", kind: "Payout", amount: "₹5,84,500" }, status: "matched" },
    { id: "r7", ledger: { reference: "REF-20419", kind: "Refund", amount: "₹48,000" }, status: "unmatched" },
];

type ChipValue = "all" | MatchStatus;

export function ReconciliationView() {
    const [chip, setChip] = React.useState<ChipValue>("all");

    const countBy = (status: MatchStatus) =>
        reconRows.filter((row) => row.status === status).length;

    const visible =
        chip === "all" ? reconRows : reconRows.filter((row) => row.status === chip);

    const matchedCount = countBy("matched");

    return (
        <div className="space-y-5">
            <PageHeader
                title="Reconciliation"
                subtitle="Bank statement versus platform ledger, HDFC ••8912 current account"
                actions={
                    <>
                        <Button
                            variant="outline"
                            className="bg-card"
                            onClick={() => toast.success("Reconciliation report exported")}
                        >
                            Export
                        </Button>
                        <Button
                            onClick={() =>
                                toast.success(`${matchedCount} matches confirmed`, {
                                    description: "Matched entries are locked into the ledger.",
                                })
                            }
                        >
                            Confirm matches ({matchedCount})
                        </Button>
                    </>
                }
            />

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard stat={{ id: "bank", label: "Bank entries", value: "22", hint: "22 Apr statement" }} />
                <KpiCard stat={{ id: "auto", label: "Auto-matched", value: "18", delta: "82%", deltaTone: "positive", hint: "match rate" }} />
                <KpiCard stat={{ id: "open", label: "Needs attention", value: "4", deltaTone: "negative", hint: "2 unmatched, 1 differs" }} />
                <KpiCard stat={{ id: "value", label: "Unreconciled value", value: "₹1,60,160", hint: "across open items" }} />
            </div>

            <FilterChips<ChipValue>
                value={chip}
                onChange={setChip}
                chips={[
                    { value: "all", label: "All", count: reconRows.length },
                    { value: "matched", label: "Matched", count: matchedCount },
                    { value: "unmatched", label: "Unmatched", count: countBy("unmatched") },
                    { value: "differs", label: "Amount differs", count: countBy("differs") },
                    { value: "ignored", label: "Ignored", count: countBy("ignored") },
                ]}
            />

            <Card className="overflow-hidden rounded-lg border-border shadow-none">
                <div className="grid grid-cols-[1fr_1fr_150px] border-b bg-muted/50 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <div className="border-r px-5 py-2.5">Bank statement</div>
                    <div className="border-r px-5 py-2.5">Platform ledger</div>
                    <div className="px-5 py-2.5">Status</div>
                </div>
                {visible.map((row) => (
                    <div
                        key={row.id}
                        className="grid grid-cols-[1fr_1fr_150px] items-center border-b text-sm last:border-0"
                    >
                        <div className="border-r px-5 py-3.5">
                            {row.bank ? (
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <p className="font-medium text-foreground">{row.bank.description}</p>
                                        <p className="text-xs text-muted-foreground">{row.bank.date}</p>
                                    </div>
                                    <span className="font-medium tabular-nums">{row.bank.amount}</span>
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground/60">No bank entry</p>
                            )}
                        </div>
                        <div className="border-r px-5 py-3.5">
                            {row.ledger ? (
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <p className="font-medium text-foreground">{row.ledger.reference}</p>
                                        <p className="text-xs text-muted-foreground">{row.ledger.kind}</p>
                                    </div>
                                    <span
                                        className={cn(
                                            "font-medium tabular-nums",
                                            row.status === "differs" && "text-warning"
                                        )}
                                    >
                                        {row.ledger.amount}
                                    </span>
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground/60">No ledger entry</p>
                            )}
                        </div>
                        <div className="flex items-center justify-between gap-2 px-5 py-3.5">
                            <StatusBadge status={matchMeta[row.status]} />
                            {row.status !== "matched" && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => toast.success("Opened manual match")}
                                >
                                    Resolve
                                </Button>
                            )}
                        </div>
                    </div>
                ))}
            </Card>
        </div>
    );
}
