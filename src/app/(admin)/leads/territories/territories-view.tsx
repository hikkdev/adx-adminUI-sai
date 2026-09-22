"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/adx/page-header";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime } from "@/lib/format";
import { agentLabel } from "@/services/agents";
import { LEAD_SIDE_LABEL, leadsService, type Territory } from "@/services/leads";
import { TerritoryDialog } from "./territory-dialog";
import type { TerritoriesData } from "./territories-loader";

/**
 * LH5 (D8): the Territories desk — every drawn area, whose it is, how
 * many leads it has routed, on or off. A new one is drawn on the map; the
 * desk renames, reassigns and switches routing.
 */
export function TerritoriesView({ data, onChanged }: { data: TerritoriesData; onChanged: () => void }) {
    const [editing, setEditing] = React.useState<Territory | null>(null);
    const [busy, setBusy] = React.useState<string | null>(null);
    const agentOf = (id: string) => data.agents.find((agent) => agent.id === id);

    async function toggle(territory: Territory, isActive: boolean) {
        setBusy(territory.id);
        try {
            await leadsService.updateTerritory(territory.id, { isActive });
            toast.success(isActive ? `${territory.name} routing on` : `${territory.name} routing off`);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "That did not reach ADX.");
        } finally {
            setBusy(null);
        }
    }

    return (
        <div className="space-y-5" data-testid="territories-desk">
            <PageHeader
                title="Territories"
                subtitle="A drawn area whose new leads land on one agent first. Route-only: every agent of the side still sees the whole map, and a claim or an ops assignment stands."
                actions={
                    <Button size="sm" asChild>
                        <Link href="/leads/map">
                            <PenLine className="mr-1.5 size-3.5" /> Draw one on the map
                        </Link>
                    </Button>
                }
            />
            <SectionCard title={`${data.territories.length} ${data.territories.length === 1 ? "territory" : "territories"}`} description="Leads counts what the territory routed since it was drawn.">
                {data.territories.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None yet. Open the map, draw an area and save it as a territory.</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs text-muted-foreground">
                                <th className="py-1 font-medium">Territory</th>
                                <th className="py-1 font-medium">Side</th>
                                <th className="py-1 font-medium">Agent</th>
                                <th className="py-1 text-right font-medium">Leads</th>
                                <th className="py-1 font-medium">Drawn</th>
                                <th className="py-1 font-medium">Routing</th>
                                <th className="py-1" />
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {data.territories.map((row) => {
                                const agent = agentOf(row.agentId);
                                return (
                                    <tr key={row.id} data-testid={`territory-${row.id}`}>
                                        <td className="py-2 font-medium text-foreground">
                                            {row.name}
                                            <span className="ml-2 text-xs text-muted-foreground">{row.polygon.length} corners{row.city ? ` · ${row.city}` : ""}</span>
                                        </td>
                                        <td className="py-2">
                                            <StatusBadge status={{ label: LEAD_SIDE_LABEL[row.side], tone: row.side === "PUBLISHER" ? "info" : "warning" }} />
                                        </td>
                                        <td className="py-2">{agent ? agentLabel(agent) : row.agentId}</td>
                                        <td className="py-2 text-right tabular-nums">{row.leadCount}</td>
                                        <td className="py-2 text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</td>
                                        <td className="py-2">
                                            <Switch checked={row.isActive} disabled={busy === row.id} aria-label={`${row.name} routing`} onCheckedChange={(value) => void toggle(row, value)} />
                                        </td>
                                        <td className="py-2 text-right">
                                            <Button size="sm" variant="outline" onClick={() => setEditing(row)} data-testid={`territory-edit-${row.id}`}>
                                                Edit
                                            </Button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </SectionCard>
            <TerritoryDialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} territory={editing} agents={data.agents} onSaved={onChanged} />
        </div>
    );
}
