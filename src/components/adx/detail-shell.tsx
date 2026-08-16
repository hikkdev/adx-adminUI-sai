"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiCard } from "@/components/adx/kpi-card";
import type { KpiStat } from "@/types";

export interface DetailTab {
    value: string;
    label: string;
    content: React.ReactNode;
}

interface DetailShellProps {
    backHref: string;
    backLabel: string;
    title: string;
    subtitle?: string;
    actions?: React.ReactNode;
    kpis?: KpiStat[];
    tabs: DetailTab[];
    defaultTab?: string;
}

/**
 * Master-detail page scaffold: back link, heading row, KPI tiles,
 * underline tabs. Used by every entity detail screen.
 */
export function DetailShell({
    backHref,
    backLabel,
    title,
    subtitle,
    actions,
    kpis,
    tabs,
    defaultTab,
}: DetailShellProps) {
    return (
        <div className="space-y-5">
            <div>
                <Link
                    href={backHref}
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="size-4" />
                    {backLabel}
                </Link>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                            {title}
                        </h1>
                        {subtitle && (
                            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
                        )}
                    </div>
                    {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
                </div>
            </div>

            {kpis && kpis.length > 0 && (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {kpis.map((stat) => (
                        <KpiCard key={stat.id} stat={stat} />
                    ))}
                </div>
            )}

            <Tabs defaultValue={defaultTab ?? tabs[0]?.value}>
                <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b bg-transparent p-0">
                    {tabs.map((tab) => (
                        <TabsTrigger
                            key={tab.value}
                            value={tab.value}
                            className="rounded-none border-b-2 border-transparent px-0 pb-2.5 pt-1 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                        >
                            {tab.label}
                        </TabsTrigger>
                    ))}
                </TabsList>
                {tabs.map((tab) => (
                    <TabsContent key={tab.value} value={tab.value} className="mt-5">
                        {tab.content}
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
}
