"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { DataTable, SortableHeader, selectionColumn } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { FilterChips } from "@/components/adx/filter-chips";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { dealCases, escalationChip } from "@/services/kyc";
import { KYC_STATE_META, kycHeadline, kycStateChips, type KycStateChip } from "@/services/kyc-state";
import { PARTNER_DESK_FACTS, printPartnerKycService, PRINT_PARTNER_KYC_FIELDS, type PrintPartnerKycCase } from "@/services/print-partner-kyc";
import { filterUsers, usersService } from "@/services/users";
import { DeskStamp } from "../_shared/desk-stamp";
import { KycRowActions } from "../_shared/kyc-row-actions";
import { RecordAtDeskDialog } from "../_shared/record-at-desk-dialog";
import type { LoadedPartnerQueue } from "./print-partner-kyc-loader";

interface PrintPartnerKycQueueViewProps {
    loaded: LoadedPartnerQueue;
    chip: KycStateChip;
    onChip: (chip: KycStateChip) => void;
    onChanged: () => void;
}

/**
 * The print partner KYC queue — Lot N, on the publisher queue's table.
 *
 * N3-C: the queue lists PARTIES — every partner from the moment it is
 * created, in one of six states — and the chips are those states (plus
 * Escalated) with the server's counts, the chip in the URL. A partner with
 * no record is drawn from the party alone with a state pill; every row
 * offers the actions its state allows (the one-click Digio request behind
 * `kyc.edit`, the manual ask, Record at the desk, Open the case). The
 * roster picker is gone: the queue lists them now.
 *
 * Assignment is a filter, not ownership. There is no bulk route on this
 * desk, so "Assign to me" over a selection and "Distribute across
 * reviewers" are one `PATCH /print-partner-kyc/:id/assign` per case — and
 * only a row with a record can be assigned at all.
 */
