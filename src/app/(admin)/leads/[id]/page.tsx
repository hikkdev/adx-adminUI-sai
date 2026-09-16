import type { Metadata } from "next";
import { LeadLoader } from "./lead-loader";

export const metadata: Metadata = { title: "Lead" };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <LeadLoader id={id} />;
}
