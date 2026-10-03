import { SubNav } from "@/components/adx/sub-nav";

/**
 * The Advertisers section's own tabs — N3-C (the owner, 14 Sep 2026): the
 * advertiser funnel was a rail row of its own ("Demand"), and two funnel
 * dashboards do not need rail rows of their own. Package O-C put the
 * overview first, at the section's root, and moved the directory to its own
 * path. Package S added the Import tab — the party importer at
 * `/party-imports/advertisers`.
 *
 * The activation funnel lost its tab on 24 September, with the publishers'
 * one: the Overview's demand-funnel card draws the same five gates and links
 * to the rows behind them. The page and its ⌘K entry both stay.
 */
export function AdvertisersNav() {
    return (
        <SubNav
            items={[
                { label: "Overview", href: "/advertisers", exact: true },
                { label: "Directory", href: "/advertisers/directory" },
                { label: "Import", href: "/advertisers/import" },
            ]}
        />
    );
}
