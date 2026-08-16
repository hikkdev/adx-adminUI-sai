import { SubNav } from "@/components/adx/sub-nav";

/** Section tabs shared by every Pricing page. */
export function PricingNav() {
    return (
        <SubNav
            className="overflow-x-auto"
            items={[
                { label: "Overview", href: "/pricing", exact: true },
                { label: "Pricing model", href: "/pricing/model" },
                { label: "Revenue share", href: "/pricing/revenue-share" },
                { label: "Simulator", href: "/pricing/simulator" },
                { label: "Approvals", href: "/pricing/approvals" },
            ]}
        />
    );
}
