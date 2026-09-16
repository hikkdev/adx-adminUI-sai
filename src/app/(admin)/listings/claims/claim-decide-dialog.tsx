"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { supplyService, type ListingClaim } from "@/services/supply";

/**
 * Deciding one claim — `PATCH /supply/claims/:claimId/decide` with
 * `{ approve, decisionNote? }`. A rejection needs the note (the server
 * refuses one without; the claimant is shown it). Approving moves the
 * listing to the claimant under a fresh attempt that awaits the listing
 * agreement — said in the dialog, because that is what the click does.
 */

/** The schema's ceiling on a decision note. */
export const DECISION_NOTE_MAX = 1000;

interface Props {
    claim: ListingClaim | null;
    onOpenChange: (open: boolean) => void;
    /** Refetches the desk after the write lands. */
    onDecided: () => void;
}

export function ClaimDecideDialog({ claim, onOpenChange, onDecided }: Props) {
    return (
        <Dialog open={claim !== null} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                {/* Keyed so a second claim opens with a blank note rather than the last one's. */}
                {claim ? <Body key={claim.id} claim={claim} onClose={() => onOpenChange(false)} onDecided={onDecided} /> : null}
            </DialogContent>
        </Dialog>
    );
}

function Body({ claim, onClose, onDecided }: { claim: ListingClaim; onClose: () => void; onDecided: () => void }) {
    const [note, setNote] = React.useState("");
    const [busy, setBusy] = React.useState<"approve" | "reject" | null>(null);
    const trimmed = note.trim();
    const tooLong = trimmed.length > DECISION_NOTE_MAX;

    const decide = async (approve: boolean) => {
        if (!approve && trimmed === "") {
            toast.error("Say why it was rejected — the claimant is shown this.");
            return;
        }
        if (tooLong) return;
        setBusy(approve ? "approve" : "reject");
        try {
            await supplyService.decideClaim(claim.id, approve, trimmed === "" ? undefined : trimmed);
            toast.success(approve ? "Claim approved — the listing now awaits the claimant's agreement." : "Claim rejected.");
            onDecided();
            onClose();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not record that decision.");
        } finally {
            setBusy(null);
        }
    };

    return (
        <>
            <DialogHeader>
                <DialogTitle>Decide claim</DialogTitle>
                <DialogDescription>
                    Publisher <span className="font-mono text-xs">{claim.claimantPublisherId}</span> says listing{" "}
                    <span className="font-mono text-xs">{claim.listingId}</span> is theirs, filed {formatDateTime(claim.createdAt)}.
                </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
                <div className="rounded-md bg-muted px-3 py-2 text-sm">
                    <p className="text-xs font-medium text-muted-foreground">Evidence</p>
                    <p className="mt-1 whitespace-pre-wrap text-foreground">{claim.evidenceNote ?? "No evidence note was filed."}</p>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="claim-decision-note">Decision note</Label>
                    <Textarea
                        id="claim-decision-note"
                        rows={3}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="Required to reject — shown to the claimant. Optional on approval."
                        className="text-sm"
                    />
                    <p className={tooLong ? "text-xs text-danger" : "text-xs text-muted-foreground"}>
                        {tooLong
                            ? `${trimmed.length} of ${DECISION_NOTE_MAX} characters — shorten it.`
                            : "Approving moves the listing to the claimant under a fresh attempt; it goes live once they accept the listing agreement."}
                    </p>
                </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="outline" onClick={onClose} disabled={busy !== null}>
                    Cancel
                </Button>
                <Button variant="outline" className="text-danger hover:text-danger" disabled={busy !== null || tooLong} onClick={() => decide(false)}>
                    {busy === "reject" ? "Rejecting…" : "Reject"}
                </Button>
                <Button disabled={busy !== null || tooLong} onClick={() => decide(true)}>
                    {busy === "approve" ? "Approving…" : "Approve"}
                </Button>
            </DialogFooter>
        </>
    );
}
