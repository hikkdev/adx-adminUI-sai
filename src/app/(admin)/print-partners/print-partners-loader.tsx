"use client";

import * as React from "react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { usePartyRosterFilters } from "@/components/adx/party-roster-filter-bar";
import { usePartyRoster } from "@/components/adx/party-roster-table";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { DEFAULT_ACCOUNT_STATUS } from "@/services/account-state";
import { printPartnerService, type PrintPartner, type PrintPartnerPage } from "@/services/print-partners";
import type { PartyRosterPage } from "@/services/party-roster";
import { PrintPartnersOffline } from "./print-partners-offline";
import { PrintPartnersView, type SignInFilter } from "./print-partners-view";

type PartnerRosterPage = PartyRosterPage<PrintPartner> & { counts: PrintPartnerPage["counts"] };

/**
 * The roster — `GET /print-partners` on the list contract.
 *
 * 29 Sep 2026 (the party rosters, made uniform): the five filters every
 * party desk takes (search, door, KYC state, city — a shop has no type)
 * are the server's and live in the shared filter state, the text ones
 * settled before they refetch. 2 Oct 2026: the shared Status select, on
 * Active as on every directory, replaces the "On the roster" dropdown and
 * goes out as the route's `active=` facet. Lot H's app state still cuts
 * the rows in hand, as the list route has no facet for it.
 */
export function PrintPartnersLoader() {
    const live = isLive("printPartners");
    /* The Status select starts on Active — the shops on the roster. */
    const filters = usePartyRosterFilters({ status: DEFAULT_ACCOUNT_STATUS });
    /* Lot H: the app state is cut on the rows in hand, not on the server — no facet for it on the list route. */
    const [signIn, setSignIn] = React.useState<SignInFilter>("ALL");

    /* "Applied from the app" is the server's facet (applied=true), so the list and its total are exact on any page. */
    const applied = signIn === "APPLIED";
    const roster = usePartyRoster<PrintPartner, PartnerRosterPage>(`print-partners:roster:${live}:${applied}`, filters, (query, cursor) =>
        live ? printPartnerService.rosterPage(query, cursor, applied) : Promise.resolve({ rows: [], nextCursor: null, total: 0, counts: {} }),
    );
    /* The applications waiting for the desk, counted by the server over the whole roster — what the notice says. */
    const waiting = useApiResource<number>(`print-partners:applications-waiting:${live}`, () =>
        live ? printPartnerService.rosterPage({}, null, true).then((page) => page.total ?? 0) : Promise.resolve(0),
    );

    if (!live) return <PrintPartnersOffline />;

    return (
        <ResourceBoundary resource={roster.resource}>
            {() => (
                <PrintPartnersView
                    view={roster.view}
                    filters={filters}
                    signIn={signIn}
                    onSignInChange={setSignIn}
                    applicationsWaiting={waiting.data ?? 0}
                    onChanged={() => {
                        roster.reload();
                        waiting.reload();
                    }}
                />
            )}
        </ResourceBoundary>
    );
}
