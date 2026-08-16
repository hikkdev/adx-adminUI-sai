"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { PRICE_APPROVAL_STATUS_META, type PriceApproval } from "@/types";

interface ApprovalsViewProps {
    approvals: PriceApproval[];
}

export function ApprovalsView({ approvals }: ApprovalsViewProps) {
    const [selectedId, setSelectedId] = React.useState(approvals[0]?.id);
    const [note, setNote] = React.useState("");

    const selected = approvals.find((approval) => approval.id === selectedId) ?? approvals[0];

    const decide = (verdict: "approved" | "rejected") => {
        if (!note.trim() && verdict === "rejected") {
            toast.error("Add a decision note before rejecting.");
            return;
        }
        toast.success(
            `${selected.id} ${verdict === "approved" ? "approved" : "rejected"}`,
            { description: "The requesting agent has been notified." }
        );
        setNote("");
    };

    return (
        <div className="space-y-5">
            <PageHeader
                title="Price approval queue"
                subtitle="Discounts below the floor or above guardrails wait here"
            />

            <div className="grid gap-4 xl:grid-cols-3">
                {/* Deal list */}
                <Card className="h-fit overflow-hidden rounded-lg border-border shadow-none">
                    <ul className="divide-y">
                        {approvals.map((approval) => {
                            const active = approval.id === selected?.id;
                            return (
                                <li key={approval.id}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedId(approval.id)}
                                        className={cn(
                                            "w-full px-4 py-3.5 text-left transition-colors",
                                            active ? "bg-primary/[0.04]" : "hover:bg-muted/50"
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-xs text-muted-foreground">
                                                {approval.id}
                                            </span>
                                            <StatusBadge
                                                status={PRICE_APPROVAL_STATUS_META[approval.status]}
                                            />
                                        </div>
                                        <p className="mt-0.5 text-sm font-medium text-foreground">
                                            {approval.advertiser}
                                        </p>
                                        <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                                            <span className="text-muted-foreground">
                                                Discount {approval.requestedDiscount}
                                            </span>
                                            <span className="font-medium text-danger">
                                                {approval.marginImpact}
                                            </span>
                                            <span className="text-muted-foreground">{approval.age}</span>
                                        </div>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </Card>

                {/* Deal detail */}
                {selected && (
                    <div className="space-y-4 xl:col-span-2">
                        <Card className="rounded-lg border-border p-5 shadow-none">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div>
                                    <p className="text-xs text-muted-foreground">{selected.id}</p>
                                    <h2 className="mt-0.5 text-lg font-semibold text-foreground">
                                        {selected.advertiser}
                                    </h2>
                                </div>
                                <StatusBadge status={PRICE_APPROVAL_STATUS_META[selected.status]} />
                            </div>
                            <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                                {selected.facts.map(([label, value]) => (
                                    <div key={label} className="flex items-center justify-between gap-4">
                                        <dt className="text-muted-foreground">{label}</dt>
                                        <dd className="text-right font-medium text-foreground">{value}</dd>
                                    </div>
                                ))}
                            </dl>
                            <div className="mt-4 grid grid-cols-2 gap-2 border-t pt-4 sm:grid-cols-5">
                                {selected.metrics.map(([label, value]) => (
                                    <div key={label} className="rounded-md bg-muted/60 px-2.5 py-2">
                                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                            {label}
                                        </p>
                                        <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
                                            {value}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        <div className="grid gap-4 lg:grid-cols-2">
                            <Card className="overflow-hidden rounded-lg border-border shadow-none">
                                <h3 className="px-5 pb-3 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Rule trace
                                </h3>
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-y bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                            <th className="px-5 py-2">Rule</th>
                                            <th className="px-5 py-2 text-right">Effect</th>
                                            <th className="px-5 py-2 text-right">Running</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selected.ruleTrace.map((trace) => (
                                            <tr key={trace.rule} className="border-b last:border-0">
                                                <td className="px-5 py-2.5 text-foreground">{trace.rule}</td>
                                                <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">
                                                    {trace.effect}
                                                </td>
                                                <td className="px-5 py-2.5 text-right font-medium tabular-nums">
                                                    {trace.running}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </Card>

                            <Card className="rounded-lg border-border p-5 shadow-none">
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Guardrail checks
                                </h3>
                                <ul className="mt-3 space-y-3">
                                    {selected.checks.map((check) => (
                                        <li key={check.name} className="flex items-start gap-2.5">
                                            <span
                                                className={cn(
                                                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                                                    check.ok ? "bg-success-soft" : "bg-danger-soft"
                                                )}
                                            >
                                                {check.ok ? (
                                                    <Check className="size-3 text-success" />
                                                ) : (
                                                    <X className="size-3 text-danger" />
                                                )}
                                            </span>
                                            <div>
                                                <p className="text-sm font-medium text-foreground">
                                                    {check.name}
                                                </p>
                                                <p className="text-xs text-muted-foreground">{check.detail}</p>
                                            </div>
                                        </li>
                                    ))}
                                </ul>

                                <h3 className="mt-5 border-t pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Similar closed deals
                                </h3>
                                <table className="mt-2 w-full text-xs">
                                    <thead>
                                        <tr className="text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                            <th className="py-1.5">Advertiser</th>
                                            <th className="py-1.5 text-right">Discount</th>
                                            <th className="py-1.5 text-right">Closed</th>
                                            <th className="py-1.5 text-right">Margin</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selected.similarDeals.map((deal) => (
                                            <tr key={deal.advertiser} className="border-t">
                                                <td className="py-2 font-medium text-foreground">
                                                    {deal.advertiser}
                                                </td>
                                                <td className="py-2 text-right">{deal.discount}</td>
                                                <td className="py-2 text-right text-muted-foreground">
                                                    {deal.closed}
                                                </td>
                                                <td className="py-2 text-right">{deal.margin}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </Card>
                        </div>

                        <Card className="rounded-lg border-border p-5 shadow-none">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Decision
                            </h3>
                            <Textarea
                                value={note}
                                onChange={(event) => setNote(event.target.value)}
                                placeholder="Add a decision note for the deal record…"
                                className="mt-3 min-h-20 resize-none"
                            />
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                <p className="text-xs text-muted-foreground">
                                    Approvals past their SLA escalate to the Finance lead automatically.
                                </p>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        className="bg-card text-danger hover:text-danger"
                                        onClick={() => decide("rejected")}
                                    >
                                        Reject discount
                                    </Button>
                                    <Button onClick={() => decide("approved")}>Approve discount</Button>
                                </div>
                            </div>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
}
