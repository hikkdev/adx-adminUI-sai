import type { Metadata } from "next";
import { FleetLoader } from "./fleet-loader";

export const metadata: Metadata = { title: "Fleet partner" };

export default async function FleetPartnerPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <FleetLoader id={id} />;
}
