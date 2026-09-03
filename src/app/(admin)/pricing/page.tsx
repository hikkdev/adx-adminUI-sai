import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/adx/kpi-card";
import { PageHeader } from "@/components/adx/page-header";
import { cn } from "@/lib/utils";
import { api } from "@/services";
import type { NamedStatRow } from "@/types";
import { RateRealisationChart } from "@/components/charts/lazy";
import { PricingNav } from "./pricing-nav";

export const metadata: Metadata = { title: "Pricing" };

function StatListCard({ title, rows }: { title: string; rows: NamedStatRow[] }) {
    return (
        <Card className="rounded-lg border-border p-5 shadow-none">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            <ul className="mt-4 divide-y">
                {rows.map((row) => (
                    <li key={row.name} className="flex items-center justify-between gap-4 py-2.5">
                        <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
                            <p className="text-xs text-muted-foreground">{row.detail}</p>
                        </div>
                        <span
                            className={cn(
                                "shrink-0 text-sm font-semibold",
                                row.tone === "positive" ? "text-success" : "text-foreground"
                            )}
                        >
                            {row.value}
                        </span>
                    </li>
                ))}
            </ul>
        </Card>
    );
}

export default async function PricingOverviewPage() {
    const overview = await api.pricing.overview();
    const pending = overview.approvals.filter(
        (approval) => approval.status === "pending" || approval.status === "overdue"
    );

    return (
        <div className="space-y-5">
            <PricingNav />
            <PageHeader
                title="Pricing engine"
                subtitle="Rate cards, rules and guardrails across all inventory"
                actions={
                    <Button variant="outline" className="bg-card" asChild>
                        <Link href="/pricing/simulator">Open simulator</Link>
                    </Button>
                }
            />

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                {overview.kpis.map((stat) => (
                    <KpiCard key={stat.id} stat={stat} />
                ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
                <Card className="rounded-lg border-border p-5 shadow-none xl:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="text-base font-semibold text-foreground">Rate realisation</h2>
                            <p className="mt-0.5 text-sm text-muted-foreground">
                                Card rate versus realised rate, last 8 weeks
                            </p>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                                <span className="size-2.5 rounded-sm bg-foreground" />
                                Card rate
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="size-2.5 rounded-sm bg-muted-foreground/60" />
                                Realised rate
                            </span>
                        </div>
                    </div>
                    <div className="mt-4">
                        <RateRealisationChart data={overview.realisation} />
                    </div>
                </Card>

                <Card className="flex flex-col rounded-lg border-border p-5 shadow-none">
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-semibold text-foreground">
                            Pending price approvals
                        </h2>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
                            {pending.length}
                        </span>
                    </div>
                    <ul className="mt-3 flex-1 divide-y">
                        {pending.map((approval) => (
                            <li key={approval.id} className="py-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs text-muted-foreground">{approval.id}</p>
                                        <p className="text-sm font-medium text-foreground">
                                            {approval.advertiser}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                            Requested discount
                                        </p>
                                        <p className="text-sm font-semibold text-foreground">
                                            {approval.requestedDiscount}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                            Margin impact
                                        </p>
                                        <p className="text-sm font-semibold text-danger">
                                            {approval.marginImpact}
                                        </p>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                    <Button variant="outline" className="mt-3 w-full bg-card" asChild>
                        <Link href="/pricing/approvals">Open approval queue</Link>
                    </Button>
                </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
                <StatListCard title="Top discount drivers" rows={overview.discountDrivers} />
                <StatListCard title="Categories above card rate" rows={overview.categoriesAboveCard} />
                <StatListCard title="Rules firing most" rows={overview.rulesFiringMost} />
            </div>
        </div>
    );
}
