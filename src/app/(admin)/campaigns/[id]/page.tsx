import type { Metadata } from "next";
import { CampaignLoader } from "./campaign-loader";

export const metadata: Metadata = { title: "Campaign" };

export default async function CampaignDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    return <CampaignLoader id={id} />;
}
