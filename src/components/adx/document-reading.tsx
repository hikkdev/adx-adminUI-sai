"use client";

import * as React from "react";
import { AlertTriangle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime } from "@/lib/format";
import {
    DOCUMENT_FIELD_LABEL,
    DOCUMENT_KIND_LABEL,
    WARNING_LABEL,
    confidenceTone,
    documentReadingService,
    fileIdOf,
    readingMismatches,
    type DocumentKind,
    type DocumentReading,
} from "@/services/document-reading";

/** Tailwind needs the whole class name in the source. */
const TONE_DOT = { success: "bg-success", warning: "bg-warning", danger: "bg-danger" } as const;

export interface DocumentReadingPanelProps {
    /** The document's URL — a private `/files/:id`, or a public URL of ours. */
    url: string | null;
    /** Null for a tile that is never read (an Aadhaar, a selfie): the panel draws nothing. */
    kind: DocumentKind | null;
    /** What the desk typed, by field key, to badge against what was read. */
    expected?: Record<string, string | null | undefined>;
    disabled?: boolean;
    /** One line of fields instead of a list — for a row in a table. */
    compact?: boolean;
    /** Called with a fresh reading — a form prefills from it. */
    onRead?: (reading: DocumentReading) => void;
    className?: string;
}

/**
 * A private file is read by its id; a public URL of ours by the URL itself.
 * ST-2 (28 Sep 2026): a listing's venue papers and audience reports are
 * private now (`/files/:id`, read by id); one filed before the move keeps
 * its public URL until the privatise script rewrites it, and is read by URL.
 */
function readerFor(url: string | null): { key: string; get: () => Promise<DocumentReading | null>; read: (kind: DocumentKind) => Promise<DocumentReading> } | null {
    if (!url) return null;
    const fileId = fileIdOf(url);
    if (fileId) return { key: fileId, get: () => documentReadingService.get(fileId), read: (kind) => documentReadingService.read(fileId, kind) };
    if (/^https?:\/\//i.test(url)) return { key: url, get: () => documentReadingService.getByUrl(url), read: (kind) => documentReadingService.readByUrl(url, kind) };
    return null;
}

/**
 * DR-1: what the model read off a document, under the document.
 *
 * Loads the reading kept on the file when there is one; "Read this document"
 * asks for one. Every field shows its value and how sure the model was; a
 * value that disagrees with what the desk typed wears the typed value as a
 * badge. The panel informs — Accept and Flag live beside it, not in it.
 */
export function DocumentReadingPanel({ url, kind, expected, disabled, compact, onRead, className }: DocumentReadingPanelProps) {
    const reader = React.useMemo(() => readerFor(url), [url]);
    const key = reader?.key ?? null;
    const [reading, setReading] = React.useState<DocumentReading | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [loaded, setLoaded] = React.useState<string | null>(null);

    /* The kept reading is fetched per file; while a new file's fetch is in flight, `loaded` still names the old one and nothing stale is drawn. */
    React.useEffect(() => {
        if (!reader || !kind) return;
        let active = true;
        reader
            .get()
            .then((kept) => {
                if (!active) return;
                setReading(kept);
                setLoaded(reader.key);
            })
            .catch(() => {
                if (active) setLoaded(reader.key);
            });
        return () => {
            active = false;
        };
    }, [reader, kind]);

    if (!kind) return null;

    const read = async () => {
        if (!reader) return;
        setBusy(true);
        try {
            const fresh = await reader.read(kind);
            setReading(fresh);
            setLoaded(reader.key);
            onRead?.(fresh);
            toast.success(`Read as ${DOCUMENT_KIND_LABEL[fresh.kind].toLowerCase()}`, { description: fresh.summary || undefined });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "The document could not be read.");
        } finally {
            setBusy(false);
        }
    };

    const labels = DOCUMENT_FIELD_LABEL[kind];
    /** Only a reading fetched for THIS file is drawn. */
    const current = loaded === key ? reading : null;
    const mismatches = current ? readingMismatches(current, expected) : [];
    const mismatchOf = (field: string) => mismatches.find((item) => item.field === field);

    return (
        <div className={cn("rounded-md border border-border bg-card p-3", className)} data-testid="document-reading">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Sparkles className="size-3.5" aria-hidden />
                    AI reading
                    {current && (
                        <span className="font-normal normal-case tracking-normal">
                            · {Math.round(current.confidence * 100)}% sure · {formatDateTime(current.readAt)}
                        </span>
                    )}
                </div>
                {key ? (
                    <Button variant="outline" size="sm" className="h-7 bg-card px-2 text-xs" disabled={disabled || busy || loaded !== key} onClick={() => void read()} data-testid="document-reading-run">
                        {busy ? "Reading…" : current ? "Read again" : "Read this document"}
                    </Button>
                ) : (
                    <span className="text-xs text-muted-foreground">This file is not stored where it can be read.</span>
                )}
            </div>

            {current ? (
                <div className="mt-2 space-y-2" data-testid="document-reading-result">
                    {!current.matchesKind && (
                        <p className="flex items-center gap-1.5 text-xs text-warning" data-testid="document-reading-kind-mismatch">
                            <AlertTriangle className="size-3.5" aria-hidden />
                            Looks like {current.documentSeen || "something else"}, not a {DOCUMENT_KIND_LABEL[kind].toLowerCase()}.
                        </p>
                    )}
                    <dl className={cn(compact ? "flex flex-wrap gap-x-4 gap-y-1" : "grid gap-1.5 sm:grid-cols-2")}>
                        {Object.entries(labels).map(([field, label]) => {
                            const value = current.fields[field];
                            const mismatch = mismatchOf(field);
                            return (
                                <div key={field} className="min-w-0" data-testid={`document-reading-field-${field}`}>
                                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
                                    <dd className="flex flex-wrap items-center gap-1.5 text-sm text-foreground">
                                        {value?.value ? (
                                            <>
                                                <span className={cn("inline-block size-1.5 shrink-0 rounded-full", TONE_DOT[confidenceTone(value.confidence)])} title={`${Math.round(value.confidence * 100)}% sure`} aria-hidden />
                                                <span className="truncate">{value.value}</span>
                                            </>
                                        ) : (
                                            <span className="text-muted-foreground">Not legible</span>
                                        )}
                                        {mismatch && (
                                            <span data-testid={`document-reading-mismatch-${field}`}>
                                                <StatusBadge status={{ label: `Typed ${mismatch.expected}`, tone: "danger" }} />
                                            </span>
                                        )}
                                    </dd>
                                </div>
                            );
                        })}
                    </dl>
                    {current.warnings.length > 0 && (
                        <ul className="flex flex-wrap gap-1.5" data-testid="document-reading-warnings">
                            {current.warnings.map((warning) => (
                                <li key={warning} className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
                                    {WARNING_LABEL[warning] ?? warning}
                                </li>
                            ))}
                        </ul>
                    )}
                    {current.summary && !compact && <p className="text-xs text-muted-foreground">{current.summary}</p>}
                </div>
            ) : (
                key && <p className="mt-1.5 text-xs text-muted-foreground">Ask the model what is printed here. The fields land under the document; you still decide.</p>
            )}
        </div>
    );
}
