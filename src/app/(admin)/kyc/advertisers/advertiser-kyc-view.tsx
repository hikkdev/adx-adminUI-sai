"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueueSearch } from "@/app/(admin)/kyc/_shared/use-queue-search";
import { ClipboardList } from "lucide-react";
import { DataTable } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { FilterChips } from "@/components/adx/filter-chips";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { ADVERTISER_DESK_FACTS, advertiserDeskTiles, advertiserKycService } from "@/services/advertiser-kyc";
import { kycQueueSubtitle, kycStateChips, type KycStateChip } from "@/services/kyc-state";
import { onlineCheckMeta } from "@/services/verification";
import { ADVERTISER_KYC_TYPE_META, type AdvertiserKycCase } from "@/types";
import { kycQueueColumns } from "../_shared/kyc-queue-columns";
import { KycRowActions } from "../_shared/kyc-row-actions";
import { ShowInactiveSwitch } from "../_shared/show-inactive";
import { ReadPendingButton } from "../_shared/read-pending-button";
import { RecordAtDeskDialog } from "../_shared/record-at-desk-dialog";
import { useReviewerDealing } from "../_shared/reviewer-dealing";
import type { LoadedAdvertiserQueue } from "./advertiser-kyc-loader";

interface AdvertiserKycViewProps {
    loaded: LoadedAdvertiserQueue;
    chip: KycStateChip;
    onChip: (chip: KycStateChip) => void;
    /** 2 Oct 2026: the "Show inactive accounts" switch, kept in the URL by the loader. */
    showInactive?: boolean;
    onShowInactive?: (next: boolean) => void;
    onChanged: () => void;
}

/** The advertiser's case page — keyed by the advertiser PROFILE id, which every desk route accepts as `:id`. */
export function advertiserCaseHref(row: Pick<AdvertiserKycCase, "profileId" | "id">): string {
    return `/kyc/advertisers/${row.profileId ?? row.id}`;
}

/**
 * The advertiser KYC tab — since 2 Oct 2026 the publisher queue's layout
 * (the owner: "why do they look so different?"): the summary line under the
 * title where the three number cards were, the state chips, the one table,
 * and the case on its own page (`/kyc/advertisers/:profileId`) instead of
 * a pane beside the list.
 *
 * N3-B / N3-C (the owner, 14 Sep 2026): the queue lists PARTIES — every
 * Advertiser profile from the moment it exists, in one of six states — and
 * the chips are those states (plus Escalated) with the server's counts,
 * the chip in the URL. A profile with no record (or one only asked for) is
 * drawn from the party alone, with the actions its state allows — the
 * one-click Digio request (`POST /advertiser-kyc/:id/request` over the
 * PROFILE id, behind `kyc.edit`), the manual ask, Record at the desk
 * (`PUT /advertiser-kyc/:id` over the profile id, which opens the record).
 * A console-created advertiser with no app account is on the queue like any
 * other; the request dialog says the Digio link goes to the profile's
 * contact and no ADX notice is sent.
 *
 * Assignment is a filter, not ownership. There is no bulk route on this
 * desk, so "Assign reviewers", "Assign to me" over a selection and
 * "Distribute across reviewers" are one `PATCH /advertiser-kyc/:id/assign`
 * per case — and only a row with a record can be assigned at all.
 */
