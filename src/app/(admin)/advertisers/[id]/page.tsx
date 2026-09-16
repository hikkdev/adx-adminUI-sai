import type { Metadata } from "next";
import { AdvertiserLoader } from "./advertiser-loader";

export const metadata: Metadata = { title: "Advertiser" };

export default async function AdvertiserDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    return <AdvertiserLoader id={id} />;
}
