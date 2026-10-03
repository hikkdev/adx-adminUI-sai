"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FilterChips, type FilterChip } from "@/components/adx/filter-chips";
import { KpiCard } from "@/components/adx/kpi-card";
import { PrivateFileLink } from "@/components/adx/private-file";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { SectionCard } from "@/components/adx/section-card";
import { SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { useApiResource, type ApiResource } from "@/lib/use-api-resource";
import { SETTING_BOUNDS, changedKeys, parseBounded, settingsService, type PlatformSettings, type StorageSettings } from "@/services/settings";
import {
    UNREFERENCED_PAGE_SIZE,
    VISIBILITY_META,
    formatStorageBytes,
    listableUnreferenced,
    purposeLabel,
    purposeRowKey,
    purposesBySize,
    removableLine,
    storageService,
    sweepLine,
    sweepRunLine,
    unreferencedTotals,
    visibilityTotals,
    type StorageLargestFile,
    type StoragePurposeRow,
    type StorageSummary,
    type StorageSweepState,
    type UnreferencedFile,
    type UnreferencedPage, sweepFailureLine } from "@/services/storage";

interface StorageViewProps {
    summary: StorageSummary;
    /** The platform row, read on its own: the removal switch is `settings.storage`. */
    settings: ApiResource<PlatformSettings | null>;
    /** `system.jobs` — the power every "run it now" door asks for. */
    mayRunJobs: boolean;
    /** `settings.edit` — the switch and the grace period. */
    mayEdit: boolean;
    /** Re-reads the report and the row after a check or a save. */
    onChanged: () => void;
}

/** The warning under the switch, in the owner's words for what removal means. */
export const REMOVAL_WARNING = "Files nothing on the platform refers to are removed after the grace period. Check the list first.";

const plural = (count: number, noun: string) => `${formatNumber(count)} ${noun}${count === 1 ? "" : "s"}`;

/**
 * ST-4 (28 Sep 2026): Settings › Storage — how the one bucket is used.
 *
 * Read top to bottom the way the owner asked to work it: what is stored and
 * who can open it, the weekly sweep and what it last found, every folder,
 * the files nothing refers to (with the day each becomes removable), the
 * largest files, and last the switch that lets the sweep remove — off until
 * somebody has read the list above it. The retention-governed purposes
 * (KYC, money, agreements, disputes, call recordings, exports, reports) are
 * never removed by the sweep whatever the switch says; they are named here
 * so nobody has to wonder.
 */
export function StorageView({ summary, settings, mayRunJobs, mayEdit, onChanged }: StorageViewProps) {
    const rows = summary.byPurpose;
    const publicSide = visibilityTotals(rows, "PUBLIC");
    const privateSide = visibilityTotals(rows, "PRIVATE");
    const unreferenced = unreferencedTotals(rows);

    return (
        <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="storage-totals">
                <KpiCard stat={{ id: "stored", label: "Stored", value: formatStorageBytes(summary.totals.bytes), hint: plural(summary.totals.files, "file") }} />
                <KpiCard stat={{ id: "public", label: "Public", value: formatStorageBytes(publicSide.bytes), hint: `${plural(publicSide.files, "file")} · anyone with the link` }} />
                <KpiCard stat={{ id: "private", label: "Private", value: formatStorageBytes(privateSide.bytes), hint: `${plural(privateSide.files, "file")} · opened with a sign-in` }} />
                <KpiCard stat={{ id: "unreferenced", label: "Unreferenced", value: formatStorageBytes(unreferenced.bytes), hint: `${plural(unreferenced.files, "file")} nothing refers to` }} />
            </div>

            <SweepCard sweep={summary.sweep} mayRunJobs={mayRunJobs} onChanged={onChanged} />

            <SectionCard title="By purpose" description={`Every folder in the bucket, what it holds and who can open it. Counted ${formatDateTime(summary.generatedAt)}.`} contentClassName="p-0">
                <PurposeTable rows={rows} protectedPurposes={summary.sweep.protectedPurposes} />
            </SectionCard>

            <UnreferencedCard summary={summary} />

            <SectionCard title="Largest files" description="The 25 heaviest files in the register, whatever their purpose" contentClassName="p-0">
                <LargestTable files={summary.largest} />
            </SectionCard>

            <RemovalCard resource={settings} sweep={summary.sweep} mayEdit={mayEdit} onSaved={onChanged} />
        </div>
    );
}

/* ── The sweep ─────────────────────────────────────────────────────────── */

function SweepCard({ sweep, mayRunJobs, onChanged }: { sweep: StorageSweepState; mayRunJobs: boolean; onChanged: () => void }) {
    const [checking, setChecking] = React.useState(false);

    async function check() {
        setChecking(true);
        try {
            const run = await storageService.sweep();
            toast.success("Storage checked", { description: sweepRunLine(run) });
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not check the storage.");
        } finally {
            setChecking(false);
        }
    }

    return (
        <SectionCard
            title="Weekly sweep"
            description="Once a week ADX checks every file older than a day against everything on the platform that can refer to one, and marks the files nothing refers to. A file that is referred to again loses its mark."
            actions={
                <Button size="sm" variant="outline" onClick={() => void check()} disabled={!mayRunJobs || checking} title={mayRunJobs ? undefined : "Needs the system.jobs permission"} data-testid="storage-check-now">
                    {checking ? "Checking…" : "Check now"}
                </Button>
            }
        >
            <div className="space-y-1.5 text-sm">
                <p className="text-foreground" data-testid="storage-last-sweep">
                    {sweepLine(sweep)}
                </p>
                {sweepFailureLine(sweep) && (
                    <p className="text-danger" data-testid="storage-sweep-failure">
                        {sweepFailureLine(sweep)}
                    </p>
                )}
                <p className="text-muted-foreground" data-testid="storage-removal-state">
                    {sweep.removeEnabled
                        ? `Removal is on: a file unreferenced for ${plural(sweep.graceDays, "day")} is removed at the next weekly sweep.`
                        : "Removal is off: the sweep marks files and removes nothing."}{" "}
                    Check now runs the check at once and never removes a file.
                </p>
                {!mayRunJobs && <p className="text-xs text-muted-foreground">Your role cannot run jobs by hand (system.jobs), so Check now is not available to you.</p>}
            </div>
        </SectionCard>
    );
}

/* ── By purpose ────────────────────────────────────────────────────────── */

function PurposeTable({ rows, protectedPurposes }: { rows: StoragePurposeRow[]; protectedPurposes: string[] }) {
    return (
        <SimpleTable<StoragePurposeRow>
            className="rounded-none border-0"
            rows={purposesBySize(rows)}
            rowKey={purposeRowKey}
            emptyMessage="Nothing has been uploaded yet."
            columns={[
                {
                    key: "purpose",
                    label: "Purpose",
                    render: (row) => (
                        <div className="min-w-0">
                            <p className="font-medium text-foreground">{purposeLabel(row.purpose)}</p>
                            <p className="font-mono text-[11px] text-muted-foreground">{row.folder}</p>
                        </div>
                    ),
                },
                { key: "visibility", label: "Who can open", render: (row) => <StatusBadge status={VISIBILITY_META[row.visibility] ?? { label: row.visibility, tone: "neutral" }} /> },
                { key: "files", label: "Files", className: "text-right tabular-nums", render: (row) => formatNumber(row.files) },
                { key: "bytes", label: "Size", className: "text-right tabular-nums", render: (row) => formatStorageBytes(row.bytes) },
                {
                    key: "unreferenced",
                    label: "Unreferenced",
                    className: "text-right tabular-nums",
                    render: (row) => (
                        <div data-testid={`storage-purpose-unreferenced-${purposeRowKey(row)}`}>
                            <p className={row.unreferencedFiles > 0 ? "text-foreground" : "text-muted-foreground"}>{row.unreferencedFiles > 0 ? `${formatNumber(row.unreferencedFiles)} · ${formatStorageBytes(row.unreferencedBytes)}` : "—"}</p>
                            {protectedPurposes.includes(row.purpose) && <p className="text-[11px] text-muted-foreground">Kept by its own retention rule</p>}
                        </div>
                    ),
                },
            ]}
        />
    );
}

/* ── The unreferenced list ─────────────────────────────────────────────── */

const ALL = "__all__";

function UnreferencedCard({ summary }: { summary: StorageSummary }) {
    const [purpose, setPurpose] = React.useState<string>(ALL);
    const [page, setPage] = React.useState(1);
    const chosen = purpose === ALL ? null : purpose;
    // The report's own stamp in the key: a check or a save re-reads the report, and the list follows it.
    const resource = useApiResource<UnreferencedPage>(`settings:storage:unreferenced:${chosen ?? ""}:${page}:${summary.generatedAt}`, () =>
        storageService.unreferenced({ purpose: chosen, page, pageSize: UNREFERENCED_PAGE_SIZE })
    );

    const { removeEnabled, graceDays, protectedPurposes } = summary.sweep;
    // The list leaves the protected purposes out, so the chips and their counts do too.
    const listable = listableUnreferenced(summary.byPurpose, protectedPurposes);
    const chips: FilterChip<string>[] = [
        { value: ALL, label: "All", count: listable.reduce((sum, row) => sum + row.files, 0) },
        ...listable.map((row) => ({ value: row.purpose, label: purposeLabel(row.purpose), count: row.files })),
    ];

    return (
        <SectionCard
            title="Unreferenced files"
            description={
                removeEnabled
                    ? `Files nothing on the platform refers to. Each is removed at the first weekly sweep after the date shown (${plural(graceDays, "day")} after it was first found unreferenced). Purposes with their own retention rule are not listed.`
                    : "Files nothing on the platform refers to. Removal is off, so nothing here is removed until it is switched on below — read this list first. Purposes with their own retention rule are not listed."
            }
        >
            <div className="space-y-3">
                {chips.length > 1 && (
                    <FilterChips
                        chips={chips}
                        value={purpose}
                        onChange={(next) => {
                            setPurpose(next);
                            setPage(1);
                        }}
                    />
                )}
                <ResourceBoundary resource={resource}>
                    {(data) => (
                        <div className="space-y-3">
                            <SimpleTable<UnreferencedFile>
                                rows={data.items}
                                rowKey={(file) => file.id}
                                emptyMessage={chosen ? `No ${purposeLabel(chosen).toLowerCase()} file is unreferenced.` : "Every stored file is referred to by something on the platform."}
                                columns={[
                                    {
                                        key: "file",
                                        label: "File",
                                        render: (file) => (
                                            <div className="min-w-0 max-w-xs">
                                                <PrivateFileLink href={file.url} className="block truncate font-medium text-foreground underline-offset-4 hover:underline" title={file.filename}>
                                                    {file.filename}
                                                </PrivateFileLink>
                                                <p className="truncate text-[11px] text-muted-foreground">{file.mimeType}</p>
                                            </div>
                                        ),
                                    },
                                    { key: "purpose", label: "Purpose", render: (file) => <span className="text-muted-foreground">{purposeLabel(file.purpose)}</span> },
                                    { key: "size", label: "Size", className: "text-right tabular-nums", render: (file) => formatStorageBytes(file.sizeBytes) },
                                    { key: "since", label: "Unreferenced since", render: (file) => formatDate(file.unreferencedSince) },
                                    {
                                        key: "removable",
                                        label: "Removable",
                                        render: (file) => (
                                            <span className="text-muted-foreground" data-testid={`storage-removable-${file.id}`}>
                                                {removableLine(file, protectedPurposes)}
                                            </span>
                                        ),
                                    },
                                ]}
                            />
                            <Pager page={data} onPage={setPage} />
                        </div>
                    )}
                </ResourceBoundary>
            </div>
        </SectionCard>
    );
}

function Pager({ page, onPage }: { page: UnreferencedPage; onPage: (page: number) => void }) {
    if (page.total <= page.pageSize) return null;
    const pages = Math.max(1, Math.ceil(page.total / page.pageSize));
    const from = (page.page - 1) * page.pageSize + 1;
    const to = Math.min(page.total, page.page * page.pageSize);
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span className="tabular-nums">
                {formatNumber(from)}–{formatNumber(to)} of {formatNumber(page.total)}
            </span>
            <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page.page <= 1} onClick={() => onPage(page.page - 1)}>
                    Previous
                </Button>
                <span className="tabular-nums">
                    Page {page.page} of {pages}
                </span>
                <Button size="sm" variant="outline" disabled={page.page >= pages} onClick={() => onPage(page.page + 1)}>
                    Next
                </Button>
            </div>
        </div>
    );
}

