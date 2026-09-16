"use client";

import * as React from "react";
import { Check, Copy, Download, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, saveBlob } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
    RECOVERY_CODE_COUNT,
    TOTP_CODE_LENGTH,
    formatRecoveryCode,
    normaliseTotpCode,
    recoveryCodesText,
    twoFactorService,
    type EnrolmentStart,
} from "@/services/two-factor";

/**
 * Setting an authenticator app up (Lot K2) — the flow the account page's
 * "Set up" dialog and the shell's enrolment gate both run.
 *
 * Three steps. `POST /auth/2fa/totp/enrol` answers a secret, its otpauth
 * URI and a QR as an SVG data URL; the QR is drawn and the secret sits
 * under a reveal for the phone that cannot scan. The first six digits the
 * app shows go to `POST /auth/2fa/totp/confirm`, which seals the secret and
 * answers the ten recovery codes — once. They are shown with Copy and
 * Download (a `.txt` through the blob helper) and the flow does not finish
 * until the operator says they have saved them: the codes are the answer
 * to a lost phone, and a dialog closed on reflex loses them for good.
 *
 * The pending secret lives ten minutes on the server; a confirm after that
 * answers 409 TOTP_NOT_ENROLLED and the flow offers to start again.
 */

export type SetupStep = "starting" | "scan" | "codes";

interface AuthenticatorSetupProps {
    /** Called with the enrolment date once the operator has acknowledged the codes. */
    onDone: (enrolledAt: string) => void;
    /** Shown while scanning; absent when enrolment is required and there is nothing to go back to. */
    onCancel?: () => void;
    /** Lets the host know which step is showing, so a dialog can refuse to close over unsaved codes. */
    onStepChange?: (step: SetupStep) => void;
}

const message = (caught: unknown, fallback: string) => (caught instanceof ApiError ? caught.message : fallback);

/** `JBSWY3DPEHPK3PXP` → `JBSW Y3DP EHPK 3PXP`, the way apps print a key for typing. */
export function groupSecret(secret: string): string {
    return secret.replace(/(.{4})(?=.)/g, "$1 ");
}

