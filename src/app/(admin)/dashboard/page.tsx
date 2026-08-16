import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { InsightBanner } from "@/components/adx/insight-banner";
import { KpiCard } from "@/components/adx/kpi-card";
import { MonthlyGmvChart } from "@/components/charts/monthly-gmv-chart";
import { PublisherGrowthChart } from "@/components/charts/publisher-growth-chart";
import { AddPublisherCard } from "@/components/dashboard/add-publisher-card";
import { AssignOrderCard } from "@/components/dashboard/assign-order-card";
import { PayoutRunsCard } from "@/components/dashboard/payout-runs-card";
import { formatCompactINR, formatINR, formatNumber } from "@/lib/format";
import {
    bookingsThisMonth,
    dashboardKpis,
    monthlyGmv,
    publisherGrowth,
    recentBookings,
    smartInsight,
} from "@/data/analytics";
import { api } from "@/services";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
    const [orders, agents, payoutBatches] = await Promise.all([
        api.orders.list(),
        api.agents.list(),
        api.finance.payoutBatches(),
    ]);

    const openOrders = orders.filter((order) => order.status === "awaiting_acceptance");
    const activeAgents = agents.filter((agent) => agent.status === "active");

    return (
        <div className="space-y-6">
            <InsightBanner insight={smartInsight} />

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {dashboardKpis.map((stat) => (
                    <KpiCard key={stat.id} stat={stat} />
                ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-12">
                <Card className="rounded-lg border-border p-5 shadow-none xl:col-span-5">
                    <h2 className="text-base font-semibold text-foreground">Monthly GMV</h2>
                    <div className="mt-4">
                        <MonthlyGmvChart data={monthlyGmv} />
                    </div>
                </Card>

                <Card className="rounded-lg border-border p-5 shadow-none xl:col-span-4">
                    <h2 className="text-base font-semibold text-foreground">Publisher growth</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        64 new publishers joined in July
                    </p>
                    <div className="mt-2">
                        <PublisherGrowthChart data={publisherGrowth} />
                    </div>
                </Card>

                <Card className="rounded-lg border-border p-5 shadow-none xl:col-span-3">
                    <h2 className="text-base font-semibold text-foreground">Recent bookings</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        Bookings this month: {formatNumber(bookingsThisMonth.count)}{" "}
                        <span className="font-medium text-foreground">
                            Average value: {formatCompactINR(bookingsThisMonth.averageValue)}
                        </span>
                    </p>
                    <ul className="mt-4 space-y-4">
                        {recentBookings.map((booking) => (
                            <li key={booking.id} className="flex items-center gap-3">
                                <InitialsAvatar name={booking.advertiser} size="md" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-foreground">
                                        {booking.advertiser}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        Campaign: {booking.campaign}
                                    </p>
                                </div>
                                <p className="text-sm font-semibold text-foreground">
                                    {formatINR(booking.amount)}
                                </p>
                            </li>
                        ))}
                    </ul>
                </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-12">
                <div className="xl:col-span-5">
                    <PayoutRunsCard batches={payoutBatches} />
                </div>
                <div className="xl:col-span-4">
                    <AddPublisherCard />
                </div>
                <div className="xl:col-span-3">
                    <AssignOrderCard openOrders={openOrders} agents={activeAgents} />
                </div>
            </div>
        </div>
    );
}
