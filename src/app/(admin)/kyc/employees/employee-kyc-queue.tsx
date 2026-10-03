"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { FilterChips } from "@/components/adx/filter-chips";
import { PageHeader } from "@/components/adx/page-header";
import { EMPLOYEE_KYC_SLOTS, employeeKycService, employeeWorkflowLabel, type EmployeeKycQueueRow } from "@/services/employee-kyc";
import { kycQueueSubtitle, kycStateChips, type KycStateChip } from "@/services/kyc-state";
import { methodWord } from "@/services/verification";
import { kycQueueColumns } from "../_shared/kyc-queue-columns";
import { KycRowActions } from "../_shared/kyc-row-actions";
import { ShowInactiveSwitch } from "../_shared/show-inactive";
import type { LoadedEmployeeQueue } from "./employee-kyc-loader";

interface EmployeeKycQueueProps {
    loaded: LoadedEmployeeQueue;
    chip: KycStateChip;
    onChip: (chip: KycStateChip) => void;
    /** 2 Oct 2026: the "Show inactive accounts" switch, kept in the URL by the loader. */
    showInactive?: boolean;
    onShowInactive?: (next: boolean) => void;
    live: boolean;
    onChanged: () => void;
}

/**
 * The employee KYC queue — Lot D (Q131), on the publisher queue's layout
 * (2 Oct 2026: one layout for the five KYC tabs).
 *
 * N3-B / N3-C (the owner, 14 Sep 2026): every employee is here from the
 * moment the HR row exists. The chips are the six party states with the
 * server's counts, the chip in the URL — no Escalated chip, an employee's
 * case is never escalated; a row with no record is drawn from the employee
 * alone with a state pill, and every row offers the actions its state
 * allows: the one-click Digio request (`POST /employee-kyc/:employeeId/request`,
 * behind `kyc.edit`), the manual ask, Record at the desk (the employee's
 * record sheet), Open the case (the same sheet, once something is in).
 * Phase D: an employee has no entity type — the Digio workflow follows
 * their employment type, and the row says which one a request would use,
 * where Publishers puts its entity type.
 *
 * `GET /employee-kyc` carries no review clock, no assignee and no
 * escalation on a row, so the table stops at the state and the summary
 * line at what is under review; there is nothing to assign, so no header
 * actions.
 */
export function EmployeeKycQueue({ loaded, chip, onChip, showInactive = false, onShowInactive, live, onChanged }: EmployeeKycQueueProps) {
    const router = useRouter();
    const { everything, visible } = loaded;

    const columns = React.useMemo(
        () =>
            kycQueueColumns<EmployeeKycQueueRow>(
                {
                    noun: "Employee",
                    name: (row) => row.employeeName,
                    line: (row) => [row.displayId, row.department, row.designation, row.mobile].filter(Boolean).join(" · "),
                    partyColumns: [
                        {
                            /* Phase D: which of the two employee workflows a Digio request uses — by employment type; "—" when no read said it. */
                            id: "digio-workflow",
                            header: "Digio workflow",
                            cell: ({ row }) => (
                                <span className="text-muted-foreground" data-testid="employee-workflow">
                                    {row.original.employmentType === undefined ? "—" : employeeWorkflowLabel(row.original.employmentType)}
                                </span>
                            ),
                        },
                    ],
                    method: (row) =>
                        row.kycId ? (
                            <span className="text-muted-foreground">{methodWord(row.method, row.digioStatus) ?? `${row.documents} of ${EMPLOYEE_KYC_SLOTS.length} recorded`}</span>
                        ) : (
                            <span className="text-muted-foreground">—</span>
                        ),
                    submitted: (row) => (row.submittedAt !== "—" ? row.submittedAt : null),
                    arrivedAt: (row) => row.createdAt,
                    request: (row) => row.request,
                    recorded: (row) => row.recorded,
                    hasRecord: (row) => Boolean(row.kycId),
                    state: (row) => row.state,
                    accountState: (row) => row.accountState,
                    actions: (row) => (
                        <KycRowActions
                            state={row.state}
                            party={row.employeeName}
                            hasAccount
                            contact={row.mobile}
                            request={row.request}
                            caseHref={row.kycId ? `/kyc/employees/${row.employeeId}` : null}
                            onDigio={() => employeeKycService.requestDigio(row.employeeId)}
                            onRequest={(channel, note) => employeeKycService.request(row.employeeId, channel, note)}
                            onRecord={() => router.push(`/kyc/employees/${row.employeeId}`)}
                            onChanged={onChanged}
                            accountState={row.accountState}
                            deactivationBlocksNew={false}
                            className="justify-end"
                        />
                    ),
                },
                null
            ),
        [router, onChanged]
    );

    return (
        <div className="space-y-5">
            <PageHeader title="Employee KYC" subtitle={kycQueueSubtitle(everything.counts, null)} />

            {!live && (
                <Card className="rounded-lg border-border p-5 shadow-none">
                    <p className="text-sm text-muted-foreground">Employee KYC is read from the API and has no fixtures. Turn the KYC domain on to see who is waiting.</p>
                </Card>
            )}

            <FilterChips<KycStateChip> value={chip} onChange={onChip} chips={kycStateChips(everything.counts, everything.total, { escalated: false })} />

            <DataTable
                columns={columns}
                data={visible.rows}
                searchPlaceholder="Search employees, display id, mobile"
                toolbar={onShowInactive && <ShowInactiveSwitch checked={showInactive} onCheckedChange={onShowInactive} />}
                initialPageSize={10}
                onRowClick={(row) => router.push(`/kyc/employees/${row.employeeId}`)}
                emptyState={
                    <EmptyState
                        icon={ClipboardList}
                        title={chip === "all" ? "Nobody on the queue" : "Nobody under this chip"}
                        description={chip === "all" ? "Every employee is here from the moment the HR row exists, until their KYC is verified." : "Choose another state, or All."}
                    />
                }
            />
        </div>
    );
}
