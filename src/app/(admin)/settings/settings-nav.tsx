import { SubNav } from "@/components/adx/sub-nav";

/** Section tabs shared by the Settings hub pages. */
export function SettingsNav() {
    return (
        <SubNav
            items={[
                { label: "General", href: "/settings", exact: true },
                { label: "Identifiers", href: "/settings/identifiers" },
                { label: "Geographies", href: "/settings/geographies" },
                { label: "Integrations", href: "/settings/integrations" },
                { label: "Brand & theme", href: "/settings/brand" },
                { label: "AI", href: "/settings/ai" },
                { label: "Reports", href: "/settings/reports" },
                { label: "Import formats", href: "/settings/import-formats" },
                { label: "Agent routing", href: "/settings/agent-routing" },
                { label: "E-signing", href: "/settings/esign" },
                { label: "Live tracking", href: "/settings/tracking" },
                { label: "Leads scoring", href: "/settings/leads-scoring" },
                { label: "Feature flags", href: "/settings/flags" },
                { label: "App status", href: "/settings/app-status" },
                { label: "System health", href: "/settings/system-health" },
            ]}
        />
    );
}
