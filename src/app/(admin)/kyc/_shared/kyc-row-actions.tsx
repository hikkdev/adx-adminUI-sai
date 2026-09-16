"use client";

import * as React from "react";
import Link from "next/link";
import { ClipboardList, FolderOpen, MoreHorizontal, RefreshCw, Send, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isAlreadyVerified, personLabel } from "@/services/kyc";
import { kycRowActions, type KycQueueState } from "@/services/kyc-state";
import { providerUnavailable } from "@/services/kyc-provider";
import type { KycRequest, KycRequestChannel } from "@/types";
import { RequestKycDialog, type RequestKycResult } from "./request-kyc-dialog";

/** The permission the one click is behind — `requirePermission('kyc.edit')` on every party's request route. */
export const KYC_EDIT_PERMISSION = "kyc.edit";

export interface KycRowActionsProps {
    state: KycQueueState;
    /** Who the row is — for the copy. */
    party: string;
    /** Whether the party has an app account the notice can reach (an agent, an employee and a print partner always do). */
    hasAccount: boolean;
    /** Where the Digio link goes when there is no account — the profile's contact. */
    contact?: string | null;
    /** The desk's ask on the row, or null while nobody has asked. */
    request: KycRequest | null;
    /** Where "Open the case" goes; null when the case opens in place (the advertiser tab's own pane). */
    caseHref?: string | null;
    /** The in-place opener, when there is no href. */
    onOpenCase?: () => void;
    /** `POST …/request` with no body — the one click; DIGIO is the server's default. */
    onDigio: () => Promise<RequestKycResult>;
    /** `POST …/request { channel, note? }` — the note dialog behind "Request manual upload". */
    onRequest: (channel: KycRequestChannel, note?: string) => Promise<RequestKycResult>;
    /** Opens the parent's Record-at-the-desk dialog, prefilled with the party. */
    onRecord: () => void;
    /** Re-reads the queue after a write. */
    onChanged: () => void;
    /** Compact for a table row; default for a card. */
    size?: "sm" | "default";
    className?: string;
}

/**
 * The actions a KYC row offers, by state — N3-C (the owner, 14 Sep 2026:
 * "ADX Admin/Super Admin and other people who'll be granted authority
 * should be able to send a Digio KYC request to the user with click of a
 * button").
 *
 * Every row whose state is not VERIFIED carries the primary "Send Digio
 * request": `POST …/request` with no body (the server defaults the channel
 * to DIGIO), a toast with the outcome, and — once asked and nothing is in —
 * "Requested on <date> by <who>" in its place with "Resend" behind a
 * confirm. A secondary menu offers "Request manual upload" (the Lot N
 * note dialog, opened on the manual channel) and "Record at the desk".
 * A row with a record offers "Open the case". The request button and the
 * manual ask are drawn only when the operator holds `kyc.edit`, read off
 * the session the way every other guarded control does (`useAuth().can`);
 * the route refuses anyone else, so the console does not offer it.
 */
