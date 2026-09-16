import type { Metadata } from "next";
import { CampaignCreate } from "./campaign-create";

export const metadata: Metadata = { title: "New Campaign" };

export default function CampaignCreatePage() {
    return <CampaignCreate />;
}
