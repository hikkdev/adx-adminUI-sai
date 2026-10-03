/**
 * ED-1 (the owner, 25 Sep 2026): every account proves its number AND its
 * email — "gate them too, don't exempt anything". The console is gated
 * here: an operator whose `emailVerifiedAt` is null sees one card and
 * nothing else until the address answers a code.
 *
 * Pure, so the decision and the code's shape are pinned without a browser.
 */

/** Which stamps the decision reads — `GET /users/me`'s two, typed loosely so a login answer fits too. */
export interface EmailGateSubject {
    email?: string | null;
    /** Null is "not proved"; absent is "the backend did not say", which is not a null. */
    emailVerifiedAt?: string | null;
}

/**
 * Whether the shell stays shut behind the verify card. Only a stamp the
 * backend actually sent as null shuts it: a backend older than ED-1 leaves
 * the field off, and locking every operator out of a console over a field
 * nobody serves would be the outage, not the gate.
 */
export function needsEmailVerification(subject: EmailGateSubject | null | undefined, live: boolean): boolean {
    if (!live || !subject) return false;
    return subject.emailVerifiedAt === null;
}

/** EC-8: the letters a code is drawn from — capitals with I and O left out, so nothing reads as a 1 or a 0. */
export const EMAIL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const EMAIL_CODE_LENGTH = 8;

/**
 * What the box keeps of whatever was typed or pasted: capitals only, the
 * alphabet only (an I or an O is dropped rather than kept, since the code
 * cannot contain one), eight at most. Typed in any case — the backend
 * normalises too, so this is for the eye, not the check.
 */
export function normalizeEmailCode(typed: string): string {
    let out = "";
    for (const char of typed.toUpperCase()) {
        if (EMAIL_CODE_ALPHABET.includes(char)) out += char;
        if (out.length === EMAIL_CODE_LENGTH) break;
    }
    return out;
}

/** Eight letters of the alphabet — the only shape the verify button sends. */
export function emailCodeComplete(code: string): boolean {
    return code.length === EMAIL_CODE_LENGTH && [...code].every((char) => EMAIL_CODE_ALPHABET.includes(char));
}

/** A plausible address — the backend's `z.string().email()` has the last word. */
export function emailLooksValid(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
