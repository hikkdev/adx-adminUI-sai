"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/adx/page-header";
import { geoReadsApi } from "@/services/geo";
import { CitiesTab } from "./cities-tab";
import { CityDrawer } from "./city-drawer";
import { GEO_TABS, GEO_TAB_LABEL, cityFacetsOf, geoQuery, tabOf, type GeoTab } from "./geographies-facets";
import { GeographiesOffline } from "./geographies-offline";
import { MapTab } from "./map-tab";
import { OverviewTab } from "./overview-tab";
import { StatesTab } from "./states-tab";

/**
 * Settings › Geographies — the rollout desk (V-C, over Lot V).
 *
 * The owner: "the geographical section should be free of any
 * restrictions. Instead there should be better control features so we can
 * select what city to go into and launch ADX or what city to pull our
 * business out of, what city to gather our listing from." So the 44-row
 * table with its open / closed switch is gone; the catalogue is the country
 * and control is a stage per city and six switches.
 *
 * Four tabs, the tab in the URL: Overview (the tiles per stage, the states
 * with activity, the seed, the three settings), Map (every pin coloured by
 * stage over the maps seam), Cities (the list contract with its facets and
 * the bulk stage change), States (counts per stage, seed a state, launch
 * its capitals). A pin or a row opens the city drawer; the same panel is
 * the page at `/settings/geographies/[slug]`. Each tab reads its own
 * routes; the shell only routes.
 */
export function GeographiesLoader() {
    const live = geoReadsApi();
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const tab = tabOf(params);
    const [drawerSlug, setDrawerSlug] = React.useState<string | null>(null);
    /* Bumped when a move lands in the drawer, so the open tab refetches. */
    const [nonce, setNonce] = React.useState(0);

    const setTab = (next: GeoTab) => {
        const qs = geoQuery(next, cityFacetsOf(params));
        router.replace(qs ? `${pathname}?${qs}` : pathname);
    };

    if (!live) {
        return (
            <div className="space-y-5">
                <PageHeader title="Geographies" subtitle="Which cities ADX is in, at what stage, with which functions on." />
                <GeographiesOffline />
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <PageHeader
                title="Geographies"
                subtitle="Every town in India is in the catalogue; a stage per city and six switches decide what ADX does there. Nothing here is a deploy."
            />
            <Tabs value={tab} onValueChange={(value) => setTab(value as GeoTab)}>
                <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b bg-transparent p-0">
                    {GEO_TABS.map((value) => (
                        <TabsTrigger
                            key={value}
                            value={value}
                            className="rounded-none border-b-2 border-transparent px-0 pb-2.5 pt-1 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                        >
                            {GEO_TAB_LABEL[value]}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>

            {tab === "overview" && <OverviewTab nonce={nonce} />}
            {tab === "map" && <MapTab nonce={nonce} onOpenCity={setDrawerSlug} />}
            {tab === "cities" && <CitiesTab nonce={nonce} onOpenCity={setDrawerSlug} />}
            {tab === "states" && <StatesTab nonce={nonce} />}

            <CityDrawer
                slug={drawerSlug}
                onOpenChange={(open) => {
                    if (!open) setDrawerSlug(null);
                }}
                onChanged={() => setNonce((n) => n + 1)}
            />
        </div>
    );
}
