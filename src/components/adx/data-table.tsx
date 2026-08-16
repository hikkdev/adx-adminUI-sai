"use client";

import * as React from "react";
import {
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
    type Column,
    type ColumnDef,
    type Row,
    type SortingState,
    type VisibilityState,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Clickable header that toggles sorting. */
export function SortableHeader<TData, TValue>({
    column,
    children,
}: {
    column: Column<TData, TValue>;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            className="-ml-1 inline-flex items-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
            {children}
            <ArrowUpDown className="size-3.5 text-muted-foreground/70" />
        </button>
    );
}

export function selectionColumn<TData>(): ColumnDef<TData> {
    return {
        id: "select",
        header: ({ table }) => (
            <Checkbox
                checked={
                    table.getIsAllPageRowsSelected() ||
                    (table.getIsSomePageRowsSelected() && "indeterminate")
                }
                onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                aria-label="Select all rows"
                className="translate-y-[2px]"
            />
        ),
        cell: ({ row }) => (
            <Checkbox
                checked={row.getIsSelected()}
                onCheckedChange={(value) => row.toggleSelected(!!value)}
                aria-label="Select row"
                className="translate-y-[2px]"
            />
        ),
        enableSorting: false,
        enableHiding: false,
        size: 36,
    };
}

/* ------------------------------------------------------------------ */
/* DataTable                                                           */
/* ------------------------------------------------------------------ */

interface DataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    /** Placeholder for the global search input; omit to hide search. */
    searchPlaceholder?: string;
    /** Extra toolbar controls rendered next to the search input. */
    toolbar?: React.ReactNode;
    /** Show the column-visibility "Columns" menu. Default true. */
    showColumnToggle?: boolean;
    /** Rendered inside a bulk-action bar whenever rows are selected. */
    bulkActions?: (rows: TData[], clearSelection: () => void) => React.ReactNode;
    onRowClick?: (row: TData) => void;
    emptyState?: React.ReactNode;
    initialPageSize?: number;
    className?: string;
}

export function DataTable<TData, TValue>({
    columns,
    data,
    searchPlaceholder,
    toolbar,
    showColumnToggle = true,
    bulkActions,
    onRowClick,
    emptyState,
    initialPageSize = 10,
    className,
}: DataTableProps<TData, TValue>) {
    const [sorting, setSorting] = React.useState<SortingState>([]);
    const [globalFilter, setGlobalFilter] = React.useState("");
    const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
    const [rowSelection, setRowSelection] = React.useState({});

    const table = useReactTable({
        data,
        columns,
        state: { sorting, globalFilter, columnVisibility, rowSelection },
        initialState: { pagination: { pageSize: initialPageSize } },
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        onColumnVisibilityChange: setColumnVisibility,
        onRowSelectionChange: setRowSelection,
        globalFilterFn: (row, _columnId, filterValue) => {
            const haystack = Object.values(row.original as Record<string, unknown>)
                .filter((value) => typeof value === "string" || typeof value === "number")
                .join(" ")
                .toLowerCase();
            return haystack.includes(String(filterValue).toLowerCase());
        },
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
    });

    const selectedRows = table.getFilteredSelectedRowModel().rows;
    const { pageIndex, pageSize } = table.getState().pagination;
    const totalRows = table.getFilteredRowModel().rows.length;
    const from = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
    const to = Math.min((pageIndex + 1) * pageSize, totalRows);

    const handleRowClick = (event: React.MouseEvent, row: Row<TData>) => {
        if (!onRowClick) return;
        const target = event.target as HTMLElement;
        if (target.closest("button, a, input, [role='checkbox'], [role='menuitem']")) return;
        onRowClick(row.original);
    };

    const hasToolbar = searchPlaceholder || toolbar || showColumnToggle;

    return (
        <div className={cn("space-y-4", className)}>
            {hasToolbar && (
                <div className="flex flex-wrap items-center gap-2">
                    {searchPlaceholder && (
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={globalFilter}
                                onChange={(event) => setGlobalFilter(event.target.value)}
                                placeholder={searchPlaceholder}
                                className="h-9 w-[260px] bg-card pl-8"
                            />
                        </div>
                    )}
                    {toolbar}
                    {showColumnToggle && (
                        <div className="ml-auto">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-9 bg-card">
                                        Columns
                                        <ChevronDown className="ml-1.5 size-3.5" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                    {table
                                        .getAllColumns()
                                        .filter((column) => column.getCanHide())
                                        .map((column) => (
                                            <DropdownMenuCheckboxItem
                                                key={column.id}
                                                checked={column.getIsVisible()}
                                                onCheckedChange={(value) => column.toggleVisibility(!!value)}
                                                className="capitalize"
                                            >
                                                {column.id.replace(/[-_]/g, " ")}
                                            </DropdownMenuCheckboxItem>
                                        ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    )}
                </div>
            )}

            {bulkActions && selectedRows.length > 0 && (
                <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2.5">
                    <span className="text-sm font-medium text-foreground">
                        {selectedRows.length} selected
                    </span>
                    <div className="flex items-center gap-2">
                        {bulkActions(
                            selectedRows.map((row) => row.original),
                            () => table.resetRowSelection()
                        )}
                    </div>
                </div>
            )}

            <div className="overflow-hidden rounded-lg border bg-card">
                <Table>
                    <TableHeader className="bg-muted/50">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id} className="hover:bg-transparent">
                                {headerGroup.headers.map((header) => (
                                    <TableHead
                                        key={header.id}
                                        className="h-9 text-xs font-medium text-muted-foreground"
                                        style={{
                                            width:
                                                header.getSize() !== 150 ? header.getSize() : undefined,
                                        }}
                                    >
                                        {header.isPlaceholder
                                            ? null
                                            : flexRender(header.column.columnDef.header, header.getContext())}
                                    </TableHead>
                                ))}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow
                                    key={row.id}
                                    data-state={row.getIsSelected() && "selected"}
                                    className={cn(onRowClick && "cursor-pointer")}
                                    onClick={(event) => handleRowClick(event, row)}
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id} className="py-3">
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="h-48 p-0">
                                    {emptyState ?? (
                                        <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                            No results found.
                                        </p>
                                    )}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    Rows per page
                    <Select
                        value={String(pageSize)}
                        onValueChange={(value) => table.setPageSize(Number(value))}
                    >
                        <SelectTrigger className="h-8 w-[70px] bg-card">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent side="top">
                            {[5, 10, 20, 50].map(size => (
                                <SelectItem key={size} value={String(size)}>
                                    {size}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">
                        {from}-{to} of {formatNumber(totalRows)}
                    </span>
                    <div className="flex items-center gap-1.5">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 bg-card"
                            onClick={() => table.previousPage()}
                            disabled={!table.getCanPreviousPage()}
                        >
                            Previous
                        </Button>
                        <span className="flex h-8 min-w-8 items-center justify-center rounded-md border bg-card px-2 text-sm">
                            {pageIndex + 1}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 bg-card"
                            onClick={() => table.nextPage()}
                            disabled={!table.getCanNextPage()}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
