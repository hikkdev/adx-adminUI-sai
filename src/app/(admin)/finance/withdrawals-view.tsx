"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { FieldList } from "@/components/adx/simple-table";
import { formatINR } from "@/lib/format";
import {
    RISK_LEVEL_META,
    WITHDRAWAL_STATUS_META,
    type Withdrawal,
} from "@/types";

interface WithdrawalsViewProps {
    withdrawals: Withdrawal[];
}

const checkTone = { pass: "success", fail: "danger", manual: "warning" } as const;

export function WithdrawalsView({ withdrawals: initial }: WithdrawalsViewProps) {
    const [withdrawals, setWithdrawals] = React.useState(initial);
    const [selectedId, setSelectedId] = React.useState(initial[0]?.id);
    const [confirm, setConfirm] = React.useState<"approve" | "reject" | null>(null);

    const selected = withdrawals.find((withdrawal) => withdrawal.id === selectedId);
    const pending = withdrawals.filter((withdrawal) => withdrawal.status === "pending");

    const resolve = (action: "approve" | "reject") => {
        if (!selected) return;
        setWithdrawals((current) =>
            current.map((withdrawal) =>
                withdrawal.id === selected.id
                    ? { ...withdrawal, status: action === "approve" ? "approved" : "rejected" }
                    : withdrawal
            )
        );
        toast.success(
            `${formatINR(selected.amount)} ${action === "approve" ? "approved for" : "rejected for"} ${selected.requester}`
        );
        setConfirm(null);
    };

    return (
        <div className="space-y-5">
            <PageHeader
                title="Withdrawal approvals"
                subtitle={`${pending.length} requests pending review`}
            />

            <div className="grid gap-4 xl:grid-cols-3">
                {/* Master list */}
                <Card className="overflow-hidden rounded-lg border-border shadow-none">
                    <ul className="divide-y">
                        {withdrawals.map((withdrawal) => {
                            const active = withdrawal.id === selectedId;
                            return (
                                <li key={withdrawal.id}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedId(withdrawal.id)}
                                        className={cn(
                                            "w-full px-4 py-3.5 text-left transition-colors",
                                            active ? "bg-primary/[0.04]" : "hover:bg-muted/50"
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <InitialsAvatar name={withdrawal.requester} size="md" />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="truncate text-sm font-medium text-foreground">
                                                        {withdrawal.requester}
                                                    </p>
                                                    <span className="text-sm font-semibold text-foreground">
                                                        {formatINR(withdrawal.amount)}
                                                    </span>
                                                </div>
                                                <div className="mt-0.5 flex items-center justify-between gap-2">
                                                    <p className="text-xs text-muted-foreground">
                                                        {withdrawal.requesterRole} · Requested{" "}
                                                        {withdrawal.requestedAgo}
                                                    </p>
                                                    <StatusBadge
                                                        status={
                                                            withdrawal.status === "pending"
                                                                ? RISK_LEVEL_META[withdrawal.risk]
                                                                : WITHDRAWAL_STATUS_META[withdrawal.status]
                                                        }
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </Card>

                {/* Detail pane */}
                {selected && (
                    <div className="space-y-4 xl:col-span-2">
                        <Card className="rounded-lg border-border p-5 shadow-none">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div>
                                    <h2 className="text-lg font-semibold text-foreground">
                                        {selected.requester}
                                    </h2>
                                    <p className="mt-0.5 text-sm text-muted-foreground">
                                        {selected.requesterRole}, {selected.region}, Member since{" "}
                                        {selected.memberSince}
                                    </p>
                                    <p className="mt-3 text-metric text-foreground">
                                        {formatINR(selected.amount)}
                                    </p>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        to {selected.destination}
                                    </p>
                                </div>
                                {selected.status === "pending" ? (
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            className="bg-card text-danger hover:text-danger"
                                            onClick={() => setConfirm("reject")}
                                        >
                                            <X className="mr-1.5 size-4" />
                                            Reject
                                        </Button>
                                        <Button onClick={() => setConfirm("approve")}>
                                            <Check className="mr-1.5 size-4" />
                                            Approve payout
                                        </Button>
                                    </div>
                                ) : (
                                    <StatusBadge status={WITHDRAWAL_STATUS_META[selected.status]} />
                                )}
                            </div>
                        </Card>

                        <div className="grid gap-4 lg:grid-cols-2">
                            <Card className="rounded-lg border-border p-5 shadow-none">
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Risk assessment
                                </h3>
                                <ul className="mt-3 space-y-3">
                                    {selected.riskChecks.map((check) => (
                                        <li key={check.label} className="flex items-start gap-3">
                                            <span
                                                className={cn(
                                                    "mt-1 size-2 shrink-0 rounded-full",
                                                    check.result === "pass" && "bg-success",
                                                    check.result === "fail" && "bg-danger",
                                                    check.result === "manual" && "bg-warning"
                                                )}
                                            />
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-foreground">
                                                    {check.label}
                                                </p>
                                                <p className="text-xs text-muted-foreground">{check.detail}</p>
                                            </div>
                                            <StatusBadge
                                                className="ml-auto"
                                                status={{
                                                    label:
                                                        check.result === "pass"
                                                            ? "Pass"
                                                            : check.result === "fail"
                                                              ? "Fail"
                                                              : "Review",
                                                    tone: checkTone[check.result],
                                                }}
                                            />
                                        </li>
                                    ))}
                                </ul>
                            </Card>

                            <Card className="rounded-lg border-border p-5 shadow-none">
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    {selected.requesterRole} context
                                </h3>
                                <FieldList
                                    className="mt-3"
                                    items={[
                                        ["Wallet balance", formatINR(selected.availableBalance)],
                                        ["Total withdrawn (12 mo)", formatINR(selected.totalWithdrawn12m)],
                                        ["Average withdrawal", formatINR(selected.averageWithdrawal)],
                                        ["Member since", selected.memberSince],
                                    ]}
                                />
                            </Card>
                        </div>

                        <Card className="overflow-hidden rounded-lg border-border shadow-none">
                            <h3 className="px-5 pb-3 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Withdrawal history
                            </h3>
                            {selected.history.length ? (
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-y bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                            <th className="px-5 py-2">Date</th>
                                            <th className="px-5 py-2">Amount</th>
                                            <th className="px-5 py-2">Method</th>
                                            <th className="px-5 py-2">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selected.history.map((entry) => (
                                            <tr key={entry.id} className="border-b last:border-0">
                                                <td className="px-5 py-2.5 text-muted-foreground">{entry.date}</td>
                                                <td className="px-5 py-2.5 font-medium">
                                                    {formatINR(entry.amount)}
                                                </td>
                                                <td className="px-5 py-2.5 text-muted-foreground">
                                                    {entry.method}
                                                </td>
                                                <td className="px-5 py-2.5">
                                                    <StatusBadge
                                                        status={{ label: "Completed", tone: "success" }}
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <p className="px-5 pb-5 text-sm text-muted-foreground">
                                    First withdrawal from this account.
                                </p>
                            )}
                        </Card>
                    </div>
                )}
            </div>

            <ConfirmDialog
                open={confirm !== null}
                onOpenChange={(open) => !open && setConfirm(null)}
                title={confirm === "approve" ? "Approve this payout?" : "Reject this withdrawal?"}
                description={
                    confirm === "approve"
                        ? `${formatINR(selected?.amount ?? 0)} will be released to ${selected?.destination}. This cannot be recalled once processed.`
                        : `${selected?.requester} will be notified and the amount returned to their wallet.`
                }
                confirmLabel={confirm === "approve" ? "Approve payout" : "Reject withdrawal"}
                destructive={confirm === "reject"}
                onConfirm={() => resolve(confirm!)}
            />
        </div>
    );
}
