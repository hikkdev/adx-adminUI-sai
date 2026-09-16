import type { TwoFactorMethod } from "@/lib/two-factor";
import { RECOVERY_CODE_LENGTH, normaliseRecoveryCode } from "@/services/two-factor";

/**
 * The second-factor screen as a state machine, kept apart from the page so
 * it can be pinned without a DOM (Q25).
 *
 * What it knows that the page should not have to:
 *
 * - **The code's shape depends on the channel.** SMS is six digits; email is
 *   ten characters from an alphabet with no 0/O and no 1/I, typed in any
 *   case. The screen accepts each accordingly and sends the email code
 *   upper-cased, which is lossless because the alphabet has no lower-case
 *   member.
 * - **Resend honours the server's clock.** A send answers `resendAfterSeconds`
 *   and a refused one answers `Retry-After`; both land here as the moment
 *   the button may be pressed again, and nothing else decides it.
 * - **Email can be refused.** `MOBILE_VERIFICATION_REQUIRED` means the
 *   fallback budget is spent for thirty days; the screen shows the server's
 *   own sentence, drops the email option, and leaves the operator on SMS.
 * - **The authenticator app sends nothing (Lot K2).** When the challenge
 *   lists AUTHENTICATOR the screen opens on it — six digits, no send, no
 *   Resend — and a recovery code (`XXXX-XXXX`) is the switch for a lost
 *   phone. Switching to SMS or email sends as before; the way back to the
 *   app is offered only while no code has been sent, because the server
 *   checks the newest live sent code first and would refuse the app's.
 */

export type VerifyPhase = "idle" | "sending" | "sent" | "verifying" | "done";

export interface VerifyState {
    method: TwoFactorMethod;
    phase: VerifyPhase;
    code: string;
    /** Fit to show; null when there is nothing to say. */
    error: string | null;
    /** Epoch ms from which Resend is allowed again; null when it is allowed now. */
    resendAt: number | null;
    /** The backend's refusal of the email backup, when it came. */
    emailRefusal: string | null;
    /** Outside production the backend echoes the code; shown so dev sign-in works without an SMS gateway. */
    devCode: string | null;
    /** True once any send has succeeded: a later refused resend still leaves a live code to type. */
    codeSent: boolean;
    /** Lot K2: the field takes a recovery code rather than the app's six digits. Only meaningful on AUTHENTICATOR. */
    recovery: boolean;
}

export interface SendRefusal {
    code: string;
    message: string;
    retryAfterSeconds?: number | null;
}

export type VerifyEvent =
    | { type: "SEND"; method: TwoFactorMethod }
    | { type: "SENT"; method: TwoFactorMethod; resendAfterSeconds?: number | null; devCode?: string | null; now: number }
    | { type: "SEND_FAILED"; refusal: SendRefusal; now: number }
    | { type: "CODE"; value: string }
    | { type: "VERIFY" }
    | { type: "VERIFIED" }
    | { type: "VERIFY_FAILED"; message: string }
    /** Lot K2: back to the app — nothing sent, the field cleared. */
    | { type: "USE_APP" }
    /** Lot K2: the recovery-code switch, on or off. */
    | { type: "RECOVERY"; on: boolean };

export const SMS_CODE_LENGTH = 6;
export const EMAIL_CODE_LENGTH = 10;
/** The app's code is six digits like the SMS one. */
export const APP_CODE_LENGTH = 6;

export const initialVerifyState = (method: TwoFactorMethod = "SMS"): VerifyState => ({
    method,
    phase: "idle",
    code: "",
    error: null,
    resendAt: null,
    emailRefusal: null,
    devCode: null,
    codeSent: false,
    recovery: false,
});

/** Where the screen opens: on the app when the challenge lists it, else on SMS. */
export const initialMethodOf = (methods: readonly TwoFactorMethod[]): TwoFactorMethod =>
    methods.includes("AUTHENTICATOR") ? "AUTHENTICATOR" : "SMS";

