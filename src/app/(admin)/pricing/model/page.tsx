import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { api } from "@/services";
import { PricingNav } from "../pricing-nav";
import { CategoriesView } from "../categories/categories-view";
import { RateCardsTable } from "../rate-cards/rate-cards-table";
import { SeasonalityView } from "../seasonality/seasonality-view";
import { ModifiersSection } from "./modifiers-section";

export const metadata: Metadata = { title: "Pricing Model" };

const stages = [
    { id: "rate-cards", step: 1, title: "Base rate card", caption: "City and media type set the starting weekly rate" },
    { id: "modifiers", step: 2, title: "Physical modifiers", caption: "Size, illumination and placement scale it" },
    { id: "categories", step: 3, title: "Category multiplier", caption: "Advertiser category adjusts or blocks" },
    { id: "seasonality", step: 4, title: "Seasonality window", caption: "Festive uplifts and softening periods" },
    { id: "rules", step: 5, title: "Custom rules", caption: "Targeted discounts and uplifts on top" },
];

export default async function PricingModelPage() {
    const [rateCards, dimensions, categories, seasonality, rule, overview] = await Promise.all([
        api.pricing.rateCards(),
        api.pricing.dimensions(),
        api.pricing.categories(),
        api.pricing.seasonality(),
        api.pricing.rule(),
        api.pricing.overview(),
    ]);

    return (
        <div className="space-y-5">
            <PricingNav />
            <PageHeader
                title="Pricing model"
                subtitle="Every layer of a quote, in the exact order it is applied"
                actions={
                    <Button variant="outline" className="bg-card" asChild>
                        <Link href="/pricing/simulator">Test in simulator</Link>
                    </Button>
                }
            />

            {/* Calculation pipeline strip */}
            <Card className="rounded-lg border-border shadow-none">
                <ol className="flex flex-wrap items-stretch gap-y-3 p-4">
                    {stages.map((stage, index) => (
                        <li key={stage.id} className="flex min-w-[180px] flex-1 items-center gap-3">
                            <a href={`#${stage.id}`} className="group flex items-center gap-2.5">
                                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
                                    {stage.step}
                                </span>
                                <span>
                                    <span className="block text-sm font-medium text-foreground underline-offset-4 group-hover:underline">
                                        {stage.title}
                                    </span>
                                    <span className="block text-[11px] leading-tight text-muted-foreground">
                                        {stage.caption}
                                    </span>
                                </span>
                            </a>
                            {index < stages.length - 1 && (
                                <ArrowRight className="mx-2 hidden size-4 shrink-0 text-muted-foreground/40 xl:block" />
                            )}
                        </li>
                    ))}
                </ol>
                <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
                    After these five layers: negotiated discounts (routed to Approvals when below
                    the floor), production charges, GST, commission and TDS. The Simulator traces
                    the full calculation on a real quote.
                </p>
            </Card>

            {/* Stage 1 */}
            <section id="rate-cards" className="scroll-mt-24 border-t pt-5">
                <RateCardsTable rateCards={rateCards} embedded />
            </section>

            {/* Stage 2 */}
            <section id="modifiers" className="scroll-mt-24 space-y-5 border-t pt-5">
                <PageHeader
                    size="section"
                    title="Physical modifiers"
                    subtitle="How size, light and placement scale the base rate"
                />
                <ModifiersSection
                    sizeBands={dimensions.sizeBands}
                    sqftSlabs={dimensions.sqftSlabs}
                    illuminationMultipliers={dimensions.illuminationMultipliers}
                    aspectFactors={dimensions.aspectFactors}
                    workedExample={dimensions.workedExample}
                />
            </section>

            {/* Stage 3 */}
            <section id="categories" className="scroll-mt-24 border-t pt-5">
                <CategoriesView rows={categories.rows} controls={categories.controls} embedded />
            </section>

            {/* Stage 4 */}
            <section id="seasonality" className="scroll-mt-24 border-t pt-5">
                <SeasonalityView
                    weeks={seasonality.weeks}
                    windows={seasonality.windows}
                    detail={seasonality.detail}
                    embedded
                />
            </section>

            {/* Stage 5 */}
            <section id="rules" className="scroll-mt-24 space-y-5 border-t pt-5">
                <PageHeader
                    size="section"
                    title="Custom rules"
                    subtitle="Targeted adjustments layered after every other stage"
                    actions={
                        <Button asChild>
                            <Link href="/pricing/rules">Open rule builder</Link>
                        </Button>
                    }
                />
                <div className="grid gap-4 xl:grid-cols-2">
                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold text-foreground">{rule.name}</h3>
                            <StatusBadge status={{ label: rule.status, tone: "neutral" }} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Priority {rule.priority} · {rule.schedule.from} to {rule.schedule.to} ·
                            adjustment {rule.adjustment.value} on {rule.adjustment.appliesTo.toLowerCase()}
                        </p>
                        <ul className="mt-3 space-y-1.5">
                            {rule.conditions.map((condition) => (
                                <li key={condition.id} className="text-sm text-muted-foreground">
                                    <span className="font-medium text-foreground">{condition.field}</span>{" "}
                                    {condition.operator}{" "}
                                    <span className="font-medium text-foreground">{condition.value}</span>
                                </li>
                            ))}
                        </ul>
                    </Card>
                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-sm font-semibold text-foreground">Rules firing most</h3>
                        <ul className="mt-3 divide-y">
                            {overview.rulesFiringMost.map((row) => (
                                <li
                                    key={row.name}
                                    className="flex items-center justify-between gap-4 py-2.5"
                                >
                                    <div>
                                        <p className="text-sm font-medium text-foreground">{row.name}</p>
                                        <p className="text-xs text-muted-foreground">{row.detail}</p>
                                    </div>
                                    <span className="text-sm font-semibold">{row.value}</span>
                                </li>
                            ))}
                        </ul>
                    </Card>
                </div>
            </section>
        </div>
    );
}