export function PrintPartnerKycQueueView({ loaded, chip, onChip, onChanged }: PrintPartnerKycQueueViewProps) {
    const router = useRouter();
    const { user } = useAuth();
    const { everything, visible } = loaded;
    const cases = visible.cases;
    const all = everything.cases;

    const [dealing, setDealing] = React.useState(false);
    const [confirmDeal, setConfirmDeal] = React.useState<{ reviewers: { id: string; name: string }[]; ids: string[] } | null>(null);
    const [assigning, setAssigning] = React.useState(false);
    const [recording, setRecording] = React.useState<PrintPartnerKycCase | null>(null);

    const openUnassigned = all.filter((item) => item.kycId && (item.status === "PENDING" || item.status === "NEEDS_INFO") && !item.assignedToId);

    const prepareDeal = async (ids: string[]) => {
        setDealing(true);
        try {
            const rows = await usersService.list({ closed: false, role: "ADMIN" });
            const reviewers = filterUsers(rows, { status: ["active"] }).map((row) => ({ id: row.id, name: row.displayName }));
            if (reviewers.length === 0) {
                toast.error("No active admin to assign to.");
                return;
            }
            if (ids.length === 0) {
                toast.info("Every open case already has a reviewer.");
                return;
            }
            setConfirmDeal({ reviewers, ids });
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not read the reviewers.");
        } finally {
            setDealing(false);
        }
    };

    const deal = async () => {
        if (!confirmDeal) return;
        setDealing(true);
        try {
            const hands = dealCases(confirmDeal.ids, confirmDeal.reviewers.map((reviewer) => reviewer.id));
            let assigned = 0;
            for (const hand of hands) {
                for (const id of hand.ids) {
                    await printPartnerKycService.assign(id, hand.adminUserId);
                    assigned += 1;
                }
            }
            toast.success(`${assigned} case${assigned === 1 ? "" : "s"} distributed across ${hands.length} reviewer${hands.length === 1 ? "" : "s"}`);
            setConfirmDeal(null);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The assignment did not reach ADX.");
        } finally {
            setDealing(false);
        }
    };

    const assignToMe = async (rows: PrintPartnerKycCase[], clear: () => void) => {
        const withRecord = rows.filter((row) => row.kycId);
        if (withRecord.length === 0) {
            toast.info("Nothing to assign: none of the selected partners has a record yet.");
            return;
        }
        setAssigning(true);
        try {
            for (const row of withRecord) await printPartnerKycService.assign(row.id, "me");
            toast.success(`${withRecord.length} case${withRecord.length === 1 ? "" : "s"} assigned to you`);
            clear();
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The assignment did not reach ADX.");
        } finally {
            setAssigning(false);
        }
    };

    const columns = React.useMemo<ColumnDef<PrintPartnerKycCase>[]>(
        () => [
            selectionColumn<PrintPartnerKycCase>(),
            {
                id: "partner",
                accessorKey: "partnerName",
                header: ({ column }) => <SortableHeader column={column}>Partner</SortableHeader>,
                cell: ({ row }) => (
                    <div className="flex items-center gap-2.5">
                        <InitialsAvatar name={row.original.partnerName} size="sm" />
                        <div>
                            <p className="font-medium text-foreground">{row.original.partnerName}</p>
                            <p className="text-xs text-muted-foreground">{[row.original.displayId, row.original.city, row.original.mobile].filter(Boolean).join(" · ")}</p>
                        </div>
                    </div>
                ),
            },
            {
                id: "method",
                header: "Method",
                cell: ({ row }) =>
                    !row.original.kycId ? (
                        <span className="text-muted-foreground">—</span>
                    ) : row.original.method === "DIGIO" ? (
                        <StatusBadge
                            status={
                                row.original.digio?.status === "approved"
                                    ? { label: "Digio · approved", tone: "success" }
                                    : row.original.digio?.status === "rejected"
                                      ? { label: "Digio · rejected", tone: "danger" }
                                      : { label: "Digio · waiting", tone: "warning" }
                            }
                        />
                    ) : (
                        <span className="text-muted-foreground">{row.original.documents.filter((item) => item.url).length} of {PRINT_PARTNER_KYC_FIELDS.length} uploaded</span>
                    ),
            },
            {
                id: "submitted",
                header: "Submitted / arrived",
                cell: ({ row }) =>
                    row.original.submittedAt ? (
                        <span className="text-muted-foreground">{formatDate(row.original.submittedAt)}</span>
                    ) : row.original.createdAt ? (
                        <span className="text-muted-foreground" title="Nothing submitted; when the partner arrived">
                            Arrived {formatDate(row.original.createdAt)}
                        </span>
                    ) : (
                        <span className="text-muted-foreground">—</span>
                    ),
            },
            {
                id: "desk",
                header: "Requested / recorded by",
                cell: ({ row }) => <DeskStamp request={row.original.request} recorded={row.original.recorded} />,
            },
            {
                id: "sla",
                accessorKey: "slaHoursLeft",
                header: ({ column }) => <SortableHeader column={column}>SLA</SortableHeader>,
                cell: ({ row }) => {
                    const { ageHours, slaBreached, slaHoursLeft } = row.original;
                    if (ageHours === null) return <span className="text-muted-foreground">—</span>;
                    return (
                        <span className={cn("font-medium", slaBreached || slaHoursLeft <= 6 ? "text-danger" : "text-muted-foreground")}>
                            {slaBreached ? `Breached · ${Math.floor(ageHours)}h` : `${slaHoursLeft}h left`}
                        </span>
                    );
                },
            },
            {
                id: "assigned",
                header: "Working it",
                cell: ({ row }) =>
                    row.original.assignedToId ? (
                        <span className="text-muted-foreground">
                            {user && row.original.assignedToId === user.id ? "You" : row.original.assignedTo?.name?.trim() || row.original.assignedToId}
                        </span>
                    ) : (
                        <span className="text-muted-foreground">{row.original.kycId ? "Nobody" : "—"}</span>
                    ),
            },
            {
                id: "state",
                accessorKey: "state",
                header: "State",
                cell: ({ row }) => {
                    const pill = escalationChip(row.original.escalation);
                    return (
                        <div className="flex flex-wrap items-center gap-1.5">
                            <StatusBadge status={KYC_STATE_META[row.original.state]} />
                            {pill && <StatusBadge status={pill} />}
                        </div>
                    );
                },
            },
            {
                id: "actions",
                enableHiding: false,
                header: "",
                cell: ({ row }) => (
                    <KycRowActions
                        state={row.original.state}
                        party={row.original.partnerName}
                        hasAccount
                        contact={row.original.mobile}
                        request={row.original.request}
                        caseHref={row.original.kycId ? `/kyc/print-partners/${row.original.kycId}` : null}
                        onDigio={async () => {
                            const result = await printPartnerKycService.requestDigio(row.original.kycId ?? row.original.partnerId);
                            return { digio: result.digio, notified: true };
                        }}
                        onRequest={async (channel, note) => {
                            const result = await printPartnerKycService.request(row.original.kycId ?? row.original.partnerId, channel, note);
                            return { digio: result.digio, notified: true };
                        }}
                        onRecord={() => setRecording(row.original)}
                        onChanged={onChanged}
                        className="justify-end"
                    />
                ),
            },
        ],
        [user, onChanged]
    );

    return (
        <div className="space-y-5">
            <PageHeader
                title="Print partner KYC"
                subtitle={`${kycHeadline(everything.counts, everything.breached)} · ${everything.slaHours}h review SLA`}
                actions={
                    <Button variant="outline" className="bg-card" disabled={dealing} onClick={() => void prepareDeal(openUnassigned.map((item) => item.id))}>
                        {dealing ? "Reading reviewers…" : "Assign reviewers"}
                    </Button>
                }
            />

            <FilterChips<KycStateChip> value={chip} onChange={onChip} chips={kycStateChips(everything.counts, everything.total)} />

            <DataTable
                columns={columns}
                data={cases}
                searchPlaceholder="Search partners, display id, mobile"
                initialPageSize={10}
                onRowClick={(item) => item.kycId && router.push(`/kyc/print-partners/${item.kycId}`)}
                emptyState={
                    <EmptyState
                        icon={ClipboardList}
                        title={chip === "all" ? "No print partners on the queue" : "Nobody under this chip"}
                        description={chip === "all" ? "Every partner is here from the moment it is created, until its KYC is verified." : "Choose another state, or All."}
                    />
                }
                bulkActions={(rows, clear) => (
                    <>
                        <Button variant="outline" size="sm" className="h-8" disabled={assigning} onClick={() => void assignToMe(rows, clear)}>
                            {assigning ? "Assigning…" : "Assign to me"}
                        </Button>
                        <Button variant="outline" size="sm" className="h-8" disabled={dealing} onClick={() => void prepareDeal(rows.filter((row) => row.kycId).map((row) => row.id))}>
                            Distribute across reviewers
                        </Button>
                    </>
                )}
            />

            <ConfirmDialog
                open={confirmDeal !== null}
                onOpenChange={(open) => !open && setConfirmDeal(null)}
                title="Distribute these cases?"
                description={
                    confirmDeal
                        ? `${confirmDeal.ids.length} case${confirmDeal.ids.length === 1 ? "" : "s"} will be dealt in turn across ${confirmDeal.reviewers.length} admin${confirmDeal.reviewers.length === 1 ? "" : "s"}: ${confirmDeal.reviewers.map((reviewer) => reviewer.name).join(", ")}. A filter, not ownership — anyone may still decide any case.`
                        : ""
                }
                confirmLabel="Assign reviewers"
                busy={dealing}
                onConfirm={() => void deal()}
            />

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
