import type { Metadata } from "next";
import { AdvertiserCaseLoader } from "./advertiser-case-loader";

export const metadata: Metadata = { title: "Advertiser KYC review" };

/** 2 Oct 2026 — one advertiser's case on its own page, keyed by the advertiser PROFILE id: the documents, the per-tile decisions, the Digio session, the liveness video. */
export default async function AdvertiserKycCasePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <AdvertiserCaseLoader id={id} />;
}
