import { SubNav } from "@/components/adx/sub-nav";

/**
 * Section tabs shared by the listings desks — the inventory, the
 * re-verification queue, the review desk and the claims desk (Q-C item 3).
 * The attempts and the map stay reachable from the inventory itself.
 * Package U added the Import tab: a publisher's listings or rate card
 * on the party import kit.
 */
export function ListingsNav() {
    return (
        <SubNav
            items={[
                { label: "Listings", href: "/listings", exact: true },
                { label: "Verification", href: "/listings/verification" },
                { label: "Review", href: "/listings/review" },
                { label: "Claims", href: "/listings/claims" },
                { label: "Import", href: "/listings/import" },
            ]}
        />
    );
}
