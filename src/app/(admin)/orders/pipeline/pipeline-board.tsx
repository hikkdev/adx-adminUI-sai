"use client";

import * as React from "react";
import Link from "next/link";
import { List } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { formatCompactINR, formatDate } from "@/lib/format";
import { isLive } from "@/lib/api-config";
import { orderService } from "@/services/orders";
import { OPS_REASON_MIN, ReasonField } from "../[id]/order-ops-dialogs";
import {
    ORDER_PIPELINE_STAGES,
    ORDER_STAGE_OF,
    ORDER_STATUS_META,
    type Order,
} from "@/types";

interface PipelineBoardProps {
    orders: Order[];
    /** Refetches after a move actually lands on the server. */
    onChanged?: () => void;
}

/**
 * The order pipeline, as a board.
 *
 * Dragging used to move a card into any column and show a success toast. It
 * changed local state and nothing else — reload the page and the order was back
 * where it started, because the console was inventing a transition the backend
 * has no endpoint for.
 *
 * An order's lifecycle belongs to the people in it: the publisher accepts, the
 * agent proposes a slot, the advertiser pays. ADX has exactly two decisions of
 * its own, and they are the only two drops this board accepts — sign off a
 * finished install, or stop the order. Everything else is somebody else's to
 * do from their own app, so those columns say so rather than pretending.
 */
