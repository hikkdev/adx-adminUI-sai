"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/adx/data-table";
import { FileDropzone } from "@/components/adx/file-dropzone";
import { FormatGuidePanel } from "@/components/adx/party-import/format-guide-panel";
import { SectionCard } from "@/components/adx/section-card";
import { ApiError } from "@/lib/api-client";
import {
    TARGET_FIELDS,
    missingRequired,
    readSheet,
    toImportRows,
    type ParsedSheet,
    type RowProblem,
    type TargetField,
} from "@/lib/market-data-file";
import { pricingService } from "@/services/pricing";
import type { MarketDataRow, Material, MediaType, SizeClass } from "@/types/pricing-engine";

interface Props {
    mediaTypes: MediaType[];
    sizeClasses: SizeClass[];
    materials: Material[];
}

/**
 * Rows per request.
 *
 * The API accepts five thousand, but a single request that large is one timeout
 * away from an operator not knowing whether any of it landed. Chunking gives a
 * progress bar and, more usefully, partial success: eight of ten chunks in
 * means eight thousand rows are comparable rather than none.
 */
const CHUNK = 500;

type ImportOutcome = {
    accepted: number;
    rejected: { row: number; reason: string }[];
    importIds: string[];
};

/**
 * Loading the research team's output.
 *
 * Their fieldwork happens entirely outside this platform. Only the rows land
 * here — and at launch they are very nearly the only comparables that exist, so
 * this screen decides whether the indicator appears for anybody at all.
 *
 * The upload is at the top because it is the reason anyone opens this page. The
 * vocabulary the file is checked against reads below it, where it belongs:
 * useful to consult, not the task.
 */
