import type { Metadata } from "next";
import { SponsoredListings } from "./sponsored-listings";

export const metadata: Metadata = { title: "Ads · Sponsored listings" };

/** LM-1: listings their owners paid to show first. Was `/growth/ads/sponsored`. */
export default function SponsoredPage() {
    return <SponsoredListings />;
}