export function KycRowActions({ state, party, hasAccount, contact, request, caseHref, onOpenCase, onDigio, onRequest, onRecord, onChanged, size = "sm", className }: KycRowActionsProps) {
    const { can } = useAuth();
    const canEdit = can(KYC_EDIT_PERMISSION);
    const actions = kycRowActions(state);
    const [sending, setSending] = React.useState(false);
    const [confirmResend, setConfirmResend] = React.useState(false);
    const [manualOpen, setManualOpen] = React.useState(false);
    const [manualKey, setManualKey] = React.useState(0);
    const open = request?.open === true && actions.resend;

    const sendDigio = async () => {
        setSending(true);
        try {
            const result = await onDigio();
            toast.success(`Digio request sent to ${party}`, {
                description:
                    result.notified === false
                        ? `The Digio check is open on their behalf; they have no app account, so the link goes to ${contact?.trim() || "the contact on the profile"} and no ADX notice is sent.`
                        : "A Digio check is open on their behalf and they have been asked to finish it.",
            });
            setConfirmResend(false);
            onChanged();
        } catch (cause) {
            if (isAlreadyVerified(cause)) {
                toast.error(`${party} is already verified`, { description: "There is nothing to request." });
                onChanged();
            } else if (providerUnavailable(cause)) {
                toast.error("Digio is not available right now", { description: "Ask for the documents by hand instead — Request manual upload." });
            } else {
                toast.error(cause instanceof Error ? cause.message : "The request did not reach ADX.");
            }
        } finally {
            setSending(false);
        }
    };

    const buttonClass = size === "sm" ? "h-8" : undefined;
    const openCase =
        actions.openCase &&
        (caseHref ? (
            <Button variant="outline" size={size} className={cn(buttonClass, "bg-card")} asChild>
                <Link href={caseHref} data-testid="kyc-open-case">
                    <FolderOpen className="mr-1.5 size-4" aria-hidden />
                    Open the case
                </Link>
            </Button>
        ) : onOpenCase ? (
            <Button variant="outline" size={size} className={cn(buttonClass, "bg-card")} onClick={onOpenCase} data-testid="kyc-open-case">
                <FolderOpen className="mr-1.5 size-4" aria-hidden />
                Open the case
            </Button>
        ) : null);

    return (
        <div className={cn("flex flex-wrap items-center gap-2", className)} data-testid="kyc-row-actions" data-state={state}>
            {openCase}

            {actions.request && canEdit && !open && (
                <Button size={size} className={buttonClass} disabled={sending} onClick={() => void sendDigio()} data-testid="kyc-send-digio">
                    <Send className="mr-1.5 size-4" aria-hidden />
                    {sending ? "Sending…" : "Send Digio request"}
                </Button>
            )}

            {actions.request && canEdit && open && request && (
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-testid="kyc-requested-on">
                    <span>
                        Requested on {formatDate(request.at)}
                        {personLabel(request.by) ? ` by ${personLabel(request.by)}` : ""}
                    </span>
                    <Button variant="outline" size={size} className={cn(buttonClass, "bg-card")} disabled={sending} onClick={() => setConfirmResend(true)} data-testid="kyc-resend">
                        <RefreshCw className="mr-1.5 size-4" aria-hidden />
                        Resend
                    </Button>
                </span>
            )}

            {actions.request && !canEdit && open && request && (
                <span className="text-xs text-muted-foreground" data-testid="kyc-requested-on">
                    Requested on {formatDate(request.at)}
                    {personLabel(request.by) ? ` by ${personLabel(request.by)}` : ""}
                </span>
            )}

            {(actions.record || (actions.request && canEdit)) && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8" data-testid="kyc-row-menu">
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">More KYC actions</span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        {actions.request && canEdit && (
                            <DropdownMenuItem
                                onSelect={() => {
                                    setManualKey((value) => value + 1);
                                    setManualOpen(true);
                                }}
                            >
                                <Upload className="mr-2 size-4" aria-hidden />
                                Request manual upload
                            </DropdownMenuItem>
                        )}
                        {actions.record && (
                            <DropdownMenuItem onSelect={onRecord}>
                                <ClipboardList className="mr-2 size-4" aria-hidden />
                                Record at the desk
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}

            <ConfirmDialog
                open={confirmResend}
                onOpenChange={setConfirmResend}
                title={`Resend the Digio request to ${party}?`}
                description={
                    request
                        ? `They were asked on ${formatDate(request.at)}${personLabel(request.by) ? ` by ${personLabel(request.by)}` : ""} and nothing has come back. A fresh Digio check is opened on their behalf${hasAccount ? " and they are told again" : `; they have no app account, so the link goes to ${contact?.trim() || "the contact on the profile"} and no ADX notice is sent`}.`
                        : ""
                }
                confirmLabel="Resend"
                busy={sending}
                onConfirm={() => void sendDigio()}
            />

            <RequestKycDialog
                key={manualKey}
                open={manualOpen}
                onOpenChange={setManualOpen}
                party={party}
                hasAccount={hasAccount}
                contact={contact}
                initialChannel="MANUAL"
                onRequest={onRequest}
                onRequested={onChanged}
            />
        </div>
    );
}
