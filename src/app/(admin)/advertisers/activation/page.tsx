import type { Metadata } from "next";
import { AdvertisersNav } from "../advertisers-nav";
import { AdvertiserActivationLoader } from "./activation-loader";

export const metadata: Metadata = { title: "Advertiser activation" };

/**
 * The advertiser funnel. N3-C (the owner, 14 Sep 2026): folded into the
 * Advertisers section as its "Activation funnel" tab — it was the rail's
 * own "Demand" row, and a funnel dashboard over the advertisers does not
 * need a rail row of its own. The content is unchanged; the tab strip is
 * new.
 */
export default function AdvertiserActivationPage() {
    return (
        <div className="space-y-5">
            <AdvertisersNav />
            <AdvertiserActivationLoader />
        </div>
    );
}
