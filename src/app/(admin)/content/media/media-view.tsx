"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Archive, ImageIcon, Loader2, Pencil, RotateCcw, Search, Tag, Tags, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { BulkActions, BulkBar, useIdSelection, type BulkAction } from "@/components/adx/bulk-actions";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MAX_TAGS, formatBytes, mediaService, parseTags, tagsAdded, tagsRemoved, usageLine, usagesOf, type MediaAsset, type MediaSpec } from "@/services/media";
import { MediaEditDialog } from "./media-edit-dialog";
import { MediaUploadDialog } from "./media-upload-dialog";

export interface MediaFilters {
    q: string;
    tag: string;
    spec: string;
    archived: boolean;
}

const ANY = "__any__";

interface MediaViewProps {
    specs: MediaSpec[];
    assets: MediaAsset[] | null;
    loading: boolean;
    error: string | null;
    filters: MediaFilters;
    onFilters: (next: MediaFilters) => void;
    onChanged: () => void;
}

/**
 * LM-1 — the media library under Content.
 *
 * A grid of every picture with the facts a block needs of it: its size spec,
 * its pixels and weight, its alt text (a picture without one is flagged — a
 * block may not use it until it has one) and its tags. Upload checks the
 * spec in the browser before the file leaves; archive is refused by the
 * server while a published layout draws the picture, and the refusal names
 * where.
 *
 * 28 Sep 2026: pictures are selectable — archive, restore, and add or take
 * off tags across a selection, each the single-picture route once per
 * picture. A picture still drawn by a published layout fails its archive
 * with the server's reason, named in the summary, and stays selected.
 *
 * 28 Sep 2026: ADX's own pictures only. The ad artwork advertisers upload
 * lives with their ads (Ads & sponsored › Display ads, the Gallery view);
 * the line under the heading says so and links there.
 */
