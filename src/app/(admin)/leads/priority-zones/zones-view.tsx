"use client";

import * as React from "react";
import Link from "next/link";
import { PenLine, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/adx/page-header";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime, formatMoney, toPaise } from "@/lib/format";
import { LEAD_SIDE_LABEL, zoneBudgetUsed, zoneState, type PriorityZone } from "@/services/leads";
import { ZoneDialog } from "./zone-dialog";
import type { ZonesData } from "./zones-loader";

/** The rupees of every live zone's spend, as a decimal string — the month's meter reads it against the platform cap. */
export function totalSpent(zones: readonly Pick<PriorityZone, "spent">[]): string {
    const paise = zones.reduce((sum, zone) => sum + toPaise(zone.spent), BigInt(0));
    const text = paise.toString().padStart(3, "0");
    return `${text.slice(0, -2)}.${text.slice(-2)}`;
}

/**
 * LH5 (D7): the Priority zones desk — every zone with its window, its
 * top-up, its budget meter and what it has paid; a category push is made
 * here, a drawn one on the map. The platform's monthly cap sits above
 * them all.
 */
export function ZonesView({ data, onChanged }: { data: ZonesData; onChanged: () => void }) {
    const [editing, setEditing] = React.useState<PriorityZone | null>(null);
    const [creating, setCreating] = React.useState(false);
    const live = data.zones.filter((zone) => zoneState(zone).state === "LIVE");
    const spent = totalSpent(data.zones);
    const capUsed = data.policy && data.policy.monthlyCap > 0 ? Math.min(1, Number(spent) / data.policy.monthlyCap) : null;

    return (
        <div className="space-y-5" data-testid="zones-desk">
            <PageHeader
                title="Priority zones"
                subtitle="A locality or a category worth more for a while: an activation inside it pays the agent the standard rate plus a fixed top-up, under the zone's budget and the platform's monthly cap."
                actions={
                    <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" asChild>
                            <Link href="/leads/map">
                                <PenLine className="mr-1.5 size-3.5" /> Draw one on the map
                            </Link>
                        </Button>
                        <Button size="sm" onClick={() => setCreating(true)} data-testid="zone-new">
                            <Plus className="mr-1.5 size-3.5" /> Category push
                        </Button>
                    </div>
                }
            />

            {data.policy ? (
                <SectionCard title="This platform" description="The default top-up a zone pays when it names none, and the cap across every zone — both under Settings › Leads scoring.">
                    <div className="grid gap-4 sm:grid-cols-3">
                        <div>
                            <p className="text-xs text-muted-foreground">Default top-up</p>
                            <p className="text-lg font-semibold tabular-nums text-foreground">{formatMoney(String(data.policy.topUp.toFixed(2)))}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Live zones</p>
                            <p className="text-lg font-semibold tabular-nums text-foreground">{live.length}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Paid across zones, against the monthly cap</p>
                            <p className="text-lg font-semibold tabular-nums text-foreground">
                                {formatMoney(spent)} <span className="text-sm font-normal text-muted-foreground">of {formatMoney(String(data.policy.monthlyCap.toFixed(2)))}</span>
                            </p>
                            {capUsed !== null ? <Progress value={capUsed * 100} className="mt-1.5 h-1.5" aria-label="Monthly cap used" /> : null}
                        </div>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">The cap is read off this month's top-ups on the ledger; the figure here sums every zone's lifetime spend and is the wider of the two.</p>
                </SectionCard>
            ) : null}

            <SectionCard title={`${data.zones.length} ${data.zones.length === 1 ? "zone" : "zones"}`} description="A zone is a drawn area, a category, or both; its top-up is its own or the platform's default; the meter is its budget.">
                {data.zones.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None yet. Draw an area on the map, or make a category push here.</p>
                ) : (
                    <div className="divide-y">
                        {data.zones.map((zone) => {
                            const state = zoneState(zone);
                            const used = zoneBudgetUsed(zone);
                            return (
                                <div key={zone.id} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid={`zone-${zone.id}`}>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-sm font-medium text-foreground">{zone.name}</span>
                                            <StatusBadge status={state} />
                                            {zone.side ? <StatusBadge status={{ label: LEAD_SIDE_LABEL[zone.side], tone: "neutral" }} /> : null}
                                        </div>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            {zone.polygon ? `${zone.polygon.length}-corner area` : "No area"}
                                            {zone.category ? ` · ${zone.category}` : ""} · {formatDateTime(zone.startsAt)} → {formatDateTime(zone.endsAt)}
                                        </p>
                                        <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                                            +{formatMoney(Number(zone.topUp) > 0 ? zone.topUp : (data.policy ? String(data.policy.topUp.toFixed(2)) : zone.topUp))} per activation
                                            {Number(zone.topUp) > 0 ? "" : " (the default)"} · paid {formatMoney(zone.spent)}
                                            {zone.budgetCap ? ` of ${formatMoney(zone.budgetCap)}` : " · no cap"}
                                        </p>
                                        {used !== null ? <Progress value={used * 100} className="mt-1.5 h-1.5 max-w-xs" aria-label={`${zone.name} budget used`} /> : null}
                                    </div>
                                    <Button size="sm" variant="outline" onClick={() => setEditing(zone)} data-testid={`zone-edit-${zone.id}`}>
                                        Edit
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </SectionCard>

            <ZoneDialog open={creating} onOpenChange={setCreating} zone={null} defaultTopUp={data.policy ? String(data.policy.topUp) : undefined} onSaved={onChanged} />
            <ZoneDialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} zone={editing} defaultTopUp={data.policy ? String(data.policy.topUp) : undefined} onSaved={onChanged} />
        </div>
    );
}
