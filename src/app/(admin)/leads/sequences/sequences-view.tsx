"use client";

import * as React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/adx/page-header";
import { SectionCard } from "@/components/adx/section-card";
import { SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { channelLabel, delayLabel, LEAD_SIDE_LABEL, MANUAL_CHANNELS, TEMPERATURE_META, type AdapterState, type LeadSequence, type OutreachChannel } from "@/services/leads";
import { SequenceDialog } from "./sequence-dialog";
import type { SequencesData } from "./sequences-loader";

/** "Call at once → WhatsApp 2 h → SMS 1 d" — a sequence's steps on one line. */
export function stepsLine(sequence: Pick<LeadSequence, "steps">): string {
    return sequence.steps.map((step) => `${channelLabel(step.channel)} ${delayLabel(step.delayHours)}`).join(" → ");
}

/** The channels a sequence names that have no card yet — its steps there are skipped, not sent. */
export function unconfiguredChannels(sequence: Pick<LeadSequence, "steps">, channels: Record<OutreachChannel, AdapterState> | null): OutreachChannel[] {
    if (!channels) return [];
    const named = [...new Set(sequence.steps.map((step) => step.channel))];
    return named.filter((channel) => channel !== "CALL" && !MANUAL_CHANNELS.includes(channel) && channels[channel] && !channels[channel].configured);
}

/**
 * LH6: the Sequences desk — one per side and temperature (the six defaults
 * seeded at boot), each with its steps, how many leads are walking it,
 * and a warning where a step names a channel with no card yet.
 */
export function SequencesView({ data, onChanged }: { data: SequencesData; onChanged: () => void }) {
    const [editing, setEditing] = React.useState<LeadSequence | null>(null);
    const [creating, setCreating] = React.useState(false);
    return (
        <div className="space-y-5" data-testid="sequences-desk">
            <PageHeader
                title="Sequences"
                subtitle="The scripted follow-up a lead walks by side and temperature — each step a channel, a delay and the comms template whose copy goes (or a call, which lands a task). Any reply on any channel stops it."
                actions={
                    <Button size="sm" onClick={() => setCreating(true)} data-testid="seq-new">
                        <Plus className="mr-1.5 size-3.5" /> New sequence
                    </Button>
                }
            />
            <SectionCard title={`${data.sequences.length} ${data.sequences.length === 1 ? "sequence" : "sequences"}`} description="A lead joins the active sequence for its side and temperature when it is scored; a change of temperature moves it. Templates are edited under Comms › Templates.">
                <SimpleTable<LeadSequence>
                    rows={data.sequences}
                    rowKey={(row) => row.id}
                    emptyMessage="None yet — the six defaults appear when the backend boots; add your own here."
                    columns={[
                        {
                            key: "name",
                            label: "Sequence",
                            render: (row) => (
                                <button type="button" className="text-left font-medium text-primary hover:underline" onClick={() => setEditing(row)} data-testid={`seq-open-${row.id}`}>
                                    {row.name}
                                </button>
                            ),
                        },
                        { key: "for", label: "For", render: (row) => `${LEAD_SIDE_LABEL[row.side]} · ${TEMPERATURE_META[row.temperature].label}` },
                        {
                            key: "steps",
                            label: "Steps",
                            render: (row) => {
                                const missing = unconfiguredChannels(row, data.channels);
                                return (
                                    <div>
                                        <p className="text-sm text-foreground">{stepsLine(row)}</p>
                                        {missing.length ? <p className="text-xs text-warning">{missing.map(channelLabel).join(", ")} not set up — those steps are skipped, not sent.</p> : null}
                                    </div>
                                );
                            },
                        },
                        { key: "runs", label: "Walking it", className: "text-right", render: (row) => <span className="tabular-nums">{row.activeRuns} <span className="text-muted-foreground">/ {row.totalRuns}</span></span> },
                        { key: "state", label: "", render: (row) => <StatusBadge status={row.isActive ? { label: "On", tone: "success" } : { label: "Off", tone: "neutral" }} /> },
                    ]}
                />
                <p className="mt-3 text-xs text-muted-foreground">
                    Quiet hours and the weekly cap apply to every step. Channels are set up under <Link href="/settings/integrations" className="text-primary hover:underline">Settings › Integrations › Channels</Link>.
                </p>
            </SectionCard>
            <SequenceDialog open={creating || editing !== null} onOpenChange={(open) => { if (!open) { setCreating(false); setEditing(null); } }} sequence={editing} onSaved={onChanged} />
        </div>
    );
}
