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
    /** What the search box holds on first draw — a link that names one party (`?q=`, the rosters' "Review KYC"). */
    initialSearch?: string;
    /** Extra toolbar controls rendered next to the search input. */
    toolbar?: React.ReactNode;
    /** Show the column-visibility "Columns" menu. Default true. */
    showColumnToggle?: boolean;
    /**
     * Rendered inside a bulk-action bar whenever rows are selected. The third
     * argument narrows the selection to the rows given — how a bulk run keeps
     * the rows that failed selected and lets the rest go. Pair it with
     * `getRowId`, so the selection survives the reload that follows a run.
     */
    bulkActions?: (rows: TData[], clearSelection: () => void, keepSelected: (rows: TData[]) => void) => React.ReactNode;
    /**
     * A row's stable id. Without it a row is known by its index, which is
     * fine until the data reloads in a different order; a table whose
     * selection must outlive a reload (a bulk run) passes the record's key.
     */
    getRowId?: (row: TData) => string;
    onRowClick?: (row: TData) => void;
    emptyState?: React.ReactNode;
    initialPageSize?: number;
    /** The footer's rows-per-page choices. Default [5, 10, 20, 50]; initialPageSize should be one of them. */
    pageSizes?: number[];
    /**
     * Draw the footer's rows-per-page and Previous/Next. Default true. Off
     * for a table whose page the server already cut — the caller draws the
     * server's pager instead, and the whole page it was handed is shown.
     */
    showPagination?: boolean;
    /**
     * Sorting owned by the caller (Lot G, package CG1): the state is drawn
     * from here and every header click is reported through `onSortingChange`
     * rather than applied to the rows — for a table whose sort the server
     * does (`?sort=&dir=`), so a click refetches instead of re-ordering the
     * one page in hand. Leave both off for the table's own client-side sort.
     */
    sorting?: SortingState;
    onSortingChange?: (sorting: SortingState) => void;
    /**
     * Columns drawn hidden until the "Columns" menu turns them on — column
     * id to false. For a table whose default layout is shared with other
     * desks (the party rosters) and whose own extras stay one click away.
     */
    initialColumnVisibility?: VisibilityState;
    /**
     * A row's detail, drawn full width under it while `isRowExpanded` says
     * so — the ledger's legs under their transaction. The caller owns which
     * rows are open (usually toggled from `onRowClick`).
     */
    renderExpanded?: (row: TData) => React.ReactNode;
    isRowExpanded?: (row: TData) => boolean;
    /** A line between the toolbar and the table — a server's "₹X across N rows" for the filtered set. */
    aboveTable?: React.ReactNode;
    /**
     * 3 Oct 2026 (the owner: "is it possible to see the listings in a grid
     * view with photos"): the same rows drawn as cards. Everything else is
     * this table's — the search, the toolbar, the sort, the paging, the
     * selection and the bulk bar — so the two views can never disagree
     * about which rows are on screen or ticked. Each card gets the row's
     * checkbox on its top-left corner; a click elsewhere on it is a row
     * click. Without `renderCard` the table is drawn whatever `view` says.
     */
    view?: "table" | "grid";
    renderCard?: (row: TData) => React.ReactNode;
    className?: string;
}

