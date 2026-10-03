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
import { autoEscalationHours, kycService, PUBLISHER_DESK_FACTS, PUBLISHER_KYC_FIELDS } from "@/services/kyc";
import { kycQueueSubtitle, kycStateChips, type KycStateChip } from "@/services/kyc-state";
import { idLine } from "@/services/identifiers";
import { onlineCheckMeta } from "@/services/verification";
import type { KycCase } from "@/types";
import { kycQueueColumns } from "./_shared/kyc-queue-columns";
import { KycRowActions } from "./_shared/kyc-row-actions";
import { ShowInactiveSwitch } from "./_shared/show-inactive";
import { ReadPendingButton } from "./_shared/read-pending-button";
import { RecordAtDeskDialog } from "./_shared/record-at-desk-dialog";
import { useReviewerDealing } from "./_shared/reviewer-dealing";
import type { LoadedQueue } from "./kyc-queue-loader";

interface KycQueueViewProps {
    loaded: LoadedQueue;
    chip: KycStateChip;
    onChip: (chip: KycStateChip) => void;
    /** 2 Oct 2026: the "Show inactive accounts" switch, kept in the URL by the loader. */
    showInactive?: boolean;
    onShowInactive?: (next: boolean) => void;
    onChanged: () => void;
}

/**
 * The publisher KYC queue — the frame's table on the server's facets, and
 * since 2 Oct 2026 the layout all five KYC tabs share (`kycQueueColumns`,
 * `useReviewerDealing`, `ReadPendingButton`).
 *
 * N3-C (the owner, 14 Sep 2026): the queue lists PARTIES. Every publisher
 * is on it from the moment the account exists, in one of six states the
 * server derives, and the chips are those states (plus Escalated) with the
 * server's counts, the chip kept in the URL. A publisher with no record is
 * drawn from the party alone — name, ids, contact, when they arrived — with
 * a state pill; every row offers the actions its state allows (the one-click
 * Digio request behind `kyc.edit`, the manual ask, Record at the desk,
 * Open the case). The header counts what is waiting on the party, what is
 * under review and what is past the SLA.
 *
 * "Assign reviewers" deals every open, unassigned case across the console's
 * admins in turn — one bulk `POST /publishers/kyc-queue/assign` per admin;
 * "Assign to me" on a selection is the same call with `me`. Assignment is a
 * filter, not ownership: any admin may still decide any case, and only a
 * row with a record can be assigned at all.
 *
 * Lot G (Q127/142): an escalated row carries the pill beside its state with
 * the source and who it went to (G11-1: named by the row's own
 * `escalatedTo`), and the SLA column says when the nightly sweep would
 * escalate the case on its own. Lot N: the "Requested / recorded by" column
 * says when the desk asked, who and over which channel, and who put the
 * documents on the row.
 */
