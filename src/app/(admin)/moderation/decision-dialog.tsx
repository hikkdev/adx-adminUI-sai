"use client";

import * as React from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { noteRequired, type CreativeDecision } from "@/services/moderation";

export interface PendingDecision {
    decision: CreativeDecision;
    /** How many creatives the decision covers — one from a card, several from the selection. */
    count: number;
}

interface DecisionDialogProps {
    pending: PendingDecision | null;
    onOpenChange: (open: boolean) => void;
    busy?: boolean;
    onConfirm: (note: string) => void;
}

const COPY: Record<CreativeDecision, { title: string; description: string; confirm: string }> = {
    APPROVED: {
        title: "Approve this artwork?",
        description: "It will print as submitted. The advertiser is told, and nothing else stands between a paid campaign and its launch once every creative is approved.",
        confirm: "Approve",
    },
    REJECTED: {
        title: "Reject this artwork?",
        description: "The advertiser is told why and asked to upload new artwork. The refused file stays on record beside the re-upload.",
        confirm: "Reject",
    },
    CHANGES_REQUESTED: {
        title: "Request changes?",
        description: "The advertiser is told what to change and asked for a revised upload. The campaign stays where it is until the new artwork is approved.",
        confirm: "Request changes",
    },
};

/**
 * The note behind a decision.
 *
 * A refusal or a change request has to say why — the API's schema refuses
 * it otherwise — so the dialog refuses first, with the same words. An
 * approval may carry a note but need not.
 */
export function DecisionDialog({ pending, onOpenChange, busy = false, onConfirm }: DecisionDialogProps) {
    const [note, setNote] = React.useState("");
    const decision = pending?.decision ?? "APPROVED";
    const copy = COPY[decision];
    const problem = pending ? noteRequired(decision, note) : null;
    const plural = (pending?.count ?? 1) > 1;

    return (
        <Dialog
            open={pending !== null}
            onOpenChange={(open) => {
                if (!open) setNote("");
                onOpenChange(open);
            }}
        >
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{plural ? copy.title.replace("this artwork", `${pending?.count} creatives`) : copy.title}</DialogTitle>
                    <DialogDescription>{copy.description}</DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                    <Label htmlFor="decision-note">
                        Note for the advertiser{decision === "APPROVED" ? " (optional)" : ""}
                    </Label>
                    <Textarea
                        id="decision-note"
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder={
                            decision === "APPROVED"
                                ? "Anything the advertiser should know"
                                : "What is wrong, in words the advertiser can act on"
                        }
                        className="min-h-24 resize-none"
                        maxLength={1000}
                        autoFocus
                    />
                    <p className="text-xs text-muted-foreground">
                        {decision === "APPROVED"
                            ? "Goes to the advertiser with the approval and into the audit trail."
                            : "A note is required when rejecting or requesting changes. It goes to the advertiser and into the audit trail."}
                    </p>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button
                        variant={decision === "REJECTED" ? "destructive" : "default"}
                        disabled={busy || problem !== null}
                        onClick={() => {
                            onConfirm(note.trim());
                            setNote("");
                        }}
                    >
                        {copy.confirm}
                        {plural ? ` ${pending?.count}` : ""}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
