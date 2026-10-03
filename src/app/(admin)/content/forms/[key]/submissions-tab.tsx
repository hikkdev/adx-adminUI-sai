"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, ArchiveRestore, Download, Inbox, Loader2, MailOpen, MapPinned, Table2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BulkActions, type BulkAction } from "@/components/adx/bulk-actions";
import { CityCombobox } from "@/components/adx/city-combobox";
import { DataTable } from "@/components/adx/data-table";
import { FilterChips } from "@/components/adx/filter-chips";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError, saveBlob } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { countNoun, formatCsv } from "@/lib/bulk";
import { useApiResource } from "@/lib/use-api-resource";
import { cn } from "@/lib/utils";
import { SUBMISSION_STATUS_META, answerText, csvFieldColumns, formsService, submissionsCsvRows, type FormSubmission, type FormSubmissionStatus, type SubmissionColumn, type SubmissionPage } from "@/services/forms";
import { SubmissionsMap } from "./submissions-map";

type StatusFilter = "ALL" | FormSubmissionStatus;
const PAGE_SIZE = 25;

/**
 * FM-1: the answers a form got. A table with one column per field, cut by
 * status, a date range and a city; each row marked read or archived, the
 * whole lot as a CSV, and a map of the answers that carried a location.
 *
 * 28 Sep 2026: rows are selectable — marked read, new or archived together
 * (each the single-answer PATCH), or downloaded as a CSV of just those
 * answers, built here with the server CSV's own columns.
 */
