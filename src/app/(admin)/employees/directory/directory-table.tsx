"use client";

import { useRouter } from "next/navigation";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Search, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { FilterChips, type FilterChip } from "@/components/adx/filter-chips";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate, formatNumber } from "@/lib/format";
import {
    EMPLOYEE_STATUS_META,
    EMPLOYMENT_TYPE_META,
    WORK_MODE_META,
    pageCountOf,
    type EmployeeRow,
    type EmployeesPage,
} from "@/services/employees";
import { DIRECTORY_PAGE_SIZES, DIRECTORY_SORT_COLUMNS, toggleSort, type DirectoryPageSize } from "./directory-sort";

/** The picker's value for every department. */
const ALL = "__all__";

/** The active chip: everyone, or one side of `?active=`. */
export type DirectoryActivity = "ALL" | "ACTIVE" | "INACTIVE";

interface DirectoryTableProps {
    page: EmployeesPage;
    q: string;
    onQChange: (q: string) => void;
    /** The department in force, or "" for every department. */
    department: string;
    departments: string[];
    onDepartmentChange: (department: string) => void;
    activity: DirectoryActivity;
    onActivityChange: (activity: DirectoryActivity) => void;
    pageNumber: number;
    onPageChange: (page: number) => void;
    pageSize: DirectoryPageSize;
    onPageSizeChange: (pageSize: DirectoryPageSize) => void;
    /** Lot G (Q113): the server's sort, `{ id, desc }[]` over the column ids below. */
    sorting: SortingState;
    onSortingChange: (sorting: SortingState) => void;
}

/**
 * A header the server sorts on. The click goes to the loader, which puts
 * `?sort=&dir=` in the key and refetches — the rows are never re-ordered
 * here. The arrow shows the direction in force.
 */
function ServerSortHeader({
    columnId,
    sorting,
    onSortingChange,
    children,
}: {
    columnId: string;
    sorting: SortingState;
    onSortingChange: (sorting: SortingState) => void;
    children: React.ReactNode;
}) {
    const active = sorting[0]?.id === columnId ? sorting[0] : null;
    const Icon = active ? (active.desc ? ArrowDown : ArrowUp) : ArrowUpDown;
    return (
        <button
            type="button"
            className={cn("-ml-1 inline-flex items-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:text-foreground", active && "text-foreground")}
            onClick={() => onSortingChange(toggleSort(sorting, columnId))}
            aria-pressed={Boolean(active)}
            aria-label={`Sort by ${columnId}${active ? `, ${active.desc ? "descending" : "ascending"}` : ""}`}
        >
            {children}
            <Icon className={cn("size-3.5", active ? "text-foreground" : "text-muted-foreground/70")} />
        </button>
    );
}

/** The chips over the server's `counts`, which are computed with the active facet removed. */
export function activityChips(counts: Record<string, number>): FilterChip<DirectoryActivity>[] {
    const active = counts.ACTIVE ?? 0;
    const inactive = counts.INACTIVE ?? 0;
    return [
        { value: "ALL", label: "Everyone", count: active + inactive },
        { value: "ACTIVE", label: "Active", count: active },
        { value: "INACTIVE", label: "Inactive", count: inactive },
    ];
}

/**
 * The DR 10 frame's table (`5102:23833`), on one server page.
 *
 * The frame's Employee (name and id), Role (designation and department)
 * and Joined columns are kept — Joined is the record's `createdAt`, which
 * is what the API's JOINED sort orders on. What `Employee` also has — the
 * contact details and whether the record is active — fills the rest. A row
 * opens the profile by user id, which is how the API keys a record.
 *
 * Every facet is the server's (E10-1), so the chips count the whole result
 * and the pager walks it; the table's own search and pager are off. Lot G
 * (Q113, package CG1): the sort is the server's too — Employee, Role and
 * Joined go out as `?sort=&dir=` — the frame's Columns chooser is the
 * table's own toggle, and Rows per page (10 / 25 / 50 / 100) is the
 * server's `pageSize`.
 *
 * G13-B/C: the frame's Region, Work mode and Employment columns are drawn
 * off the row's `region`, `workMode` and `employmentType` (Lot G's columns
 * on `Employee`), each hideable through the Columns chooser, and Region
 * sorts server-side too (`?sort=REGION`, A to Z, blanks last).
 */
