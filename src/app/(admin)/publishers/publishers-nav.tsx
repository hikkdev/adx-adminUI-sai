import { SubNav } from "@/components/adx/sub-nav";

/**
 * The Publishers section's own tabs — N3-C (the owner, 14 Sep 2026): the
 * activation funnel was a rail row of its own ("Activation"), and two
 * funnel dashboards do not need rail rows of their own. It is a tab of the
 * section, beside the directory and the legacy-book import. Package O-C
 * (the owner, 14 Sep: "there's no overview stats in publisher and
 * advertiser or any user section") put the overview first, at the
 * section's root, and moved the directory to its own path.
 */
export function PublishersNav() {
    return (
        <SubNav
            items={[
                { label: "Overview", href: "/publishers", exact: true },
                { label: "Directory", href: "/publishers/directory" },
                { label: "Activation funnel", href: "/publishers/activation" },
                { label: "Import", href: "/publishers/import" },
            ]}
        />
    );
}
