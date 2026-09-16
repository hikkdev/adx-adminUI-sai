"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";

/**
 * Where a session without the ADMIN role lands — the DR 10 frame
 * `ADX Admin · /access-denied`, its 403 card kept.
 *
 * Under the sign-in layout rather than the admin shell, on purpose: the
 * shell is wrapped in `RequireAuth`, which is what sent the operator here,
 * and a page inside it would bounce forever. A publisher or an agent who
 * signed in with a real account is not signed out — the page names the
 * account and offers to switch, because "wrong app" is the usual reason.
 */
export default function AccessDeniedPage() {
    const { user, signOut } = useAuth();

    return (
        <Card className="w-full max-w-[454px] rounded-lg border-border p-8 shadow-none">
            <p className="text-metric text-foreground">403</p>
            <h1 className="mt-4 text-base font-semibold text-foreground">
                You don&apos;t have access to this area
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
                {user
                    ? `${user.email} is signed in, but the console is for accounts holding the Admin role. Publishers, advertisers and agents use the ADX apps instead.`
                    : "The console is for accounts holding the Admin role. Ask a Super admin to invite you."}
            </p>
            <div className="mt-6 flex items-center gap-2">
                {user ? (
                    <Button onClick={() => void signOut()}>Switch account</Button>
                ) : (
                    <Button asChild>
                        <Link href="/login">Sign in</Link>
                    </Button>
                )}
                <Button variant="outline" asChild>
                    <Link href="/dashboard">Back to dashboard</Link>
                </Button>
            </div>
        </Card>
    );
}