/* ── The largest files ─────────────────────────────────────────────────── */

function LargestTable({ files }: { files: StorageLargestFile[] }) {
    return (
        <SimpleTable<StorageLargestFile>
            className="rounded-none border-0"
            rows={files}
            rowKey={(file) => file.id}
            emptyMessage="Nothing has been uploaded yet."
            columns={[
                {
                    key: "file",
                    label: "File",
                    render: (file) => (
                        <div className="min-w-0 max-w-xs">
                            <p className="truncate font-medium text-foreground" title={file.filename}>
                                {file.filename}
                            </p>
                            <p className="truncate text-[11px] text-muted-foreground">{file.mimeType}</p>
                        </div>
                    ),
                },
                { key: "purpose", label: "Purpose", render: (file) => <span className="text-muted-foreground">{purposeLabel(file.purpose)}</span> },
                { key: "size", label: "Size", className: "text-right tabular-nums", render: (file) => formatStorageBytes(file.sizeBytes) },
                {
                    key: "uploaded",
                    label: "Uploaded",
                    render: (file) => (
                        <div>
                            <p>{formatDate(file.createdAt)}</p>
                            <p className="text-[11px] text-muted-foreground">{file.uploadedBy?.name ?? "—"}</p>
                        </div>
                    ),
                },
            ]}
        />
    );
}

