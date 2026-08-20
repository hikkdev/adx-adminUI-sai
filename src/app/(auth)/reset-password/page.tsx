"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Eye, EyeOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";
import { cn } from "@/lib/utils";

/** Mirrors the backend rule: z.string().min(8). */
const MIN_LENGTH = 8;

const rules = [
    { id: "length", label: `At least ${MIN_LENGTH} characters`, test: (v: string) => v.length >= MIN_LENGTH },
    { id: "letter", label: "One letter", test: (v: string) => /[a-zA-Z]/.test(v) },
    { id: "number", label: "One number", test: (v: string) => /\d/.test(v) },
];

function ResetPasswordForm() {
    const router = useRouter();
    const params = useSearchParams();
    const token = params.get("token");

    const [password, setPassword] = React.useState("");
    const [confirm, setConfirm] = React.useState("");
    const [reveal, setReveal] = React.useState(false);
    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [done, setDone] = React.useState(false);

    const passed = rules.filter((rule) => rule.test(password));
    const strong = passed.length === rules.length;
    const mismatch = confirm.length > 0 && confirm !== password;
    const canSubmit = strong && !mismatch && confirm.length > 0 && !submitting;

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!canSubmit || !token) return;

        setSubmitting(true);
        setError(null);
        try {
            if (apiConfig.live) {
                await api.post(
                    "/auth/reset-password",
                    { token, newPassword: password },
                    { anonymous: true }
                );
            }
            setDone(true);
        } catch (caught) {
            setError(
                caught instanceof ApiError
                    ? caught.message
                    : "Could not reset your password. Try again."
            );
        } finally {
            setSubmitting(false);
        }
    };

    /* No token in the link — nothing to reset against. */
    if (!token) {
        return (
            <Card className="w-full max-w-[424px] rounded-lg border-border p-8 shadow-none">
                <span className="text-lg font-semibold tracking-tight">ADX.</span>
                <h1 className="mt-8 text-xl font-semibold tracking-tight text-foreground">
                    This link is not valid
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Reset links expire after one use. Request a new one to continue.
                </p>
                <Button className="mt-6 h-11 w-full" asChild>
                    <Link href="/forgot-password">Request a new link</Link>
                </Button>
            </Card>
        );
    }

    if (done) {
        return (
            <Card className="w-full max-w-[424px] rounded-lg border-border p-8 shadow-none">
                <span className="text-lg font-semibold tracking-tight">ADX.</span>
                <div className="mt-8 flex size-10 items-center justify-center rounded-full bg-success-soft">
                    <Check className="size-5 text-success" />
                </div>
                <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
                    Password updated
                </h1>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Every other session has been signed out. Use your new password to sign back in.
                </p>
                <Button className="mt-6 h-11 w-full" onClick={() => router.push("/login")}>
                    Back to sign in
                </Button>
            </Card>
        );
    }

    return (
        <Card className="w-full max-w-[424px] rounded-lg border-border p-8 shadow-none">
            <span className="text-lg font-semibold tracking-tight">ADX.</span>

            <h1 className="mt-8 text-xl font-semibold tracking-tight text-foreground">
                Choose a new password
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
                This signs out every other device on your account.
            </p>

            <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
                <div className="space-y-1.5">
                    <Label htmlFor="password">New password</Label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            id="password"
                            type={reveal ? "text" : "password"}
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            required
                            autoFocus
                            autoComplete="new-password"
                            className="h-11 px-9"
                            aria-describedby="password-rules"
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

                <ul id="password-rules" className="space-y-1">
                    {rules.map((rule) => {
                        const ok = rule.test(password);
                        return (
                            <li
                                key={rule.id}
                                className={cn(
                                    "flex items-center gap-2 text-xs",
                                    ok ? "text-success" : "text-muted-foreground"
                                )}
                            >
                                <Check
                                    className={cn("size-3.5", !ok && "opacity-30")}
                                    aria-hidden
                                />
                                {rule.label}
                            </li>
                        );
                    })}
                </ul>

                <div className="space-y-1.5">
                    <Label htmlFor="confirm">Confirm password</Label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            id="confirm"
                            type={reveal ? "text" : "password"}
                            value={confirm}
                            onChange={(event) => setConfirm(event.target.value)}
                            required
                            autoComplete="new-password"
                            className={cn("h-11 pl-9", mismatch && "border-danger")}
                            aria-invalid={mismatch}
                            aria-describedby={mismatch ? "confirm-error" : undefined}
                        />
                    </div>
                    {mismatch && (
                        <p id="confirm-error" className="text-xs text-danger">
                            Both passwords must match
                        </p>
                    )}
                </div>

                {error && (
                    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                        {error}
                    </p>
                )}

                <Button type="submit" className="h-11 w-full" disabled={!canSubmit}>
                    {submitting ? "Saving…" : "Set new password"}
                </Button>
            </form>

            <div className="mt-4 text-center">
                <Link
                    href="/login"
                    className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                    Back to sign in
                </Link>
            </div>
        </Card>
    );
}

export default function ResetPasswordPage() {
    return (
        <React.Suspense
            fallback={
                <Card className="w-full max-w-[424px] rounded-lg border-border p-8 shadow-none">
                    <span className="text-lg font-semibold tracking-tight">ADX.</span>
                    <p className="mt-8 text-sm text-muted-foreground">Loading…</p>
                </Card>
            }
        >
            <ResetPasswordForm />
        </React.Suspense>
    );
}
