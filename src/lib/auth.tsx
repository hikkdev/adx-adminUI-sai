"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { apiConfig } from "./api-config";
import { ApiError, api, onSessionEnded, tokens } from "./api-client";
import { permissionsOf } from "./jwt";
import { isChallengeResponse, twoFactorChallenge } from "./two-factor";

export interface SessionUser {
    id: string;
    name: string;
    email: string;
    roles: string[];
    avatarUrl?: string | null;
}

/** What a login endpoint answers: the same token pair every method returns. */
export interface SessionTokens {
    accessToken: string;
    refreshToken: string;
    user: SessionUser;
}

/**
 * How a sign-in ended. `"session"` means tokens were issued and the shell can
 * open; `"challenge"` means the account holds ADMIN and the backend wants a
 * second factor first — the challenge is stored and the caller has already
 * been sent to /verify (Q25).
 */
export type SignInOutcome = "session" | "challenge";

interface AuthContextValue {
    user: SessionUser | null;
    /** True until the stored session has been checked on first load. */
    loading: boolean;
    signIn: (email: string, password: string, captchaToken?: string | null) => Promise<SignInOutcome>;
    /** Exchanges a Google ID token for an ADX session. */
    signInWithGoogle: (idToken: string) => Promise<SignInOutcome>;
    /** The second half of an admin sign-in: `POST /auth/2fa/verify` answered with tokens. */
    completeSignIn: (result: SessionTokens) => void;
    signOut: () => Promise<void>;
    /**
     * Whether this session holds a permission id — `finance.approve`,
     * `system.roles` — read off the `perms` claim in the access token. Nothing
     * is gated on it yet; it exists so actions can be hidden as per-module
     * enforcement is switched on. Against fixtures every answer is yes.
     */
    can: (permissionId: string) => boolean;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

/**
 * The backend's `User.name` is nullable — an invited account that has not been
 * filled in yet has none, and Google sign-in is invite-only, so those accounts
 * are exactly the ones that reach here first. `SessionUser.name` is declared
 * non-null and `api.post<...>` is an unchecked cast, so nothing would catch it
 * before the header tried to render initials from null.
 *
 * Normalising once, here, keeps every consumer's assumption true.
 */
function normalizeSessionUser(user: SessionUser): SessionUser {
    const name = user.name?.trim();
    if (name) return { ...user, name };

    // The local part of the work email is the best stand-in we have.
    const fallback = user.email?.split("@")[0]?.trim();
    return { ...user, name: fallback || "ADX user" };
}

/**
 * There is no seeded operator any more (CE4). Every domain reads the API,
 * so a console with `NEXT_PUBLIC_USE_API` off has nothing to sign into: the
 * shell sends you to /login, and sign-in there says so.
 */
const OFFLINE = "The console reads the ADX backend; set NEXT_PUBLIC_USE_API=true and point it at one.";

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const [user, setUser] = React.useState<SessionUser | null>(null);
    const [loading, setLoading] = React.useState(apiConfig.live);