export function AdvertiserKycView({ loaded, chip, onChip, showInactive = false, onShowInactive, onChanged }: AdvertiserKycViewProps) {
    const router = useRouter();
    const initialSearch = useQueueSearch();
    const { user } = useAuth();
    const { everything, visible } = loaded;
    const cases = visible.cases;
    const [recording, setRecording] = React.useState<AdvertiserKycCase | null>(null);

    const reviewers = useReviewerDealing({
        assign: async (ids, adminUserId) => {
            for (const id of ids) await advertiserKycService.assign(id, adminUserId);
            return ids.length;
        },
        onChanged,
        plural: "advertisers",
    });
    const openUnassigned = everything.cases.filter((item) => item.kycId && (item.status === "PENDING" || item.status === "NEEDS_INFO") && !item.assignedToId);

    const columns = React.useMemo(
        () =>
            kycQueueColumns<AdvertiserKycCase>(
                {
                    noun: "Advertiser",
                    name: (row) => row.advertiser,
                    line: (row) => [row.displayId, row.city, row.contact !== "—" ? row.contact : row.email !== "—" ? row.email : null].filter(Boolean).join(" · "),
                    noAppAccount: (row) => row.userId === null,
                    partyColumns: [
                        {
                            id: "entity-type",
                            accessorFn: (row) => ADVERTISER_KYC_TYPE_META[row.kycType],
                            header: "Entity type",
                            cell: ({ row }) => <span className="text-muted-foreground">{ADVERTISER_KYC_TYPE_META[row.original.kycType]}</span>,
                        },
                    ],
                    method: (row) =>
                        !row.kycId ? (
                            <span className="text-muted-foreground">—</span>
                        ) : row.digio ? (
                            // Cashfree Phase 2: the provider (Digio or Cashfree) and its answer — PROVIDER_FAILED reads "Digio couldn't be reached".
                            <StatusBadge status={onlineCheckMeta(row.digio.provider, row.digio.status)} />
                        ) : (
                            <span className="text-muted-foreground">{row.documents.filter((item) => item.url).length} uploaded</span>
                        ),
                    /* With nothing submitted the row's `submittedAt` stands in with the arrival; the state says which. */
                    submitted: (row) => (row.kycId && row.state !== "REQUESTED" && row.state !== "AWAITING_DOCUMENTS" && row.submittedAt ? formatDate(row.submittedAt) : null),
                    arrivedAt: (row) => row.createdAt,
                    request: (row) => row.request,
                    recorded: (row) => row.recorded,
                    clock: (row) => row,
                    assignee: (row) => ({ id: row.assignedToId, name: row.assignedTo?.name }),
                    hasRecord: (row) => Boolean(row.kycId),
                    state: (row) => row.state,
                    escalation: (row) => row.escalation,
                    accountState: (row) => row.accountState,
                    actions: (row) => (
                        <KycRowActions
                            state={row.state}
                            party={row.advertiser}
                            hasAccount={row.userId !== null}
                            contact={row.contact !== "—" ? row.contact : row.email !== "—" ? row.email : null}
                            request={row.request}
                            caseHref={row.kycId ? advertiserCaseHref(row) : null}
                            onDigio={(entityType) => advertiserKycService.requestDigio(row.profileId ?? row.id, entityType)}
                            onRequest={(channel, note, entityType) => advertiserKycService.request(row.profileId ?? row.id, channel, note, entityType)}
                            onRecord={() => setRecording(row)}
                            onChanged={onChanged}
                            accountState={row.accountState}
                            className="justify-end"
                        />
                    ),
                },
                user?.id ?? null
            ),
        [user, onChanged]
    );

    return (
        <div className="space-y-5">
            <PageHeader
                title="Advertiser KYC"
                subtitle={kycQueueSubtitle(everything.counts, everything)}
                actions={
                    <>
                        <ReadPendingButton cases={cases} disabled={reviewers.dealing} />
                        {reviewers.assignReviewersButton(openUnassigned.map((item) => item.id))}
                    </>
                }
            />

            <FilterChips<KycStateChip> value={chip} onChange={onChip} chips={kycStateChips(everything.counts, everything.total)} />

            <DataTable
                columns={columns}
                data={cases}
                searchPlaceholder="Search advertisers, display id, contact, email"
                initialSearch={initialSearch}
                toolbar={onShowInactive && <ShowInactiveSwitch checked={showInactive} onCheckedChange={onShowInactive} />}
                initialPageSize={10}
                onRowClick={(item) => item.kycId && router.push(advertiserCaseHref(item))}
                emptyState={
                    <EmptyState
                        icon={ClipboardList}
                        title={chip === "all" ? "Nobody on the queue" : "Nobody under this chip"}
                        description={chip === "all" ? "Every advertiser is here from the moment their profile exists, until their KYC is verified." : "Choose another state, or All."}
                    />
                }
                bulkActions={(rows, clear) => reviewers.bulkActions(rows.filter((row) => row.kycId).map((row) => row.id), clear)}
            />

            {reviewers.dialog}

            {recording && (
                <RecordAtDeskDialog
                    key={recording.id}
                    open
                    onOpenChange={(open) => !open && setRecording(null)}
                    party={recording.advertiser}
                    userId={recording.userId}
                    purpose="ADVERTISER_KYC"
                    tiles={advertiserDeskTiles(recording.kycType)}
                    facts={ADVERTISER_DESK_FACTS}
                    initial={
                        recording.kycId
                            ? {
                                  documents: Object.fromEntries(recording.documents.filter((item) => item.url).map((item) => [item.field, item.url ?? undefined])),
                                  panNumber: recording.panNumber ?? "",
                              }
                            : undefined
                    }
                    needsInfo={recording.status === "NEEDS_INFO"}
                    onSubmit={async (body) => {
                        // N3-B: the desk records over the PROFILE id; with no record yet the PUT opens one, typed by the profile's entity type.
                        await advertiserKycService.recordAtDesk(recording.profileId ?? recording.id, recording.kycId ? body : { ...body, kycType: recording.kycType });
                        return { caseHref: advertiserCaseHref(recording) };
                    }}
                    onRecorded={(href) => {
                        setRecording(null);
                        onChanged();
                        router.push(href);
                    }}
                />
            )}
        </div>
    );
}
