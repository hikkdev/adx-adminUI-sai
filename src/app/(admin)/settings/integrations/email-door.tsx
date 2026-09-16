"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/adx/status-badge";
import { cn } from "@/lib/utils";
import {
    EMAIL_DOOR_LABEL,
    EMAIL_MODES,
    EMAIL_MODE_LABEL,
    ETHEREAL_WEB_URL,
    effectiveEmailDoor,
    emailModeOf,
    emailTestBlocker,
    integrationsService,
    type EmailDoorVerdict,
    type EmailMode,
    type EmailSettings,
    type IntegrationsSettings,
} from "@/services/integrations";

export const ETHEREAL_SENTENCE = "A throwaway inbox at ethereal.email catches every message - nothing is delivered. Open the inbox with the login below.";
export const GMAIL_HELPER = "Gmail: smtp.gmail.com, port 587, your address as user, a Google App Password as password.";

/** The SMTP fields that have no meaning while the Ethereal inbox stands in for the host. */
export const SMTP_HOST_FIELDS: readonly string[] = ["host", "port", "user", "password"];

/**
 * AE-C: the SMTP door's mode — `PUT /integrations { section: "email",
 * patch: { mode } }`. A segmented control: the host, or the Ethereal test
 * inbox the backend mints once and caches for a day. Under Ethereal the
 * host fields collapse to the sentence below with the inbox's login name;
 * under SMTP the form stands as it was, with the Gmail recipe under it.
 */
export function EmailModeControl({ email, onChanged }: { email: EmailSettings | undefined; onChanged: () => void }) {
    const [busy, setBusy] = React.useState<EmailMode | null>(null);
    const mode = emailModeOf(email);

    const choose = async (next: EmailMode) => {
        if (next === mode) return;
        setBusy(next);
        try {
            await integrationsService.update("email", { mode: next });
            toast.success(next === "ETHEREAL" ? "Email goes to the Ethereal test inbox" : "Email goes through the SMTP host", {
                description:
                    next === "ETHEREAL"
                        ? "Nothing is delivered from now on; every message gets a preview link in the delivery log."
                        : "Messages leave through the host on file again.",
            });
            onChanged();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not switch the email mode.");
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="space-y-2">
            <div className="space-y-1">
                <Label className="text-xs">Mode</Label>
                <div role="radiogroup" aria-label="SMTP mode" className="inline-flex w-full rounded-md border p-0.5">
                    {EMAIL_MODES.map((option) => {
                        const active = option === mode;
                        return (
                            <button
                                key={option}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                disabled={busy !== null}
                                onClick={() => choose(option)}
                                className={cn(
                                    "flex-1 rounded px-2 py-1 text-xs font-medium transition-colors disabled:cursor-default",
                                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/60",
                                )}
                            >
                                {EMAIL_MODE_LABEL[option]}
                            </button>
                        );
                    })}
                </div>
            </div>
            {mode === "ETHEREAL" ? <EtherealInboxNote email={email} /> : <p className="text-[11px] text-muted-foreground">{GMAIL_HELPER}</p>}
        </div>
    );
}

/** Under Ethereal: the sentence, the inbox's login name from the read, and the link to open it. */
function EtherealInboxNote({ email }: { email: EmailSettings | undefined }) {
    const user = email?.ethereal?.user ?? null;
    const webUrl = email?.ethereal?.webUrl ?? ETHEREAL_WEB_URL;
    return (
        <div className="space-y-1.5 rounded-md bg-muted/40 p-3 text-xs">
            <p className="text-muted-foreground">{ETHEREAL_SENTENCE}</p>
            <p>
                <span className="text-muted-foreground">Inbox user: </span>
                {user ? (
                    <span className="font-mono text-foreground">{user}</span>
                ) : (
                    <span className="text-muted-foreground">none yet — the first send or a test email creates one.</span>
                )}
            </p>
            <a href={webUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline underline-offset-2">
                Open the Ethereal inbox
                <ExternalLink className="size-3" aria-hidden />
            </a>
        </div>
    );
}

/**
 * AE-C: "Send test email" — a small dialog with a To field, then
 * `POST /integrations/email/test { to }`, and the verdict inline: the door
 * used, ok or not with the sentence, the message id, and the Ethereal
 * preview link when there is one. The verdict stays until the card
 * re-reads. Disabled, with the reason, while the door in force has nothing
 * to send with.
 */
export function EmailTestControl({ settings, operatorEmail }: { settings: Pick<IntegrationsSettings, "email" | "resend">; operatorEmail?: string | null }) {
    const [open, setOpen] = React.useState(false);
    const [to, setTo] = React.useState(operatorEmail ?? "");
    const [busy, setBusy] = React.useState(false);
    const [verdict, setVerdict] = React.useState<EmailDoorVerdict | null>(null);
    const blocker = emailTestBlocker(settings);
    const door = effectiveEmailDoor(settings);
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());

    const send = async () => {
        setBusy(true);
        try {
            const answer = await integrationsService.testEmailDoor(to.trim());
            setVerdict(answer);
            setOpen(false);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not send the test email.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                    Sends one message through <span className="font-medium text-foreground">{EMAIL_DOOR_LABEL[door]}</span> and prints what the door answered.
                </p>
                <Button size="sm" variant="outline" className="h-8" disabled={Boolean(blocker)} onClick={() => setOpen(true)}>
                    Send test email
                </Button>
            </div>
            {blocker && <p className="text-[11px] text-warning">{blocker}</p>}
            {verdict && <EmailTestVerdict verdict={verdict} />}

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Send a test email</DialogTitle>
                        <DialogDescription>
                            One message, subject &ldquo;ADX test message&rdquo;, through {EMAIL_DOOR_LABEL[door]}. The address is not recorded.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-1">
                        <Label htmlFor="email-test-to" className="text-xs">
                            To
                        </Label>
                        <Input
                            id="email-test-to"
                            type="email"
                            value={to}
                            autoComplete="off"
                            placeholder="you@example.com"
                            onChange={(event) => setTo(event.target.value)}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button size="sm" disabled={busy || !valid} onClick={send}>
                            {busy ? "Sending…" : "Send"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/** The verdict, as the backend answered it: the door, the outcome, the id and the preview. */
function EmailTestVerdict({ verdict }: { verdict: EmailDoorVerdict }) {
    return (
        <div data-testid="email-test-verdict" className="space-y-1 rounded-md border p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                    status={verdict.ok ? { label: "Sent", tone: "success" } : { label: verdict.configured ? "Refused" : "Not configured", tone: "danger" }}
                />
                <span className="text-muted-foreground">via {EMAIL_DOOR_LABEL[verdict.provider]}</span>
            </div>
            <p className={verdict.ok ? "text-foreground" : "text-danger"}>{verdict.message}</p>
            {verdict.messageId && (
                <p className="break-all font-mono text-[11px] text-muted-foreground" title="The message id the door answered">
                    {verdict.messageId}
                </p>
            )}
            {verdict.response && <p className="break-all font-mono text-[11px] text-muted-foreground">{verdict.response}</p>}
            {verdict.previewUrl && (
                <a href={verdict.previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline underline-offset-2">
                    Open preview
                    <ExternalLink className="size-3" aria-hidden />
                </a>
            )}
        </div>
    );
}
