"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { twoFactorChallenge, type TwoFactorChallenge, type TwoFactorMethod } from "@/lib/two-factor";
import { cn } from "@/lib/utils";
import { RECOVERY_CODE_LENGTH, formatRecoveryCode, twoFactorService } from "@/services/two-factor";
import {
    APP_CODE_LENGTH,
    EMAIL_CODE_LENGTH,
    SMS_CODE_LENGTH,
    canResend,
    codeComplete,
    initialMethodOf,
    initialVerifyState,
    offeredMethods,
    resendCountdown,
    verifyReducer,
} from "./verify-state";

/**
 * The admin second factor (Q25) — the DR 10 frame `ADX Admin · /verify`.
 *
 * The card, the six boxes, "Verify and continue" and "Resend code" are the
 * frame's. The code comes from one of three places. An admin who has
 * enrolled an authenticator app (Lot K2) opens on it — the challenge lists
 * AUTHENTICATOR first — and types the six digits the app shows; nothing is
 * sent and there is nothing to resend. "Use a recovery code" takes an
 * `XXXX-XXXX` code for a lost phone; the server says how many are left and
 * warns at two or fewer, and that warning is printed once the operator is
 * through. Otherwise `POST /auth/2fa/send` puts a code on the phone the
 * challenge masks, or on the email while the backend's fallback budget
 * lasts. "Use email instead" switches channel; a 403
 * MOBILE_VERIFICATION_REQUIRED shows the server's own sentence and takes
 * the option away. Resend waits out whatever the server said. The way back
 * to the app is offered only while no code has been sent: the server
 * checks the newest live sent code first.
 *
 * On success the tokens are set exactly as sign-in sets them, through the
 * provider, and the operator lands where they were going. A session the
 * policy holds to enrolling an app lands the same way; the shell's gate
 * takes it from there.
 */

/** The stored challenge cannot change while this page is mounted; nothing to subscribe to. */
const noSubscription = () => () => {};

function refusalOf(caught: unknown) {
    if (caught instanceof ApiError) {
        return { code: caught.code, message: caught.message, retryAfterSeconds: caught.retryAfterSeconds };
    }
    return { code: "NETWORK", message: "Could not reach the server. Try again." };
}

