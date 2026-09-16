import { SubNav } from "@/components/adx/sub-nav";

/**
 * Section tabs shared by every Finance page.
 *
 * Every one of them reads the ADX backend: the withdrawal queue, wallets, the
 * double-entry ledger, the payout-method verification queue, agent
 * incentives, the numbers behind the rules, payout batches, invoices,
 * reconciliation and the commission model. `finance` is in `liveDomains`
 * for that reason.
 */
export function FinanceNav() {
    return (
        <SubNav
            // Ten tabs outgrow a narrow viewport; scrolling the row keeps every
            // one of them reachable rather than clipping the last few silently.
            className="overflow-x-auto whitespace-nowrap"
            items={[
                { label: "Withdrawals", href: "/finance", exact: true },
                { label: "Wallets", href: "/finance/wallets" },
                { label: "Ledger", href: "/finance/ledger" },
                { label: "Payout methods", href: "/finance/payout-methods" },
                { label: "Incentives", href: "/finance/incentives" },
                { label: "Refunds", href: "/finance/refunds" },
                { label: "Payments", href: "/finance/payments" },
                { label: "Settings", href: "/finance/settings" },
                { label: "Payouts", href: "/finance/payouts" },
                { label: "Invoices", href: "/finance/invoices" },
                { label: "Reconciliation", href: "/finance/reconciliation" },
                { label: "Commission & fees", href: "/finance/revenue" },
            ]}
        />
    );
}
