import { SubNav } from "@/components/adx/sub-nav";

/** Section tabs shared by every Comms page. */
export function CommsNav() {
    return (
        <SubNav
            items={[
                { label: "Announcements", href: "/comms", exact: true },
                { label: "Templates", href: "/comms/templates" },
                { label: "Delivery logs", href: "/comms/delivery-logs" },
            ]}
        />
    );
}