export function MarketDataView({ mediaTypes, sizeClasses, materials }: Props) {
    const [file, setFile] = React.useState<File | null>(null);
    const [sheet, setSheet] = React.useState<ParsedSheet | null>(null);
    const [mapping, setMapping] = React.useState<Partial<Record<TargetField, string>>>({});
    const [readError, setReadError] = React.useState<string | null>(null);

    const [source, setSource] = React.useState<"RESEARCH" | "RATE_CARD">("RESEARCH");
    const [publisherId, setPublisherId] = React.useState("");
    const [note, setNote] = React.useState("");

    const [busy, setBusy] = React.useState(false);
    const [progress, setProgress] = React.useState(0);
    const [outcome, setOutcome] = React.useState<ImportOutcome | null>(null);

    /**
     * Rows the operator has struck out of this import, by position in the file.
     *
     * Spotting a bad row in the preview and having to go back to the spreadsheet
     * to remove it is the long way round. Excluding it here costs nothing and
     * leaves the file alone, which matters when the file is the research team's
     * and somebody else owns it.
     */
    const [excluded, setExcluded] = React.useState<Set<number>>(new Set());

    async function onFile(picked: File | null) {
        setFile(picked);
        setSheet(null);
        setOutcome(null);
        setReadError(null);
        // Exclusions belong to the file they were made against. Carrying them
        // over silently dropped the same line numbers out of the next file.
        setExcluded(new Set());
        if (!picked) return;
        try {
            const parsed = await readSheet(picked);
            setSheet(parsed);
            setMapping(parsed.guessedMapping);
        } catch (cause) {
            setReadError(cause instanceof Error ? cause.message : "Could not read that file");
        }
    }

    const prepared = React.useMemo(
        () => (sheet ? toImportRows(sheet, mapping) : null),
        [sheet, mapping]
    );

    // `fileRow` comes from the parser, which knows which lines it dropped.
    // Recomputing it from the array index here mislabelled every row after the
    // first unreadable one.
    const keptRows = React.useMemo(
        () => (prepared?.rows ?? []).filter((row) => !excluded.has(row.fileRow)),
        [prepared, excluded]
    );

    const unmapped = missingRequired(mapping);
    const ready =
        prepared !== null &&
        keptRows.length > 0 &&
        unmapped.length === 0 &&
        (source !== "RATE_CARD" || publisherId.trim().length > 0);

    async function runImport() {
        if (!prepared || !file) return;
        setBusy(true);
        setProgress(0);
        setOutcome(null);

        const rejected: RowProblem[] = [...prepared.problems];
        const importIds: string[] = [];
        let accepted = 0;

        try {
            // Excluded rows never leave the browser, so the import and its
            // audit record both describe what was actually sent.
            // Kept whole so a rejection can be traced to its line; the tag is
            // stripped per chunk on the way out.
            const sending = keptRows;
            for (let offset = 0; offset < sending.length; offset += CHUNK) {
                const chunk: MarketDataRow[] = sending
                    .slice(offset, offset + CHUNK)
                    .map(({ fileRow: _fileRow, ...row }) => row);
                const result = await pricingService.importMarketData({
                    source,
                    filename: file.name,
                    note: note.trim() || null,
                    publisherId: source === "RATE_CARD" ? publisherId.trim() : null,
                    rows: chunk,
                });
                accepted += result.acceptedCount;
                importIds.push(result.importId);
                // The API numbers rows within its own request; shifting them back
                // to the file's numbering is what makes a rejection findable in
                // the operator's spreadsheet.
                for (const rejection of result.rejections) {
                    // The API numbers rejections 1-based within its own request.
                    // Mapping back through what was actually sent is the only
                    // correct translation: arithmetic on the offset ignored both
                    // the rows the parser dropped and the ones the operator
                    // excluded, so every rejection after either was misreported.
                    const source = sending[offset + rejection.row - 1];
                    rejected.push({
                        row: source?.fileRow ?? rejection.row + offset,
                        reason: rejection.reason,
                    });
                }
                setProgress(Math.round(((offset + chunk.length) / sending.length) * 100));
            }

            setOutcome({ accepted, rejected, importIds });
            if (accepted > 0) {
                toast.success(`Imported ${accepted} rows`, {
                    description: rejected.length
                        ? `${rejected.length} could not be read — listed below.`
                        : "They are comparable immediately.",
                });
            } else {
                toast.error("Nothing was imported", {
                    description: "Every row was rejected. The reasons are listed below.",
                });
            }
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "The import failed part way", {
                description:
                    accepted > 0
                        ? `${accepted} rows had already landed and are kept. Re-upload the rest.`
                        : undefined,
            });
            if (accepted > 0) setOutcome({ accepted, rejected, importIds });
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-6">
            {/* The task, first. */}
            <SectionCard
                title="Import market data"
                description="A spreadsheet from the research team. Both .xlsx and .csv work."
            >
                <div className="space-y-5">
                    <FileDropzone
                        accept={[".xlsx", ".xls", ".csv"]}
                        file={file}
                        onFile={onFile}
                        disabled={busy}
                        hint="One row per observed spot. Column names are matched automatically and can be corrected below."
                    />

                    {/* Package U: the server's guide to the columns the import takes — the names the mapping below lands on. */}
                    <FormatGuidePanel kind="market-data" collapsible />

                    {readError && (
                        <Card className="rounded-lg border-danger/40 bg-danger-soft p-3 shadow-none">
                            <p className="text-sm text-foreground">{readError}</p>
                        </Card>
                    )}

                    {sheet && (
                        <>
                            <div>
                                <h4 className="text-sm font-semibold text-foreground">
                                    Columns
                                </h4>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    {sheet.rows.length} rows read. Check the guesses — a column
                                    mapped to the wrong field imports a whole sweep at wrong numbers.
                                </p>
                                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {TARGET_FIELDS.map((field) => (
                                        <div key={field.key} className="space-y-1.5">
                                            <Label htmlFor={`map-${field.key}`} className="text-xs">
                                                {field.label}
                                                {field.required && (
                                                    <span className="ml-1 text-danger">*</span>
                                                )}
                                            </Label>
                                            <Select
                                                value={mapping[field.key] ?? "__none__"}
                                                onValueChange={(value) =>
                                                    setMapping((current) => ({
                                                        ...current,
                                                        [field.key]:
                                                            value === "__none__" ? undefined : value,
                                                    }))
                                                }
                                            >
                                                <SelectTrigger id={`map-${field.key}`}>
                                                    <SelectValue placeholder="Not mapped" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="__none__">
                                                        Not mapped
                                                    </SelectItem>
                                                    {sheet.headers.map((header) => (
                                                        <SelectItem key={header} value={header}>
                                                            {header}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-3">
                                <div className="space-y-2">
                                    <Label htmlFor="source">Source</Label>
                                    <Select
                                        value={source}
                                        onValueChange={(value) =>
                                            setSource(value as "RESEARCH" | "RATE_CARD")
                                        }
                                    >
                                        <SelectTrigger id="source">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="RESEARCH">
                                                Competitor research
                                            </SelectItem>
                                            <SelectItem value="RATE_CARD">
                                                Publisher rate card
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                {source === "RATE_CARD" && (
                                    <div className="space-y-2">
                                        <Label htmlFor="publisher">Publisher id</Label>
                                        <Input
                                            id="publisher"
                                            value={publisherId}
                                            onChange={(event) => setPublisherId(event.target.value)}
                                            placeholder="Required"
                                        />
                                    </div>
                                )}
                                <div className="space-y-2">
                                    <Label htmlFor="note">Note</Label>
                                    <Input
                                        id="note"
                                        value={note}
                                        onChange={(event) => setNote(event.target.value)}
                                        placeholder="Mumbai western suburbs, August"
                                    />
                                </div>
                            </div>

                            {prepared && prepared.problems.length > 0 && (
                                <Card className="rounded-lg border-warning/40 bg-warning-soft p-3 shadow-none">
                                    <p className="flex items-start gap-2 text-sm text-foreground">
                                        <AlertTriangle
                                            className="mt-0.5 size-4 shrink-0 text-warning"
                                            aria-hidden
                                        />
                                        {prepared.problems.length} of {sheet.rows.length} rows
                                        cannot be read and will be skipped. They are listed after
                                        the import.
                                    </p>
                                </Card>
                            )}

                            {unmapped.length > 0 && (
                                <p className="text-sm text-danger">
                                    Still to map: {unmapped.join(", ")}
                                </p>
                            )}

                            {busy && <Progress value={progress} className="h-2" />}

                            <div className="flex items-center gap-3">
                                <Button onClick={runImport} disabled={busy || !ready}>
                                    <Upload className="mr-1.5 size-3.5" aria-hidden />
                                    {busy
                                        ? `Importing… ${progress}%`
                                        : `Import ${keptRows.length} rows`}
                                </Button>
                                {prepared && (
                                    <span className="text-xs text-muted-foreground">
                                        {keptRows.length} ready
                                        {prepared.problems.length > 0 &&
                                            `, ${prepared.problems.length} unreadable`}
                                        {excluded.size > 0 && `, ${excluded.size} excluded`}
                                    </span>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </SectionCard>

            {sheet && !outcome && (
                <SectionCard
                    title="Preview"
                    description="The first rows as they will be sent. Sort or search to spot a column that mapped wrong."
                >
                    <DataTable
                        data={keptRows.slice(0, 200)}
                        searchPlaceholder="Search these rows…"
                        initialPageSize={10}
                        bulkActions={(rows, clear) => (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                    setExcluded((current) => {
                                        const next = new Set(current);
                                        for (const row of rows) next.add(row.fileRow);
                                        return next;
                                    });
                                    toast.success(
                                        `Excluded ${rows.length} row${rows.length === 1 ? "" : "s"}`,
                                        { description: "They will not be sent. The file is untouched." }
                                    );
                                    clear();
                                }}
                            >
                                Exclude selected
                            </Button>
                        )}
                        toolbar={
                            excluded.size > 0 ? (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setExcluded(new Set())}
                                >
                                    Restore {excluded.size} excluded
                                </Button>
                            ) : undefined
                        }
                        columns={[
                            {
                                accessorKey: "fileRow",
                                header: "Row",
                            },
                            { accessorKey: "contributorName", header: "Contributor" },
                            {
                                id: "venue",
                                header: "Venue",
                                accessorFn: (row) => row.venueTypeSlug ?? "none",
                            },
                            { accessorKey: "mediaTypeSlug", header: "Media type" },
                            { accessorKey: "sizeClassSlug", header: "Size" },
                            { accessorKey: "ratePerDay", header: "Rate/day" },
                            { accessorKey: "observedAt", header: "Observed" },
                            { accessorKey: "city", header: "City" },
                            { accessorKey: "locality", header: "Locality" },
                        ]}
                    />
                </SectionCard>
            )}

            {outcome && (
                <SectionCard
                    title="Import result"
                    description={`${outcome.accepted} accepted · ${outcome.rejected.length} rejected`}
                    actions={
                        outcome.accepted > 0 ? (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                    try {
                                        let cleared = 0;
                                        for (const id of outcome.importIds) {
                                            cleared += (await pricingService.revokeImport(id))
                                                .deactivated;
                                        }
                                        toast.success(`Cleared ${cleared} rows`, {
                                            description:
                                                "They stay in the audit trail but no longer count as comparables.",
                                        });
                                        setOutcome(null);
                                        setFile(null);
                                        setSheet(null);
                                    } catch {
                                        toast.error("Could not undo this import");
                                    }
                                }}
                            >
                                Undo this import
                            </Button>
                        ) : undefined
                    }
                >
                    {outcome.rejected.length === 0 ? (
                        <p className="flex items-center gap-2 text-sm text-foreground">
                            <CheckCircle2 className="size-4 text-success" aria-hidden />
                            Every row was accepted and is comparable immediately.
                        </p>
                    ) : (
                        <DataTable
                            data={outcome.rejected}
                            searchPlaceholder="Search reasons…"
                            initialPageSize={15}
                            // The job after a failed import is fixing rows in a
                            // spreadsheet, and that means knowing which rows.
                            // Copying them out beats reading them off a screen
                            // one at a time.
                            bulkActions={(rows, clear) => (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        const numbers = rows
                                            .map((row) => row.row)
                                            .sort((a, b) => a - b)
                                            .join(", ");
                                        void navigator.clipboard.writeText(numbers).then(
                                            () => {
                                                toast.success(
                                                    `Copied ${rows.length} row numbers`
                                                );
                                                clear();
                                            },
                                            () =>
                                                toast.error(
                                                    "Could not reach the clipboard"
                                                )
                                        );
                                    }}
                                >
                                    Copy row numbers
                                </Button>
                            )}
                            columns={[
                                {
                                    accessorKey: "row",
                                    header: "Row in file",
                                    cell: ({ row }) => (
                                        <span className="tabular-nums text-muted-foreground">
                                            {row.original.row}
                                        </span>
                                    ),
                                },
                                { accessorKey: "reason", header: "Why it was rejected" },
                            ]}
                        />
                    )}
                </SectionCard>
            )}

            <SectionCard
                title="Accepted vocabulary"
                description="A value not in these lists is rejected with its row number rather than created. Add missing ones under Media types."
            >
                <div className="grid gap-6 sm:grid-cols-3">
                    <SlugList title="Media types" items={mediaTypes.map((t) => t.slug)} />
                    <SlugList title="Size classes" items={sizeClasses.map((c) => c.slug)} />
                    <SlugList title="Materials" items={materials.map((m) => m.slug)} />
                </div>
            </SectionCard>
        </div>
    );
}

function SlugList({ title, items }: { title: string; items: string[] }) {
    return (
        <div>
            <p className="text-xs font-medium text-muted-foreground">
                {title} ({items.length})
            </p>
            {items.length === 0 ? (
                <p className="mt-2 text-xs text-warning">None — seed the vocabulary first</p>
            ) : (
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1">
                    {items.map((slug) => (
                        <li key={slug} className="font-mono text-xs text-foreground">
                            {slug}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
