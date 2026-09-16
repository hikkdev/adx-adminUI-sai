"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ReceiptText, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { DataTable } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { FilterChips, type FilterChip } from "@/components/adx/filter-chips";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import {
    SUBSCRIPTION_ORDER_STATUSES,
    SUBSCRIPTION_ORDER_STATUS_META,
    cycleLabel,
    formatRate,
    orderIsOpen,
    orderIsTrial,
    revenueService,
    subscriptionOrderStatusMeta,
    type SubscriptionOrder,
    type SubscriptionOrderStatus,
    type SubscriptionOrdersPage,
} from "@/services/revenue";

interface OrdersViewProps {
    page: SubscriptionOrdersPage;
    q: string;
    onQChange: (q: string) => void;
    status: SubscriptionOrderStatus | "ALL";
    onStatusChange: (status: SubscriptionOrderStatus | "ALL") => void;
    pageNumber: number;
    onPageChange: (page: number) => void;
    pageSize: number;
    onChanged: () => void;
}

/** "Paid 1 Oct 2026 · UPI" / "Trial started 1 Oct 2026" / "Cancelled 2 Oct 2026" / a dash. */
export function settledLabel(order: Pick<SubscriptionOrder, "status" | "paidAt" | "paidMethod" | "cancelledAt">): string {
    if (order.status === "PAID" && order.paidAt && orderIsTrial(order)) return `Trial started ${formatDate(order.paidAt)}`;
    if (order.status === "PAID" && order.paidAt) return `Paid ${formatDate(order.paidAt)}${order.paidMethod ? ` · ${order.paidMethod}` : ""}`;
    if (order.status === "CANCELLED" && order.cancelledAt) return `Cancelled ${formatDate(order.cancelledAt)}`;
    return "—";
}

/** The methods ops record most; the field takes anything from two to forty characters. */
const PAYMENT_METHODS = ["UPI", "NEFT", "IMPS", "RTGS", "CASH", "CHEQUE"] as const;

/**
 * The orders tab — the console's list idiom over `GET /revenue/subscription-orders`:
 * the status chips from the server's counts, a search, and the server's
 * pager. Two actions, both on an unpaid order: record a payment that
 * arrived outside ADX (which activates the term the way the wallet would),
 * and cancel.
 */
