"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-client";
import { EMAIL_CODE_LENGTH, emailCodeComplete, emailLooksValid, normalizeEmailCode } from "@/lib/email-gate";
import { usersService, type EmailCodeSent } from "@/services/users";

interface VerifyEmailGateProps {
    /** The address on file, or null for an account that has none yet. */
    email: string | null;
    /** Called once the code answered — the caller re-reads the profile and the shell opens. */
    onVerified: () => void | Promise<void>;
    onSignOut: () => void;
}

/**
 * ED-1: where an operator lands until their email answers a code.
 *
 * Drawn in the no-role card's shape: the account named, the way through
 * stated, nothing guessed. The address on file is what the code goes to
 * unless it is wrong — "Not your address?" opens it for editing, and the
 * verify makes whichever address answered the primary (the backend's own
 * rule), so no separate profile write is needed. The code is eight capital
 * letters with I and O left out, typed in any case; the box keeps only
 * what a code can contain. Sign out is the other way off the card.
 */
export function VerifyEmailGate({ email, onVerified, onSignOut }: VerifyEmailGateProps) {
    const [address, setAddress] = React.useState(email ?? "");
    const [editing, setEditing] = React.useState(!email);
    const [sent, setSent] = React.useState<EmailCodeSent | null>(null);
    const [code, setCode] = React.useState("");
    const [busy, setBusy] = React.useState<"send" | "verify" | null>(null);
    const [problem, setProblem] = React.useState<string | null>(null);
    /* The clock the expiry and the resend cooldown count down on: seconds left, ticked once a second while a code stands. */
    const [left, setLeft] = React.useState<{ expires: number; resend: number } | null>(null);

    React.useEffect(() => {
        if (!left || (left.expires <= 0 && left.resend <= 0)) return;
        const timer = window.setInterval(() => {
            setLeft((current) => (current ? { expires: Math.max(0, current.expires - 1), resend: Math.max(0, current.resend - 1) } : current));
        }, 1000);
        return () => window.clearInterval(timer);
    }, [left]);

    const addressOk = emailLooksValid(address);
    const expired = sent !== null && left !== null && left.expires <= 0;

    const send = async () => {
        if (!addressOk || busy) return;
        setBusy("send");
        setProblem(null);
        try {
            const answer = await usersService.sendMyEmailCode(address);
            setSent(answer);
            setAddress(answer.email);
            setEditing(false);
            setCode("");
            setLeft({ expires: answer.expiresInSeconds, resend: answer.resendAfterSeconds });
            toast.success(`Code sent to ${answer.email}`, {
                description: `${EMAIL_CODE_LENGTH} letters, valid for ${Math.round(answer.expiresInSeconds / 60)} minutes.`,
            });
        } catch (error) {
            if (error instanceof ApiError && error.code === "ALREADY_VERIFIED") {
                /* The profile the shell read is behind: the address answered a code elsewhere. Let the caller re-read. */
                await onVerified();
                return;
            }
            setProblem(error instanceof Error ? error.message : "The code could not be sent.");
        } finally {
            setBusy(null);
        }
    };

    const verify = async () => {
        if (!emailCodeComplete(code) || busy) return;
        setBusy("verify");
        setProblem(null);
        try {
            await usersService.verifyMyEmail(address, code);
            toast.success("Email verified", { description: `${address} is now the address on your account.` });
            await onVerified();
        } catch (error) {
            setProblem(error instanceof Error ? error.message : "That code was not accepted.");
        } finally {
            setBusy(null);
        }
    };

    const minutes = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

    return (
        <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
            <Card className="w-full max-w-[454px] rounded-lg border-border p-8 shadow-none" data-testid="verify-email-gate">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Verify your email</p>
                <h1 className="mt-4 text-base font-semibold text-foreground">Prove the email on your account before the console opens</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    Every ADX account proves its number and its email. A code goes to the address below; type it back and you are in.
                    Nothing else on this account changes.
                </p>

                <div className="mt-6 space-y-4">
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3">
                            <Label htmlFor="gate-email">Email on file</Label>
                            {!editing && (
                                <button
                                    type="button"
                                    className="text-xs text-primary underline-offset-4 hover:underline"
                                    onClick={() => setEditing(true)}
                                    data-testid="gate-change-email"
                                >
                                    Not your address?
                                </button>
                            )}
                        </div>
                        {editing ? (
                            <Input
                                id="gate-email"
                                type="email"
                                autoComplete="email"
                                value={address}
                                placeholder="you@company.in"
                                onChange={(event) => setAddress(event.target.value)}
                                aria-invalid={address.trim() && !addressOk ? true : undefined}
                            />
                        ) : (
                            <p id="gate-email" className="text-sm font-medium text-foreground" data-testid="gate-email">
                                {address}
                            </p>
                        )}
                        {editing && <p className="text-xs text-muted-foreground">The address that answers the code becomes the one on your account.</p>}
                    </div>

                    {sent && (
                        <div className="space-y-1.5">
                            <Label htmlFor="gate-code">The {EMAIL_CODE_LENGTH}-letter code</Label>
                            <Input
                                id="gate-code"
                                inputMode="text"
                                autoComplete="one-time-code"
                                autoCapitalize="characters"
                                spellCheck={false}
                                value={code}
                                maxLength={EMAIL_CODE_LENGTH}
                                placeholder={"A".repeat(EMAIL_CODE_LENGTH)}
                                className="font-mono text-base uppercase tracking-[0.35em]"
                                onChange={(event) => setCode(normalizeEmailCode(event.target.value))}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") void verify();
                                }}
                                data-testid="gate-code"
                            />
                            <p className="text-xs text-muted-foreground" data-testid="gate-expiry">
                                {expired
                                    ? "That code has expired — send another."
                                    : left
                                      ? `Capital letters, no I or O; typed in any case. Expires in ${minutes(left.expires)}.`
                                      : "Capital letters, no I or O; typed in any case."}
                                {sent.devOtp ? ` Development code: ${sent.devOtp}.` : ""}
                            </p>
                        </div>
                    )}

                    {problem && (
                        <p className="text-xs text-danger" role="alert">
                            {problem}
                        </p>
                    )}
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-2">
                    {sent && !expired ? (
                        <Button onClick={verify} disabled={busy !== null || !emailCodeComplete(code)} data-testid="gate-verify">
                            {busy === "verify" ? "Checking…" : "Verify"}
                        </Button>
                    ) : null}
                    <Button
                        variant={sent && !expired ? "outline" : "default"}
                        className={sent && !expired ? "bg-card" : undefined}
                        onClick={send}
                        disabled={busy !== null || !addressOk || (left !== null && left.resend > 0 && !expired)}
                        data-testid="gate-send"
                    >
                        {busy === "send"
                            ? "Sending…"
                            : sent
                              ? left && left.resend > 0 && !expired
                                  ? `Resend in ${left.resend}s`
                                  : "Resend the code"
                              : "Send the code"}
                    </Button>
                    <Button variant="ghost" className="ml-auto" onClick={onSignOut} disabled={busy !== null}>
                        Sign out
                    </Button>
                </div>
            </Card>
        </div>
    );
}
