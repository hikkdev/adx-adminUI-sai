"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, ArchiveRestore, ExternalLink, FileText, Lock, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BulkActions } from "@/components/adx/bulk-actions";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { DataTable } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { openStudio } from "@/lib/studio";
import { PAGE_CHANNEL_LABEL, PAGE_KIND_META, pageStateMeta, sitePagesService, sortPages, type SitePageRow, type SiteRedirectRow } from "@/services/site-pages";
import { ChangeAddressDialog } from "./change-address-dialog";
import { NewPageDialog } from "./new-page-dialog";
import { usePageBulkActions } from "./pages-bulk";
import { RedirectsTab } from "./redirects-tab";

type Pending = { action: "archive" | "restore"; page: SitePageRow } | null;

/** "Only admins can change the addresses." — the sentence under a disabled Change address. */
export const ADDRESS_PERMISSION_SENTENCE = "Changing an address needs content.addresses — only a super admin, or a role given it, may.";
export const ADDRESS_LOCKED_SENTENCE = "The home page's address never changes.";

/**
 * PB-1: the Studio index. Every page in a table — the website's own nine
 * first, then the ones made here — with its address, where it is read, what
 * is live and whether a draft waits. A page opens in Studio to lay out; its
 * address moves through a dialog only an admin with `content.addresses`
 * can use, and the old address keeps a redirect. The Redirects tab is the
 * whole table of them.
 *
 * 28 Sep 2026: rows are selectable — publish or discard the waiting drafts,
 * archive or restore Studio pages, and move where Studio pages are read,
 * each the single-row route once per page (`./pages-bulk`).
 */
