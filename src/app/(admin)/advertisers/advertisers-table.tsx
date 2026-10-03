"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Megaphone, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { partyRosterColumns, type PartyRosterSpec, type RosterRowAction } from "@/components/adx/party-roster-columns";
import { PartyRosterFilterBar, type PartyRosterFilterSpec, type PartyRosterFilterState } from "@/components/adx/party-roster-filter-bar";
import { kycReviewHref, useRosterSuspension, type SuspensionRowFacts } from "@/components/adx/party-roster-row-actions";
import { PartyRosterTable, type PartyRosterView } from "@/components/adx/party-roster-table";
import { deriveKycState } from "@/services/kyc-state";
import { accountStatusOptions } from "@/services/account-state";
import { ONBOARDING_DOOR_OPTIONS, rosterFiltersActive } from "@/services/party-roster";
import { ADVERTISER_TYPE_LABELS, onboardingLine, type Advertiser, type AdvertiserType } from "@/types";
import { CreateAdvertiserDialog } from "./create-advertiser-dialog";

interface AdvertisersTableProps {
    view: PartyRosterView<Advertiser>;
    /** Re-read after an account is opened from the desk. */
    onChanged: () => void;
    filters: PartyRosterFilterState;
}

/** The row's KYC state — the summary the roster read carries, else derived from the party's own `kycStatus` (a read one release behind). */
const kycStateOfRow = (row: Advertiser) => row.kyc?.state ?? deriveKycState(null, row.kycStatus);

/** The bar's advertiser half: the QR-14 doors and the four advertiser types. */
export const ADVERTISER_FILTER_SPEC: PartyRosterFilterSpec = {
    searchPlaceholder: "Search name, ID, phone, email, city",
    doors: ONBOARDING_DOOR_OPTIONS,
    types: (Object.keys(ADVERTISER_TYPE_LABELS) as AdvertiserType[]).map((type) => ({ value: type, label: ADVERTISER_TYPE_LABELS[type] })),
    idPrefix: "advertisers",
    statuses: accountStatusOptions(false),
};

/**
 * The advertiser roster — 29 Sep 2026, on the shared party layout
 * (`party-roster-columns`): Name · Contact · Type · City · KYC status ·
 * Activity (the campaigns, counted on the roster read since the campaign
 * table exists) · Joined · Onboarded, and the shared filter bar. The row
 * menu is the shared one: View details, Review KYC, then Suspend… or
 * Reinstate.
 */
export function advertiserRosterSpec(
    open: (row: Advertiser) => void,
    reviewKyc: (row: Advertiser) => void,
    statusActions?: (row: Advertiser) => RosterRowAction[],
): PartyRosterSpec<Advertiser> {
    return {
        idOwner: "ADVERTISER",
        name: (row) => row.name,
        displayId: (row) => row.displayId,
        mobile: (row) => row.contact || null,
        email: (row) => row.email,
        type: (row) => ADVERTISER_TYPE_LABELS[row.type] ?? row.type,
        city: (row) => row.city,
        kycState: kycStateOfRow,
        suspensionScopes: (row) => row.suspensionScopes,
        accountState: (row) => row.accountState,
        activity: { count: (row) => row.campaignCount ?? null, noun: ["campaign", "campaigns"], title: "Campaigns, every status" },
        joinedAt: (row) => row.joinedAt,
        // QR-14/15: the door the account came through, and who opened it.
        onboarded: (row) => onboardingLine(row.onboarding),
        open,
        reviewKyc,
        statusActions,
    };
}

/** The advertiser row as the suspension items read it. */
export const advertiserSuspensionFacts = (row: Advertiser): SuspensionRowFacts => ({
    id: row.id,
    name: row.name,
    scopes: row.suspensionScopes,
    accountState: row.accountState,
});

/** "Review KYC" for an advertiser row: the case (`/kyc/advertisers/<profileId>`) when there is one, else the queue searched for it. */
export const advertiserKycHref = (row: Advertiser): string =>
    kycReviewHref("ADVERTISER", { id: row.id, kycId: row.kyc?.kycId, search: row.displayId ?? row.name });

export function AdvertisersTable({ view, onChanged, filters }: AdvertisersTableProps) {
    const router = useRouter();
    const [creating, setCreating] = React.useState(false);
    const suspension = useRosterSuspension("ADVERTISER", "ADVERTISER", onChanged);
    const { statusActions } = suspension;

    const columns = React.useMemo(
        () =>
            partyRosterColumns(
                advertiserRosterSpec(
                    (row) => router.push(`/advertisers/${row.id}`),
                    (row) => router.push(advertiserKycHref(row)),
                    (row) => statusActions(advertiserSuspensionFacts(row)),
                ),
            ),
        [router, statusActions],
    );

    const filtered = rosterFiltersActive(filters.filters);

    return (
        <div className="space-y-5">
            <PageHeader
                title="Advertisers"
                subtitle={view.total === null ? undefined : filtered ? `${view.total} match these filters` : `${view.total} on the marketplace`}
                actions={
                    /* Wired to `POST /advertisers { onBehalf: true }` — the
                       same route the field app uses to open an account at
                       the door — rather than the toast that used to say
                       advertisers join elsewhere. */
                    <Button onClick={() => setCreating(true)}>
                        <Plus className="mr-1.5 size-4" />
                        Onboard an advertiser
                    </Button>
                }
            />
            <CreateAdvertiserDialog open={creating} onOpenChange={setCreating} onCreated={onChanged} />
            {suspension.dialogs}
            <PartyRosterTable
                columns={columns}
                view={view}
                noun="advertiser"
                filterBar={<PartyRosterFilterBar spec={ADVERTISER_FILTER_SPEC} state={filters} refreshing={view.refreshing} statusCounts={view.statusCounts} />}
                onRowClick={(advertiser) => router.push(`/advertisers/${advertiser.id}`)}
                getRowId={(advertiser) => advertiser.id}
                emptyState={
                    filtered ? (
                        <EmptyState icon={Megaphone} title="No advertiser matches" description="Nobody on the roster matches these filters." action={<Button variant="outline" className="bg-card" onClick={filters.clear}>Clear filters</Button>} />
                    ) : (
                        <EmptyState
                            icon={Megaphone}
                            title="No advertisers yet"
                            description="Advertisers appear here once they sign up, an agent onboards them, or the desk opens an account."
                            action={
                                <Button onClick={() => setCreating(true)}>
                                    <Plus className="mr-1.5 size-4" />
                                    Onboard an advertiser
                                </Button>
                            }
                        />
                    )
                }
            />
        </div>
    );
}
