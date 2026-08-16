"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatNumber } from "@/lib/format";
import type { SurgeWindow } from "@/types";

interface SeasonalityViewProps {
    embedded?: boolean;
    weeks: [string, string][];
    windows: SurgeWindow[];
    detail: {
        title: string;
        kind: string;
        fields: [string, string][];
        appliesTo: string[];
        sitesInWindow: number;
        bookingsHeld: number;
    };
}

const kindClasses = {
    uplift: "bg-warning-soft text-warning",
    soft: "bg-info-soft text-info",
    blocked: "bg-danger-soft text-danger",
};

export function SeasonalityView({ weeks, windows, detail, embedded }: SeasonalityViewProps) {
    return (
        <div className="space-y-5">
            <PageHeader
                size={embedded ? "section" : "page"}
                title="Seasonality and surge"
                subtitle="Pricing windows across the next 12 weeks"
                actions={
                    <>
                        <Button
                            variant="outline"
                            className="bg-card"
                            onClick={() => toast.info("All windows restored to their saved state.")}
                        >
                            Reset
                        </Button>
                        <Button onClick={() => toast.info("Pick dates and a multiplier to add a window.")}>
                            <Plus className="mr-1.5 size-4" />
                            New window
                        </Button>
                    </>
                }
            />

            <div className="grid gap-4 xl:grid-cols-4">
                {/* Gantt strip */}
                <Card className="overflow-x-auto rounded-lg border-border shadow-none xl:col-span-3">
                    <div className="min-w-[860px]">
                        <div
                            className="grid border-b bg-muted/50"
                            style={{ gridTemplateColumns: "180px repeat(12, 1fr)" }}
                        >
                            <div className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Surge programme
                            </div>
                            {weeks.map(([week, date]) => (
                                <div key={week} className="px-1 py-2 text-center">
                                    <p className="text-[10px] font-medium text-muted-foreground">{week}</p>
                                    <p className="text-[11px] font-semibold text-foreground">{date}</p>
                                </div>
                            ))}
                        </div>
                        {windows.map((window) => (
                            <div
                                key={window.id}
                                className="grid items-center border-b last:border-0"
                                style={{ gridTemplateColumns: "180px repeat(12, 1fr)" }}
                            >
                                <div className="px-4 py-3.5">
                                    <p className="text-sm font-medium text-foreground">
                                        {window.programme}
                                    </p>
                                    <p className="text-xs text-muted-foreground">{window.cities}</p>
                                </div>
                                <div
                                    className="col-span-12 px-0.5 py-2"
                                    style={{
                                        gridColumnStart: window.fromWeek + 1,
                                        gridColumnEnd: window.toWeek + 2,
                                    }}
                                >
                                    <button
                                        type="button"
                                        onClick={() =>
                                            toast.info(`${window.programme}: ${window.multiplier}`)
                                        }
                                        className={cn(
                                            "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium",
                                            kindClasses[window.kind]
                                        )}
                                    >
                                        <span className="truncate">{window.label}</span>
                                        <span className="shrink-0 tabular-nums">{window.multiplier}</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                        <div className="flex items-center justify-between px-4 py-2.5 text-xs text-muted-foreground">
                            <span>{windows.length} surge programmes</span>
                            <button
                                type="button"
                                className="font-medium text-primary underline-offset-4 hover:underline"
                                onClick={() => toast.info("The full-year calendar opens here.")}
                            >
                                Manage calendar
                            </button>
                        </div>
                    </div>
                </Card>

                {/* Window detail */}
                <Card className="h-fit rounded-lg border-border p-5 shadow-none">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Window detail
                    </h3>
                    <div className="mt-2 flex items-center gap-2">
                        <p className="text-base font-semibold text-foreground">{detail.title}</p>
                        <StatusBadge status={{ label: detail.kind, tone: "warning" }} />
                    </div>
                    <dl className="mt-4 space-y-3 text-sm">
                        {detail.fields.map(([label, value]) => (
                            <div key={label} className="flex items-center justify-between gap-4">
                                <dt className="text-muted-foreground">{label}</dt>
                                <dd className="font-medium text-foreground">{value}</dd>
                            </div>
                        ))}
                    </dl>

                    <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Applies to
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {detail.appliesTo.map((media) => (
                            <span
                                key={media}
                                className="rounded-full border bg-card px-2.5 py-1 text-xs font-medium"
                            >
                                {media}
                            </span>
                        ))}
                    </div>

                    <label className="mt-5 flex items-center justify-between gap-4 border-t pt-4">
                        <span>
                            <span className="block text-sm font-medium text-foreground">
                                Stacks with category rules
                            </span>
                            <span className="block text-xs text-muted-foreground">
                                Category multipliers compound on top of this window
                            </span>
                        </span>
                        <Switch defaultChecked />
                    </label>

                    <dl className="mt-4 space-y-3 border-t pt-4 text-sm">
                        <div className="flex items-center justify-between">
                            <dt className="text-muted-foreground">Sites in window</dt>
                            <dd className="font-medium">{formatNumber(detail.sitesInWindow)}</dd>
                        </div>
                        <div className="flex items-center justify-between">
                            <dt className="text-muted-foreground">Bookings held</dt>
                            <dd className="font-medium">{formatNumber(detail.bookingsHeld)}</dd>
                        </div>
                    </dl>
                </Card>
            </div>
        </div>
    );
}
