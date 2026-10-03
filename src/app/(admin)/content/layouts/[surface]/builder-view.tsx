"use client";

import * as React from "react";
import Link from "next/link";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertCircle, ArrowDown, ArrowLeft, ArrowUp, ChevronDown, ChevronRight, Copy, Eye, EyeOff, GripVertical, History, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";
import { cn } from "@/lib/utils";
import {
    LAYOUT_SURFACE_LABEL,
    audienceLine,
    blockRuleProblems,
    canAdd,
    cleanBlock,
    duplicateBlock,
    formProblems,
    issuesByBlock,
    keepPinnedLast,
    layoutsService,
    moveBlock,
    newBlock,
    nudgeBlock,
    pinnedFor,
    sameBlocks,
    toFormModel,
    typeRuleProblems,
    typesForSurface,
    type BlockIssue,
    type BlockTypeDef,
    type LayoutBlock,
} from "@/services/layouts";
import type { MediaAsset } from "@/services/media";
import { BlockEditor } from "./block-editor";
import { BuilderProvider, useRememberingMap, type BuilderLookups } from "./builder-context";
import type { BuilderData } from "./builder-loader";
import { HistorySheet } from "./history-sheet";
import { PreviewPanel } from "./preview-panel";

/** Everything wrong with one block before the server would say so. */
export function localProblems(block: LayoutBlock, def: BlockTypeDef | undefined): string[] {
    if (!def) return [`Unknown block type “${block.type}”.`];
    const fields = Object.entries(formProblems(def.props, toFormModel(def.props, block.props))).map(([path, message]) => {
        const spec = def.props.find((item) => item.key === path.split(".")[0]);
        return `${spec?.label ?? path}: ${message}`;
    });
    return [...fields, ...typeRuleProblems(block.type, block.props), ...blockRuleProblems(block)];
}

/** A one-line summary of what a block says — its title, headline or slot. */
function blockSummary(block: LayoutBlock): string | null {
    const props = block.props;
    for (const key of ["title", "headline", "slotKey", "contentSlug"]) {
        const value = props[key];
        if (typeof value === "string" && value.trim()) return key === "contentSlug" ? `/${value}` : value;
    }
    if (Array.isArray(props.tiles)) return `${props.tiles.length} ${props.tiles.length === 1 ? "tile" : "tiles"}`;
    if (typeof props.markdown === "string" && props.markdown.trim()) return props.markdown.trim().slice(0, 60);
    return null;
}

/**
 * LM-1 — one surface's layout builder.
 *
 * The draft's blocks in order down the left (drag a handle, or focus it and
 * use Space + arrows; Alt+↑/↓ on a row and the arrow buttons do the same),
 * each opening into its editor; the preview on the right, resolved by the
 * server for a side and a city. Save keeps the draft; Publish (content
 * approvers) makes it live and retires the live one; History restores any
 * earlier version as a new one. Leaving with unsaved edits asks first.
 */
