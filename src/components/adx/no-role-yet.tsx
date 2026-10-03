"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface NoRoleYetProps {
    /** Who is signed in, for the sentence that names the account. */
    email: string;
    onSignOut: () => void;
}

/**
 * Where an admin with no console role lands (RP-1, 24 Sep 2026).
 *
 * Only Super admin holds every permission; every other operator holds
 * exactly their role's list, and one with no role holds none — the backend
 * refuses every admin route with ROLE_REQUIRED, so a shell full of screens
 * that all fail would only be noise. Drawn in the access-denied card's shape:
 * the account is named, the way out is stated, and nothing is guessed.
 *
 * Assigning the role ends this session on the backend, so there is no
 * "check again": the next sign-in carries the role.
 */
export function NoRoleYet({ email, onSignOut }: NoRoleYetProps) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
            <Card className="w-full max-w-[454px] rounded-lg border-border p-8 shadow-none">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">No console role yet</p>
                <h1 className="mt-4 text-base font-semibold text-foreground">Ask a super admin to assign you a role</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    {email} holds the Admin role, but no console role has been assigned to it, so there is nothing this
                    account can see or do here yet. A super admin assigns one under Users › Admin users. Once that is
                    done this session ends on its own; sign in again to continue.
                </p>
                <div className="mt-6 flex items-center gap-2">
                    <Button onClick={onSignOut}>Sign out</Button>
                </div>
            </Card>
        </div>
    );
}