export function PagesView({ pages, redirects, onChanged }: { pages: SitePageRow[]; redirects: SiteRedirectRow[]; onChanged: () => void }) {
    const { can } = useAuth();
    const mayEdit = can("content.edit");
    const mayDelete = can("content.delete");
    const mayAddress = can("content.addresses");
    const mayPublish = can("content.approve");
    const bulkActions = usePageBulkActions({ mayPublish, mayDelete, mayEdit });
    const [showArchived, setShowArchived] = React.useState(false);
    const [creating, setCreating] = React.useState(false);
    const [addressing, setAddressing] = React.useState<SitePageRow | null>(null);
    const [pending, setPending] = React.useState<Pending>(null);
    const [busy, setBusy] = React.useState(false);

    const rows = React.useMemo(() => sortPages(pages).filter((page) => showArchived || !page.archivedAt), [pages, showArchived]);
    const archivedCount = pages.filter((page) => page.archivedAt).length;
    const liveCount = pages.filter((page) => page.live && !page.archivedAt).length;

    async function run(target: NonNullable<Pending>) {
        setBusy(true);
        try {
            if (target.action === "archive") await sitePagesService.archive(target.page.key);
            else await sitePagesService.restorePage(target.page.key);
            toast.success(target.action === "archive" ? "Page archived" : "Page restored", {
                description: target.action === "archive" ? `${target.page.path} answers 404 now; every version is kept.` : `${target.page.path} answers again.`,
            });
            setPending(null);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "That did not go through.");
        } finally {
            setBusy(false);
        }
    }

    const columns = React.useMemo<ColumnDef<SitePageRow>[]>(
        () => [
            {
                id: "page",
                header: "Page",
                cell: ({ row: { original: row } }) => (
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => openStudio({ kind: "page", key: row.key })} className="text-left font-medium text-foreground hover:underline" data-testid={`page-open-${row.key}`}>
                                {row.title}
                            </button>
                            <StatusBadge status={PAGE_KIND_META[row.kind]} />
                        </div>
                        <p className="font-mono text-[11px] text-muted-foreground">{row.key}</p>
                    </div>
                ),
            },
            {
                id: "address",
                header: "Address",
                cell: ({ row: { original: row } }) => (
                    <div className="min-w-0">
                        <p className="flex items-center gap-1.5 font-mono text-xs text-foreground" data-testid={`page-path-${row.key}`}>
                            {row.path}
                            {row.addressLocked && <Lock className="size-3 text-muted-foreground" aria-label="Locked" />}
                        </p>
                        {row.kind === "SYSTEM" && row.internalPath && row.internalPath !== row.path && <p className="font-mono text-[11px] text-muted-foreground">drawn by {row.internalPath}</p>}
                    </div>
                ),
            },
            {
                id: "channels",
                header: "Read on",
                cell: ({ row: { original: row } }) => (
                    <div className="flex flex-wrap gap-1" data-testid={`page-channels-${row.key}`}>
                        {row.channels.map((channel) => (
                            <span key={channel} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                                {PAGE_CHANNEL_LABEL[channel] ?? channel}
                            </span>
                        ))}
                    </div>
                ),
            },
            {
                id: "live",
                header: "Live",
                cell: ({ row: { original: row } }) => (
                    <span className="text-sm">
                        <StatusBadge status={pageStateMeta(row)} />
                        {row.live?.publishedAt && <span className="ml-2 text-xs text-muted-foreground">{formatDateTime(row.live.publishedAt)}</span>}
                    </span>
                ),
            },
            {
                id: "draft",
                header: "Draft",
                cell: ({ row: { original: row } }) =>
                    row.draft ? (
                        <span className="text-sm">
                            <StatusBadge status={{ label: `v${row.draft.number}`, tone: "warning" }} />
                            <span className="ml-2 text-xs text-muted-foreground">saved {formatDateTime(row.draft.updatedAt)}</span>
                        </span>
                    ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                    ),
            },
            { id: "changed", header: "Last change", cell: ({ row: { original: row } }) => <span className="text-xs text-muted-foreground">{formatDateTime(row.updatedAt)}</span> },
            {
                id: "redirects",
                header: () => <span className="block text-right">Redirects</span>,
                cell: ({ row: { original: row } }) => <span className="block text-right text-sm tabular-nums text-muted-foreground">{row.redirectCount || "—"}</span>,
            },
            {
                id: "actions",
                header: "",
                cell: ({ row: { original: row } }) => (
                    <RowActions
                        row={row}
                        mayDelete={mayDelete}
                        mayEdit={mayEdit}
                        mayAddress={mayAddress}
                        onStudio={() => openStudio({ kind: "page", key: row.key })}
                        onAddress={() => setAddressing(row)}
                        onArchive={() => setPending({ action: "archive", page: row })}
                        onRestore={() => setPending({ action: "restore", page: row })}
                    />
                ),
            },
        ],
        [mayDelete, mayEdit, mayAddress],
    );

    return (
        <div className="space-y-5" data-testid="pages-desk">
            <PageHeader
                title="Pages"
                subtitle={`${pages.length - archivedCount} ${pages.length - archivedCount === 1 ? "page" : "pages"}, ${liveCount} live. Every address the website answers and the apps can open, laid out in Studio. Looking for text pages? They are Articles now.`}
                actions={
                    <>
                        <Button asChild variant="outline" className="bg-card">
                            <Link href="/content/articles">Articles</Link>
                        </Button>
                        {mayEdit && (
                            <Button onClick={() => setCreating(true)} data-testid="pages-new">
                                <Plus className="mr-1.5 size-4" />
                                New page
                            </Button>
                        )}
                    </>
                }
            />

            <Tabs defaultValue="pages">
                <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b bg-transparent p-0">
                    {[
                        { value: "pages", label: `Pages (${rows.length})` },
                        { value: "redirects", label: `Redirects (${redirects.length})` },
                    ].map((tab) => (
                        <TabsTrigger
                            key={tab.value}
                            value={tab.value}
                            className="-mb-px rounded-none border-b-2 border-transparent px-0 pb-2.5 pt-1 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                            data-testid={`pages-tab-${tab.value}`}
                        >
                            {tab.label}
                        </TabsTrigger>
                    ))}
                </TabsList>

                <TabsContent value="pages" className="mt-4 space-y-3">
                    {archivedCount > 0 && (
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Checkbox checked={showArchived} onCheckedChange={(checked) => setShowArchived(checked === true)} />
                            Show {archivedCount} archived
                        </label>
                    )}
                    {rows.length === 0 ? (
                        <Card className="rounded-lg border-border shadow-none">
                            <EmptyState
                                icon={FileText}
                                title="No pages answered"
                                description="The website's own pages are seeded by the backend; a page made here appears the moment it is created."
                                action={mayEdit ? <Button onClick={() => setCreating(true)}>New page</Button> : undefined}
                            />
                        </Card>
                    ) : (
                        <DataTable<SitePageRow, unknown>
                            columns={columns}
                            data={rows}
                            getRowId={(row) => row.key}
                            showColumnToggle={false}
                            showPagination={false}
                            bulkActions={(selected, _clear, keep) => (
                                <BulkActions<SitePageRow>
                                    rows={selected}
                                    actions={bulkActions}
                                    label={(row) => row.title}
                                    onSettled={(outcome) => {
                                        keep(outcome.failed.map((failure) => failure.row));
                                        onChanged();
                                    }}
                                />
                            )}
                        />
                    )}
                </TabsContent>

                <TabsContent value="redirects" className="mt-4">
                    <RedirectsTab redirects={redirects} pages={pages} mayManage={mayAddress} mayRemove={mayAddress && mayDelete} onChanged={onChanged} />
                </TabsContent>
            </Tabs>

            <NewPageDialog
                open={creating}
                onOpenChange={setCreating}
                takenKeys={pages.map((page) => page.key)}
                takenPaths={[...pages.map((page) => page.path), ...redirects.map((redirect) => redirect.fromPath)]}
                onCreated={() => onChanged()}
            />

            <ChangeAddressDialog
                page={addressing}
                onOpenChange={(open) => !open && setAddressing(null)}
                takenPaths={[...pages.map((page) => page.path), ...redirects.map((redirect) => redirect.fromPath)]}
                onChanged={onChanged}
            />

            <ConfirmDialog
                open={pending !== null}
                onOpenChange={(open) => !open && !busy && setPending(null)}
                title={pending?.action === "archive" ? `Archive “${pending.page.title}”?` : `Restore “${pending?.page.title ?? ""}”?`}
                description={
                    pending?.action === "archive"
                        ? `${pending.page.path} answers 404 until it is restored. Every version is kept, and the key stays taken.`
                        : "The page answers at its address again with whatever version was live."
                }
                confirmLabel={pending?.action === "archive" ? "Archive" : "Restore"}
                destructive={pending?.action === "archive"}
                busy={busy}
                onConfirm={() => pending && void run(pending)}
            />
        </div>
    );
}

