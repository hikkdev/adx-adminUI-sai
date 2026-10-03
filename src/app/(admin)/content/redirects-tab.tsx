"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRight, FileUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BulkActions } from "@/components/adx/bulk-actions";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { DataTable } from "@/components/adx/data-table";
import { formatDateTime } from "@/lib/format";
import { REDIRECT_REASON_LABEL, pathProblem, sitePagesService, toPathProblem, type SitePageRow, type SiteRedirectRow } from "@/services/site-pages";
import { ImportRedirectsDialog } from "./import-redirects-dialog";

export { toPathProblem };

interface RedirectsTabProps {
    redirects: SiteRedirectRow[];
    pages: SitePageRow[];
    /** `content.addresses` — adding a redirect is an address change too. */
    mayManage: boolean;
    /** `content.addresses` and `content.delete` — removing one is an address change and a delete. */
    mayRemove: boolean;
    onChanged: () => void;
}

export const ADD_REDIRECT_BLOCKED = "Adding a redirect needs content.addresses.";
export const REMOVE_REDIRECT_BLOCKED = "Removing a redirect needs content.addresses and content.delete.";

/**
 * PB-1: every redirect the website answers — the ones an address change
 * wrote, and the ones added here by hand. Adding and deleting need
 * `content.addresses`, the same power a page's address takes.
 *
 * 28 Sep 2026: rows are selectable and can be deleted together (each the
 * single DELETE, so each keeps its audit row), and a CSV of old links can be
 * imported — previewed with the Add dialog's checks, then created one by one.
 */
export function RedirectsTab({ redirects, pages, mayManage, mayRemove, onChanged }: RedirectsTabProps) {
    const [adding, setAdding] = React.useState(false);
    const [importing, setImporting] = React.useState(false);
    const [deleting, setDeleting] = React.useState<SiteRedirectRow | null>(null);
    const [busy, setBusy] = React.useState(false);
    const takenPaths = React.useMemo(() => [...pages.map((page) => page.path), ...redirects.map((redirect) => redirect.fromPath)], [pages, redirects]);

    async function remove(redirect: SiteRedirectRow) {
        setBusy(true);
        try {
            await sitePagesService.deleteRedirect(redirect.id);
            toast.success("Redirect removed", { description: `${redirect.fromPath} answers 404 now.` });
            setDeleting(null);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "That did not go through.");
        } finally {
            setBusy(false);
        }
    }

    const columns = React.useMemo<ColumnDef<SiteRedirectRow>[]>(
        () => [
            { id: "from", header: "From", cell: ({ row: { original: row } }) => <span className="font-mono text-xs text-foreground">{row.fromPath}</span> },
            {
                id: "to",
                header: "To",
                cell: ({ row: { original: row } }) => (
                    <span className="flex items-center gap-1.5 font-mono text-xs text-foreground">
                        <ArrowRight className="size-3 text-muted-foreground" aria-hidden />
                        {row.toPath}
                    </span>
                ),
            },
            { id: "kind", header: "Kind", cell: ({ row: { original: row } }) => <span className="text-xs text-muted-foreground">{row.permanent ? "Permanent (308)" : "Temporary (307)"}</span> },
            {
                id: "reason",
                header: "Why",
                cell: ({ row: { original: row } }) => (
                    <span className="text-xs text-muted-foreground">
                        {REDIRECT_REASON_LABEL[row.reason] ?? row.reason}
                        {row.page ? ` · ${row.page.title}` : ""}
                    </span>
                ),
            },
            { id: "when", header: "Added", cell: ({ row: { original: row } }) => <span className="text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</span> },
            {
                id: "actions",
                header: "",
                cell: ({ row: { original: row } }) => (
                    <div className="flex justify-end">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-danger hover:text-danger"
                            disabled={!mayRemove}
                            title={mayRemove ? "Remove" : REMOVE_REDIRECT_BLOCKED}
                            onClick={() => setDeleting(row)}
                            aria-label={`Remove the redirect from ${row.fromPath}`}
                            data-testid={`redirect-delete-${row.id}`}
                        >
                            <Trash2 className="size-3.5" />
                        </Button>
                    </div>
                ),
            },
        ],
        [mayRemove],
    );

    return (
        <div className="space-y-3" data-testid="redirects-tab">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                    {redirects.length === 0 ? "No redirects. An address change writes one; add one by hand for an old link." : `${redirects.length} ${redirects.length === 1 ? "redirect" : "redirects"} — an old address to where it went.`}
                </p>
                <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="bg-card" onClick={() => setImporting(true)} disabled={!mayManage} title={mayManage ? undefined : ADD_REDIRECT_BLOCKED} data-testid="redirect-import">
                        <FileUp className="mr-1 size-4" />
                        Import redirects
                    </Button>
                    <Button size="sm" onClick={() => setAdding(true)} disabled={!mayManage} title={mayManage ? undefined : ADD_REDIRECT_BLOCKED} data-testid="redirect-add">
                        <Plus className="mr-1 size-4" />
                        Add redirect
                    </Button>
                </div>
            </div>

            {redirects.length === 0 ? (
                <Card className="rounded-lg border-dashed p-8 text-center text-sm text-muted-foreground shadow-none">Nothing redirects yet.</Card>
            ) : (
                <DataTable<SiteRedirectRow, unknown>
                    columns={columns}
                    data={redirects}
                    getRowId={(row) => row.id}
                    showColumnToggle={false}
                    showPagination={false}
                    bulkActions={(selected, _clear, keep) => (
                        <BulkActions<SiteRedirectRow>
                            rows={selected}
                            label={(row) => row.fromPath}
                            onSettled={(outcome) => {
                                keep(outcome.failed.map((failure) => failure.row));
                                onChanged();
                            }}
                            actions={[
                                {
                                    key: "delete",
                                    label: "Delete selected",
                                    icon: Trash2,
                                    blocked: mayRemove ? null : REMOVE_REDIRECT_BLOCKED,
                                    participle: "deleted",
                                    noun: ["redirect", "redirects"],
                                    phrase: (count) => `Delete ${count}`,
                                    description: "Each old address answers 404, and any link still using it breaks.",
                                    destructive: true,
                                    run: (row) => sitePagesService.deleteRedirect(row.id),
                                },
                            ]}
                        />
                    )}
                />
            )}

            {adding && <AddRedirectDialog takenPaths={takenPaths} onOpenChange={setAdding} onAdded={onChanged} />}
            {importing && <ImportRedirectsDialog takenPaths={takenPaths} onOpenChange={setImporting} onImported={onChanged} />}

            <ConfirmDialog
                open={deleting !== null}
                onOpenChange={(open) => !open && !busy && setDeleting(null)}
                title="Remove this redirect?"
                description={`${deleting?.fromPath ?? ""} will answer 404. Any link still using it breaks.`}
                confirmLabel="Remove"
                destructive
                busy={busy}
                onConfirm={() => deleting && void remove(deleting)}
            />
        </div>
    );
}

