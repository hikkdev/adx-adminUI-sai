"use client";

import * as React from "react";
import { Download, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { FilterChips } from "@/components/adx/filter-chips";
import { KpiCard } from "@/components/adx/kpi-card";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDateTime, formatNumber } from "@/lib/format";
import {
    CADENCE_LABEL,
    REPORT_FORMATS,
    RUN_STATUS_META,
    SCHEDULE_STATUS_META,
    WINDOW_PRESETS,
    WINDOW_PRESET_LABEL,
    canDownload,
    declaredFilters,
    filtersFor,
    reportsService,
    scheduleWindow,
    windowProblem,
    type ReportFormat,
    type ReportKind,
    type ReportRun,
    type ReportSchedule,
    type ReportWindow,
    type WindowPreset,
} from "@/services/reports";
import { ReportFilters } from "./report-filters";
import type { ReportsData, RunChip, ScheduleChip } from "./reports-loader";
import { ScheduleDialog } from "./schedule-dialog";

interface ReportsViewProps {
    data: ReportsData;
    runChip: RunChip;
    onRunChipChange: (chip: RunChip) => void;
    scheduleChip: ScheduleChip;
    onScheduleChipChange: (chip: ScheduleChip) => void;
    onChanged: () => void;
}

/**
 * "Scheduled exports · /settings/exports" on DR 10 (5102:46196), now
 * `/settings/reports` — Lot G (package CG4, Q129).
 *
 * The frame is kept: the title row with its history button, the tile row,
 * the chip row, the schedules table with its Format / Frequency /
 * Recipients / Next run / Status columns and the form beside it. What is
 * behind it is the `reports` module: the catalogue of twelve kinds
 * (`GET /reports/catalogue`) with Run now (`POST /reports/run` → a run
 * row with Download once READY, through the blob helper), the schedules
 * over `GET/POST/PATCH/DELETE /reports/schedules`, and the history over
 * `GET /reports/runs` under the list contract.
 *
 * The five literal schedules and the four literal tiles are deleted. The
 * tiles that remain are counts the two list reads carry: schedules by
 * status and runs by status. G11-2: a run row says who was mailed —
 * `mailedTo` addresses at `mailedAt`, null for a run by hand — and the
 * history prints it. G13-B/C: the frame's "Delivered this week" and
 * "Unique recipients" tiles read the runs page's `summary` —
 * `mailedThisWeek` (with `readyThisWeek` under it) and `uniqueRecipients`
 * across the enabled schedules — in place of the two counts that stood in
 * for them; a server without the summary draws them as "—". The schedule
 * form's Date range is an optional fixed window written to
 * `filters.window`. XLSX is gone because the server renders CSV and PDF.
 */
