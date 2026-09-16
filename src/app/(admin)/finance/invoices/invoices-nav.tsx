import { SubNav } from "@/components/adx/sub-nav";

/**
 * The two registers under Invoices: what ADX billed advertisers, and what
 * GST-registered publishers billed ADX. Both read Lot B's `invoices` module;
 * they are separate documents with separate desks, so separate screens.
 */
export function InvoicesNav() {
    return (
        <SubNav
            items={[
                { label: "Advertiser invoices", href: "/finance/invoices", exact: true },
                { label: "Publisher invoices", href: "/finance/invoices/publishers" },
            ]}
        />
    );
}
