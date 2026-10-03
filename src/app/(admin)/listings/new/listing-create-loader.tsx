"use client";

import Link from "next/link";
import { PlugZap, Workflow } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { campaignService, type ContentCategory } from "@/services/campaigns";
import { flowService } from "@/services/flows";
import { supplyService, type RosterPublisher } from "@/services/supply";
import { pricingService } from "@/services/pricing";
import type { WizardFlow } from "@/types";
import type { Material, MediaType, SizeClass, VenueType } from "@/types/pricing-engine";
import { ListingCreate } from "./listing-create";

/**
 * A client loader, because the form needs the pricing vocabularies and the API
 * client keeps its token in the browser.
 *
 * The vocabularies are not optional garnish: venue, media type and size class
 * are the comparable match key, so without them the form can neither price a
 * spot against the market nor produce a listing that helps price anyone else's.
 *
 * FL-3 (27 Sep 2026): the form is drawn from `flows.listing`, read here off
 * the public `GET /config` beside the vocabularies, with the content
 * categories the content-rules screen asks about. No flow on the row means
 * no form: the screen says so and points at the flow editor rather than
 * drawing a shape of its own.
 */
export function ListingCreateLoader() {
    const resource = useApiResource<{
        publishers: RosterPublisher[];
        venues: VenueType[];
        mediaTypes: MediaType[];
        sizeClasses: SizeClass[];
        materials: Material[];
        flow: WizardFlow | null;
        contentCategories: ContentCategory[];
    }>("listings:new", async () => {
        const [publishers, venues, mediaTypes, sizeClasses, materials, flow, contentCategories] = await Promise.all([
            // The live roster. This used to be `api.publishers.list()` —
            // fixtures — and the form posted the chosen `pub_*` id straight to
            // the real POST /listings, filing every console-created spot under
            // a publisher the backend had never heard of.
            supplyService.roster(),
            pricingService.venueTypes(),
            pricingService.mediaTypes(),
            pricingService.sizeClasses(),
            pricingService.materials(),
            flowService.listingFlow(),
            // The content-rules screen's vocabulary; a read that fails leaves the screen saying none are set up, not the form unusable.
            campaignService.contentCategories().catch(() => []),
        ]);
        return { publishers, venues, mediaTypes, sizeClasses, materials, flow, contentCategories };
    });

    return (
        <div className="space-y-6">
            <PageHeader
                title="Add inventory"
                subtitle="A spot, priced per day, checked against what comparable spots nearby are listed at."
            />
            {isLive("pricingEngine") ? (
                <ResourceBoundary resource={resource}>
                    {({ flow, ...data }) =>
                        flow ? (
                            <ListingCreate {...data} flow={flow} />
                        ) : (
                            <EmptyState
                                icon={Workflow}
                                title="The listing flow is not on the config row"
                                description="This form is drawn from the listing wizard both apps render, and the row holds none. Run the backend's config seed, or open the flow editor to check the key."
                                action={
                                    <Link href="/flows" className="text-sm font-medium text-primary hover:underline">
                                        Open the flow editor
                                    </Link>
                                }
                            />
                        )
                    }
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
