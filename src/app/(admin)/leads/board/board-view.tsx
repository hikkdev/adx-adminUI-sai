"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatINR } from "@/lib/format";
import { agentLabel, type AgentSummary } from "@/services/agents";
import { LEAD_SIDE_LABEL, LEAD_STAGES, STAGE_META, daysInStage, deskMayMove, leadsService, recycledFlag, temperatureMeta, type Lead, type LeadSide, type LeadStage, type LeadsPage } from "@/services/leads";
import { LostDialog } from "../lost-dialog";

interface BoardViewProps {
    page: LeadsPage;
    side: LeadSide;
    onSideChange: (side: LeadSide) => void;
    agents: AgentSummary[];
    onChanged: () => void;
}

/** The columns the board draws — every stage, in order; LOST last and narrow. */
const COLUMNS: readonly LeadStage[] = LEAD_STAGES;

/**
 * LH2: the kanban. A column per stage; a card per lead with its
 * temperature, value, agent and days in stage; drag a card where the desk
 * may move it (`deskMayMove` mirrors the server's rule — a drop the server
 * would refuse is not offered), and a drop on LOST opens the reason dialog.
 */
export function BoardView({ page, side, onSideChange, agents, onChanged }: BoardViewProps) {
    const [dragging, setDragging] = React.useState<Lead | null>(null);
    const [over, setOver] = React.useState<LeadStage | null>(null);
    const [losing, setLosing] = React.useState<Lead | null>(null);
    const [busy, setBusy] = React.useState(false);
    const byStage = React.useMemo(() => {
        const map = new Map<LeadStage, Lead[]>();
        for (const stage of COLUMNS) map.set(stage, []);
        for (const lead of page.items) map.get(lead.stage ?? "SOURCED")?.push(lead);
        return map;
    }, [page.items]);
    const agentName = (id: string | null) => {
        if (!id) return null;
        const agent = agents.find((candidate) => candidate.id === id);
        return agent ? agentLabel(agent) : id;
    };

    async function drop(lead: Lead, to: LeadStage) {
        setOver(null);
        setDragging(null);
        const from = lead.stage ?? "SOURCED";
        if (!deskMayMove(from, to)) return;
        if (to === "LOST") {
            setLosing(lead);
            return;
        }
        setBusy(true);
        try {
            await leadsService.moveStage(lead.id, { stage: to });
            toast.success(`${lead.businessName} → ${STAGE_META[to].label}`);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "That did not reach ADX.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-4" data-testid="leads-board">
            <PageHeader
                title="Board"
                subtitle={`${page.total} ${LEAD_SIDE_LABEL[side].toLowerCase()} leads by stage${
                    page.total > page.items.length ? `, the hottest ${page.items.length} drawn as cards \u2014 the column counts are the whole ${page.total}` : ""
                }. Drag a card forward; the money-bearing stages move on their own.`}
                actions={
                    <Select value={side} onValueChange={(value) => onSideChange(value as LeadSide)}>
                        <SelectTrigger className="h-9 w-[180px] bg-card" aria-label="Side">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="PUBLISHER">Publisher leads</SelectItem>
                            <SelectItem value="ADVERTISER">Advertiser leads</SelectItem>
                        </SelectContent>
                    </Select>
                }
            />
            <div className="flex gap-3 overflow-x-auto pb-3" role="list">
                {COLUMNS.map((stage) => {
                    const cards = byStage.get(stage) ?? [];
                    const droppable = dragging ? deskMayMove(dragging.stage ?? "SOURCED", stage) : false;
                    return (
                        <div
                            key={stage}
                            role="listitem"
                            data-testid={`board-column-${stage}`}
                            onDragOver={(event) => {
                                if (!droppable) return;
                                event.preventDefault();
                                setOver(stage);
                            }}
                            onDragLeave={() => setOver((current) => (current === stage ? null : current))}
                            onDrop={(event) => {
                                event.preventDefault();
                                if (dragging) void drop(dragging, stage);
                            }}
                            className={cn(
                                "flex w-[220px] shrink-0 flex-col rounded-lg border bg-muted/30 transition-colors",
                                stage === "LOST" && "w-[180px]",
                                dragging && droppable && "border-dashed border-primary/50",
                                over === stage && droppable && "bg-primary/5",
                                dragging && !droppable && "opacity-60",
                            )}
                        >
                            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                                <div className="flex items-center gap-1.5">
                                    <span className="font-mono text-[10px] text-muted-foreground">{STAGE_META[stage].short}</span>
                                    <span className="text-sm font-medium text-foreground">{STAGE_META[stage].label}</span>
                                </div>
                                <span className="text-xs tabular-nums text-muted-foreground" data-testid={`board-count-${stage}`}>
                                    {page.stageCounts?.[stage] ?? cards.length}
                                </span>
                            </div>
                            <div className="flex min-h-[120px] flex-col gap-2 p-2">
                                {cards.map((lead) => {
                                    const meta = temperatureMeta(lead.temperature);
                                    const recycled = recycledFlag(lead);
                                    const days = daysInStage(lead.stageChangedAt);
                                    const holder = agentName(lead.assignedAgentId);
                                    return (
                                        <div
                                            key={lead.id}
                                            draggable={!busy && STAGE_META[stage].hand}
                                            onDragStart={() => setDragging(lead)}
                                            onDragEnd={() => {
                                                setDragging(null);
                                                setOver(null);
                                            }}
                                            data-testid={`board-card-${lead.id}`}
                                            className={cn("rounded-md border bg-card p-2.5 shadow-none", STAGE_META[stage].hand ? "cursor-grab active:cursor-grabbing" : "cursor-default")}
                                        >
                                            <Link href={`/leads/${lead.id}`} className="block text-sm font-medium text-foreground hover:underline">
                                                {lead.businessName}
                                            </Link>
                                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                                <StatusBadge status={meta} />
                                                {/* LH11: a lead that came back round says so, and how often. */}
                                                {recycled ? (
                                                    <span title={recycled.hint} data-testid={`board-recycled-${lead.id}`}>
                                                        <StatusBadge status={{ label: recycled.label, tone: "info" }} />
                                                    </span>
                                                ) : null}
                                                {typeof lead.score === "number" && <span className="text-[11px] tabular-nums text-muted-foreground">{lead.score}</span>}
                                                {lead.estimatedValue && <span className="text-[11px] text-muted-foreground">{formatINR(Number(lead.estimatedValue))}</span>}
                                            </div>
                                            <div className="mt-1 text-[11px] text-muted-foreground">
                                                {holder ?? "Open pool"}
                                                {days !== null ? ` · ${days === 0 ? "today" : `${days} d`}` : ""}
                                            </div>
                                        </div>
                                    );
                                })}
                                {cards.length === 0 && <p className="px-1 py-3 text-center text-[11px] text-muted-foreground">Nothing here</p>}
                            </div>
                        </div>
                    );
                })}
            </div>
            <LostDialog lead={losing} onOpenChange={(open) => !open && setLosing(null)} onLost={onChanged} />
        </div>
    );
}