export function SubmissionsTab({ formKey }: { formKey: string }) {
    const { can } = useAuth();
    const mayEdit = can("content.edit");
    const [status, setStatus] = React.useState<StatusFilter>("ALL");
    const [from, setFrom] = React.useState("");
    const [to, setTo] = React.useState("");
    const [cityText, setCityText] = React.useState("");
    const [cityId, setCityId] = React.useState<string | null>(null);
    const [page, setPage] = React.useState(1);
    const [view, setView] = React.useState<"table" | "map">("table");
    const [downloading, setDownloading] = React.useState(false);
    const [marking, setMarking] = React.useState<string | null>(null);

    const query = React.useMemo(
        () => ({
            status: status === "ALL" ? undefined : status,
            from: from ? new Date(from).toISOString() : undefined,
            to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
            cityId: cityId ?? undefined,
            page,
            pageSize: PAGE_SIZE,
        }),
        [status, from, to, cityId, page],
    );
    const resource = useApiResource<SubmissionPage>(`forms:submissions:${formKey}:${JSON.stringify(query)}`, () => formsService.submissions(formKey, query));
    const data = resource.data;
    const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

    async function mark(row: FormSubmission, next: FormSubmissionStatus) {
        setMarking(row.id);
        try {
            await formsService.setSubmissionStatus(formKey, row.id, next);
            resource.reload();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "That did not go through.");
        } finally {
            setMarking(null);
        }
    }

    async function download() {
        setDownloading(true);
        try {
            const file = await formsService.submissionsCsv(formKey);
            saveBlob(file.blob, file.filename ?? `${formKey}-submissions.csv`);
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "The CSV could not be downloaded.");
        } finally {
            setDownloading(false);
        }
    }

    const fields = React.useMemo(() => data?.fields ?? [], [data]);
    const bulkActions = submissionBulkActions(formKey, mayEdit);

    /**
     * The selected answers as a CSV, with the server CSV's columns: its
     * fixed ones, then one per field id across every version (read from the
     * versions the server walks; the columns in view if that read fails).
     */
    async function downloadSelected(rows: FormSubmission[]) {
        let columns: SubmissionColumn[] = fields;
        try {
            const everyVersion = csvFieldColumns(await formsService.versions(formKey));
            if (everyVersion.length > 0) columns = everyVersion;
        } catch {
            // The columns in view still make an honest file.
        }
        saveBlob(new Blob([formatCsv(submissionsCsvRows(rows, columns))], { type: "text/csv;charset=utf-8" }), `form-${formKey}-selected.csv`);
        toast.success(`${countNoun(rows.length, ["answer", "answers"])} downloaded`);
    }

    // Built each render: the answer columns follow the page read, and the row buttons the one being marked.
    const columns: ColumnDef<FormSubmission>[] = [
        {
            id: "when",
            header: "When",
            cell: ({ row: { original: row } }) => (
                <div className="min-w-0">
                    <p className="whitespace-nowrap text-xs text-foreground">{formatDateTime(row.createdAt)}</p>
                    <p className="text-[11px] text-muted-foreground">
                        v{row.formVersion}
                        {row.source ? ` · ${row.source}` : ""}
                    </p>
                </div>
            ),
        },
        {
            id: "contact",
            header: "Who",
            cell: ({ row: { original: row } }) => (
                <div className="min-w-0">
                    <p className="text-sm text-foreground">{row.contactName ?? "—"}</p>
                    <p className="text-[11px] text-muted-foreground">{[row.contactEmail, row.contactPhone].filter(Boolean).join(" · ") || "—"}</p>
                </div>
            ),
        },
        {
            id: "where",
            header: "Where",
            cell: ({ row: { original: row } }) => <span className="text-xs text-muted-foreground">{row.address ?? (row.latitude !== null && row.longitude !== null ? `${row.latitude.toFixed(4)}, ${row.longitude.toFixed(4)}` : "—")}</span>,
        },
        ...fields.map(
            (column): ColumnDef<FormSubmission> => ({
                id: `f-${column.id}`,
                header: column.label,
                cell: ({ row: { original: row } }) => <span className="line-clamp-2 max-w-[220px] text-xs text-foreground">{answerText(column.kind, row.answers?.[column.id])}</span>,
            }),
        ),
        {
            id: "went",
            header: "Went to",
            cell: ({ row: { original: row } }) =>
                row.leadId ? (
                    <Link href={`/leads/${row.leadId}`} className="text-xs text-info hover:underline">
                        Lead
                    </Link>
                ) : row.ticketId ? (
                    <Link href={`/support/${row.ticketId}`} className="text-xs text-info hover:underline">
                        Ticket
                    </Link>
                ) : (
                    <span className="text-xs text-muted-foreground">Inbox</span>
                ),
        },
        {
            id: "status",
            header: "Status",
            cell: ({ row: { original: row } }) => <StatusBadge status={SUBMISSION_STATUS_META[row.status] ?? { label: row.status, tone: "neutral" }} />,
        },
        {
            id: "actions",
            header: "",
            cell: ({ row: { original: row } }) =>
                mayEdit ? (
                    <div className="flex justify-end gap-1">
                        {row.status === "NEW" && (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={marking === row.id} onClick={() => void mark(row, "READ")} data-testid={`submission-read-${row.id}`}>
                                Mark read
                            </Button>
                        )}
                        {row.status !== "ARCHIVED" ? (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={marking === row.id} onClick={() => void mark(row, "ARCHIVED")} data-testid={`submission-archive-${row.id}`}>
                                Archive
                            </Button>
                        ) : (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={marking === row.id} onClick={() => void mark(row, "READ")}>
                                Unarchive
                            </Button>
                        )}
                    </div>
                ) : null,
        },
    ];

    return (
        <div className="space-y-4" data-testid="submissions-tab">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-wrap items-end gap-3">
                    <FilterChips<StatusFilter>
                        chips={[
                            { value: "ALL", label: "All" },
                            { value: "NEW", label: "New" },
                            { value: "READ", label: "Read" },
                            { value: "ARCHIVED", label: "Archived" },
                        ]}
                        value={status}
                        onChange={(next) => {
                            setStatus(next);
                            setPage(1);
                        }}
                    />
                    <div className="space-y-1">
                        <Label htmlFor="submissions-from" className="text-xs">
                            From
                        </Label>
                        <Input
                            id="submissions-from"
                            type="date"
                            value={from}
                            onChange={(event) => {
                                setFrom(event.target.value);
                                setPage(1);
                            }}
                            className="h-9 w-40"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="submissions-to" className="text-xs">
                            To
                        </Label>
                        <Input
                            id="submissions-to"
                            type="date"
                            value={to}
                            onChange={(event) => {
                                setTo(event.target.value);
                                setPage(1);
                            }}
                            className="h-9 w-40"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="submissions-city" className="text-xs">
                            City
                        </Label>
                        <CityCombobox
                            id="submissions-city"
                            value={cityText}
                            onChange={(text, city) => {
                                setCityText(text);
                                setCityId(city?.id ?? null);
                                setPage(1);
                            }}
                            placeholder="Any city"
                            className="w-48"
                            stages={["LAUNCHED", "SEEDING", "PAUSED"]}
                        />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex rounded-md border bg-card p-0.5">
                        <Button type="button" variant={view === "table" ? "default" : "ghost"} size="sm" className="h-7 px-2" onClick={() => setView("table")} aria-pressed={view === "table"} data-testid="submissions-view-table">
                            <Table2 className="mr-1 size-3.5" />
                            Table
                        </Button>
                        <Button type="button" variant={view === "map" ? "default" : "ghost"} size="sm" className="h-7 px-2" onClick={() => setView("map")} aria-pressed={view === "map"} data-testid="submissions-view-map">
                            <MapPinned className="mr-1 size-3.5" />
                            Map
                        </Button>
                    </div>
                    <Button type="button" variant="outline" size="sm" className="h-8 bg-card" onClick={() => void download()} disabled={downloading} data-testid="submissions-csv">
                        <Download className="mr-1 size-3.5" />
                        {downloading ? "Preparing…" : "Download CSV"}
                    </Button>
                </div>
            </div>

            {view === "map" ? (
                <SubmissionsMap formKey={formKey} />
            ) : resource.loading && data === null ? (
                <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
                </p>
            ) : resource.error ? (
                <Card className="rounded-lg border-danger/40 bg-danger-soft p-4 text-sm text-danger shadow-none">{resource.error}</Card>
            ) : (
                <div className={cn("space-y-3", resource.loading && "opacity-60")}>
                    <DataTable<FormSubmission, unknown>
                        columns={columns}
                        data={data?.items ?? []}
                        getRowId={(row) => row.id}
                        showColumnToggle={false}
                        showPagination={false}
                        emptyState={<p className="flex h-full items-center justify-center text-sm text-muted-foreground">No answers match.</p>}
                        bulkActions={(selected, _clear, keep) => (
                            <>
                                <BulkActions<FormSubmission>
                                    rows={selected}
                                    actions={bulkActions}
                                    label={(row) => row.contactName ?? row.contactEmail ?? row.id}
                                    onSettled={(outcome) => {
                                        keep(outcome.failed.map((failure) => failure.row));
                                        resource.reload();
                                    }}
                                />
                                <Button variant="outline" size="sm" className="h-8 bg-card" onClick={() => void downloadSelected(selected)} data-testid="submissions-csv-selected">
                                    <Download className="mr-1.5 size-3.5" />
                                    Download selected
                                </Button>
                            </>
                        )}
                    />
                    {data && data.total > data.pageSize && (
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                                {data.total} {data.total === 1 ? "answer" : "answers"} · page {data.page} of {pages}
                            </span>
                            <div className="flex gap-1">
                                <Button variant="outline" size="sm" className="h-7 bg-card" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                                    Previous
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 bg-card" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                                    Next
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export const SUBMISSION_BULK_BLOCKED = "Marking answers needs content.edit.";

/** The submissions tab's bulk marks — the single-answer PATCH per row, `content.edit` as the row buttons are. */
function submissionBulkActions(formKey: string, mayEdit: boolean): BulkAction<FormSubmission>[] {
    const blocked = mayEdit ? null : SUBMISSION_BULK_BLOCKED;
    const set = (status: FormSubmissionStatus) => (row: FormSubmission) => formsService.setSubmissionStatus(formKey, row.id, status);
    return [
        {
            key: "read",
            label: "Mark read",
            icon: MailOpen,
            blocked,
            // An archived answer is brought back by Unarchive, never as a side effect of marking.
            skip: (row) => (row.status === "READ" ? "already read" : row.status === "ARCHIVED" ? "archived" : null),
            participle: "marked read",
            noun: ["answer", "answers"],
            phrase: (count) => `Mark ${count} read`,
            run: set("READ"),
        },
        {
            key: "new",
            label: "Mark new",
            icon: Inbox,
            blocked,
            skip: (row) => (row.status === "NEW" ? "already new" : row.status === "ARCHIVED" ? "archived" : null),
            participle: "marked new",
            noun: ["answer", "answers"],
            phrase: (count) => `Mark ${count} new`,
            run: set("NEW"),
        },
        {
            key: "archive",
            label: "Archive",
            icon: Archive,
            blocked,
            skip: (row) => (row.status === "ARCHIVED" ? "already archived" : null),
            participle: "archived",
            noun: ["answer", "answers"],
            phrase: (count) => `Archive ${count}`,
            description: "Archived answers leave the New and Read views; every answer is kept.",
            run: set("ARCHIVED"),
        },
        {
            key: "unarchive",
            label: "Unarchive",
            icon: ArchiveRestore,
            blocked,
            skip: (row) => (row.status === "ARCHIVED" ? null : "not archived"),
            participle: "unarchived",
            noun: ["answer", "answers"],
            phrase: (count) => `Unarchive ${count}`,
            description: "Each comes back as read, as a single Unarchive does.",
            run: set("READ"),
        },
    ];
}
