"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import type { ListPage } from "@/services/section-overviews";

export interface BreakdownColumn<T> {
    key: string;
    label: string;
    align?: "right";
    render: (row: T) => React.ReactNode;
    /** What the column sorts on; a column without one is not sortable. */
    sortValue?: (row: T) => number | string;
}

export interface BreakdownTableProps<T extends { key: string; label: string }> {
    title: string;
    hint?: string;
    page: ListPage<T>;
    /** The columns after the label. */
    columns: BreakdownColumn<T>[];
    /** Where a row leads; null keeps the label plain. */
    linkFor: (row: T) => string | null;
    /** What a row says on hover — the label's `title`; null says nothing. Lot X-B: the "Other (typed)" city row lists its strings here. */
    hoverFor?: (row: T) => string | null;
    /** The label column's heading. */
    labelHeading?: string;
    emptyMessage?: string;
    /** The column sorted on at first — descending; the label otherwise, ascending. */
    initialSort?: string;
    /** Rows beyond this are behind "Show all". */
    limit?: number;
    className?: string;
}

type Dir = "asc" | "desc";

function compare(a: number | string, b: number | string): number {
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b), "en", { numeric: true, sensitivity: "base" });
}

/**
 * A breakdown on the list contract — the whole table on one page, so the
 * sort is the console's: every column with a `sortValue` is a sortable
 * header, the label column always is, and a click flips the direction.
 * Each row's label is the section's link where the console has a page
 * that honours the cut, and a plain label where it does not.
 */
export function BreakdownTable<T extends { key: string; label: string }>({
    title,
    hint,
    page,
    columns,
    linkFor,
    hoverFor,
    labelHeading = "Name",
    emptyMessage = "Nothing in this window.",
    initialSort,
    limit = 12,
    className,
}: BreakdownTableProps<T>) {
    const [sort, setSort] = React.useState<{ key: string; dir: Dir }>(() => (initialSort ? { key: initialSort, dir: "desc" } : { key: "label", dir: "asc" }));
    const [expanded, setExpanded] = React.useState(false);

    const valueOf = (row: T): number | string => {
        if (sort.key === "label") return row.label;
        const column = columns.find((item) => item.key === sort.key);
        return column?.sortValue ? column.sortValue(row) : row.label;
    };
    const rows = [...page.items].sort((a, b) => {
        const order = compare(valueOf(a), valueOf(b));
        return sort.dir === "asc" ? order : -order;
    });
    const shown = expanded ? rows : rows.slice(0, limit);

    const toggle = (key: string, initial: Dir) => {
        setSort((current) => (current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: initial }));
    };

    const header = (key: string, label: string, sortable: boolean, align?: "right") => {
        if (!sortable) return <TableHead key={key} className={cn(align === "right" && "text-right")}>{label}</TableHead>;
        const active = sort.key === key;
        const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
        return (
            <TableHead key={key} className={cn(align === "right" && "text-right")}>
                <button
                    type="button"
                    className={cn(
                        "-ml-1 inline-flex items-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:text-foreground",
                        active && "text-foreground",
                        align === "right" && "-mr-1 ml-0 flex-row-reverse",
                    )}
                    onClick={() => toggle(key, key === "label" ? "asc" : "desc")}
                    aria-pressed={active}
                    aria-label={`Sort by ${label.toLowerCase()}${active ? `, ${sort.dir === "asc" ? "ascending" : "descending"}` : ""}`}
                >
                    {label}
                    <Icon className={cn("size-3.5", active ? "text-foreground" : "text-muted-foreground/70")} />
                </button>
            </TableHead>
        );
    };

    return (
        <Card className={cn("rounded-lg border-border p-5 shadow-none", className)}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-sm font-semibold text-foreground">{title}</h2>
                    {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
                </div>
                <span className="text-xs text-muted-foreground">
                    {formatNumber(page.total)} {page.total === 1 ? "row" : "rows"}
                </span>
            </div>
            <div className="mt-3 overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            {header("label", labelHeading, true)}
                            {columns.map((column) => header(column.key, column.label, Boolean(column.sortValue), column.align))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {shown.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={columns.length + 1} className="py-8 text-center text-sm text-muted-foreground">
                                    {emptyMessage}
                                </TableCell>
                            </TableRow>
                        ) : (
                            shown.map((row) => {
                                const href = linkFor(row);
                                const hover = hoverFor?.(row) ?? null;
                                return (
                                    <TableRow key={row.key}>
                                        <TableCell className="font-medium text-foreground">
                                            {href ? (
                                                <Link href={href} className="underline-offset-4 hover:underline" title={hover ?? undefined}>
                                                    {row.label}
                                                </Link>
                                            ) : hover ? (
                                                <span title={hover} className="cursor-help underline decoration-dotted underline-offset-4">
                                                    {row.label}
                                                </span>
                                            ) : (
                                                row.label
                                            )}
                                        </TableCell>
                                        {columns.map((column) => (
                                            <TableCell key={column.key} className={cn("tabular-nums", column.align === "right" && "text-right")}>
                                                {column.render(row)}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>
            {rows.length > limit ? (
                <button type="button" className="mt-3 text-xs font-medium text-primary hover:underline" onClick={() => setExpanded((current) => !current)}>
                    {expanded ? `Show the first ${limit}` : `Show all ${formatNumber(rows.length)}`}
                </button>
            ) : null}
        </Card>
    );
}