export function DirectoryTable({
    page,
    q,
    onQChange,
    department,
    departments,
    onDepartmentChange,
    activity,
    onActivityChange,
    pageNumber,
    onPageChange,
    pageSize,
    onPageSizeChange,
    sorting,
    onSortingChange,
}: DirectoryTableProps) {
    const router = useRouter();

    /* The department in force stays an option even when the registry read
       came back without it, so the picker never shows a value it lacks. */
    const options = department && !departments.includes(department) ? [department, ...departments] : departments;

    const columns: ColumnDef<EmployeeRow>[] = [
        {
            id: "employee",
            accessorKey: "name",
            enableHiding: false,
            header: () => (
                <ServerSortHeader columnId="employee" sorting={sorting} onSortingChange={onSortingChange}>
                    Employee
                </ServerSortHeader>
            ),
            cell: ({ row }) => (
                <div className="flex items-center gap-2.5">
                    <InitialsAvatar name={row.original.name} />
                    <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{row.original.name}</p>
                        <p className="text-xs text-muted-foreground">{row.original.displayId ?? "No EMP id yet"}</p>
                    </div>
                </div>
            ),
        },
        {
            id: "role",
            accessorKey: "designation",
            header: () => (
                <ServerSortHeader columnId="role" sorting={sorting} onSortingChange={onSortingChange}>
                    Role
                </ServerSortHeader>
            ),
            cell: ({ row }) => (
                <div>
                    <p className="text-foreground">{row.original.designation ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{row.original.department ?? "No department"}</p>
                </div>
            ),
        },
        {
            id: "contact",
            accessorKey: "mobile",
            header: "Contact",
            cell: ({ row }) => (
                <div>
                    <p className="text-foreground">{row.original.mobile ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{row.original.email ?? "No email"}</p>
                </div>
            ),
        },
        {
            id: "region",
            accessorKey: "region",
            header: () => (
                <ServerSortHeader columnId="region" sorting={sorting} onSortingChange={onSortingChange}>
                    Region
                </ServerSortHeader>
            ),
            cell: ({ row }) => <span className={cn(!row.original.region && "text-muted-foreground")}>{row.original.region ?? "—"}</span>,
        },
        {
            id: "workMode",
            accessorKey: "workMode",
            header: "Work mode",
            cell: ({ row }) =>
                row.original.workMode ? <StatusBadge status={WORK_MODE_META[row.original.workMode]} /> : <span className="text-muted-foreground">—</span>,
        },
        {
            id: "employmentType",
            accessorKey: "employmentType",
            header: "Employment",
            cell: ({ row }) =>
                row.original.employmentType ? (
                    <StatusBadge status={EMPLOYMENT_TYPE_META[row.original.employmentType]} />
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
        {
            id: "joined",
            accessorKey: "createdAt",
            header: () => (
                <ServerSortHeader columnId="joined" sorting={sorting} onSortingChange={onSortingChange}>
                    Joined
                </ServerSortHeader>
            ),
            cell: ({ row }) => formatDate(row.original.createdAt),
        },
        {
            id: "status",
            accessorKey: "status",
            header: "Status",
            cell: ({ row }) => <StatusBadge status={EMPLOYEE_STATUS_META[row.original.status]} />,
        },
    ];

    const lastPage = pageCountOf(page.total, pageSize);
    const from = page.total === 0 ? 0 : (pageNumber - 1) * pageSize + 1;
    const to = Math.min(pageNumber * pageSize, page.total);
    const narrowed = Boolean(q.trim()) || department !== "" || activity !== "ALL";

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={q}
                        onChange={(event) => onQChange(event.target.value)}
                        placeholder="Search employees"
                        aria-label="Search employees"
                        className="h-9 w-[260px] bg-card pl-8"
                    />
                </div>
                <Select value={department || ALL} onValueChange={(value) => onDepartmentChange(value === ALL ? "" : value)}>
                    <SelectTrigger className="h-9 w-44 bg-card" aria-label="Department">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ALL}>All departments</SelectItem>
                        {options.map((option) => (
                            <SelectItem key={option} value={option}>
                                {option}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <FilterChips chips={activityChips(page.counts)} value={activity} onChange={onActivityChange} />

            <DataTable
                columns={columns}
                data={page.rows}
                showColumnToggle
                showPagination={false}
                sorting={sorting}
                onSortingChange={onSortingChange}
                onRowClick={(person) => router.push(`/employees/directory/${person.userId}`)}
                emptyState={
                    <EmptyState
                        icon={Users}
                        title={narrowed ? "Nobody matches" : "No employees yet"}
                        description={
                            narrowed
                                ? "Clear the search, the department or the chip to see the rest."
                                : "An employee record hangs off a user account. Add the first one from the button above."
                        }
                    />
                }
            />

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                    Rows per page
                    <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value) as DirectoryPageSize)}>
                        <SelectTrigger className="h-8 w-[70px] bg-card" aria-label="Rows per page">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent side="top">
                            {DIRECTORY_PAGE_SIZES.map((size) => (
                                <SelectItem key={size} value={String(size)}>
                                    {size}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <span>
                    {from}-{to} of {formatNumber(page.total)}
                </span>
                <div className="flex items-center gap-1.5">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 bg-card"
                        onClick={() => onPageChange(pageNumber - 1)}
                        disabled={pageNumber <= 1}
                    >
                        Previous
                    </Button>
                    <span className="flex h-8 min-w-8 items-center justify-center rounded-md border bg-card px-2 text-sm text-foreground">
                        {pageNumber}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 bg-card"
                        onClick={() => onPageChange(pageNumber + 1)}
                        disabled={pageNumber >= lastPage}
                    >
                        Next
                    </Button>
                </div>
            </div>
        </div>
    );
}
