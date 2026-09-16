"use client";

import * as React from "react";
import { Download, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FilterChips } from "@/components/adx/filter-chips";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { SimpleTable } from "@/components/adx/simple-table";
import { formatDateTime, formatNumber } from "@/lib/format";
import {
    actionLabel,
    actorName,
    auditService,
    moduleChips,
    moduleLabel,
    targetLabel,
    type AuditPage,
    type AuditQuery,
    type AuditRow,
    type AuditSort,
} from "@/services/audit";
import type { AuditFilter } from "./audit-loader";
import { AuditRowDrawer } from "./audit-row-drawer";

interface AuditViewProps {
    page: AuditPage;
    filter: AuditFilter;
    onFilterChange: (patch: Partial<AuditFilter>) => void;
    pageNumber: number;
    onPageChange: (page: number) => void;
    /** The filter in force, for the export — it takes the same facets minus the page. */
    exportQuery: AuditQuery;
}

const ALL = "__all__";

/**
 * "Audit Log · /audit" on DR 10: the title, the Export button, the module
 * chip row and the six-column table — timestamp, actor, action, object,
 * scope, IP. The columns are the frame's; the rows are the server's.
 *
 * What the frame did not draw and the contract supplies: a text search, a
 * date window, the sort, a pager, and a drawer on each row for the metadata
 * and the before/after diff. The actor's second line was a role on the
 * frame; the join carries an email and no role, so that is what it shows.
 */
export function AuditView({ page, filter, onFilterChange, pageNumber, onPageChange, exportQuery }: AuditViewProps) {
    const [open, setOpen] = React.useState<AuditRow | null>(null);
    const [exporting, setExporting] = React.useState(false);
    const [exportError, setExportError] = React.useState<string | null>(null);

    const chips = React.useMemo(() => moduleChips(page.counts), [page.counts]);
    const allCount = React.useMemo(() => Object.values(page.counts).reduce((sum, n) => sum + n, 0), [page.counts]);

    const lastPage = Math.max(1, Math.ceil(page.total / page.pageSize));
    const from = page.total === 0 ? 0 : (pageNumber - 1) * page.pageSize + 1;
    const to = Math.min(page.total, pageNumber * page.pageSize);

    async function exportCsv() {
        setExporting(true);
        setExportError(null);
        try {
            await auditService.exportCsv(exportQuery);
        } catch (cause) {
            setExportError(cause instanceof Error ? cause.message : "The export failed.");
        } finally {
            setExporting(false);
        }
    }

    return (
        <div className="space-y-5">
            <PageHeader
                title="Audit log"
                subtitle="Every privileged action, immutably recorded"
                actions={
                    <div className="flex flex-col items-end gap-1">
                        <Button variant="outline" className="bg-card" onClick={exportCsv} disabled={exporting}>
                            {exporting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
                            Export
                        </Button>
                        {exportError && <p className="text-xs text-danger">{exportError}</p>}
                    </div>
                }
            />

            <FilterChips<string>
                value={filter.module ?? ALL}
                onChange={(value) => onFilterChange({ module: value === ALL ? null : value })}
                chips={[{ value: ALL, label: "All", count: allCount }, ...chips]}
            />

            <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-72">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                        value={filter.q}
                        onChange={(event) => onFilterChange({ q: event.target.value })}
                        placeholder="Search action, target or request id"
                        className="h-9 bg-card pl-8"
                        aria-label="Search the audit log"
                    />
                </div>
                <Input
                    type="date"
                    value={filter.from}
                    onChange={(event) => onFilterChange({ from: event.target.value })}
                    className="h-9 w-auto bg-card"
                    aria-label="From date"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                    type="date"
                    value={filter.to}
                    onChange={(event) => onFilterChange({ to: event.target.value })}
                    className="h-9 w-auto bg-card"
                    aria-label="To date"
                />
                <Select value={filter.sort} onValueChange={(value) => onFilterChange({ sort: value as AuditSort })}>
                    <SelectTrigger className="h-9 w-[150px] bg-card" aria-label="Sort">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="newest">Newest first</SelectItem>
                        <SelectItem value="oldest">Oldest first</SelectItem>
                    </SelectContent>
                </Select>
                {filter.target && (
                    <button
                        type="button"
                        onClick={() => onFilterChange({ target: null })}
                        className="flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-medium text-foreground"
                    >
                        {filter.target.type} · <span className="font-mono">{filter.target.id}</span>
                        <X className="size-3.5 text-muted-foreground" aria-hidden />
                    </button>
                )}
            </div>

            <SimpleTable<AuditRow>
                rows={page.items}
                rowKey={(row) => row.id}
                emptyMessage={
                    filter.q || filter.module || filter.target || filter.from || filter.to
                        ? "No activity matches this filter."
                        : "Nothing has been recorded yet."
                }
                columns={[
                    {
                        key: "timestamp",
                        label: "Timestamp",
                        render: (row) => (
                            <button
                                type="button"
                                onClick={() => setOpen(row)}
                                className="whitespace-nowrap text-left text-muted-foreground hover:text-foreground"
                            >
                                {formatDateTime(row.createdAt)}
                            </button>
                        ),
                    },
                    {
                        key: "actor",
                        label: "Actor",
                        render: (row) => (
                            <div className="flex items-center gap-2">
                                <InitialsAvatar name={actorName(row)} size="sm" />
                                <div className="min-w-0">
                                    <p className="truncate font-medium text-foreground">{actorName(row)}</p>
                                    <p className="truncate text-xs text-muted-foreground">{row.user?.email ?? row.userId}</p>
                                </div>
                            </div>
                        ),
                    },
                    {
                        key: "action",
                        label: "Action",
                        render: (row) => (
                            <button type="button" onClick={() => setOpen(row)} className="text-left text-foreground hover:underline">
                                {actionLabel(row.action)}
                            </button>
                        ),
                    },
                    {
                        key: "object",
                        label: "Object",
                        render: (row) => (
                            <span className="text-muted-foreground">
                                {row.targetType ? (
                                    <>
                                        {row.targetType}
                                        {row.targetId && (
                                            <>
                                                {" · "}
                                                <span className="font-mono text-xs">{row.targetId}</span>
                                            </>
                                        )}
                                    </>
                                ) : (
                                    targetLabel(row)
                                )}
                            </span>
                        ),
                    },
                    {
                        key: "scope",
                        label: "Scope",
                        render: (row) => (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                {moduleLabel(row.module)}
                            </span>
                        ),
                    },
                    {
                        key: "ip",
                        label: "IP",
                        render: (row) => <span className="text-xs text-muted-foreground">{row.ipAddress ?? "-"}</span>,
                    },
                ]}
            />

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>
                    {from}-{to} of {formatNumber(page.total)}
                </span>
                <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" className="h-8 bg-card" onClick={() => onPageChange(pageNumber - 1)} disabled={pageNumber <= 1}>
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

            <AuditRowDrawer
                row={open}
                onOpenChange={(isOpen) => {
                    if (!isOpen) setOpen(null);
                }}
                onShowTimeline={(target) => {
                    setOpen(null);
                    onFilterChange({ target, module: null });
                }}
            />
        </div>
    );
}
