"use client";

import * as React from "react";
import { GitMerge, Plus, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { DataTable } from "@/components/adx/data-table";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api-client";
import { runBulk } from "@/lib/run-bulk";
import { pricingService } from "@/services/pricing";
import {
    ENGINE_CATEGORIES,
    type EngineCategory,
    type Material,
    type MediaType,
    type MediaTypeMatchLogRow,
    type SizeClass,
    type VenueType,
} from "@/types/pricing-engine";

interface Props {
    mediaTypes: MediaType[];
    sizeClasses: SizeClass[];
    materials: Material[];
    venues: VenueType[];
    matchLog: MediaTypeMatchLogRow[];
    onChanged: () => void;
}

const originMeta = {
    SEEDED: { label: "Seeded", tone: "neutral" as const },
    OPS: { label: "Ops", tone: "info" as const },
    AUTO_MATCHED: { label: "Auto-created", tone: "warning" as const },
};

/**
 * The three controlled vocabularies the comparable match key is built from.
 *
 * One screen because they are one job: a spot is a media type, of a size class,
 * made of a material, and a listing missing any of them enters no comparable
 * pool at all. Splitting them across three pages would hide that they have to
 * be maintained together.
 *
 * On every tab the *add* form comes first. These pages exist to be worked in;
 * the existing rows are reference, and reference reads below the task.
 */
export function VocabularyView({
    mediaTypes,
    sizeClasses,
    materials,
    venues,
    matchLog,
    onChanged,
}: Props) {
    const active = mediaTypes.filter((type) => type.status === "ACTIVE");
    const created = matchLog.filter((row) => row.outcome === "CREATED").length;
    const fragmenting = matchLog.length >= 10 && created / matchLog.length > 0.4;

    return (
        <div className="space-y-6">
            {fragmenting && (
                <Card className="rounded-lg border-warning/40 bg-warning-soft p-4 shadow-none">
                    <div className="flex items-start gap-3">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                        <div>
                            <p className="text-sm font-medium text-foreground">
                                The taxonomy may be fragmenting
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {created} of the last {matchLog.length} classifications created a
                                new media type rather than matching one. Near-duplicates split the
                                comparable pool, and the only symptom is the indicator appearing
                                less often.
                            </p>
                        </div>
                    </div>
                </Card>
            )}

            <Tabs defaultValue="media-types">
                <TabsList>
                    <TabsTrigger value="media-types">Media types ({active.length})</TabsTrigger>
                    <TabsTrigger value="size-classes">
                        Size classes ({sizeClasses.filter((s) => s.isActive).length})
                    </TabsTrigger>
                    <TabsTrigger value="materials">
                        Materials ({materials.filter((m) => m.isActive).length})
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="media-types" className="mt-5 space-y-6">
                    <NewMediaType
                        sizeClasses={sizeClasses.filter((size) => size.isActive)}
                        materials={materials.filter((material) => material.isActive)}
                        onCreated={onChanged}
                    />
                    <MediaTypeTable
                        types={active}
                        sizeClasses={sizeClasses}
                        materials={materials}
                        venues={venues}
                        onChanged={onChanged}
                    />
                    <MatchLog rows={matchLog} />
                </TabsContent>

                <TabsContent value="size-classes" className="mt-5 space-y-6">
                    <NewSizeClass onCreated={onChanged} />
                    <SizeClassTable classes={sizeClasses} onChanged={onChanged} />
                </TabsContent>

                <TabsContent value="materials" className="mt-5 space-y-6">
                    <NewMaterial onCreated={onChanged} />
                    <MaterialTable materials={materials} onChanged={onChanged} />
                </TabsContent>
            </Tabs>
        </div>
    );
}

/* ── Media types ────────────────────────────────────────────────────── */

/**
 * A checkbox grid rather than a multi-select.
 *
 * These lists run to dozens of entries and the question being asked is "which of
 * these apply", which a grid answers at a glance. A combobox would hide the
 * unticked ones, and the unticked ones are exactly what somebody defining a new
 * media type is scanning for.
 */
function PickList<T extends { id: string; name: string; isActive?: boolean }>({
    label,
    hint,
    items,
    selected,
    onToggle,
}: {
    label: string;
    hint: string;
    items: T[];
    selected: Set<string>;
    onToggle: (id: string) => void;
}) {
    return (
        <div className="space-y-2">
            <Label>{label}</Label>
            <p className="text-xs text-muted-foreground">{hint}</p>
            {items.length === 0 ? (
                <p className="text-xs text-warning">
                    None defined yet — add some on the other tabs first.
                </p>
            ) : (
                <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto rounded-lg border border-border p-3">
                    {items.map((item) => {
                        const on = selected.has(item.id);
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => onToggle(item.id)}
                                aria-pressed={on}
                                className={cn(
                                    "rounded-full border px-3 py-1 text-xs transition-colors",
                                    on
                                        ? "border-primary bg-primary/10 font-medium text-foreground"
                                        : "border-border text-muted-foreground hover:bg-muted"
                                )}
                            >
                                {item.name}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function NewMediaType({
    sizeClasses,
    materials,
    onCreated,
}: {
    sizeClasses: SizeClass[];
    materials: Material[];
    onCreated: () => void;
}) {
    const [name, setName] = React.useState("");
    const [category, setCategory] = React.useState<EngineCategory>("OUTDOOR");
    const [description, setDescription] = React.useState("");
    const [sizes, setSizes] = React.useState<Set<string>>(new Set());
    const [mats, setMats] = React.useState<Set<string>>(new Set());
    const [busy, setBusy] = React.useState(false);

    const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (id: string) =>
        setter((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBusy(true);
        try {
            await pricingService.createMediaType({
                name: name.trim(),
                category,
                description: description.trim() || null,
                sizeClassIds: [...sizes],
                materialIds: [...mats],
            });
            toast.success(`Added ${name.trim()}`);
            setName("");
            setDescription("");
            setSizes(new Set());
            setMats(new Set());
            onCreated();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not add that media type");
        } finally {
            setBusy(false);
        }
    }

    return (
        <SectionCard
            title="Add a media type"
            description="A media type is what a spot is, the sizes it comes in and what it is made of — not just its category."
        >
            <form onSubmit={submit} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                    <div className="space-y-2">
                        <Label htmlFor="mt-name">Name</Label>
                        <Input
                            id="mt-name"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="Foot Overbridge Panel"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="mt-category">Category</Label>
                        <Select
                            value={category}
                            onValueChange={(value) => setCategory(value as EngineCategory)}
                        >
                            <SelectTrigger id="mt-category">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {ENGINE_CATEGORIES.map((option) => (
                                    <SelectItem key={option} value={option}>
                                        {option}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            A hard gate on matching — a transit panel never matches a mall panel.
                        </p>
                    </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                    <PickList
                        label="Sizes it comes in"
                        hint="Comparables match on size exactly. Leaving this empty allows every size."
                        items={sizeClasses}
                        selected={sizes}
                        onToggle={toggle(setSizes)}
                    />
                    <PickList
                        label="Materials it is built from"
                        hint="Not part of the match key — it feeds similarity and narrows the listing form."
                        items={materials}
                        selected={mats}
                        onToggle={toggle(setMats)}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="mt-description">Description (optional)</Label>
                    <Textarea
                        id="mt-description"
                        rows={2}
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder="What distinguishes this from the nearest existing type."
                    />
                </div>

                <Button type="submit" disabled={busy || name.trim().length < 2}>
                    <Plus className="mr-1.5 size-3.5" aria-hidden />
                    {busy ? "Adding…" : "Add media type"}
                </Button>
            </form>
        </SectionCard>
    );
}

function MediaTypeTable({
    types,
    sizeClasses,
    materials,
    venues,
    onChanged,
}: {
    types: MediaType[];
    sizeClasses: SizeClass[];
    materials: Material[];
    venues: VenueType[];
    onChanged: () => void;
}) {
    const venueNames = React.useMemo(
        () => new Map(venues.map((venue) => [venue.id, venue.name])),
        [venues]
    );
    /** Every heading already in use, so filing under one is picking, not typing. */
    const groups = React.useMemo(
        () =>
            [...new Set(types.map((type) => type.formatGroup).filter((g): g is string => !!g))].sort(),
        [types]
    );
    const [mergeSource, setMergeSource] = React.useState<MediaType | null>(null);
    const [mergeTarget, setMergeTarget] = React.useState("");
    const [editing, setEditing] = React.useState<MediaType | null>(null);
    /** The record itself — name, venue, catalogue group — rather than its sizes. */
    const [renaming, setRenaming] = React.useState<MediaType | null>(null);
    /**
     * Filing a selection under one venue or one catalogue group at a time.
     *
     * The catalogue arrived from a document, and the parts of it that were wrong
     * were wrong in runs: a whole heading mis-read, a venue's formats landing
     * without their venue. Fixing those one dialog at a time is how a taxonomy
     * stays broken.
     */
    const [bulkFiling, setBulkFiling] = React.useState<
        { rows: MediaType[]; field: "venue" | "group"; clear: () => void } | null
    >(null);
    const [bulkValue, setBulkValue] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    /**
     * Merging several types into one at once.
     *
     * The most useful bulk action in the engine, because fragmentation arrives
     * in clusters: a threshold that mints "Unipole Hoarding", "Unipole Hoardings"
     * and "Unipole Hoarding Backlit" produces three near-duplicates that all
     * belong to one pool, and merging them one at a time is three dialogs to fix
     * one mistake.
     */
    const [bulkMerge, setBulkMerge] = React.useState<MediaType[] | null>(null);
    const [bulkTarget, setBulkTarget] = React.useState("");
    const [clearSelection, setClearSelection] = React.useState<(() => void) | null>(null);

    // Only types in the one category the selection shares. Merging across
    // categories is refused server-side, and offering it here would be an
    // invitation to an error.
    const bulkCategories = new Set((bulkMerge ?? []).map((type) => type.category));
    const bulkCandidates =
        bulkMerge && bulkCategories.size === 1
            ? types.filter(
                  (type) =>
                      type.category === bulkMerge[0]!.category &&
                      !bulkMerge.some((source) => source.id === type.id)
              )
            : [];

    async function runBulkFiling() {
        if (!bulkFiling) return;
        setBusy(true);
        try {
            const patch =
                bulkFiling.field === "venue"
                    ? { venueTypeId: bulkValue === "__none__" || bulkValue === "" ? null : bulkValue }
                    : { formatGroup: bulkValue.trim() || null };
            await runBulk(
                bulkFiling.rows,
                (type) => pricingService.updateMediaType(type.id, patch),
                "Re-filed",
                () => {
                    bulkFiling.clear();
                    setBulkFiling(null);
                    setBulkValue("");
                    onChanged();
                }
            );
        } finally {
            setBusy(false);
        }
    }

    async function runBulkMerge() {
        if (!bulkMerge || !bulkTarget) return;
        setBusy(true);
        try {
            await runBulk(
                bulkMerge,
                (type) => pricingService.mergeMediaTypes(type.id, bulkTarget),
                "Merged",
                () => {
                    clearSelection?.();
                    setBulkMerge(null);
                    setBulkTarget("");
                    onChanged();
                }
            );
        } finally {
            setBusy(false);
        }
    }

    const candidates = mergeSource
        ? types.filter((t) => t.id !== mergeSource.id && t.category === mergeSource.category)
        : [];

    async function runMerge() {
        if (!mergeSource || !mergeTarget) return;
        setBusy(true);
        try {
            await pricingService.mergeMediaTypes(mergeSource.id, mergeTarget);
            toast.success(`Merged ${mergeSource.name} away`, {
                description: "Its listings and market data now point at the type you chose.",
            });
            setMergeSource(null);
            setMergeTarget("");
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not merge those");
        } finally {
            setBusy(false);
        }
    }

    return (
        <SectionCard title="Media types" description={`${types.length} active`}>
            <DataTable
                data={types}
                searchPlaceholder="Search media types…"
                initialPageSize={15}
                bulkActions={(rows, clear) => (
                    <>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                                setBulkMerge(rows);
                                setBulkTarget("");
                                // Kept so the dialog can clear the selection only
                                // once the merge has actually gone through.
                                setClearSelection(() => clear);
                            }}
                        >
                            <GitMerge className="mr-1.5 size-3.5" aria-hidden />
                            Merge selected into…
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                                setBulkFiling({ rows, field: "venue", clear });
                                setBulkValue("");
                            }}
                        >
                            Set venue…
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                                setBulkFiling({ rows, field: "group", clear });
                                setBulkValue("");
                            }}
                        >
                            Set catalogue group…
                        </Button>
                    </>
                )}
                columns={[
                    {
                        accessorKey: "name",
                        header: "Name",
                        cell: ({ row }) => (
                            <div className="min-w-0">
                                <p className="truncate font-medium text-foreground">
                                    {row.original.name}
                                </p>
                                <p className="font-mono text-xs text-muted-foreground">
                                    {row.original.slug}
                                </p>
                            </div>
                        ),
                    },
                    { accessorKey: "category", header: "Category" },
                    {
                        id: "venue",
                        header: "Venue",
                        // Named rather than shown as an id: venue is the coarsest
                        // cut of the match key, and a screen that only says
                        // "has one" cannot show two types split across venues
                        // that mean the same market.
                        accessorFn: (type) =>
                            type.venueTypeId
                                ? (venueNames.get(type.venueTypeId) ?? "Unknown venue")
                                : "None",
                    },
                    {
                        id: "group",
                        header: "Catalogue group",
                        accessorFn: (type) => type.formatGroup ?? "—",
                    },
                    {
                        accessorKey: "origin",
                        header: "Origin",
                        cell: ({ row }) => <StatusBadge status={originMeta[row.original.origin]} />,
                    },
                    {
                        id: "sizes",
                        header: "Sizes",
                        accessorFn: (type) =>
                            type.sizeClassIds.length === 0
                                ? "Any"
                                : `${type.sizeClassIds.length} defined`,
                    },
                    {
                        id: "materials",
                        header: "Materials",
                        accessorFn: (type) =>
                            type.materialIds.length === 0
                                ? "Any"
                                : `${type.materialIds.length} defined`,
                    },
                    {
                        id: "actions",
                        header: "",
                        cell: ({ row }) => (
                            <div className="flex items-center justify-end gap-1">
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setRenaming(row.original)}
                                >
                                    Edit
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setEditing(row.original)}
                                >
                                    Sizes & materials
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                        setMergeSource(row.original);
                                        setMergeTarget("");
                                    }}
                                >
                                    <GitMerge className="mr-1.5 size-3.5" aria-hidden />
                                    Merge away
                                </Button>
                            </div>
                        ),
                    },
                ]}
            />

            <ConfirmDialog
                open={mergeSource !== null}
                onOpenChange={(open) => {
                    if (!open) setMergeSource(null);
                }}
                title={mergeSource ? `Merge "${mergeSource.name}" into another type` : "Merge"}
                description="Its listings and market data are re-pointed, and it stays as a tombstone so existing references still resolve."
                confirmLabel="Merge"
                busy={busy}
                disabled={!mergeTarget}
                onConfirm={runMerge}
            >
                <div className="space-y-2">
                    <Label htmlFor="merge-target">Merge into</Label>
                    <Combobox
                        id="merge-target"
                        items={candidates.map((type) => ({
                            label: type.name,
                            value: type.id,
                            description: venueNames.get(type.venueTypeId ?? "") ?? undefined,
                            group: type.formatGroup ?? undefined,
                        }))}
                        value={mergeTarget}
                        onValueChange={setMergeTarget}
                        placeholder="Choose the type to keep"
                        searchPlaceholder="Search the type to keep…"
                    />
                    <p className="text-xs text-muted-foreground">
                        Only {mergeSource?.category} types are offered — merging across categories
                        would mix comparable sets.
                    </p>
                </div>
            </ConfirmDialog>

            <ConfirmDialog
                open={bulkMerge !== null}
                onOpenChange={(open) => {
                    if (!open) setBulkMerge(null);
                }}
                title={
                    bulkMerge
                        ? `Merge ${bulkMerge.length} media type${bulkMerge.length === 1 ? "" : "s"} away`
                        : "Merge"
                }
                description="Their listings and market data are re-pointed to the type you choose, and each stays as a tombstone so existing references still resolve."
                confirmLabel="Merge them"
                busy={busy}
                disabled={!bulkTarget || bulkCategories.size !== 1}
                onConfirm={runBulkMerge}
            >
                {bulkCategories.size > 1 ? (
                    <p className="text-sm text-danger">
                        The selection spans {bulkCategories.size} categories. Merging across
                        categories would mix comparable sets, so select within one category.
                    </p>
                ) : (
                    <div className="space-y-2">
                        <Label htmlFor="bulk-merge-target">Merge them all into</Label>
                        <Combobox
                            id="bulk-merge-target"
                            items={bulkCandidates.map((type) => ({
                                label: type.name,
                                value: type.id,
                                description: venueNames.get(type.venueTypeId ?? "") ?? undefined,
                                group: type.formatGroup ?? undefined,
                            }))}
                            value={bulkTarget}
                            onValueChange={setBulkTarget}
                            placeholder="Choose the type to keep"
                            searchPlaceholder="Search the type to keep…"
                        />
                        <p className="text-xs text-muted-foreground">
                            {bulkMerge?.map((type) => type.name).join(", ")}
                        </p>
                    </div>
                )}
            </ConfirmDialog>

            {renaming && (
                <EditMediaType
                    key={renaming.id}
                    mediaType={renaming}
                    venues={venues}
                    groups={groups}
                    onClose={() => setRenaming(null)}
                    onSaved={() => {
                        setRenaming(null);
                        onChanged();
                    }}
                />
            )}

            <ConfirmDialog
                open={bulkFiling !== null}
                onOpenChange={(open) => {
                    if (!open) setBulkFiling(null);
                }}
                title={
                    bulkFiling
                        ? `Re-file ${bulkFiling.rows.length} spot ${bulkFiling.rows.length === 1 ? "type" : "types"}`
                        : "Re-file"
                }
                description={
                    bulkFiling?.field === "venue"
                        ? "Moving a spot type to a different venue moves every listing on it into a different comparable pool. Their prices stop being compared against the spots they are compared against today."
                        : "The catalogue group is presentation only — it decides which heading a type appears under and nothing else."
                }
                confirmLabel="Re-file"
                busy={busy}
                disabled={bulkFiling?.field === "venue" ? false : bulkValue.trim() === ""}
                onConfirm={runBulkFiling}
            >
                <div className="space-y-2">
                    <Label>{bulkFiling?.field === "venue" ? "Venue" : "Catalogue group"}</Label>
                    {bulkFiling?.field === "venue" ? (
                        <Combobox
                            items={[
                                { label: "No venue — roadside or vehicle exterior", value: "__none__" },
                                ...venues.map((venue) => ({
                                    label: venue.name,
                                    value: venue.id,
                                    group: venue.category,
                                })),
                            ]}
                            value={bulkValue}
                            onValueChange={setBulkValue}
                            placeholder="Choose a venue"
                        />
                    ) : (
                        <>
                            <Combobox
                                items={groups.map((group) => ({ label: group, value: group }))}
                                value={bulkValue}
                                onValueChange={setBulkValue}
                                placeholder="Choose an existing group"
                                emptyText="No groups yet — type a new one below."
                            />
                            <Input
                                value={bulkValue}
                                onChange={(event) => setBulkValue(event.target.value)}
                                placeholder="…or type a new heading"
                            />
                        </>
                    )}
                </div>
            </ConfirmDialog>

            {editing && (
                <EditAttributes
                    mediaType={editing}
                    sizeClasses={sizeClasses.filter((size) => size.isActive)}
                    materials={materials.filter((material) => material.isActive)}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
                        onChanged();
                    }}
                />
            )}
        </SectionCard>
    );
}

