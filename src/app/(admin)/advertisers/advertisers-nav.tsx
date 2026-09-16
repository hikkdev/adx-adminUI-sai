import { SubNav } from "@/components/adx/sub-nav";

/**
 * The Advertisers section's own tabs — N3-C (the owner, 14 Sep 2026): the
 * advertiser funnel was a rail row of its own ("Demand"), and two funnel
 * dashboards do not need rail rows of their own. It is a tab of the
 * section, beside the directory. Package O-C put the overview first, at
 * the section's root, and moved the directory to its own path. Package S
 * added the Import tab — the party importer at `/party-imports/advertisers`.
 */
export function AdvertisersNav() {
    return (
        <SubNav
            items={[
                { label: "Overview", href: "/advertisers", exact: true },
                { label: "Directory", href: "/advertisers/directory" },
                { label: "Activation funnel", href: "/advertisers/activation" },
                { label: "Import", href: "/advertisers/import" },
            ]}
        />
    );
}
