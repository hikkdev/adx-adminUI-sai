"use client";

import * as React from "react";
import { Plus, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { DataTable } from "@/components/adx/data-table";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { runBulk } from "@/lib/run-bulk";
import { pricingService } from "@/services/pricing";
import {
    ENGINE_CATEGORIES,
    type EngineCategory,
    type MediaType,
    type VenueType,
} from "@/types/pricing-engine";

interface Props {
    venues: VenueType[];
    mediaTypes: MediaType[];
    onChanged: () => void;
}

/**
 * The venue level of the comparable match key.
 *
 * Everything on this page is one decision repeated: how finely the market is
 * cut. Two venues that name the same market halve the comparables for every
 * spot in it, and nothing downstream reports that — the indicator simply goes
 * quiet more often, which looks like a thin market rather than a taxonomy
 * mistake. So the counts are on screen: a venue holding no formats, or one
 * whose formats duplicate a neighbour's, is visible before it costs anything.
 */
export function VenuesView({ venues, mediaTypes, onChanged }: Props) {
    const active = venues.filter((venue) => venue.isActive);

    const formatCount = React.useMemo(() => {
        const counts = new Map<string, number>();
        for (const type of mediaTypes) {
            if (!type.venueTypeId) continue;
            counts.set(type.venueTypeId, (counts.get(type.venueTypeId) ?? 0) + 1);
        }
        return counts;
    }, [mediaTypes]);

    const empty = active.filter((venue) => (formatCount.get(venue.id) ?? 0) === 0);
    const venueless = mediaTypes.filter((type) => !type.venueTypeId).length;

    return (
        <div className="space-y-6">
            {empty.length > 0 && (
                <Card className="rounded-lg border-warning/40 bg-warning-soft p-4 shadow-none">
                    <div className="flex items-start gap-3">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                        <div>
                            <p className="text-sm font-medium text-foreground">
                                {empty.length} venue{empty.length === 1 ? " has" : "s have"} no spot
                                types
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {empty
                                    .slice(0, 4)
                                    .map((venue) => venue.name)
                                    .join(", ")}
                                {empty.length > 4 && `, and ${empty.length - 4} more`}. Nothing can
                                be listed in a venue with no formats, so these are invisible to
                                publishers.
                            </p>
                        </div>
                    </div>
                </Card>
            )}

            <NewVenue onCreated={onChanged} />

            <VenueTable
                venues={venues}
                formatCount={formatCount}
                venueless={venueless}
                onChanged={onChanged}
            />
        </div>
    );
}

/* ── Sub-venues ─────────────────────────────────────────────────────── */

/**
 * The named areas inside a venue, edited as chips.
 *
 * A publisher listing a spot is asked which part of the building it is in, and
 * this is the list that question offers. Free text there would be unusable:
 * "food court", "Food Court" and "FC" are one place spelled three ways, and no
 * report could ever group them.
 */
function SubVenueEditor({
    value,
    onChange,
    id,
}: {
    value: string[];
    onChange: (next: string[]) => void;
    id: string;
}) {
    const [draft, setDraft] = React.useState("");

    function add() {
        const name = draft.trim();
        if (!name) return;
        // Case-insensitive, because the whole point is one spelling per place.
        if (value.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
            setDraft("");
            return;
        }
        onChange([...value, name]);
        setDraft("");
    }

    return (
        <div className="space-y-2">
            <div className="flex gap-2">
                <Input
                    id={id}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                        // Enter adds a chip rather than submitting the form —
                        // typing a list and losing it to a stray submit is the
                        // obvious way to make this control annoying.
                        if (event.key === "Enter" || event.key === ",") {
                            event.preventDefault();
                            add();
                        }
                    }}
                    placeholder="Food court"
                />
                <Button type="button" variant="outline" onClick={add} disabled={!draft.trim()}>
                    Add
                </Button>
            </div>
            {value.length > 0 && (
                <div className="flex flex-wrap gap-2 rounded-lg border border-border p-3">
                    {value.map((name) => (
                        <span
                            key={name}
                            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-foreground"
                        >
                            {name}
                            <button
                                type="button"
                                aria-label={`Remove ${name}`}
                                onClick={() => onChange(value.filter((item) => item !== name))}
                                className="text-muted-foreground transition-colors hover:text-foreground"
                            >
                                <X className="size-3" aria-hidden />
                            </button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ── Add ────────────────────────────────────────────────────────────── */

function NewVenue({ onCreated }: { onCreated: () => void }) {
    const [name, setName] = React.useState("");
    const [category, setCategory] = React.useState<EngineCategory>("INDOOR");
    const [description, setDescription] = React.useState("");
    const [subVenues, setSubVenues] = React.useState<string[]>([]);
    const [busy, setBusy] = React.useState(false);

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBusy(true);
        try {
            await pricingService.createVenueType({
                name: name.trim(),
                category,
                description: description.trim() || null,
                subVenues,
            });
            toast.success(`Added ${name.trim()}`, {
                description: "Spots filed here will only be compared against other spots here.",
            });
            setName("");
            setDescription("");
            setSubVenues([]);
            onCreated();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not add that venue");
        } finally {
            setBusy(false);
        }
    }

    return (
        <SectionCard
            title="Add a venue"
            description="Add one only when spots in it genuinely price differently. A venue that duplicates an existing one splits its comparable pool in half."
        >
            <form onSubmit={submit} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                    <div className="space-y-2">
                        <Label htmlFor="venue-name">Name</Label>
                        <Input
                            id="venue-name"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="Bowling Alleys"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="venue-category">Category</Label>
                        <Select
                            value={category}
                            onValueChange={(value) => setCategory(value as EngineCategory)}
                        >
                            <SelectTrigger id="venue-category">
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
                    <Label htmlFor="venue-sub">Areas inside it</Label>
                    <p className="text-xs text-muted-foreground">
                        What a publisher picks from when asked where in the building their spot is.
                    </p>
                    <SubVenueEditor id="venue-sub" value={subVenues} onChange={setSubVenues} />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="venue-description">Note (optional)</Label>
                    <Textarea
                        id="venue-description"
                        rows={2}
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder="What distinguishes this from the nearest existing venue."
                    />
                </div>

                <Button type="submit" disabled={busy || name.trim().length < 2}>
                    <Plus className="mr-1.5 size-3.5" aria-hidden />
                    {busy ? "Adding…" : "Add venue"}
                </Button>
            </form>
        </SectionCard>
    );
}

/* ── Table ──────────────────────────────────────────────────────────── */

function VenueTable({
    venues,
    formatCount,
    venueless,
    onChanged,
}: {
    venues: VenueType[];
    formatCount: Map<string, number>;
    venueless: number;
    onChanged: () => void;
}) {
    const [editing, setEditing] = React.useState<VenueType | null>(null);

    async function toggle(venue: VenueType) {
        try {
            await pricingService.updateVenueType(venue.id, { isActive: !venue.isActive });
            toast.success(venue.isActive ? `Retired ${venue.name}` : `${venue.name} is back`);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not change that venue");
        }
    }

    return (
        <SectionCard
            title="Venues"
            description={
                venueless > 0
                    ? `${venues.length} defined. ${venueless} spot types sit outside every venue — correct for a roadside hoarding, wrong for anything indoors.`
                    : `${venues.length} defined`
            }
        >
            <DataTable
                data={venues}
                searchPlaceholder="Search venues…"
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
                                        pricingService.updateVenueType(row.id, { isActive: false }),
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
                                        pricingService.updateVenueType(row.id, { isActive: true }),
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
                        header: "Venue",
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
                        id: "formats",
                        header: "Spot types",
                        accessorFn: (venue) => formatCount.get(venue.id) ?? 0,
                        cell: ({ row }) => {
                            const count = formatCount.get(row.original.id) ?? 0;
                            return (
                                <span
                                    className={
                                        count === 0
                                            ? "text-warning"
                                            : "tabular-nums text-foreground"
                                    }
                                >
                                    {count === 0 ? "None" : count}
                                </span>
                            );
                        },
                    },
                    {
                        id: "areas",
                        header: "Areas inside",
                        accessorFn: (venue) =>
                            venue.subVenues.length === 0 ? "—" : venue.subVenues.length,
                    },
                    {
                        id: "state",
                        header: "",
                        cell: ({ row }) => (
                            <div className="flex items-center justify-end gap-2">
                                {row.original.isActive ? (
                                    <StatusBadge status={{ label: "Live", tone: "success" }} />
                                ) : (
                                    <StatusBadge status={{ label: "Retired", tone: "neutral" }} />
                                )}
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setEditing(row.original)}
                                >
                                    Edit
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => void toggle(row.original)}
                                >
                                    {row.original.isActive ? "Retire" : "Restore"}
                                </Button>
                            </div>
                        ),
                    },
                ]}
            />

            {/* Keyed and mounted only while open, so each dialog starts from
                its own row rather than from whatever the last one was left
                holding. Copying props into state in an effect would do the same
                job one render late, and cascade every time the row changed. */}
            {editing && (
                <EditVenue
                    key={editing.id}
                    venue={editing}
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

function EditVenue({
    venue,
    onClose,
    onSaved,
}: {
    venue: VenueType;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [name, setName] = React.useState(venue.name);
    const [category, setCategory] = React.useState<EngineCategory>(venue.category);
    const [description, setDescription] = React.useState(venue.description ?? "");
    const [subVenues, setSubVenues] = React.useState<string[]>(venue.subVenues);
    const [busy, setBusy] = React.useState(false);

    async function save() {
        setBusy(true);
        try {
            await pricingService.updateVenueType(venue.id, {
                name: name.trim(),
                category,
                description: description.trim() || null,
                subVenues,
            });
            toast.success(`Saved ${name.trim()}`);
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not save that venue");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Edit {venue.name}</DialogTitle>
                    <DialogDescription>
                        The slug is fixed: it is how a research import names this venue, and
                        renaming it would silently reject every sweep that still spells it the old
                        way. Comparables match on the venue itself, so the name and category below
                        are labels — correcting a mis-filed category moves nothing between pools.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                        <div className="space-y-2">
                            <Label htmlFor="edit-venue-name">Name</Label>
                            <Input
                                id="edit-venue-name"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-venue-category">Category</Label>
                            <Select
                                value={category}
                                onValueChange={(value) => setCategory(value as EngineCategory)}
                            >
                                <SelectTrigger id="edit-venue-category">
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
                        <Label htmlFor="edit-venue-sub">Areas inside it</Label>
                        <SubVenueEditor
                            id="edit-venue-sub"
                            value={subVenues}
                            onChange={setSubVenues}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="edit-venue-note">Note</Label>
                        <Textarea
                            id="edit-venue-note"
                            rows={2}
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                        />
                    </div>
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