export function DataTable<TData, TValue>({
    columns,
    data,
    searchPlaceholder,
    initialSearch,
    toolbar,
    showColumnToggle = true,
    bulkActions,
    getRowId,
    onRowClick,
    emptyState,
    initialPageSize = 10,
    pageSizes = [5, 10, 20, 50],
    showPagination = true,
    sorting: controlledSorting,
    onSortingChange,
    initialColumnVisibility,
    renderExpanded,
    isRowExpanded,
    aboveTable,
    view = "table",
    renderCard,
    className,
}: DataTableProps<TData, TValue>) {
    const grid = view === "grid" && renderCard !== undefined;
    const [ownSorting, setOwnSorting] = React.useState<SortingState>([]);
    const manualSorting = controlledSorting !== undefined;
    const sorting = manualSorting ? controlledSorting : ownSorting;
    const [globalFilter, setGlobalFilter] = React.useState(initialSearch ?? "");
    const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(() => initialColumnVisibility ?? {});
    const [rowSelection, setRowSelection] = React.useState({});

    /**
     * Bulk actions imply a way to select rows, so the checkbox column is added
     * here rather than left to every caller to remember.
     *
     * It was a caller's job until five pricing tables shipped with bulk actions
     * and no checkboxes: the toolbar could never appear, because nothing could
     * ever be selected. A table that offers an action nobody can reach is worse
     * than one that offers none, and the coupling is real enough that the
     * component should enforce it.
     *
     * Guarded so the tables that already add it by hand do not get two.
     */
    const resolvedColumns = React.useMemo(() => {
        if (!bulkActions) return columns;
        if (columns.some((column) => column.id === "select")) return columns;
        return [selectionColumn<TData>() as ColumnDef<TData, TValue>, ...columns];
    }, [bulkActions, columns]);

    const table = useReactTable({
        data,
        columns: resolvedColumns,
        state: { sorting, globalFilter, columnVisibility, rowSelection },
        // A server-sorted page is shown in the order it came: the click is
        // reported, never applied to the rows.
        manualSorting,
        // A server-cut page is shown whole: nothing the caller handed over is
        // hidden behind a second pager.
        initialState: { pagination: { pageSize: showPagination ? initialPageSize : Number.MAX_SAFE_INTEGER } },
        onSortingChange: (updater) => {
            const next = typeof updater === "function" ? updater(sorting) : updater;
            if (manualSorting) onSortingChange?.(next);
            else setOwnSorting(next);
        },
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
        ...(getRowId ? { getRowId: (row: TData) => getRowId(row) } : {}),
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
    const pageRows = table.getRowModel().rows;

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
                    {/* Columns belong to the table; a grid of cards has none to hide. */}
                    {showColumnToggle && !grid && (
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
                            () => table.resetRowSelection(),
                            (keep) => {
                                const wanted = new Set(keep);
                                table.setRowSelection(
                                    Object.fromEntries(
                                        table
                                            .getCoreRowModel()
                                            .rows.filter((row) => wanted.has(row.original))
                                            .map((row) => [row.id, true])
                                    )
                                );
                            }
                        )}
                    </div>
                </div>
            )}

            {aboveTable}

            {grid ? (
                <div className="space-y-3" data-testid="data-grid">
                    {bulkActions && pageRows.length > 0 ? (
                        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                            <Checkbox
                                checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
                                onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                                aria-label="Select all rows"
                            />
                            Select every card on this page
                        </label>
                    ) : null}
                    {pageRows.length ? (
                        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {pageRows.map((row) => (
                                <li
                                    key={row.id}
                                    data-state={row.getIsSelected() ? "selected" : undefined}
                                    className={cn(
                                        "group relative overflow-hidden rounded-lg border bg-card transition-colors hover:border-foreground/30",
                                        onRowClick && "cursor-pointer",
                                        row.getIsSelected() && "border-primary ring-1 ring-primary",
                                    )}
                                    onClick={(event) => handleRowClick(event, row)}
                                >
                                    {renderCard(row.original)}
                                    {bulkActions ? (
                                        <span className="absolute left-2 top-2 z-10 flex size-7 items-center justify-center rounded-md bg-card/95 shadow-sm">
                                            <Checkbox
                                                checked={row.getIsSelected()}
                                                onCheckedChange={(value) => row.toggleSelected(!!value)}
                                                aria-label="Select row"
                                            />
                                        </span>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="flex h-48 items-center justify-center rounded-lg border bg-card">
                            {emptyState ?? <p className="text-sm text-muted-foreground">No results found.</p>}
                        </div>
                    )}
                </div>
            ) : (
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
                            table.getRowModel().rows.map((row) => {
                                const expanded = renderExpanded ? (isRowExpanded?.(row.original) ?? false) : undefined;
                                return (
                                    <React.Fragment key={row.id}>
                                        <TableRow
                                            data-state={row.getIsSelected() && "selected"}
                                            aria-expanded={expanded}
                                            className={cn(onRowClick && "cursor-pointer", expanded && "border-b-0 bg-muted/30")}
                                            onClick={(event) => handleRowClick(event, row)}
                                        >
                                            {row.getVisibleCells().map((cell) => (
                                                <TableCell key={cell.id} className="py-3">
                                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                        {expanded && renderExpanded && (
                                            <TableRow className="bg-muted/30 hover:bg-muted/30">
                                                <TableCell colSpan={row.getVisibleCells().length} className="px-4 pb-4 pt-0">
                                                    {renderExpanded(row.original)}
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </React.Fragment>
                                );
                            })
                        ) : (
                            <TableRow>
                                <TableCell colSpan={resolvedColumns.length} className="h-48 p-0">
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
            )}

            {showPagination && (
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
                            {pageSizes.map(size => (
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
            )}
        </div>
    );
}