/* ── The switch ────────────────────────────────────────────────────────── */

function RemovalCard({ resource, sweep, mayEdit, onSaved }: { resource: ApiResource<PlatformSettings | null>; sweep: StorageSweepState; mayEdit: boolean; onSaved: () => void }) {
    const protectedNames = sweep.protectedPurposes.map(purposeLabel).join(", ");
    return (
        <SectionCard title="Removal" description="Whether the weekly sweep may remove the files it has marked, and how long it waits first">
            <ResourceBoundary resource={resource}>
                {(settings) =>
                    settings?.storage ? (
                        <RemovalForm key={JSON.stringify(settings.storage)} settings={settings.storage} mayEdit={mayEdit} onSaved={onSaved} />
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            This backend does not serve the <code className="rounded bg-muted px-1 py-0.5 text-xs">storage</code> section of the platform row, so removal cannot be switched on here. Nothing is removed while it is missing.
                        </p>
                    )
                }
            </ResourceBoundary>
            {protectedNames && <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">Never removed by the sweep, whatever the switch says — each has its own retention rule: {protectedNames}.</p>}
        </SectionCard>
    );
}

function RemovalForm({ settings, mayEdit, onSaved }: { settings: StorageSettings; mayEdit: boolean; onSaved: () => void }) {
    const [removeUnreferenced, setRemoveUnreferenced] = React.useState(settings.removeUnreferenced);
    const [graceDays, setGraceDays] = React.useState(String(settings.graceDays));
    const [busy, setBusy] = React.useState(false);
    const bounds = SETTING_BOUNDS["storage.graceDays"];
    const parsedGrace = parseBounded(graceDays, bounds);
    const next: StorageSettings | null = parsedGrace === null ? null : { removeUnreferenced, graceDays: parsedGrace };
    const patch = next ? changedKeys(settings as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>) : null;
    const dirty = patch !== null && Object.keys(patch).length > 0;

    async function save() {
        if (!patch || !dirty || busy || !mayEdit) return;
        setBusy(true);
        try {
            await settingsService.update({ storage: patch as Partial<StorageSettings> });
            toast.success("Storage settings saved", { description: next?.removeUnreferenced ? "The next weekly sweep removes what has been unreferenced for the grace period." : "The sweep keeps marking and removes nothing." });
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not save the storage settings.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <form
            className="space-y-3"
            onSubmit={(event) => {
                event.preventDefault();
                void save();
            }}
        >
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <Label htmlFor="storage-remove">Remove unreferenced files</Label>
                    <div className="flex h-9 items-center gap-3">
                        <Switch id="storage-remove" checked={removeUnreferenced} onCheckedChange={setRemoveUnreferenced} disabled={!mayEdit || busy} />
                        <span className="text-sm text-muted-foreground">{removeUnreferenced ? "On — removed after the grace period" : "Off — the sweep only marks"}</span>
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="storage-grace">
                        Grace period <span className="text-muted-foreground">(days, {bounds.min} to {bounds.max})</span>
                    </Label>
                    <Input
                        id="storage-grace"
                        inputMode="numeric"
                        value={graceDays}
                        onChange={(event) => setGraceDays(event.target.value)}
                        disabled={!mayEdit || busy}
                        className="w-32 tabular-nums"
                        aria-invalid={parsedGrace === null ? true : undefined}
                    />
                </div>
            </div>
            <p className="flex items-start gap-1.5 text-xs text-warning" data-testid="storage-warning">
                <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
                {REMOVAL_WARNING}
            </p>
            <div className="flex items-center justify-between gap-3 pt-1">
                <p className="text-xs text-muted-foreground">{mayEdit ? "Read by the next weekly sweep." : "Your role can read this but not change it — that needs Edit settings."}</p>
                <Button type="submit" size="sm" disabled={!mayEdit || !dirty || busy}>
                    {busy ? "Saving…" : "Save"}
                </Button>
            </div>
        </form>
    );
}