export function OrdersView({ page, q, onQChange, status, onStatusChange, pageNumber, onPageChange, pageSize, onChanged }: OrdersViewProps) {
    const [recording, setRecording] = React.useState<SubscriptionOrder | null>(null);
    const [cancelling, setCancelling] = React.useState<SubscriptionOrder | null>(null);
    const [busy, setBusy] = React.useState(false);

    const cancel = async () => {
        if (!cancelling || busy) return;
        setBusy(true);
        try {
            await revenueService.cancelOrder(cancelling.id);
            toast.success(`${cancelling.reference} cancelled`);
            setCancelling(null);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The change did not reach ADX.");
        } finally {
            setBusy(false);
        }
    };

    const columns = React.useMemo<ColumnDef<SubscriptionOrder>[]>(
        () => [
            {
                id: "reference",
                accessorKey: "reference",
                header: "Reference",
                cell: ({ row }) => <span className="font-mono text-xs text-foreground">{row.original.reference}</span>,
            },
            {
                id: "publisher",
                accessorKey: "publisherName",
                header: "Publisher",
                cell: ({ row }) => (
                    <Link
                        href={`/publishers/${encodeURIComponent(row.original.publisherId)}`}
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                        {row.original.publisherName || row.original.publisherId}
                    </Link>
                ),
            },
            {
                id: "plan",
                accessorKey: "planName",
                header: "Plan",
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5 text-foreground">
                            {row.original.planName}
                            {orderIsTrial(row.original) && (
                                <Badge variant="secondary" className="rounded-sm" data-testid={`trial-${row.original.id}`}>
                                    Trial
                                </Badge>
                            )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {orderIsTrial(row.original)
                                ? "Free days, no cycle"
                                : `${cycleLabel(row.original.cycle)} · ${row.original.months} ${row.original.months === 1 ? "month" : "months"}`}{" "}
                            · {formatRate(row.original.ratePct)}
                        </p>
                    </div>
                ),
            },
            {
                id: "perMonth",
                accessorKey: "pricePerMonth",
                header: "₹ / month",
                cell: ({ row }) => <span className="tabular-nums">{formatMoney(row.original.pricePerMonth)}</span>,
            },
            {
                id: "total",
                accessorKey: "total",
                header: "Total",
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <p className="font-medium tabular-nums">{formatMoney(row.original.total)}</p>
                        <p className="text-xs tabular-nums text-muted-foreground">incl. GST {formatMoney(row.original.gstAmount)}</p>
                    </div>
                ),
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => <StatusBadge status={subscriptionOrderStatusMeta(row.original.status)} />,
            },
            {
                id: "raised",
                accessorKey: "createdAt",
                header: "Raised",
                cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.original.createdAt)}</span>,
            },
            {
                id: "settled",
                accessorFn: (order) => order.paidAt ?? order.cancelledAt ?? "",
                header: "Settled",
                cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{settledLabel(row.original)}</span>,
            },
            {
                id: "actions",
                header: () => <span className="sr-only">Actions</span>,
                cell: ({ row }) =>
                    orderIsOpen(row.original) ? (
                        <div className="flex justify-end gap-1.5">
                            <Button
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => setRecording(row.original)}
                                aria-label={`Record payment for ${row.original.reference}`}
                            >
                                Record payment
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 bg-card text-xs"
                                onClick={() => setCancelling(row.original)}
                                aria-label={`Cancel ${row.original.reference}`}
                            >
                                Cancel
                            </Button>
                        </div>
                    ) : null,
            },
        ],
        [],
    );

    /* The chip counts come from the server, computed without the status in force; "All" is their sum (Lot J leftover d). */
    const chips: FilterChip<SubscriptionOrderStatus | "ALL">[] = [
        { value: "ALL", label: "All", count: SUBSCRIPTION_ORDER_STATUSES.reduce((sum, value) => sum + page.counts[value], 0) },
        ...SUBSCRIPTION_ORDER_STATUSES.map((value) => ({ value, label: SUBSCRIPTION_ORDER_STATUS_META[value].label, count: page.counts[value] })),
    ];

    const from = page.total === 0 ? 0 : (pageNumber - 1) * pageSize + 1;
    const to = Math.min(pageNumber * pageSize, page.total);
    const lastPage = Math.max(1, Math.ceil(page.total / pageSize));

    return (
        <div className="space-y-4">
            <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={q}
                    onChange={(event) => onQChange(event.target.value)}
                    placeholder="Search reference, plan or publisher"
                    aria-label="Search orders"
                    className="h-9 w-[280px] bg-card pl-8"
                />
            </div>

            <FilterChips chips={chips} value={status} onChange={onStatusChange} />

            <DataTable
                columns={columns}
                data={page.items}
                showColumnToggle={false}
                showPagination={false}
                emptyState={
                    <EmptyState
                        icon={ReceiptText}
                        title={q.trim() || status !== "ALL" ? "No orders match" : "No orders yet"}
                        description={
                            q.trim() || status !== "ALL"
                                ? "Clear the search or pick another status to see the rest."
                                : "An order is raised the moment a publisher picks a plan in the app; it is paid from their wallet or recorded here."
                        }
                    />
                }
            />

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>
                    {from}-{to} of {formatNumber(page.total)}
                </span>
                <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" className="h-8 bg-card" onClick={() => onPageChange(pageNumber - 1)} disabled={pageNumber <= 1}>
                        Previous
                    </Button>
                    <span className="flex h-8 min-w-8 items-center justify-center rounded-md border bg-card px-2 text-sm text-foreground">
                        {pageNumber}
                    </span>
                    <Button variant="outline" size="sm" className="h-8 bg-card" onClick={() => onPageChange(pageNumber + 1)} disabled={pageNumber >= lastPage}>
                        Next
                    </Button>
                </div>
            </div>

            <RecordPaymentDialog
                order={recording}
                onOpenChange={(open) => !open && setRecording(null)}
                onRecorded={() => {
                    setRecording(null);
                    onChanged();
                }}
            />

            <ConfirmDialog
                open={cancelling !== null}
                onOpenChange={(open) => !open && setCancelling(null)}
                title="Cancel this order?"
                description={
                    cancelling
                        ? `${cancelling.reference} — ${cancelling.planName} for ${cancelling.publisherName}, ${formatMoney(cancelling.total)}. The publisher can raise another from the app; nothing was charged.`
                        : ""
                }
                confirmLabel="Cancel order"
                cancelLabel="Keep it"
                destructive
                busy={busy}
                onConfirm={() => void cancel()}
            />
        </div>
    );
}

