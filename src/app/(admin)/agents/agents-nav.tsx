import { SubNav } from "@/components/adx/sub-nav";

/**
 * The Agents section's own tabs — package O-C: the overview at the
 * section's root, the roster beside it at `/agents/directory`, and since
 * package S the Import tab — the party importer at `/party-imports/agents`.
 */
export function AgentsNav() {
    return (
        <SubNav
            items={[
                { label: "Overview", href: "/agents", exact: true },
                { label: "Directory", href: "/agents/directory" },
                { label: "Import", href: "/agents/import" },
            ]}
        />
    );
}
