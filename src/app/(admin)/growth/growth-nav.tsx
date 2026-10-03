import { SubNav } from "@/components/adx/sub-nav";

/** The frame's heading, shared by the live screen and the offline card. */
export const GROWTH_TITLE = "Growth CMS";
export const GROWTH_SUBTITLE = "Milestone programs that reward field agents";

/**
 * Section tabs shared by the Growth pages.
 *
 * Milestones is the CMS the sidebar row opens; the ladder lives behind the
 * same row rather than crowding the rail, the way Finance keeps its screens.
 *
 * The leaderboard left on 25 September (AN-8): Growth CMS is where the tiers
 * and milestones are *configured*, and a ranking of agents by what they
 * brought in belongs with the other leaderboard, in Analytics.
 */
export function GrowthNav() {
    return (
        <SubNav
            items={[
                { label: "Milestones", href: "/growth", exact: true },
                { label: "Ladder", href: "/growth/ladder" },
                { label: "Promo codes", href: "/growth/promo-codes" },
            ]}
        />
    );
}
