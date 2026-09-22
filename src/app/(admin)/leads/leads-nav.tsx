import { SubNav } from "@/components/adx/sub-nav";

/**
 * LH9: the Leads section's tabs, in the brief's order — Overview | Board |
 * List | Map | Sources | Sequences | Conversations | Import — with the four
 * desks the lots added after them (the funnel desk with its own filters,
 * the tele queue, territories, priority zones). The overview sits at the
 * section's root like every other section's; the list moved to
 * `/leads/list`. "Conversations" is the LH6 inbox under the brief's name.
 */
export function LeadsNav() {
    return (
        <SubNav
            items={[
                { label: "Overview", href: "/leads", exact: true },
                { label: "Board", href: "/leads/board" },
                { label: "List", href: "/leads/list" },
                { label: "Map", href: "/leads/map" },
                { label: "Sources", href: "/leads/sources" },
                { label: "Sequences", href: "/leads/sequences" },
                { label: "Conversations", href: "/leads/inbox" },
                { label: "Import", href: "/leads/import" },
                { label: "Funnel", href: "/leads/funnel" },
                { label: "Tele queue", href: "/leads/tele-queue" },
                { label: "Integrity", href: "/leads/integrity" },
                { label: "Territories", href: "/leads/territories" },
                { label: "Zones", href: "/leads/priority-zones" },
            ]}
        />
    );
}
