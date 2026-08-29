"use client";

import * as React from "react";
import Link from "next/link";
import { AtSign, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TurnstileWidget } from "@/components/adx/turnstile-widget";
import { ApiError, api } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";

export default function ForgotPasswordPage() {
    const [email, setEmail] = React.useState("");
    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [sent, setSent] = React.useState(false);
    const [captchaToken, setCaptchaToken] = React.useState<string | null>(null);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            if (apiConfig.live) {
                await api.post(
                    "/auth/forgot-password",
                    { email, ...(captchaToken ? { captchaToken } : {}) },
                    { anonymous: true }
                );
            }
            setSent(true);
        } catch (caught) {
            setError(
                caught instanceof ApiError ? caught.message : "Could not send the link. Try again."
            );
        } finally {
            setSubmitting(false);
        }
    };

    /*
     * The backend answers identically whether or not the address exists, so the
     * confirmation deliberately does not reveal which it was.
     */
    if (sent) {
        return (
            <Card className="w-full max-w-[424px] rounded-lg border-border p-8 shadow-none">
                <span className="text-lg font-semibold tracking-tight">ADX.</span>
                <div className="mt-8 flex size-10 items-center justify-center rounded-full bg-info-soft">
                    <MailCheck className="size-5 text-info" />
                </div>
                <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
                    Check your inbox
                </h1>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    If {email} is registered, a reset link is on its way. It expires after one use.
                </p>
                <Button variant="outline" className="mt-6 h-11 w-full" onClick={() => setSent(false)}>
                    Use a different email
                </Button>
                <div className="mt-4 text-center">
                    <Link
                        href="/login"
                        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                        Back to sign in
                    </Link>
                </div>
            </Card>
        );
    }

    return (
        <Card className="w-full max-w-[424px] rounded-lg border-border p-8 shadow-none">
            <span className="text-lg font-semibold tracking-tight">ADX.</span>

            <h1 className="mt-8 text-xl font-semibold tracking-tight text-foreground">
                Reset your password
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
                Enter your work email and we&apos;ll send you a reset link.
            </p>

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
                            autoFocus
                            placeholder="name@adx.co"
                            className="h-11 pl-9"
                            autoComplete="email"
                        />
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
                    {submitting ? "Sending…" : "Send reset link"}
                </Button>
            </form>

            <div className="mt-6 text-center">
                <Link
                    href="/login"
                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                    Back to sign in
                </Link>
            </div>
        </Card>
    );
}