function AddRedirectDialog({ takenPaths, onOpenChange, onAdded }: { takenPaths: readonly string[]; onOpenChange: (open: boolean) => void; onAdded: () => void }) {
    const [fromPath, setFromPath] = React.useState("");
    const [toPath, setToPath] = React.useState("");
    const [permanent, setPermanent] = React.useState(true);
    const [busy, setBusy] = React.useState(false);
    const fromIssue = pathProblem(fromPath.trim(), { kind: "CUSTOM" }) ?? (takenPaths.includes(fromPath.trim()) ? "A page or another redirect already answers this address." : null);
    const toIssue = toPathProblem(toPath) ?? (toPath.trim() === fromPath.trim() ? "It would point at itself." : null);
    const ready = !fromIssue && !toIssue;

    async function submit() {
        if (!ready || busy) return;
        setBusy(true);
        try {
            await sitePagesService.createRedirect({ fromPath: fromPath.trim(), toPath: toPath.trim(), permanent });
            toast.success("Redirect added");
            onAdded();
            onOpenChange(false);
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "The redirect was not added.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open onOpenChange={(next) => (!next && !busy ? onOpenChange(false) : undefined)}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Add a redirect</DialogTitle>
                    <DialogDescription>An old address, and where it should go — a page here or a full https address.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                        <Label htmlFor="redirect-from">From</Label>
                        <Input id="redirect-from" value={fromPath} onChange={(event) => setFromPath(event.target.value)} placeholder="/old-address" className="font-mono" autoFocus data-testid="redirect-from" />
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="redirect-to">To</Label>
                        <Input id="redirect-to" value={toPath} onChange={(event) => setToPath(event.target.value)} placeholder="/new-address or https://…" className="font-mono" data-testid="redirect-to" />
                    </div>
                </div>
                <p className={cn("text-xs", (fromPath && fromIssue) || (toPath && toIssue) ? "text-danger" : "text-muted-foreground")}>
                    {(fromPath && fromIssue) || (toPath && toIssue) || "Lowercase segments with hyphens; the first segment may not be one the website keeps."}
                </p>
                <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={permanent} onCheckedChange={(checked) => setPermanent(checked === true)} />
                    Permanent (308) — search engines move the old address over. Untick for a temporary (307) one.
                </label>
                <DialogFooter>
                    <Button type="button" variant="outline" className="bg-card" onClick={() => onOpenChange(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={() => void submit()} disabled={!ready || busy} data-testid="redirect-submit">
                        {busy ? "Adding…" : "Add redirect"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