export function ReportsView({ data, runChip, onRunChipChange, scheduleChip, onScheduleChipChange, onChanged }: ReportsViewProps) {
    const { catalogue, schedules, runs } = data;
    const [editing, setEditing] = React.useState<{ schedule: ReportSchedule | null; kind?: string } | null>(null);
    const [deleting, setDeleting] = React.useState<ReportSchedule | null>(null);
    const [busyId, setBusyId] = React.useState<string | null>(null);
    const [showHistory, setShowHistory] = React.useState(true);

    const kindName = (kind: string) => catalogue.find((entry) => entry.kind === kind)?.name ?? kind;
    /* G11-2: a stored filter printed by its label where the catalogue names one. */
    const filterLabel = (kind: string, field: string) => catalogue.find((entry) => entry.kind === kind)?.filterLabels?.[field] ?? field;
    const scheduleCounts = schedules.counts;
    const runCounts = runs.counts;
    const sum = (counts: Record<string, number>) => Object.values(counts).reduce((total, n) => total + n, 0);

    async function toggleEnabled(schedule: ReportSchedule) {
        setBusyId(schedule.id);
        try {
            const saved = await reportsService.updateSchedule(schedule.id, { enabled: !schedule.enabled });
            toast.success(saved.enabled ? `"${saved.name}" enabled` : `"${saved.name}" paused`, {
                description: saved.enabled && saved.nextRunAt ? `Next run ${formatDateTime(saved.nextRunAt)}.` : "Nothing is mailed until it is enabled again.",
            });
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not change the schedule.");
        } finally {
            setBusyId(null);
        }
    }

    async function remove() {
        if (!deleting) return;
        setBusyId(deleting.id);
        try {
            await reportsService.deleteSchedule(deleting.id);
            toast.success(`"${deleting.name}" deleted`, { description: "Past runs keep their files." });
            setDeleting(null);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not delete the schedule.");
        } finally {
            setBusyId(null);
        }
    }

    return (
        <div className="space-y-5">
            <PageHeader
                title="Reports"
                subtitle="Twelve reports rendered on demand or on a cadence, mailed as time-limited links"
                actions={
                    <>
                        <Button variant="outline" className="bg-card" onClick={() => setShowHistory((value) => !value)} aria-expanded={showHistory}>
                            {showHistory ? "Hide history" : "Run history"}
                        </Button>
                        <Button onClick={() => setEditing({ schedule: null })} disabled={catalogue.length === 0}>
                            <Plus className="size-4" />
                            New schedule
                        </Button>
                    </>
                }
            />

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard stat={{ id: "active", label: "Active schedules", value: String(scheduleCounts.ENABLED ?? 0), hint: `${scheduleCounts.DISABLED ?? 0} paused` }} />
                <KpiCard
                    stat={{
                        id: "delivered",
                        label: "Delivered this week",
                        value: runs.summary ? String(runs.summary.mailedThisWeek) : "—",
                        hint: runs.summary ? `${runs.summary.readyThisWeek} ready since Monday 00:00 IST` : "this server does not answer the week's summary",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "failed",
                        label: "Failed runs",
                        value: String(runCounts.FAILED ?? 0),
                        deltaTone: (runCounts.FAILED ?? 0) > 0 ? "negative" : "neutral",
                        hint: (runCounts.FAILED ?? 0) > 0 ? "the run row says why" : "all clear",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "recipients",
                        label: "Unique recipients",
                        value: runs.summary ? String(runs.summary.uniqueRecipients) : "—",
                        hint: runs.summary ? "distinct addresses across the enabled schedules" : `${catalogue.length} reports in the catalogue`,
                    }}
                />
            </div>

            <RunNowCard catalogue={catalogue} onRan={onChanged} />

            <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold text-foreground">Schedules</h2>
                    <FilterChips<ScheduleChip>
                        value={scheduleChip}
                        onChange={onScheduleChipChange}
                        chips={[
                            { value: "all", label: "All", count: sum(scheduleCounts) },
                            { value: "ENABLED", label: "Active", count: scheduleCounts.ENABLED ?? 0 },
                            { value: "DISABLED", label: "Paused", count: scheduleCounts.DISABLED ?? 0 },
                        ]}
                    />
                </div>
                <Card className="overflow-hidden rounded-lg border-border shadow-none">
                    <div className="border-b px-5 py-4">
                        <h3 className="text-base font-semibold text-foreground">Scheduled reports</h3>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            {schedules.total} {schedules.total === 1 ? "schedule" : "schedules"} configured · every one fires at 06:00 IST
                        </p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                    <th className="px-5 py-2.5">Report</th>
                                    <th className="px-4 py-2.5">Format</th>
                                    <th className="px-4 py-2.5">Frequency</th>
                                    <th className="px-4 py-2.5">Recipients</th>
                                    <th className="px-4 py-2.5">Next run</th>
                                    <th className="px-4 py-2.5">Status</th>
                                    <th className="px-4 py-2.5 text-right">
                                        <span className="sr-only">Actions</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {schedules.items.map((schedule) => (
                                    <tr key={schedule.id} className="border-b last:border-0">
                                        <td className="px-5 py-3">
                                            <p className="font-medium text-foreground">{schedule.name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {kindName(schedule.kind)}
                                                {Object.keys(declaredFilters(schedule.filters)).length > 0
                                                    ? ` · ${Object.entries(declaredFilters(schedule.filters))
                                                          .map(([key, value]) => `${key}=${value}`)
                                                          .join(", ")}`
                                                    : ""}
                                                {scheduleWindow(schedule.filters)
                                                    ? ` · fixed ${scheduleWindow(schedule.filters)!.from} to ${scheduleWindow(schedule.filters)!.to}`
                                                    : ""}
                                            </p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{schedule.format}</code>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">{CADENCE_LABEL[schedule.cadence]}</td>
                                        <td className="px-4 py-3">
                                            {schedule.recipients.length ? (
                                                <>
                                                    <p className="text-foreground">{schedule.recipients[0]}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {schedule.recipients.length === 1
                                                            ? "Single recipient"
                                                            : `+${schedule.recipients.length - 1} other${schedule.recipients.length === 2 ? "" : "s"}`}
                                                    </p>
                                                </>
                                            ) : (
                                                <p className="text-xs text-muted-foreground">Every admin with an email</p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="text-foreground">{schedule.enabled && schedule.nextRunAt ? formatDateTime(schedule.nextRunAt) : "—"}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {schedule.lastRunAt ? `Last ran ${formatDateTime(schedule.lastRunAt)}` : "Never run"}
                                            </p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge status={SCHEDULE_STATUS_META[schedule.enabled ? "ENABLED" : "DISABLED"]} />
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-end gap-1">
                                                <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busyId === schedule.id} onClick={() => void toggleEnabled(schedule)}>
                                                    {schedule.enabled ? "Pause" : "Enable"}
                                                </Button>
                                                <Button size="icon" variant="ghost" className="size-7" aria-label={`Edit ${schedule.name}`} onClick={() => setEditing({ schedule })}>
                                                    <Pencil className="size-3.5" />
                                                </Button>
                                                <Button size="icon" variant="ghost" className="size-7" aria-label={`Delete ${schedule.name}`} onClick={() => setDeleting(schedule)}>
                                                    <Trash2 className="size-3.5" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {schedules.items.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">
                                            {sum(scheduleCounts) === 0 ? "No schedule yet. Pick a report from the catalogue and set a cadence." : "No schedule in this state."}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </section>

            {showHistory && (
                <section className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-sm font-semibold text-foreground">History</h2>
                        <FilterChips<RunChip>
                            value={runChip}
                            onChange={onRunChipChange}
                            chips={[
                                { value: "all", label: "All", count: sum(runCounts) },
                                { value: "READY", label: "Ready", count: runCounts.READY ?? 0 },
                                { value: "RUNNING", label: "Running", count: runCounts.RUNNING ?? 0 },
                                { value: "FAILED", label: "Failed", count: runCounts.FAILED ?? 0 },
                            ]}
                        />
                    </div>
                    <RunsTable
                        runs={runs.items}
                        total={runs.total}
                        kindName={kindName}
                        filterLabel={filterLabel}
                        scheduleName={(id) => schedules.items.find((row) => row.id === id)?.name ?? null}
                    />
                </section>
            )}

            <ScheduleDialog
                catalogue={catalogue}
                schedule={editing?.schedule ?? null}
                initialKind={editing?.kind}
                open={editing !== null}
                onOpenChange={(open) => {
                    if (!open) setEditing(null);
                }}
                onSaved={onChanged}
            />
            <ConfirmDialog
                open={deleting !== null}
                onOpenChange={(open) => {
                    if (!open) setDeleting(null);
                }}
                title={deleting ? `Delete "${deleting.name}"?` : "Delete schedule?"}
                description="The schedule stops; past runs keep their files and their thirty-day links."
                confirmLabel="Delete"
                destructive
                onConfirm={() => void remove()}
            />
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Run now                                                             */
/* ------------------------------------------------------------------ */

/**
 * The catalogue and the frame's form, side by side: pick a kind, a window
 * (a preset or two dates), the filters the kind declares and a format;
 * `POST /reports/run` renders in the request and the row lands in the
 * history READY with Download, or FAILED with the reason.
 */
function RunNowCard({ catalogue, onRan }: { catalogue: ReportKind[]; onRan: () => void }) {
    const [kindKey, setKindKey] = React.useState(catalogue[0]?.kind ?? "");
    const [preset, setPreset] = React.useState<WindowPreset | "custom">("yesterday");
    const [from, setFrom] = React.useState("");
    const [to, setTo] = React.useState("");
    const [format, setFormat] = React.useState<ReportFormat>("CSV");
    const [typed, setTyped] = React.useState<Record<string, string>>({});
    const [busy, setBusy] = React.useState(false);
    const [last, setLast] = React.useState<ReportRun | null>(null);

    const kind = catalogue.find((entry) => entry.kind === kindKey) ?? null;
    const window: ReportWindow = preset === "custom" ? { from, to } : { preset };
    const problem = kind ? windowProblem(window) : "Pick a report.";

    const run = async () => {
        if (!kind || problem) {
            toast.error(problem ?? "Pick a report.");
            return;
        }
        setBusy(true);
        try {
            const result = await reportsService.run({ kind: kind.kind, format, filters: filtersFor(kind, typed), window });
            setLast(result);
            toast.success(`${kind.name} ready`, {
                description: `${formatNumber(result.rowCount ?? 0)} ${result.rowCount === 1 ? "row" : "rows"} as ${result.format}. Download from the row, or the history below; the file lives thirty days.`,
            });
            onRan();
        } catch (cause) {
            const detail = cause instanceof ApiError ? (cause.details as { runId?: string; error?: string } | undefined) : undefined;
            toast.error(cause instanceof ApiError ? cause.message : "The report could not be rendered.", {
                description: detail?.error ?? undefined,
            });
            onRan();
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="grid gap-4 xl:grid-cols-3">
            <Card className="overflow-hidden rounded-lg border-border shadow-none xl:col-span-2">
                <div className="border-b px-5 py-4">
                    <h3 className="text-base font-semibold text-foreground">Catalogue</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">The twelve reports the server renders, as code defines them.</p>
                </div>
                <ul className="divide-y">
                    {catalogue.map((entry) => (
                        <li key={entry.kind} className="flex items-start justify-between gap-4 px-5 py-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setKindKey(entry.kind);
                                    setTyped({});
                                }}
                                className={cn("min-w-0 flex-1 text-left", entry.kind === kindKey && "text-foreground")}
                                aria-pressed={entry.kind === kindKey}
                            >
                                <p className={cn("text-sm font-medium", entry.kind === kindKey ? "text-primary" : "text-foreground")}>{entry.name}</p>
                                <p className="text-xs text-muted-foreground">{entry.description}</p>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                    <code className="font-mono">{entry.kind}</code> · {entry.columns.length} columns
                                    {entry.filters.length ? ` · filters: ${entry.filters.map((filter) => filter.label).join(", ")}` : " · no filters"}
                                </p>
                            </button>
                        </li>
                    ))}
                    {catalogue.length === 0 && <li className="px-5 py-10 text-center text-sm text-muted-foreground">The catalogue is empty — the server defines none.</li>}
                </ul>
            </Card>

            <Card className="h-fit rounded-lg border-border p-5 shadow-none">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Run now</h3>
                <p className="mt-1 text-xs text-muted-foreground">Rendered in the request; the file lives thirty days.</p>
                <div className="mt-4 space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="run-kind">Report</Label>
                        <Select
                            value={kindKey}
                            onValueChange={(value) => {
                                setKindKey(value);
                                setTyped({});
                            }}
                        >
                            <SelectTrigger id="run-kind">
                                <SelectValue placeholder="Pick a report" />
                            </SelectTrigger>
                            <SelectContent>
                                {catalogue.map((entry) => (
                                    <SelectItem key={entry.kind} value={entry.kind}>
                                        {entry.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="run-window">Date range</Label>
                        <Select value={preset} onValueChange={(value) => setPreset(value as WindowPreset | "custom")}>
                            <SelectTrigger id="run-window">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {WINDOW_PRESETS.map((option) => (
                                    <SelectItem key={option} value={option}>
                                        {WINDOW_PRESET_LABEL[option]}
                                    </SelectItem>
                                ))}
                                <SelectItem value="custom">Custom window</SelectItem>
                            </SelectContent>
                        </Select>
                        {preset === "custom" && (
                            <div className="flex items-center gap-2">
                                <Input type="date" aria-label="From" value={from} onChange={(event) => setFrom(event.target.value)} />
                                <span className="text-xs text-muted-foreground">to</span>
                                <Input type="date" aria-label="To" value={to} onChange={(event) => setTo(event.target.value)} />
                            </div>
                        )}
                        <p className={cn("text-xs", problem && kind ? "text-danger" : "text-muted-foreground")}>
                            {problem && kind ? problem : "Indian days, inclusive; a custom window spans at most a year."}
                        </p>
                    </div>
                    <ReportFilters kind={kind} idPrefix="run" typed={typed} onChange={(key, value) => setTyped((current) => ({ ...current, [key]: value }))} />
                    <div className="space-y-1.5">
                        <Label>Format</Label>
                        <div className="flex gap-1.5">
                            {REPORT_FORMATS.map((option) => (
                                <button
                                    key={option}
                                    type="button"
                                    onClick={() => setFormat(option)}
                                    aria-pressed={format === option}
                                    className={cn(
                                        "h-8 flex-1 rounded-lg border text-xs font-medium transition-colors",
                                        format === option ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    {option}
                                </button>
                            ))}
                        </div>
                    </div>
                    <Button className="w-full" onClick={() => void run()} disabled={busy || !kind || problem !== null}>
                        <Play className="size-4" />
                        {busy ? "Rendering…" : "Run now"}
                    </Button>
                    {last && (
                        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
                            <p className="font-medium text-foreground">
                                {kindNameOf(catalogue, last.kind)} · {formatNumber(last.rowCount ?? 0)} rows · {last.format}
                            </p>
                            <DownloadButton run={last} className="mt-2 w-full" />
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
}

const kindNameOf = (catalogue: ReportKind[], kind: string) => catalogue.find((entry) => entry.kind === kind)?.name ?? kind;

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

function RunsTable({
    runs,
    total,
    kindName,
    filterLabel,
    scheduleName,
}: {
    runs: ReportRun[];
    total: number;
    kindName: (kind: string) => string;
    filterLabel: (kind: string, field: string) => string;
    scheduleName: (id: string) => string | null;
}) {
    return (
        <Card className="overflow-hidden rounded-lg border-border shadow-none">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                            <th className="px-5 py-2.5">Report</th>
                            <th className="px-4 py-2.5">Format</th>
                            <th className="px-4 py-2.5">Started</th>
                            <th className="px-4 py-2.5 text-right">Rows</th>
                            <th className="px-4 py-2.5">Mailed</th>
                            <th className="px-4 py-2.5">Status</th>
                            <th className="px-4 py-2.5 text-right">
                                <span className="sr-only">Download</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {runs.map((run) => (
                            <tr key={run.id} className="border-b last:border-0">
                                <td className="px-5 py-3">
                                    <p className="font-medium text-foreground">{kindName(run.kind)}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {run.scheduleId ? (scheduleName(run.scheduleId) ?? "A schedule") : "Run by hand"}
                                        {run.filters && Object.keys(run.filters).length > 0
                                            ? ` · ${Object.entries(run.filters)
                                                  .map(([key, value]) => `${filterLabel(run.kind, key)}: ${value}`)
                                                  .join(", ")}`
                                            : ""}
                                    </p>
                                </td>
                                <td className="px-4 py-3">
                                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{run.format}</code>
                                </td>
                                <td className="px-4 py-3">
                                    <p className="text-foreground">{formatDateTime(run.startedAt)}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {run.expiresAt ? `Link until ${formatDateTime(run.expiresAt)}` : run.finishedAt ? `Finished ${formatDateTime(run.finishedAt)}` : "Still running"}
                                    </p>
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{run.rowCount === null ? "—" : formatNumber(run.rowCount)}</td>
                                <td className="px-4 py-3 text-muted-foreground">
                                    {run.mailedAt && run.mailedTo !== null && run.mailedTo !== undefined ? (
                                        <>
                                            <p className="tabular-nums text-foreground">
                                                {formatNumber(run.mailedTo)} {run.mailedTo === 1 ? "address" : "addresses"}
                                            </p>
                                            <p className="text-xs">{formatDateTime(run.mailedAt)}</p>
                                        </>
                                    ) : run.mailedTo === undefined ? (
                                        "—"
                                    ) : run.scheduleId ? (
                                        <span className="text-xs">Not mailed</span>
                                    ) : (
                                        <span className="text-xs">By hand</span>
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    <StatusBadge status={RUN_STATUS_META[run.status]} />
                                    {run.error && <p className="mt-0.5 max-w-64 truncate text-xs text-danger">{run.error}</p>}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <DownloadButton run={run} />
                                </td>
                            </tr>
                        ))}
                        {runs.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">
                                    No run in this state.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            {total > runs.length && <p className="border-t px-5 py-2.5 text-xs text-muted-foreground">Showing the newest {runs.length} of {total}.</p>}
        </Card>
    );
}

/** Download through the blob helper — drawn while READY and inside its thirty days; expired says so. */
function DownloadButton({ run, className }: { run: ReportRun; className?: string }) {
    const [busy, setBusy] = React.useState(false);
    const allowed = canDownload(run);
    if (!allowed) {
        if (run.status === "READY") return <span className={cn("text-xs text-muted-foreground", className)}>Expired</span>;
        return null;
    }
    const download = async () => {
        setBusy(true);
        try {
            const { filename, bytes } = await reportsService.download(run);
            toast.success(`Saved ${filename}`, { description: `${Math.max(1, Math.round(bytes / 1024))} KB` });
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "The download failed.");
        } finally {
            setBusy(false);
        }
    };
    return (
        <Button size="sm" variant="outline" className={cn("h-7 bg-card text-xs", className)} disabled={busy} onClick={() => void download()}>
            <Download className="size-3.5" />
            {busy ? "Downloading…" : "Download"}
        </Button>
    );
}
