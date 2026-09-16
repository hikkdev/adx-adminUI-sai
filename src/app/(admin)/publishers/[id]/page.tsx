import type { Metadata } from "next";
import { PublisherLoader } from "./publisher-loader";

export const metadata: Metadata = { title: "Publisher" };

export default async function PublisherDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    return <PublisherLoader id={id} />;
}
