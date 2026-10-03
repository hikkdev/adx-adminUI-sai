import { SubNav } from "@/components/adx/sub-nav";

/**
 * AS-1: the Ads & sponsored section's tabs (the owner, 27 September 2026).
 *
 * The ads ADX sells were six tabs behind a Growth tab, but Growth is where
 * the levers for ADX's own people are configured — milestones, the tier
 * ladder, promo codes — and a product ADX sells is commerce, so it sits in
 * the marketplace beside Plans & subscriptions. The section's numbers live
 * on its Overview (the console's rule: one section, one Overview); what was
 * the Performance tab is part of it. Placements merged into Slots &
 * pricing: both are price lists for the same shelf. `next.config.ts`
 * redirects every old `/growth/ads…` address.
 */
export const ADS_TABS = [
    { label: "Overview", href: "/ads", exact: true },
    { label: "Review queue", href: "/ads/review" },
    { label: "Display ads", href: "/ads/display" },
    { label: "Sponsored listings", href: "/ads/sponsored" },
    { label: "Slots & pricing", href: "/ads/slots" },
] as const;

export function AdsNav() {
    return <SubNav items={[...ADS_TABS]} />;
}
