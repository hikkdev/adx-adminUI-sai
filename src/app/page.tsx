"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { apiConfig } from "@/lib/api-config";
import { tokens } from "@/lib/api-client";

/**
 * Entry point: sends you to the admin area or to sign-in.
 *
 * This used to be a server component that redirected unconditionally to
 * /dashboard. For a signed-out visitor that meant loading the whole dashboard
 * route — bundle, hydration and a /users/me round trip — only for RequireAuth
 * to throw it away and redirect to /login. Two full route loads to reach a
 * login form (~25s of that was cold route compilation in dev).
 *
 * The session lives in localStorage, so this decision cannot move into
 * middleware without also putting a marker in a cookie. Deciding here keeps
 * the signed-out path to exactly one route load.
 *
 * The token is only checked for presence, never trusted: whichever route this
 * lands on still validates it. An expired token routes to /dashboard, whose
 * RequireAuth then bounces to /login as before.
 */
export default function RootPage() {
    const router = useRouter();

    React.useEffect(() => {
        if (!apiConfig.live) {
            router.replace("/dashboard");
            return;
        }
        const hasSession = !!tokens.access || !!tokens.refresh;
        router.replace(hasSession ? "/dashboard" : "/login");
    }, [router]);

    return (
        <div className="flex min-h-screen items-center justify-center bg-canvas">
            <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
    );
}