export const codeLength = (method: TwoFactorMethod, recovery = false): number => {
    if (recovery) return RECOVERY_CODE_LENGTH;
    if (method === "EMAIL") return EMAIL_CODE_LENGTH;
    return method === "SMS" ? SMS_CODE_LENGTH : APP_CODE_LENGTH;
};

/**
 * What the input keeps of what was typed or pasted: digits only for SMS
 * and the app, letters and digits upper-cased for email, the recovery
 * alphabet for a recovery code, cut to the code's length.
 */
export function normaliseCode(method: TwoFactorMethod, raw: string, recovery = false): string {
    if (recovery) return normaliseRecoveryCode(raw);
    const kept = method === "EMAIL" ? raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() : raw.replace(/\D/g, "");
    return kept.slice(0, codeLength(method));
}

export const codeComplete = (state: Pick<VerifyState, "method" | "code"> & { recovery?: boolean }): boolean =>
    state.code.length === codeLength(state.method, state.recovery ?? false);

/** True once the server's wait has lapsed and nothing is in flight. The app has nothing to resend. */
export function canResend(state: VerifyState, now: number): boolean {
    if (state.method === "AUTHENTICATOR") return false;
    if (state.phase === "sending" || state.phase === "verifying" || state.phase === "done") return false;
    return state.resendAt === null || state.resendAt <= now;
}

/** Whole seconds left on the resend clock; 0 when it may be pressed. */
export function resendCountdown(state: VerifyState, now: number): number {
    if (state.resendAt === null) return 0;
    return Math.max(0, Math.ceil((state.resendAt - now) / 1000));
}

const EMAIL_REFUSED = "MOBILE_VERIFICATION_REQUIRED";

export function verifyReducer(state: VerifyState, event: VerifyEvent): VerifyState {
    switch (event.type) {
        case "SEND":
            return { ...state, method: event.method, phase: "sending", code: "", error: null, devCode: null, recovery: false };

        case "USE_APP":
            return { ...state, method: "AUTHENTICATOR", phase: "idle", code: "", error: null, devCode: null, recovery: false };

        case "RECOVERY":
            if (state.method !== "AUTHENTICATOR" || state.recovery === event.on) return state;
            return { ...state, recovery: event.on, code: "", error: null };

        case "SENT": {
            const wait = event.resendAfterSeconds ?? null;
            return {
                ...state,
                method: event.method,
                phase: "sent",
                error: null,
                resendAt: wait && wait > 0 ? event.now + wait * 1000 : null,
                devCode: event.devCode ?? null,
                codeSent: true,
            };
        }

        case "SEND_FAILED": {
            const { refusal, now } = event;
            const wait = refusal.retryAfterSeconds ?? null;
            const resendAt = wait && wait > 0 ? now + wait * 1000 : state.resendAt;
            if (refusal.code === EMAIL_REFUSED) {
                /* Email is off the table for this account; the phone still works,
                   so the operator is left on SMS with the server's sentence. */
                return {
                    ...state,
                    method: "SMS",
                    /* The SMS code sent earlier, if any, is still the newest live one. */
                    phase: state.codeSent ? "sent" : "idle",
                    error: null,
                    emailRefusal: refusal.message,
                    resendAt,
                };
            }
            return {
                ...state,
                /* A code already sent is still good; a first send that failed is not. */
                phase: state.codeSent ? "sent" : "idle",
                error: refusal.message,
                resendAt,
            };
        }

        case "CODE":
            return { ...state, code: normaliseCode(state.method, event.value, state.recovery), error: null };

        case "VERIFY":
            return codeComplete(state) ? { ...state, phase: "verifying", error: null } : state;

        case "VERIFIED":
            return { ...state, phase: "done", error: null };

        case "VERIFY_FAILED":
            /* The app's phase never reads "sent" — nothing was; it stays where it can be typed into again. */
            return { ...state, phase: state.method === "AUTHENTICATOR" ? "idle" : "sent", code: "", error: event.message };
    }
}

/** Which channels the screen may offer: the challenge's list, minus a refused email. */
export function offeredMethods(methods: TwoFactorMethod[], emailRefusal: string | null): TwoFactorMethod[] {
    return emailRefusal ? methods.filter((method) => method !== "EMAIL") : methods;
}
