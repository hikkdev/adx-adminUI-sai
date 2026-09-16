/**
 * The admin second factor's challenge, between sign-in and /verify (Q25).
 *
 * An ADMIN gets no tokens from `POST /auth/login-password` or `/auth/google`;
 * it gets a five-minute challenge token and the masked destinations a code
 * can go to. The console keeps it in memory for the hop to /verify, and in
 * sessionStorage so a reload of that page does not send the operator back to
 * the password form. It is never written to localStorage: it is a credential
 * for one sign-in, not a session.
 */

/**
 * The channels a second factor can arrive on. Lot K2 adds AUTHENTICATOR —
 * the six digits an app on the phone computes; nothing is sent. The
 * challenge lists it first when the admin has enrolled one, and alone when
 * the policy's `smsAllowedWhenEnrolled` is off.
 */
export type TwoFactorMethod = "AUTHENTICATOR" | "SMS" | "EMAIL";

export interface TwoFactorChallenge {
    challengeToken: string;
    /** Email drops off this list once the fallback budget is spent; AUTHENTICATOR leads it once enrolled. */
    methods: TwoFactorMethod[];
    maskedMobile: string | null;
    maskedEmail: string | null;
}

const STORAGE_KEY = "adx.twoFactorChallenge";

let inMemory: TwoFactorChallenge | null = null;

function storage(): Storage | null {
    try {
        return typeof window === "undefined" ? null : window.sessionStorage;
    } catch {
        return null;
    }
}

export const twoFactorChallenge = {
    get(): TwoFactorChallenge | null {
        if (inMemory) return inMemory;
        const raw = storage()?.getItem(STORAGE_KEY);
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw) as TwoFactorChallenge;
            if (typeof parsed?.challengeToken !== "string") return null;
            inMemory = parsed;
            return parsed;
        } catch {
            return null;
        }
    },
    set(challenge: TwoFactorChallenge) {
        inMemory = challenge;
        storage()?.setItem(STORAGE_KEY, JSON.stringify(challenge));
    },
    clear() {
        inMemory = null;
        storage()?.removeItem(STORAGE_KEY);
    },
};

/** `{ challenge }` is what a login endpoint answers for an admin instead of tokens. */
export function isChallengeResponse(result: unknown): result is { challenge: TwoFactorChallenge } {
    const challenge = (result as { challenge?: unknown } | null)?.challenge;
    return !!challenge && typeof (challenge as TwoFactorChallenge).challengeToken === "string";
}
