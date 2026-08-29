"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AtSign, Eye, EyeOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleMark } from "@/components/adx/google-mark";
import { TurnstileWidget } from "@/components/adx/turnstile-widget";
import { ApiError } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
    const router = useRouter();
    const { signIn } = useAuth();

    const [email, setEmail] = React.useState("");
    const [password, setPassword] = React.useState("");
    const [reveal, setReveal] = React.useState(false);
    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [captchaToken, setCaptchaToken] = React.useState<string | null>(null);

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

                {error && (
                    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                        {error}
                    </p>
                )}

                <Button
                    type="submit"
                    className="h-11 w-full"
                    disabled={submitting || (!!apiConfig.turnstileSiteKey && !captchaToken)}
                >
                    {submitting ? "Signing in…" : "Sign in"}
                </Button>
            </form>

            <div className="my-6 flex items-center gap-4">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or continue with</span>
                <div className="h-px flex-1 bg-border" />
            </div>

            <Button variant="outline" className="h-11 w-full" type="button">
                <GoogleMark className="mr-2 size-4" />
                Continue with Google Workspace
            </Button>

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
