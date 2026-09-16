import type { Metadata } from "next";
import { PartnerLoader } from "./partner-loader";

export const metadata: Metadata = { title: "Print partner" };

export default async function PrintPartnerPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <PartnerLoader id={id} />;
}
