"use client";

import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { twoFactorService, type TwoFactorStatus } from "@/services/two-factor";
import { usersService, type WireMe, type WireSession } from "@/services/users";
import { AccountView } from "./account-view";

interface Loaded {
    me: WireMe;
    sessions: WireSession[];
    /** Lot K2: `GET /auth/2fa/status`. Null when the read failed; the card says so. */
    twoFactor: TwoFactorStatus | null;
}

/**
 * The signed-in operator's own record: `/users/me`, `/users/me/sessions`
 * and (Lot K2) `/auth/2fa/status`. Under the `auth` flag rather than
 * `users`, because it is the session's own account and belongs with
 * sign-in.
 */
export function AccountLoader() {
    const live = isLive("auth");
    const resource = useApiResource<Loaded>(`account:me:${live}`, async () => {
        const [me, sessions, twoFactor] = await Promise.all([
            usersService.me(),
            usersService.mySessions().catch(() => []),
            twoFactorService.status().catch(() => null),
        ]);
        return { me, sessions, twoFactor };
    });

    if (!live) {
        return (
            <div className="mx-auto max-w-3xl space-y-5">
                <PageHeader title="My account" subtitle="Profile and security" />
                <EmptyState
                    icon={PlugZap}
                    title="Your account reads the API"
                    description="This console is running on fixtures, so there is no signed-in account to show. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend."
                />
            </div>
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(data) => <AccountView me={data.me} sessions={data.sessions} twoFactor={data.twoFactor} onChanged={resource.reload} />}
        </ResourceBoundary>
    );
}
