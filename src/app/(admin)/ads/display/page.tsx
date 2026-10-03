import type { Metadata } from "next";
import { DisplayAds } from "./display-ads";

export const metadata: Metadata = { title: "Ads · Display ads" };

/** LM-1: every display ad, in every state. Was `/growth/ads/all` ("All ads"). */
export default function DisplayAdsPage() {
    return <DisplayAds />;
}
