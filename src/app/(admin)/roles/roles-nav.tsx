import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { SubNav } from "@/components/adx/sub-nav";

/** The two screens under Roles: the builder, and who holds what. */
export function RolesNav() {
    return (
        <SubNav
            items={[
                { label: "Permissions", href: "/roles", exact: true },
                { label: "Members", href: "/roles/users" },
            ]}
        />
    );
}

/**
 * Every operator holds every permission until per-module enforcement is
 * switched on — the backend's launch rule: an ADMIN with no role holds all of
 * `PERMISSIONS`, and no route yet asks `requirePermission()` of the console's
 * own screens. The matrix is real and saved for real; it is the *enforcement*
 * that is still to come, and an operator reading "Read only · 2 members"
 * should not believe those two are read-only today.
 */
export function EnforcementBanner() {
    return (
        <p
            role="status"
            className="rounded-lg border border-warning/40 bg-warning-soft px-4 py-2.5 text-sm text-foreground"
        >
            Every operator is a Super admin until per-module enforcement is switched on. Roles and
            memberships saved here are recorded and will apply the moment it is.
        </p>
    );
}

/**
 * What the roles screens show with the API off.
 *
 * The five seeded columns and their thirteen made-up capability ids are gone
 * rather than kept: the real catalogue is thirteen module groups × tiers plus
 * named capabilities, and a role saved against invented ids would have been
 * refused with UNKNOWN_PERMISSION.
 */
export function RolesOffline({ title, subtitle }: { title: string; subtitle: string }) {
    return (
        <div className="space-y-5">
            <RolesNav />
            <PageHeader title={title} subtitle={subtitle} />
            <EmptyState
                icon={PlugZap}
                title="Roles read the API"
                description="This console is running on fixtures. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend to see the real permission catalogue and the roles built on it."
            />
        </div>
    );
}
