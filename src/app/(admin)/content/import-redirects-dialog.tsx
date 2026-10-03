"use client";

import * as React from "react";
import { ArrowRight, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { countNoun, formatCsv, runWithSummary, type BulkFailure } from "@/lib/bulk";
import { cn } from "@/lib/utils";
import { readRedirectCsv, sitePagesService, type RedirectImportRow } from "@/services/site-pages";

/** A picked file's text — FileReader, which every browser and jsdom have. */
function readFileText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error ?? new Error("The file could not be read."));
        reader.readAsText(file);
    });
}

/**
 * Pages › Redirects › Import (28 Sep 2026): old links by the dozen.
 *
 * Paste the lines or pick a CSV — `from,to`, and an optional third column
 * `permanent` (true/false; empty is permanent). Every line is previewed
 * with the Add dialog's checks before anything is written; the lines that
 * pass are created one by one through the ordinary `POST /site/redirects`,
 * so each is checked by the server and audited on its own. Lines the server
 * refused stay in the box with its reason, to fix and import again.
 */
export function ImportRedirectsDialog({ takenPaths, onOpenChange, onImported }: { takenPaths: readonly string[]; onOpenChange: (open: boolean) => void; onImported: () => void }) {
    const [text, setText] = React.useState("");
    const [fileName, setFileName] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [refused, setRefused] = React.useState<BulkFailure<RedirectImportRow>[]>([]);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const rows = React.useMemo(() => readRedirectCsv(text, takenPaths), [text, takenPaths]);
    const ready = rows.filter((row) => row.problem === null);
    const problems = rows.length - ready.length;

    async function pick(file: File | undefined) {
        if (!file) return;
        setFileName(file.name);
        setRefused([]);
        setText(await readFileText(file));
        if (inputRef.current) inputRef.current.value = "";
    }

    async function submit() {
        if (ready.length === 0 || busy) return;
        setBusy(true);
        const outcome = await runWithSummary({
            rows: ready,
            action: (row) => sitePagesService.createRedirect({ fromPath: row.fromPath, toPath: row.toPath, permanent: row.permanent }),
            participle: "imported",
            label: (row) => row.fromPath,
            // One by one: two lines naming the same address should meet the server in file order.
            concurrency: 1,
        });
        setBusy(false);
        onImported();
        if (outcome.failed.length === 0) {
            onOpenChange(false);
            return;
        }
        // What the server refused stays, to fix and send again; what it took is gone from the box.
        setRefused(outcome.failed);
        setFileName(null);
        // A textarea keeps line feeds; the CSV's CRLF would come back changed.
        setText(formatCsv([["from", "to", "permanent"], ...outcome.failed.map(({ row }) => [row.fromPath, row.toPath, String(row.permanent)])]).replace(/\r\n/g, "\n"));
    }

    return (
        <Dialog open onOpenChange={(next) => (!next && !busy ? onOpenChange(false) : undefined)}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Import redirects</DialogTitle>
                    <DialogDescription>One redirect a line: the old address, where it goes, and optionally whether it is permanent — “/old-offer,/diwali-offers,true”.</DialogDescription>
                </DialogHeader>

                <div className="grid gap-1.5">
                    <div className="flex items-end justify-between gap-2">
                        <Label htmlFor="redirect-import-text">Lines</Label>
                        <div className="flex items-center gap-2">
                            {fileName && <span className="max-w-[220px] truncate text-xs text-muted-foreground">{fileName}</span>}
                            <input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => void pick(event.target.files?.[0])} data-testid="redirect-import-file" />
                            <Button type="button" variant="outline" size="sm" className="h-7 bg-card" disabled={busy} onClick={() => inputRef.current?.click()}>
                                <FileUp className="mr-1 size-3.5" />
                                Upload a CSV
                            </Button>
                        </div>
                    </div>
                    <Textarea
                        id="redirect-import-text"
                        value={text}
                        onChange={(event) => {
                            setText(event.target.value);
                            setRefused([]);
                        }}
                        rows={5}
                        placeholder={"from,to,permanent\n/old-offer,/diwali-offers,true\n/press,https://news.adx.in,false"}
                        className="font-mono text-xs"
                        disabled={busy}
                        data-testid="redirect-import-text"
                    />
                    <p className="text-xs text-muted-foreground">A first line reading “from,to,…” is taken as the header. Lowercase segments with hyphens; an outside destination must be https.</p>
                </div>

                {refused.length > 0 && (
                    <div className="rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-danger" data-testid="redirect-import-refused">
                        <p className="font-medium">The server refused {countNoun(refused.length, ["line", "lines"])} — they are left in the box:</p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4">
                            {refused.map((failure) => (
                                <li key={failure.row.fromPath}>
                                    <span className="font-mono">{failure.row.fromPath}</span> — {failure.message}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {rows.length > 0 && (
                    <div className="max-h-64 overflow-auto rounded-md border" data-testid="redirect-import-preview">
                        <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-muted/80 text-left text-muted-foreground">
                                <tr>
                                    <th className="px-3 py-2 font-medium">Line</th>
                                    <th className="px-3 py-2 font-medium">From</th>
                                    <th className="px-3 py-2 font-medium">To</th>
                                    <th className="px-3 py-2 font-medium">Kind</th>
                                    <th className="px-3 py-2 font-medium">Check</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr key={row.line} className="border-t" data-testid={`redirect-import-line-${row.line}`}>
                                        <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{row.line}</td>
                                        <td className="px-3 py-1.5 font-mono text-foreground">{row.fromPath || "—"}</td>
                                        <td className="px-3 py-1.5 font-mono text-foreground">
                                            <span className="flex items-center gap-1">
                                                <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                                                {row.toPath || "—"}
                                            </span>
                                        </td>
                                        <td className="px-3 py-1.5 text-muted-foreground">{row.permanent ? "308" : "307"}</td>
                                        <td className={cn("px-3 py-1.5", row.problem ? "text-danger" : "text-success")}>{row.problem ?? "Ready"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <DialogFooter className="items-center gap-2 sm:justify-between">
                    <p className="text-xs text-muted-foreground" data-testid="redirect-import-plan">
                        {rows.length === 0 ? "Nothing to import yet." : `${ready.length} will be imported${problems ? `, ${problems} skipped (a problem on the line)` : ""}.`}
                    </p>
                    <div className="flex gap-2">
                        <Button type="button" variant="outline" className="bg-card" onClick={() => onOpenChange(false)} disabled={busy}>
                            Cancel
                        </Button>
                        <Button type="button" onClick={() => void submit()} disabled={ready.length === 0 || busy} data-testid="redirect-import-submit">
                            {busy ? "Importing…" : `Import ${countNoun(ready.length, ["redirect", "redirects"])}`}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
