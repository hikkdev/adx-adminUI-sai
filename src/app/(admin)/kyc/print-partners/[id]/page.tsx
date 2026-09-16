import type { Metadata } from "next";
import { PrintPartnerCaseLoader } from "./print-partner-case-loader";

export const metadata: Metadata = { title: "Print partner KYC review" };

/** Lot N — one print partner's case: the documents, the per-tile decisions, the Digio session, the liveness video or the desk's attestation. */
export default async function PrintPartnerKycCasePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <PrintPartnerCaseLoader id={id} />;
}