export function PipelineBoard({ orders, onChanged }: PipelineBoardProps) {
    const [dragId, setDragId] = React.useState<string | null>(null);
    const [dropStage, setDropStage] = React.useState<string | null>(null);
    const [cancelling, setCancelling] = React.useState<Order | null>(null);
    const [cancelReason, setCancelReason] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    const live = isLive("orders");

    /** The two columns a card may be dropped into, and what dropping means. */
    const canDrop = (order: Order, stageId: string): boolean => {
        if (!live) return false;
        if (stageId === "done") return order.status === "PENDING_APPROVAL";
        if (stageId === "stopped") return ORDER_STAGE_OF[order.status] !== "stopped";
        return false;
    };

    async function drop(order: Order, stageId: string) {
        if (stageId === "stopped") {
            setCancelling(order);
            return;
        }
        setBusy(true);
        try {
            await orderService.approve(order.id);
            toast.success(`Signed off ${order.listing}`);
            onChanged?.();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not approve that order.");
        } finally {
            setBusy(false);
        }
    }

    async function confirmCancel() {
        if (!cancelling) return;
        setBusy(true);
        try {
            await orderService.cancel(cancelling.id, cancelReason.trim());
            toast.success(`Cancelled ${cancelling.listing}`);
            setCancelling(null);
            setCancelReason("");
            onChanged?.();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not cancel that order.");
        } finally {
            setBusy(false);
        }
    }

    const dragged = dragId ? (orders.find((order) => order.id === dragId) ?? null) : null;

    return (
        <div className="space-y-5">
            <PageHeader
                title="Order pipeline"
                subtitle={
                    live
                        ? "Drag a finished install into Completed to sign it off, or into Not proceeding to cancel it."
                        : "Read-only while orders render fixtures."
                }
                actions={
                    <Button variant="outline" className="bg-card" asChild>
                        <Link href="/orders">
                            <List className="mr-1.5 size-4" />
                            Board list
                        </Link>
                    </Button>
                }
            />

            <div className="grid gap-4 overflow-x-auto pb-2 lg:grid-cols-6">
                {ORDER_PIPELINE_STAGES.map((stage) => {
                    const stageOrders = orders.filter(
                        (order) => ORDER_STAGE_OF[order.status] === stage.id
                    );
                    const willAccept = dragged ? canDrop(dragged, stage.id) : false;
                    const isDropTarget = dropStage === stage.id && willAccept;

                    return (
                        <div
                            key={stage.id}
                            className={cn(
                                "flex min-h-[420px] flex-col rounded-lg border bg-muted/40 transition-colors",
                                isDropTarget && "border-primary/40 bg-primary/[0.03]",
                                dragged && !willAccept && "opacity-60"
                            )}
                            onDragOver={(event) => {
                                if (!willAccept) return;
                                event.preventDefault();
                                setDropStage(stage.id);
                            }}
                            onDragLeave={() => setDropStage(null)}
                            onDrop={(event) => {
                                event.preventDefault();
                                setDropStage(null);
                                setDragId(null);
                                const id = event.dataTransfer.getData("text/order-id");
                                const order = orders.find((candidate) => candidate.id === id);
                                if (order && canDrop(order, stage.id)) void drop(order, stage.id);
                            }}
                        >
                            <div className="flex items-center justify-between px-3 pb-2 pt-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    {stage.title}
                                    <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                                        {stageOrders.length}
                                    </span>
                                </p>
                            </div>

                            <div className="flex-1 space-y-2 px-2.5 pb-3">
                                {stageOrders.map((order) => (
                                    <div
                                        key={order.id}
                                        draggable={live && !busy}
                                        onDragStart={(event) => {
                                            event.dataTransfer.setData("text/order-id", order.id);
                                            setDragId(order.id);
                                        }}
                                        onDragEnd={() => {
                                            setDragId(null);
                                            setDropStage(null);
                                        }}
                                        className={cn(
                                            "rounded-lg border bg-card p-3",
                                            live && !busy && "cursor-grab active:cursor-grabbing",
                                            dragId === order.id && "opacity-50"
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <Link
                                                href={`/orders/${order.id}`}
                                                className="min-w-0 text-sm font-medium text-foreground underline-offset-4 hover:underline"
                                            >
                                                <span className="line-clamp-2">{order.listing}</span>
                                            </Link>
                                            {order.budget !== null && (
                                                <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                                                    {formatCompactINR(order.budget)}
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                            {[order.city, order.campaignName]
                                                .filter(Boolean)
                                                .join(" · ") || "—"}
                                        </p>
                                        <div className="mt-2">
                                            <StatusBadge status={ORDER_STATUS_META[order.status]} />
                                        </div>
                                        <div className="mt-2.5 flex items-center justify-between gap-2 border-t pt-2.5">
                                            {order.agent ? (
                                                <span className="flex min-w-0 items-center gap-1.5">
                                                    <InitialsAvatar name={order.agent} size="sm" />
                                                    <span className="truncate text-xs text-muted-foreground">
                                                        {order.agent}
                                                    </span>
                                                </span>
                                            ) : (
                                                <span className="text-xs text-muted-foreground/60">
                                                    Unassigned
                                                </span>
                                            )}
                                            <span className="shrink-0 text-xs text-muted-foreground">
                                                {order.slotTime
                                                    ? formatDate(order.slotTime)
                                                    : order.startDate
                                                      ? formatDate(order.startDate)
                                                      : ""}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                                {stageOrders.length === 0 && (
                                    <div className="flex h-24 items-center justify-center rounded-lg border border-dashed px-3 text-center text-xs text-muted-foreground/70">
                                        Nothing here
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <ConfirmDialog
                open={cancelling !== null}
                onOpenChange={(open) => {
                    if (!open) setCancelling(null);
                }}
                title={cancelling ? `Cancel the order on ${cancelling.listing}?` : "Cancel order"}
                description="This stops the order for everyone on it — the publisher, the advertiser and any agent already assigned. It cannot be restarted; a new order would have to be placed."
                confirmLabel="Cancel order"
                destructive
                busy={busy}
                disabled={cancelReason.trim().length < OPS_REASON_MIN}
                onConfirm={confirmCancel}
            >
                <ReasonField
                    id="pipeline-cancel-reason"
                    value={cancelReason}
                    onChange={setCancelReason}
                    hint="Required. Written on the order beside who cancelled it and when."
                />
            </ConfirmDialog>
        </div>
    );
}
