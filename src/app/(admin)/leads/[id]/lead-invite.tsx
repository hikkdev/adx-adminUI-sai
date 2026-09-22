"use client";

import * as React from "react";
import { Copy, ExternalLink, Link2, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import {
    INVITE_STATE_META,
    inviteService,
    openedAgo,
    PROPOSAL_KIND_LABEL,
    proposalKindsFor,
    proposalLine,
    proposalState,
    type LeadDetail,
    type LeadInvite,
    type LeadProposal,
    type ProposalInput,
    type ProposalKind,
} from "@/services/leads";

/**
 * LH7 (D6): the invite link and the proposals on the lead page. The link
 * is minted once and re-issued on demand (the old code stops opening);
 * every open counts and the last one reads "opened 2 h ago". A proposal
 * is computed on the server — a publisher's rate from the comparables, an
 * advertiser's campaign estimate or a package quote off the catalogue —
 * and the landing records when it was opened and accepted.
 */
export function LeadInviteCard({ lead, onChanged }: { lead: LeadDetail; onChanged: () => void }) {
    const closed = lead.status === "CONVERTED" || lead.status === "LOST";
    const proposals = useApiResource<LeadProposal[]>(`lead:${lead.id}:proposals`, () => inviteService.proposals(lead.id));
    const [invite, setInvite] = React.useState<LeadInvite | null | undefined>(lead.invite);
    const [busy, setBusy] = React.useState(false);
    const [composing, setComposing] = React.useState(false);
    const current = invite === undefined ? (lead.invite ?? null) : invite;

    async function issue(reissue: boolean) {
        setBusy(true);
        try {
            const next = await inviteService.issue(lead.id, reissue);
            setInvite(next);
            toast.success(reissue ? "A fresh link — the old one no longer opens" : "Invite link ready");
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not mint the link.");
        } finally {
            setBusy(false);
        }
    }

    async function copy() {
        if (!current) return;
        try {
            await navigator.clipboard.writeText(current.url);
            toast.success("Link copied");
        } catch {
            toast.error("Could not copy — select the link and copy it.");
        }
    }

    const opened = current ? openedAgo(current.lastOpenedAt) : null;

    return (
        <Card className="rounded-lg border-border p-5 shadow-none" data-testid="lead-invite">
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invite link</h3>
                {current ? <StatusBadge status={INVITE_STATE_META[current.state]} /> : null}
            </div>
            {current ? (
                <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2">
                        <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs" data-testid="lead-invite-url">
                            {current.url}
                        </code>
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => void copy()} title="Copy" data-testid="lead-invite-copy">
                            <Copy className="size-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2" asChild title="Open">
                            <a href={current.url} target="_blank" rel="noreferrer">
                                <ExternalLink className="size-3.5" />
                            </a>
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground" data-testid="lead-invite-line">
                        {current.opens === 0 ? "Not opened yet" : `${current.opens} open${current.opens === 1 ? "" : "s"} · ${opened}`} · expires {formatDateTime(current.expiresAt)}
                    </p>
                    {!closed ? (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => void issue(true)} data-testid="lead-invite-reissue">
                            <RefreshCw className="mr-1.5 size-3.5" /> Re-issue
                        </Button>
                    ) : null}
                </div>
            ) : (
                <div className="mt-2 space-y-2">
                    <p className="text-sm text-muted-foreground">No link yet. The outreach copy mints one on the first send; you can mint it here to share by hand.</p>
                    {!closed ? (
                        <Button size="sm" disabled={busy} onClick={() => void issue(false)} data-testid="lead-invite-issue">
                            <Link2 className="mr-1.5 size-3.5" /> Mint the link
                        </Button>
                    ) : null}
                </div>
            )}

            <div className="mt-5 flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Proposals</h3>
                {!closed ? (
                    <Button size="sm" variant="outline" onClick={() => setComposing(true)} data-testid="lead-proposal-new">
                        <Send className="mr-1.5 size-3.5" /> Send a proposal
                    </Button>
                ) : null}
            </div>
            {proposals.loading && !proposals.data ? (
                <p className="mt-2 text-sm text-muted-foreground">Reading…</p>
            ) : proposals.error ? (
                <p className="mt-2 text-sm text-danger">{proposals.error}</p>
            ) : !proposals.data || proposals.data.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">None sent yet. A proposal shows on the invite page and says when it was opened and accepted.</p>
            ) : (
                <ol className="mt-2 space-y-2" data-testid="lead-proposals">
                    {proposals.data.map((proposal) => (
                        <li key={proposal.id} className="rounded-md border px-3 py-2" data-testid={`lead-proposal-${proposal.id}`}>
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium text-foreground">{PROPOSAL_KIND_LABEL[proposal.kind]}</p>
                                <StatusBadge status={proposalState(proposal)} />
                            </div>
                            <p className="text-sm text-foreground">{proposalLine(proposal)}</p>
                            {proposal.note ? <p className="text-xs text-muted-foreground">{proposal.note}</p> : null}
                            <p className="mt-1 text-xs text-muted-foreground">
                                Sent {formatDateTime(proposal.sentAt)}
                                {proposal.openedAt ? ` · opened ${formatDateTime(proposal.openedAt)}` : ""}
                                {proposal.acceptedAt ? ` · accepted ${formatDateTime(proposal.acceptedAt)}` : ""}
                            </p>
                            {!proposal.acceptedAt && !closed ? (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="mt-1 h-7 px-2 text-xs"
                                    onClick={() => {
                                        void inviteService
                                            .markAccepted(lead.id, proposal.id)
                                            .then(() => {
                                                toast.success("Marked accepted");
                                                proposals.reload();
                                                onChanged();
                                            })
                                            .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Could not mark it."));
                                    }}
                                    data-testid={`lead-proposal-${proposal.id}-accept`}
                                >
                                    They accepted
                                </Button>
                            ) : null}
                        </li>
                    ))}
                </ol>
            )}

            <ProposalDialog
                lead={lead}
                open={composing}
                onOpenChange={setComposing}
                onSent={() => {
                    proposals.reload();
                    onChanged();
                }}
            />
        </Card>
    );
}

