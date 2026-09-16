/**
 * The Subscription plans desk's copy, in a file of its own so the loader
 * and the advertiser editor can both read it without importing each other
 * (Lot J leftover (a): `catalogue-view.tsx` used to import its heading from
 * `catalogue-loader.tsx`, which imports the view).
 */

/** The page's heading, shared by the live screen and the offline card. */
export const PAGE_TITLE = "Subscription plans";
export const PAGE_SUBTITLE = "What a publisher or an advertiser can buy, priced for the next purchase";

/** The advertiser section's own heading inside the page. */
export const CATALOGUE_TITLE = "Advertiser packages";
export const CATALOGUE_SUBTITLE = "The three plans and the add-ons an advertiser can buy, priced for the next sale";

/** The backend's kill switch over the publisher's self-service purchase (Lot J-B1). */
export const PUBLISHER_PLANS_FEATURE = "revenue.publisher-plans";
