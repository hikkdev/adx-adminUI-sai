"use client";

import * as React from "react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { EMPTY_CITY_FACET, cityFacetValue, type CityFacet } from "@/lib/city-facet";
import { printPartnerService, type PrintPartnerPage } from "@/services/print-partners";
import { PrintPartnersOffline } from "./print-partners-offline";
import { PrintPartnersView, type ActiveFilter, type SignInFilter } from "./print-partners-view";

/**
 * The roster — `GET /print-partners` on the list contract.
 *
 * The search, the city and the active facet are all part of the request —
 * the server cuts and counts them — so they live in the key and refetch,
 * the text ones debounced so a typed word is one call rather than five.
 * Lot X-B: the city facet is the shared combobox; a catalogued pick sends
 * the city's slug (the key is the identity — rows keyed to it, whatever
 * they were typed as), and free text goes as typed for the null-keyed rows.
 */
export function PrintPartnersLoader() {
    const live = isLive("printPartners");
    const [q, setQ] = React.useState("");
    const [city, setCity] = React.useState<CityFacet>(EMPTY_CITY_FACET);
    const [active, setActive] = React.useState<ActiveFilter>("ACTIVE");
    /* Lot H: the app state is cut on the page in hand, not on the server — no facet for it on the list route. */
    const [signIn, setSignIn] = React.useState<SignInFilter>("ALL");
    const qQuery = useDebounced(q.trim(), 300);
    /* Lot X-B: a catalogued pick sends its slug at once; free text is debounced and sent as typed (the server takes either). */
    const cityQuery = useDebounced(cityFacetValue(city), 300);

    const resource = useApiResource<PrintPartnerPage>(
        `print-partners:${qQuery}:${cityQuery}:${active}:${live}`,
        () =>
            live
                ? printPartnerService.list({
                      q: qQuery || undefined,
                      city: cityQuery || undefined,
                      active: active === "ALL" ? undefined : active === "ACTIVE",
                      pageSize: 100,
                  })
                : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 100, counts: {} })
    );

    if (!live) return <PrintPartnersOffline />;

    return (
        <ResourceBoundary resource={resource}>
            {(page) => (
                <PrintPartnersView
                    page={page}
                    q={q}
                    onQChange={setQ}
                    city={city}
                    onCityChange={setCity}
                    active={active}
                    onActiveChange={setActive}
                    signIn={signIn}
                    onSignInChange={setSignIn}
                    onChanged={resource.reload}
                />
            )}
        </ResourceBoundary>
    );
}
