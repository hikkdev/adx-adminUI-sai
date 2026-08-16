import { SubNav } from "@/components/adx/sub-nav";

/** Section tabs shared by the Flow Editor pages. */
export function FlowsNav() {
    return (
        <SubNav
            items={[
                { label: "Onboarding flows", href: "/flows", exact: true },
                { label: "Fulfilment templates", href: "/flows/templates" },
            ]}
        />
    );
}