export function MediaView({ specs, assets, loading, error, filters, onFilters, onChanged }: MediaViewProps) {
    const { can } = useAuth();
    const mayEdit = can("content.edit");
    const [uploading, setUploading] = React.useState(false);
    const [editing, setEditing] = React.useState<MediaAsset | null>(null);
    const [archiving, setArchiving] = React.useState<MediaAsset | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [inUse, setInUse] = React.useState<{ asset: MediaAsset; message: string; where: string[] } | null>(null);
    const specByKey = React.useMemo(() => new Map(specs.map((spec) => [spec.key, spec])), [specs]);
    const set = (patch: Partial<MediaFilters>) => onFilters({ ...filters, ...patch });

    async function archive(asset: MediaAsset) {
        setBusy(true);
        try {
            await mediaService.archive(asset.id);
            toast.success("Archived", { description: "It leaves the picker. Restore it from the archived view." });
            setArchiving(null);
            onChanged();
        } catch (cause) {
            setArchiving(null);
            if (cause instanceof ApiError && cause.status === 409) {
                setInUse({ asset, message: cause.message, where: usagesOf(cause.details).map(usageLine) });
            } else toast.error(cause instanceof Error ? cause.message : "That did not go through.");
        } finally {
            setBusy(false);
        }
    }

    async function restore(asset: MediaAsset) {
        try {
            await mediaService.restore(asset.id);
            toast.success("Restored", { description: "Back in the picker." });
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "That did not go through.");
        }
    }

    const rows = assets ?? [];
    const selection = useIdSelection(rows, assetId);
    const bulkActions = useMediaBulkActions(mayEdit);

    return (
        <div className="space-y-5" data-testid="media-desk">
            <div className="space-y-2">
                <PageHeader
                    title="Media library"
                    subtitle="Every picture ADX's layout blocks and tiles draw. Each is checked against its size spec on upload and needs alt text before a block may use it."
                    actions={
                        mayEdit ? (
                            <Button onClick={() => setUploading(true)} data-testid="media-upload">
                                <Upload className="mr-1.5 size-4" />
                                Upload
                            </Button>
                        ) : undefined
                    }
                />
                <p className="text-sm text-muted-foreground" data-testid="media-ad-artwork-note">
                    Ad artwork uploaded by advertisers lives with their ads —{" "}
                    <Link href="/ads/display" className="font-medium text-foreground underline underline-offset-2 hover:text-primary">
                        Ads &amp; sponsored › Display ads
                    </Link>
                    .
                </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full max-w-xs">
                    <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input value={filters.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search title or alt text" className="h-9 bg-card pl-8" aria-label="Search" />
                </div>
                <Input value={filters.tag} onChange={(e) => set({ tag: e.target.value })} placeholder="Tag" className="h-9 w-36 bg-card" aria-label="Tag" />
                <Select value={filters.spec || ANY} onValueChange={(value) => set({ spec: value === ANY ? "" : value })}>
                    <SelectTrigger className="h-9 w-56 bg-card" aria-label="Size spec">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ANY}>Every size spec</SelectItem>
                        {specs.map((spec) => (
                            <SelectItem key={spec.key} value={spec.key}>
                                {spec.label} · {spec.width}×{spec.height}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <label className="ml-auto flex h-9 items-center gap-2 text-sm text-muted-foreground">
                    <Switch checked={filters.archived} onCheckedChange={(archived) => set({ archived })} aria-label="Show archived" />
                    Archived
                </label>
            </div>

            {error ? (
                <Card className="rounded-lg border-danger/40 bg-danger-soft p-5 text-sm text-foreground shadow-none">{error}</Card>
            ) : loading && assets === null ? (
                <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Loading…
                </div>
            ) : rows.length === 0 ? (
                <Card className="rounded-lg border-border shadow-none">
                    <EmptyState
                        icon={ImageIcon}
                        title={filters.archived ? "Nothing archived" : filters.q || filters.tag || filters.spec ? "Nothing matches" : "No pictures yet"}
                        description={
                            filters.archived
                                ? "An archived picture leaves the picker and waits here to be restored."
                                : filters.q || filters.tag || filters.spec
                                  ? "No picture matches those filters."
                                  : "Upload the banners, tiles and pictures the layouts will draw. Each is checked against its size spec."
                        }
                        action={
                            mayEdit && !filters.archived ? (
                                <Button onClick={() => setUploading(true)}>
                                    <Upload className="mr-1.5 size-4" />
                                    Upload
                                </Button>
                            ) : undefined
                        }
                    />
                </Card>
            ) : (
                <div className="space-y-3">
                    <BulkBar count={selection.selected.length} total={rows.length} onSelectAll={selection.selectAll} onClear={selection.clear}>
                        <BulkActions<MediaAsset>
                            rows={selection.selected}
                            actions={bulkActions}
                            label={(asset) => asset.title || "Untitled"}
                            onSettled={(outcome) => {
                                selection.keep(outcome.failed.map((failure) => failure.row));
                                onChanged();
                            }}
                        />
                    </BulkBar>
                    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", loading && "opacity-60")}>
                        {rows.map((asset) => {
                            const spec = asset.spec ? specByKey.get(asset.spec) : undefined;
                            return (
                                <Card key={asset.id} className="flex flex-col overflow-hidden rounded-lg border-border shadow-none" data-testid={`media-card-${asset.id}`}>
                                    <div className="relative flex aspect-[4/3] items-center justify-center bg-muted/60 p-2">
                                        <Checkbox
                                            checked={selection.has(asset)}
                                            onCheckedChange={(checked) => selection.toggle(asset, checked === true)}
                                            aria-label={`Select ${asset.title || "this picture"}`}
                                            className="absolute left-2 top-2 bg-card"
                                            data-testid={`media-select-${asset.id}`}
                                        />
                                        {/* eslint-disable-next-line @next/next/no-img-element -- a stored picture of any size; next/image would need every host configured */}
                                        <img src={asset.url} alt={asset.altText ?? ""} className="max-h-full max-w-full object-contain" loading="lazy" />
                                    </div>
                                    <div className="flex flex-1 flex-col gap-1.5 p-3">
                                        <p className="truncate text-sm font-medium text-foreground">{asset.title || "Untitled"}</p>
                                        {asset.altText ? (
                                            <p className="line-clamp-2 text-xs text-muted-foreground">{asset.altText}</p>
                                        ) : (
                                            <p className="flex items-center gap-1 text-xs text-warning">
                                                <AlertTriangle className="size-3" aria-hidden />
                                                No alt text — blocks cannot use it yet
                                            </p>
                                        )}
                                        <div className="flex flex-wrap gap-1">
                                            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{spec ? spec.label : asset.spec ?? "No spec"}</span>
                                            {asset.width && asset.height && (
                                                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                                                    {asset.width}×{asset.height}
                                                </span>
                                            )}
                                            {asset.bytes !== null && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{formatBytes(asset.bytes)}</span>}
                                        </div>
                                        {asset.tags.length > 0 && (
                                            <p className="flex flex-wrap gap-1">
                                                {asset.tags.map((tag) => (
                                                    <button key={tag} type="button" onClick={() => set({ tag })} className="text-[11px] text-muted-foreground hover:text-foreground">
                                                        #{tag}
                                                    </button>
                                                ))}
                                            </p>
                                        )}
                                        <p className="mt-auto pt-1 text-[11px] text-muted-foreground">
                                            {asset.archivedAt ? `Archived ${formatDate(asset.archivedAt)}` : `Added ${formatDate(asset.createdAt)}`}
                                        </p>
                                    </div>
                                    {mayEdit && (
                                        <div className="flex justify-end gap-1 border-t px-2 py-1.5">
                                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditing(asset)}>
                                                <Pencil className="mr-1 size-3" />
                                                Edit
                                            </Button>
                                            {asset.archivedAt ? (
                                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void restore(asset)}>
                                                    <RotateCcw className="mr-1 size-3" />
                                                    Restore
                                                </Button>
                                            ) : (
                                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-danger hover:text-danger" onClick={() => setArchiving(asset)}>
                                                    <Archive className="mr-1 size-3" />
                                                    Archive
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </Card>
                            );
                        })}
                    </div>
                </div>
            )}
            {rows.length > 0 && (
                <p className="text-xs text-muted-foreground">
                    {rows.length} {rows.length === 1 ? "picture" : "pictures"}
                    {rows.length >= 200 ? " — the first 200; narrow the search to reach the rest." : ""}
                </p>
            )}

            <MediaUploadDialog
                open={uploading}
                specs={specs}
                onOpenChange={setUploading}
                onUploaded={() => {
                    setUploading(false);
                    onChanged();
                }}
            />
            <MediaEditDialog
                asset={editing}
                onOpenChange={(open) => !open && setEditing(null)}
                onSaved={() => {
                    setEditing(null);
                    onChanged();
                }}
            />
            <ConfirmDialog
                open={archiving !== null}
                onOpenChange={(open) => !open && !busy && setArchiving(null)}
                title="Archive this picture?"
                description="It leaves the picker, and no new block can use it. A picture a published layout still draws cannot be archived."
                confirmLabel="Archive"
                destructive
                busy={busy}
                onConfirm={() => archiving && void archive(archiving)}
            />
            <ConfirmDialog
                open={inUse !== null}
                onOpenChange={(open) => !open && setInUse(null)}
                title="Still on a published layout"
                description={inUse?.message ?? ""}
                confirmLabel="OK"
                onConfirm={() => setInUse(null)}
            >
                {inUse && inUse.where.length > 0 && (
                    <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground" data-testid="media-in-use">
                        {inUse.where.map((line, index) => (
                            <li key={`${line}-${index}`}>{line}</li>
                        ))}
                    </ul>
                )}
            </ConfirmDialog>
        </div>
    );
}

const assetId = (asset: MediaAsset): string => asset.id;
const skipOf = (result: { tags: string[] } | { skip: string }): string | null => ("skip" in result ? result.skip : null);

export const MEDIA_BULK_BLOCKED = "Changing pictures needs content.edit.";

/** The media library's bulk actions: archive, restore, and tags added or taken off — all `content.edit`, as the card's own buttons are. */
function useMediaBulkActions(mayEdit: boolean): BulkAction<MediaAsset>[] {
    const [tagText, setTagText] = React.useState("");
    const tags = parseTags(tagText);
    const blocked = mayEdit ? null : MEDIA_BULK_BLOCKED;
    const tagBody = (
        <div className="grid gap-1.5">
            <Label htmlFor="media-bulk-tags">Tags (comma-separated)</Label>
            <Input id="media-bulk-tags" value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="festive, diwali" data-testid="media-bulk-tags" />
            <p className="text-xs text-muted-foreground">Lower-cased, spaces become hyphens; a picture carries at most {MAX_TAGS}.</p>
        </div>
    );
    return [
        {
            key: "archive",
            label: "Archive",
            icon: Archive,
            blocked,
            skip: (asset) => (asset.archivedAt ? "already archived" : null),
            participle: "archived",
            noun: ["picture", "pictures"],
            phrase: (count) => `Archive ${count}`,
            description: "Each leaves the picker. A picture a published layout still draws is refused, and the summary says where.",
            destructive: true,
            run: (asset) => mediaService.archive(asset.id),
        },
        {
            key: "restore",
            label: "Restore",
            icon: RotateCcw,
            blocked,
            skip: (asset) => (asset.archivedAt ? null : "not archived"),
            participle: "restored",
            noun: ["picture", "pictures"],
            phrase: (count) => `Restore ${count}`,
            description: "Each is back in the picker.",
            run: (asset) => mediaService.restore(asset.id),
        },
        {
            key: "tag-add",
            label: "Add tags",
            icon: Tag,
            blocked,
            skip: (asset) => (tags.length === 0 ? null : skipOf(tagsAdded(asset.tags, tags))),
            participle: "tagged",
            noun: ["picture", "pictures"],
            phrase: (count) => `Tag ${count}`,
            onOpen: () => setTagText(""),
            body: tagBody,
            ready: tags.length > 0,
            run: (asset) => {
                const next = tagsAdded(asset.tags, tags);
                return "tags" in next ? mediaService.update(asset.id, { tags: next.tags }) : Promise.resolve(asset);
            },
        },
        {
            key: "tag-remove",
            label: "Remove tags",
            icon: Tags,
            blocked,
            skip: (asset) => (tags.length === 0 ? null : skipOf(tagsRemoved(asset.tags, tags))),
            participle: "untagged",
            noun: ["picture", "pictures"],
            phrase: (count) => `Take the tags off ${count}`,
            onOpen: () => setTagText(""),
            body: tagBody,
            ready: tags.length > 0,
            run: (asset) => {
                const next = tagsRemoved(asset.tags, tags);
                return "tags" in next ? mediaService.update(asset.id, { tags: next.tags }) : Promise.resolve(asset);
            },
        },
    ];
}
