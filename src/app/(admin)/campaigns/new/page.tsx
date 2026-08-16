import type { Metadata } from "next";
import { api } from "@/services";
import { CampaignCreate } from "./campaign-create";

export const metadata: Metadata = { title: "New Campaign" };

export default async function CampaignCreatePage() {
    const listings = await api.listings.list();
    return <CampaignCreate listings={listings} />;
}
