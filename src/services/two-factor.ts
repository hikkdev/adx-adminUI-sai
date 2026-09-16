import { api as http, tokens } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import type { SessionTokens } from "@/lib/auth";
import type { TwoFactorMethod } from "@/lib/two-factor";

/**
 * The admin second factor (Q25), and — Lot K2 — the authenticator app.
 *
 * Two halves. The anonymous half is the sign-in's second step: `send` and
 * `verify` take the challenge token a login endpoint handed out instead of
 * tokens. Neither is behind `isLive`: there is no fixture sign-in that
 * reaches /verify, because against fixtures `signIn` answers a session
 * directly and the page is never shown.
 *
 * The signed-in half is the operator's own app — enrol, confirm, disable,
 * regenerate the recovery codes, read where one stands — under the `auth`
 * flag like the rest of `/users/me`. The secret is answered once, at enrol,
 * and never again; the recovery codes likewise, at confirm and at
 * regenerate. The screens print them then or never.
 */

/* ------------------------------------------------------------------ */
/* Sign-in                                                             */
/* ------------------------------------------------------------------ */

/** What `POST /auth/2fa/send` answers. AUTHENTICATOR sends nothing and says `expiresInSeconds: 30`. */
export interface TwoFactorSendResult {
    message: string;
    method: TwoFactorMethod;
    expiresInSeconds: number;
    resendAfterSeconds?: number;
    sendsRemaining?: number;
    /** Outside production only, like the OTP endpoints. */
    devCode?: string;
}

/**
 * What `POST /auth/2fa/verify` answers: the ordinary token pair, plus —
 * Lot K2 — whether the policy holds this session to enrolling an app, and
 * after a recovery code how many are left and the server's warning when
 * two or fewer remain.
 */
export interface TwoFactorVerifyResult extends SessionTokens {
    mustEnrolAuthenticator?: boolean;
    recoveryCodesLeft?: number;
    warning?: string | null;
}

/* ------------------------------------------------------------------ */
/* The signed-in admin's app                                           */
/* ------------------------------------------------------------------ */

/** `GET /auth/2fa/status`. */
export interface AuthenticatorStatus {
    enrolled: boolean;
    enrolledAt: string | null;
    recoveryCodesLeft: number;
}

/** The two switches of `auth.adminTwoFactor` in platform settings. */
export interface AdminTwoFactorPolicy {
    /** An admin without an enrolment still signs in with SMS / email, but the session is held to enrolling. */
    authenticatorRequired: boolean;
    /** Off, an enrolled admin's challenge lists the app alone; a recovery code always works. */
    smsAllowedWhenEnrolled: boolean;
}

export interface TwoFactorStatus {
    /** What the next sign-in may offer; empty for a non-admin. */
    methods: TwoFactorMethod[];
    authenticator: AuthenticatorStatus;
    policy: AdminTwoFactorPolicy;
    /** True when this very session is held to enrolling — the claim off the token, as the server read it. */
    mustEnrolAuthenticator: boolean;
}

/** `POST /auth/2fa/totp/enrol` — shown once, alive ten minutes. */
export interface EnrolmentStart {
    secret: string;
    otpauthUri: string;
    /** An SVG data URL — the QR the app scans. */
    qrSvg: string;
    expiresInSeconds: number;
}

/** `POST /auth/2fa/totp/confirm` — the ten recovery codes, shown once. */
export interface EnrolmentDone {
    enrolledAt: string;
    recoveryCodes: string[];
}

/** How the app is turned off: the app's own code, or a recovery code when the phone is gone. */
export type DisableProof = { code: string } | { recoveryCode: string };

/** How many the server issues at confirm and at regenerate. */
export const RECOVERY_CODE_COUNT = 10;
/** At this many or fewer left the server warns after a recovery sign-in. */
export const RECOVERY_CODES_LOW = 2;

export const TOTP_CODE_LENGTH = 6;
export const RECOVERY_CODE_LENGTH = 8;

/** The email-code alphabet — no 0/O, no 1/I — that a recovery code is drawn from. */
export const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Six digits, whatever spacing was typed; cut to the length. */
export function normaliseTotpCode(raw: string): string {
    return raw.replace(/\D/g, "").slice(0, TOTP_CODE_LENGTH);
}

