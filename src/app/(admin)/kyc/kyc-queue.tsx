"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DataTable, SortableHeader, selectionColumn } from "@/components/adx/data-table";
import { FilterChips } from "@/components/adx/filter-chips";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { cn } from "@/lib/utils";
import { KYC_CASE_STATUS_META, type KycCase, type KycCaseStatus } from "@/types";

interface KycQueueProps {
    cases: KycCase[];
}

type ChipValue = KycCaseStatus | "all";

export function KycQueue({ cases }: KycQueueProps) {
    const router = useRouter();
    const [chip, setChip] = React.useState<ChipValue>("all");

    const countBy = (status: KycCaseStatus) =>
        cases.filter((kycCase) => kycCase.status === status).length;

    const filtered = React.useMemo(
        () => (chip === "all" ? cases : cases.filter((kycCase) => kycCase.status === chip)),
        [cases, chip]
    );

    const columns = React.useMemo<ColumnDef<KycCase>[]>(
        () => [
            selectionColumn<KycCase>(),
            {
                id: "applicant",
                accessorKey: "applicant",
                header: ({ column }) => <SortableHeader column={column}>Applicant</SortableHeader>,
                cell: ({ row }) => (
                    <div className="flex items-center gap-2.5">
                        <InitialsAvatar name={row.original.applicant} size="sm" />
                        <div>
                            <p className="font-medium text-foreground">{row.original.applicant}</p>
                            <p className="text-xs text-muted-foreground">{row.original.city}</p>
                        </div>
                    </div>
                ),
            },
            {
                id: "entity-type",
                accessorKey: "businessType",
                header: "Entity type",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">{row.original.businessType}</span>
                ),
            },
            {
                id: "documents",
                header: "Documents",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">
                        {row.original.documents.length} uploaded
                    </span>
                ),
            },
            {
                id: "submitted",
                accessorKey: "submittedAt",
                header: "Submitted",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">{row.original.submittedAt}</span>
                ),
            },
            {
                id: "sla",
                accessorKey: "slaHoursLeft",
                header: ({ column }) => <SortableHeader column={column}>SLA</SortableHeader>,
                cell: ({ row }) => (
                    <span
                        className={cn(
                            "font-medium",
                            row.original.slaHoursLeft <= 6 ? "text-danger" : "text-muted-foreground"
                        )}
                    >
                        {row.original.slaHoursLeft <= 0
                            ? "Breached"
                            : `${row.original.slaHoursLeft}h left`}
                    </span>
                ),
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => (
                    <StatusBadge status={KYC_CASE_STATUS_META[row.original.status]} />
                ),
            },
        ],
        []
    );

    return (
        <div className="space-y-5">
            <PageHeader
                title="KYC queue"
                subtitle="Verify publisher identity before payouts unlock"
                actions={
                    <Button
                        variant="outline"
                        className="bg-card"
                        onClick={() => toast.success("Open cases distributed across reviewers")}
                    >
                        Assign reviewers
                    </Button>
                }
            />

            <FilterChips<ChipValue>
                value={chip}
                onChange={setChip}
                chips={[
                    { value: "all", label: "All", count: cases.length },
                    { value: "awaiting_review", label: "Awaiting review", count: countBy("awaiting_review") },
                    { value: "needs_info", label: "Needs info", count: countBy("needs_info") },
                    { value: "escalated", label: "Escalated", count: countBy("escalated") },
                    { value: "rejected", label: "Rejected", count: countBy("rejected") },
                ]}
            />

            <DataTable
                columns={columns}
                data={filtered}
                searchPlaceholder="Search applicants, PAN, GSTIN"
                initialPageSize={10}
                onRowClick={(kycCase) => router.push(`/kyc/${kycCase.id}`)}
                bulkActions={(rows, clear) => (
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => {
                            toast.success(`${rows.length} cases assigned to you`);
                            clear();
                        }}
                    >
                        Assign to me
                    </Button>
                )}
            />
        </div>
    );
}
