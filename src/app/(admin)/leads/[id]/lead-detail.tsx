"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldList } from "@/components/adx/simple-table";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime, formatMoney } from "@/lib/format";
import { agentLabel, type AgentSummary } from "@/services/agents";
import {
    LEAD_ACTIVITY_LABEL,
    LEAD_SIDE_LABEL,
    leadsService,
    whereLabel,
    type LeadDetail,
} from "@/services/leads";
import { openPrivateFile, privateFileUrl } from "@/components/adx/private-file";
import { ConvertLeadDialog } from "../leads-dialogs";
import { LostDialog } from "../lost-dialog";
import { LeadConversation } from "./lead-conversation";
import { LeadInviteCard } from "./lead-invite";
import { LeadScoreCard } from "./lead-score-card";
import { LeadStageCard } from "./lead-stage-card";

interface LeadDetailViewProps {
    lead: LeadDetail;
    agents: AgentSummary[];
    onChanged: () => void;
}

const OPEN_POOL = "__open_pool__";

/**
 * A lead's page: what the card says, who is on it, and everything that has
 * happened to it — the activity the agent app writes (a call, a note, a
 * visit) and the desk's own moves. No frame draws this screen; it is
 * composed from the console's own cards.
 */
export function LeadDetailView({ lead, agents, onChanged }: LeadDetailViewProps) {
    const [converting, setConverting] = React.useState(false);
    const [closing, setClosing] = React.useState(false);
    const [assignChoice, setAssignChoice] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    const closed = lead.status === "CONVERTED" || lead.status === "LOST";
    const agentName = (id: string | null) => {
        if (!id) return "Open pool";
        const agent = agents.find((candidate) => candidate.id === id);
        return agent ? agentLabel(agent) : id;
    };

    async function run(label: string, work: () => Promise<unknown>) {
        setBusy(true);
        try {
            await work();
            toast.success(label);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "That did not reach ADX.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-5">
            <div>
                <Link
                    href="/leads"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="size-4" />
                    Leads
                </Link>
                <PageHeader
                    className="mt-2"
                    title={lead.businessName}
                    subtitle={`${lead.displayId ?? lead.id} · ${LEAD_SIDE_LABEL[lead.side]} lead · ${whereLabel(lead)}`}
                    actions={
                        closed ? undefined : (
                            <>
                                <Button variant="outline" className="bg-card text-danger hover:text-danger" disabled={busy} onClick={() => setClosing(true)}>
                                    Close as lost
                                </Button>
                                <Button disabled={busy} onClick={() => setConverting(true)}>
                                    Convert to an account
                                </Button>
                            </>
                        )
                    }
                />
            </div>

            <div className="grid gap-4 lg:grid-cols-5">
                <Card className="rounded-lg border-border p-5 shadow-none lg:col-span-3">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-base font-semibold text-foreground">Details</h3>
                        <StatusBadge status={lead.pill} />
                    </div>
                    <FieldList
                        className="mt-4"
                        items={[
                            ["Category", lead.category ?? "—"],
                            ["Contact", lead.contactName ?? "—"],
                            ["Phone", lead.phone ?? "—"],
                            ["Email", lead.email ?? "—"],
                            ["Address", lead.address ?? "—"],
                            ["Interest", lead.interest ?? "—"],
                            ["Source", lead.source ?? "—"],
                            ["Best time", lead.bestTimeFrom && lead.bestTimeTo ? `${lead.bestTimeFrom} – ${lead.bestTimeTo}` : "—"],
                            // Null is nobody having estimated it, which is not zero.
                            ["Est. commission", lead.estimatedCommission === null ? "—" : formatMoney(lead.estimatedCommission)],
                            ["Visit", lead.visitBooked ? "Booked" : "Not booked"],
                            ["First contact", lead.firstContactedAt ? formatDateTime(lead.firstContactedAt) : "Not yet"],
                            // LH4: spotted in the street — when, and by whom.
                            ...(lead.capturedAt ? [["Spotted", `${formatDateTime(lead.capturedAt)} by ${agentName(lead.capturedByAgentId ?? null)}`] as [string, string]] : []),
                        ]}
                    />
                    {lead.photoFileIds && lead.photoFileIds.length > 0 && (
                        <div className="mt-4" data-testid="lead-photos">
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Photos from the street</h4>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {lead.photoFileIds.map((fileId, index) => (
                                    <button
                                        key={fileId}
                                        type="button"
                                        className="rounded-md border px-2.5 py-1 text-xs text-primary hover:underline"
                                        onClick={() => {
                                            void openPrivateFile(privateFileUrl(fileId)).catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Could not open the photo."));
                                        }}
                                    >
                                        Photo {index + 1}
                                    </button>
                                ))}
                            </div>
                            <p className="mt-1 text-[11px] text-muted-foreground">Kept on the lead for the listing draft when it converts.</p>
                        </div>
                    )}
                </Card>

                <div className="space-y-4 lg:col-span-2">
                    {/* LH2: where the deal is, and what moves it forward. */}
                    <LeadStageCard lead={lead} onChanged={onChanged} />
                    {/* LH7 (D6): the invite link and the proposals. */}
                    <LeadInviteCard lead={lead} onChanged={onChanged} />
                    {/* LH1: why it is hot, warm or cold. */}
                    <LeadScoreCard lead={lead} onChanged={onChanged} />
                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Who is on this</h3>
                        <p className="mt-2 text-sm text-foreground">{agentName(lead.assignedAgentId)}</p>
                        {!closed && (
                            <div className="mt-3 space-y-2">
                                <Label htmlFor="lead-assign" className="sr-only">
                                    Agent
                                </Label>
                                <Select
                                    value={assignChoice ?? lead.assignedAgentId ?? OPEN_POOL}
                                    onValueChange={(value) => {
                                        setAssignChoice(value);
                                        const agentId = value === OPEN_POOL ? null : value;
                                        if (agentId === lead.assignedAgentId) return;
                                        void run(
                                            agentId ? `Assigned to ${agentName(agentId)}` : "Returned to the open pool",
                                            () => leadsService.assign(lead.id, agentId)
                                        ).then(() => setAssignChoice(null));
                                    }}
                                    disabled={busy}
                                >
                                    <SelectTrigger id="lead-assign" className="h-9">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={OPEN_POOL}>Open pool</SelectItem>
                                        {agents.map((agent) => (
                                            <SelectItem key={agent.id} value={agent.id}>
                                                {agentLabel(agent)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    The agent sees it in their own list and can call, book a visit or convert it.
                                </p>
                            </div>
                        )}
                    </Card>

                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activity</h3>
                        {lead.activity.length === 0 ? (
                            <p className="mt-2 text-sm text-muted-foreground">Nothing has happened to this lead yet.</p>
                        ) : (
                            <ol className="mt-3 space-y-3" data-testid="lead-activity">
                                {[...lead.activity].reverse().map((entry) => (
                                    <li key={entry.id} className="flex gap-2.5">
                                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                                        <div className="min-w-0">
                                            <p className="text-sm text-foreground">
                                                {LEAD_ACTIVITY_LABEL[entry.kind] ?? entry.kind}
                                                {entry.note ? <span className="text-muted-foreground"> — {entry.note}</span> : null}
                                            </p>
                                            <p className="text-xs text-muted-foreground">{formatDateTime(entry.at)}</p>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </Card>
                </div>
            </div>

            {/* LH6: the unified conversation — every channel, the composer, the call, the sequence. */}
            <LeadConversation lead={lead} onChanged={onChanged} />

            <ConvertLeadDialog lead={converting ? lead : null} onOpenChange={setConverting} onConverted={onChanged} />

            {/* LH2 (D11): a loss carries its reason. */}
            <LostDialog lead={closing ? lead : null} onOpenChange={setClosing} onLost={onChanged} />
        </div>
    );
}
