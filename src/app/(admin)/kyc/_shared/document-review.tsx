"use client";

import * as React from "react";
import { Check, Flag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { StatusBadge } from "@/components/adx/status-badge";
import { cn } from "@/lib/utils";
import type { DocumentDecision } from "@/services/kyc";
import type { KycDocumentReview } from "@/types";

/**
 * The per-document desk — Lot D (Q42), shared by the publisher workbench
 * and the advertiser twin.
 *
 * Each tile carries its own verdict: Approve records it at once, Flag asks
 * what is wrong first, because the server refuses a flag without a note and
 * the party reads that note back when asked to re-upload. A decided tile
 * shows its badge and can be decided again; a re-upload clears it on the
 * server, so a fresh file always starts clean.
 */

export interface ReviewableDocument {
    field: string;
    label: string;
    /** Null when the tile is empty — nothing to decide. */
    url: string | null;
}

interface DocumentDecisionControlsProps {
    document: ReviewableDocument;
    review: KycDocumentReview | undefined;
    /** No decisions once the record is decided or the domain is off. */
    disabled?: boolean;
    onDecide: (field: string, decision: DocumentDecision, note?: string) => Promise<void>;
    className?: string;
}

export function decisionMeta(review: KycDocumentReview | undefined) {
    if (!review) return null;
    return review.decision === "APPROVED"
        ? { label: "Approved", tone: "success" as const }
        : { label: "Flagged", tone: "warning" as const };
}

export function DocumentDecisionControls({ document, review, disabled, onDecide, className }: DocumentDecisionControlsProps) {
    const [busy, setBusy] = React.useState<DocumentDecision | null>(null);
    const [flagging, setFlagging] = React.useState(false);
    const [note, setNote] = React.useState("");

    const decide = async (decision: DocumentDecision, text?: string) => {
        setBusy(decision);
        try {
            await onDecide(document.field, decision, text);
            toast.success(decision === "APPROVED" ? `${document.label} approved` : `${document.label} flagged`, {
                description: text ? `“${text}”` : undefined,
            });
            setFlagging(false);
            setNote("");
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The decision did not reach ADX.");
        } finally {
            setBusy(null);
        }
    };

    const meta = decisionMeta(review);

    return (
        <div className={cn("flex shrink-0 items-center gap-1.5", className)}>
            {meta && <StatusBadge status={meta} />}
            {document.url && !disabled && (
                <>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={busy !== null || review?.decision === "APPROVED"}
                        onClick={() => void decide("APPROVED")}
                        aria-label={`Approve ${document.label}`}
                    >
                        <Check className="mr-1 size-3" aria-hidden />
                        {busy === "APPROVED" ? "Saving…" : "Approve"}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs text-warning hover:text-warning"
                        disabled={busy !== null}
                        onClick={() => setFlagging(true)}
                        aria-label={`Flag ${document.label}`}
                    >
                        <Flag className="mr-1 size-3" aria-hidden />
                        Flag
                    </Button>
                </>
            )}
            <ConfirmDialog
                open={flagging}
                onOpenChange={(open) => !open && setFlagging(false)}
                title={`Flag ${document.label}?`}
                description="Say what is wrong. The note is kept on the record and read back to them when the re-upload is asked for."
                confirmLabel="Flag document"
                busy={busy === "FLAGGED"}
                disabled={note.trim().length === 0}
                onConfirm={() => void decide("FLAGGED", note.trim())}
            >
                <Textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Blurry — the PAN number cannot be read…"
                    className="min-h-20 resize-none"
                    maxLength={500}
                    aria-label="Why the document is flagged"
                />
            </ConfirmDialog>
        </div>
    );
}
