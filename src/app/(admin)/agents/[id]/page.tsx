import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DetailShell } from "@/components/adx/detail-shell";
import { FieldList, SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatCompactINR, formatDate, formatINR } from "@/lib/format";
import { api } from "@/services";
import {
    AGENT_STATUS_META,
    ORDER_PRIORITY_META,
    ORDER_STATUS_META,
    type Order,
} from "@/types";

export const metadata: Metadata = { title: "Agent" };

const tierLabel: Record<string, string> = {
    bronze: "Bronze",
    silver: "Silver",
    gold: "Gold",
    platinum: "Platinum",
};

export default async function AgentDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const agent = await api.agents.get(id);
    if (!agent) notFound();

    const [orders, milestones, withdrawals] = await Promise.all([
        api.orders.list(),
        api.growth.milestones(),
        api.finance.withdrawals(),
    ]);

    const agentOrders = orders.filter((order) => order.agentId === agent.id);
    const liveMilestones = milestones.filter((milestone) => milestone.status === "live");
    const agentWithdrawals = withdrawals.filter(
        (withdrawal) => withdrawal.requester === agent.name
    );

    return (
        <DetailShell
            backHref="/agents"
            backLabel="Agents"
            title={agent.name}
            subtitle={`${agent.area}, ${agent.city} · ${tierLabel[agent.tier]} tier · ★ ${agent.rating.toFixed(1)}`}
            actions={
                <Button variant="outline" className="bg-card" asChild>
                    <Link href="/orders">Assign an order</Link>
                </Button>
            }
            kpis={[
                {
                    id: "publishers",
                    label: "Publishers onboarded",
                    value: String(agent.publishersOnboarded),
                },
                { id: "orders", label: "Orders completed", value: String(agent.ordersCompleted), hint: "month to date" },
                {
                    id: "earnings",
                    label: "Earnings this month",
                    value: formatCompactINR(agent.monthlyEarnings),
                },
                {
                    id: "status",
                    label: "Status",
                    value: AGENT_STATUS_META[agent.status].label,
                    hint: `Last active ${agent.lastActive}`,
                },
            ]}
            tabs={[
                {
                    value: "overview",
                    label: "Overview",
                    content: (
                        <div className="grid gap-4 lg:grid-cols-2">
                            <Card className="rounded-lg border-border p-5 shadow-none">
                                <h3 className="text-base font-semibold text-foreground">Profile</h3>
                                <FieldList
                                    className="mt-4"
                                    items={[
                                        ["Phone", agent.phone],
                                        ["Email", agent.email],
                                        ["Territory", `${agent.area}, ${agent.city}`],
                                        ["Tier", tierLabel[agent.tier]],
                                        ["Rating", `★ ${agent.rating.toFixed(1)}`],
                                        ["Joined", formatDate(agent.joinedAt)],
                                    ]}
                                />
                            </Card>
                            <Card className="rounded-lg border-border p-5 shadow-none">
                                <h3 className="text-base font-semibold text-foreground">
                                    Milestone progress
                                </h3>
                                <div className="mt-4 space-y-5">
                                    {liveMilestones.map((milestone) => {
                                        const progress = Math.min(
                                            100,
                                            Math.round(
                                                ((agent.publishersOnboarded % milestone.targetCount) /
                                                    milestone.targetCount) *
                                                    100
                                            )
                                        );
                                        return (
                                            <div key={milestone.id}>
                                                <div className="flex items-center justify-between gap-4 text-sm">
                                                    <p className="font-medium text-foreground">
                                                        {milestone.title}
                                                    </p>
                                                    <p className="text-muted-foreground">
                                                        Reward {formatINR(milestone.rewardInr)}
                                                    </p>
                                                </div>
                                                <Progress value={progress} className="mt-2 h-1.5" />
                                                <p className="mt-1.5 text-xs text-muted-foreground">
                                                    {progress}% toward {milestone.targetLabel}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </Card>
                        </div>
                    ),
                },
                {
                    value: "orders",
                    label: "Orders",
                    content: (
                        <SimpleTable<Order>
                            rows={agentOrders}
                            rowKey={(order) => order.id}
                            emptyMessage="No orders assigned to this agent."
                            columns={[
                                {
                                    key: "order",
                                    label: "Order",
                                    render: (order) => (
                                        <Link
                                            href={`/orders/${order.id}`}
                                            className="font-medium text-foreground underline-offset-4 hover:underline"
                                        >
                                            #{order.number} {order.type}
                                        </Link>
                                    ),
                                },
                                {
                                    key: "site",
                                    label: "Site",
                                    render: (order) => (
                                        <span className="text-muted-foreground">{order.listing}</span>
                                    ),
                                },
                                {
                                    key: "priority",
                                    label: "Priority",
                                    render: (order) => (
                                        <StatusBadge status={ORDER_PRIORITY_META[order.priority]} />
                                    ),
                                },
                                { key: "due", label: "Due", render: (order) => order.due },
                                {
                                    key: "status",
                                    label: "Status",
                                    render: (order) => (
                                        <StatusBadge status={ORDER_STATUS_META[order.status]} />
                                    ),
                                },
                            ]}
                        />
                    ),
                },
                {
                    value: "earnings",
                    label: "Earnings",
                    content: (
                        <SimpleTable
                            rows={agentWithdrawals.flatMap((withdrawal) => withdrawal.history)}
                            rowKey={(entry) => entry.id}
                            emptyMessage="No payouts to this agent yet."
                            columns={[
                                { key: "date", label: "Date", render: (entry) => entry.date },
                                {
                                    key: "amount",
                                    label: "Amount",
                                    render: (entry) => (
                                        <span className="font-medium">{formatINR(entry.amount)}</span>
                                    ),
                                },
                                {
                                    key: "method",
                                    label: "Method",
                                    render: (entry) => (
                                        <span className="text-muted-foreground">{entry.method}</span>
                                    ),
                                },
                                {
                                    key: "status",
                                    label: "Status",
                                    render: () => (
                                        <StatusBadge status={{ label: "Completed", tone: "success" }} />
                                    ),
                                },
                            ]}
                        />
                    ),
                },
            ]}
        />
    );
}
