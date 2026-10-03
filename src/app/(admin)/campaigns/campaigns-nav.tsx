import { SubNav } from "@/components/adx/sub-nav";

/**
 * Section tabs for Campaigns — 2 Oct 2026, the owner: "Campaigns section
 * feels too weak here." Overview · Campaigns · Launch queue · Landing pages,
 * the way Listings runs: the overview sits at the section's root, the list
 * moved to `/campaigns/directory`, and the launch queue is the paid
 * campaigns that cannot go live yet.
 */
export function CampaignsNav() {
    return (
        <SubNav
            items={[
                { label: "Overview", href: "/campaigns", exact: true },
                { label: "Campaigns", href: "/campaigns/directory" },
                { label: "Launch queue", href: "/campaigns/launch-queue" },
                { label: "Landing pages", href: "/campaigns/landing-pages" },
            ]}
        />
    );
}
