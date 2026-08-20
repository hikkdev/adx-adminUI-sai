import { SubNav } from "@/components/adx/sub-nav";

/** Section tabs shared by every Comms page. */
export function CommsNav() {
    return (
        <SubNav
            items={[
                { label: "Templates", href: "/comms", exact: true },
                { label: "Delivery logs", href: "/comms/delivery-logs" },
            ]}
        />
    );
}
