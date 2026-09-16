import { SubNav } from "@/components/adx/sub-nav";

/**
 * The desk's own tabs.
 *
 * One list rather than a copy per page: Lot I adds two screens beside the
 * queue, and a tab row that disagrees with itself between them is how an
 * operator learns not to trust the nav.
 */
export function SupportNav() {
    return (
        <SubNav
            items={[
                { label: "Tickets", href: "/support", exact: true },
                { label: "Live chat", href: "/support/live" },
                { label: "Canned replies", href: "/support/canned" },
                { label: "Safety", href: "/support/safety" },
            ]}
        />
    );
}
