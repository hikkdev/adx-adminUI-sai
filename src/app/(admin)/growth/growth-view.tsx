"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatINR, formatNumber } from "@/lib/format";
import { MILESTONE_STATUS_META, type Milestone } from "@/types";

interface GrowthViewProps {
    milestones: Milestone[];
}

export function GrowthView({ milestones }: GrowthViewProps) {
    const router = useRouter();

    const columns = React.useMemo<ColumnDef<Milestone>[]>(
        () => [
            {
                id: "milestone",
                accessorKey: "title",
                header: ({ column }) => <SortableHeader column={column}>Milestone</SortableHeader>,
                cell: ({ row }) => (
                    <div>
                        <p className="font-medium text-foreground">{row.original.title}</p>
                        <p className="text-xs text-muted-foreground">{row.original.targetLabel}</p>
                    </div>
                ),
            },
            {
                id: "audience",
                accessorKey: "audience",
                header: "Audience",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">{row.original.audience}</span>
                ),
            },
            {
                id: "reward",
                accessorKey: "rewardInr",
                header: ({ column }) => <SortableHeader column={column}>Reward</SortableHeader>,
                cell: ({ row }) => (
                    <span className="font-medium">{formatINR(row.original.rewardInr)}</span>
                ),
            },
            {
                id: "enrolled",
                accessorKey: "enrolled",
                header: ({ column }) => <SortableHeader column={column}>Enrolled</SortableHeader>,
                cell: ({ row }) => formatNumber(row.original.enrolled),
            },
            {
                id: "completed",
                accessorKey: "completed",
                header: "Completed",
                cell: ({ row }) => formatNumber(row.original.completed),
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => (
                    <StatusBadge status={MILESTONE_STATUS_META[row.original.status]} />
                ),
            },
        ],
        []
    );

    return (
        <div className="space-y-5">
            <PageHeader
                title="Growth CMS"
                subtitle="Milestone programs that reward field agents"
                actions={
                    <Button onClick={() => router.push(`/growth/${milestones[0]?.id ?? ""}`)}>
                        <Plus className="mr-1.5 size-4" />
                        New milestone
                    </Button>
                }
            />
            <DataTable
                columns={columns}
                data={milestones}
                searchPlaceholder="Search milestones"
                initialPageSize={10}
                onRowClick={(milestone) => router.push(`/growth/${milestone.id}`)}
            />
        </div>
    );
}
