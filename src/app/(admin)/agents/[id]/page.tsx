import type { Metadata } from "next";
import { AgentLoader } from "./agent-loader";

export const metadata: Metadata = { title: "Agent" };

export default async function AgentDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    return <AgentLoader id={id} />;
}
