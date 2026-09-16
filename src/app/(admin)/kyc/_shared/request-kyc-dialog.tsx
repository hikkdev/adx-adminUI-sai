"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { isAlreadyVerified, requestOutcome } from "@/services/kyc";
import { providerUnavailable } from "@/services/kyc-provider";
import type { KycRequestChannel } from "@/types";

/** What the request answers, for the toast — every party's route says whether anybody was told. */
export interface RequestKycResult {
    notified?: boolean;
    digio?: { kycId: string; validTill: string } | null;
}

interface RequestKycDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Who is asked — for the copy. */
    party: string;
    /** Whether the party has an app account the notice can reach. */
    hasAccount: boolean;
    /**
     * N3-C: where the Digio link goes when there is no app account — the
     * profile's mobile or email, which the server uses as Digio's customer.
     * Drawn as "No app account — the Digio link goes to <contact>; ADX
     * notices are not sent" so the desk knows nobody is told.
     */
    contact?: string | null;
    /** N3-C: the channel the dialog opens on — MANUAL from the row menu's "Request manual upload". */
    initialChannel?: KycRequestChannel;
    /** `POST …/request { channel, note? }` for this party. */
    onRequest: (channel: KycRequestChannel, note?: string) => Promise<RequestKycResult>;
    onRequested?: () => void;
}

/**
 * "Request KYC" — Lot N.
 *
 * The desk asks a party for their KYC over one of two channels: a Digio
 * session opened on their behalf (the link goes to them, the answer to
 * ADX's webhook), or a notice to upload the documents in the app. A note
 * rides with the notice. The confirm names what the party receives before
 * the desk commits, because the two channels put different things in
 * front of them. 409 `KYC_ALREADY_VERIFIED` is explained, and a Digio ask
 * while the provider is off is answered with the manual channel.
 */
export function RequestKycDialog({ open, onOpenChange, party, hasAccount, contact, initialChannel = "DIGIO", onRequest, onRequested }: RequestKycDialogProps) {
    const [channel, setChannel] = React.useState<KycRequestChannel>(initialChannel);
    const [note, setNote] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    const submit = async () => {
        setBusy(true);
        try {
            const result = await onRequest(channel, note);
            toast.success(`KYC requested from ${party}`, {
                description:
                    channel === "DIGIO"
                        ? result.notified === false
                            ? "The Digio check is open on their behalf, but they have no app account, so nobody was told — send them the link another way."
                            : "A Digio check is open on their behalf and they have been asked to finish it."
                        : result.notified === false
                          ? "They have no app account yet, so nobody was told — reach them another way."
                          : "They have been asked to upload their documents in the app.",
            });
            onOpenChange(false);
            setNote("");
            onRequested?.();
        } catch (cause) {
            if (isAlreadyVerified(cause)) {
                toast.error(`${party} is already verified`, { description: "There is nothing to request." });
                onOpenChange(false);
            } else if (providerUnavailable(cause)) {
                toast.error("Digio is not available right now", { description: "Ask for the documents by hand instead — choose Manual." });
                setChannel("MANUAL");
            } else {
                toast.error(cause instanceof Error ? cause.message : "The request did not reach ADX.");
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Request KYC from {party}</DialogTitle>
                    <DialogDescription>
                        The ask is stamped on their record with your name and the channel; the case reaches the queue when they answer.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Channel</Label>
                        <RadioGroup value={channel} onValueChange={(value) => setChannel(value as KycRequestChannel)} aria-label="Channel">
                            <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[[data-state=checked]]:border-primary">
                                <RadioGroupItem value="DIGIO" id="request-channel-digio" className="mt-0.5" />
                                <span>
                                    <span className="block text-sm font-medium text-foreground">Digio link</span>
                                    <span className="block text-xs text-muted-foreground">
                                        A Digio identity check opened on their behalf — Aadhaar, PAN and liveness in about a minute. Digio&apos;s answer decides the case.
                                    </span>
                                </span>
                            </label>
                            <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[[data-state=checked]]:border-primary">
                                <RadioGroupItem value="MANUAL" id="request-channel-manual" className="mt-0.5" />
                                <span>
                                    <span className="block text-sm font-medium text-foreground">Manual — upload on the phone</span>
                                    <span className="block text-xs text-muted-foreground">
                                        They are asked to upload their documents in the app; the desk reviews them tile by tile.
                                    </span>
                                </span>
                            </label>
                        </RadioGroup>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="request-kyc-note">Note to {party}</Label>
                        <Textarea
                            id="request-kyc-note"
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            rows={3}
                            maxLength={500}
                            placeholder="Optional — travels with the notice: which documents, by when, whom to call."
                        />
                    </div>

                    <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground" data-testid="request-outcome">
                        {requestOutcome(channel, party, hasAccount)}
                    </p>
                    {!hasAccount && (
                        <p className="rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-foreground" data-testid="no-account-line">
                            No app account — {channel === "DIGIO" ? `the Digio link goes to ${contact?.trim() || "the contact on the profile"}` : "there is no app to upload in"}; ADX notices are not sent.
                        </p>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button onClick={() => void submit()} disabled={busy}>
                        <Send className="mr-1.5 size-4" aria-hidden />
                        {busy ? "Sending…" : channel === "DIGIO" ? "Open the Digio check" : "Send the request"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

interface RequestKycButtonProps extends Omit<RequestKycDialogProps, "open" | "onOpenChange"> {
    /** A verified party has nothing to request; the button says so. */
    verified: boolean;
    /** Why the button is off when it is — no user id to ask, say. */
    disabledReason?: string | null;
    size?: "sm" | "default";
    className?: string;
}

/** The button and its dialog together — on the party pages and the workbench headers. */
export function RequestKycButton({ verified, disabledReason, size = "default", className, ...dialog }: RequestKycButtonProps) {
    const [open, setOpen] = React.useState(false);
    const [key, setKey] = React.useState(0);
    const reason = verified ? "Already verified — nothing to request" : (disabledReason ?? null);
    return (
        <>
            <Button
                variant="outline"
                size={size}
                className={className ?? "bg-card"}
                disabled={reason !== null}
                title={reason ?? undefined}
                onClick={() => {
                    setKey((value) => value + 1);
                    setOpen(true);
                }}
            >
                <Send className="mr-1.5 size-4" aria-hidden />
                Request KYC
            </Button>
            <RequestKycDialog key={key} open={open} onOpenChange={setOpen} {...dialog} />
        </>
    );
}