    /* Restore the session on first load. */
    React.useEffect(() => {
        if (!apiConfig.live) return;
        let cancelled = false;

        (async () => {
            if (!tokens.access && !tokens.refresh) {
                if (!cancelled) setLoading(false);
                return;
            }
            try {
                const me = await api.get<SessionUser>("/users/me");
                if (!cancelled) setUser(normalizeSessionUser(me));
            } catch {
                if (!cancelled) setUser(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    /* A refresh that could not be recovered drops you back at sign-in. */
    React.useEffect(
        () =>
            onSessionEnded(() => {
                setUser(null);
                router.replace("/session-expired");
            }),
        [router]
    );

    /**
     * The one place a login response is read.
     *
     * Every login endpoint answers one of two shapes: the token pair, or —
     * for an ADMIN — `{ challenge }` and no tokens at all. The challenge is
     * parked for /verify and the caller is sent there; the tokens are set
     * exactly as they always were.
     */
    const settle = React.useCallback(
        (result: SessionTokens | { challenge: unknown }): SignInOutcome => {
            if (isChallengeResponse(result)) {
                twoFactorChallenge.set(result.challenge);
                router.push("/verify");
                return "challenge";
            }
            const session = result as SessionTokens;
            twoFactorChallenge.clear();
            tokens.set(session);
            setUser(normalizeSessionUser(session.user));
            return "session";
        },
        [router]
    );

    const signIn = React.useCallback(
        async (email: string, password: string, captchaToken?: string | null): Promise<SignInOutcome> => {
            if (!apiConfig.live) throw new ApiError(0, "OFFLINE", OFFLINE);
            const result = await api.post<SessionTokens | { challenge: unknown }>(
                "/auth/login-password",
                { email, password, ...(captchaToken ? { captchaToken } : {}) },
                { anonymous: true }
            );
            return settle(result);
        },
        [settle]
    );

    /* The ID token is the whole credential, so this mirrors signIn exactly:
       one anonymous POST, same two answers back. */
    const signInWithGoogle = React.useCallback(
        async (idToken: string): Promise<SignInOutcome> => {
            if (!apiConfig.live) throw new ApiError(0, "OFFLINE", OFFLINE);
            const result = await api.post<SessionTokens | { challenge: unknown }>(
                "/auth/google",
                { idToken },
                { anonymous: true }
            );
            return settle(result);
        },
        [settle]
    );

    /* /verify calls this with what `POST /auth/2fa/verify` answered — the
       same token pair the login endpoints hand a non-admin directly. */
    const completeSignIn = React.useCallback(
        (result: SessionTokens) => {
            settle(result);
        },
        [settle]
    );

    const signOut = React.useCallback(async () => {
        if (apiConfig.live) {
            try {
                await api.post("/auth/logout", { refreshToken: tokens.refresh });
            } catch (error) {
                /* Signing out locally matters more than the server round-trip. */
                if (!(error instanceof ApiError)) throw error;
            }
        }
        tokens.clear();
        twoFactorChallenge.clear();
        setUser(null);
        router.replace("/login");
    }, [router]);

    /* Read off the stored token at call time rather than decoded once: a
       silent refresh re-issues the claims, and a `can()` after it should see
       the new token. Recomputed per user change so consumers re-render. */
    const can = React.useCallback(
        (permissionId: string) => {
            if (!apiConfig.live) return true;
            if (!user) return false;
            return permissionsOf(tokens.access).includes(permissionId);
        },
        [user]
    );

    const value = React.useMemo(
        () => ({ user, loading, signIn, signInWithGoogle, completeSignIn, signOut, can }),
        [user, loading, signIn, signInWithGoogle, completeSignIn, signOut, can]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = React.useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
    return context;
}

/**
 * The stored session cannot change while this is mounted — signing in or out
 * navigates — so there is nothing to subscribe to.
 */
const noSubscription = () => () => {};

/** Console access is the ADMIN role; every other role belongs to one of the apps. */
export const holdsAdmin = (user: Pick<SessionUser, "roles"> | null | undefined): boolean =>
    !!user?.roles?.includes("ADMIN");

/**
 * Wraps the admin area: no session, no admin screens — and a session without
 * the ADMIN role is sent to /access-denied rather than shown a shell it cannot
 * use. A publisher who signs in here with a valid account is not signed out;
 * the page says which account it is and offers to switch.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    const router = useRouter();

    /* Is there even a stored session to validate? Knowing this separates
       "probably signed in, verifying" from "definitely signed out", which the
       `loading` flag alone cannot express.

       It is read through useSyncExternalStore rather than a useState
       initialiser because `tokens` reads localStorage, which does not exist
       during the server render. Reading it at render time made the server
       answer "no session" and the browser answer "session" on the first paint
       of every signed-in load, which is a hydration mismatch.

       The server snapshot is therefore `null` — not known yet — and React
       re-reads the client snapshot once hydration finishes. Against fixtures
       there is nothing browser-specific to wait for, so that path answers
       immediately and the shell still renders on the server. */
    const hadStoredSession = React.useSyncExternalStore<boolean | null>(
        noSubscription,
        () => !apiConfig.live || !!tokens.access || !!tokens.refresh,
        () => (apiConfig.live ? null : true)
    );

    React.useEffect(() => {
        /* Still hydrating: the answer is not known yet, so decide nothing. */
        if (hadStoredSession === null) return;
        /* No stored session means there is nothing to verify — go straight to
           sign-in rather than waiting out a /users/me call that cannot succeed. */
        if (!hadStoredSession) {
            router.replace("/login");
            return;
        }
        if (!loading && !user) router.replace("/login");
        if (!loading && user && !holdsAdmin(user)) router.replace("/access-denied");
    }, [loading, user, router, hadStoredSession]);

    if (hadStoredSession === false) return null;

    if (hadStoredSession === null || loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-canvas">
                <p className="text-sm text-muted-foreground">Checking your session…</p>
            </div>
        );
    }

    if (!user || !holdsAdmin(user)) return null;

    return <>{children}</>;
}