/**
 * Editing which sizes and materials a type comes in.
 *
 * Saves the whole set rather than a delta, so unticking a size actually removes
 * it — a merge-only write could never express "now five" from a form showing six.
 */
/**
 * The record, rather than what it is built from.
 *
 * The catalogue was seeded from a document and the document has mistakes in it —
 * a heading read as a format, a venue lost on a run of rows. Without this the
 * only repair was a merge, which is the wrong tool: merging says two types are
 * one thing, and a mis-filed type is one thing in the wrong place.
 */
function EditMediaType({
    mediaType,
    venues,
    groups,
    onClose,
    onSaved,
}: {
    mediaType: MediaType;
    venues: VenueType[];
    groups: string[];
    onClose: () => void;
    onSaved: () => void;
}) {
    const [name, setName] = React.useState(mediaType.name);
    const [description, setDescription] = React.useState(mediaType.description ?? "");
    const [category, setCategory] = React.useState<EngineCategory>(mediaType.category);
    const [venueTypeId, setVenueTypeId] = React.useState(mediaType.venueTypeId ?? "__none__");
    const [formatGroup, setFormatGroup] = React.useState(mediaType.formatGroup ?? "");
    const [busy, setBusy] = React.useState(false);

    const movingVenue = (mediaType.venueTypeId ?? "__none__") !== venueTypeId;

    async function save() {
        setBusy(true);
        try {
            await pricingService.updateMediaType(mediaType.id, {
                name: name.trim(),
                description: description.trim() || null,
                category,
                venueTypeId: venueTypeId === "__none__" ? null : venueTypeId,
                formatGroup: formatGroup.trim() || null,
            });
            toast.success(`Saved ${name.trim()}`);
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not save that type");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>Edit spot type</DialogTitle>
                    <DialogDescription>
                        The slug is fixed — a research import spells this type by its slug, and
                        renaming it would silently reject every sweep that still uses the old one.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="mt-edit-name">Name</Label>
                        <Input
                            id="mt-edit-name"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                        />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="mt-edit-venue">Venue</Label>
                            <Combobox
                                id="mt-edit-venue"
                                items={[
                                    {
                                        label: "No venue — roadside or vehicle exterior",
                                        value: "__none__",
                                    },
                                    ...venues.map((venue) => ({
                                        label: venue.name,
                                        value: venue.id,
                                        group: venue.category,
                                    })),
                                ]}
                                value={venueTypeId}
                                onValueChange={(next) => setVenueTypeId(next || "__none__")}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="mt-edit-category">Category</Label>
                            <Select
                                value={category}
                                onValueChange={(value) => setCategory(value as EngineCategory)}
                            >
                                <SelectTrigger id="mt-edit-category">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {ENGINE_CATEGORIES.map((option) => (
                                        <SelectItem key={option} value={option}>
                                            {option}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="mt-edit-group">Catalogue group</Label>
                        <Combobox
                            id="mt-edit-group"
                            items={groups.map((group) => ({ label: group, value: group }))}
                            value={formatGroup}
                            onValueChange={setFormatGroup}
                            placeholder="Choose an existing group"
                            emptyText="No groups yet — type a new one below."
                        />
                        <Input
                            value={formatGroup}
                            onChange={(event) => setFormatGroup(event.target.value)}
                            placeholder="…or type a new heading"
                        />
                        <p className="text-xs text-muted-foreground">
                            Presentation only. It decides which heading this type appears under when
                            a venue has sixty of them, and nothing in the match key reads it.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="mt-edit-description">Description</Label>
                        <Textarea
                            id="mt-edit-description"
                            rows={2}
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                        />
                    </div>

                    {movingVenue ? (
                        <p className="text-xs text-warning">
                            Moving this type to a different venue moves every listing on it into a
                            different comparable pool. Their prices stop being compared against the
                            spots they are compared against today.
                        </p>
                    ) : null}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose} disabled={busy}>
                        Cancel
                    </Button>
                    <Button onClick={() => void save()} disabled={busy || name.trim().length < 2}>
                        {busy ? "Saving…" : "Save"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function EditAttributes({
    mediaType,
    sizeClasses,
    materials,
    onClose,
    onSaved,
}: {
    mediaType: MediaType;
    sizeClasses: SizeClass[];
    materials: Material[];
    onClose: () => void;
    onSaved: () => void;
}) {
    const [sizes, setSizes] = React.useState<Set<string>>(new Set(mediaType.sizeClassIds));
    const [mats, setMats] = React.useState<Set<string>>(new Set(mediaType.materialIds));
    const [busy, setBusy] = React.useState(false);

    const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (id: string) =>
        setter((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    async function save() {
        setBusy(true);
        try {
            await pricingService.setMediaTypeAttributes(mediaType.id, {
                sizeClassIds: [...sizes],
                materialIds: [...mats],
            });
            toast.success(`Updated ${mediaType.name}`);
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not save that");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{mediaType.name}</DialogTitle>
                    <DialogDescription>
                        Which sizes it comes in and what it is built from. Leaving either empty
                        allows anything.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-5">
                    <PickList
                        label="Sizes"
                        hint="Comparables match on size exactly."
                        items={sizeClasses}
                        selected={sizes}
                        onToggle={toggle(setSizes)}
                    />
                    <PickList
                        label="Materials"
                        hint="Feeds similarity and narrows the listing form."
                        items={materials}
                        selected={mats}
                        onToggle={toggle(setMats)}
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={busy}>
                        Cancel
                    </Button>
                    <Button onClick={save} disabled={busy}>
                        {busy ? "Saving…" : "Save"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function MatchLog({ rows }: { rows: MediaTypeMatchLogRow[] }) {
    return (
        <SectionCard
            title="Match log"
            description="Every classification decision. How fragmentation gets noticed before it empties a pool."
        >
            <DataTable
                data={rows}
                searchPlaceholder="Search proposals…"
                initialPageSize={10}
                emptyState={
                    <p className="py-10 text-center text-sm text-muted-foreground">
                        Nothing classified yet. Decisions appear here as listings arrive with a
                        media type named in words.
                    </p>
                }
                columns={[
                    { accessorKey: "proposedName", header: "Proposed" },
                    {
                        accessorKey: "outcome",
                        header: "Outcome",
                        cell: ({ row }) => (
                            <StatusBadge
                                status={
                                    row.original.outcome === "MATCHED"
                                        ? { label: "Matched", tone: "success" }
                                        : { label: "Created", tone: "warning" }
                                }
                            />
                        ),
                    },
                    {
                        accessorKey: "similarity",
                        header: "Similarity",
                        cell: ({ row }) => (
                            <span className="tabular-nums text-muted-foreground">
                                {row.original.similarity
                                    ? Number(row.original.similarity).toFixed(2)
                                    : "—"}
                            </span>
                        ),
                    },
                    {
                        accessorKey: "createdAt",
                        header: "When",
                        cell: ({ row }) => (
                            <span className="text-xs text-muted-foreground">
                                {new Date(row.original.createdAt).toLocaleDateString("en-IN", {
                                    day: "numeric",
                                    month: "short",
                                })}
                            </span>
                        ),
                    },
                ]}
            />
        </SectionCard>
    );
}

/* ── Size classes ───────────────────────────────────────────────────── */

function NewSizeClass({ onCreated }: { onCreated: () => void }) {
    const [name, setName] = React.useState("");
    const [width, setWidth] = React.useState("");
    const [height, setHeight] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    const area = Number(width) > 0 && Number(height) > 0 ? Number(width) * Number(height) : null;

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBusy(true);
        try {
            await pricingService.createSizeClass({
                name: name.trim(),
                widthFt: width.trim() || null,
                heightFt: height.trim() || null,
            });
            toast.success(`Added ${name.trim()}`);
            setName("");
            setWidth("");
            setHeight("");
            onCreated();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not add that size class");
        } finally {
            setBusy(false);
        }
    }

    return (
        <SectionCard
            title="Add a size class"
            description="Comparables match on size exactly, so a 10-footer only ever compares to other 10-footers. Missing one means those spots have no pool."
        >
            <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
                <div className="w-40 space-y-2">
                    <Label htmlFor="sc-name">Name</Label>
                    <Input
                        id="sc-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="20 x 10"
                    />
                </div>
                <div className="w-28 space-y-2">
                    <Label htmlFor="sc-width">Width (ft)</Label>
                    <Input
                        id="sc-width"
                        inputMode="decimal"
                        value={width}
                        onChange={(event) => setWidth(event.target.value)}
                        className="tabular-nums"
                    />
                </div>
                <div className="w-28 space-y-2">
                    <Label htmlFor="sc-height">Height (ft)</Label>
                    <Input
                        id="sc-height"
                        inputMode="decimal"
                        value={height}
                        onChange={(event) => setHeight(event.target.value)}
                        className="tabular-nums"
                    />
                </div>
                <div className="w-32 space-y-2">
                    <Label>Area</Label>
                    <p className="flex h-9 items-center text-sm tabular-nums text-muted-foreground">
                        {area ? `${area} sq ft` : "—"}
                    </p>
                </div>
                <Button type="submit" disabled={busy || name.trim().length < 1}>
                    <Plus className="mr-1.5 size-3.5" aria-hidden />
                    Add
                </Button>
            </form>
            <p className="mt-3 text-xs text-muted-foreground">
                Area is worked out from the dimensions and never entered — a stored area that
                disagreed with its own width and height would be a silent pricing error.
            </p>
        </SectionCard>
    );
}

function SizeClassTable({
    classes,
    onChanged,
}: {
    classes: SizeClass[];
    onChanged: () => void;
}) {
    async function toggle(sizeClass: SizeClass) {
        try {
            await pricingService.updateSizeClass(sizeClass.id, { isActive: !sizeClass.isActive });
            toast.success(sizeClass.isActive ? `Retired ${sizeClass.name}` : `${sizeClass.name} is back`);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not change that");
        }
    }

    return (
        <SectionCard title="Size classes" description={`${classes.length} defined`}>
            <DataTable
                data={classes}
                searchPlaceholder="Search sizes…"
                initialPageSize={15}
                bulkActions={(rows, clear) => (
                    <>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                                runBulk(
                                    rows.filter((row) => row.isActive),
                                    (row) =>
                                        pricingService.updateSizeClass(row.id, { isActive: false }),
                                    "Retired",
                                    () => {
                                        clear();
                                        onChanged();
                                    }
                                )
                            }
                        >
                            Retire selected
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                                runBulk(
                                    rows.filter((row) => !row.isActive),
                                    (row) =>
                                        pricingService.updateSizeClass(row.id, { isActive: true }),
                                    "Restored",
                                    () => {
                                        clear();
                                        onChanged();
                                    }
                                )
                            }
                        >
                            Restore selected
                        </Button>
                    </>
                )}
                columns={[
                    {
                        accessorKey: "name",
                        header: "Name",
                        cell: ({ row }) => (
                            <div className="min-w-0">
                                <p className="font-medium text-foreground">{row.original.name}</p>
                                <p className="font-mono text-xs text-muted-foreground">
                                    {row.original.slug}
                                </p>
                            </div>
                        ),
                    },
                    {
                        id: "dimensions",
                        header: "Dimensions",
                        accessorFn: (row) =>
                            row.widthFt && row.heightFt ? `${row.widthFt} x ${row.heightFt}` : "—",
                    },
                    {
                        accessorKey: "areaSqFt",
                        header: "Area (sq ft)",
                        cell: ({ row }) => (
                            <span className="tabular-nums text-muted-foreground">
                                {row.original.areaSqFt ?? "—"}
                            </span>
                        ),
                    },
                    {
                        id: "state",
                        header: "",
                        cell: ({ row }) => (
                            <div className="flex items-center justify-end gap-2">
                                {!row.original.isActive && (
                                    <StatusBadge status={{ label: "Retired", tone: "neutral" }} />
                                )}
                                <Button size="sm" variant="ghost" onClick={() => toggle(row.original)}>
                                    {row.original.isActive ? "Retire" : "Restore"}
                                </Button>
                            </div>
                        ),
                    },
                ]}
            />
        </SectionCard>
    );
}

/* ── Materials ──────────────────────────────────────────────────────── */

function NewMaterial({ onCreated }: { onCreated: () => void }) {
    const [name, setName] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBusy(true);
        try {
            await pricingService.createMaterial({ name: name.trim() });
            toast.success(`Added ${name.trim()}`);
            setName("");
            onCreated();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not add that material");
        } finally {
            setBusy(false);
        }
    }

    return (
        <SectionCard
            title="Add a material"
            description="Not part of the match key — it is approximate by nature, and gating comparables on it would empty every set. It feeds media-type similarity instead."
        >
            <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
                <div className="min-w-[16rem] flex-1 space-y-2">
                    <Label htmlFor="mat-name">Name</Label>
                    <Input
                        id="mat-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Perforated vinyl"
                    />
                </div>
                <Button type="submit" disabled={busy || name.trim().length < 2}>
                    <Plus className="mr-1.5 size-3.5" aria-hidden />
                    Add
                </Button>
            </form>
        </SectionCard>
    );
}

function MaterialTable({
    materials,
    onChanged,
}: {
    materials: Material[];
    onChanged: () => void;
}) {
    async function toggle(material: Material) {
        try {
            await pricingService.updateMaterial(material.id, { isActive: !material.isActive });
            toast.success(material.isActive ? `Retired ${material.name}` : `${material.name} is back`);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not change that");
        }
    }

    return (
        <SectionCard title="Materials" description={`${materials.length} defined`}>
            <DataTable
                data={materials}
                searchPlaceholder="Search materials…"
                initialPageSize={15}
                bulkActions={(rows, clear) => (
                    <>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                                runBulk(
                                    rows.filter((row) => row.isActive),
                                    (row) =>
                                        pricingService.updateMaterial(row.id, { isActive: false }),
                                    "Retired",
                                    () => {
                                        clear();
                                        onChanged();
                                    }
                                )
                            }
                        >
                            Retire selected
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                                runBulk(
                                    rows.filter((row) => !row.isActive),
                                    (row) =>
                                        pricingService.updateMaterial(row.id, { isActive: true }),
                                    "Restored",
                                    () => {
                                        clear();
                                        onChanged();
                                    }
                                )
                            }
                        >
                            Restore selected
                        </Button>
                    </>
                )}
                columns={[
                    {
                        accessorKey: "name",
                        header: "Name",
                        cell: ({ row }) => (
                            <div className="min-w-0">
                                <p className="font-medium text-foreground">{row.original.name}</p>
                                <p className="font-mono text-xs text-muted-foreground">
                                    {row.original.slug}
                                </p>
                            </div>
                        ),
                    },
                    {
                        id: "state",
                        header: "",
                        cell: ({ row }) => (
                            <div className="flex items-center justify-end gap-2">
                                {!row.original.isActive && (
                                    <StatusBadge status={{ label: "Retired", tone: "neutral" }} />
                                )}
                                <Button size="sm" variant="ghost" onClick={() => toggle(row.original)}>
                                    {row.original.isActive ? "Retire" : "Restore"}
                                </Button>
                            </div>
                        ),
                    },
                ]}
            />
        </SectionCard>
    );
}
