import { SubNav } from "@/components/adx/sub-nav";

/**
 * The Agents section's own tabs — package O-C: the overview at the
 * section's root, the roster beside it at `/agents/directory`, since
 * package S the Import tab — the party importer at `/party-imports/agents` —
 * and since AG-3 the application desk at `/agents/applications`.
 */
export function AgentsNav() {
    return (
        <SubNav
            items={[
                { label: "Overview", href: "/agents", exact: true },
                { label: "Directory", href: "/agents/directory" },
                { label: "Applications", href: "/agents/applications" },
                { label: "Fleet partners", href: "/agents/fleets" },
                { label: "Import", href: "/agents/import" },
            ]}
        />
    );
}
