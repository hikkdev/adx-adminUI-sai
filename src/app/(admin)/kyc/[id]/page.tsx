import type { Metadata } from "next";
import { KycCaseLoader } from "./kyc-case-loader";

export const metadata: Metadata = { title: "KYC Review" };

/** D7 / Lot D — one publisher's case: the documents, the per-tile decisions, the Digio session, the liveness video. */
export default async function KycCasePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <KycCaseLoader publisherId={id} />;
}
