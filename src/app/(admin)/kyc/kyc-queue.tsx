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
import { autoEscalationHours, dealCases, escalationChip, kycService, PUBLISHER_DESK_FACTS, PUBLISHER_KYC_FIELDS } from "@/services/kyc";
import { KYC_STATE_META, kycHeadline, kycStateChips, type KycStateChip } from "@/services/kyc-state";
import { filterUsers, usersService } from "@/services/users";
import type { KycCase } from "@/types";
import { DeskStamp } from "./_shared/desk-stamp";
import { KycRowActions } from "./_shared/kyc-row-actions";
import { RecordAtDeskDialog } from "./_shared/record-at-desk-dialog";
import type { LoadedQueue } from "./kyc-queue-loader";

interface KycQueueViewProps {
    loaded: LoadedQueue;
    chip: KycStateChip;
    onChip: (chip: KycStateChip) => void;
    onChanged: () => void;
}

/**
 * The publisher KYC queue — the frame's table on the server's facets.
 *
 * N3-C (the owner, 14 Sep 2026): the queue lists PARTIES. Every publisher
 * is on it from the moment the account exists, in one of six states the
 * server derives, and the chips are those states (plus Escalated) with the
 * server's counts, the chip kept in the URL. A publisher with no record is
 * drawn from the party alone — name, ids, contact, when they arrived — with
 * a state pill; every row offers the actions its state allows (the one-click
 * Digio request behind `kyc.edit`, the manual ask, Record at the desk,
 * Open the case). The header counts what is waiting on the party, what is
 * under review and what is past the SLA. The roster picker is gone: the
 * queue lists them now.
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
export function KycQueueView({ loaded, chip, onChip, onChanged }: KycQueueViewProps) {
    const router = useRouter();
    const { user } = useAuth();
    const { everything, visible, escalationSlaMultiplier } = loaded;
    const cases = visible.cases;
    const all = everything.cases;
    const autoEscalateAt = autoEscalationHours(everything.slaHours, escalationSlaMultiplier);

    const [dealing, setDealing] = React.useState(false);
    const [confirmDeal, setConfirmDeal] = React.useState<{ reviewers: { id: string; name: string }[]; ids: string[] } | null>(null);
    const [assigning, setAssigning] = React.useState(false);
    const [recording, setRecording] = React.useState<KycCase | null>(null);

    const openUnassigned = all.filter((kycCase) => kycCase.kycId && (kycCase.kycStatus === "PENDING" || kycCase.kycStatus === "NEEDS_INFO") && !kycCase.assignedToId);

    /** Round-robin over the console's active admins — `GET /users?role=ADMIN&closed=false`, the active ones. */
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
                const result = await kycService.assignMany(hand.ids, hand.adminUserId);
                assigned += result.assigned;
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

    const assignToMe = async (rows: KycCase[], clear: () => void) => {
        const withRecord = rows.filter((row) => row.kycId);
        if (withRecord.length === 0) {
            toast.info("Nothing to assign: none of the selected publishers has a record yet.");
            return;
        }
        setAssigning(true);
        try {
            const result = await kycService.assignMany(
                withRecord.map((row) => row.publisherId),
                "me"
            );
            toast.success(`${result.assigned} case${result.assigned === 1 ? "" : "s"} assigned to you`);
            clear();
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The assignment did not reach ADX.");
        } finally {
            setAssigning(false);
        }
    };

    const columns = React.useMemo<ColumnDef<KycCase>[]>(
        () => [
            selectionColumn<KycCase>(),
            {
                id: "applicant",
                accessorKey: "applicant",
                header: ({ column }) => <SortableHeader column={column}>Publisher</SortableHeader>,
                cell: ({ row }) => (
                    <div className="flex items-center gap-2.5">
                        <InitialsAvatar name={row.original.applicant} size="sm" />
                        <div>
                            <p className="font-medium text-foreground">{row.original.applicant}</p>
                            <p className="text-xs text-muted-foreground">
                                {[row.original.displayId, row.original.city !== "—" ? row.original.city : null, row.original.mobile].filter(Boolean).join(" · ")}
                            </p>
                        </div>
                    </div>
                ),
            },
            {
                id: "entity-type",
                accessorKey: "businessType",
                header: "Entity type",
                cell: ({ row }) => <span className="text-muted-foreground">{row.original.businessType}</span>,
            },
            {
                id: "agent",
                header: "Brought in by",
                cell: ({ row }) =>
                    row.original.selfOnboarded ? (
                        <StatusBadge status={{ label: "Self-onboarded", tone: "info" }} />
                    ) : row.original.agent ? (
                        <span className="text-muted-foreground">
                            {row.original.agent.name ?? "An agent"}
                            {row.original.agent.displayId ? ` · ${row.original.agent.displayId}` : ""}
                        </span>
                    ) : (
                        <span className="text-muted-foreground">—</span>
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
                        <span className="text-muted-foreground">{row.original.documents.length} uploaded</span>
                    ),
            },
            {
                id: "submitted",
                accessorKey: "submittedAt",
                header: "Submitted / arrived",
                cell: ({ row }) =>
                    row.original.submittedAt !== "—" ? (
                        <span className="text-muted-foreground">{row.original.submittedAt}</span>
                    ) : (
                        <span className="text-muted-foreground" title="Nothing submitted; when the publisher arrived">
                            Arrived {formatDate(row.original.createdAt)}
                        </span>
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
                    const { ageHours, slaBreached, slaHoursLeft, escalation } = row.original;
                    if (ageHours === null) return <span className="text-muted-foreground">—</span>;
                    /* Lot G: the nightly sweep's own threshold, beside the SLA. */
                    const untilAuto = autoEscalateAt === null || escalation ? null : Math.floor(autoEscalateAt - ageHours);
                    return (
                        <div>
                            <span className={cn("font-medium", slaBreached || slaHoursLeft <= 6 ? "text-danger" : "text-muted-foreground")}>
                                {slaBreached ? `Breached · ${Math.floor(ageHours)}h` : `${slaHoursLeft}h left`}
                            </span>
                            {untilAuto !== null && (
                                <p className="text-[11px] text-muted-foreground">
                                    {untilAuto > 0 ? `auto-escalates in ${untilAuto}h` : `auto-escalates tonight (${autoEscalateAt}h threshold)`}
                                </p>
                            )}
                        </div>
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
                    const escalated = escalationChip(row.original.escalation);
                    return (
                        <div className="flex flex-wrap items-center gap-1.5">
                            <StatusBadge status={KYC_STATE_META[row.original.state]} />
                            {escalated && <StatusBadge status={escalated} />}
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
                        party={row.original.applicant}
                        hasAccount={row.original.userId !== null}
                        contact={row.original.mobile}
                        request={row.original.request}
                        caseHref={row.original.kycId ? `/kyc/${row.original.publisherId}` : null}
                        onDigio={() => kycService.requestDigio(row.original.publisherId)}
                        onRequest={(channel, note) => kycService.request(row.original.publisherId, channel, note)}
                        onRecord={() => setRecording(row.original)}
                        onChanged={onChanged}
                        className="justify-end"
                    />
                ),
            },
        ],
        [user, autoEscalateAt, onChanged]
    );

    return (
        <div className="space-y-5">
            <PageHeader
                title="KYC queue"
                subtitle={`${kycHeadline(everything.counts, everything.breached)} · ${everything.slaHours}h review SLA`}
                actions={
                    <Button
                        variant="outline"
                        className="bg-card"
                        disabled={dealing}
                        onClick={() => void prepareDeal(openUnassigned.map((kycCase) => kycCase.publisherId))}
                    >
                        {dealing ? "Reading reviewers…" : "Assign reviewers"}
                    </Button>
                }
            />

            <FilterChips<KycStateChip> value={chip} onChange={onChip} chips={kycStateChips(everything.counts, everything.total)} />

            <DataTable
                columns={columns}
                data={cases}
                searchPlaceholder="Search publishers, display id, mobile, PAN, GSTIN"
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
                bulkActions={(rows, clear) => (
                    <>
                        <Button variant="outline" size="sm" className="h-8" disabled={assigning} onClick={() => void assignToMe(rows, clear)}>
                            {assigning ? "Assigning…" : "Assign to me"}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            disabled={dealing}
                            onClick={() => void prepareDeal(rows.filter((row) => row.kycId).map((row) => row.publisherId))}
                        >
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
