"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AtSign, Eye, EyeOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleSignInButton } from "@/components/adx/google-sign-in-button";
import { TurnstileWidget } from "@/components/adx/turnstile-widget";
import { ApiError } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
    const router = useRouter();
    const { signIn, signInWithGoogle } = useAuth();

    const [email, setEmail] = React.useState("");
    const [password, setPassword] = React.useState("");
    const [reveal, setReveal] = React.useState(false);
    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [captchaToken, setCaptchaToken] = React.useState<string | null>(null);
    const [googleBusy, setGoogleBusy] = React.useState(false);
    /* A cold backend can legitimately take tens of seconds on the first
       request. Without this the button just says "Signing in…" the whole time
       and an ordinary cold start is indistinguishable from a hang. */
    const [slow, setSlow] = React.useState(false);

    React.useEffect(() => {
        if (!submitting && !googleBusy) {
            setSlow(false);
            return;
        }
        const timer = setTimeout(() => setSlow(true), 4000);
        return () => clearTimeout(timer);
    }, [submitting, googleBusy]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            await signIn(email, password, captchaToken);
            router.replace("/dashboard");
        } catch (caught) {
            setError(
                caught instanceof ApiError
                    ? caught.message
                    : "Could not sign you in. Try again."
            );
            setSubmitting(false);
        }
    };

    /* Google has already authenticated the user by the time this runs; all
       that is left is trading the ID token for an ADX session. */
    const handleGoogleCredential = React.useCallback(
        async (idToken: string) => {
            setGoogleBusy(true);
            setError(null);
            try {
                await signInWithGoogle(idToken);
                router.replace("/dashboard");
            } catch (caught) {
                setError(
                    caught instanceof ApiError
                        ? caught.message
                        : "Could not sign you in with Google. Try again."
                );
                setGoogleBusy(false);
            }
        },
        [signInWithGoogle, router]
    );

    return (
        <Card className="w-full max-w-[424px] rounded-lg border-border p-8 shadow-none">
            <span className="text-lg font-semibold tracking-tight">ADX.</span>

            <h1 className="mt-8 text-xl font-semibold tracking-tight text-foreground">
                Sign in to ADX Admin
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Use your @adx.co work email</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
                <div className="space-y-1.5">
                    <Label htmlFor="email">Work email</Label>
                    <div className="relative">
                        <AtSign className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            required
                            placeholder="name@adx.co"
                            className="h-11 pl-9"
                            autoComplete="email"
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            id="password"
                            type={reveal ? "text" : "password"}
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            required
                            className="h-11 px-9"
                            autoComplete="current-password"
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
                </div>

                {apiConfig.turnstileSiteKey && (
                    <TurnstileWidget siteKey={apiConfig.turnstileSiteKey} onVerify={setCaptchaToken} />
                )}

                <Button
                    type="submit"
                    className="h-11 w-full"
                    disabled={
                        submitting ||
                        googleBusy ||
                        (!!apiConfig.turnstileSiteKey && !captchaToken)
                    }
                >
                    {submitting ? "Signing in…" : "Sign in"}
                </Button>
            </form>

            {/* Shared by both sign-in methods, and deliberately below the form:
                a Google failure reported above the password button would sit
                ~120px from the control the user actually clicked. */}
            {error && (
                <p role="alert" className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                    {error}
                </p>
            )}

            {slow && !error && (
                <p role="status" className="mt-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                    Still working — the server may be waking up. This can take up to a minute on
                    the first sign-in of the day.
                </p>
            )}

            {/* Both halves are configuration-gated together: without a client ID
                the button cannot mint a token, and a divider introducing
                nothing reads as something broken. */}
            {apiConfig.googleClientId && (
                <>
                    <div className="my-6 flex items-center gap-4">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-xs text-muted-foreground">or continue with</span>
                        <div className="h-px flex-1 bg-border" />
                    </div>

                    <GoogleSignInButton
                        clientId={apiConfig.googleClientId}
                        onCredential={handleGoogleCredential}
                        busy={googleBusy}
                        disabled={submitting}
                    />
                </>
            )}

            <div className="mt-4 text-center">
                <Link
                    href="/forgot-password"
                    className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                    Forgot password?
                </Link>
            </div>

            <p className="mt-6 text-center text-xs text-muted-foreground">
                By continuing, you agree to the ADX Admin Terms of Use.
            </p>
        </Card>
    );
}
