import { SubNav } from "@/components/adx/sub-nav";

/**
 * The section's own tabs, on every page under it.
 *
 * The sidebar draws the rail row only (children feed the palette and the
 * active state), so without this strip the two desks Lot J added beside the
 * sales book were reachable from nowhere on the page — the owner opened
 * "Plans & subscriptions", landed on the sales table and saw nothing to
 * manage (14 September). One list rather than a copy per page.
 */
export function PackagesNav() {
    return (
        <SubNav
            items={[
                { label: "Subscription plans", href: "/packages/catalogue" },
                { label: "Publisher subscriptions", href: "/packages/subscriptions" },
                { label: "Package sales", href: "/packages/sales" },
            ]}
        />
    );
}