/** Eight characters of the alphabet, upper-cased, the dash and spaces forgiven; cut to the length. */
export function normaliseRecoveryCode(raw: string): string {
    const alphabet = new Set(RECOVERY_CODE_ALPHABET);
    return raw
        .toUpperCase()
        .split("")
        .filter((char) => alphabet.has(char))
        .join("")
        .slice(0, RECOVERY_CODE_LENGTH);
}

/** `ABCDEFGH` → `ABCD-EFGH`, as the server prints them; a partial code keeps its dash once past four. */
export function formatRecoveryCode(code: string): string {
    const clean = normaliseRecoveryCode(code);
    return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

/** The `.txt` the Download button hands over: one code per line, dated, with the one rule that matters. */
export function recoveryCodesText(codes: readonly string[], issuedAt: Date = new Date()): string {
    return [
        "ADX admin console — authenticator recovery codes",
        `Issued ${issuedAt.toISOString()}`,
        "",
        "Each code signs you in once when your authenticator app is out of reach.",
        "Keep this file somewhere only you can read it.",
        "",
        ...codes.map((code) => formatRecoveryCode(code)),
        "",
    ].join("\n");
}

/** `/auth/2fa/*` for the signed-in admin is the session's own record and belongs with sign-in. */
function session() {
    if (!isLive("auth")) throw new Error("Your account reads the API; connect the console to the ADX backend first.");
    return http;
}

export const twoFactorService = {
    /* ---- sign-in ------------------------------------------------- */

    /**
     * SMS through the OTP budget; EMAIL while the fallback lasts — 403
     * MOBILE_VERIFICATION_REQUIRED after. AUTHENTICATOR sends nothing (409
     * TOTP_NOT_ENROLLED without an enrolment); the sent channels answer 403
     * with `details.methods: ["AUTHENTICATOR"]` under the sms-off policy.
     */
    send: (challengeToken: string, method: TwoFactorMethod): Promise<TwoFactorSendResult> =>
        http.post<TwoFactorSendResult>("/auth/2fa/send", { challengeToken, method }, { anonymous: true }),

    /**
     * The newest live sent code; the app's six digits when none is live; a
     * recovery code (XXXX-XXXX, spent on use) whenever the app is enrolled.
     * Answers the ordinary token pair.
     */
    verify: (challengeToken: string, code: string): Promise<TwoFactorVerifyResult> =>
        http.post<TwoFactorVerifyResult>("/auth/2fa/verify", { challengeToken, code }, { anonymous: true }),

    /* ---- the signed-in admin's app -------------------------------- */

    status: (): Promise<TwoFactorStatus> => session().get<TwoFactorStatus>("/auth/2fa/status"),

    /** A fresh secret and its QR; a second call replaces the pending one. 409 TOTP_ALREADY_ENROLLED while one stands. */
    enrol: (): Promise<EnrolmentStart> => session().post<EnrolmentStart>("/auth/2fa/totp/enrol"),

    /**
     * The first code from the app. 401 on a wrong one; 409 TOTP_NOT_ENROLLED
     * when nothing is pending (the ten minutes ran out). A session held to
     * enrolling is handed a fresh access token without the claim, and it is
     * stored here so the very next request opens — no refresh needed.
     */
    confirm: async (code: string): Promise<EnrolmentDone> => {
        const done = await session().post<EnrolmentDone & { accessToken?: string }>("/auth/2fa/totp/confirm", {
            code: normaliseTotpCode(code),
        });
        if (done.accessToken) tokens.set({ accessToken: done.accessToken });
        return { enrolledAt: done.enrolledAt, recoveryCodes: done.recoveryCodes };
    },

    /** The app's code or a recovery code proves it; the columns and every recovery code are cleared. */
    disable: (proof: DisableProof): Promise<{ message: string; disabled: boolean }> =>
        session().post(
            "/auth/2fa/totp/disable",
            "code" in proof ? { code: normaliseTotpCode(proof.code) } : { recoveryCode: normaliseRecoveryCode(proof.recoveryCode) },
        ),

    /** A fresh ten, the old ones gone; the app's code proves it. */
    regenerateRecoveryCodes: (code: string): Promise<{ recoveryCodes: string[] }> =>
        session().post("/auth/2fa/recovery-codes/regenerate", { code: normaliseTotpCode(code) }),
};
