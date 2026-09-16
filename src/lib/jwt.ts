/**
 * Reading the claims off an access token, in the browser, without verifying it.
 *
 * The console never trusts a token — every request goes to the backend, which
 * checks the signature — but it does need to *read* one: the `perms` claim is
 * how a screen knows which buttons to draw before the user finds out by
 * clicking. A bad decode answers nothing rather than throwing, because a token
 * the console cannot read is a token the backend will refuse anyway.
 */

export interface AccessTokenClaims {
    sub?: string;
    roles?: string[];
    /** The permission ids this session holds — the console's `can()`. */
    perms?: string[];
    /** Present on an impersonation token: who is acting as whom. */
    act?: { sub: string; sessionId: string };
    scope?: string;
    /**
     * Lot K2: the platform requires an authenticator app of every admin and
     * this session's admin has not enrolled one. The backend answers 403
     * TOTP_ENROLMENT_REQUIRED on every route but the enrolment ones while
     * it is set; the shell keeps the operator on the setup until it is gone.
     */
    mustEnrolAuthenticator?: true;
    exp?: number;
    iat?: number;
}

function base64UrlDecode(segment: string): string | null {
    const padded = segment.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (segment.length % 4)) % 4);
    try {
        const binary = typeof atob === "function" ? atob(padded) : Buffer.from(padded, "base64").toString("binary");
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        return new TextDecoder().decode(bytes);
    } catch {
        return null;
    }
}

/** The payload of a JWT, or null for anything that is not one. Unverified. */
export function decodeJwtPayload(token: string | null | undefined): AccessTokenClaims | null {
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const json = base64UrlDecode(parts[1]);
    if (!json) return null;
    try {
        const parsed: unknown = JSON.parse(json);
        return parsed && typeof parsed === "object" ? (parsed as AccessTokenClaims) : null;
    } catch {
        return null;
    }
}

/** The `perms` claim, or an empty list when the token carries none. */
export function permissionsOf(token: string | null | undefined): string[] {
    const claims = decodeJwtPayload(token);
    const perms = claims?.perms;
    return Array.isArray(perms) ? perms.filter((id): id is string => typeof id === "string") : [];
}

/** Lot K2: whether the session is held to setting an authenticator app up before anything else. */
export function mustEnrolAuthenticatorOf(token: string | null | undefined): boolean {
    return decodeJwtPayload(token)?.mustEnrolAuthenticator === true;
}
