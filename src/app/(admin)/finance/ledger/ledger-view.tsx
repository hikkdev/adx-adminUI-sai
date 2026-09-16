"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, RotateCcw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { formatDateTime, formatMoney, isZeroMoney, sumMoney } from "@/lib/format";
import {
    LEDGER_KIND_LABEL,
    WALLET_KIND_LABEL,
    financeService,
    shortId,
    type LedgerHealth,
    type LedgerTransaction,
    type WalletRow,
} from "@/services/finance";
import type { StatusMeta } from "@/types";

interface LedgerViewProps {
    transactions: LedgerTransaction[];
    health: LedgerHealth;
    wallets: WalletRow[];
    walletId: string;
    onWalletChange: (walletId: string) => void;
    onChanged: () => void;
}

/**
 * The books.
 *
 * Every movement of money on ADX is a transaction whose legs sum to zero: a
 * wallet account is signed from the party's point of view, `platform:payables`
 * is its mirror. That invariant is the only reason anyone can trust a balance,
 * so the legs are shown rather than summarised — a screen that shows only the
 * amount is a screen that cannot be used to find out why the amount is wrong.
 *
 * Nothing here deletes. A posting that should not have been made is corrected
 * by a REVERSAL, which is a fresh transaction mirroring the original, and the
 * backend refuses to reverse a reversal. That is why "Reverse" asks for a
 * reason and produces a new row rather than removing one.
 */

const KIND_TONE: Record<string, StatusMeta["tone"]> = {
    REVERSAL: "danger",
    PAYOUT: "info",
    PUBLISHER_EARNING: "success",
    AGENT_INCENTIVE: "success",
    PENALTY: "warning",
    EXPIRY: "warning",
    ADJUSTMENT: "warning",
};

/**
 * The health check, told straight.
 *
 * Green only when the backend says `healthy`. When it does not, the two failure
 * modes are named separately because they mean different things: an unbalanced
 * transaction is a bug in whatever posted it, and wallet drift is a balance
 * that no longer matches the legs behind it. Both name the row so somebody can
 * go and look.
 */
