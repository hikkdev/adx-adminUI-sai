import { SubNav } from "@/components/adx/sub-nav";

/**
 * Section tabs shared by every Pricing page.
 *
 * Two halves. The first is the comparables engine, which computes from the
 * market and suggests. The second is DR 10's manual model — the pricing model
 * hub (rate cards, dimensions, categories, seasonality and rules live under
 * its tabs), the simulator, the quotes it saves, and the approval queue. Ops
 * sets the second half by hand, and it decides what an advertiser is quoted
 * and whether a listing may publish.
 *
 * Every one of these reads the API. There are no fixture versions any more.
 */
export function PricingNav() {
    return (
        <SubNav
            className="overflow-x-auto"
            items={[
                { label: "Overview", href: "/pricing", exact: true },
                { label: "Venues", href: "/pricing/venues" },
                { label: "Media types & sizes", href: "/pricing/media-types" },
                { label: "Market data", href: "/pricing/market-data" },
                { label: "Surge calendar", href: "/pricing/surge" },
                { label: "Event sources", href: "/pricing/scraper" },
                { label: "Factors", href: "/pricing/factors" },
                { label: "Vocabulary", href: "/pricing/vocabulary" },
                { label: "Engine settings", href: "/pricing/engine-settings" },
                { label: "Pricing model", href: "/pricing/model" },
                { label: "Simulator", href: "/pricing/simulator" },
                { label: "Quotes", href: "/pricing/quotes" },
                { label: "Approvals", href: "/pricing/approvals" },
            ]}
        />
    );
}
