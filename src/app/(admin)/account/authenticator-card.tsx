"use client";

import * as React from "react";
import { Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AuthenticatorSetup, RecoveryCodesPanel, type SetupStep } from "@/components/adx/authenticator-setup";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import {
    RECOVERY_CODES_LOW,
    RECOVERY_CODE_COUNT,
    RECOVERY_CODE_LENGTH,
    TOTP_CODE_LENGTH,
    formatRecoveryCode,
    normaliseRecoveryCode,
    normaliseTotpCode,
    twoFactorService,
    type TwoFactorStatus,
} from "@/services/two-factor";

/**
 * The Authenticator app card on My account (Lot K2).
 *
 * Not enrolled: "Set up" opens the enrolment flow — QR, the key under a
 * reveal, the first code, the ten recovery codes shown once behind an "I
 * have saved them" gate. Enrolled: when, how many codes are left (with the
 * server's own low-water mark drawn as a warning), "Regenerate codes" (the
 * app's code proves it; a fresh ten behind the same gate) and "Turn off"
 * (the app's code, or a recovery code when the phone is gone).
 *
 * The policy lines say what the platform has decided: whether every admin
 * must enrol, and whether SMS and email still work at sign-in once one has.
 * A status the backend could not answer leaves the card saying so rather
 * than drawing "not enrolled" over an enrolment it cannot see.
 */

const message = (caught: unknown, fallback: string) => (caught instanceof ApiError ? caught.message : fallback);

interface AuthenticatorCardProps {
    /** `GET /auth/2fa/status`; null when the read failed. */
    status: TwoFactorStatus | null;
    onChanged: () => void;
}

export function AuthenticatorCard({ status, onChanged }: AuthenticatorCardProps) {
    const [setupOpen, setSetupOpen] = React.useState(false);
    const [regenerateOpen, setRegenerateOpen] = React.useState(false);
    const [disableOpen, setDisableOpen] = React.useState(false);

    if (!status) {
        return (
            <SectionCard title="Authenticator app" description="A time-based code from an app on your phone">
                <p className="text-sm text-muted-foreground">Your second-factor status could not be read just now. Reload to try again.</p>
            </SectionCard>
        );
    }

    const { authenticator, policy } = status;
    const low = authenticator.enrolled && authenticator.recoveryCodesLeft <= RECOVERY_CODES_LOW;

    return (
        <SectionCard
            title="Authenticator app"
            description={
                policy.authenticatorRequired ? "Required of every admin by the platform policy" : "A time-based code from an app on your phone"
            }
        >
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <span className={authenticator.enrolled ? "flex size-9 items-center justify-center rounded-md bg-success-soft" : "flex size-9 items-center justify-center rounded-md bg-muted"}>
                        <Smartphone className={authenticator.enrolled ? "size-4 text-success" : "size-4 text-muted-foreground"} />
                    </span>
                    <div>
                        <p className="text-sm font-medium text-foreground">
                            {authenticator.enrolled
                                ? `Enrolled${authenticator.enrolledAt ? ` on ${formatDate(authenticator.enrolledAt)}` : ""}`
                                : "Not set up"}
                        </p>
                        <p className="text-xs text-muted-foreground" data-testid="authenticator-detail">
                            {authenticator.enrolled
                                ? `${authenticator.recoveryCodesLeft} of ${RECOVERY_CODE_COUNT} recovery ${authenticator.recoveryCodesLeft === 1 ? "code" : "codes"} left`
                                : status.mustEnrolAuthenticator
                                  ? "Set one up now — nothing else in the console opens until you do."
                                  : "Sign in with the app instead of waiting for an SMS. Ten recovery codes cover a lost phone."}
                            {policy.smsAllowedWhenEnrolled
                                ? ""
                                : " · Once enrolled, SMS and email codes are not offered at sign-in; a recovery code always works."}
                        </p>
                        {low && (
                            <p role="status" className="mt-1 text-xs font-medium text-warning">
                                Running low on recovery codes — generate a new set before they run out.
                            </p>
                        )}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {authenticator.enrolled ? (
                        <>
                            <StatusBadge status={{ label: "On", tone: "success" }} />
                            <Button variant="outline" className="bg-card" onClick={() => setRegenerateOpen(true)}>
                                Regenerate codes
                            </Button>
                            <Button variant="outline" className="bg-card text-danger hover:text-danger" onClick={() => setDisableOpen(true)}>
                                Turn off
                            </Button>
                        </>
                    ) : (
                        <Button onClick={() => setSetupOpen(true)}>Set up</Button>
                    )}
                </div>
            </div>

            <EnrolDialog open={setupOpen} onOpenChange={setSetupOpen} onEnrolled={onChanged} />
            <RegenerateDialog open={regenerateOpen} onOpenChange={setRegenerateOpen} onRegenerated={onChanged} />
            <DisableDialog open={disableOpen} onOpenChange={setDisableOpen} onDisabled={onChanged} />
        </SectionCard>
    );
}

