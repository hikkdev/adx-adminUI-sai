"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Plus, Search } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { FilterChips, type FilterChip } from "@/components/adx/filter-chips";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
    CLOSED_STAGES,
    IN_PROGRESS_STAGES,
    SIDE_ROLE_LABEL,
    SOURCE_LABEL,
    STAGE_META,
    WITH_DESK_STAGES,
    applicantName,
    gradeLabel,
    type AgentSide,
    type AgentStage,
    type ApplicationRow,
    type ApplicationsPage,
} from "@/services/agent-applications";
import { CreateAgentDialog } from "../create-agent-dialog";

/** The chips: the three groups, the two single stages the desk watches, and everything. */
export type QueueChip = "WITH_DESK" | "ON_HOLD" | "IN_PROGRESS" | "ACTIVE" | "CLOSED" | "all";

interface ApplicationsQueueProps {
    page: ApplicationsPage;
    chip: QueueChip;
    onChipChange: (chip: QueueChip) => void;
    side: AgentSide | "all";
    onSideChange: (side: AgentSide | "all") => void;
    search: string;
    onSearchChange: (value: string) => void;
    onPageChange: (page: number) => void;
    /** Refetch — an agent was added from the dialog. */
    onChanged: () => void;
}

const sum = (counts: ApplicationsPage["counts"], stages: AgentStage[]) => stages.reduce((n, stage) => n + (counts[stage] ?? 0), 0);

/** The chips with their counts — the counts come under the side and search filters, so they always match the table. */
export function queueChips(counts: ApplicationsPage["counts"]): FilterChip<QueueChip>[] {
    return [
        { value: "WITH_DESK", label: "With ADX", count: sum(counts, WITH_DESK_STAGES) },
        { value: "ON_HOLD", label: "On hold", count: counts.ON_HOLD ?? 0 },
        { value: "IN_PROGRESS", label: "Still applying", count: sum(counts, IN_PROGRESS_STAGES) },
        { value: "ACTIVE", label: "Active", count: counts.ACTIVE ?? 0 },
        { value: "CLOSED", label: "Closed", count: sum(counts, CLOSED_STAGES) },
        { value: "all", label: "All", count: Object.values(counts).reduce((n, c) => n + (c ?? 0), 0) },
    ];
}

const columns: ColumnDef<ApplicationRow>[] = [
    {
        id: "applicant",
        header: "Applicant",
        cell: ({ row }) => {
            const name = applicantName(row.original);
            return (
                <div className="flex items-center gap-3">
                    <InitialsAvatar name={name} size="sm" />
                    <div className="min-w-0">
                        <Link href={`/agents/applications/${row.original.id}`} className="block truncate font-medium text-foreground hover:underline">
                            {name}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                            {[row.original.displayId, row.original.user.mobile].filter(Boolean).join(" · ") || "—"}
                        </p>
                    </div>
                </div>
            );
        },
    },
    {
        accessorKey: "side",
        header: "Applying as",
        cell: ({ row }) => <span className="text-sm text-foreground">{SIDE_ROLE_LABEL[row.original.side]}</span>,
    },
    {
        accessorKey: "stage",
        header: "Stage",
        cell: ({ row }) => <StatusBadge status={STAGE_META[row.original.stage]} />,
    },
    {
        accessorKey: "sourceKind",
        header: "Came by",
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{SOURCE_LABEL[row.original.sourceKind] ?? row.original.sourceKind}</span>,
    },
    {
        accessorKey: "city",
        header: "City",
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.city ?? "—"}</span>,
    },
    {
        id: "papers",
        header: "Papers",
        cell: ({ row }) => {
            const { filed, flagged } = row.original.documents;
            return (
                <span className={cn("text-xs tabular-nums", flagged > 0 ? "font-medium text-danger" : "text-muted-foreground")}>
                    {filed} filed{flagged > 0 ? ` · ${flagged} flagged` : ""}
                </span>
            );
        },
    },
    {
        id: "when",
        header: "Submitted",
        cell: ({ row }) => (
            <span className="text-xs text-muted-foreground">
                {row.original.applicationSubmittedAt ? formatDate(row.original.applicationSubmittedAt) : `Started ${formatDate(row.original.createdAt)}`}
            </span>
        ),
    },
    {
        accessorKey: "grade",
        header: "Grade",
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{gradeLabel(row.original.grade)}</span>,
    },
    {
        id: "open",
        header: "",
        enableHiding: false,
        cell: ({ row }) => (
            <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                <Link href={`/agents/applications/${row.original.id}`}>Open</Link>
            </Button>
        ),
    },
];

/**
 * The desk's queue. Opens on "With ADX" — the applications waiting for a
 * decision — because that is the pile the desk owes something to; the
 * other chips are the stalled, the held, the working and the closed.
 */
export function ApplicationsQueue({ page, chip, onChipChange, side, onSideChange, search, onSearchChange, onPageChange, onChanged }: ApplicationsQueueProps) {
    const router = useRouter();
    const [creating, setCreating] = React.useState(false);
    const narrowed = chip !== "all" || side !== "all" || search.trim().length > 0;
    const from = page.total === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
    const to = Math.min(page.total, page.page * page.pageSize);

    return (
        <div className="space-y-4">
            <PageHeader
                title="Applications"
                subtitle="Everyone on the way to becoming an agent — from the field app, a walk-in, or a fleet partner — and the decision each is waiting for."
                actions={
                    <Button onClick={() => setCreating(true)}>
                        <Plus className="size-4" aria-hidden />
                        Add an applicant
                    </Button>
                }
            />
            <CreateAgentDialog open={creating} onOpenChange={setCreating} onCreated={onChanged} />

            <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full sm:w-72">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                        value={search}
                        onChange={(event) => onSearchChange(event.target.value)}
                        placeholder="Name, number or AGT id"
                        aria-label="Search applications"
                        className="bg-card pl-8"
                    />
                </div>
                <Select value={side} onValueChange={(value) => onSideChange(value as AgentSide | "all")}>
                    <SelectTrigger className="w-[180px] bg-card" aria-label="Side">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Both sides</SelectItem>
                        <SelectItem value="PUBLISHER">Field agents</SelectItem>
                        <SelectItem value="ADVERTISER">Sales agents</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <FilterChips chips={queueChips(page.counts)} value={chip} onChange={onChipChange} />

            <DataTable
                columns={columns}
                data={page.rows}
                showColumnToggle={false}
                showPagination={false}
                onRowClick={(row) => router.push(`/agents/applications/${row.id}`)}
                emptyState={
                    <EmptyState
                        icon={ClipboardList}
                        title={narrowed ? "Nobody here" : "No applications yet"}
                        description={
                            narrowed
                                ? "Try another chip, the other side, or clear the search."
                                : "Applications arrive from the field app, or start here with Add an applicant."
                        }
                    />
                }
            />

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground" data-testid="applications-pager">
                <span>
                    {from}-{to} of {formatNumber(page.total)}
                </span>
                <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" className="h-8 bg-card" onClick={() => onPageChange(page.page - 1)} disabled={page.page <= 1}>
                        Previous
                    </Button>
                    <span className="flex h-8 min-w-8 items-center justify-center rounded-md border bg-card px-2 text-sm text-foreground">{page.page}</span>
                    <Button variant="outline" size="sm" className="h-8 bg-card" onClick={() => onPageChange(page.page + 1)} disabled={page.page >= page.totalPages}>
                        Next
                    </Button>
                </div>
            </div>
        </div>
    );
}
