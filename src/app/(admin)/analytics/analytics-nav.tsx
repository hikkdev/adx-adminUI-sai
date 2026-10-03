import { SubNav } from "@/components/adx/sub-nav";

/**
 * The Analytics section's tabs (the owner, 24 September 2026).
 *
 * Analytics was a single page and Reports lived under Settings, which is
 * where things you configure once live — identifiers, geographies, feature
 * flags, system health. A report is not configuration. It is work an
 * operator does repeatedly, and what it produces is business data, so it
 * belongs with the numbers rather than with the switches.
 *
 * Moving it also gives it a door. Reports was absent from the navigation
 * config altogether, so the command palette could not reach it and the only
 * way in was the Settings tab bar.
 *
 * AN-8 gathered the two leaderboards behind one tab. They are the same kind
 * of object — people ranked by what they brought in — and they were in two
 * sections that are about neither. The onboarding board was reachable only
 * from a tab on Publishers, though each row counts one person's publishers
 * and advertisers together. The agent board sat under Growth CMS, which is
 * the milestone and tier configuration. Neither was a duplicate of the other,
 * so neither was deleted: the agents Overview keeps its top-N teaser and
 * links to the full board here.
 *
 * `Reports` is exact only for tidiness now that nothing nests under it.
 *
 * AN-2 added Explore, second: the Overview answers "how did the month go",
 * Explore answers everything else, so it sits between the summary and the
 * exports rather than after them.
 */
export function AnalyticsNav() {
    return (
        <SubNav
            items={[
                { label: "Overview", href: "/analytics", exact: true },
                { label: "Explore", href: "/analytics/explore" },
                { label: "Reports", href: "/analytics/reports", exact: true },
                { label: "Leaderboards", href: "/analytics/leaderboards" },
            ]}
        />
    );
}
