"use client";

import Link from "next/link";
import { ChevronLeft, IndianRupee, MapPinned } from "lucide-react";
import { Card } from "@/components/ui/card";
import { LISTING_IMPORT_CONFIGS } from "@/components/adx/party-import/listing-import-config";
import { PartyImportLoader } from "@/components/adx/party-import/party-import-loader";
import { LISTING_KINDS, type ListingKind } from "@/services/party-imports";

const KIND_CARDS: Record<ListingKind, { title: string; body: string; icon: typeof MapPinned }> = {
    listings: {
        title: "Listings",
        body: "A publisher's inventory sheet, one spot per row. Every created spot is a draft under one supply attempt; the publisher accepts one agreement for the file.",
        icon: MapPinned,
    },
    "rate-card": {
        title: "Rate card",
        body: "A publisher's rates, one listing per row, named by display id, external ref or title. Each rate is set through the listing's own rate door.",
        icon: IndianRupee,
    },
};

interface ListingImportLoaderProps {
    kind: ListingKind | null;
    publisherId: string | null;
    importId: string | null;
}

/**
 * Package U: choose the kind, then the publisher, then the kit. The kind
 * is in the URL so a report link carries it; the publisher page's Import
 * menu arrives with both already set.
 */
export function ListingImportLoader({ kind, publisherId, importId }: ListingImportLoaderProps) {
    if (!kind) {
        const query = publisherId ? `&publisherId=${encodeURIComponent(publisherId)}` : "";
        return (
            <div className="space-y-5">
                <div>
                    <Link href="/listings" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
                        <ChevronLeft className="size-4" />
                        Listings
                    </Link>
                    <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Import for a publisher</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Which file is it: the spots themselves, or the rates on spots already on the platform?</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                    {LISTING_KINDS.map((each) => {
                        const card = KIND_CARDS[each];
                        const Icon = card.icon;
                        return (
                            <Link key={each} href={`/listings/import?kind=${each}${query}`} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                <Card className="h-full rounded-lg border-border p-5 shadow-none transition-colors hover:bg-muted/40">
                                    <div className="flex size-9 items-center justify-center rounded-md bg-muted">
                                        <Icon className="size-4 text-muted-foreground" aria-hidden />
                                    </div>
                                    <h2 className="mt-3 text-base font-semibold text-foreground">{card.title}</h2>
                                    <p className="mt-1 text-sm text-muted-foreground">{card.body}</p>
                                </Card>
                            </Link>
                        );
                    })}
                </div>
            </div>
        );
    }

    return <PartyImportLoader config={LISTING_IMPORT_CONFIGS[kind]} importId={importId} publisherId={publisherId} query={{ kind }} />;
}
