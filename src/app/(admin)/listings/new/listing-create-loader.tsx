"use client";

import { PlugZap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { supplyService, type RosterPublisher } from "@/services/supply";
import { pricingService } from "@/services/pricing";
import type { Material, MediaType, SizeClass, VenueType } from "@/types/pricing-engine";
import { ListingCreate } from "./listing-create";

/**
 * A client loader, because the form needs the pricing vocabularies and the API
 * client keeps its token in the browser.
 *
 * The vocabularies are not optional garnish: venue, media type and size class
 * are the comparable match key, so without them the form can neither price a
 * spot against the market nor produce a listing that helps price anyone else's.
 */
export function ListingCreateLoader() {
    const resource = useApiResource<{
        publishers: RosterPublisher[];
        venues: VenueType[];
        mediaTypes: MediaType[];
        sizeClasses: SizeClass[];
        materials: Material[];
    }>("listings:new", async () => {
        const [publishers, venues, mediaTypes, sizeClasses, materials] = await Promise.all([
            // The live roster. This used to be `api.publishers.list()` —
            // fixtures — and the form posted the chosen `pub_*` id straight to
            // the real POST /listings, filing every console-created spot under
            // a publisher the backend had never heard of.
            supplyService.roster(),
            pricingService.venueTypes(),
            pricingService.mediaTypes(),
            pricingService.sizeClasses(),
            pricingService.materials(),
        ]);
        return { publishers, venues, mediaTypes, sizeClasses, materials };
    });

    return (
        <div className="space-y-6">
            <PageHeader
                title="Add inventory"
                subtitle="A spot, priced per day, checked against what comparable spots nearby are listed at."
            />
            {isLive("pricingEngine") ? (
                <ResourceBoundary resource={resource}>
                    {(data) => <ListingCreate {...data} />}
                </ResourceBoundary>
            ) : (
                <Card className="rounded-lg border-border p-8 text-center shadow-none">
                    <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                        <PlugZap className="size-6 text-muted-foreground" strokeWidth={1.5} />
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-foreground">
                        Not connected to the backend
                    </h3>
                    <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                        This form creates a real listing and checks its price against real market
                        data. It is disabled rather than pretending — the version that pretended
                        reported success with a toast and saved nothing.
                    </p>
                </Card>
            )}
        </div>
    );
}
