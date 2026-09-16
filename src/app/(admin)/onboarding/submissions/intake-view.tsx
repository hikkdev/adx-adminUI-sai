"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { FilterChips } from "@/components/adx/filter-chips";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime } from "@/lib/format";
import {
    INTAKE_STATUSES,
    INTAKE_STATUS_META,
    INTAKE_USER_TYPE_LABEL,
    intakeName,
    type IntakeFilter,
    type IntakePage,
    type IntakeStatus,
    type IntakeUserType,
    type WireIntakeSubmission,
} from "@/services/onboarding";
import { NewIntakeDialog } from "./new-intake-dialog";

interface IntakeViewProps {
    page: IntakePage;
    filter: IntakeFilter;
    onFilter: (filter: IntakeFilter) => void;
    onChanged: () => void;
}

type TypeChip = IntakeUserType | "all";

/**
 * The intake desk — Lot D (Q131). One row per submission for the type in
 * force; open one to review it, approve it into a profile, reject it with
 * a reason, or cancel it. "New intake" is the desk typing one up itself.
 * E7-3: the search, the status picker and the pager are the server's own
 * facets on the list contract, and the status picker's counts are its.
 */
export function IntakeView({ page, filter, onFilter, onChanged }: IntakeViewProps) {
    const router = useRouter();
    const [creating, setCreating] = React.useState(false);
    const typeChip: TypeChip = filter.userType ?? "all";
    const submissions = page.items;
    const pageCount = Math.max(1, Math.ceil(page.total / Math.max(1, page.pageSize)));
    const total = Object.values(page.counts).reduce((sum, n) => sum + n, 0);

    const columns = React.useMemo<ColumnDef<WireIntakeSubmission>[]>(
        () => [
            {
                id: "who",
                accessorFn: (row) => intakeName(row),
                header: ({ column }) => <SortableHeader column={column}>Who</SortableHeader>,
                cell: ({ row }) => (
                    <div className="flex items-center gap-2.5">
                        <InitialsAvatar name={intakeName(row.original)} size="sm" />
                        <div>
                            <p className="font-medium text-foreground">{intakeName(row.original)}</p>
                            <p className="text-xs text-muted-foreground">{row.original.user?.mobile ?? String(row.original.data["mobile"] ?? "—")}</p>
                        </div>
                    </div>
                ),
            },
            {
                id: "type",
                accessorKey: "userType",
                header: "Type",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">
                        {INTAKE_USER_TYPE_LABEL[row.original.userType]}
                        {row.original.userType === "AGENT" && typeof row.original.data["side"] === "string" ? ` · ${String(row.original.data["side"]).toLowerCase()}s` : ""}
                        {row.original.userType === "EMPLOYEE" && typeof row.original.data["department"] === "string" ? ` · ${row.original.data["department"]}` : ""}
                    </span>
                ),
            },
            {
                id: "submitted",
                accessorKey: "createdAt",
                header: ({ column }) => <SortableHeader column={column}>Submitted</SortableHeader>,
                cell: ({ row }) => <span className="text-muted-foreground">{formatDateTime(row.original.createdAt)}</span>,
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => <StatusBadge status={INTAKE_STATUS_META[row.original.status]} />,
            },
        ],
        []
    );

    return (
        <div className="space-y-5">
            <PageHeader
                title="Onboarding intake"
                subtitle="Agents and employees come into being here: submitted, reviewed, approved into a profile"
                actions={
                    <Button onClick={() => setCreating(true)}>
                        <Plus className="mr-1.5 size-4" />
                        New intake
                    </Button>
                }
            />

            <FilterChips<TypeChip>
                value={typeChip}
                onChange={(value) => onFilter({ ...filter, userType: value === "all" ? undefined : value, page: 1 })}
                chips={[
                    { value: "AGENT", label: "Agents" },
                    { value: "EMPLOYEE", label: "Employees" },
                    { value: "PUBLISHER", label: "Publishers" },
                    { value: "ADVERTISER", label: "Advertisers" },
                    { value: "PARTNER", label: "Partners" },
                    { value: "all", label: "Every type" },
                ]}
            />

            <DataTable
                columns={columns}
                data={submissions}
                showPagination={false}
                onRowClick={(submission) => router.push(`/onboarding/submissions/${submission.id}`)}
                toolbar={
                    <>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={filter.q ?? ""}
                                onChange={(event) => onFilter({ ...filter, q: event.target.value, page: 1 })}
                                placeholder="Search by name or mobile"
                                className="h-9 w-64 pl-8"
                                aria-label="Search the intake"
                            />
                        </div>
                        <Select
                            value={filter.status ?? "all"}
                            onValueChange={(value) => onFilter({ ...filter, status: value === "all" ? undefined : (value as IntakeStatus), page: 1 })}
                        >
                            <SelectTrigger className="h-9 w-[210px] bg-card" aria-label="Status">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Status: All ({total})</SelectItem>
                                {INTAKE_STATUSES.map((status) => (
                                    <SelectItem key={status} value={status}>
                                        {INTAKE_STATUS_META[status].label} ({page.counts[status] ?? 0})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </>
                }
            />

            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground" data-testid="intake-pager">
                <span>
                    {page.total === 0 ? "Nothing submitted under these filters." : `Page ${page.page} of ${pageCount} · ${page.total} submission${page.total === 1 ? "" : "s"}`}
                </span>
                <span className="flex items-center gap-1">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 bg-card"
                        disabled={page.page <= 1}
                        onClick={() => onFilter({ ...filter, page: Math.max(1, page.page - 1) })}
                    >
                        <ChevronLeft className="mr-1 size-3.5" />
                        Previous
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 bg-card"
                        disabled={page.page >= pageCount}
                        onClick={() => onFilter({ ...filter, page: page.page + 1 })}
                    >
                        Next
                        <ChevronRight className="ml-1 size-3.5" />
                    </Button>
                </span>
            </div>

            <NewIntakeDialog
                open={creating}
                onOpenChange={setCreating}
                initialType={filter.userType === "EMPLOYEE" ? "EMPLOYEE" : "AGENT"}
                onCreated={(submission) => {
                    onChanged();
                    router.push(`/onboarding/submissions/${submission.id}`);
                }}
            />
        </div>
    );
}
