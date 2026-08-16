"use client";

import * as React from "react";
import Link from "next/link";
import { List, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import {
    ORDER_PIPELINE_STAGES,
    ORDER_PRIORITY_META,
    type Order,
    type OrderStatus,
} from "@/types";

interface PipelineBoardProps {
    orders: Order[];
}

/** Kanban view of field orders, drag cards between stages. */
export function PipelineBoard({ orders: initialOrders }: PipelineBoardProps) {
    const [orders, setOrders] = React.useState(initialOrders);
    const [dragId, setDragId] = React.useState<string | null>(null);
    const [dropStage, setDropStage] = React.useState<OrderStatus | null>(null);

    const moveOrder = (orderId: string, stage: OrderStatus) => {
        setOrders((current) =>
            current.map((order) =>
                order.id === orderId && order.status !== stage
                    ? { ...order, status: stage }
                    : order
            )
        );
        const moved = orders.find((order) => order.id === orderId);
        const stageTitle = ORDER_PIPELINE_STAGES.find((s) => s.id === stage)?.title;
        if (moved && moved.status !== stage) {
            toast.success(`Order #${moved.number} moved to ${stageTitle}`);
        }
    };

    return (
        <div className="space-y-5">
            <PageHeader
                title="Order pipeline"
                subtitle="Drag orders between stages"
                actions={
                    <Button variant="outline" className="bg-card" asChild>
                        <Link href="/orders">
                            <List className="mr-1.5 size-4" />
                            Board list
                        </Link>
                    </Button>
                }
            />

            <div className="grid gap-4 overflow-x-auto pb-2 lg:grid-cols-5">
                {ORDER_PIPELINE_STAGES.map((stage) => {
                    const stageOrders = orders.filter((order) => order.status === stage.id);
                    const isDropTarget = dropStage === stage.id;
                    return (
                        <div
                            key={stage.id}
                            className={cn(
                                "flex min-h-[420px] flex-col rounded-lg border bg-muted/40 transition-colors",
                                isDropTarget && "border-primary/40 bg-primary/[0.03]"
                            )}
                            onDragOver={(event) => {
                                event.preventDefault();
                                setDropStage(stage.id);
                            }}
                            onDragLeave={() => setDropStage(null)}
                            onDrop={(event) => {
                                event.preventDefault();
                                const orderId = event.dataTransfer.getData("text/order-id");
                                if (orderId) moveOrder(orderId, stage.id);
                                setDropStage(null);
                                setDragId(null);
                            }}
                        >
                            <div className="flex items-center justify-between px-3 pb-2 pt-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    {stage.title}
                                    <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                                        {stageOrders.length}
                                    </span>
                                </p>
                                <button
                                    type="button"
                                    aria-label={`Add order to ${stage.title}`}
                                    className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                    onClick={() =>
                                        toast.info("New orders are created from bookings and site issues.")
                                    }
                                >
                                    <Plus className="size-3.5" />
                                </button>
                            </div>

                            <div className="flex-1 space-y-2 px-2.5 pb-3">
                                {stageOrders.map((order) => (
                                    <div
                                        key={order.id}
                                        draggable
                                        onDragStart={(event) => {
                                            event.dataTransfer.setData("text/order-id", order.id);
                                            setDragId(order.id);
                                        }}
                                        onDragEnd={() => {
                                            setDragId(null);
                                            setDropStage(null);
                                        }}
                                        className={cn(
                                            "cursor-grab rounded-lg border bg-card p-3 active:cursor-grabbing",
                                            dragId === order.id && "opacity-50"
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-xs font-medium text-muted-foreground">
                                                #{order.number} · {order.type}
                                            </p>
                                            <StatusBadge status={ORDER_PRIORITY_META[order.priority]} />
                                        </div>
                                        <Link
                                            href={`/orders/${order.id}`}
                                            className="mt-1.5 block text-sm font-medium text-foreground underline-offset-4 hover:underline"
                                        >
                                            {order.listing}
                                        </Link>
                                        <p className="mt-0.5 text-xs text-muted-foreground">{order.city}</p>
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
                                                {order.due}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                                {stageOrders.length === 0 && (
                                    <div className="flex h-24 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground/70">
                                        Drop orders here
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
