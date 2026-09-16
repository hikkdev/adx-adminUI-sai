import type { Metadata } from "next";
import { ListingDetailLoader } from "./listing-detail-loader";

export const metadata: Metadata = { title: "Listing" };

export default async function ListingDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    return <ListingDetailLoader id={id} />;
}
