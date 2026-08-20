import { SubNav } from "@/components/adx/sub-nav";

/** Section tabs shared by the KYC review queues. */
export function KycNav() {
    return (
        <SubNav
            items={[
                { label: "Publishers", href: "/kyc", exact: true },
                { label: "Advertisers", href: "/kyc/advertisers" },
            ]}
        />
    );
}
