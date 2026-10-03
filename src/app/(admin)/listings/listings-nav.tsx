import { SubNav } from "@/components/adx/sub-nav";

/**
 * Section tabs shared by the listings desks, in the owner's order (2 Oct
 * 2026): "Overview, Listings, Review, Verification, Renewals, Claims,
 * Import". The overview sits at the section's root as every other
 * section's does, and the table moved to `/listings/directory`. Drafts are
 * no longer a tab: they are a status of the table ("Drafts · N" in its
 * Status dropdown), since a draft is a listing not finished yet. The
 * attempts and the map stay reachable from the table itself.
 */
export function ListingsNav() {
    return (
        <SubNav
            items={[
                { label: "Overview", href: "/listings", exact: true },
                { label: "Listings", href: "/listings/directory" },
                { label: "Review", href: "/listings/review" },
                { label: "Verification", href: "/listings/verification" },
                { label: "Renewals", href: "/listings/renewals" },
                { label: "Claims", href: "/listings/claims" },
                { label: "Import", href: "/listings/import" },
            ]}
        />
    );
}
