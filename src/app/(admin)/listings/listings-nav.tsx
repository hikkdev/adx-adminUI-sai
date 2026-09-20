import { SubNav } from "@/components/adx/sub-nav";

/**
 * Section tabs shared by the listings desks — the inventory, the
 * re-verification queue, the review desk and the claims desk (Q-C item 3).
 * The attempts and the map stay reachable from the inventory itself.
 * Package U added the Import tab: a publisher's listings or rate card
 * on the party import kit. QR-8 added Drafts: the spots publishers saved
 * half-way on their phones — the sales and onboarding teams' call list.
 * QR-24 added Renewals: the leases, licences and permits running out.
 */
export function ListingsNav() {
    return (
        <SubNav
            items={[
                { label: "Listings", href: "/listings", exact: true },
                { label: "Verification", href: "/listings/verification" },
                { label: "Renewals", href: "/listings/renewals" },
                { label: "Review", href: "/listings/review" },
                { label: "Claims", href: "/listings/claims" },
                { label: "Drafts", href: "/listings/drafts" },
                { label: "Import", href: "/listings/import" },
            ]}
        />
    );
}
