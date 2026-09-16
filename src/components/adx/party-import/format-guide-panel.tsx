"use client";

import * as React from "react";
import { ChevronDown, FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { fetchPrivateBlob } from "@/components/adx/private-file";
import { apiConfig } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { FORMAT_COLUMN_TYPE_WORD, importFormatsService, type FormatKind, type ImportFormat } from "@/services/party-imports";

/**
 * The file format of one import kind — package U (the owner, 15 Sep 2026:
 * "a set of instructions could be added towards the format of the csv
 * file for every kind of import on the platform — how many columns, what
 * titles etc").
 *
 * Read from `GET /party-imports/formats/:kind`: the column table (name,
 * required, type, what it takes, an example, the allowed values), the
 * rules, and the template — the header row and two sample rows, fetched
 * with the token from `/formats/:kind/template.csv` and handed to the
 * browser. The guide is kept beside each validator on the server and its
 * contract test pins the two together, so this panel never describes a
 * column the server does not read.
 *
 * Drawn on every import screen: open above the upload step on the kit,
 * folded inside the dialogs that have importers of their own (leads, the
 * bank statement) and the market-data screen, and once more on the
 * reference page under Settings.
 */

/** Hands the browser a file it did not fetch itself — the template here, the report on the kit. */
export function saveBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** The template — fetched with the token like every other route, so it is a button, not a link. */
export function DownloadTemplateButton({ kind, className }: { kind: FormatKind; className?: string }) {
    const [busy, setBusy] = React.useState(false);
    const download = async () => {
        setBusy(true);
        try {
            const blob = await fetchPrivateBlob(`${apiConfig.baseUrl}${importFormatsService.templateUrl(kind)}`);
            saveBlob(blob, `${kind}-template.csv`);
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The template could not be fetched.");
        } finally {
            setBusy(false);
        }
    };
    return (
        <Button variant="outline" size="sm" className={cn("h-8 bg-card", className)} disabled={busy} onClick={() => void download()}>
            <FileDown className="mr-1.5 size-3.5" aria-hidden />
            {busy ? "Fetching…" : "Download template"}
        </Button>
    );
}

/** The guide's body — the table, the rules — without the card, so the reference page can stack ten of them. */
export function FormatGuideBody({ format }: { format: ImportFormat }) {
    const required = format.columns.filter((column) => column.required);
    return (
        <div>
            <div className="border-b px-5 py-3 text-sm text-muted-foreground">
                <p>{format.purpose}</p>
                <p className="mt-1.5">
                    <span className="font-medium text-foreground">{format.columns.length} columns</span>, header names in any order
                    {required.length > 0 ? (
                        <>
                            {" "}
                            — required:{" "}
                            {required.map((column, index) => (
                                <React.Fragment key={column.name}>
                                    {index > 0 && ", "}
                                    <code className="font-mono text-xs text-foreground">{column.name}</code>
                                </React.Fragment>
                            ))}
                        </>
                    ) : (
                        " — none required"
                    )}
                    . <span className="font-mono text-xs">{format.route}</span>
                </p>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                            <th className="px-4 py-2.5">Column</th>
                            <th className="px-4 py-2.5">Type</th>
                            <th className="px-4 py-2.5">Accepts</th>
                            <th className="px-4 py-2.5">Example</th>
                        </tr>
                    </thead>
                    <tbody>
                        {format.columns.map((column) => (
                            <tr key={column.name} className="border-b last:border-0 align-top">
                                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-foreground">
                                    {column.name}
                                    {column.required && (
                                        <span className="ml-1.5 rounded bg-warning-soft px-1.5 py-0.5 font-sans text-[10px] font-medium uppercase tracking-wide text-warning">required</span>
                                    )}
                                </td>
                                <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                                    {FORMAT_COLUMN_TYPE_WORD[column.type] ?? column.type}
                                    {column.maxLength ? ` · ≤ ${column.maxLength}` : ""}
                                </td>
                                <td className="max-w-md px-4 py-2.5 text-muted-foreground">
                                    {column.description}
                                    {column.enumValues && column.enumValues.length > 0 && (
                                        <span className="mt-1 flex flex-wrap gap-1" aria-label={`Allowed values for ${column.name}`}>
                                            {column.enumValues.map((value) => (
                                                <code key={value} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                                                    {value}
                                                </code>
                                            ))}
                                        </span>
                                    )}
                                </td>
                                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{column.example || "—"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {format.rules.length > 0 && (
                <div className="border-t px-5 py-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rules</h4>
                    <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {format.rules.map((rule) => (
                            <li key={rule}>{rule}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

interface FormatGuidePanelProps {
    kind: FormatKind;
    /** Folded to one line until opened — for the dialogs, where the upload is the point. Open by default on the kit. */
    collapsible?: boolean;
    defaultOpen?: boolean;
    className?: string;
}

/**
 * "File format" — the card. Reads the kind's guide itself so any screen
 * can carry it with one line; a read that fails says so and leaves the
 * upload alone (the server validates the file either way).
 */
export function FormatGuidePanel({ kind, collapsible = false, defaultOpen = !collapsible, className }: FormatGuidePanelProps) {
    const [open, setOpen] = React.useState(defaultOpen);
    const guide = useApiResource<ImportFormat>(`import-format:${kind}`, () => importFormatsService.get(kind));

    const header = (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground">File format</h3>
                <p className="text-xs text-muted-foreground">
                    {guide.data ? `${guide.data.title} — the columns the server reads, the rules it applies, and a template to start from.` : "The columns the server reads, and a template to start from."}
                </p>
            </div>
            <div className="flex items-center gap-2">
                <DownloadTemplateButton kind={kind} />
                {collapsible && (
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8" aria-expanded={open}>
                            {open ? "Hide" : "Show"} the columns
                            <ChevronDown className={cn("ml-1 size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
                        </Button>
                    </CollapsibleTrigger>
                )}
            </div>
        </div>
    );

    const body = guide.loading && !guide.data ? (
        <p className="flex items-center gap-2 border-t px-5 py-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Reading the guide…
        </p>
    ) : guide.error ? (
        <div className="border-t px-5 py-3 text-sm">
            <p className="text-muted-foreground">The guide could not be read: {guide.error}</p>
            <Button size="sm" variant="outline" className="mt-2 h-8 bg-card" onClick={guide.reload}>
                Try again
            </Button>
        </div>
    ) : guide.data ? (
        <div className="border-t">
            <FormatGuideBody format={guide.data} />
        </div>
    ) : null;

    if (!collapsible) {
        return (
            <Card className={cn("overflow-hidden rounded-lg border-border shadow-none", className)} data-testid="format-guide">
                {header}
                {body}
            </Card>
        );
    }

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <Card className={cn("overflow-hidden rounded-lg border-border shadow-none", className)} data-testid="format-guide">
                {header}
                <CollapsibleContent>{body}</CollapsibleContent>
            </Card>
        </Collapsible>
    );
}
