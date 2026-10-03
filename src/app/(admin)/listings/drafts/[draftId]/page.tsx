import type { Metadata } from "next";
import { DraftDetailLoader } from "./draft-detail";

export const metadata: Metadata = { title: "Listing draft" };

/** One listing draft — opened from the Listings table's "Drafts" status (2 Oct 2026). */
export default async function ListingDraftPage({ params }: { params: Promise<{ draftId: string }> }) {
    const { draftId } = await params;
    return <DraftDetailLoader id={draftId} />;
}
