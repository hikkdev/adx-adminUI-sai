import { SubNav } from "@/components/adx/sub-nav";

/**
 * The Publishers section's own tabs — N3-C (the owner, 14 Sep 2026): the
 * activation funnel was a rail row of its own ("Activation"), and two
 * funnel dashboards do not need rail rows of their own. Package O-C
 * (the owner, 14 Sep: "there's no overview stats in publisher and
 * advertiser or any user section") put the overview first, at the
 * section's root, and moved the directory to its own path.
 *
 * The activation funnel lost its tab on 24 September: the Overview's funnel
 * card already draws the five gates and links to the rows behind them ("Who
 * is held where"), so the tab was a second door onto a page you reach from
 * the card that explains it. The page and its ⌘K entry both stay.
 *
 * The Onboarding board went the same day, to Analytics. It was the odd tab
 * here: it navigated out of the section into another one's tab bar, and the
 * board it opened is not publisher data — each row counts a person's
 * publishers and advertisers together, so Advertisers had as much claim on
 * it and no link to it.
 */
export function PublishersNav() {
    return (
        <SubNav
            items={[
                { label: "Overview", href: "/publishers", exact: true },
                { label: "Directory", href: "/publishers/directory" },
                { label: "Import", href: "/publishers/import" },
            ]}
        />
    );
}
