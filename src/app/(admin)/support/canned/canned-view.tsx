"use client";

import * as React from "react";
import { MessageSquareText, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { SectionCard } from "@/components/adx/section-card";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { cannedTeams, liveChatService, type CannedReply } from "@/services/live-chat";

interface CannedViewProps {
    replies: CannedReply[];
    onChanged: () => void;
}

/** A reply being written or edited; `id` null means it does not exist yet. */
interface Draft {
    id: string | null;
    title: string;
    body: string;
    team: string;
}

const emptyDraft: Draft = { id: null, title: "", body: "", team: "" };

/**
 * The canned replies manager — `/support/canned`, Lot I.
 *
 * Grouped by team, because that is how the desk is grouped: a payments
 * operator should not scroll past thirty booking replies to find theirs. A
 * reply is retired rather than deleted by default — `isActive: false` keeps
 * the row, keeps the audit trail, and can be undone — and deleting is offered
 * separately for a row that was never meant to exist.
 */
export function CannedView({ replies, onChanged }: CannedViewProps) {
    const [draft, setDraft] = React.useState<Draft | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [confirming, setConfirming] = React.useState<CannedReply | null>(null);

    const teams = cannedTeams(replies);
    const byTeam = (team: string | null) =>
        replies
            .filter((reply) => (reply.team ?? null) === team)
            .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.title.localeCompare(b.title));

    const save = async () => {
        if (!draft) return;
        const title = draft.title.trim();
        const body = draft.body.trim();
        const team = draft.team.trim() || null;
        if (!title || !body) {
            toast.error("A canned reply needs a title and a body.");
            return;
        }
        setBusy(true);
        try {
            if (draft.id) {
                await liveChatService.updateCanned(draft.id, { title, body, team });
                toast.success("Canned reply updated");
            } else {
                await liveChatService.createCanned({ title, body, team });
                toast.success("Canned reply added", { description: "It is in the live composer's picker straight away." });
            }
            setDraft(null);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not save that reply.");
        } finally {
            setBusy(false);
        }
    };

    const setActive = async (reply: CannedReply, isActive: boolean) => {
        setBusy(true);
        try {
            await liveChatService.updateCanned(reply.id, { isActive });
            toast.success(isActive ? "Back in the picker" : "Retired", {
                description: isActive
                    ? "Operators will see it again."
                    : "It stays on the record and can be brought back; it is out of the picker.",
            });
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not change that reply.");
        } finally {
            setBusy(false);
        }
    };

    const remove = async (reply: CannedReply) => {
        setBusy(true);
        try {
            await liveChatService.deleteCanned(reply.id);
            toast.success("Canned reply deleted");
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not delete that reply.");
        } finally {
            setBusy(false);
            setConfirming(null);
        }
    };

    return (
        <div className="space-y-5">
            <PageHeader
                title="Canned replies"
                subtitle="What the live composer inserts when an operator types /. Grouped by the team that owns them."
                actions={
                    <Button size="sm" onClick={() => setDraft(emptyDraft)}>
                        <Plus className="size-4" aria-hidden />
                        New reply
                    </Button>
                }
            />

            {replies.length === 0 ? (
                <SectionCard title="Nothing written yet" description="A canned reply is a sentence the desk sends often.">
                    <EmptyState
                        icon={MessageSquareText}
                        title="No canned replies"
                        description="Write the first one and every operator gets it in the live composer's picker under /."
                        action={
                            <Button size="sm" onClick={() => setDraft(emptyDraft)}>
                                <Plus className="size-4" aria-hidden />
                                New reply
                            </Button>
                        }
                        className="py-12"
                    />
                </SectionCard>
            ) : (
                teams.map((team) => (
                    <SectionCard
                        key={team ?? "__unteamed__"}
                        title={team ?? "No team"}
                        description={team ? `Owned by ${team}` : "Available to every operator"}
                        contentClassName="p-0"
                    >
                        <ul className="divide-y">
                            {byTeam(team).map((reply) => (
                                <li key={reply.id} className="flex items-start gap-3 px-5 py-3">
                                    <div className="min-w-0 flex-1">
                                        <p
                                            className={cn(
                                                "text-sm font-medium",
                                                reply.isActive ? "text-foreground" : "text-muted-foreground line-through",
                                            )}
                                        >
                                            {reply.title}
                                            {!reply.isActive && (
                                                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-normal not-italic text-muted-foreground no-underline">
                                                    Retired
                                                </span>
                                            )}
                                        </p>
                                        <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">{reply.body}</p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label={`Edit ${reply.title}`}
                                            disabled={busy}
                                            onClick={() =>
                                                setDraft({ id: reply.id, title: reply.title, body: reply.body, team: reply.team ?? "" })
                                            }
                                        >
                                            <Pencil className="size-4" aria-hidden />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label={reply.isActive ? `Retire ${reply.title}` : `Restore ${reply.title}`}
                                            disabled={busy}
                                            onClick={() => void setActive(reply, !reply.isActive)}
                                        >
                                            <RotateCcw className={cn("size-4", reply.isActive && "rotate-180")} aria-hidden />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label={`Delete ${reply.title}`}
                                            disabled={busy}
                                            onClick={() => setConfirming(reply)}
                                        >
                                            <Trash2 className="size-4 text-danger" aria-hidden />
                                        </Button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </SectionCard>
                ))
            )}

            <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{draft?.id ? "Edit canned reply" : "New canned reply"}</DialogTitle>
                        <DialogDescription>
                            The title is what an operator types after / to find it. The body is inserted as written.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="canned-title">Title</Label>
                            <Input
                                id="canned-title"
                                value={draft?.title ?? ""}
                                maxLength={120}
                                onChange={(event) => setDraft((current) => (current ? { ...current, title: event.target.value } : current))}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="canned-body">Body</Label>
                            <Textarea
                                id="canned-body"
                                rows={5}
                                maxLength={4000}
                                value={draft?.body ?? ""}
                                onChange={(event) => setDraft((current) => (current ? { ...current, body: event.target.value } : current))}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="canned-team">Team</Label>
                            <Input
                                id="canned-team"
                                placeholder="Leave empty for every operator"
                                maxLength={60}
                                value={draft?.team ?? ""}
                                onChange={(event) => setDraft((current) => (current ? { ...current, team: event.target.value } : current))}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDraft(null)} disabled={busy}>
                            Cancel
                        </Button>
                        <Button onClick={() => void save()} disabled={busy}>
                            {draft?.id ? "Save changes" : "Add reply"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={confirming !== null}
                onOpenChange={(open) => !open && setConfirming(null)}
                title="Delete this canned reply?"
                description={
                    confirming
                        ? `"${confirming.title}" is removed for good. Retiring it instead keeps the row and can be undone.`
                        : ""
                }
                confirmLabel="Delete"
                destructive
                onConfirm={() => {
                    if (confirming) void remove(confirming);
                }}
            />
        </div>
    );
}