export function KycQueueView({ loaded, chip, onChip, showInactive = false, onShowInactive, onChanged }: KycQueueViewProps) {
    const router = useRouter();
    const initialSearch = useQueueSearch();
    const { user } = useAuth();
    const { everything, visible, escalationSlaMultiplier } = loaded;
    const cases = visible.cases;
    const autoEscalateAt = autoEscalationHours(everything.slaHours, escalationSlaMultiplier);
    const [recording, setRecording] = React.useState<KycCase | null>(null);

    /* One bulk `POST /publishers/kyc-queue/assign` per admin. */
    const reviewers = useReviewerDealing({
        assign: async (ids, adminUserId) => (await kycService.assignMany(ids, adminUserId)).assigned,
        onChanged,
        plural: "publishers",
    });
    const openUnassigned = everything.cases.filter(
        (kycCase) => kycCase.kycId && (kycCase.kycStatus === "PENDING" || kycCase.kycStatus === "NEEDS_INFO") && !kycCase.assignedToId
    );

    const columns = React.useMemo(
        () =>
            kycQueueColumns<KycCase>(
                {
                    noun: "Publisher",
                    name: (row) => row.applicant,
                    line: (row) => [row.displayId, row.city !== "—" ? row.city : null, row.mobile].filter(Boolean).join(" · "),
                    noAppAccount: (row) => row.userId === null,
                    partyColumns: [
                        {
                            id: "entity-type",
                            accessorKey: "businessType",
                            header: "Entity type",
                            cell: ({ row }) => <span className="text-muted-foreground">{row.original.businessType}</span>,
                        },
                        {
                            id: "brought-in-by",
                            header: "Brought in by",
                            cell: ({ row }) =>
                                row.original.selfOnboarded ? (
                                    <StatusBadge status={{ label: "Self-onboarded", tone: "info" }} />
                                ) : row.original.agent ? (
                                    <span className="text-muted-foreground">
                                        {[row.original.agent.name ?? "An agent", idLine("AGENT", row.original.agent.displayId)].filter(Boolean).join(" · ")}
                                    </span>
                                ) : (
                                    <span className="text-muted-foreground">—</span>
                                ),
                        },
                    ],
                    method: (row) =>
                        !row.kycId ? (
                            <span className="text-muted-foreground">—</span>
                        ) : row.digio ? (
                            // Cashfree Phase 2: the provider (Digio or Cashfree) and its answer — PROVIDER_FAILED reads "Digio couldn't be reached".
                            <StatusBadge status={onlineCheckMeta(row.digio.provider, row.digio.status)} />
                        ) : (
                            <span className="text-muted-foreground">{row.documents.length} uploaded</span>
                        ),
                    submitted: (row) => (row.submittedAt !== "—" ? row.submittedAt : null),
                    arrivedAt: (row) => row.createdAt,
                    request: (row) => row.request,
                    recorded: (row) => row.recorded,
                    clock: (row) => row,
                    autoEscalateAt,
                    assignee: (row) => ({ id: row.assignedToId, name: row.assignedTo?.name }),
                    hasRecord: (row) => Boolean(row.kycId),
                    state: (row) => row.state,
                    escalation: (row) => row.escalation,
                    accountState: (row) => row.accountState,
                    actions: (row) => (
                        <KycRowActions
                            state={row.state}
                            party={row.applicant}
                            hasAccount={row.userId !== null}
                            contact={row.mobile}
                            request={row.request}
                            caseHref={row.kycId ? `/kyc/${row.publisherId}` : null}
                            onDigio={(entityType) => kycService.requestDigio(row.publisherId, entityType)}
                            onRequest={(channel, note, entityType) => kycService.request(row.publisherId, channel, note, entityType)}
                            onRecord={() => setRecording(row)}
                            onChanged={onChanged}
                            accountState={row.accountState}
                            className="justify-end"
                        />
                    ),
                },
                user?.id ?? null
            ),
        [user, autoEscalateAt, onChanged]
    );

    return (
        <div className="space-y-5">
            <PageHeader
                title="Publisher KYC"
                subtitle={kycQueueSubtitle(everything.counts, everything)}
                actions={
                    <>
                        <ReadPendingButton cases={cases} disabled={reviewers.dealing} />
                        {reviewers.assignReviewersButton(openUnassigned.map((kycCase) => kycCase.publisherId))}
                    </>
                }
            />

            <FilterChips<KycStateChip> value={chip} onChange={onChip} chips={kycStateChips(everything.counts, everything.total)} />

            <DataTable
                columns={columns}
                data={cases}
                searchPlaceholder="Search publishers, display id, mobile, PAN, GSTIN"
                initialSearch={initialSearch}
                toolbar={onShowInactive && <ShowInactiveSwitch checked={showInactive} onCheckedChange={onShowInactive} />}
                initialPageSize={10}
                onRowClick={(kycCase) => kycCase.kycId && router.push(`/kyc/${kycCase.publisherId}`)}
                emptyState={
                    <EmptyState
                        icon={ClipboardList}
                        title={chip === "all" ? "Nobody on the queue" : "Nobody under this chip"}
                        description={
                            chip === "all"
                                ? "Every publisher is here from the moment their account exists, until their KYC is verified."
                                : "Choose another state, or All."
                        }
                    />
                }
                bulkActions={(rows, clear) => reviewers.bulkActions(rows.filter((row) => row.kycId).map((row) => row.publisherId), clear)}
            />

            {reviewers.dialog}

            {recording && (
                <RecordAtDeskDialog
                    key={recording.publisherId}
                    open
                    onOpenChange={(open) => !open && setRecording(null)}
                    party={recording.applicant}
                    userId={recording.userId}
                    purpose="KYC"
                    tiles={PUBLISHER_KYC_FIELDS}
                    facts={PUBLISHER_DESK_FACTS}
                    initial={recording.kycId ? { documents: Object.fromEntries(recording.documents.map((doc) => [doc.field, doc.url])) } : undefined}
                    needsInfo={recording.kycStatus === "NEEDS_INFO"}
                    onSubmit={async (body) => {
                        await kycService.recordAtDesk(recording.publisherId, body);
                        return { caseHref: `/kyc/${recording.publisherId}` };
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
