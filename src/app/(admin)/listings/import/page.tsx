import type { Metadata } from "next";
import { LISTING_KINDS, type ListingKind } from "@/services/party-imports";
import { ListingsNav } from "../listings-nav";
import { ListingImportLoader } from "./listing-import-loader";

export const metadata: Metadata = { title: "Import listings" };

const isKind = (value: string | undefined): value is ListingKind => (LISTING_KINDS as readonly string[]).includes(value ?? "");

/**
 * Package U — the Listings section's Import tab: a publisher's listings
 * or their rate card, on the party import kit. `?kind=` picks the kind,
 * `?publisherId=` names the publisher (the picker, or the publisher
 * page's Import menu), `?id=` opens one import.
 */
export default async function ImportListingsPage({ searchParams }: { searchParams: Promise<{ kind?: string; publisherId?: string; id?: string }> }) {
    const { kind, publisherId, id } = await searchParams;
    return (
        <div className="space-y-5">
            <ListingsNav />
            <ListingImportLoader kind={isKind(kind) ? kind : null} publisherId={publisherId ?? null} importId={id ?? null} />
        </div>
    );
}
