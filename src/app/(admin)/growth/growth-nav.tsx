import { SubNav } from "@/components/adx/sub-nav";

/** The frame's heading, shared by the live screen and the offline card. */
export const GROWTH_TITLE = "Growth CMS";
export const GROWTH_SUBTITLE = "Milestone programs that reward field agents";

/**
 * Section tabs shared by the Growth pages.
 *
 * Milestones is the CMS the sidebar row opens; the ladder and the
 * leaderboard are DR 05's other two levers and live behind the same row
 * rather than crowding the rail, the way Finance keeps its screens.
 */
export function GrowthNav() {
    return (
        <SubNav
            items={[
                { label: "Milestones", href: "/growth", exact: true },
                { label: "Ladder", href: "/growth/ladder" },
                { label: "Leaderboard", href: "/growth/leaderboard" },
            ]}
        />
    );
}
