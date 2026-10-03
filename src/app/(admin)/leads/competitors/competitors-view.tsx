"use client";

import * as React from "react";
import Link from "next/link";
import { Camera, Download, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/adx/empty-state";
import { FilterChips } from "@/components/adx/filter-chips";
import { PageHeader } from "@/components/adx/page-header";
import { PrivateFile } from "@/components/adx/private-file";
import { SectionCard } from "@/components/adx/section-card";
import { SimpleTable } from "@/components/adx/simple-table";
import { api as http, saveBlob } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import {
    SIGHTING_FORMATS,
    SIGHTING_FORMAT_LABEL,
    competitorsService,
    formatLabel,
    sightingLine,
    type Sighting,
    type SightingFormat,
    type SightingsQuery,
} from "@/services/competitors";
import type { CompetitorsData } from "./competitors-loader";

/**
 * VA-2: the competitor desk.
 *
 * Every row is a photo an agent took of somebody else's hoarding, with the
 * GPS stamp on so the picture itself says where and when. The desk reads
 * what the agent typed, asks the vision model for its own reading when it
 * wants one (the agent's is never overwritten), and exports the lot as a
 * corpus — CSV for a spreadsheet, JSONL for a training run.
 */

const ANALYSED_CHIPS = [
    { value: "ALL", label: "Everything" },
    { value: "UNANALYSED", label: "Not yet analysed" },
    { value: "ANALYSED", label: "Analysed" },
] as const;

type AnalysedChip = (typeof ANALYSED_CHIPS)[number]["value"];

const chipOf = (query: SightingsQuery): AnalysedChip => (query.analysed === undefined ? "ALL" : query.analysed ? "ANALYSED" : "UNANALYSED");

const CONDITION_LABEL: Record<string, string> = { NEW: "New", GOOD: "Good", WORN: "Worn", DAMAGED: "Damaged", UNKNOWN: "Condition unknown" };

/** "Hoarding · 40 x 20 ft · Lit · Good · 82% sure" — the model's reading in one line under its summary. */
export function analysisLine(row: Sighting): string {
    const analysis = row.analysis;
    if (!analysis) return "";
    return [
        analysis.format ? formatLabel(analysis.format) : null,
        analysis.estimatedSize,
        analysis.illuminated === null ? null : analysis.illuminated ? "Lit" : "Unlit",
        CONDITION_LABEL[analysis.condition] ?? analysis.condition,
        `${Math.round(analysis.confidence * 100)}% sure`,
    ]
        .filter(Boolean)
        .join(" · ");
}

export function CompetitorsView({
    data,
    query,
    onQuery,
    onChanged,
}: {
    data: CompetitorsData;
    query: SightingsQuery;
    onQuery: (query: SightingsQuery) => void;
    onChanged: () => void;
}) {
    const { page, brands } = data;
    const [q, setQ] = React.useState(query.q ?? "");
    const [analysing, setAnalysing] = React.useState<string | null>(null);
    const [exporting, setExporting] = React.useState<"csv" | "jsonl" | null>(null);

    const chips = ANALYSED_CHIPS.map((chip) => ({ value: chip.value, label: chip.label, count: page.counts[chip.value] }));

    const analyse = async (row: Sighting) => {
        setAnalysing(row.id);
        try {
            const result = await competitorsService.analyse(row.id);
            toast.success(result.analysis ? sightingLine(result) : "Analysed", { description: result.analysis?.summary });
            onChanged();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "The model could not read the photo.");
        } finally {
            setAnalysing(null);
        }
    };

    const exportAs = async (format: "csv" | "jsonl") => {
        setExporting(format);
        try {
            const filter = { brand: query.brand, city: query.city, from: query.from, to: query.to };
            const result = await http.blob(competitorsService.exportPath(format, filter));
            saveBlob(result.blob, result.filename ?? `competitor-sightings.${format}`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "The export failed.");
        } finally {
            setExporting(null);
        }
    };

    return (
        <div className="space-y-5" data-testid="competitors-desk">
            <PageHeader
                title="Competitors"
                subtitle="Hoardings our agents photographed on their rounds, with the GPS stamp on. Ask the model what it sees when you want a second reading; the agent's own stays on the row. Export the lot as a corpus."
                actions={
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" disabled={exporting !== null} onClick={() => void exportAs("csv")} data-testid="competitors-export-csv">
                            <Download className="mr-1.5 size-4" />
                            CSV
                        </Button>
                        <Button size="sm" variant="outline" disabled={exporting !== null} onClick={() => void exportAs("jsonl")} data-testid="competitors-export-jsonl">
                            <Download className="mr-1.5 size-4" />
                            JSONL
                        </Button>
                    </div>
                }
            />

            <div className="flex flex-wrap items-center gap-2">
                <FilterChips
                    chips={chips}
                    value={chipOf(query)}
                    onChange={(value) => onQuery({ ...query, page: 1, analysed: value === "ALL" ? undefined : value === "ANALYSED" })}
                />
                <form
                    className="flex items-center gap-2"
                    onSubmit={(event) => {
                        event.preventDefault();
                        onQuery({ ...query, page: 1, q: q.trim() || undefined });
                    }}
                >
                    <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Brand, note or address" className="h-8 w-56" data-testid="competitors-search" />
                    <Button type="submit" size="sm" variant="outline" className="h-8">
                        Search
                    </Button>
                </form>
                <Select value={query.brand ?? "ALL"} onValueChange={(value) => onQuery({ ...query, page: 1, brand: value === "ALL" ? undefined : value })}>
                    <SelectTrigger className="h-8 w-44" data-testid="competitors-brand">
                        <SelectValue placeholder="Every brand" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">Every brand</SelectItem>
                        {brands.map((brand) => (
                            <SelectItem key={brand.brand} value={brand.brand}>
                                {brand.brand} · {brand.count}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={query.format ?? "ALL"} onValueChange={(value) => onQuery({ ...query, page: 1, format: value === "ALL" ? undefined : (value as SightingFormat) })}>
                    <SelectTrigger className="h-8 w-40" data-testid="competitors-format">
                        <SelectValue placeholder="Every format" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">Every format</SelectItem>
                        {SIGHTING_FORMATS.map((format) => (
                            <SelectItem key={format} value={format}>
                                {SIGHTING_FORMAT_LABEL[format]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <SectionCard
                title={`${page.total} ${page.total === 1 ? "sighting" : "sightings"}`}
                description="What the agent read at the kerb, and what the model read from the photo once asked. Neither overwrites the other."
            >
                {page.items.length === 0 ? (
                    <EmptyState
                        icon={Camera}
                        title="No sightings yet"
                        description="An agent logs one from the + disc in the field app: Log a competitor hoarding."
                        className="py-12"
                    />
                ) : (
                    <SimpleTable<Sighting>
                        rows={page.items}
                        rowKey={(row) => row.id}
                        columns={[
                            {
                                key: "photo",
                                label: "Photo",
                                render: (row) => (
                                    <PrivateFile
                                        src={row.photoUrl}
                                        alt={`${row.brand ?? "Unknown brand"} hoarding`}
                                        className="size-16 rounded-md object-cover"
                                        frameClassName="size-16 rounded-md"
                                    />
                                ),
                            },
                            {
                                key: "what",
                                label: "What",
                                render: (row) => (
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-foreground" data-testid={`competitors-line-${row.id}`}>
                                            {sightingLine(row)}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {[row.category ?? row.analysis?.category, row.note].filter(Boolean).join(" · ") || "—"}
                                        </p>
                                    </div>
                                ),
                            },
                            {
                                key: "where",
                                label: "Where",
                                render: (row) => (
                                    <div className="min-w-0 text-sm">
                                        <p className="text-foreground">
                                            {row.address ??
                                                (row.latitude !== null && row.longitude !== null ? `${row.latitude.toFixed(5)}, ${row.longitude.toFixed(5)}` : "—")}
                                        </p>
                                        <p className="text-xs text-muted-foreground">{row.city ?? ""}</p>
                                    </div>
                                ),
                            },
                            { key: "when", label: "Captured", render: (row) => <span className="text-sm">{formatDateTime(row.capturedAt)}</span> },
                            {
                                key: "agent",
                                label: "Agent",
                                render: (row) => (
                                    <Link href={`/agents/${row.agent.id}`} className="text-primary hover:underline">
                                        {row.agent.name ?? row.agent.displayId ?? row.agent.id}
                                    </Link>
                                ),
                            },
                            {
                                key: "analysis",
                                label: "AI reading",
                                render: (row) =>
                                    row.analysis ? (
                                        <div className="min-w-0 max-w-xs text-xs" data-testid={`competitors-analysis-${row.id}`}>
                                            <p className="text-foreground">{row.analysis.summary}</p>
                                            <p className="mt-0.5 text-muted-foreground">{analysisLine(row)}</p>
                                        </div>
                                    ) : (
                                        <span className="text-xs text-muted-foreground" data-testid={`competitors-unanalysed-${row.id}`}>
                                            Not asked
                                        </span>
                                    ),
                            },
                            {
                                key: "act",
                                label: "",
                                render: (row) => (
                                    <div className="flex justify-end">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={analysing !== null}
                                            onClick={() => void analyse(row)}
                                            data-testid={`competitors-analyse-${row.id}`}
                                        >
                                            <Sparkles className="mr-1 size-3.5" />
                                            {row.analysis ? "Analyse again" : "Analyse"}
                                        </Button>
                                    </div>
                                ),
                            },
                        ]}
                    />
                )}
            </SectionCard>

            {page.total > page.pageSize ? (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                        Page {page.page} of {Math.ceil(page.total / page.pageSize)}
                    </span>
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" disabled={page.page <= 1} onClick={() => onQuery({ ...query, page: page.page - 1 })}>
                            Previous
                        </Button>
                        <Button size="sm" variant="outline" disabled={page.page * page.pageSize >= page.total} onClick={() => onQuery({ ...query, page: page.page + 1 })}>
                            Next
                        </Button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
