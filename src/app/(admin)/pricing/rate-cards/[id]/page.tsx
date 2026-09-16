import type { Metadata } from "next";
import { RateCardLoader } from "./rate-card-loader";

export const metadata: Metadata = { title: "Rate card" };

export default async function RateCardPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <RateCardLoader id={id} />;
}
