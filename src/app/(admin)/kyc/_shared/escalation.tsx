"use client";

import * as React from "react";
import { ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime } from "@/lib/format";
import { ESCALATION_SOURCE_LABEL, escalationChip, personLabel } from "@/services/kyc";
import type { KycEscalation } from "@/types";

interface EscalateKycDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Whose case — for the copy. */
    party: string;
    /** `POST …/escalate { reason }` on the desk's own row. */
    onEscalate: (reason: string) => Promise<void>;
}

/**
 * "Escalate" — Lot G (Q127/142), on both desks.
 *
 * The case is handed to a member of the Compliance pool (the console role
 * named Compliance, else KYC reviewer, else Super admin, else any admin —
 * the server picks; the reviewer escalating is never picked for their own
 * case while somebody else is in the pool). The reason is required and
 * goes on the row and the KYC_ESCALATED audit line. A flag, not a status:
 * the desk still decides, and the decision clears it. Once is enough — a
 * second escalation is refused 409.
 */
export function EscalateKycDialog({ open, onOpenChange, party, onEscalate }: EscalateKycDialogProps) {
    const [reason, setReason] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    const escalate = async () => {
        setBusy(true);
        try {
            await onEscalate(reason.trim());
            toast.success("Case escalated to Compliance", { description: `${party}'s case was handed over; they have been told.` });
            setReason("");
            onOpenChange(false);
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The escalation did not reach ADX.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <ConfirmDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Escalate this case to Compliance?"
            description={`${party}'s case is handed to a member of the Compliance pool, who is told in-app. The queue keeps it; anyone may still decide it, and the decision clears the escalation.`}
            confirmLabel="Escalate"
            busy={busy}
            disabled={reason.trim().length === 0}
            onConfirm={() => void escalate()}
        >
            <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why it needs Compliance — kept on the record and the audit line"
                className="min-h-20 resize-none"
                maxLength={2000}
                aria-label="Reason for escalating"
            />
        </ConfirmDialog>
    );
}

interface EscalateButtonProps {
    party: string;
    escalation: KycEscalation | null;
    /** A decided case cannot be escalated; the button is disabled with the reason. */
    decided: boolean;
    onEscalate: (reason: string) => Promise<void>;
}

/** The "Escalate" button and its dialog, one owner. Disabled once escalated (409 on a second) or decided. */
export function EscalateButton({ party, escalation, decided, onEscalate }: EscalateButtonProps) {
    const [open, setOpen] = React.useState(false);
    return (
        <>
            <Button
                variant="outline"
                className="bg-card text-danger hover:text-danger"
                disabled={decided || escalation !== null}
                title={escalation ? "Already escalated — the decision clears it" : decided ? "A decided case cannot be escalated" : undefined}
                onClick={() => setOpen(true)}
            >
                <ArrowUpRight className="mr-1.5 size-4" aria-hidden />
                {escalation ? "Escalated" : "Escalate"}
            </Button>
            <EscalateKycDialog open={open} onOpenChange={setOpen} party={party} onEscalate={onEscalate} />
        </>
    );
}

interface EscalationCardProps {
    escalation: KycEscalation | null;
    className?: string;
}

/**
 * What the case carries once escalated: when, from where (the nightly age
 * sweep, a fraud case, the reviewer), to whom, and why. Draws nothing while
 * the case is not escalated. G11-1: the two people are named by the read
 * (`escalatedTo` / `escalatedBy`), the id standing in where the lookup
 * found no name.
 */
export function EscalationCard({ escalation, className }: EscalationCardProps) {
    if (!escalation) return null;
    const chip = escalationChip(escalation);
    const to = personLabel(escalation.to) ?? "nobody in the pool yet";
    const by = personLabel(escalation.by);
    return (
        <Card className={`rounded-lg border-danger/20 bg-danger-soft/40 p-5 shadow-none ${className ?? ""}`} data-testid="kyc-escalation">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-danger">Escalated to Compliance</h3>
                {chip && <StatusBadge status={chip} />}
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div>
                    <dt className="text-xs text-muted-foreground">When</dt>
                    <dd className="font-medium text-foreground">{formatDateTime(escalation.at)}</dd>
                </div>
                <div>
                    <dt className="text-xs text-muted-foreground">Source</dt>
                    <dd className="font-medium text-foreground">
                        {ESCALATION_SOURCE_LABEL[escalation.source] ?? escalation.source}
                        {by ? ` · by ${by}` : ""}
                    </dd>
                </div>
                <div>
                    <dt className="text-xs text-muted-foreground">Handed to</dt>
                    <dd className="font-medium text-foreground">{to}</dd>
                </div>
                <div className="sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">Reason</dt>
                    <dd className="text-foreground">{escalation.reason || "—"}</dd>
                </div>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">A flag, not a status: decide the case as usual and the escalation clears.</p>
        </Card>
    );
}
