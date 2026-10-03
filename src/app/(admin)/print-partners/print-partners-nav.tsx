import { SubNav } from "@/components/adx/sub-nav";

/**
 * The print partner desk's tabs — package O-C: the overview at the
 * section's root, then the desk's two halves (Lot B; Lot H, Q147) as
 * routes of their own rather than one page's tab state, so each is a
 * link: the directory of shops, and the quote requests out across orders.
 * "Roster" was the odd one out — every other party section calls its list
 * a Directory (the owner, 24 September), so the label and the address
 * both say Directory now; next.config redirects the old path.
 * Package S added the Import tab — the party importer at
 * `/party-imports/print-partners`.
 */
export function PrintPartnersNav() {
    return (
        <SubNav
            items={[
                { label: "Overview", href: "/print-partners", exact: true },
                { label: "Directory", href: "/print-partners/directory" },
                { label: "Quote requests", href: "/print-partners/quote-requests" },
                { label: "Import", href: "/print-partners/import" },
            ]}
        />
    );
}