export function AuthenticatorSetup({ onDone, onCancel, onStepChange }: AuthenticatorSetupProps) {
    const [step, setStep] = React.useState<SetupStep>("starting");
    const [start, setStart] = React.useState<EnrolmentStart | null>(null);
    const [startError, setStartError] = React.useState<string | null>(null);
    const [reveal, setReveal] = React.useState(false);
    const [code, setCode] = React.useState("");
    const [confirming, setConfirming] = React.useState(false);
    const [confirmError, setConfirmError] = React.useState<string | null>(null);
    const [expired, setExpired] = React.useState(false);
    const [done, setDone] = React.useState<{ enrolledAt: string; recoveryCodes: string[] } | null>(null);
    const [saved, setSaved] = React.useState(false);
    const [attempt, setAttempt] = React.useState(0);

    /* The host hears every step, so a dialog can refuse to close over unsaved codes. */
    React.useEffect(() => {
        onStepChange?.(step);
    }, [step, onStepChange]);

    /* The secret is asked for as the flow opens, and again on Start again. */
    React.useEffect(() => {
        let cancelled = false;
        void twoFactorService
            .enrol()
            .then((result) => {
                if (cancelled) return;
                setStart(result);
                setStep("scan");
            })
            .catch((caught: unknown) => {
                if (!cancelled) setStartError(message(caught, "Could not start the setup."));
            });
        return () => {
            cancelled = true;
        };
    }, [attempt]);

    const restart = () => {
        setStart(null);
        setStartError(null);
        setCode("");
        setConfirmError(null);
        setExpired(false);
        setReveal(false);
        setStep("starting");
        setAttempt((n) => n + 1);
    };

    const confirm = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (code.length !== TOTP_CODE_LENGTH || confirming) return;
        setConfirming(true);
        setConfirmError(null);
        try {
            const result = await twoFactorService.confirm(code);
            setDone(result);
            setStep("codes");
        } catch (caught) {
            if (caught instanceof ApiError && caught.status === 409 && caught.code === "TOTP_NOT_ENROLLED") {
                setExpired(true);
                setConfirmError("The setup ran out of time. Start again and scan the new code.");
            } else {
                setConfirmError(message(caught, "That code did not match. Check the app and try again."));
            }
            setCode("");
        } finally {
            setConfirming(false);
        }
    };

    if (step === "starting") {
        return (
            <div className="py-6 text-sm text-muted-foreground" aria-live="polite">
                {startError ? (
                    <div className="space-y-3">
                        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-danger">
                            {startError}
                        </p>
                        <div className="flex gap-2">
                            <Button type="button" variant="outline" className="bg-card" onClick={restart}>
                                Try again
                            </Button>
                            {onCancel && (
                                <Button type="button" variant="ghost" onClick={onCancel}>
                                    Cancel
                                </Button>
                            )}
                        </div>
                    </div>
                ) : (
                    "Preparing your setup…"
                )}
            </div>
        );
    }

    if (step === "codes" && done) {
        return (
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Your app is set up. These {RECOVERY_CODE_COUNT} recovery codes each sign you in once if the app is out of reach. They are
                    shown now and never again.
                </p>
                <RecoveryCodesPanel codes={done.recoveryCodes} saved={saved} onSavedChange={setSaved} />
                <div className="flex justify-end">
                    <Button type="button" disabled={!saved} onClick={() => onDone(done.enrolledAt)}>
                        Done
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <form onSubmit={confirm} noValidate className="space-y-4">
            <ol className="space-y-4 text-sm text-foreground">
                <li className="space-y-2">
                    <p>
                        <span className="font-medium">1.</span> Open your authenticator app — Google Authenticator, Authy, 1Password, any app that
                        takes a time-based code — and scan this.
                    </p>
                    {start && (
                        <div className="flex flex-wrap items-start gap-4">
                            {/* An SVG data URL, drawn by the server; nothing to fetch. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={start.qrSvg} alt="QR code for your authenticator app" width={176} height={176} className="rounded-md border bg-white p-2" />
                            <div className="min-w-0 flex-1 space-y-2">
                                <button
                                    type="button"
                                    onClick={() => setReveal((value) => !value)}
                                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                                >
                                    {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                    {reveal ? "Hide the key" : "Can't scan? Show the key"}
                                </button>
                                {reveal && (
                                    <div className="space-y-1">
                                        <p className="select-all break-all rounded-md bg-muted px-3 py-2 font-mono text-sm tracking-wider text-foreground" data-testid="totp-secret">
                                            {groupSecret(start.secret)}
                                        </p>
                                        <p className="text-xs text-muted-foreground">Type it into the app as a time-based key. It is shown once.</p>
                                    </div>
                                )}
                                <p className="text-xs text-muted-foreground">
                                    This code is good for {Math.round(start.expiresInSeconds / 60)} minutes.
                                </p>
                            </div>
                        </div>
                    )}
                </li>
                <li className="space-y-2">
                    <p>
                        <span className="font-medium">2.</span> Enter the six digits the app shows.
                    </p>
                    <div className="grid gap-1.5">
                        <Label htmlFor="totp-confirm-code" className="sr-only">
                            Code from the app
                        </Label>
                        <Input
                            id="totp-confirm-code"
                            value={code}
                            onChange={(event) => setCode(normaliseTotpCode(event.target.value))}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            placeholder="123 456"
                            maxLength={7}
                            disabled={confirming || expired}
                            aria-label="Code from the app"
                            className="max-w-[180px] text-center font-mono text-lg tracking-[0.3em] placeholder:font-sans placeholder:text-sm placeholder:tracking-normal"
                        />
                    </div>
                </li>
            </ol>

            {confirmError && (
                <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                    {confirmError}
                </p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
                {onCancel && (
                    <Button type="button" variant="outline" className="bg-card" onClick={onCancel} disabled={confirming}>
                        Cancel
                    </Button>
                )}
                {expired ? (
                    <Button type="button" onClick={restart}>
                        Start again
                    </Button>
                ) : (
                    <Button type="submit" disabled={confirming || code.length !== TOTP_CODE_LENGTH}>
                        {confirming ? "Checking…" : "Confirm"}
                    </Button>
                )}
            </div>
        </form>
    );
}

/* ------------------------------------------------------------------ */
/* The recovery codes                                                  */
/* ------------------------------------------------------------------ */

interface RecoveryCodesPanelProps {
    codes: readonly string[];
    saved: boolean;
    onSavedChange: (saved: boolean) => void;
}

/** The ten codes, Copy, Download, and the "I have saved them" gate the host reads before it lets the dialog close. */
export function RecoveryCodesPanel({ codes, saved, onSavedChange }: RecoveryCodesPanelProps) {
    const [copied, setCopied] = React.useState(false);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(codes.map(formatRecoveryCode).join("\n"));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error("Could not copy — select the codes and copy them by hand.");
        }
    };

    const download = () => {
        saveBlob(new Blob([recoveryCodesText(codes)], { type: "text/plain;charset=utf-8" }), "adx-recovery-codes.txt");
    };

    return (
        <div className="space-y-3">
            <ol className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-md border bg-muted/40 px-4 py-3 font-mono text-sm tracking-wider text-foreground" data-testid="recovery-codes">
                {codes.map((code) => (
                    <li key={code} className="select-all">
                        {formatRecoveryCode(code)}
                    </li>
                ))}
            </ol>
            <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" className="h-8 bg-card" onClick={() => void copy()}>
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copied ? "Copied" : "Copy"}
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-8 bg-card" onClick={download}>
                    <Download className="size-4" />
                    Download .txt
                </Button>
            </div>
            <label className={cn("flex items-start gap-2.5 rounded-md border px-3 py-2", saved ? "border-success/40 bg-success-soft/40" : "")}>
                <Checkbox checked={saved} onCheckedChange={(state) => onSavedChange(state === true)} aria-label="I have saved these codes" className="mt-0.5" />
                <span className="text-sm text-foreground">I have saved these codes somewhere only I can read them.</span>
            </label>
        </div>
    );
}
