import type { NextConfig } from "next";

/** AS-1: every old `/growth/ads…` address, to its home under `/ads`. */
const ADS_REDIRECTS = [
    { source: "/growth/ads", destination: "/ads/review", permanent: true },
    { source: "/growth/ads/all", destination: "/ads/display", permanent: true },
    { source: "/growth/ads/sponsored", destination: "/ads/sponsored", permanent: true },
    { source: "/growth/ads/slots", destination: "/ads/slots", permanent: true },
    { source: "/growth/ads/placements", destination: "/ads/slots", permanent: true },
    { source: "/growth/ads/performance", destination: "/ads", permanent: true },
];

/**
 * 2 Oct 2026: Listings gained an Overview at `/listings`, so the table moved
 * to `/listings/directory` (as Publishers did), and Drafts became a status
 * of that table. A bare `/listings` is the overview now; a link that named a
 * status or a category of the old table (`/listings?status=…`) still opens
 * the table with it — the query passes through.
 */
const LISTINGS_REDIRECTS = [
    { source: "/listings/drafts", destination: "/listings/directory?status=DRAFTS", permanent: true },
    { source: "/listings", has: [{ type: "query" as const, key: "status" }], destination: "/listings/directory", permanent: false },
    { source: "/listings", has: [{ type: "query" as const, key: "category" }], destination: "/listings/directory", permanent: false },
];

/**
 * 2 Oct 2026: Campaigns gained an Overview at `/campaigns`, so the list
 * moved to `/campaigns/directory`, as Listings did. A bare `/campaigns` is
 * the overview now; a link that named a facet of the old list — the
 * advertiser page's "View campaign queue" (`?advertiserId=`), a status, a
 * search — still opens the list with it, the query passing through.
 */
const CAMPAIGNS_LIST_KEYS = ["advertiserId", "status", "q", "waitingOn", "from", "to"] as const;
const CAMPAIGNS_REDIRECTS = CAMPAIGNS_LIST_KEYS.map((key) => ({
    source: "/campaigns",
    has: [{ type: "query" as const, key }],
    destination: "/campaigns/directory",
    permanent: false,
}));

const nextConfig: NextConfig = {
    reactStrictMode: true,
    /**
     * The sections were renamed on 24 Sep 2026 so the address matches the
     * label: contracts are Legal documents, the policies nobody signs are a
     * tab of Content, and the print partners' list is a Directory like every
     * other party's. These keep every bookmark, deep link and pasted URL
     * landing where it used to.
     */
    async redirects() {
        return [
            { source: "/agreements", destination: "/legal-documents", permanent: true },
            { source: "/agreements/:path*", destination: "/legal-documents/:path*", permanent: true },
            { source: "/legal", destination: "/content/policies", permanent: true },
            { source: "/print-partners/roster", destination: "/print-partners/directory", permanent: true },
            /* Reports is work, not configuration, so it sits with the numbers. */
            { source: "/settings/reports", destination: "/analytics/reports", permanent: true },
            { source: "/settings/reports/:path*", destination: "/analytics/reports/:path*", permanent: true },
            /* AN-8: both leaderboards are rankings of people, so they sit together. */
            { source: "/analytics/reports/onboarding-board", destination: "/analytics/leaderboards", permanent: true },
            { source: "/settings/reports/onboarding-board", destination: "/analytics/leaderboards", permanent: true },
            { source: "/growth/leaderboard", destination: "/analytics/leaderboards/agents", permanent: true },
            /* CR-1: Creative review is the Review tab of Creatives. */
            { source: "/moderation", destination: "/creatives", permanent: true },
            { source: "/moderation/:path*", destination: "/creatives/:path*", permanent: true },
            /* OM-1: Bookings was the Orders list drawn a second time. */
            { source: "/bookings", destination: "/orders", permanent: true },
            { source: "/bookings/calendar", destination: "/orders/calendar", permanent: true },
            /* OM-2: Members under Roles was a subset of Admin users under Users;
               the builder itself then moved beside them as a tab of Users. */
            { source: "/roles/users", destination: "/users/admins", permanent: true },
            { source: "/roles", destination: "/users/roles", permanent: true },
            /* AS-1 (27 Sep 2026): the ads ADX sells left Growth for a section of
               their own. Performance became the Overview; Placements joined
               Slots & pricing. */
            ...ADS_REDIRECTS,
            ...LISTINGS_REDIRECTS,
            ...CAMPAIGNS_REDIRECTS,
        ];
    },
};

export default nextConfig;
