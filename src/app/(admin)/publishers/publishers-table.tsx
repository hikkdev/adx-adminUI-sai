"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { partyRosterColumns, type PartyRosterSpec, type RosterRowAction } from "@/components/adx/party-roster-columns";
import { PartyRosterFilterBar, type PartyRosterFilterSpec, type PartyRosterFilterState } from "@/components/adx/party-roster-filter-bar";
import { kycReviewHref, useRosterSuspension, type SuspensionRowFacts } from "@/components/adx/party-roster-row-actions";
import { PartyRosterTable, type PartyRosterView } from "@/components/adx/party-roster-table";
import { accountStatusOptions } from "@/services/account-state";
import { ONBOARDING_DOOR_OPTIONS, rosterFiltersActive } from "@/services/party-roster";
import { PUBLISHER_TYPES, PUBLISHER_TYPE_LABEL } from "@/services/publishers";
import type { RosterPublisher } from "@/services/supply";
import { onboardingLine } from "@/types";
import { CreatePublisherDialog } from "./create-publisher-dialog";

interface PublishersTableProps {
    view: PartyRosterView<RosterPublisher>;
    filters: PartyRosterFilterState;
    onChanged: () => void;
}

/** `PublisherType` labelled; a value the enum grows reads as itself. */
const publisherTypeLabel = (type: string | null): string | null =>
    type ? ((PUBLISHER_TYPE_LABEL as Partial<Record<string, string>>)[type] ?? type) : null;

/** The bar's publisher half: the QR-14 doors and the four publisher types. */
export const PUBLISHER_FILTER_SPEC: PartyRosterFilterSpec = {
    searchPlaceholder: "Search name, ID, phone, email, city",
    doors: ONBOARDING_DOOR_OPTIONS,
    types: PUBLISHER_TYPES.map((type) => ({ value: type, label: PUBLISHER_TYPE_LABEL[type] })),
    idPrefix: "publishers",
    statuses: accountStatusOptions(false),
};

/**
 * The publisher roster — 29 Sep 2026, on the shared party layout
 * (`party-roster-columns`): Name · Contact · Type · City · KYC status ·
 * Activity (the spots) · Joined · Onboarded, and the shared filter bar.
 * The row menu is the shared one: View details, Review KYC, then Suspend…
 * or Reinstate.
 */
export function publisherRosterSpec(
    open: (row: RosterPublisher) => void,
    reviewKyc: (row: RosterPublisher) => void,
    statusActions?: (row: RosterPublisher) => RosterRowAction[],
): PartyRosterSpec<RosterPublisher> {
    return {
        idOwner: "PUBLISHER",
        name: (row) => row.name,
        displayId: (row) => row.displayId,
        mobile: (row) => row.mobile,
        email: (row) => row.email,
        type: (row) => publisherTypeLabel(row.type),
        city: (row) => row.city,
        kycState: (row) => row.kyc.state,
        suspensionScopes: (row) => row.suspensionScopes,
        accountState: (row) => row.accountState,
        activity: { count: (row) => row.listingCount, noun: ["spot", "spots"], title: "Spots listed" },
        joinedAt: (row) => row.createdAt,
        // QR-14: the door and the person — "Desk · Asha Rao (Ops manager)"; a row
        // older than the stamp falls back to what the agent link says.
        onboarded: (row) => (row.onboarding?.via ? onboardingLine(row.onboarding) : row.onboardedByAgent ? "Onboarded by agent" : "Self-serve"),
        open,
        reviewKyc,
        statusActions,
    };
}

/** The publisher row as the suspension items read it. */
export const publisherSuspensionFacts = (row: RosterPublisher): SuspensionRowFacts => ({
    id: row.id,
    name: row.name,
    scopes: row.suspensionScopes,
    accountState: row.accountState,
});

/** "Review KYC" for a publisher row: the case when there is one, else the queue searched for it. */
export const publisherKycHref = (row: RosterPublisher): string =>
    kycReviewHref("PUBLISHER", { id: row.id, kycId: row.kyc.kycId, search: row.displayId ?? row.name });

export function PublishersTable({ view, filters, onChanged }: PublishersTableProps) {
    const router = useRouter();
    const [createOpen, setCreateOpen] = React.useState(false);
    const suspension = useRosterSuspension("PUBLISHER", "PUBLISHER", onChanged);
    const { statusActions } = suspension;

    const columns = React.useMemo(
        () =>
            partyRosterColumns(
                publisherRosterSpec(
                    (row) => router.push(`/publishers/${row.id}`),
                    (row) => router.push(publisherKycHref(row)),
                    (row) => statusActions(publisherSuspensionFacts(row)),
                ),
            ),
        [router, statusActions],
    );

    const filtered = rosterFiltersActive(filters.filters);

    return (
        <div className="space-y-5">
            <PageHeader
                title="Publishers"
                subtitle={view.total === null ? undefined : filtered ? `${view.total} match these filters` : `${view.total} on the marketplace`}
                actions={
                    /* 2 Oct 2026: the one primary add button, as on every directory — the CSV import is the section's Import tab. */
                    <Button onClick={() => setCreateOpen(true)}>
                        <Plus className="mr-1.5 size-4" />
                        Onboard a publisher
                    </Button>
                }
            />

            <PartyRosterTable
                columns={columns}
                view={view}
                noun="publisher"
                filterBar={<PartyRosterFilterBar spec={PUBLISHER_FILTER_SPEC} state={filters} refreshing={view.refreshing} statusCounts={view.statusCounts} />}
                onRowClick={(publisher) => router.push(`/publishers/${publisher.id}`)}
                getRowId={(publisher) => publisher.id}
                emptyState={
                    filtered ? (
                        <EmptyState icon={Tag} title="No publisher matches" description="Nobody on the roster matches these filters." action={<Button variant="outline" className="bg-card" onClick={filters.clear}>Clear filters</Button>} />
                    ) : (
                        <EmptyState
                            icon={Tag}
                            title="No publishers yet"
                            description="Publishers appear here once they sign up or an agent onboards them."
                            action={
                                <Button onClick={() => setCreateOpen(true)}>
                                    <Plus className="mr-1.5 size-4" />
                                    Onboard a publisher
                                </Button>
                            }
                        />
                    )
                }
            />

            {suspension.dialogs}

            <CreatePublisherDialog
                open={createOpen}
                onOpenChange={(open) => {
                    setCreateOpen(open);
                    if (!open) onChanged();
                }}
            />
        </div>
    );
}
