import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { SubNav } from "@/components/adx/sub-nav";

/**
 * The screens under Users.
 *
 * EXTENSION POINT — package CD appends the closure and erasure desk here
 * (`/users/closures`, `/users/erasure`, or whatever it names them); the tab
 * strip is the one place that has to know. Each screen renders `<UsersNav />`
 * above its header so the strip is identical on all of them.
 */
export const USERS_NAV_ITEMS: { label: string; href: string; exact?: boolean }[] = [
    /* Package O-C — the overview is the section's landing tab; the accounts directory moved beside it. */
    { label: "Overview", href: "/users", exact: true },
    { label: "Accounts", href: "/users/accounts" },
    /* Lot K2 — the console's own operators: role, second factor, sign-in. */
    { label: "Admin users", href: "/users/admins" },
    /* Package CD — Lot A's closure and erasure desks. */
    { label: "Closure cases", href: "/users/closures" },
    { label: "Erasure requests", href: "/users/erasure" },
];

export function UsersNav() {
    return <SubNav items={USERS_NAV_ITEMS} />;
}

/**
 * What the users screens show with the API off.
 *
 * The `usr_*` seeds are gone rather than kept as a fallback: their ids were
 * never issued by the backend, and the fields they carried — a city, a
 * verified identity, somebody else's session list — have no source on the
 * admin list. An empty screen that says why is a true statement.
 */
export function UsersOffline({ title, subtitle }: { title: string; subtitle: string }) {
    return (
        <div className="space-y-5">
            <UsersNav />
            <PageHeader title={title} subtitle={subtitle} />
            <EmptyState
                icon={PlugZap}
                title="Users read the API"
                description="This console is running on fixtures. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend to see the real accounts and invitations."
            />
        </div>
    );
}