export function BuilderView({ data, onReload }: { data: BuilderData; onReload: () => void }) {
    const { detail } = data;
    const surface = detail.surface;
    const { can } = useAuth();
    const mayEdit = can("content.edit");
    const mayPublish = can("content.approve");
    /* A DELETE names a delete power: discarding the saved draft needs content.delete. */
    const mayDiscard = can("content.delete");
    const pinned = pinnedFor(surface);

    const base = React.useMemo(() => detail.draft?.blocks ?? detail.live?.blocks ?? detail.defaults, [detail]);
    const [blocks, setBlocks] = React.useState<LayoutBlock[]>(base);
    const [openId, setOpenId] = React.useState<string | null>(null);
    const [showErrors, setShowErrors] = React.useState(false);
    const [issues, setIssues] = React.useState<Map<string, BlockIssue[]>>(new Map());
    const [busy, setBusy] = React.useState<null | "save" | "publish" | "discard">(null);
    const [publishOpen, setPublishOpen] = React.useState(false);
    const [discardOpen, setDiscardOpen] = React.useState(false);
    const [historyOpen, setHistoryOpen] = React.useState(false);
    const [note, setNote] = React.useState(detail.draft?.changeNote ?? "");

    const dirty = !sameBlocks(blocks.map(cleanBlock), base.map(cleanBlock));
    useUnsavedGuard(dirty);

    /* ---- lookups the fields draw with ---- */
    const types = React.useMemo(() => new Map(data.types.map((def) => [def.type, def])), [data.types]);
    const [media, rememberMediaRaw] = useRememberingMap<MediaAsset>(() => data.media.map((asset) => [asset.id, asset]));
    const [cityNames, rememberCityRaw] = useRememberingMap<string>(() => data.cities.map((city) => [city.id, city.name]));
    const [listingNames, rememberListing] = useRememberingMap<string>(() => []);
    const lookups: BuilderLookups = React.useMemo(
        () => ({
            types,
            specs: data.specs,
            media,
            rememberMedia: (asset: MediaAsset) => rememberMediaRaw(asset.id, asset),
            slots: data.slots,
            pages: data.pages,
            sitePages: data.sitePages,
            forms: data.forms,
            cityNames,
            rememberCity: (city) => rememberCityRaw(city.id, city.name),
            listingNames,
            rememberListing,
        }),
        [types, data.specs, data.slots, data.pages, data.sitePages, data.forms, media, rememberMediaRaw, cityNames, rememberCityRaw, listingNames, rememberListing],
    );

    const allowed = React.useMemo(() => typesForSurface(data.types, surface), [data.types, surface]);
    const problems = React.useMemo(() => new Map(blocks.map((block) => [block.id, localProblems(block, types.get(block.type))])), [blocks, types]);
    const problemCount = [...problems.values()].filter((list) => list.length > 0).length;

    const change = (next: LayoutBlock[]) => {
        setBlocks(next);
        setIssues(new Map());
    };
    const update = (id: string, next: LayoutBlock) => change(blocks.map((block) => (block.id === id ? next : block)));

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
    const onDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const from = blocks.findIndex((block) => block.id === active.id);
        const to = blocks.findIndex((block) => block.id === over.id);
        change(keepPinnedLast(moveBlock(blocks, from, to), pinned));
    };

    function add(def: BlockTypeDef) {
        const block = newBlock(def);
        change(keepPinnedLast([...blocks, block], pinned));
        setOpenId(block.id);
    }

    async function saveDraft(changeNote?: string): Promise<boolean> {
        if (problemCount > 0) {
            setShowErrors(true);
            const first = blocks.find((block) => (problems.get(block.id) ?? []).length > 0);
            if (first) setOpenId(first.id);
            toast.error(`${problemCount} ${problemCount === 1 ? "block needs" : "blocks need"} attention before saving.`);
            return false;
        }
        try {
            await layoutsService.saveDraft(surface, blocks.map(cleanBlock), changeNote?.trim() || undefined);
            return true;
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 400) {
                const found = issuesByBlock(cause.details);
                setIssues(found);
                setShowErrors(true);
                const firstKey = [...found.keys()].find((key) => key && !key.startsWith("#"));
                if (firstKey) setOpenId(firstKey);
            }
            toast.error(cause instanceof Error ? cause.message : "The draft did not save.");
            return false;
        }
    }

    async function onSave() {
        setBusy("save");
        const ok = await saveDraft();
        setBusy(null);
        if (ok) {
            toast.success("Draft saved", { description: "Nothing changes for viewers until it is published." });
            onReload();
        }
    }

    async function onPublish() {
        setBusy("publish");
        try {
            if (dirty) {
                const ok = await saveDraft(note);
                if (!ok) return;
            }
            const published = await layoutsService.publish(surface, note.trim() || undefined);
            toast.success(`Version ${published.number} is live`, { description: "Clients pick it up within a minute." });
            setPublishOpen(false);
            onReload();
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 400) setIssues(issuesByBlock(cause.details));
            toast.error(cause instanceof Error ? cause.message : "The layout did not publish.");
        } finally {
            setBusy(null);
        }
    }

    async function onDiscard() {
        setBusy("discard");
        try {
            if (detail.draft) {
                await layoutsService.discardDraft(surface);
                toast.success("Draft discarded");
                setDiscardOpen(false);
                onReload();
            } else {
                change(base);
                setOpenId(null);
                setDiscardOpen(false);
            }
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "That did not go through.");
        } finally {
            setBusy(null);
        }
    }

    const listIssues = issues.get("") ?? [];
    const label = detail.label ?? LAYOUT_SURFACE_LABEL[surface];

    return (
        <BuilderProvider value={lookups}>
            <div className="space-y-5" data-testid="layout-builder">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                        <Link href="/content/layouts" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                            <ArrowLeft className="size-3" /> Layouts
                        </Link>
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{label}</h1>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            {detail.live ? (
                                <>
                                    <StatusBadge status={{ label: `Live v${detail.live.number}`, tone: "success" }} />
                                    <span>{detail.live.publishedAt ? `published ${formatDateTime(detail.live.publishedAt)}` : ""}</span>
                                </>
                            ) : (
                                <StatusBadge status={{ label: "Default order", tone: "neutral" }} />
                            )}
                            {detail.draft && (
                                <>
                                    <StatusBadge status={{ label: `Draft v${detail.draft.number}`, tone: "warning" }} />
                                    <span>saved {formatDateTime(detail.draft.updatedAt ?? detail.draft.createdAt)}</span>
                                </>
                            )}
                            {dirty && <StatusBadge status={{ label: "Unsaved changes", tone: "info" }} />}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        <Button variant="outline" className="bg-card" onClick={() => setHistoryOpen(true)} data-testid="layout-history-open">
                            <History className="mr-1.5 size-4" />
                            History
                        </Button>
                        {((detail.draft && mayDiscard) || (!detail.draft && dirty && mayEdit)) && (
                            <Button variant="outline" className="bg-card text-danger hover:text-danger" onClick={() => setDiscardOpen(true)} disabled={busy !== null} data-testid="layout-discard">
                                {detail.draft ? "Discard draft" : "Undo changes"}
                            </Button>
                        )}
                        {mayEdit && (
                            <Button variant="outline" className="bg-card" onClick={() => void onSave()} disabled={!dirty || busy !== null} data-testid="layout-save">
                                {busy === "save" ? "Saving…" : "Save draft"}
                            </Button>
                        )}
                        <Button
                            onClick={() => setPublishOpen(true)}
                            disabled={!mayPublish || busy !== null || (!detail.draft && !dirty)}
                            title={!mayPublish ? "Publishing needs content.approve" : !detail.draft && !dirty ? "Nothing to publish — change something first" : undefined}
                            data-testid="layout-publish"
                        >
                            Publish
                        </Button>
                    </div>
                </div>

                {!mayEdit && <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">You can read this layout; editing needs content.edit.</p>}

                <div className="grid gap-5 xl:grid-cols-5">
                    <div className="space-y-3 xl:col-span-3">
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-sm text-muted-foreground">
                                {blocks.length} {blocks.length === 1 ? "block" : "blocks"}, top to bottom
                                {problemCount > 0 && showErrors ? <span className="text-danger"> · {problemCount} need attention</span> : null}
                            </p>
                            {mayEdit && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button size="sm" data-testid="layout-add-block">
                                            <Plus className="mr-1 size-4" />
                                            Add block
                                            <ChevronDown className="ml-1 size-3.5" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="max-h-96 w-72 overflow-y-auto">
                                        {(["SYSTEM", "CONTENT"] as const).map((kind, index) => {
                                            const group = allowed.filter((def) => def.kind === kind);
                                            if (group.length === 0) return null;
                                            return (
                                                <React.Fragment key={kind}>
                                                    {index > 0 && <DropdownMenuSeparator />}
                                                    <DropdownMenuLabel className="text-xs text-muted-foreground">{kind === "SYSTEM" ? "This screen’s own sections" : "Content blocks"}</DropdownMenuLabel>
                                                    {group.map((def) => {
                                                        const ok = canAdd(def, blocks);
                                                        return (
                                                            <DropdownMenuItem key={def.type} disabled={!ok} onSelect={() => add(def)} data-testid={`add-${def.type}`}>
                                                                <span className="flex-1">{def.label}</span>
                                                                {!ok && <span className="text-[11px] text-muted-foreground">on the screen</span>}
                                                            </DropdownMenuItem>
                                                        );
                                                    })}
                                                </React.Fragment>
                                            );
                                        })}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </div>

                        {listIssues.length > 0 && (
                            <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                                {listIssues.map((issue) => issue.message).join(" ")}
                            </p>
                        )}

                        {blocks.length === 0 ? (
                            <Card className="rounded-lg border-dashed p-8 text-center text-sm text-muted-foreground shadow-none">
                                No blocks — this screen would draw nothing but its fixed parts. Add a block, or discard the draft to go back.
                            </Card>
                        ) : (
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                                <SortableContext items={blocks.map((block) => block.id)} strategy={verticalListSortingStrategy}>
                                    <ol className="space-y-2" aria-label="Blocks">
                                        {blocks.map((block, index) => {
                                            const def = types.get(block.type);
                                            const isPinned = pinned.includes(block.type);
                                            const serverIssues = issues.get(block.id) ?? issues.get(`#${index}`) ?? [];
                                            const local = problems.get(block.id) ?? [];
                                            return (
                                                <BlockRow
                                                    key={block.id}
                                                    block={block}
                                                    def={def}
                                                    index={index}
                                                    count={blocks.length}
                                                    pinned={isPinned}
                                                    readOnly={!mayEdit}
                                                    open={openId === block.id}
                                                    flagged={serverIssues.length > 0 || (showErrors && local.length > 0)}
                                                    serverIssues={serverIssues}
                                                    onToggle={() => setOpenId(openId === block.id ? null : block.id)}
                                                    onNudge={(delta) => change(nudgeBlock(blocks, block.id, delta, pinned))}
                                                    onHide={() => update(block.id, { ...block, hidden: !block.hidden })}
                                                    onDuplicate={() => change(keepPinnedLast(duplicateBlock(blocks, block.id), pinned))}
                                                    onRemove={() => change(blocks.filter((item) => item.id !== block.id))}
                                                >
                                                    {openId === block.id && (
                                                        <BlockEditor surface={surface} block={block} def={def} pinned={isPinned} showErrors={showErrors} onChange={(next) => update(block.id, next)} />
                                                    )}
                                                </BlockRow>
                                            );
                                        })}
                                    </ol>
                                </SortableContext>
                            </DndContext>
                        )}
                    </div>

                    <div className="xl:col-span-2">
                        <div className="xl:sticky xl:top-4">
                            <PreviewPanel
                                surface={surface}
                                hasDraft={!!detail.draft}
                                liveNumber={detail.live?.number ?? null}
                                stamp={`${detail.draft?.id ?? ""}:${detail.draft?.updatedAt ?? ""}:${detail.live?.id ?? ""}`}
                                dirty={dirty}
                            />
                        </div>
                    </div>
                </div>

                <Dialog open={publishOpen} onOpenChange={(open) => busy === null && setPublishOpen(open)}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Publish this layout?</DialogTitle>
                            <DialogDescription>
                                {dirty ? "Your edits are saved as the draft first. " : ""}
                                It becomes what every viewer of {label} gets{detail.live ? `, and version ${detail.live.number} retires` : ""}. Clients pick it up within a minute.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-1.5">
                            <Label htmlFor="layout-note">What changed</Label>
                            <Textarea id="layout-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={300} placeholder="Diwali banner on top; nearby listings moved up" />
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setPublishOpen(false)} disabled={busy !== null}>
                                Cancel
                            </Button>
                            <Button onClick={() => void onPublish()} disabled={busy !== null} data-testid="layout-publish-confirm">
                                {busy === "publish" ? "Publishing…" : "Publish"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <ConfirmDialog
                    open={discardOpen}
                    onOpenChange={(open) => !open && busy === null && setDiscardOpen(false)}
                    title={detail.draft ? `Discard draft v${detail.draft.number}?` : "Undo your changes?"}
                    description={
                        detail.draft
                            ? `The draft goes; ${detail.live ? `version ${detail.live.number} stays live` : "the screen keeps its default order"}. This cannot be undone.`
                            : "The editor goes back to what is live."
                    }
                    confirmLabel={detail.draft ? "Discard" : "Undo"}
                    destructive
                    busy={busy === "discard"}
                    onConfirm={() => void onDiscard()}
                />

                <HistorySheet surface={surface} open={historyOpen} onOpenChange={setHistoryOpen} mayRestore={mayPublish} onRestored={onReload} dirty={dirty} />
            </div>
        </BuilderProvider>
    );
}

interface BlockRowProps {
    block: LayoutBlock;
    def: BlockTypeDef | undefined;
    index: number;
    count: number;
    pinned: boolean;
    readOnly: boolean;
    open: boolean;
    flagged: boolean;
    serverIssues: BlockIssue[];
    onToggle: () => void;
    onNudge: (delta: -1 | 1) => void;
    onHide: () => void;
    onDuplicate: () => void;
    onRemove: () => void;
    children: React.ReactNode;
}

function BlockRow({ block, def, index, count, pinned, readOnly, open, flagged, serverIssues, onToggle, onNudge, onHide, onDuplicate, onRemove, children }: BlockRowProps) {
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: block.id, disabled: pinned || readOnly });
    const style = { transform: CSS.Transform.toString(transform), transition };
    const summary = blockSummary(block);
    const audience = audienceLine(block);
    const label = def?.label ?? block.type;

    return (
        <li
            ref={setNodeRef}
            style={style}
            className={cn("rounded-lg border bg-card", isDragging && "relative z-10 shadow-lg", flagged && "border-danger/60", block.hidden && "opacity-70")}
            data-testid={`block-row-${block.type}`}
            onKeyDown={(event) => {
                if (readOnly || !event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
                if ((event.target as HTMLElement).closest("input, textarea, [contenteditable=true], [role=combobox]")) return;
                event.preventDefault();
                onNudge(event.key === "ArrowUp" ? -1 : 1);
            }}
        >
            <div className="flex items-center gap-2 px-2 py-2">
                <button
                    ref={setActivatorNodeRef}
                    type="button"
                    className={cn("flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground", pinned || readOnly ? "cursor-default opacity-40" : "cursor-grab hover:bg-muted active:cursor-grabbing")}
                    aria-label={pinned ? `${label} stays last` : `Reorder ${label} — Space to pick up, arrows to move`}
                    {...attributes}
                    {...listeners}
                >
                    <GripVertical className="size-4" />
                </button>
                <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open}>
                    {open ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
                    <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-medium text-foreground">{label}</span>
                            <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", def?.kind === "SYSTEM" ? "bg-muted text-muted-foreground" : "bg-info-soft text-info")}>
                                {def?.kind === "SYSTEM" ? "System" : def ? "Content" : "Unknown"}
                            </span>
                            {block.hidden && <span className="rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium text-warning">Hidden</span>}
                            {pinned && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Always last</span>}
                            {flagged && <AlertCircle className="size-3.5 text-danger" aria-label="Needs attention" />}
                        </span>
                        {(summary || audience) && (
                            <span className="block truncate text-xs text-muted-foreground">
                                {summary}
                                {summary && audience ? " · " : ""}
                                {audience}
                            </span>
                        )}
                    </span>
                </button>
                {!readOnly && (
                    <div className="flex shrink-0 items-center gap-0.5">
                        <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5" disabled={pinned || index === 0} onClick={() => onNudge(-1)} aria-label={`Move ${label} up`}>
                            <ArrowUp className="size-3.5" />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5" disabled={pinned || index === count - 1} onClick={() => onNudge(1)} aria-label={`Move ${label} down`}>
                            <ArrowDown className="size-3.5" />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5" disabled={pinned} onClick={onHide} aria-label={block.hidden ? `Show ${label}` : `Hide ${label}`} title={block.hidden ? "Show" : "Hide"}>
                            {block.hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5" disabled={def?.kind === "SYSTEM"} onClick={onDuplicate} aria-label={`Duplicate ${label}`} title="Duplicate">
                            <Copy className="size-3.5" />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5 text-danger hover:text-danger" disabled={pinned} onClick={onRemove} aria-label={`Remove ${label}`} title="Remove">
                            <Trash2 className="size-3.5" />
                        </Button>
                    </div>
                )}
            </div>
            {serverIssues.length > 0 && (
                <ul className="mx-3 mb-2 space-y-0.5 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
                    {serverIssues.map((issue, at) => (
                        <li key={at}>
                            {issue.path && issue.path !== "(block)" ? <span className="font-mono">{issue.path}: </span> : null}
                            {issue.message}
                        </li>
                    ))}
                </ul>
            )}
            {open && <div className="border-t px-4 py-4">{children}</div>}
        </li>
    );
}
