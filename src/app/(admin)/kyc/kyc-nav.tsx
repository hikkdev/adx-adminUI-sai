import { SubNav } from "@/components/adx/sub-nav";

/** Section tabs shared by the KYC review queues — the five kinds of party ADX verifies (Lot N adds the print partner). */
export function KycNav() {
    return (
        <SubNav
            items={[
                { label: "Publishers", href: "/kyc", exact: true },
                { label: "Advertisers", href: "/kyc/advertisers" },
                { label: "Print partners", href: "/kyc/print-partners" },
                { label: "Agents", href: "/kyc/agents" },
                { label: "Employees", href: "/kyc/employees" },
            ]}
        />
    );
}
