import { SubNav } from "@/components/adx/sub-nav";

/**
 * AN-8: the two boards, together.
 *
 * They are the same kind of object — people ranked by what they brought in —
 * and they were in two different sections, neither of which was about
 * ranking people. The onboarding board was reached only from a tab on
 * Publishers, though half its columns are advertisers. The agent board sat
 * under Growth CMS, which is the milestone and tier configuration.
 *
 * Neither was a duplicate of the other and neither was deleted. The agents
 * Overview keeps its top-N teaser and links here; this is the full board
 * behind it.
 */
export function LeaderboardsNav() {
    return (
        <SubNav
            items={[
                { label: "Onboarding", href: "/analytics/leaderboards", exact: true },
                { label: "Agents by city", href: "/analytics/leaderboards/agents" },
            ]}
        />
    );
}
