"use client";

import * as React from "react";
import { Gavel, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { orderService, type OrderStatusWire } from "@/services/orders";
import { shortId } from "@/services/finance";
import { ORDER_STATUS_META, type Order } from "@/types";
import { RequestQuotesDialog } from "./request-quotes-dialog";

/**
 * Raising a quote request from the desk (the owner, 24 September 2026:
 * "there's no way to send quote request to anyone").
 *
 * There was one way — the Printing card on an order — and nothing in the
 * Print partners section said so. A request belongs to an order, so this
 * does not invent a second kind: it asks which order first, then opens the
 * same dialog the card opens, against the same
 * `POST /orders/:id/print-quote-request`.
 *
 * The pick is a two-step because the specs are prefilled from the spot and
 * the artwork, and a list row does not carry either — only the detail read
 * joins the listing's category. So the chosen row is read in full before the
 * dialog opens.
 */

/**
 * The order statuses a job — and so a request — may be raised against. The
 * same set as the Printing card's, which mirrors the backend's
 * `PRINTABLE_ORDER_STATUSES`: the publisher has accepted and the order has
 * not been cancelled.
 */
const PRINTABLE: OrderStatusWire[] = [
    "PENDING_PRINT",
    "SELF_INSTALL",
    "PENDING_AGENT",
    "AGENT_REJECTED",
    "SLOT_PROPOSED",
    "SLOT_CONFIRMED",
    "IN_PROGRESS",
    "PENDING_OTP",
    "PENDING_APPROVAL",
    "COMPLETED",
];

interface RaiseQuoteRequestProps {
    /**
     * Orders that already have a request out. They are filtered from the
     * picker rather than shown and refused: a second OPEN request on one
     * order is not a thing the backend allows, and the first one is already
     * a row on the tab behind this dialog.
     */
    openRequestOrderIds: readonly string[];
    /** Raised — the tab rereads, so the new row is there. */
    onRaised: () => void;
    /**
     * The desk draws this twice — beside Refresh, and inside the empty state,
     * which is the moment an operator most wants it — so the second one is
     * named by its caller rather than sharing the first one's test id.
     */
    testId?: string;
}

export function RaiseQuoteRequest({ openRequestOrderIds, onRaised, testId = "raise-quote-request" }: RaiseQuoteRequestProps) {
    const [picking, setPicking] = React.useState(false);
    const [order, setOrder] = React.useState<Order | null>(null);

    return (
        <>
            <Button size="sm" onClick={() => setPicking(true)} data-testid={testId}>
                <Gavel className="mr-1.5 size-4" />
                Request quotes
            </Button>

            <OrderPickerDialog
                open={picking}
                onOpenChange={setPicking}
                openRequestOrderIds={openRequestOrderIds}
                onPicked={(picked) => {
                    setPicking(false);
                    setOrder(picked);
                }}
            />

            {order && (
                <RequestQuotesDialog
                    open={order !== null}
                    onOpenChange={(next) => {
                        if (!next) setOrder(null);
                    }}
                    order={order}
                    onRaised={() => {
                        setOrder(null);
                        onRaised();
                    }}
                />
            )}
        </>
    );
}

function OrderPickerDialog({
    open,
    onOpenChange,
    openRequestOrderIds,
    onPicked,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    openRequestOrderIds: readonly string[];
    onPicked: (order: Order) => void;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Which order?</DialogTitle>
                    <DialogDescription>
                        A quote request is raised against one order&apos;s print job. These are the orders the publisher has accepted and that have
                        nothing out for quotes.
                    </DialogDescription>
                </DialogHeader>
                {/* Mounted with the content, so the search starts empty on every open. */}
                <OrderPicker openRequestOrderIds={openRequestOrderIds} onPicked={onPicked} />
            </DialogContent>
        </Dialog>
    );
}

function OrderPicker({ openRequestOrderIds, onPicked }: { openRequestOrderIds: readonly string[]; onPicked: (order: Order) => void }) {
    const [query, setQuery] = React.useState("");
    const [opening, setOpening] = React.useState<string | null>(null);

    /* One read of the printable orders, newest first. The search filters what
       came back rather than refetching per keystroke: a hundred rows is the
       page, and the desk raises a request against a recent order. */
    const orders = useApiResource<Order[]>("print-quote-request:printable-orders", async () => {
        const page = await orderService.page({ status: PRINTABLE, sort: "NEWEST", pageSize: 100 });
        return page.items;
    });

    const all = orders.data ?? [];
    const withoutRequests = all.filter((row) => !openRequestOrderIds.includes(row.id));
    const needle = query.trim().toLowerCase();
    const rows = needle
        ? withoutRequests.filter((row) =>
              [row.listing, row.campaignName, row.city, row.id].filter(Boolean).some((field) => String(field).toLowerCase().includes(needle)),
          )
        : withoutRequests;

    /* The list row has no spot and no artwork — only the detail read joins the
       listing's category — and the dialog prefills its specs from both. */
    async function pick(row: Order) {
        setOpening(row.id);
        try {
            const full = await orderService.get(row.id);
            if (!full) {
                toast.error("That order could not be read.");
                return;
            }
            onPicked(full);
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "That order could not be read.");
        } finally {
            setOpening(null);
        }
    }

    return (
        <div className="space-y-3">
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
                <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Spot, campaign, city or order id"
                    className="pl-9"
                    aria-label="Search the orders"
                    data-testid="quote-order-search"
                />
            </div>

            <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-border p-1" data-testid="quote-order-list">
                {orders.loading && all.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">Reading the orders…</p>
                ) : orders.error ? (
                    <p className="p-3 text-sm text-muted-foreground">{orders.error}</p>
                ) : rows.length === 0 ? (
                    <div className="px-3 py-6 text-center">
                        <p className="text-sm font-medium text-foreground">
                            {needle ? "No order matches" : all.length === 0 ? "No order is ready to print" : "Every order already has a request"}
                        </p>
                        <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
                            {needle
                                ? "Try the campaign, the city, or the order id."
                                : all.length === 0
                                  ? "An order can be quoted once the publisher has accepted it, and not after it is cancelled."
                                  : "The orders the publisher has accepted all have a request out. They are on the tab behind this."}
                        </p>
                    </div>
                ) : (
                    rows.map((row) => (
                        <button
                            key={row.id}
                            type="button"
                            onClick={() => void pick(row)}
                            disabled={opening !== null}
                            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-muted disabled:opacity-60"
                        >
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-foreground">{row.listing}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                    {[shortId(row.id, "ORD-"), row.campaignName, row.city, row.startDate ? formatDate(row.startDate) : null]
                                        .filter(Boolean)
                                        .join(" · ")}
                                </p>
                            </div>
                            {opening === row.id ? (
                                <span className="shrink-0 text-xs text-muted-foreground">Opening…</span>
                            ) : (
                                <StatusBadge status={ORDER_STATUS_META[row.status]} />
                            )}
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}
