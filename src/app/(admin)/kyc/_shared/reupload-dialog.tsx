"use client";

import * as React from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import type { KycDocumentReview } from "@/types";
import type { ReviewableDocument } from "./document-review";

interface ReuploadDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Who is asked — for the copy. */
    party: string;
    documents: ReviewableDocument[];
    reviews: KycDocumentReview[];
    onRequest: (fields: string[], note: string) => Promise<void>;
}

/**
 * "Request re-upload" — Lot D (Q42).
 *
 * The flagged tiles are pre-ticked, because that is what a re-upload is
 * for; a reviewer may add one more or untick one. The note is required —
 * it is what the party reads in the notification, beside the list of what
 * to send again — and the case moves to NEEDS_INFO with every file kept.
 *
 * Mount it with a `key` that changes on each open so the ticks re-seed.
 */
export function ReuploadDialog({ open, onOpenChange, party, documents, reviews, onRequest }: ReuploadDialogProps) {
    const flagged = React.useMemo(
        () => new Set(reviews.filter((review) => review.decision === "FLAGGED").map((review) => review.field)),
        [reviews]
    );
    // Seeded once per mount: the parent keys the dialog on each open, so a
    // flag recorded since the last open is what the reviewer finds ticked.
    const [picked, setPicked] = React.useState<Set<string>>(() => new Set(flagged));
    const [note, setNote] = React.useState(() => reviews.find((review) => review.decision === "FLAGGED" && review.note)?.note ?? "");
    const [busy, setBusy] = React.useState(false);

    const toggle = (field: string, on: boolean) =>
        setPicked((current) => {
            const next = new Set(current);
            if (on) next.add(field);
            else next.delete(field);
            return next;
        });

    const request = async () => {
        setBusy(true);
        try {
            const fields = documents.filter((document) => picked.has(document.field)).map((document) => document.field);
            await onRequest(fields, note.trim());
            toast.success("Re-upload requested", {
                description: `${party} will be asked for ${fields.length} document${fields.length === 1 ? "" : "s"}; the case is now Needs info.`,
            });
            onOpenChange(false);
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The request did not reach ADX.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <ConfirmDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Ask for these documents again?"
            description={`${party} will be told which to send and why. Every file already on the case stays; the case moves to Needs info until they answer.`}
            confirmLabel="Request re-upload"
            busy={busy}
            disabled={picked.size === 0 || note.trim().length === 0}
            onConfirm={() => void request()}
        >
            <div className="space-y-3">
                <ul className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-3">
                    {documents.map((document) => (
                        <li key={document.field} className="flex items-center gap-2.5">
                            <Checkbox
                                id={`reupload-${document.field}`}
                                checked={picked.has(document.field)}
                                onCheckedChange={(value) => toggle(document.field, value === true)}
                            />
                            <Label htmlFor={`reupload-${document.field}`} className="flex-1 cursor-pointer font-normal">
                                {document.label}
                                {flagged.has(document.field) && <span className="ml-2 text-xs text-warning">flagged</span>}
                                {!document.url && <span className="ml-2 text-xs text-muted-foreground">not uploaded</span>}
                            </Label>
                        </li>
                    ))}
                </ul>
                <Textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="What they should fix — read back to them with the list…"
                    className="min-h-20 resize-none"
                    maxLength={500}
                    aria-label="Note to the party"
                />
            </div>
        </ConfirmDialog>
    );
}