function HealthPanel({ health }: { health: LedgerHealth }) {
    if (health.healthy) {
        return (
            <Card className="rounded-lg border-success/40 bg-success-soft p-4 shadow-none">
                <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    <div>
                        <p className="text-sm font-medium text-foreground">The books balance</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            Every transaction&rsquo;s legs sum to zero, and every wallet balance agrees
                            with its ledger account.
                        </p>
                    </div>
                </div>
            </Card>
        );
    }

    return (
        <Card className="rounded-lg border-danger/40 bg-danger-soft p-4 shadow-none">
            <div className="flex items-start gap-3">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                <div className="min-w-0 space-y-3">
                    <div>
                        <p className="text-sm font-medium text-foreground">The books do not balance</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            Until this is cleared, no balance on any finance screen can be relied on.
                        </p>
                    </div>

                    {health.unbalanced.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {health.unbalanced.length} unbalanced{" "}
                                {health.unbalanced.length === 1 ? "transaction" : "transactions"}
                            </p>
                            <ul className="mt-1.5 space-y-1">
                                {health.unbalanced.map((row) => (
                                    <li key={row.transactionId} className="text-sm text-foreground">
                                        <span className="font-mono text-xs">{row.transactionId}</span> — legs
                                        sum to{" "}
                                        <span className="font-medium tabular-nums">
                                            {formatMoney(row.total)}
                                        </span>{" "}
                                        instead of zero
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {health.drift.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {health.drift.length}{" "}
                                {health.drift.length === 1 ? "wallet has" : "wallets have"} drifted from
                                the ledger
                            </p>
                            <ul className="mt-1.5 space-y-1">
                                {health.drift.map((row) => (
                                    <li key={row.walletId} className="text-sm text-foreground">
                                        <Link
                                            href={`/finance/wallets/${row.walletId}`}
                                            className="font-medium underline underline-offset-2"
                                        >
                                            {shortId(row.walletId, "WLT-")}
                                        </Link>{" "}
                                        — wallet says{" "}
                                        <span className="tabular-nums">{formatMoney(row.walletTotal)}</span>,
                                        the ledger says{" "}
                                        <span className="tabular-nums">{formatMoney(row.ledgerTotal)}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        </Card>
    );
}

export function LedgerView({
    transactions,
    health,
    wallets,
    walletId,
    onWalletChange,
    onChanged,
}: LedgerViewProps) {
    const [reversing, setReversing] = React.useState<LedgerTransaction | null>(null);
    const [reason, setReason] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    async function confirmReverse() {
        if (!reversing || !reason.trim()) return;
        setBusy(true);
        try {
            const created = await financeService.reverseTransaction(reversing.id, reason.trim());
            toast.success(`${reversing.reference} reversed`, {
                description: `Posted as ${created.reference}. The original stays on the record.`,
            });
            setReversing(null);
            setReason("");
            onChanged();
        } catch (cause) {
            toast.error(
                cause instanceof ApiError ? cause.message : "Could not reverse that transaction."
            );
        } finally {
            setBusy(false);
        }
    }

    const walletItems = React.useMemo(
        () => [
            { label: "Every wallet", value: "", description: "The whole book" },
            ...wallets.map((wallet) => ({
                label: wallet.owner,
                value: wallet.id,
                description: `${WALLET_KIND_LABEL[wallet.kind]} · ${
                    wallet.displayId ?? shortId(wallet.id, "WLT-")
                }`,
                group: WALLET_KIND_LABEL[wallet.kind],
            })),
        ],
        [wallets]
    );

    return (
        <div className="space-y-5">
            <PageHeader
                title="Ledger"
                subtitle="Double-entry, append-only. Every transaction's legs sum to zero, and nothing is ever deleted."
            />

            <HealthPanel health={health} />

            <SectionCard
                title="Filter"
                description="Narrow the book to one party's wallet account."
                contentClassName="max-w-md"
            >
                <Combobox
                    items={walletItems}
                    value={walletId}
                    onValueChange={onWalletChange}
                    placeholder="Every wallet"
                    searchPlaceholder="Search parties…"
                    emptyText="No wallet matches that."
                />
            </SectionCard>

            {transactions.length === 0 ? (
                <Card className="rounded-lg border-border shadow-none">
                    <EmptyState
                        icon={RotateCcw}
                        title="Nothing posted"
                        description={
                            walletId
                                ? "No transaction has touched this wallet's account yet."
                                : "The ledger is empty. It fills the first time money moves anywhere on ADX."
                        }
                    />
                </Card>
            ) : (
                <Card className="overflow-hidden rounded-lg border-border shadow-none">
                    <Accordion type="multiple" className="divide-y">
                        {transactions.map((transaction) => {
                            /* Displayed rather than trusted: if this is not zero the
                               transaction is one of the unbalanced ones above, and the
                               row should say so where somebody is actually looking. */
                            const legSum = sumMoney(transaction.legs.map((leg) => leg.amount));
                            const balanced = isZeroMoney(legSum);
                            const isReversal = transaction.kind === "REVERSAL";

                            return (
                                <AccordionItem
                                    key={transaction.id}
                                    value={transaction.id}
                                    className="border-b-0 px-5"
                                >
                                    <AccordionTrigger className="hover:no-underline">
                                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 pr-3">
                                            <span className="font-medium text-foreground">
                                                {transaction.reference}
                                            </span>
                                            <StatusBadge
                                                status={{
                                                    label: LEDGER_KIND_LABEL[transaction.kind],
                                                    tone: KIND_TONE[transaction.kind] ?? "neutral",
                                                }}
                                            />
                                            <span className="text-xs font-normal text-muted-foreground">
                                                {formatDateTime(transaction.occurredAt)}
                                            </span>
                                            <span className="min-w-0 flex-1 truncate text-xs font-normal text-muted-foreground">
                                                {transaction.note ?? ""}
                                            </span>
                                            {!balanced && (
                                                <StatusBadge
                                                    status={{
                                                        label: `Off by ${formatMoney(legSum)}`,
                                                        tone: "danger",
                                                    }}
                                                />
                                            )}
                                        </div>
                                    </AccordionTrigger>

                                    <AccordionContent>
                                        <div className="space-y-3 pb-1">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="border-y bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                                        <th className="px-3 py-2">Account</th>
                                                        <th className="px-3 py-2">Note</th>
                                                        <th className="px-3 py-2 text-right">Amount</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {transaction.legs.map((leg, index) => (
                                                        <tr
                                                            key={`${transaction.id}:${leg.accountCode}:${index}`}
                                                            className="border-b last:border-0"
                                                        >
                                                            <td className="px-3 py-2">
                                                                <p className="font-medium text-foreground">
                                                                    {leg.accountName}
                                                                </p>
                                                                <p className="font-mono text-xs text-muted-foreground">
                                                                    {leg.accountCode}
                                                                </p>
                                                            </td>
                                                            <td className="px-3 py-2 text-muted-foreground">
                                                                {leg.note ?? "—"}
                                                            </td>
                                                            <td
                                                                className={cn(
                                                                    "px-3 py-2 text-right font-medium tabular-nums",
                                                                    leg.amount.trimStart().startsWith("-")
                                                                        ? "text-danger"
                                                                        : "text-success"
                                                                )}
                                                            >
                                                                {formatMoney(leg.amount)}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    <tr className="bg-muted/30">
                                                        <td
                                                            className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                                                            colSpan={2}
                                                        >
                                                            Legs sum to
                                                        </td>
                                                        <td
                                                            className={cn(
                                                                "px-3 py-2 text-right font-semibold tabular-nums",
                                                                balanced ? "text-foreground" : "text-danger"
                                                            )}
                                                        >
                                                            {formatMoney(legSum)}
                                                        </td>
                                                    </tr>
                                                </tbody>
                                            </table>

                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <p className="text-xs text-muted-foreground">
                                                    {isReversal
                                                        ? `Reverses ${
                                                              transaction.reversesId
                                                                  ? shortId(transaction.reversesId, "TXN-")
                                                                  : "an earlier transaction"
                                                          }. A reversal cannot itself be reversed — post a fresh correcting entry instead.`
                                                        : "Reversing posts a mirrored transaction. The original stays on the record."}
                                                </p>
                                                {!isReversal && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="bg-card text-danger hover:text-danger"
                                                        onClick={() => {
                                                            setReason("");
                                                            setReversing(transaction);
                                                        }}
                                                    >
                                                        <RotateCcw className="mr-1.5 size-4" />
                                                        Reverse
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            );
                        })}
                    </Accordion>
                </Card>
            )}

            <ConfirmDialog
                open={reversing !== null}
                onOpenChange={(open) => !open && setReversing(null)}
                title={`Reverse ${reversing?.reference ?? "this transaction"}?`}
                description="A mirrored transaction is posted against the same accounts. The original is untouched — this is how the ledger corrects itself, and it cannot be undone by deleting anything."
                confirmLabel="Post the reversal"
                destructive
                busy={busy}
                disabled={!reason.trim()}
                onConfirm={confirmReverse}
            >
                <div className="space-y-1.5">
                    <Label htmlFor="reversal-reason">Reason</Label>
                    <Textarea
                        id="reversal-reason"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        rows={3}
                        placeholder="Why this posting should not stand. It is written onto the reversal."
                    />
                    <p className="text-xs text-muted-foreground">
                        Required. The backend refuses a reversal without one.
                    </p>
                </div>
            </ConfirmDialog>
        </div>
    );
}
