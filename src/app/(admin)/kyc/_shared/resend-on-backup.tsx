"use client";

import * as React from "react";
import { LifeBuoy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { useOptionalAuth } from "@/lib/auth";
import {
    BACKUP_SWITCHED_OFF,
    RESEND_CONFIRM,
    RESEND_CONFIRM_TITLE,
    backupOffer,
    resendRefusal,
    resendToastTitle,
    verificationService,
    type KycCaseType,
} from "@/services/verification";

/** The permission the resend route asks for — the same one the queues' row actions read (kept here so the row actions can import this file). */
const KYC_EDIT_PERMISSION = "kyc.edit";

/** What the case page knows about the backup for this case, from `GET /verification/attempts`. */
export interface BackupState {
    caseType: KycCaseType;
    caseId: string;
    /** The backup can be sent now: switched on, configured, the account's type known, not verified. */
    available: boolean;
    setting: "ON" | "OFF";
}

/**
 * `POST /verification/cases/:caseType/:caseId/resend-on-backup` and the
 * desk's toast for its answer: "Sent — they've been notified." when the
 * person has an app account, "…tell them yourself." when not; a refusal
 * (409 BACKUP_NOT_AVAILABLE / KYC_ALREADY_VERIFIED, 404) in the server's
 * own sentence. Resolves true when the session was opened.
 */
export async function sendOnBackup(caseType: KycCaseType, caseId: string): Promise<boolean> {
    try {
        const result = await verificationService.resendOnBackup(caseType, caseId);
        toast.success(resendToastTitle(result.notified));
        return true;
    } catch (cause) {
        toast.error("The backup was not sent", { description: resendRefusal(cause) });
        return false;
    }
}

/**
 * A desk Digio request or restart that failed, toasted: when the server
 * says the backup can be sent for this case (`error.details.backup`), the
 * toast offers "Resend on backup" — the same call as the case page's
 * button. Otherwise the plain toast it always was.
 */
export function toastStartFailure(message: string, cause: unknown, onSent?: () => void): void {
    const offer = backupOffer(cause);
    if (!offer) {
        toast.error(message);
        return;
    }
    toast.error(message, {
        description: "ADX's own identity check can be sent instead.",
        action: {
            label: "Resend on backup",
            onClick: () => {
                void sendOnBackup(offer.caseType, offer.caseId).then((sent) => {
                    if (sent) onSent?.();
                });
            },
        },
    });
}

/**
 * "Resend on backup" — drawn when the backup can be sent, and disabled
 * with the reason while the switch is off; hidden otherwise (verified, the
 * provider unconfigured — the panel says which). Behind a confirm, and only
 * for an operator holding `kyc.edit`.
 */
export function ResendOnBackupButton({ backup, onSent, size = "sm" }: { backup: BackupState | null | undefined; onSent: () => void; size?: "sm" | "default" }) {
    // Optional: the card is drawn inside pages other tests render without an <AuthProvider>; no session, no button.
    const auth = useOptionalAuth();
    const [confirming, setConfirming] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    if (!backup || !auth?.can(KYC_EDIT_PERMISSION)) return null;
    const off = backup.setting === "OFF";
    if (!backup.available && !off) return null;

    const send = async () => {
        setBusy(true);
        const sent = await sendOnBackup(backup.caseType, backup.caseId);
        setBusy(false);
        setConfirming(false);
        if (sent) onSent();
    };

    return (
        <>
            <Button
                type="button"
                variant="outline"
                size={size}
                className={size === "sm" ? "h-8 bg-card" : "bg-card"}
                disabled={off || busy}
                title={off ? BACKUP_SWITCHED_OFF : undefined}
                onClick={() => setConfirming(true)}
                data-testid="resend-on-backup"
            >
                <LifeBuoy className="mr-1.5 size-4" aria-hidden />
                {busy ? "Sending…" : "Resend on backup"}
            </Button>
            <ConfirmDialog
                open={confirming}
                onOpenChange={(open) => !busy && setConfirming(open)}
                title={RESEND_CONFIRM_TITLE}
                description={RESEND_CONFIRM}
                confirmLabel="Send"
                busy={busy}
                onConfirm={() => void send()}
            />
        </>
    );
}
