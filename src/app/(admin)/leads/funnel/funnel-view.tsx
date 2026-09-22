"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KpiCard } from "@/components/adx/kpi-card";
import { PageHeader } from "@/components/adx/page-header";
import { SectionCard } from "@/components/adx/section-card";
import { formatINR } from "@/lib/format";
import { LEAD_STAGES, LOST_REASON_META, STAGE_META, channelLabel, rateLabel, type FunnelGroup, type FunnelQuery, type LeadFunnel, type LeadLostReason, type LeadSide } from "@/services/leads";
import { ChannelFunnelCard } from "./channel-funnel";

interface FunnelViewProps {
    funnel: LeadFunnel;
    query: FunnelQuery;
    onQuery: (query: FunnelQuery) => void;
}

/** The funnel's bar: count over the biggest stage, so the widest bar is the widest column. */
function widthOf(count: number, max: number): string {
    return max > 0 ? `${Math.max(2, Math.round((count / max) * 100))}%` : "2%";
}

/**
 * LH2 (LH9 finishes it): the funnel — every stage with its count, its
 * pipeline value and the average days spent there; conversion by source,
 * agent, city, category and channel; the loss mix; the time to convert.
 * Aggregates only, from `GET /leads/funnel`.
 */
export function FunnelView({ funnel, query, onQuery }: FunnelViewProps) {
    const counts = new Map(funnel.byStage.map((row) => [row.stage, row]));
    const max = Math.max(0, ...funnel.byStage.map((row) => row.count));
    const totals = funnel.totals;

    return (
        <div className="space-y-5" data-testid="leads-funnel">
            <PageHeader
                title="Funnel"
                subtitle="Where the leads are and which doors close. Counts only — nobody's figure leaves the server."
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <Select value={query.side ?? "ALL"} onValueChange={(value) => onQuery({ ...query, side: value === "ALL" ? undefined : (value as LeadSide) })}>
                            <SelectTrigger className="h-9 w-[160px] bg-card" aria-label="Side">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Both sides</SelectItem>
                                <SelectItem value="PUBLISHER">Publisher</SelectItem>
                                <SelectItem value="ADVERTISER">Advertiser</SelectItem>
                            </SelectContent>
                        </Select>
                        <Input type="date" className="h-9 w-[150px] bg-card" aria-label="From" value={query.from ?? ""} onChange={(event) => onQuery({ ...query, from: event.target.value || undefined })} />
                        <Input type="date" className="h-9 w-[150px] bg-card" aria-label="To" value={query.to ?? ""} onChange={(event) => onQuery({ ...query, to: event.target.value || undefined })} />
                        <Input className="h-9 w-[160px] bg-card" placeholder="City" aria-label="City" value={query.city ?? ""} onChange={(event) => onQuery({ ...query, city: event.target.value || undefined })} />
                    </div>
                }
            />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <KpiCard stat={{ id: "leads", label: "Leads", value: String(totals.leads) }} />
                <KpiCard stat={{ id: "converted", label: "Converted", value: String(totals.converted), hint: rateLabel(totals.converted, totals.leads) }} />
                <KpiCard stat={{ id: "activated", label: "Activated", value: String(totals.activated), hint: rateLabel(totals.activated, totals.leads) }} />
                <KpiCard stat={{ id: "lost", label: "Lost", value: String(totals.lost), hint: `${totals.recycled} recycled` }} />
                <KpiCard stat={{ id: "days", label: "Days to convert", value: funnel.avgDaysToConvert === null ? "—" : String(funnel.avgDaysToConvert), hint: "Average, creation to account" }} />
            </div>

            <SectionCard title="By stage" description="How many sit at each stage, the estimated value behind them, and the average days they have sat there.">
                <ol className="space-y-1.5" data-testid="funnel-stages">
                    {LEAD_STAGES.map((stage) => {
                        const row = counts.get(stage);
                        const count = row?.count ?? 0;
                        return (
                            <li key={stage} className="grid grid-cols-[60px_1fr_90px_110px_80px] items-center gap-3 text-sm" data-testid={`funnel-stage-${stage}`}>
                                <span className="font-mono text-[11px] text-muted-foreground">{STAGE_META[stage].short}</span>
                                <div className="flex items-center gap-2">
                                    <span className="w-24 shrink-0 text-foreground">{STAGE_META[stage].label}</span>
                                    <div className="h-2.5 flex-1 rounded-full bg-muted">
                                        <div className={stage === "LOST" ? "h-2.5 rounded-full bg-danger/60" : "h-2.5 rounded-full bg-primary/70"} style={{ width: widthOf(count, max) }} />
                                    </div>
                                </div>
                                <span className="text-right tabular-nums text-foreground">{count}</span>
                                <span className="text-right text-xs tabular-nums text-muted-foreground">{row?.value ? formatINR(Number(row.value)) : "—"}</span>
                                <span className="text-right text-xs tabular-nums text-muted-foreground">{row?.avgDaysInStage !== null && row?.avgDaysInStage !== undefined ? `${row.avgDaysInStage} d` : "—"}</span>
                            </li>
                        );
                    })}
                </ol>
            </SectionCard>

            <div className="grid gap-4 lg:grid-cols-2">
                <GroupCard title="By source" rows={funnel.bySource} />
                <GroupCard title="By agent" rows={funnel.byAgent} />
                <GroupCard title="By city" rows={funnel.byCity} />
                <GroupCard title="By category" rows={funnel.byCategory} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard title="By channel" description="Which channel produced the first contact, the reply and the conversion (D14).">
                    {funnel.byChannel.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No channel has closed a lead yet.</p>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-muted-foreground">
                                    <th className="py-1 font-medium">Channel</th>
                                    <th className="py-1 text-right font-medium">First contact</th>
                                    <th className="py-1 text-right font-medium">Engaged</th>
                                    <th className="py-1 text-right font-medium">Converted</th>
                                </tr>
                            </thead>
                            <tbody>
                                {funnel.byChannel.map((row) => (
                                    <tr key={row.channel} className="border-t" data-testid={`funnel-channel-${row.channel}`}>
                                        <td className="py-1.5">{channelLabel(row.channel)}</td>
                                        <td className="py-1.5 text-right tabular-nums">{row.firstContact}</td>
                                        <td className="py-1.5 text-right tabular-nums">{row.engaged}</td>
                                        <td className="py-1.5 text-right tabular-nums">{row.converted}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </SectionCard>
                <SectionCard title="Why leads were lost" description="The reasons behind every LOST, D11's list.">
                    {funnel.lossMix.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nothing lost in this window.</p>
                    ) : (
                        <ul className="space-y-1.5 text-sm">
                            {funnel.lossMix.map((row) => (
                                <li key={row.reason} className="flex items-center justify-between" data-testid={`funnel-loss-${row.reason}`}>
                                    <span>{LOST_REASON_META[row.reason as LeadLostReason]?.label ?? row.reason}</span>
                                    <span className="tabular-nums text-muted-foreground">{row.count}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </SectionCard>
            </div>

            {/* LH6: what the outreach hub moved per channel, beside the attribution above. */}
            <ChannelFunnelCard side={query.side} />
        </div>
    );
}

function GroupCard({ title, rows }: { title: string; rows: FunnelGroup[] }) {
    return (
        <Card className="rounded-lg border-border p-5 shadow-none">
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
            {rows.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Nothing to count.</p>
            ) : (
                <table className="mt-3 w-full text-sm">
                    <thead>
                        <tr className="text-left text-xs text-muted-foreground">
                            <th className="py-1 font-medium">{title.replace("By ", "")}</th>
                            <th className="py-1 text-right font-medium">Leads</th>
                            <th className="py-1 text-right font-medium">Converted</th>
                            <th className="py-1 text-right font-medium">Activated</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.slice(0, 12).map((row) => (
                            <tr key={row.key} className="border-t">
                                <td className="py-1.5">{row.label ?? row.key}</td>
                                <td className="py-1.5 text-right tabular-nums">{row.total}</td>
                                <td className="py-1.5 text-right tabular-nums">
                                    {row.converted} <span className="text-xs text-muted-foreground">({rateLabel(row.converted, row.total)})</span>
                                </td>
                                <td className="py-1.5 text-right tabular-nums">{row.activated}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </Card>
    );
}
