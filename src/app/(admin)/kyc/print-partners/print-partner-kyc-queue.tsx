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
import { kycQueueSubtitle, kycStateChips, type KycStateChip } from "@/services/kyc-state";
import { PARTNER_DESK_FACTS, printPartnerKycService, PRINT_PARTNER_KYC_FIELDS, type PrintPartnerKycCase } from "@/services/print-partner-kyc";
import { onlineCheckMeta } from "@/services/verification";
import { kycQueueColumns } from "../_shared/kyc-queue-columns";
import { KycRowActions } from "../_shared/kyc-row-actions";
import { ShowInactiveSwitch } from "../_shared/show-inactive";
import { ReadPendingButton } from "../_shared/read-pending-button";
import { RecordAtDeskDialog } from "../_shared/record-at-desk-dialog";
import { useReviewerDealing } from "../_shared/reviewer-dealing";
import type { LoadedPartnerQueue } from "./print-partner-kyc-loader";

interface PrintPartnerKycQueueViewProps {
    loaded: LoadedPartnerQueue;
    chip: KycStateChip;
    onChip: (chip: KycStateChip) => void;
    /** 2 Oct 2026: the "Show inactive accounts" switch, kept in the URL by the loader. */
    showInactive?: boolean;
    onShowInactive?: (next: boolean) => void;
    onChanged: () => void;
}

/**
 * The print partner KYC queue — Lot N, on the publisher queue's layout
 * (2 Oct 2026: one layout for the five KYC tabs).
 *
 * N3-C: the queue lists PARTIES — every partner from the moment it is
 * created, in one of six states — and the chips are those states (plus
 * Escalated) with the server's counts, the chip in the URL. A partner with
 * no record is drawn from the party alone with a state pill; every row
 * offers the actions its state allows (the one-click Digio request behind
 * `kyc.edit`, the manual ask, Record at the desk, Open the case).
 *
 * Assignment is a filter, not ownership. There is no bulk route on this
 * desk, so "Assign to me" over a selection and "Distribute across
 * reviewers" are one `PATCH /print-partner-kyc/:id/assign` per case — and
 * only a row with a record can be assigned at all.
 */
export function PrintPartnerKycQueueView({ loaded, chip, onChip, showInactive = false, onShowInactive, onChanged }: PrintPartnerKycQueueViewProps) {
    const router = useRouter();
    const initialSearch = useQueueSearch();
    const { user } = useAuth();
    const { everything, visible } = loaded;
    const cases = visible.cases;
    const [recording, setRecording] = React.useState<PrintPartnerKycCase | null>(null);

    const reviewers = useReviewerDealing({
        assign: async (ids, adminUserId) => {
            for (const id of ids) await printPartnerKycService.assign(id, adminUserId);
            return ids.length;
        },
        onChanged,
        plural: "partners",
    });
    const openUnassigned = everything.cases.filter((item) => item.kycId && (item.status === "PENDING" || item.status === "NEEDS_INFO") && !item.assignedToId);

    const columns = React.useMemo(
        () =>
            kycQueueColumns<PrintPartnerKycCase>(
                {
                    noun: "Partner",
                    name: (row) => row.partnerName,
                    line: (row) => [row.displayId, row.city, row.mobile].filter(Boolean).join(" · "),
                    method: (row) =>
                        !row.kycId ? (
                            <span className="text-muted-foreground">—</span>
                        ) : row.digio ? (
                            // Cashfree Phase 2: the provider (Digio or Cashfree) and its answer — PROVIDER_FAILED reads "Digio couldn't be reached".
                            <StatusBadge status={onlineCheckMeta(row.digio.provider, row.digio.status)} />
                        ) : (
                            <span className="text-muted-foreground">
                                {row.documents.filter((item) => item.url).length} of {PRINT_PARTNER_KYC_FIELDS.length} uploaded
                            </span>
                        ),
                    submitted: (row) => (row.submittedAt ? formatDate(row.submittedAt) : null),
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
                            party={row.partnerName}
                            hasAccount
                            contact={row.mobile}
                            request={row.request}
                            caseHref={row.kycId ? `/kyc/print-partners/${row.kycId}` : null}
                            onDigio={async (entityType) => {
                                const result = await printPartnerKycService.requestDigio(row.kycId ?? row.partnerId, entityType);
                                return { digio: result.digio, notified: true };
                            }}
                            onRequest={async (channel, note, entityType) => {
                                const result = await printPartnerKycService.request(row.kycId ?? row.partnerId, channel, note, entityType);
                                return { digio: result.digio, notified: true };
                            }}
                            onRecord={() => setRecording(row)}
                            onChanged={onChanged}
                            accountState={row.accountState}
                            deactivationBlocksNew={false}
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
                title="Print partner KYC"
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
                searchPlaceholder="Search partners, display id, mobile"
                initialSearch={initialSearch}
                toolbar={onShowInactive && <ShowInactiveSwitch checked={showInactive} onCheckedChange={onShowInactive} />}
                initialPageSize={10}
                onRowClick={(item) => item.kycId && router.push(`/kyc/print-partners/${item.kycId}`)}
                emptyState={
                    <EmptyState
                        icon={ClipboardList}
                        title={chip === "all" ? "Nobody on the queue" : "Nobody under this chip"}
                        description={chip === "all" ? "Every print partner is here from the moment it is created, until its KYC is verified." : "Choose another state, or All."}
                    />
                }
                bulkActions={(rows, clear) => reviewers.bulkActions(rows.filter((row) => row.kycId).map((row) => row.id), clear)}
            />

            {reviewers.dialog}

            {recording && (
                <RecordAtDeskDialog
                    key={recording.partnerId}
                    open
                    onOpenChange={(open) => !open && setRecording(null)}
                    party={recording.partnerName}
                    userId={recording.userId}
                    purpose="PRINT_PARTNER_KYC"
                    tiles={PRINT_PARTNER_KYC_FIELDS}
                    facts={PARTNER_DESK_FACTS}
                    initial={
                        recording.kycId
                            ? {
                                  documents: Object.fromEntries(recording.documents.filter((item) => item.url).map((item) => [item.field, item.url ?? undefined])),
                                  panNumber: recording.panNumber ?? "",
                                  govIdType: recording.govIdType ?? "",
                              }
                            : undefined
                    }
                    needsInfo={recording.status === "NEEDS_INFO"}
                    onSubmit={async (body) => {
                        const kycCase = await printPartnerKycService.recordAtDesk(recording.kycId ?? recording.partnerId, body);
                        return { caseHref: `/kyc/print-partners/${kycCase.id}` };
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