function RowActions({
    row,
    mayDelete,
    mayEdit,
    mayAddress,
    onStudio,
    onAddress,
    onArchive,
    onRestore,
}: {
    row: SitePageRow;
    mayDelete: boolean;
    /** Restore is `content.edit` — the route's power (Archive stays `content.delete`). */
    mayEdit: boolean;
    mayAddress: boolean;
    onStudio: () => void;
    onAddress: () => void;
    onArchive: () => void;
    onRestore: () => void;
}) {
    const addressBlocked = !mayAddress ? ADDRESS_PERMISSION_SENTENCE : row.addressLocked ? ADDRESS_LOCKED_SENTENCE : null;
    return (
        <div className="flex items-center justify-end gap-1">
            {!row.archivedAt && (
                <Button variant="outline" size="sm" className="h-7 bg-card" onClick={onStudio} data-testid={`page-studio-${row.key}`}>
                    <ExternalLink className="mr-1 size-3.5" />
                    Open in Studio
                </Button>
            )}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 px-2" aria-label={`More for ${row.title}`} data-testid={`page-more-${row.key}`}>
                        <MoreHorizontal className="size-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                    {/* A disabled item cannot carry a tooltip, so the reason sits under the label. */}
                    <DropdownMenuItem disabled={addressBlocked !== null || Boolean(row.archivedAt)} onSelect={onAddress} title={addressBlocked ?? undefined} data-testid={`page-address-${row.key}`}>
                        <Pencil className="mr-2 size-4" />
                        <span className="flex flex-col">
                            <span>Change address</span>
                            {addressBlocked && <span className="text-[11px] text-muted-foreground">{addressBlocked}</span>}
                        </span>
                    </DropdownMenuItem>
                    {row.kind === "CUSTOM" && (
                        <>
                            <DropdownMenuSeparator />
                            {row.archivedAt ? (
                                <DropdownMenuItem disabled={!mayEdit} onSelect={onRestore} data-testid={`page-restore-${row.key}`}>
                                    <ArchiveRestore className="mr-2 size-4" />
                                    Restore
                                </DropdownMenuItem>
                            ) : (
                                <DropdownMenuItem disabled={!mayDelete} onSelect={onArchive} className="text-danger focus:text-danger" data-testid={`page-archive-${row.key}`}>
                                    <Archive className="mr-2 size-4" />
                                    Archive
                                </DropdownMenuItem>
                            )}
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
