import type { Metadata } from "next";
import { api } from "@/services";
import { CampaignsTable } from "./campaigns-table";

export const metadata: Metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
    const campaigns = await api.campaigns.list();
    return <CampaignsTable campaigns={campaigns} />;
}
