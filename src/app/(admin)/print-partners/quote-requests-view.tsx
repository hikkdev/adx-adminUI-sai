"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Gavel, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { FilterChips } from "@/components/adx/filter-chips";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { shortId } from "@/services/finance";
import {
    QUOTE_REQUEST_STATUS_META,
    canCancelRequest,
    deadlineCountdown,
    printPartnerService,
    type PrintQuoteRequestPage,
    type PrintQuoteRequestRow,
    type PrintQuoteRequestStatus,
} from "@/services/print-partners";

export type RequestFilter = PrintQuoteRequestStatus | "ALL";

interface QuoteRequestsViewProps {
    page: PrintQuoteRequestPage;
    /** When the rows were read — the clock every countdown runs from; a refresh re-clocks them all at once. */
    readAt: Date;
    filter: RequestFilter;
    onFilterChange: (filter: RequestFilter) => void;
    /** The `partners.quotes` feature is off for this operator: the list is empty by design. */
    featureOff: boolean;
    onRefresh: () => void;
}

/** A row still waiting on ops: OPEN with something standing. The deadline closes quoting, not deciding. */
const awaitingAward = (row: PrintQuoteRequestRow): boolean => row.status === "OPEN" && row.standingQuotes > 0;

/**
 * Lot H: every quote request across orders — what is waiting on partners,
 * what is waiting on ops, and what ran out. G13-B: the rows are
 * `GET /print-quote-requests` (the desk's own list, one read) and Cancel is
 * on every OPEN row — `POST /orders/:id/print-quote-request/cancel` with a
 * reason; the invited partners are told and the quotes stay as the record
 * of who bid. An awarded request is undone through the job's decline, on
 * the order page.
 *
 * Reading and cancelling are here; awarding is on the order page, where
 * the quotes are ranked and the award opens the job. A row click goes there.
 */
