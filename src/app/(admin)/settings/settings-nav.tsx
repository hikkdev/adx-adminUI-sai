import { SubNav } from "@/components/adx/sub-nav";

/** Section tabs shared by the Settings hub pages. */
export function SettingsNav() {
    return (
        <SubNav
            items={[
                { label: "General", href: "/settings", exact: true },
                { label: "Integrations", href: "/settings/integrations" },
                { label: "Exports", href: "/settings/exports" },
                { label: "Feature flags", href: "/settings/flags" },
                { label: "System health", href: "/settings/system-health" },
            ]}
        />
    );
}
