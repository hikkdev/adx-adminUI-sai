"use client";

import * as React from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FilterChips } from "@/components/adx/filter-chips";
import { FieldList, SimpleTable, type SimpleColumn } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime, formatMoney } from "@/lib/format";
import {
    GATEWAY_LABEL,
    PAYMENT_GATEWAYS,
    PAYMENT_STATUSES,
    PAYMENT_STATUS_META,
    REFUND_STATUS_META,
    canRefund,
    paymentTarget,
    paymentsService,
    refundProblem,
    type Payment,
    type PaymentGateway,
    type PaymentStatus,
    type PaymentsPage,
} from "@/services/payments";

interface PaymentsViewProps {
    page: PaymentsPage;
    status: PaymentStatus | "ALL";
    onStatusChange: (status: PaymentStatus | "ALL") => void;
    gateway: PaymentGateway | "ALL";
    onGatewayChange: (gateway: PaymentGateway | "ALL") => void;
    q: string;
    onSearch: (q: string) => void;
    onChanged: () => void;
}

export function PaymentsView({
    page,
    status,
    onStatusChange,
    gateway,
    onGatewayChange,
    q,
    onSearch,
    onChanged,
}: PaymentsViewProps) {
    const [open, setOpen] = React.useState<Payment | null>(null);
    const [refunding, setRefunding] = React.useState<Payment | null>(null);
    const total = Object.values(page.counts).reduce((sum, count) => sum + count, 0);

    const columns: SimpleColumn<Payment>[] = [
        {
            key: "reference",
            label: "Reference",
            render: (row) => (
                <button type="button" onClick={() => setOpen(row)} className="text-left font-medium text-foreground hover:underline">
                    {row.reference}
                    <span className="block text-xs font-normal text-muted-foreground">{formatDateTime(row.createdAt)}</span>
                </button>
            ),
        },
        {
            key: "gateway",
            label: "Gateway",
            render: (row) => (
                <div className="min-w-0">
                    <span className="block">{GATEWAY_LABEL[row.gateway]}</span>
                    <span className="block truncate font-mono text-xs text-muted-foreground" title={row.gatewayPaymentId ?? row.gatewayOrderId ?? undefined}>
                        {row.gatewayPaymentId ?? row.gatewayOrderId ?? "No gateway id yet"}
                    </span>
                </div>
            ),
        },
        {
            key: "target",
            label: "For",
            render: (row) => {
                const target = paymentTarget(row);
                return target.href ? (
                    <Link href={target.href} className="text-foreground underline-offset-4 hover:underline">
                        {target.label}
                    </Link>
                ) : (
                    <span className="text-muted-foreground">{target.label}</span>
                );
            },
        },
        {
            key: "advertiser",
            label: "Advertiser",
            render: (row) => (
                <Link href={`/advertisers/${row.advertiserId}`} className="font-mono text-xs text-foreground underline-offset-4 hover:underline">
                    {row.advertiserId}
                </Link>
            ),
        },
        {
            key: "amount",
            label: "Amount",
            className: "text-right",
            render: (row) => (
                <span className="tabular-nums">
                    {formatMoney(row.amount)}
                    {row.refunds.length > 0 && (
                        <span className="block text-xs text-muted-foreground">{formatMoney(row.refundable)} left</span>
                    )}
                </span>
            ),
        },
        {
            key: "status",
            label: "Status",
            render: (row) => <StatusBadge status={PAYMENT_STATUS_META[row.status]} />,
        },
        {
            key: "actions",
            label: "",
            className: "w-28 text-right",
            render: (row) =>
                canRefund(row) ? (
                    <Button size="sm" variant="outline" className="h-7 bg-card" onClick={() => setRefunding(row)}>
                        Refund
                    </Button>
                ) : null,
        },
    ];

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <FilterChips<PaymentStatus | "ALL">
                    value={status}
                    onChange={onStatusChange}
                    chips={[
                        { value: "ALL", label: "All", count: total },
                        ...PAYMENT_STATUSES.map((value) => ({
                            value,
                            label: PAYMENT_STATUS_META[value].label,
                            count: page.counts[value] ?? 0,
                        })),
                    ]}
                />
                <div className="ml-auto flex flex-wrap items-center gap-2">
                    <Select value={gateway} onValueChange={(value) => onGatewayChange(value as PaymentGateway | "ALL")}>
                        <SelectTrigger className="h-8 w-40" aria-label="Gateway">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Every gateway</SelectItem>
                            {PAYMENT_GATEWAYS.map((value) => (
                                <SelectItem key={value} value={value}>
                                    {GATEWAY_LABEL[value]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <div className="relative w-full sm:w-56">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={q}
                            onChange={(event) => onSearch(event.target.value)}
                            placeholder="Reference or gateway id"
                            className="h-8 pl-9"
                            aria-label="Search payments"
                        />
                    </div>
                </div>
            </div>

            <SimpleTable
                columns={columns}
                rows={page.items}
                rowKey={(row) => row.id}
                emptyMessage="No payments match. A row appears the moment an advertiser opens a gateway checkout."
            />
            {page.total > page.items.length && (
                <p className="text-xs text-muted-foreground">
                    Showing the newest {page.items.length} of {page.total}. Narrow with a status or a search.
                </p>
            )}

            <PaymentDialog payment={open} onOpenChange={(next) => !next && setOpen(null)} onRefund={setRefunding} />
            <RefundDialog
                payment={refunding}
                onOpenChange={(next) => !next && setRefunding(null)}
                onDone={() => {
                    setRefunding(null);
                    setOpen(null);
                    onChanged();
                }}
            />
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* One payment                                                         */
/* ------------------------------------------------------------------ */

function PaymentDialog({
    payment,
    onOpenChange,
    onRefund,
}: {
    payment: Payment | null;
    onOpenChange: (open: boolean) => void;
    onRefund: (payment: Payment) => void;
}) {
    return (
        <Dialog open={payment !== null} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                {payment && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                {payment.reference}
                                <StatusBadge status={PAYMENT_STATUS_META[payment.status]} />
                            </DialogTitle>
                            <DialogDescription>
                                {GATEWAY_LABEL[payment.gateway]} · {formatMoney(payment.amount)} · raised {formatDateTime(payment.createdAt)}
                            </DialogDescription>
                        </DialogHeader>
                        <FieldList
                            items={[
                                ["Gateway order", <span key="o" className="font-mono text-xs">{payment.gatewayOrderId ?? "—"}</span>],
                                ["Gateway payment", <span key="p" className="font-mono text-xs">{payment.gatewayPaymentId ?? "—"}</span>],
                                ["Method", payment.method ?? "—"],
                                ["Captured", payment.capturedAt ? formatDateTime(payment.capturedAt) : "Not captured"],
                                ["Left to refund", formatMoney(payment.refundable)],
                                [
                                    "Applied to",
                                    paymentTarget(payment).href ? (
                                        <Link key="t" href={paymentTarget(payment).href!} className="underline underline-offset-4">
                                            {paymentTarget(payment).label}
                                        </Link>
                                    ) : (
                                        "—"
                                    ),
                                ],
                                ["Ledger transaction", <span key="l" className="font-mono text-xs">{payment.ledgerTransactionId ?? "—"}</span>],
                                ["Invoice", payment.invoiceId ? <Link key="i" href="/finance/invoices" className="underline underline-offset-4">Stamped</Link> : "—"],
                            ]}
                        />
                        {payment.failureReason && (
                            <p className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">{payment.failureReason}</p>
                        )}
                        {payment.status === "CAPTURED" && !payment.ledgerTransactionId && (
                            <p className="rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
                                Captured but not applied: the money is spendable balance in the advertiser&rsquo;s wallet. Apply it by
                                hand from the campaign page, or authorise on their behalf.
                            </p>
                        )}
                        <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Refunds</h4>
                            {payment.refunds.length === 0 ? (
                                <p className="mt-2 text-sm text-muted-foreground">None.</p>
                            ) : (
                                <ul className="mt-2 divide-y text-sm">
                                    {payment.refunds.map((refund) => (
                                        <li key={refund.id} className="flex items-start justify-between gap-3 py-2">
                                            <div className="min-w-0">
                                                <p className="text-foreground">{refund.reason}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {formatDateTime(refund.createdAt)}
                                                    {refund.gatewayRefundId ? ` · ${refund.gatewayRefundId}` : ""}
                                                    {refund.refundRequestId ? " · pays a refund request" : ""}
                                                </p>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <p className="tabular-nums">{formatMoney(refund.amount)}</p>
                                                <StatusBadge status={REFUND_STATUS_META[refund.status]} />
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <DialogFooter>
                            {canRefund(payment) && <Button onClick={() => onRefund(payment)}>Refund</Button>}
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

/* ------------------------------------------------------------------ */
/* Refund                                                              */
/* ------------------------------------------------------------------ */

function RefundDialog({
    payment,
    onOpenChange,
    onDone,
}: {
    payment: Payment | null;
    onOpenChange: (open: boolean) => void;
    onDone: () => void;
}) {
    const [amount, setAmount] = React.useState("");
    const [reason, setReason] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const problem = payment ? refundProblem({ amount, reason }, payment.refundable) : null;

    const submit = async () => {
        if (!payment || problem) return;
        setBusy(true);
        try {
            await paymentsService.refund(payment.id, { amount: amount.trim(), reason: reason.trim() });
            toast.success(`${formatMoney(amount.trim())} sent back on ${payment.reference}`, {
                description: "The wallet was debited first; the gateway's webhook finalises it.",
            });
            setAmount("");
            setReason("");
            onDone();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "The refund was refused.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog
            open={payment !== null}
            onOpenChange={(open) => {
                if (!open && !busy) {
                    setAmount("");
                    setReason("");
                    onOpenChange(false);
                }
            }}
        >
            <DialogContent className="max-w-md">
                {payment && (
                    <>
                        <DialogHeader>
                            <DialogTitle>Refund {payment.reference}?</DialogTitle>
                            <DialogDescription>
                                Up to {formatMoney(payment.refundable)} is left on this {GATEWAY_LABEL[payment.gateway]} payment. The
                                wallet is debited first, so the books never show money leaving ADX that the advertiser still holds;
                                the gateway&rsquo;s refund goes back to the card or UPI it came from.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="refund-amount">Amount (₹)</Label>
                                <Input
                                    id="refund-amount"
                                    inputMode="decimal"
                                    value={amount}
                                    onChange={(event) => setAmount(event.target.value)}
                                    placeholder={payment.refundable}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="refund-reason">Reason</Label>
                                <Textarea
                                    id="refund-reason"
                                    value={reason}
                                    onChange={(event) => setReason(event.target.value)}
                                    placeholder="Why the money is going back — recorded against the payment"
                                    className="min-h-20 resize-none"
                                    maxLength={500}
                                />
                            </div>
                            {problem && (amount || reason) && <p className="text-xs text-danger">{problem}</p>}
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                                Cancel
                            </Button>
                            <Button variant="destructive" onClick={submit} disabled={busy || problem !== null}>
                                Refund {amount && !problem ? formatMoney(amount.trim()) : ""}
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
