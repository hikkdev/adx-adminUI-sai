import { SubNav } from "@/components/adx/sub-nav";

/** Section tabs shared by every Finance page. */
export function FinanceNav() {
    return (
        <SubNav
            items={[
                { label: "Withdrawal approvals", href: "/finance", exact: true },
                { label: "Payouts", href: "/finance/payouts" },
                { label: "Invoices", href: "/finance/invoices" },
                { label: "Reconciliation", href: "/finance/reconciliation" },
            ]}
        />
    );
}
