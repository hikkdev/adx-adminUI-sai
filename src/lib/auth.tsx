"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { apiConfig } from "./api-config";
import { ApiError, api, onSessionEnded, tokens } from "./api-client";
import { currentAdmin } from "@/data/platform";

export interface SessionUser {
    id: string;
    name: string;
    email: string;
    roles: string[];
    avatarUrl?: string | null;
}

interface AuthContextValue {
    user: SessionUser | null;
    /** True until the stored session has been checked on first load. */
    loading: boolean;
    signIn: (email: string, password: string, captchaToken?: string | null) => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

/** The seeded admin, used whenever NEXT_PUBLIC_USE_API is not "true". */
const fixtureUser: SessionUser = {
    id: "usr_fixture_admin",
    name: currentAdmin.name,
    email: currentAdmin.email,
    roles: ["ADMIN"],
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const [user, setUser] = React.useState<SessionUser | null>(
        apiConfig.live ? null : fixtureUser
    );
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
                if (!cancelled) setUser(me);
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

    const signIn = React.useCallback(async (email: string, password: string, captchaToken?: string | null) => {
        if (!apiConfig.live) {
            setUser(fixtureUser);
            return;
        }
        const result = await api.post<{
            accessToken: string;
            refreshToken: string;
            user: SessionUser;
        }>(
            "/auth/login-password",
            { email, password, ...(captchaToken ? { captchaToken } : {}) },
            { anonymous: true }
        );

        tokens.set(result);
        setUser(result.user);
    }, []);

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
        setUser(null);
        router.replace("/login");
    }, [router]);

    const value = React.useMemo(
        () => ({ user, loading, signIn, signOut }),
        [user, loading, signIn, signOut]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = React.useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
    return context;
}

/** Wraps the admin area: no session, no admin screens. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    const router = useRouter();

    React.useEffect(() => {
        if (!loading && !user) router.replace("/login");
    }, [loading, user, router]);

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-canvas">
                <p className="text-sm text-muted-foreground">Checking your session…</p>
            </div>
        );
    }

    if (!user) return null;

    return <>{children}</>;
}