/**
 * Money that arrived outside ADX — `POST /revenue/subscription-orders/:id/record-payment`.
 * The reference is the bank's or the UPI app's; the method is a word. The
 * activation is the same one a wallet payment runs.
 */
export function RecordPaymentDialog({
    order,
    onOpenChange,
    onRecorded,
}: {
    order: SubscriptionOrder | null;
    onOpenChange: (open: boolean) => void;
    onRecorded: () => void;
}) {
    const [reference, setReference] = React.useState("");
    const [method, setMethod] = React.useState<string>("UPI");
    const [busy, setBusy] = React.useState(false);
    const [formError, setFormError] = React.useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});

    const handleOpenChange = (next: boolean) => {
        if (!next) {
            setReference("");
            setMethod("UPI");
            setFormError(null);
            setFieldErrors({});
        }
        onOpenChange(next);
    };

    const ready = reference.trim().length >= 2 && reference.trim().length <= 120 && method.trim().length >= 2 && method.trim().length <= 40;

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!order || !ready || busy) return;
        setBusy(true);
        setFormError(null);
        setFieldErrors({});
        try {
            const paid = await revenueService.recordOrderPayment(order.id, { reference: reference.trim(), method: method.trim() });
            toast.success(`${paid.reference} paid`, {
                description: paid.startsAt ? `${paid.planName} starts ${formatDate(paid.startsAt)}.` : `${paid.planName} is active.`,
            });
            setReference("");
            setMethod("UPI");
            onRecorded();
        } catch (cause) {
            if (cause instanceof ApiError) {
                setFieldErrors(cause.fieldErrors);
                setFormError(cause.message);
            } else {
                setFormError(cause instanceof Error ? cause.message : "Could not record the payment.");
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={order !== null} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md">
                <form onSubmit={submit} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>Record a payment</DialogTitle>
                        <DialogDescription>
                            {order
                                ? `${order.reference} — ${order.planName} for ${order.publisherName}, ${formatMoney(order.total)}. Recording it activates the term exactly as a wallet payment would.`
                                : ""}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-1.5">
                        <Label htmlFor="record-reference">Payment reference</Label>
                        <Input
                            id="record-reference"
                            value={reference}
                            maxLength={120}
                            autoComplete="off"
                            placeholder="UTR or transaction id"
                            disabled={busy}
                            onChange={(event) => setReference(event.target.value)}
                        />
                        {fieldErrors.reference?.[0] && <p className="text-xs text-danger">{fieldErrors.reference[0]}</p>}
                    </div>

                    <div className="grid gap-1.5">
                        <Label htmlFor="record-method">Method</Label>
                        <Input
                            id="record-method"
                            value={method}
                            maxLength={40}
                            autoComplete="off"
                            list="record-method-options"
                            disabled={busy}
                            onChange={(event) => setMethod(event.target.value.toUpperCase())}
                        />
                        <datalist id="record-method-options">
                            {PAYMENT_METHODS.map((option) => (
                                <option key={option} value={option} />
                            ))}
                        </datalist>
                        <p className="text-xs text-muted-foreground">{fieldErrors.method?.[0] ?? "UPI, NEFT, IMPS, RTGS, cash, cheque — or how it came."}</p>
                    </div>

                    {formError && <p className="text-sm text-danger">{formError}</p>}

                    <DialogFooter>
                        <Button type="button" variant="outline" className="bg-card" disabled={busy} onClick={() => handleOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={!ready || busy}>
                            {busy ? "Recording…" : "Record payment"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
