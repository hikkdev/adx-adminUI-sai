"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { useFeature } from "@/lib/use-feature";
import { isLive } from "@/lib/api-config";
import { catalogueService, type Catalogue } from "@/services/packages";
import { PAGE_SUBTITLE, PAGE_TITLE, PUBLISHER_PLANS_FEATURE } from "./catalogue-constants";
import { CatalogueView } from "./catalogue-view";
import { PublisherPlansLoader } from "./publisher-plans-loader";
import { RulesStrip } from "./rules-strip";

export { CATALOGUE_SUBTITLE, CATALOGUE_TITLE, PAGE_SUBTITLE, PAGE_TITLE, PUBLISHER_PLANS_FEATURE } from "./catalogue-constants";

export type CatalogueAudience = "advertisers" | "publishers";
const AUDIENCES: readonly CatalogueAudience[] = ["publishers", "advertisers"];
const isAudience = (value: string | null): value is CatalogueAudience => AUDIENCES.includes(value as CatalogueAudience);

/**
 * One desk for the plans of both user types — Lot J-C.
 *
 * Two tabs, kept in the URL (`?for=publishers|advertisers`) so a link lands
 * on the right catalogue: the advertiser packages are the Lot D editor as it
 * was, over `GET /packages/catalogue`; the publisher plans are new, over
 * `GET /revenue/plans`. Server shell + client loader, because `api-client`
 * keeps its token in localStorage and cannot run on the server.
 */
export function CatalogueLoader() {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const forParam = params.get("for");
    const audience: CatalogueAudience = isAudience(forParam) ? forParam : "publishers";

    const select = React.useCallback(
        (next: string) => {
            router.replace(next === "publishers" ? pathname : `${pathname}?for=${next}`);
        },
        [pathname, router],
    );

    return (
        <div className="space-y-5">
            <PageHeader
                title={PAGE_TITLE}
                subtitle={PAGE_SUBTITLE}
                actions={
                    <Button variant="outline" className="bg-card" asChild>
                        <Link href="/packages/subscriptions">Publisher subscriptions</Link>
                    </Button>
                }
            />
            <KillSwitchLine />
            <Tabs value={audience} onValueChange={select}>
                <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b bg-transparent p-0">
                    {[
                        { value: "publishers", label: "Publishers" },
                        { value: "advertisers", label: "Advertisers" },
                    ].map((tab) => (
                        <TabsTrigger
                            key={tab.value}
                            value={tab.value}
                            className="rounded-none border-b-2 border-transparent px-0 pb-2.5 pt-1 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                        >
                            {tab.label}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>
            {/* Lot J2: the rules the prices below are sold under, read from
                the platform row, so an operator editing a price sees them. */}
            <RulesStrip audience={audience === "advertisers" ? "advertiser" : "publisher"} />
            {audience === "advertisers" ? <AdvertiserCatalogueLoader /> : <PublisherPlansLoader />}
        </div>
    );
}

/**
 * The header line: whether a publisher can buy a plan in the app right now.
 * The switch is the backend's `revenue.publisher-plans` kill switch, read
 * through the session's flag answers; the editor below works either way.
 */
export function KillSwitchLine() {
    const feature = useFeature(PUBLISHER_PLANS_FEATURE);
    const state =
        feature.enabled === null ? "being checked" : feature.enabled ? "on — publishers can buy a plan in the app" : "off — the app's purchase is dark; the ladder still reads every subscription sold";
    return (
        <p className="text-sm text-muted-foreground" data-testid="kill-switch-line">
            <span className="font-medium text-foreground">Self-service purchase</span> is {state}.{" "}
            <Link href="/settings/flags" className="underline underline-offset-4">
                Feature flags
            </Link>
        </p>
    );
}

/**
 * The advertiser catalogue's data. One read, `GET /packages/catalogue`,
 * re-run after every edit so the cards show what the next sale will actually
 * be priced on rather than what the console thinks it saved.
 */
export function AdvertiserCatalogueLoader() {
    const live = isLive("packages");

    const resource = useApiResource<Catalogue>(`packages:catalogue:${live}`, () =>
        live ? catalogueService.catalogue() : Promise.resolve({ plans: [], addOns: [] }),
    );

    if (!live) {
        return (
            <EmptyState
                icon={PlugZap}
                title="The catalogue reads the API"
                description="This console is running on fixtures, and there are no package fixtures — a plan here is what the next sale is priced on. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend to edit it."
            />
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(catalogue) => <CatalogueView catalogue={catalogue} onChanged={resource.reload} />}
        </ResourceBoundary>
    );
}
