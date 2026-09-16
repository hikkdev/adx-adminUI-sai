"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardList } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { FilterChips } from "@/components/adx/filter-chips";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate } from "@/lib/format";
import { EMPLOYEE_KYC_SLOTS, employeeKycService, type EmployeeKycQueueRow } from "@/services/employee-kyc";
import { KYC_STATE_META, kycHeadline, kycStateChips, type KycStateChip } from "@/services/kyc-state";
import { DeskStamp } from "../_shared/desk-stamp";
import { KycRowActions } from "../_shared/kyc-row-actions";
import type { LoadedEmployeeQueue } from "./employee-kyc-loader";

interface EmployeeKycQueueProps {
    loaded: LoadedEmployeeQueue;
    chip: KycStateChip;
    onChip: (chip: KycStateChip) => void;
    live: boolean;
    onChanged: () => void;
}

/**
 * The employee KYC queue — Lot D (Q131), the agent queue's twin.
 *
 * N3-B / N3-C (the owner, 14 Sep 2026): every employee is here from the
 * moment the HR row exists — until now a row existed only once someone at
 * ADX had recorded the documents, and the roster picker found the rest.
 * The chips are the six party states (plus Escalated, empty here) with
 * the server's counts, the chip in the URL; a row with no record is drawn
 * from the employee alone with a state pill, and every row offers the
 * actions its state allows: the one-click Digio request
 * (`POST /employee-kyc/:employeeId/request`, behind `kyc.edit`), the manual
 * ask, Record at the desk (the employee's record sheet), Open the case
 * (the same sheet, once something is in). The picker is gone: the queue
 * lists them now.
 */
export function EmployeeKycQueue({ loaded, chip, onChip, live, onChanged }: EmployeeKycQueueProps) {
    const router = useRouter();
    const { everything, visible } = loaded;

    const columns = React.useMemo<ColumnDef<EmployeeKycQueueRow>[]>(
        () => [
            {
                id: "employee",
                accessorKey: "employeeName",
                header: ({ column }) => <SortableHeader column={column}>Employee</SortableHeader>,
                cell: ({ row }) => (
                    <div className="flex items-center gap-2.5">
                        <InitialsAvatar name={row.original.employeeName} size="sm" />
                        <div>
                            <p className="font-medium text-foreground">{row.original.employeeName}</p>
                            <p className="text-xs text-muted-foreground">
                                {[row.original.displayId, row.original.department, row.original.designation].filter(Boolean).join(" · ") || row.original.mobile}
                            </p>
                        </div>
                    </div>
                ),
            },
            {
                id: "documents",
                accessorKey: "documents",
                header: "Documents",
                cell: ({ row }) =>
                    row.original.kycId ? (
                        <span className="text-muted-foreground">
                            {row.original.method === "DIGIO" ? "Digio" : `${row.original.documents} of ${EMPLOYEE_KYC_SLOTS.length} recorded`}
                        </span>
                    ) : (
                        <span className="text-muted-foreground">—</span>
                    ),
            },
            {
                id: "submitted",
                accessorKey: "submittedAt",
                header: "Recorded / arrived",
                cell: ({ row }) =>
                    row.original.submittedAt !== "—" ? (
                        <span className="text-muted-foreground">{row.original.submittedAt}</span>
                    ) : row.original.createdAt ? (
                        <span className="text-muted-foreground" title="Nothing recorded; when the employee arrived">
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
                id: "state",
                accessorKey: "state",
                header: "State",
                cell: ({ row }) => <StatusBadge status={KYC_STATE_META[row.original.state]} />,
            },
            {
                id: "actions",
                enableHiding: false,
                header: "",
                cell: ({ row }) => (
                    <KycRowActions
                        state={row.original.state}
                        party={row.original.employeeName}
                        hasAccount
                        contact={row.original.mobile}
                        request={row.original.request}
                        caseHref={row.original.kycId ? `/kyc/employees/${row.original.employeeId}` : null}
                        onDigio={() => employeeKycService.requestDigio(row.original.employeeId)}
                        onRequest={(channel, note) => employeeKycService.request(row.original.employeeId, channel, note)}
                        onRecord={() => router.push(`/kyc/employees/${row.original.employeeId}`)}
                        onChanged={onChanged}
                        className="justify-end"
                    />
                ),
            },
        ],
        [router, onChanged]
    );

    return (
        <div className="space-y-5">
            <PageHeader title="Employee KYC" subtitle={`${kycHeadline(everything.counts, 0)} · every employee is here from the moment the row exists`} />

            {!live && (
                <Card className="rounded-lg border-border p-5 shadow-none">
                    <p className="text-sm text-muted-foreground">
                        Employee KYC is read from the API and has no fixtures. Turn the KYC domain on to see who is waiting.
                    </p>
                </Card>
            )}

            <FilterChips<KycStateChip> value={chip} onChange={onChip} chips={kycStateChips(everything.counts, everything.total)} />

            <DataTable
                columns={columns}
                data={visible.rows}
                searchPlaceholder="Search employees by name or ID"
                initialPageSize={10}
                onRowClick={(row) => router.push(`/kyc/employees/${row.employeeId}`)}
                emptyState={
                    <EmptyState
                        icon={ClipboardList}
                        title={chip === "all" ? "No employees on the queue" : "Nobody under this chip"}
                        description={chip === "all" ? "Every employee is here from the moment the HR row exists." : "Choose another state, or All."}
                    />
                }
            />
        </div>
    );
}