/** The draft's problem, or null: a package needs a tier; every rupee figure is a rupee figure. */
export function proposalDraftProblem(draft: { kind: ProposalKind; perDay: string; spots: string; days: string; perSpotPerDay: string; tier: string }): string | null {
    const money = /^\d+(\.\d{1,2})?$/;
    if (draft.kind === "RATE_ESTIMATE" && draft.perDay && !money.test(draft.perDay)) return "The rate is rupees per day, digits only.";
    if (draft.kind === "CAMPAIGN_ESTIMATE") {
        if (draft.spots && !(Number(draft.spots) >= 1 && Number(draft.spots) <= 200)) return "Spots: 1 to 200.";
        if (draft.days && !(Number(draft.days) >= 1 && Number(draft.days) <= 365)) return "Days: 1 to 365.";
        if (draft.perSpotPerDay && !money.test(draft.perSpotPerDay)) return "The per-spot rate is rupees per day, digits only.";
    }
    if (draft.kind === "PACKAGE_QUOTE" && !draft.tier.trim()) return "Name the package tier.";
    return null;
}

/** The request the draft makes. */
export function proposalInputFrom(draft: { kind: ProposalKind; perDay: string; spots: string; days: string; perSpotPerDay: string; tier: string; cycle: "MONTHLY" | "ANNUAL"; note: string }): ProposalInput {
    const note = draft.note.trim() || undefined;
    if (draft.kind === "RATE_ESTIMATE") return { kind: "RATE_ESTIMATE", ...(draft.perDay ? { perDay: draft.perDay } : {}), ...(note ? { note } : {}) };
    if (draft.kind === "CAMPAIGN_ESTIMATE") return { kind: "CAMPAIGN_ESTIMATE", ...(draft.spots ? { spots: Number(draft.spots) } : {}), ...(draft.days ? { days: Number(draft.days) } : {}), ...(draft.perSpotPerDay ? { perSpotPerDay: draft.perSpotPerDay } : {}), ...(note ? { note } : {}) };
    return { kind: "PACKAGE_QUOTE", tier: draft.tier.trim().toUpperCase(), cycle: draft.cycle, ...(note ? { note } : {}) };
}