function VerifyForm() {
    const router = useRouter();
    const params = useSearchParams();
    const { completeSignIn } = useAuth();

    /* Read through useSyncExternalStore rather than at render time: the
       challenge lives in sessionStorage, which the server render cannot see.
       `undefined` is "not known yet"; `null` is "there is none". */
    const challenge = React.useSyncExternalStore<TwoFactorChallenge | null | undefined>(
        noSubscription,
        () => twoFactorChallenge.get(),
        () => undefined
    );

    const [state, dispatch] = React.useReducer(verifyReducer, "SMS", initialVerifyState);
    const [now, setNow] = React.useState(() => Date.now());
    const inputsRef = React.useRef<(HTMLInputElement | null)[]>([]);
    const firstSend = React.useRef(false);

    /* No challenge means nobody signed in on this browser: back to the form.

       Not once the code has been accepted, though. `completeSignIn` clears
       the stored challenge in the same tick it sets the tokens, so this page
       re-renders with "no challenge" right after issuing the /dashboard
       navigation — and a second replace here would win over it and put the
       login form back in front of a valid session. The `done` phase is the
       tell that the absence is a spent challenge, not a missing one. */
    React.useEffect(() => {
        if (challenge === null && state.phase !== "done") router.replace("/login");
    }, [challenge, router, state.phase]);

    /* A one-second clock for the resend countdown. */
    React.useEffect(() => {
        if (state.resendAt === null) return;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [state.resendAt]);

    const send = React.useCallback(
        async (method: TwoFactorMethod) => {
            if (!challenge) return;
            dispatch({ type: "SEND", method });
            try {
                const result = await twoFactorService.send(challenge.challengeToken, method);
                dispatch({
                    type: "SENT",
                    method,
                    resendAfterSeconds: result.resendAfterSeconds,
                    devCode: result.devCode,
                    now: Date.now(),
                });
                inputsRef.current[0]?.focus();
            } catch (caught) {
                dispatch({ type: "SEND_FAILED", refusal: refusalOf(caught), now: Date.now() });
            }
        },
        [challenge]
    );

    /* As the page opens: an enrolled admin's screen opens on the app and
       sends nothing; everybody else's first code goes out by SMS, the
       default channel. The ref keeps StrictMode's doubled effect from
       spending two of the three sends the number gets in ten minutes. */
    React.useEffect(() => {
        if (!challenge || firstSend.current) return;
        firstSend.current = true;
        if (initialMethodOf(challenge.methods) === "AUTHENTICATOR") dispatch({ type: "USE_APP" });
        else void send("SMS");
    }, [challenge, send]);

    const verify = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!challenge || !codeComplete(state) || state.phase === "verifying") return;
        dispatch({ type: "VERIFY" });
        try {
            const result = await twoFactorService.verify(challenge.challengeToken, state.code);
            dispatch({ type: "VERIFIED" });
            completeSignIn(result);
            /* After a recovery sign-in the server says how many codes are left; its warning outlives the navigation. */
            if (result.warning) toast.warning(result.warning, { duration: 12_000 });
            const from = params.get("from");
            router.replace(from && from.startsWith("/") && !from.startsWith("//") ? from : "/dashboard");
        } catch (caught) {
            const refusal = refusalOf(caught);
            /* An expired challenge cannot be retried here; the sign-in starts over. */
            if (caught instanceof ApiError && caught.status === 401 && /expired\. Start again/i.test(caught.message)) {
                twoFactorChallenge.clear();
                router.replace("/login");
                return;
            }
            dispatch({ type: "VERIFY_FAILED", message: refusal.message });
            inputsRef.current[0]?.focus();
        }
    };

    if (challenge === undefined || challenge === null) {
        return (
            <Card className="w-full max-w-[424px] rounded-lg border-border p-8 shadow-none">
                <p className="text-sm text-muted-foreground">Checking your sign-in…</p>
            </Card>
        );
    }

    const methods = offeredMethods(challenge.methods, state.emailRefusal);
    const emailAvailable = methods.includes("EMAIL") && !!challenge.maskedEmail;
    const smsAvailable = methods.includes("SMS");
    /* Back to the app only while nothing has been sent: a live sent code is what the server would check. */
    const appAvailable = methods.includes("AUTHENTICATOR") && !state.codeSent;
    const onApp = state.method === "AUTHENTICATOR";
    const destination = state.method === "SMS" ? challenge.maskedMobile : challenge.maskedEmail;
    const busy = state.phase === "sending" || state.phase === "verifying" || state.phase === "done";
    const countdown = resendCountdown(state, now);
    const resendAllowed = canResend(state, now);
    const boxes = onApp ? APP_CODE_LENGTH : SMS_CODE_LENGTH;
    const digitBoxes = !state.recovery && state.method !== "EMAIL";

    /* The SMS and app boxes: one digit each, focus moving as they fill. */
    const digits = Array.from({ length: boxes }, (_, index) => state.code[index] ?? "");

    const handleDigit = (index: number, value: string) => {
        const digit = value.replace(/\D/g, "").slice(-1);
        const next = digits.slice();
        next[index] = digit;
        dispatch({ type: "CODE", value: next.join("") });
        if (digit && index < boxes - 1) inputsRef.current[index + 1]?.focus();
    };

    const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Backspace" && !digits[index] && index > 0) {
            inputsRef.current[index - 1]?.focus();
        }
    };

    const handlePaste = (event: React.ClipboardEvent) => {
        const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, boxes);
        if (!pasted) return;
        event.preventDefault();
        dispatch({ type: "CODE", value: pasted });
        inputsRef.current[Math.min(pasted.length, boxes - 1)]?.focus();
    };

    return (
        <Card className="w-full max-w-[424px] rounded-lg border-border p-8 shadow-none">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Two-factor verification
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
                {onApp
                    ? state.recovery
                        ? "Enter one of your recovery codes. It works once."
                        : `Enter the ${APP_CODE_LENGTH}-digit code from your authenticator app.`
                    : state.method === "SMS"
                      ? `Enter the ${SMS_CODE_LENGTH}-digit code sent to your phone.`
                      : `Enter the ${EMAIL_CODE_LENGTH}-character code sent to your email.`}
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
                {onApp ? (state.recovery ? "Recovery code" : "Authenticator app") : `${state.method === "SMS" ? "SMS to " : "Email to "}${destination ?? "—"}`}
            </p>

            <form onSubmit={verify}>
                {digitBoxes ? (
                    <div className="mt-3 flex gap-2" onPaste={handlePaste}>
                        {digits.map((digit, index) => (
                            <input
                                key={index}
                                ref={(element) => {
                                    inputsRef.current[index] = element;
                                }}
                                value={digit}
                                onChange={(event) => handleDigit(index, event.target.value)}
                                onKeyDown={(event) => handleKeyDown(index, event)}
                                inputMode="numeric"
                                autoComplete={index === 0 ? "one-time-code" : "off"}
                                disabled={busy}
                                aria-label={`Digit ${index + 1}`}
                                data-testid={onApp ? "app-digit" : "sms-digit"}
                                className={cn(
                                    "h-11 w-10 rounded-md border bg-card text-center text-lg font-semibold text-foreground",
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                                    "disabled:opacity-60"
                                )}
                            />
                        ))}
                    </div>
                ) : (
                    <input
                        ref={(element) => {
                            inputsRef.current[0] = element;
                        }}
                        value={state.recovery ? formatRecoveryCode(state.code) : state.code}
                        onChange={(event) => dispatch({ type: "CODE", value: event.target.value })}
                        inputMode="text"
                        autoCapitalize="characters"
                        autoComplete="one-time-code"
                        spellCheck={false}
                        maxLength={state.recovery ? RECOVERY_CODE_LENGTH + 1 : EMAIL_CODE_LENGTH}
                        disabled={busy}
                        aria-label={state.recovery ? "Recovery code" : "Email code"}
                        placeholder={state.recovery ? "ABCD-EFGH" : "ABCD EFGH JK"}
                        className={cn(
                            "mt-3 h-11 w-full rounded-md border bg-card px-3 text-center font-mono text-lg font-semibold uppercase tracking-[0.3em] text-foreground",
                            "placeholder:font-sans placeholder:text-sm placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-muted-foreground/60",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                            "disabled:opacity-60"
                        )}
                    />
                )}

                {state.devCode && (
                    <p className="mt-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                        Development build — the code is <span className="font-mono font-semibold text-foreground">{state.devCode}</span>.
                    </p>
                )}

                {state.error && (
                    <p role="alert" className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                        {state.error}
                    </p>
                )}

                {state.emailRefusal && (
                    <p role="status" className="mt-3 rounded-md bg-warning-soft px-3 py-2 text-sm text-foreground">
                        {state.emailRefusal}
                    </p>
                )}

                <Button
                    type="submit"
                    className="mt-6 h-11 w-full"
                    disabled={busy || !codeComplete(state)}
                >
                    {state.phase === "verifying" || state.phase === "done" ? "Verifying…" : "Verify and continue"}
                </Button>
            </form>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
                {!onApp && (
                    <button
                        type="button"
                        onClick={() => send(state.method)}
                        disabled={!resendAllowed}
                        className="text-sm font-medium text-foreground underline-offset-4 hover:underline disabled:cursor-default disabled:text-muted-foreground disabled:no-underline"
                    >
                        {state.phase === "sending"
                            ? "Sending…"
                            : countdown > 0
                              ? `Resend code in ${countdown}s`
                              : "Resend code"}
                    </button>
                )}

                {onApp && (
                    <button
                        type="button"
                        onClick={() => dispatch({ type: "RECOVERY", on: !state.recovery })}
                        disabled={busy}
                        className="text-sm font-medium text-foreground underline-offset-4 hover:underline disabled:cursor-default"
                    >
                        {state.recovery ? "Use the app's code" : "Use a recovery code"}
                    </button>
                )}
                {onApp && smsAvailable && (
                    <button
                        type="button"
                        onClick={() => send("SMS")}
                        disabled={busy}
                        className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:cursor-default"
                    >
                        Use SMS instead
                    </button>
                )}
                {onApp && emailAvailable && (
                    <button
                        type="button"
                        onClick={() => send("EMAIL")}
                        disabled={busy}
                        className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:cursor-default"
                    >
                        Use email instead
                    </button>
                )}
                {!onApp && appAvailable && (
                    <button
                        type="button"
                        onClick={() => dispatch({ type: "USE_APP" })}
                        disabled={busy}
                        className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:cursor-default"
                    >
                        Use your authenticator app
                    </button>
                )}

                {state.method === "SMS" && emailAvailable && (
                    <button
                        type="button"
                        onClick={() => send("EMAIL")}
                        disabled={busy}
                        className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:cursor-default"
                    >
                        Use email instead
                    </button>
                )}
                {state.method === "EMAIL" && smsAvailable && (
                    <button
                        type="button"
                        onClick={() => send("SMS")}
                        disabled={busy}
                        className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:cursor-default"
                    >
                        Use SMS instead
                    </button>
                )}
            </div>
        </Card>
    );
}

export default function TwoFactorPage() {
    return (
        <React.Suspense
            fallback={
                <Card className="w-full max-w-[424px] rounded-lg border-border p-8 shadow-none">
                    <p className="text-sm text-muted-foreground">Checking your sign-in…</p>
                </Card>
            }
        >
            <VerifyForm />
        </React.Suspense>
    );
}
