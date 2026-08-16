import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft } from "lucide-react";
import { FieldList } from "@/components/adx/simple-table";
import { KpiCard } from "@/components/adx/kpi-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatINR } from "@/lib/format";
import { api } from "@/services";
import {
    ORDER_PIPELINE_STAGES,
    ORDER_PRIORITY_META,
    ORDER_STATUS_META,
} from "@/types";

export const metadata: Metadata = { title: "Order" };

export default async function OrderDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const order = await api.orders.get(id);
    if (!order) notFound();

    const currentStageIndex = ORDER_PIPELINE_STAGES.findIndex(
        (stage) => stage.id === order.status
    );

    const timeline = [
        { title: "Order created", stamp: order.createdAt, index: -1 },
        ...ORDER_PIPELINE_STAGES.map((stage, index) => ({
            title: stage.title,
            stamp: index <= currentStageIndex ? "Done" : "Pending",
            index,
        })),
    ];

    return (
        <div className="space-y-5">
            <div>
                <Link
                    href="/orders"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="size-4" />
                    Orders
                </Link>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                            Order #{order.number} · {order.type}
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {order.listing} · {order.city}
                            {order.campaign ? ` · ${order.campaign}` : ""}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" className="bg-card">
                            Reassign agent
                        </Button>
                        <Button>Mark complete</Button>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                    stat={{
                        id: "status",
                        label: "Status",
                        value: ORDER_STATUS_META[order.status].label,
                    }}
                />
                <KpiCard stat={{ id: "due", label: "Due", value: order.due }} />
                <KpiCard
                    stat={{
                        id: "payout",
                        label: "Agent payout",
                        value: formatINR(order.payout),
                    }}
                />
                <KpiCard
                    stat={{
                        id: "priority",
                        label: "Priority",
                        value: ORDER_PRIORITY_META[order.priority].label,
                    }}
                />
            </div>

            <div className="grid gap-4 lg:grid-cols-5">
                <Card className="rounded-lg border-border p-5 shadow-none lg:col-span-3">
                    <h3 className="text-base font-semibold text-foreground">Progress</h3>
                    <ol className="mt-5 space-y-0">
                        {timeline.map((step, index) => {
                            const done = step.index <= currentStageIndex;
                            const isLast = index === timeline.length - 1;
                            return (
                                <li key={step.title} className="relative flex gap-3 pb-6 last:pb-0">
                                    {!isLast && (
                                        <span
                                            aria-hidden
                                            className={cn(
                                                "absolute left-[11px] top-6 h-full w-px",
                                                done ? "bg-success/40" : "bg-border"
                                            )}
                                        />
                                    )}
                                    <span
                                        className={cn(
                                            "z-10 flex size-6 shrink-0 items-center justify-center rounded-full border bg-card",
                                            done
                                                ? "border-success bg-success text-white"
                                                : "text-muted-foreground/50"
                                        )}
                                    >
                                        {done && <Check className="size-3.5" />}
                                    </span>
                                    <div className="pt-0.5">
                                        <p
                                            className={cn(
                                                "text-sm font-medium",
                                                done ? "text-foreground" : "text-muted-foreground"
                                            )}
                                        >
                                            {step.title}
                                        </p>
                                        <p className="text-xs text-muted-foreground">{step.stamp}</p>
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                </Card>

                <Card className="rounded-lg border-border p-5 shadow-none lg:col-span-2">
                    <h3 className="text-base font-semibold text-foreground">Details</h3>
                    <FieldList
                        className="mt-4"
                        items={[
                            ["Site", order.listing],
                            ["City", order.city],
                            ["Campaign", order.campaign ?? "-"],
                            [
                                "Agent",
                                order.agent ? (
                                    <Link
                                        key="agent"
                                        href={`/agents/${order.agentId}`}
                                        className="underline-offset-4 hover:underline"
                                    >
                                        {order.agent}
                                    </Link>
                                ) : (
                                    "Unassigned"
                                ),
                            ],
                            ["Created", order.createdAt],
                            ["Due", order.due],
                            ["Payout", formatINR(order.payout)],
                        ]}
                    />
                </Card>
            </div>
        </div>
    );
}
