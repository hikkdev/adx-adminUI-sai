import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { UsersNav } from "../users-nav";

/*
 * The builder is a tab of Users (24 Sep 2026): it draws `<UsersNav />` like
 * every other Users screen and has no strip of its own. A Members tab used
 * to sit beside it under `/roles`; it was a strict subset of Admin users —
 * the same `GET /users?role=ADMIN`, the same role-assignment call — so it
 * redirects there, and the builder itself then followed it into Users.
 */

/**
 * What the matrix means (RP-1, owner's rule of 24 Sep 2026): only Super admin
 * holds every permission. Every other operator holds exactly their role's
 * list — `permissionsFor` in access-control resolves it into the session —
 * and an operator with no role holds none: every admin route refuses them
 * (ROLE_REQUIRED) and the console shows them one card until a super admin
 * assigns a role on the Admin users tab.
 */
export function RoleRuleNote() {
    return (
        <p
            role="status"
            className="rounded-lg border border-warning/40 bg-warning-soft px-4 py-2.5 text-sm text-foreground"
        >
            Only Super admin holds every permission. Every other operator holds exactly their
            role&apos;s list, and one with no role cannot use the console until a super admin assigns
            one on the Admin users tab.
        </p>
    );
}

/**
 * What the roles screens show with the API off.
 *
 * The five seeded columns and their thirteen made-up capability ids are gone
 * rather than kept: the real catalogue is eighteen module groups × tiers plus
 * named capabilities, and a role saved against invented ids would have been
 * refused with UNKNOWN_PERMISSION.
 */
export function RolesOffline({ title, subtitle }: { title: string; subtitle: string }) {
    return (
        <div className="space-y-5">
            <UsersNav />
            <PageHeader title={title} subtitle={subtitle} />
            <EmptyState
                icon={PlugZap}
                title="Roles read the API"
                description="This console is running on fixtures. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend to see the real permission catalogue and the roles built on it."
            />
        </div>
    );
}
