"use client";

import * as React from "react";
import Link from "next/link";
import { BookOpen, Check, ChevronLeft, ChevronRight, Download, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { FileDropzone } from "@/components/adx/file-dropzone";
import { FilterChips } from "@/components/adx/filter-chips";
import { KpiCard } from "@/components/adx/kpi-card";
import { fetchPrivateBlob } from "@/components/adx/private-file";
import { StatusBadge } from "@/components/adx/status-badge";
import { apiConfig } from "@/lib/api-config";
import { formatDateTime } from "@/lib/format";
import type { PartyImport, PartyImportApi, PartyImportRow } from "@/services/party-imports";
import { FormatGuidePanel, saveBlob } from "./format-guide-panel";
import { IMPORT_STATUS_META, IMPORT_STEPS, OUTCOME_META, badColumnOf, rowsFor, stepOf, tilesOf, type OutcomeChip } from "./import-steps";
import type { ImportPublisher, PartyImportConfig } from "./party-import-config";
import { PublisherPicker } from "./publisher-picker";

export interface LoadedImport {
    /** The import in front of the reviewer — `?id=` — or null at the upload step. */
    current: PartyImport | null;
    /** The party's history, newest first. */
    history: PartyImport[];
    /** Package U: the publisher a listings or rate-card import is for — off the URL, or the import itself; null on the parties and until picked. */
    publisher: ImportPublisher | null;
}

/** An import to open — its id, and (package U) the publisher it is for, so the URL keeps naming one. */
export interface OpenTarget {
    id: string;
    publisherId?: string | null;
}

interface PartyImportViewProps {
    config: PartyImportConfig;
    /** The routes, already scoped to the publisher when the kind needs one. */
    api: PartyImportApi;
    loaded: LoadedImport;
    /** Open an import's report, or null for the upload step. */
    onOpen: (target: OpenTarget | null) => void;
    /** Package U: the picker chose a publisher (or cleared it) — the page renames the URL. */
    onPublisher: (publisher: ImportPublisher | null) => void;
    onChanged: () => void;
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/**
 * Import <party> — the frame (`Import Publishers · /publishers/import`),
 * on the real three steps for every party since package S: upload the CSV
 * (`POST /publishers/import`, `POST /party-imports/:party`), read the
 * validation report the server answers with, commit or revoke. The header
 * names the file the server holds, the tiles are its counts, and the grid
 * is its per-row plan. Which party is the `config`'s business.
 *
 * Package U: the format guide (`GET /party-imports/formats/:kind`) stands
 * above the upload and is one button away on the report; the publisher's
 * two kinds gate the upload on the picker and draw their own extras over
 * the grid (map pins, the agreement; rates before → after).
 */
export function PartyImportView({ config, api, loaded, onOpen, onPublisher, onChanged }: PartyImportViewProps) {
    const { current, history, publisher } = loaded;
    const step = stepOf(current);
    const forWhom = publisher ? ` for ${publisher.name}${publisher.displayId ? ` · ${publisher.displayId}` : ""}` : "";

    return (
        <div className="space-y-5">
            <div>
                <Link href={config.section.href} className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
                    <ChevronLeft className="size-4" />
                    {config.section.label}
                </Link>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Import {config.plural}</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {current
                                ? `${current.fileName} · ${plural(current.rowCount, "row")} · uploaded ${formatDateTime(current.createdAt)}${forWhom}`
                                : `A book of ${config.plural} as CSV${forWhom} — validated first, committed once`}
                        </p>
                    </div>
                    {current && <ReportActions config={config} api={api} record={current} onOpen={onOpen} onChanged={onChanged} />}
                </div>
            </div>

            {/* Stepper */}
            <Card className="rounded-lg border-border shadow-none">
                <ol className="flex flex-wrap items-center gap-2 px-5 py-3.5">
                    {IMPORT_STEPS.map((label, index) => {
                        const done = step.done.includes(index as 0 | 1 | 2) && index !== step.active;
                        const active = index === step.active;
                        return (
                            <li key={label} className="flex items-center gap-2">
                                <span
                                    className={cn(
                                        "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                                        done && "bg-success text-white",
                                        active && "bg-primary text-primary-foreground",
                                        !done && !active && "bg-muted text-muted-foreground"
                                    )}
                                >
                                    {done ? <Check className="size-3.5" /> : index + 1}
                                </span>
                                <span className={cn("text-sm font-medium", active ? "text-foreground" : "text-muted-foreground")}>{label}</span>
                                {index < IMPORT_STEPS.length - 1 && <ChevronRight className="size-4 text-muted-foreground/50" />}
                            </li>
                        );
                    })}
                    <span className="ml-auto text-xs text-muted-foreground">
                        Step {step.active + 1} of {IMPORT_STEPS.length}
                        {current?.status === "REVOKED" ? " · revoked" : current?.status === "COMMITTED" ? " · done" : ""}
                    </span>
                </ol>
            </Card>

            {current ? (
                <Report config={config} api={api} record={current} onChanged={onChanged} />
            ) : (
                <UploadStep config={config} api={api} publisher={publisher} onPublisher={onPublisher} onValidated={(record) => onOpen({ id: record.id, publisherId: record.publisherId ?? publisher?.id ?? null })} />
            )}

            <History history={history} currentId={current?.id ?? null} onOpen={onOpen} />
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Step 1 — upload                                                      */
/* ------------------------------------------------------------------ */

interface UploadStepProps {
    config: PartyImportConfig;
    api: PartyImportApi;
    publisher: ImportPublisher | null;
    onPublisher: (publisher: ImportPublisher | null) => void;
    onValidated: (record: PartyImport) => void;
}

function UploadStep({ config, api, publisher, onPublisher, onValidated }: UploadStepProps) {
    const [file, setFile] = React.useState<File | null>(null);
    const [note, setNote] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const required = config.columns.filter((column) => column.required).map((column) => column.key);
    /* Package U: a listings or rate-card file is FOR a publisher — the upload waits for the picker. */
    const gated = Boolean(config.needsPublisher) && !publisher;

    const validate = async () => {
        if (!file || gated) return;
        setBusy(true);
        try {
            const record = await api.validate(file, note);
            toast.success(`${plural(record.rowCount, "row")} validated`, {
                description: `${record.createdCount + record.mergedCount} to create or merge · ${record.invalidCount} invalid · ${record.warningCount} with warnings`,
            });
            onValidated(record);
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The file did not reach ADX.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-5">
            {config.needsPublisher && (
                <Card className="rounded-lg border-border p-5 shadow-none">
                    <h3 className="text-sm font-semibold text-foreground">Whose {config.plural}?</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                        The file is imported on a publisher&rsquo;s behalf: every row lands on their book, and an agent may only import for the publishers they may add
                        spots for.
                    </p>
                    <div className="mt-4 max-w-md">
                        <PublisherPicker id="import-publisher" value={publisher} onChange={onPublisher} />
                    </div>
                </Card>
            )}

            {gated ? (
                <Card className="rounded-lg border-dashed border-border p-5 shadow-none" data-testid="upload-gated">
                    <p className="text-sm text-muted-foreground">Pick the publisher first — the upload opens once the file has someone to belong to.</p>
                </Card>
            ) : (
                <Card className="rounded-lg border-border p-5 shadow-none">
                    <h3 className="text-sm font-semibold text-foreground">Upload the book</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                        One CSV, up to 5 MB, with a header row — the {config.columns.length} columns in the format below, in any order.{" "}
                        {required.length === 1 && required[0] === "mobile" ? (
                            <>
                                <code className="font-mono text-xs">mobile</code> is the only one required — it is the identity a merge matches on.
                            </>
                        ) : (
                            <>
                                Required:{" "}
                                {required.map((key, index) => (
                                    <React.Fragment key={key}>
                                        {index > 0 && ", "}
                                        <code className="font-mono text-xs">{key}</code>
                                    </React.Fragment>
                                ))}
                                {required.includes("mobile") ? "; the mobile is the identity a merge matches on." : "."}
                            </>
                        )}{" "}
                        Nothing is written until you commit.
                    </p>
                    <div className="mt-4">
                        <FileDropzone accept={[".csv"]} file={file} onFile={setFile} hint={config.templateFileName} disabled={busy} />
                    </div>
                    <div className="mt-4 space-y-1.5">
                        <Label htmlFor="import-note">
                            Note <span className="font-normal text-muted-foreground">(optional — kept on the import)</span>
                        </Label>
                        <Input id="import-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder={config.notePlaceholder} maxLength={500} className="h-9" />
                    </div>
                    <div className="mt-4 flex justify-end">
                        <Button onClick={() => void validate()} disabled={!file || busy}>
                            {busy ? "Validating…" : "Validate the file"}
                        </Button>
                    </div>
                </Card>
            )}

            {/* Package U: the format guide — the server's column table, rules and template for this kind. */}
            <FormatGuidePanel kind={config.formatKind} />
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Steps 2 and 3 — the report, and the commit or revoke                */
/* ------------------------------------------------------------------ */

interface ReportActionsProps {
    config: PartyImportConfig;
    api: PartyImportApi;
    record: PartyImport;
    onOpen: (target: OpenTarget | null) => void;
    onChanged: () => void;
}

function ReportActions({ config, api, record, onOpen, onChanged }: ReportActionsProps) {
    const [confirm, setConfirm] = React.useState<"commit" | "revoke" | null>(null);
    const [busy, setBusy] = React.useState(false);
    const tiles = tilesOf(record);
    const open = record.status === "VALIDATED";

    const act = async (action: "commit" | "revoke") => {
        setBusy(true);
        try {
            if (action === "commit") {
                const committed = await api.commit(record.id);
                toast.success(`${plural(committed.createdCount, config.singular)} created, ${committed.mergedCount} merged`, { description: config.commitToast });
            } else {
                await api.revoke(record.id);
                toast.success("Import revoked", { description: "Nothing was written." });
            }
            setConfirm(null);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The import did not reach ADX.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex items-center gap-2">
            {open ? (
                <>
                    <Button variant="outline" className="bg-card" disabled={busy} onClick={() => setConfirm("revoke")}>
                        Cancel import
                    </Button>
                    <Button disabled={busy || tiles.valid === 0} onClick={() => setConfirm("commit")}>
                        Import {plural(tiles.valid, "valid row")}
                    </Button>
                </>
            ) : (
                <>
                    <StatusBadge status={IMPORT_STATUS_META[record.status]} />
                    <Button variant="outline" className="bg-card" onClick={() => onOpen(null)}>
                        Upload another file
                    </Button>
                </>
            )}
            <ConfirmDialog
                open={confirm !== null}
                onOpenChange={(next) => !next && setConfirm(null)}
                title={confirm === "commit" ? `Import ${plural(tiles.valid, "row")}?` : "Cancel this import?"}
                description={confirm === "commit" ? config.commitDescription(record) : "The validated plan is withdrawn and nothing is written. The report stays in the history."}
                confirmLabel={confirm === "commit" ? "Commit the import" : "Revoke"}
                destructive={confirm === "revoke"}
                busy={busy}
                onConfirm={() => confirm && void act(confirm)}
            />
        </div>
    );
}

function Report({ config, api, record, onChanged }: { config: PartyImportConfig; api: PartyImportApi; record: PartyImport; onChanged: () => void }) {
    const [chip, setChip] = React.useState<OutcomeChip>(record.invalidCount > 0 ? "INVALID" : "all");
    const [downloading, setDownloading] = React.useState(false);
    /* Package U: the format guide, reachable again from the report — folded until asked for. */
    const [guide, setGuide] = React.useState(false);
    const rows = record.rows ?? [];
    const visible = rowsFor(rows, chip);
    const tiles = tilesOf(record);
    const count = (outcome: PartyImportRow["outcome"]) => rows.filter((row) => row.outcome === outcome).length;

    /* The report answers with the token like every other route, so it is
       fetched into a blob and handed to the browser rather than linked. */
    const download = async () => {
        setDownloading(true);
        try {
            const blob = await fetchPrivateBlob(`${apiConfig.baseUrl}${api.reportUrl(record.id)}`);
            saveBlob(blob, `${config.party === "publishers" ? "publisher" : config.party}-import-${record.id}.csv`);
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The report could not be fetched.");
        } finally {
            setDownloading(false);
        }
    };

    const cell = (row: PartyImportRow, column: string) => {
        const value = row.data[column];
        return typeof value === "string" && value ? value : "";
    };

    return (
        <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard stat={{ id: "rows", label: "Rows found", value: String(tiles.rows) }} />
                <KpiCard stat={{ id: "valid", label: "Valid", value: String(tiles.valid), deltaTone: "positive", hint: record.status === "COMMITTED" ? "imported" : "ready to import" }} />
                <KpiCard stat={{ id: "errors", label: "Errors", value: String(tiles.errors), deltaTone: tiles.errors ? "negative" : "neutral", hint: "left out of the commit" }} />
                <KpiCard stat={{ id: "warnings", label: "Warnings", value: String(tiles.warnings), hint: "imported with gaps" }} />
            </div>

            {config.reportExtras?.({ record, onChanged })}

            <div className="flex flex-wrap items-center justify-between gap-3">
                <FilterChips<OutcomeChip>
                    value={chip}
                    onChange={setChip}
                    chips={[
                        { value: "all", label: "All", count: rows.length },
                        { value: "INVALID", label: "Errors", count: count("INVALID") },
                        { value: "WARNING", label: "Warnings", count: count("WARNING") },
                        { value: "CREATED", label: "Creates", count: count("CREATED") },
                        { value: "MERGED", label: "Merges", count: count("MERGED") },
                        { value: "SKIPPED", label: "Skipped", count: count("SKIPPED") },
                    ]}
                />
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-8 bg-card" aria-pressed={guide} onClick={() => setGuide((open) => !open)}>
                        <BookOpen className="mr-1.5 size-3.5" aria-hidden />
                        File format
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 bg-card" disabled={downloading} onClick={() => void download()}>
                        <Download className="mr-1.5 size-3.5" aria-hidden />
                        {downloading ? "Fetching…" : "Download report"}
                    </Button>
                </div>
            </div>

            {guide && <FormatGuidePanel kind={config.formatKind} />}

            {visible.length === 0 ? (
                <Card className="rounded-lg border-border p-10 text-center shadow-none">
                    <Check className="mx-auto size-8 text-success" />
                    <p className="mt-3 text-sm font-medium text-foreground">
                        {chip === "all" ? "The file had no rows" : `No ${OUTCOME_META[chip].label.toLowerCase()} rows`}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">Pick another chip to see the rest of the plan.</p>
                </Card>
            ) : (
                <Card className="overflow-hidden rounded-lg border-border shadow-none">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                    <th className="px-4 py-2.5">Row</th>
                                    {config.grid.map((column) => (
                                        <th key={column.key} className="px-4 py-2.5">
                                            {column.label}
                                        </th>
                                    ))}
                                    <th className="px-4 py-2.5">Outcome</th>
                                    <th className="px-4 py-2.5">Message</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map((row) => {
                                    const bad = badColumnOf(row);
                                    const target = row.targetId ? config.targetHref(row.targetId, row.targetUserId) : null;
                                    return (
                                        <tr key={row.id} className="border-b last:border-0">
                                            <td className="px-4 py-3 text-muted-foreground">{row.rowNumber}</td>
                                            {config.grid.map((column, index) => (
                                                <td
                                                    key={column.key}
                                                    className={cn(
                                                        "px-4 py-3",
                                                        bad === column.key ? "font-medium text-danger" : index === 0 ? "font-medium text-foreground" : "text-muted-foreground",
                                                        column.mono && "font-mono text-xs"
                                                    )}
                                                >
                                                    {column.render ? column.render(row) : cell(row, column.key) || (column.key === "mobile" ? "Missing" : "—")}
                                                </td>
                                            ))}
                                            <td className="px-4 py-3">
                                                <StatusBadge status={OUTCOME_META[row.outcome]} />
                                            </td>
                                            <td className="max-w-sm px-4 py-3 text-xs text-muted-foreground">
                                                {row.message ?? "—"}
                                                {target && (
                                                    <>
                                                        {" "}
                                                        <Link href={target} className="text-primary underline-offset-4 hover:underline">
                                                            open
                                                        </Link>
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            <div className="flex items-start gap-3 rounded-lg border border-warning/20 bg-warning-soft px-4 py-3">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                <div className="text-sm">
                    <p className="font-medium text-foreground">{config.rules.title}</p>
                    <p className="mt-0.5 text-muted-foreground">{config.rules.body}</p>
                </div>
            </div>
        </>
    );
}

/* ------------------------------------------------------------------ */
/* History                                                              */
/* ------------------------------------------------------------------ */

function History({ history, currentId, onOpen }: { history: PartyImport[]; currentId: string | null; onOpen: (target: OpenTarget) => void }) {
    if (history.length === 0) return null;
    return (
        <Card className="rounded-lg border-border shadow-none">
            <div className="border-b px-5 py-3">
                <h3 className="text-sm font-semibold text-foreground">Imports</h3>
                <p className="text-xs text-muted-foreground">Every book uploaded, newest first. Open one to read its report again.</p>
            </div>
            <ul className="divide-y">
                {history.map((record) => (
                    <li key={record.id}>
                        <button
                            type="button"
                            onClick={() => onOpen({ id: record.id, publisherId: record.publisherId ?? null })}
                            aria-current={record.id === currentId ? "true" : undefined}
                            className={cn("flex w-full flex-wrap items-center gap-3 px-5 py-3 text-left text-sm hover:bg-muted/40", record.id === currentId && "bg-muted/60")}
                        >
                            <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium text-foreground">{record.fileName}</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                    {formatDateTime(record.createdAt)} · {record.rowCount} rows · {record.createdCount} to create · {record.mergedCount} merged · {record.invalidCount} invalid
                                    {record.note ? ` · ${record.note}` : ""}
                                </span>
                            </span>
                            <StatusBadge status={IMPORT_STATUS_META[record.status]} />
                        </button>
                    </li>
                ))}
            </ul>
        </Card>
    );
}
