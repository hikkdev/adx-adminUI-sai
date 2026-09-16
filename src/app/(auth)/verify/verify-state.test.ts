import { describe, expect, it } from "vitest";
import {
    canResend,
    codeComplete,
    initialMethodOf,
    initialVerifyState,
    normaliseCode,
    offeredMethods,
    resendCountdown,
    verifyReducer,
    type VerifyState,
} from "./verify-state";

/**
 * Q25 — the second-factor screen, as a machine.
 *
 * The DR 10 frame draws six boxes and a Resend link; what this file pins is
 * what the frame could not: that the code's shape follows the channel, that
 * Resend waits out the server's clock and nothing else, and that a refused
 * email backup leaves the operator on SMS with the server's own sentence.
 */

const T0 = 1_700_000_000_000;

const sent = (state: VerifyState, over: { method?: "SMS" | "EMAIL"; resendAfterSeconds?: number | null; devCode?: string } = {}) =>
    verifyReducer(verifyReducer(state, { type: "SEND", method: over.method ?? state.method }), {
        type: "SENT",
        method: over.method ?? state.method,
        resendAfterSeconds: over.resendAfterSeconds,
        devCode: over.devCode,
        now: T0,
    });

describe("the code's shape", () => {
    it("keeps six digits for SMS and drops everything else", () => {
        expect(normaliseCode("SMS", "12 34-56")).toBe("123456");
        expect(normaliseCode("SMS", "1234567")).toBe("123456");
        expect(normaliseCode("SMS", "ab1")).toBe("1");
    });

    it("keeps ten alphanumerics for email, upper-cased, because the alphabet has no lower case", () => {
        expect(normaliseCode("EMAIL", "abcd efgh jk")).toBe("ABCDEFGHJK");
        expect(normaliseCode("EMAIL", "abcdefghjkmn")).toBe("ABCDEFGHJK");
        expect(normaliseCode("EMAIL", "a-b_c!d")).toBe("ABCD");
    });

    it("is complete only at the channel's length", () => {
        expect(codeComplete({ method: "SMS", code: "12345" })).toBe(false);
        expect(codeComplete({ method: "SMS", code: "123456" })).toBe(true);
        expect(codeComplete({ method: "EMAIL", code: "123456" })).toBe(false);
        expect(codeComplete({ method: "EMAIL", code: "ABCDEFGHJK" })).toBe(true);
    });

    it("re-normalises typed input against the current channel", () => {
        const email = sent(initialVerifyState(), { method: "EMAIL" });
        const typed = verifyReducer(email, { type: "CODE", value: "abcd-efgh-jk" });
        expect(typed.code).toBe("ABCDEFGHJK");
        expect(typed.error).toBeNull();
    });
});

describe("sending", () => {
    it("clears the code and any error when a send starts, and marks it sent after", () => {
        const failed = verifyReducer(sent(initialVerifyState()), { type: "VERIFY_FAILED", message: "Incorrect code. Try again." });
        expect(failed.error).toBe("Incorrect code. Try again.");
        const again = verifyReducer(failed, { type: "SEND", method: "SMS" });
        expect(again).toMatchObject({ phase: "sending", code: "", error: null });
        const done = verifyReducer(again, { type: "SENT", method: "SMS", resendAfterSeconds: 60, now: T0 });
        expect(done.phase).toBe("sent");
    });

    it("honours the server's resend wait to the second, and none when it gave none", () => {
        const state = sent(initialVerifyState(), { resendAfterSeconds: 60 });
        expect(canResend(state, T0)).toBe(false);
        expect(resendCountdown(state, T0 + 15_000)).toBe(45);
        expect(canResend(state, T0 + 59_000)).toBe(false);
        expect(canResend(state, T0 + 60_000)).toBe(true);
        expect(resendCountdown(state, T0 + 60_000)).toBe(0);

        const free = sent(initialVerifyState(), { resendAfterSeconds: null });
        expect(canResend(free, T0)).toBe(true);
    });

    it("never resends while something is in flight", () => {
        const sending = verifyReducer(initialVerifyState(), { type: "SEND", method: "SMS" });
        expect(canResend(sending, T0 + 999_999)).toBe(false);
        const verifying = verifyReducer(verifyReducer(sent(initialVerifyState()), { type: "CODE", value: "123456" }), { type: "VERIFY" });
        expect(canResend(verifying, T0 + 999_999)).toBe(false);
    });

    it("keeps the dev code the backend echoes outside production", () => {
        expect(sent(initialVerifyState(), { devCode: "123456" }).devCode).toBe("123456");
        expect(sent(initialVerifyState()).devCode).toBeNull();
    });
});