export function QuoteRequestsView({ page, readAt: now, filter, onFilterChange, featureOff, onRefresh }: QuoteRequestsViewProps) {
    const router = useRouter();
    const rows = page.items;
    const counts = page.counts;
    const [cancelling, setCancelling] = React.useState<PrintQuoteRequestRow | null>(null);
    const [reason, setReason] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    const awaitingOps = rows.filter(awaitingAward).length;
    const pastDeadline = rows.filter((row) => row.status === "OPEN" && deadlineCountdown(row.deadlineAt, now).passed).length;

    const openCancel = (row: PrintQuoteRequestRow) => {
        setReason("");
        setCancelling(row);
    };

    const cancel = async () => {
        if (!cancelling) return;
        setBusy(true);
        try {
            await printPartnerService.cancelQuoteRequest(cancelling.orderId, reason);
            toast.success("Quote request cancelled", {
                description: `${cancelling.invitedCount} invited ${cancelling.invitedCount === 1 ? "partner was" : "partners were"} told; the quotes stay on record.`,
            });
            setCancelling(null);
            onRefresh();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not cancel the request.");
        } finally {
            setBusy(false);
        }
    };

    /* Built each render: the React Compiler memoises it, and the cancel handler stays in reach without a dependency list. */
    const columns: ColumnDef<PrintQuoteRequestRow>[] = [
        {
            id: "order",
            accessorFn: (row) => row.order?.site.title ?? row.orderId,
            header: ({ column }) => <SortableHeader column={column}>Order</SortableHeader>,
            cell: ({ row }) => (
                <div className="min-w-0 max-w-[18rem]">
                    <p className="truncate font-medium text-foreground">{row.original.order?.site.title ?? "Order no longer readable"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                        {[shortId(row.original.orderId, "ORD-"), row.original.order?.campaignName, row.original.city ?? row.original.order?.site.city]
                            .filter(Boolean)
                            .join(" · ")}
                    </p>
                </div>
            ),
        },
        {
            id: "deadline",
            accessorFn: (row) => row.deadlineAt,
            header: ({ column }) => <SortableHeader column={column}>Deadline</SortableHeader>,
            cell: ({ row }) => {
                const request = row.original;
                const countdown = deadlineCountdown(request.deadlineAt, now);
                const open = request.status === "OPEN";
                return (
                    <div className="min-w-0">
                        <p className={cn("whitespace-nowrap text-sm", open && countdown.passed ? "text-danger" : "text-foreground")}>
                            {open ? countdown.label : formatDateTime(request.deadlineAt)}
                        </p>
                        <p className="whitespace-nowrap text-[11px] text-muted-foreground">
                            {open ? formatDateTime(request.deadlineAt) : ""}
                            {request.reinvitedAt ? `${open ? " · " : ""}re-invited ${formatDateTime(request.reinvitedAt)}` : ""}
                        </p>
                    </div>
                );
            },
        },
        {
            id: "quotes",
            accessorFn: (row) => row.standingQuotes,
            header: ({ column }) => <SortableHeader column={column}>Quotes</SortableHeader>,
            cell: ({ row }) => {
                const request = row.original;
                return (
                    <div className="min-w-0">
                        <p className="text-sm tabular-nums text-foreground">
                            {request.standingQuotes} of {request.invitedCount} invited
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                            {request.lowest ? `lowest ${formatMoney(request.lowest.amount)} · ${request.lowest.partner.name}` : "nothing standing"}
                        </p>
                    </div>
                );
            },
        },
        {
            id: "invite",
            header: "Invited",
            cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.inviteMode === "AUTO" ? "In reach (AUTO)" : "Named by ops"}</span>,
        },
        {
            id: "status",
            accessorFn: (row) => row.status,
            header: "Status",
            cell: ({ row }) => {
                const request = row.original;
                return (
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <StatusBadge status={QUOTE_REQUEST_STATUS_META[request.status]} />
                            {awaitingAward(request) && <StatusBadge status={{ label: "Awaiting award", tone: "info" }} />}
                        </div>
                        {request.cancelReason && <p className="mt-1 max-w-[16rem] truncate text-[11px] text-muted-foreground" title={request.cancelReason}>{request.cancelReason}</p>}
                    </div>
                );
            },
        },
        {
            id: "actions",
            enableHiding: false,
            header: "",
            cell: ({ row }) => (
                <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                    {canCancelRequest(row.original) && (
                        <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => openCancel(row.original)}>
                            Cancel
                        </Button>
                    )}
                    <Button asChild size="sm" variant="ghost">
                        <Link href={`/orders/${row.original.orderId}`}>{awaitingAward(row.original) ? "Award" : "Open order"}</Link>
                    </Button>
                </div>
            ),
        },
    ];

    if (featureOff) {
        return (
            <Card className="rounded-lg border-border p-8 text-center shadow-none">
                <h3 className="text-base font-semibold text-foreground">Quote requests are switched off</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                    The <code className="rounded bg-muted px-1 py-0.5 text-xs">partners.quotes</code> feature is off for you. Jobs are
                    still opened by hand from an order&apos;s Printing card.
                </p>
            </Card>
        );
    }

    const total = (counts.OPEN ?? 0) + (counts.AWARDED ?? 0) + (counts.CANCELLED ?? 0) + (counts.EXPIRED ?? 0);

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
                <FilterChips<RequestFilter>
                    value={filter}
                    onChange={onFilterChange}
                    chips={[
                        { value: "OPEN", label: "Open", count: counts.OPEN },
                        { value: "AWARDED", label: "Awarded", count: counts.AWARDED },
                        { value: "CANCELLED", label: "Cancelled", count: counts.CANCELLED },
                        { value: "EXPIRED", label: "Expired", count: counts.EXPIRED },
                        { value: "ALL", label: "All", count: total },
                    ]}
                />
                <div className="ml-auto flex items-center gap-3">
                    <p className="text-xs text-muted-foreground">
                        {awaitingOps} awaiting award
                        {pastDeadline ? ` · ${pastDeadline} past the deadline` : ""}
                    </p>
                    <Button variant="outline" size="sm" className="bg-card" onClick={onRefresh}>
                        <RefreshCw className="mr-1.5 size-4" />
                        Refresh
                    </Button>
                </div>
            </div>

            <DataTable
                columns={columns}
                data={rows}
                initialPageSize={20}
                onRowClick={(row) => router.push(`/orders/${row.orderId}`)}
                emptyState={
                    <EmptyState
                        icon={Gavel}
                        title={filter === "OPEN" ? "Nothing is out for quotes" : "No quote request here"}
                        description="A request goes out from an order's Printing card once the publisher has accepted: the partners in reach quote until the deadline and the lowest is awarded unless ops say why not."
                    />
                }
            />

            <p className="text-xs text-muted-foreground">
                {page.total > rows.length ? `Showing ${rows.length} of ${page.total}. ` : ""}
                Deadlines count from when the page was read; refresh to re-clock them.
            </p>

            <ConfirmDialog
                open={cancelling !== null}
                onOpenChange={(open) => {
                    if (!open) setCancelling(null);
                }}
                title="Cancel this quote request?"
                description={
                    cancelling
                        ? `${cancelling.invitedCount} invited ${cancelling.invitedCount === 1 ? "partner is" : "partners are"} told it is withdrawn. The quotes already in stay as the record of who bid; a new request can be raised from the order later.`
                        : ""
                }
                confirmLabel="Cancel request"
                cancelLabel="Keep it open"
                destructive
                busy={busy}
                disabled={reason.trim().length < 3}
                onConfirm={() => void cancel()}
            >
                <div className="space-y-1.5">
                    <Label htmlFor="cancel-reason">Reason</Label>
                    <Textarea id="cancel-reason" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="Why the request is withdrawn — kept on the request and audited." />
                    <p className="text-xs text-muted-foreground">Three to five hundred characters.</p>
                </div>
            </ConfirmDialog>
        </div>
    );
}