/* ------------------------------------------------------------------ */
/* Set up                                                              */
/* ------------------------------------------------------------------ */

interface EnrolDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onEnrolled: () => void;
}

/**
 * The setup in a dialog. Closing is refused while the recovery codes are on
 * screen and unacknowledged — the X, the overlay and Escape all go through
 * `onOpenChange`, so one check covers them. Mounted fresh on every open so
 * a second setup asks the server for a second secret.
 */
export function EnrolDialog({ open, onOpenChange, onEnrolled }: EnrolDialogProps) {
    const [step, setStep] = React.useState<SetupStep>("starting");

    const handleOpenChange = (next: boolean) => {
        if (!next && step === "codes") return;
        onOpenChange(next);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Set up your authenticator app</DialogTitle>
                    <DialogDescription>
                        {step === "codes"
                            ? "Save your recovery codes before you close this."
                            : "Your next sign-in asks for the code the app shows, in place of an SMS."}
                    </DialogDescription>
                </DialogHeader>
                {open && (
                    <AuthenticatorSetup
                        onStepChange={setStep}
                        onCancel={() => onOpenChange(false)}
                        onDone={() => {
                            toast.success("Authenticator app set up", { description: "Your next sign-in asks for the app's code." });
                            onOpenChange(false);
                            onEnrolled();
                        }}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

/* ------------------------------------------------------------------ */
/* Regenerate the codes                                                */
/* ------------------------------------------------------------------ */

interface RegenerateDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onRegenerated: () => void;
}

function RegenerateDialog({ open, onOpenChange, onRegenerated }: RegenerateDialogProps) {
    const [code, setCode] = React.useState("");
    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [codes, setCodes] = React.useState<string[] | null>(null);
    const [saved, setSaved] = React.useState(false);

    const reset = () => {
        setCode("");
        setError(null);
        setCodes(null);
        setSaved(false);
    };

    const handleOpenChange = (next: boolean) => {
        /* A fresh set on screen and unacknowledged stays on screen. */
        if (!next && codes && !saved) return;
        if (!next) reset();
        onOpenChange(next);
    };

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (code.length !== TOTP_CODE_LENGTH) return;
        setSubmitting(true);
        setError(null);
        try {
            const result = await twoFactorService.regenerateRecoveryCodes(code);
            setCodes(result.recoveryCodes);
        } catch (caught) {
            setError(message(caught, "That code did not match. Check the app and try again."));
            setCode("");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Regenerate recovery codes</DialogTitle>
                    <DialogDescription>
                        {codes ? "The old codes no longer work. Save these before you close this." : "A fresh set of ten; every old code stops working the moment they are issued."}
                    </DialogDescription>
                </DialogHeader>
                {codes ? (
                    <div className="space-y-4">
                        <RecoveryCodesPanel codes={codes} saved={saved} onSavedChange={setSaved} />
                        <DialogFooter>
                            <Button
                                type="button"
                                disabled={!saved}
                                onClick={() => {
                                    toast.success("Recovery codes regenerated");
                                    reset();
                                    onOpenChange(false);
                                    onRegenerated();
                                }}
                            >
                                Done
                            </Button>
                        </DialogFooter>
                    </div>
                ) : (
                    <form onSubmit={submit} noValidate className="space-y-4">
                        <div className="grid gap-1.5">
                            <Label htmlFor="regen-code">Code from your app</Label>
                            <Input
                                id="regen-code"
                                value={code}
                                onChange={(event) => setCode(normaliseTotpCode(event.target.value))}
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                placeholder="123 456"
                                maxLength={7}
                                autoFocus
                                className="max-w-[180px] text-center font-mono text-lg tracking-[0.3em] placeholder:font-sans placeholder:text-sm placeholder:tracking-normal"
                            />
                        </div>
                        {error && (
                            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                                {error}
                            </p>
                        )}
                        <DialogFooter>
                            <Button type="button" variant="outline" className="bg-card" onClick={() => handleOpenChange(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={submitting || code.length !== TOTP_CODE_LENGTH}>
                                {submitting ? "Checking…" : "Regenerate"}
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}

/* ------------------------------------------------------------------ */
/* Turn off                                                            */
/* ------------------------------------------------------------------ */

interface DisableDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onDisabled: () => void;
}

function DisableDialog({ open, onOpenChange, onDisabled }: DisableDialogProps) {
    const [useRecovery, setUseRecovery] = React.useState(false);
    const [code, setCode] = React.useState("");
    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const complete = useRecovery ? code.length === RECOVERY_CODE_LENGTH : code.length === TOTP_CODE_LENGTH;

    const reset = () => {
        setUseRecovery(false);
        setCode("");
        setError(null);
    };

    const handleOpenChange = (next: boolean) => {
        if (!next) reset();
        onOpenChange(next);
    };

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!complete) return;
        setSubmitting(true);
        setError(null);
        try {
            const result = await twoFactorService.disable(useRecovery ? { recoveryCode: code } : { code });
            toast.success(result?.message ?? "Authenticator app removed", { description: "Your next sign-in asks for a code to your phone." });
            reset();
            onOpenChange(false);
            onDisabled();
        } catch (caught) {
            setError(message(caught, useRecovery ? "That recovery code did not match." : "That code did not match. Check the app and try again."));
            setCode("");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md">
                <form onSubmit={submit} noValidate>
                    <DialogHeader>
                        <DialogTitle>Turn off your authenticator app</DialogTitle>
                        <DialogDescription>
                            Your next sign-in asks for a code to your phone again. Every recovery code is discarded with the app.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <label className="flex items-center justify-between gap-4">
                            <span>
                                <span className="block text-sm font-medium text-foreground">Use a recovery code</span>
                                <span className="block text-xs text-muted-foreground">For when the phone with the app is gone.</span>
                            </span>
                            <Switch
                                checked={useRecovery}
                                onCheckedChange={(value) => {
                                    setUseRecovery(value);
                                    setCode("");
                                    setError(null);
                                }}
                                aria-label="Use a recovery code"
                            />
                        </label>
                        <div className="grid gap-1.5">
                            <Label htmlFor="disable-code">{useRecovery ? "Recovery code" : "Code from your app"}</Label>
                            <Input
                                id="disable-code"
                                value={useRecovery ? formatRecoveryCode(code) : code}
                                onChange={(event) => setCode(useRecovery ? normaliseRecoveryCode(event.target.value) : normaliseTotpCode(event.target.value))}
                                inputMode={useRecovery ? "text" : "numeric"}
                                autoComplete="one-time-code"
                                autoCapitalize="characters"
                                spellCheck={false}
                                placeholder={useRecovery ? "ABCD-EFGH" : "123 456"}
                                maxLength={useRecovery ? RECOVERY_CODE_LENGTH + 1 : TOTP_CODE_LENGTH + 1}
                                className="max-w-[200px] text-center font-mono text-lg tracking-[0.2em] placeholder:font-sans placeholder:text-sm placeholder:tracking-normal"
                            />
                        </div>
                        {error && (
                            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                                {error}
                            </p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" className="bg-card" onClick={() => handleOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" variant="destructive" disabled={submitting || !complete}>
                            {submitting ? "Turning off…" : "Turn off"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