function ProposalDialog({ lead, open, onOpenChange, onSent }: { lead: LeadDetail; open: boolean; onOpenChange: (open: boolean) => void; onSent: () => void }) {
    const kinds = proposalKindsFor(lead.side);
    const [draft, setDraft] = React.useState({ kind: kinds[0]!, perDay: "", spots: "3", days: "30", perSpotPerDay: "", tier: "", cycle: "MONTHLY" as "MONTHLY" | "ANNUAL", note: "" });
    const [busy, setBusy] = React.useState(false);
    const problem = proposalDraftProblem(draft);
    const set = (key: keyof typeof draft) => (value: string) => setDraft((current) => ({ ...current, [key]: value }));

    async function submit() {
        if (problem || busy) return;
        setBusy(true);
        try {
            await inviteService.sendProposal(lead.id, proposalInputFrom(draft));
            toast.success("Proposal sent — it shows on the invite page");
            onOpenChange(false);
            onSent();
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 409) toast.error(cause.message, { description: "Give the figure yourself and send again." });
            else toast.error(cause instanceof Error ? cause.message : "Could not send the proposal.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent data-testid="proposal-dialog">
                <DialogHeader>
                    <DialogTitle>Send a proposal</DialogTitle>
                    <DialogDescription>{lead.side === "PUBLISHER" ? "A rate estimate from the live spaces around them — or your own figure." : "A campaign estimate from the spots around them, or a package quote off the catalogue."}</DialogDescription>
                </DialogHeader>
                {kinds.length > 1 ? (
                    <div className="space-y-1.5">
                        <Label htmlFor="proposal-kind">Kind</Label>
                        <Select value={draft.kind} onValueChange={(value) => set("kind")(value as ProposalKind)}>
                            <SelectTrigger id="proposal-kind" className="h-9" data-testid="proposal-kind">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {kinds.map((kind) => (
                                    <SelectItem key={kind} value={kind}>
                                        {PROPOSAL_KIND_LABEL[kind]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                ) : null}
                {draft.kind === "RATE_ESTIMATE" ? (
                    <div className="space-y-1.5">
                        <Label htmlFor="proposal-per-day">Rate per day (leave empty for the comparables&apos; figure)</Label>
                        <Input id="proposal-per-day" value={draft.perDay} onChange={(event) => set("perDay")(event.target.value)} placeholder="450" data-testid="proposal-per-day" />
                    </div>
                ) : draft.kind === "CAMPAIGN_ESTIMATE" ? (
                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="proposal-spots">Spots</Label>
                            <Input id="proposal-spots" type="number" min={1} max={200} value={draft.spots} onChange={(event) => set("spots")(event.target.value)} data-testid="proposal-spots" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="proposal-days">Days</Label>
                            <Input id="proposal-days" type="number" min={1} max={365} value={draft.days} onChange={(event) => set("days")(event.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="proposal-rate">Per spot / day</Label>
                            <Input id="proposal-rate" value={draft.perSpotPerDay} onChange={(event) => set("perSpotPerDay")(event.target.value)} placeholder="comparables" />
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="proposal-tier">Package tier</Label>
                            <Input id="proposal-tier" value={draft.tier} onChange={(event) => set("tier")(event.target.value)} placeholder="GROWTH" data-testid="proposal-tier" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="proposal-cycle">Cycle</Label>
                            <Select value={draft.cycle} onValueChange={(value) => set("cycle")(value)}>
                                <SelectTrigger id="proposal-cycle" className="h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                                    <SelectItem value="ANNUAL">Annual</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                )}
                <div className="space-y-1.5">
                    <Label htmlFor="proposal-note">Note (optional)</Label>
                    <Textarea id="proposal-note" rows={2} value={draft.note} onChange={(event) => set("note")(event.target.value)} placeholder="A line they will read under the figure" />
                </div>
                {problem ? <p className="text-xs text-muted-foreground">{problem}</p> : null}
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button onClick={() => void submit()} disabled={Boolean(problem) || busy} data-testid="proposal-send">
                        {busy ? "Sending…" : "Send"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