describe("a refused send", () => {
    it("takes Retry-After as the resend clock and shows the message", () => {
        const state = verifyReducer(verifyReducer(sent(initialVerifyState()), { type: "SEND", method: "SMS" }), {
            type: "SEND_FAILED",
            refusal: { code: "TOO_MANY_REQUESTS", message: "Wait a minute before asking for another code.", retryAfterSeconds: 42 },
            now: T0,
        });
        expect(state.error).toBe("Wait a minute before asking for another code.");
        expect(resendCountdown(state, T0)).toBe(42);
        /* A code had already been sent, so the boxes still take one. */
        expect(state.phase).toBe("sent");
    });

    it("goes back to idle when the very first send failed, so the screen does not pretend a code is out", () => {
        const state = verifyReducer(verifyReducer(initialVerifyState(), { type: "SEND", method: "SMS" }), {
            type: "SEND_FAILED",
            refusal: { code: "NETWORK", message: "Could not reach the server." },
            now: T0,
        });
        expect(state.phase).toBe("idle");
        expect(canResend(state, T0)).toBe(true);
    });

    it("drops email and returns to SMS with the server's sentence on MOBILE_VERIFICATION_REQUIRED", () => {
        const onSms = sent(initialVerifyState(), { resendAfterSeconds: 30 });
        const asked = verifyReducer(onSms, { type: "SEND", method: "EMAIL" });
        const refused = verifyReducer(asked, {
            type: "SEND_FAILED",
            refusal: {
                code: "MOBILE_VERIFICATION_REQUIRED",
                message: "The email backup for this account is used up. Sign in with the code sent to your phone.",
            },
            now: T0,
        });
        expect(refused.method).toBe("SMS");
        expect(refused.emailRefusal).toMatch(/used up/);
        expect(refused.error).toBeNull();
        expect(offeredMethods(["SMS", "EMAIL"], refused.emailRefusal)).toEqual(["SMS"]);
        expect(offeredMethods(["SMS", "EMAIL"], null)).toEqual(["SMS", "EMAIL"]);
        /* The SMS resend clock from before is untouched, and its code is still live. */
        expect(resendCountdown(refused, T0)).toBe(30);
        expect(refused.phase).toBe("sent");
    });
});

describe("verifying", () => {
    it("refuses to verify an incomplete code", () => {
        const state = verifyReducer(sent(initialVerifyState()), { type: "CODE", value: "12345" });
        expect(verifyReducer(state, { type: "VERIFY" }).phase).toBe("sent");
    });

    it("moves through verifying to done, or back to sent with the boxes cleared", () => {
        const ready = verifyReducer(sent(initialVerifyState()), { type: "CODE", value: "123456" });
        const verifying = verifyReducer(ready, { type: "VERIFY" });
        expect(verifying.phase).toBe("verifying");
        expect(verifyReducer(verifying, { type: "VERIFIED" }).phase).toBe("done");

        const failed = verifyReducer(verifying, { type: "VERIFY_FAILED", message: "Incorrect code. Try again." });
        expect(failed).toMatchObject({ phase: "sent", code: "", error: "Incorrect code. Try again." });
    });
});

describe("the authenticator app (Lot K2)", () => {
    it("opens on the app when the challenge lists it, else on SMS", () => {
        expect(initialMethodOf(["AUTHENTICATOR", "SMS", "EMAIL"])).toBe("AUTHENTICATOR");
        expect(initialMethodOf(["AUTHENTICATOR"])).toBe("AUTHENTICATOR");
        expect(initialMethodOf(["SMS", "EMAIL"])).toBe("SMS");
    });

    it("takes six digits from the app with nothing sent and nothing to resend", () => {
        const onApp = verifyReducer(initialVerifyState(), { type: "USE_APP" });
        expect(onApp).toMatchObject({ method: "AUTHENTICATOR", phase: "idle", code: "", recovery: false, codeSent: false });
        expect(canResend(onApp, T0 + 999_999)).toBe(false);
        const typed = verifyReducer(onApp, { type: "CODE", value: "12 34-56x" });
        expect(typed.code).toBe("123456");
        expect(codeComplete(typed)).toBe(true);
        /* A wrong app code goes back to idle — there is no "sent" on the app — with the boxes cleared. */
        const failed = verifyReducer(verifyReducer(typed, { type: "VERIFY" }), { type: "VERIFY_FAILED", message: "No." });
        expect(failed).toMatchObject({ phase: "idle", code: "", error: "No." });
    });

    it("switches to a recovery code — eight characters of the code alphabet, the dash forgiven — and back", () => {
        const onApp = verifyReducer(initialVerifyState(), { type: "USE_APP" });
        const recovery = verifyReducer(onApp, { type: "RECOVERY", on: true });
        expect(recovery.recovery).toBe(true);
        const typed = verifyReducer(recovery, { type: "CODE", value: "abcd-efgh" });
        expect(typed.code).toBe("ABCDEFGH");
        expect(codeComplete(typed)).toBe(true);
        expect(codeComplete(verifyReducer(recovery, { type: "CODE", value: "abcd-efg" }))).toBe(false);
        /* 0, 1, I and O are not in the alphabet and are dropped as typed. */
        expect(normaliseCode("AUTHENTICATOR", "A0B1CIDO EFGH", true)).toBe("ABCDEFGH");
        const back = verifyReducer(typed, { type: "RECOVERY", on: false });
        expect(back).toMatchObject({ recovery: false, code: "" });
        /* The switch means nothing off the app. */
        expect(verifyReducer(initialVerifyState(), { type: "RECOVERY", on: true }).recovery).toBe(false);
    });

    it("leaves the app for a sent channel and clears the recovery switch with it", () => {
        const recovery = verifyReducer(verifyReducer(initialVerifyState(), { type: "USE_APP" }), { type: "RECOVERY", on: true });
        const sms = sent(recovery, { method: "SMS" });
        expect(sms).toMatchObject({ method: "SMS", recovery: false, codeSent: true, phase: "sent" });
    });
});
