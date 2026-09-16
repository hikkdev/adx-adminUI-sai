import type { Metadata } from "next";
import { AgentKycRecordLoader } from "./agent-kyc-record-loader";

export const metadata: Metadata = { title: "Agent KYC record" };

/** D4 — one agent's KYC: recorded on their behalf, then decided. */
export default async function AgentKycRecordPage({ params }: { params: Promise<{ agentId: string }> }) {
    const { agentId } = await params;
    return <AgentKycRecordLoader agentId={agentId} />;
}
