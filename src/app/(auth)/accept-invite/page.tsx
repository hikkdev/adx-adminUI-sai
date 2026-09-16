"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Lock, Phone, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleSignInButton } from "@/components/adx/google-sign-in-button";
import { ApiError } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";
import { useAuth } from "@/lib/auth";
import { usersService, type AcceptInviteResult, type InviteDescription } from "@/services/users";

/**
 * Accepting an invitation to the console (Q26) — no DR 10 frame draws this
 * screen, so it is composed from the sign-in card.
 *
 * Two calls to `POST /auth/accept-invite`. The first, with a name and a
 * mobile, sends a code to that number: it is proved before the account
 * exists because the second factor will send to it. The second, with the
 * code — and a password when the invitation said so — creates the admin.
 * An invitation for Google Workspace ends with the Google button instead of
 * a password, and only when the console has a client ID to render it with.
 */

const MIN_PASSWORD = 8;

/** Mirrors the backend's mobile rule, so the obvious mistakes are caught before a round trip. */
const MOBILE_RULE = /^\+?[1-9]\d{9,14}$/;

type Step = "loading" | "invalid" | "details" | "code" | "done";

function AcceptInviteForm() {
    const router = useRouter();
    const params = useSearchParams();
    const token = params.get("token") ?? "";
    const { signInWithGoogle } = useAuth();

    const [step, setStep] = React.useState<Step>(token ? "loading" : "invalid");
    const [invite, setInvite] = React.useState<InviteDescription | null>(null);
    const [name, setName] = React.useState("");
    const [mobile, setMobile] = React.useState("");
    const [otpCode, setOtpCode] = React.useState("");
    const [password, setPassword] = React.useState("");
    const [reveal, setReveal] = React.useState(false);
    const [sent, setSent] = React.useState<Extract<AcceptInviteResult, { stage: "OTP_SENT" }> | null>(null);
    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    /* What the link says before anybody types. A spent, revoked, expired or
       invented token all answer `valid: false` with no address. */
    React.useEffect(() => {
        if (!token) return;
        let cancelled = false;
        usersService
            .describeInvite(token)
            .then((described) => {
                if (cancelled) return;
                setInvite(described);
                setStep(described.valid ? "details" : "invalid");
            })
            .catch(() => {
                if (!cancelled) setStep("invalid");
            });
        return () => {
            cancelled = true;
        };
    }, [token]);

    const sendCode = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const trimmedName = name.trim();
        const trimmedMobile = mobile.replace(/[\s-]/g, "");
        if (!trimmedName) {
            setError("Enter your name.");
            return;
        }
        if (!MOBILE_RULE.test(trimmedMobile)) {
            setError("Enter a mobile number with its country code, like +919845012345.");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const result = await usersService.acceptInvite({ token, name: trimmedName, mobile: trimmedMobile });
            if (result.stage === "OTP_SENT") {
                setSent(result);
                setMobile(trimmedMobile);
                setStep("code");
            } else {
                setStep("done");
            }
        } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Could not send the code. Try again.");
        } finally {
            setSubmitting(false);
        }
    };

    const create = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (otpCode.length !== 6) {
            setError("Enter the 6-digit code sent to your phone.");
            return;
        }
        if (invite?.method === "PASSWORD" && password.length < MIN_PASSWORD) {
            setError(`Choose a password of at least ${MIN_PASSWORD} characters.`);
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const result = await usersService.acceptInvite({
                token,
                name: name.trim(),
                mobile,
                otpCode,
                ...(invite?.method === "PASSWORD" ? { password } : {}),
            });
            if (result.stage === "ACCEPTED") setStep("done");
            else setSent(result);
        } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Could not create your account. Try again.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleGoogleCredential = React.useCallback(
        async (idToken: string) => {
            setSubmitting(true);
            setError(null);
            try {
                /* An admin gets a challenge, not tokens: signInWithGoogle has
                   already sent them to /verify when that is the answer. */
                const outcome = await signInWithGoogle(idToken);
                if (outcome === "session") router.replace("/dashboard");
            } catch (caught) {
                setError(caught instanceof ApiError ? caught.message : "Could not sign you in with Google. Try again.");
                setSubmitting(false);
            }
        },
        [signInWithGoogle, router]
    );

    return (
        <Card className="w-full max-w-[424px] rounded-lg border-border p-8 shadow-none">
            <span className="text-lg font-semibold tracking-tight">ADX.</span>

            {step === "loading" && <p className="mt-8 text-sm text-muted-foreground">Checking your invitation…</p>}

            {step === "invalid" && (
                <>
                    <h1 className="mt-8 text-xl font-semibold tracking-tight text-foreground">
                        This invitation is no longer valid
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        It may have expired, been used already, or been revoked. Ask whoever runs ADX to send a new
                        one.
                    </p>
                    <div className="mt-6 text-center">
                        <Link
                            href="/login"
                            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        >
                            Back to sign in
                        </Link>
                    </div>
                </>
            )}

            {step === "details" && invite && (
                <>
                    <h1 className="mt-8 text-xl font-semibold tracking-tight text-foreground">Join the ADX console</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        You were invited as <span className="font-medium text-foreground">{invite.email}</span>.
                        Confirm the mobile number your sign-in codes will go to.
                    </p>

                    <form onSubmit={sendCode} className="mt-6 space-y-4" noValidate>
                        <div className="space-y-1.5">
                            <Label htmlFor="invite-name">Your name</Label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    id="invite-name"
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                    required
                                    className="h-11 pl-9"
                                    autoComplete="name"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="invite-mobile">Mobile number</Label>
                            <div className="relative">
                                <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    id="invite-mobile"
                                    type="tel"
                                    value={mobile}
                                    onChange={(event) => setMobile(event.target.value)}
                                    required
                                    placeholder="+91 98450 12345"
                                    className="h-11 pl-9"
                                    autoComplete="tel"
                                />
                            </div>
                        </div>

                        {error && (
                            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                                {error}
                            </p>
                        )}

                        <Button type="submit" className="h-11 w-full" disabled={submitting}>
                            {submitting ? "Sending code…" : "Send code"}
                        </Button>
                    </form>
                </>
            )}

            {step === "code" && invite && (
                <>
                    <h1 className="mt-8 text-xl font-semibold tracking-tight text-foreground">Confirm your number</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Enter the 6-digit code sent to <span className="font-medium text-foreground">{mobile}</span>
                        {invite.method === "PASSWORD" ? " and choose a password." : "."}
                    </p>

                    <form onSubmit={create} className="mt-6 space-y-4" noValidate>
                        <div className="space-y-1.5">
                            <Label htmlFor="invite-otp">Code</Label>
                            <Input
                                id="invite-otp"
                                value={otpCode}
                                onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                required
                                className="h-11 text-center font-mono text-lg tracking-[0.4em]"
                            />
                            {sent?.devOtp && (
                                <p className="text-xs text-muted-foreground">
                                    Development build — the code is{" "}
                                    <span className="font-mono font-semibold text-foreground">{sent.devOtp}</span>.
                                </p>
                            )}
                        </div>

                        {invite.method === "PASSWORD" && (
                            <div className="space-y-1.5">
                                <Label htmlFor="invite-password">Password</Label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        id="invite-password"
                                        type={reveal ? "text" : "password"}
                                        value={password}
                                        onChange={(event) => setPassword(event.target.value)}
                                        required
                                        className="h-11 px-9"
                                        autoComplete="new-password"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setReveal((value) => !value)}
                                        aria-label={reveal ? "Hide password" : "Show password"}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                                    >
                                        {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                    </button>
                                </div>
                                <p className="text-xs text-muted-foreground">At least {MIN_PASSWORD} characters.</p>
                            </div>
                        )}

                        {error && (
                            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                                {error}
                            </p>
                        )}

                        <Button type="submit" className="h-11 w-full" disabled={submitting}>
                            {submitting ? "Creating your account…" : "Create account"}
                        </Button>
                    </form>

                    <button
                        type="button"
                        onClick={() => {
                            setStep("details");
                            setOtpCode("");
                            setError(null);
                        }}
                        className="mt-4 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                        Wrong number? Go back
                    </button>
                </>
            )}

            {step === "done" && invite && (
                <>
                    <h1 className="mt-8 text-xl font-semibold tracking-tight text-foreground">Your account is ready</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {invite.method === "GOOGLE"
                            ? `Sign in with the Google Workspace account for ${invite.email}. A code will go to ${mobile} each time.`
                            : `Sign in with ${invite.email} and your new password. A code will go to ${mobile} each time.`}
                    </p>

                    {error && (
                        <p role="alert" className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                            {error}
                        </p>
                    )}

                    {invite.method === "GOOGLE" ? (
                        apiConfig.googleClientId ? (
                            <div className="mt-6">
                                <GoogleSignInButton
                                    clientId={apiConfig.googleClientId}
                                    onCredential={handleGoogleCredential}
                                    busy={submitting}
                                />
                            </div>
                        ) : (
                            <p className="mt-6 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                                Google sign-in is not configured on this console yet. Ask whoever runs ADX to set it
                                up, then sign in from the usual page.
                            </p>
                        )
                    ) : (
                        <Button asChild className="mt-6 h-11 w-full">
                            <Link href="/login">Sign in</Link>
                        </Button>
                    )}
                </>
            )}
        </Card>
    );
}

export default function AcceptInvitePage() {
    return (
        <React.Suspense
            fallback={
                <Card className="w-full max-w-[424px] rounded-lg border-border p-8 shadow-none">
                    <span className="text-lg font-semibold tracking-tight">ADX.</span>
                    <p className="mt-8 text-sm text-muted-foreground">Checking your invitation…</p>
                </Card>
            }
        >
            <AcceptInviteForm />
        </React.Suspense>
    );
}
