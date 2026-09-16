import type { Metadata } from "next";
import { AdvertisersLoader } from "../advertisers-loader";
import { AdvertisersNav } from "../advertisers-nav";

export const metadata: Metadata = { title: "Advertiser directory" };

/** The directory — the section's second tab since package O-C put the overview at the root (N3-C: the activation funnel is the tab beside it, not the rail's "Demand" row). */
export default function AdvertisersDirectoryPage() {
    return (
        <div className="space-y-5">
            <AdvertisersNav />
            <AdvertisersLoader />
        </div>
    );
}
