"use client";

import * as React from "react";
import { SlidersHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
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
import { SectionCard } from "@/components/adx/section-card";
import { DataTable } from "@/components/adx/data-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { EmptyState } from "@/components/adx/empty-state";
import { pricingService } from "@/services/pricing";
import { ApiError } from "@/lib/api-client";
import { runBulk } from "@/lib/run-bulk";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { FACTOR_MODE_META, type MediaType, type PricingFactor, type PricingFactorKind, type PricingFactorMode } from "@/types/pricing-engine";

interface Props {
    mediaTypes: MediaType[];
    factors: PricingFactor[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    onChanged: () => void;
}

/**
 * Factors, which are per media type and which the engine only ever *proposes*.
 *
 * Nothing here multiplies a price on its own. The engine marks the ones whose
 * conditions a listing meets; a person decides which are applied. That is why
 * "suggested" and "applied" are different facts in the model rather than one
 * state — a suggestion the engine made and a decision someone took need to stay
 * distinguishable on every price ADX sets.
 *
 * Size is deliberately absent and cannot be added: it is already counted once
 * in the size class the comparables were matched on, so a multiplier keyed on
 * it would compound size onto a base that already reflects it.
 */
export function FactorsView({ mediaTypes, factors, selectedId, onSelect, onChanged }: Props) {
    const selected = mediaTypes.find((type) => type.id === selectedId) ?? null;
    const [deleting, setDeleting] = React.useState<PricingFactor | null>(null);
    const [editing, setEditing] = React.useState<PricingFactor | null>(null);
    const [busy, setBusy] = React.useState(false);

    async function toggleFactor(factor: PricingFactor) {
        try {
            await pricingService.updateFactor(factor.id, { isActive: !factor.isActive });
            toast.success(factor.isActive ? `Retired ${factor.name}` : `${factor.name} is back`);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not change that factor");
        }
    }

    /**
     * Deleting is refused server-side once a factor has priced anything.
     *
     * That is the right call rather than a nuisance: an applied factor is part of
     * the record of how a price was reached, and removing it would take the
     * decision with it. The error says so, and retiring is the way out.
     */
    async function confirmDelete() {
        if (!deleting) return;
        setBusy(true);
        try {
            await pricingService.deleteFactor(deleting.id);
            toast.success(`Deleted ${deleting.name}`);
            setDeleting(null);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not delete that factor");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-6">
            <SectionCard
                title="Media type"
                description="Factors belong to one media type. A gantry and a bus panel do not share a neighbourhood premium."
            >
                <Combobox
                    items={mediaTypes.map((type) => ({
                        label: type.name,
                        value: type.id,
                        description: type.formatGroup ?? undefined,
                        group: type.category,
                    }))}
                    value={selectedId ?? ""}
                    onValueChange={(next) => next && onSelect(next)}
                    placeholder="Choose a spot type"
                    searchPlaceholder="Search thirteen hundred spot types…"
                />
            </SectionCard>

            {selected && (
                <>
                    {/* The task first: this page exists to add and tune factors,
                        and the existing list is what you check the new one against. */}
                    <NewFactor mediaTypeId={selected.id} onCreated={onChanged} />

                    <SectionCard
                        title={`Factors for ${selected.name}`}
                        description="Multipliers scale the base; base adjustments move it before any scaling."
                    >
                        {factors.length === 0 ? (
                            <EmptyState
                                icon={SlidersHorizontal}
                                title="No factors yet"
                                description="Until market research settles real values, this media type prices straight off its comparables."
                            />
                        ) : (
                            <DataTable
                                data={factors}
                                searchPlaceholder="Search factors..."
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
                                                        pricingService.updateFactor(row.id, {
                                                            isActive: false,
                                                        }),
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
                                                        pricingService.updateFactor(row.id, {
                                                            isActive: true,
                                                        }),
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
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="text-danger"
                                            onClick={() =>
                                                runBulk(
                                                    rows,
                                                    (row) => pricingService.deleteFactor(row.id),
                                                    "Deleted",
                                                    () => {
                                                        clear();
                                                        onChanged();
                                                    }
                                                )
                                            }
                                        >
                                            Delete selected
                                        </Button>
                                    </>
                                )}
                                columns={[
                                    {
                                        accessorKey: "name",
                                        header: "Factor",
                                        cell: ({ row }) => (
                                            <div className="min-w-0">
                                                <p className="truncate font-medium text-foreground">
                                                    {row.original.name}
                                                </p>
                                                {row.original.description && (
                                                    <p className="truncate text-xs text-muted-foreground">
                                                        {row.original.description}
                                                    </p>
                                                )}
                                            </div>
                                        ),
                                    },
                                    {
                                        accessorKey: "kind",
                                        header: "Kind",
                                        cell: ({ row }) => (
                                            <StatusBadge
                                                status={
                                                    row.original.kind === "MULTIPLIER"
                                                        ? { label: "Multiplier", tone: "info" }
                                                        : { label: "Base adjust", tone: "neutral" }
                                                }
                                            />
                                        ),
                                    },
                                    {
                                        id: "value",
                                        header: "Value",
                                        accessorFn: (factor) =>
                                            factor.kind === "MULTIPLIER"
                                                ? "x" + factor.multiplier
                                                : "Rs " + factor.baseAdjust,
                                    },
                                    {
                                        id: "mode",
                                        header: "Mode",
                                        accessorFn: (factor) => factor.mode,
                                        cell: ({ row }) => (
                                            <span className="inline-flex flex-wrap items-center gap-1.5">
                                                <StatusBadge status={FACTOR_MODE_META[row.original.mode]} />
                                                {row.original.mode === "BINDING" && row.original.bindingDuringSurgeOnly && (
                                                    <span className="text-xs text-muted-foreground">surge only</span>
                                                )}
                                            </span>
                                        ),
                                    },
                                    {
                                        id: "auto",
                                        header: "Proposed when",
                                        accessorFn: (factor) =>
                                            factor.suggestWhen
                                                ? "conditions match"
                                                : "never - applied by hand",
                                    },
                                    {
                                        id: "actions",
                                        header: "",
                                        cell: ({ row }) => (
                                            <div className="flex items-center justify-end gap-1">
                                                {!row.original.isActive && (
                                                    <StatusBadge
                                                        status={{ label: "Retired", tone: "neutral" }}
                                                    />
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
                                                    onClick={() => toggleFactor(row.original)}
                                                >
                                                    {row.original.isActive ? "Retire" : "Restore"}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="text-danger"
                                                    onClick={() => setDeleting(row.original)}
                                                >
                                                    <Trash2 className="size-3.5" aria-hidden />
                                                    <span className="sr-only">Delete</span>
                                                </Button>
                                            </div>
                                        ),
                                    },
                                ]}
                            />
                        )}
                    </SectionCard>
                </>
            )}

            {editing && (
                <EditFactor
                    key={editing.id}
                    factor={editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
                        onChanged();
                    }}
                />
            )}

            <ConfirmDialog
                open={deleting !== null}
                onOpenChange={(open) => {
                    if (!open) setDeleting(null);
                }}
                title={deleting ? `Delete "${deleting.name}"?` : "Delete factor"}
                description="This removes it outright. If it has already been applied to a listing, the server will refuse and you should retire it instead — deleting would erase how those prices were reached."
                confirmLabel="Delete"
                destructive
                busy={busy}
                onConfirm={confirmDelete}
            />
        </div>
    );
}

/**
 * What counts as a usable value, by kind.
 *
 * A multiplier below 1 is a discount and legitimate; zero or below inverts a
 * price and is not. A base adjustment is a rupee amount that may be *negative* —
 * "this stretch of road is worth two hundred less a day" is an ordinary thing to
 * say, and the form used to reject it because it validated both kinds as
 * positive. The server never did.
 */
export function validValue(kind: PricingFactorKind, raw: string): boolean {
    const value = Number(raw);
    if (raw.trim() === "" || Number.isNaN(value)) return false;
    return kind === "MULTIPLIER" ? value > 0 : value !== 0;
}

/**
 * Correcting a factor after it exists.
 *
 * There was no way to. A mistyped multiplier could be retired and replaced, but
 * not fixed — and a retired factor stays on every listing it has already priced,
 * so "retire and re-add" leaves two factors where the history says one.
 *
 * The kind is fixed here on purpose: a multiplier and a base adjustment are read
 * from different columns, and switching one to the other would silently reinterpret
 * a number somebody entered against the other meaning.
 */
function EditFactor({
    factor,
    onClose,
    onSaved,
}: {
    factor: PricingFactor;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [name, setName] = React.useState(factor.name);
    const [description, setDescription] = React.useState(factor.description ?? "");
    // Only one of the two columns is populated for a given kind; the other is
    // null by design, and reading it into the field would render "null".
    const [value, setValue] = React.useState(
        (factor.kind === "MULTIPLIER" ? factor.multiplier : factor.baseAdjust) ?? ""
    );
    const [mode, setMode] = React.useState<PricingFactorMode>(factor.mode ?? "ADVISORY");
    const [surgeOnly, setSurgeOnly] = React.useState(factor.bindingDuringSurgeOnly ?? false);
    const [busy, setBusy] = React.useState(false);

    const multiplier = factor.kind === "MULTIPLIER";

    async function save() {
        setBusy(true);
        try {
            await pricingService.updateFactor(factor.id, {
                name: name.trim(),
                description: description.trim() || null,
                ...(multiplier ? { multiplier: value } : { baseAdjust: value }),
                mode,
                bindingDuringSurgeOnly: mode === "BINDING" && surgeOnly,
            });
            toast.success(`Saved ${name.trim()}`);
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not save that factor");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Edit factor</DialogTitle>
                    <DialogDescription>
                        Changing the value changes what the engine proposes from now on. Listings
                        already priced with this factor keep the figure they were priced at — the
                        record of how a price was reached is not rewritten behind it.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="factor-edit-name">Name</Label>
                        <Input
                            id="factor-edit-name"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="factor-edit-value">
                            {multiplier ? "Multiplier" : "Base adjustment (Rs)"}
                        </Label>
                        <Input
                            id="factor-edit-value"
                            inputMode="decimal"
                            className="tabular-nums"
                            value={value}
                            onChange={(event) => setValue(event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            {multiplier
                                ? "Below 1 is a discount. Zero or below would invert the price and is refused."
                                : "May be negative — a spot worth less than its comparables is an ordinary thing to say."}
                        </p>
                    </div>
                    <ModeField
                        idPrefix="factor-edit"
                        mode={mode}
                        surgeOnly={surgeOnly}
                        onMode={setMode}
                        onSurgeOnly={setSurgeOnly}
                    />
                    <div className="space-y-2">
                        <Label htmlFor="factor-edit-description">Description</Label>
                        <Textarea
                            id="factor-edit-description"
                            rows={2}
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            placeholder="What this is for, and where the number came from."
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose} disabled={busy}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => void save()}
                        disabled={busy || name.trim().length < 2 || !validValue(factor.kind, value)}
                    >
                        {busy ? "Saving…" : "Save"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function NewFactor({ mediaTypeId, onCreated }: { mediaTypeId: string; onCreated: () => void }) {
    const [name, setName] = React.useState("");
    const [kind, setKind] = React.useState<PricingFactorKind>("MULTIPLIER");
    const [value, setValue] = React.useState("");
    const [mode, setMode] = React.useState<PricingFactorMode>("ADVISORY");
    const [surgeOnly, setSurgeOnly] = React.useState(false);
    const [busy, setBusy] = React.useState(false);

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBusy(true);
        try {
            await pricingService.createFactor({
                name: name.trim(),
                kind,
                mediaTypeId,
                ...(kind === "MULTIPLIER" ? { multiplier: value } : { baseAdjust: value }),
                mode,
                bindingDuringSurgeOnly: mode === "BINDING" && surgeOnly,
            });
            toast.success(`Added ${name.trim()}`);
            setName("");
            setValue("");
            setMode("ADVISORY");
            setSurgeOnly(false);
            onCreated();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not add that factor");
        } finally {
            setBusy(false);
        }
    }

    const valid = name.trim().length >= 2 && validValue(kind, value);

    return (
        <SectionCard
            title="Add a factor"
            description="A multiplier below 1 is a discount and perfectly legitimate. Zero or below is not — it would invert a price."
        >
            <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
                <div className="min-w-[16rem] flex-1 space-y-2">
                    <Label htmlFor="factor-name">Name</Label>
                    <Input
                        id="factor-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Premium commercial locality"
                    />
                </div>
                <div className="w-44 space-y-2">
                    <Label htmlFor="factor-kind">Kind</Label>
                    <Select
                        value={kind}
                        onValueChange={(next) => setKind(next as PricingFactorKind)}
                    >
                        <SelectTrigger id="factor-kind">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="MULTIPLIER">Multiplier</SelectItem>
                            <SelectItem value="BASE_ADJUST">Base adjustment</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="w-36 space-y-2">
                    <Label htmlFor="factor-value">
                        {kind === "MULTIPLIER" ? "Multiplier" : "Rupees per day"}
                    </Label>
                    <Input
                        id="factor-value"
                        inputMode="decimal"
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                        placeholder={kind === "MULTIPLIER" ? "1.15" : "250.00"}
                        className="tabular-nums"
                    />
                </div>
                <Button type="submit" disabled={busy || !valid}>
                    Add
                </Button>
                <div className="basis-full">
                    <ModeField idPrefix="factor-new" mode={mode} surgeOnly={surgeOnly} onMode={setMode} onSurgeOnly={setSurgeOnly} />
                </div>
            </form>
        </SectionCard>
    );
}

/**
 * Lot E (Q59/Q125): what applying the factor to a listing does.
 *
 * Advisory is the default and what every factor was before the lot: a
 * proposal the publisher reads and takes or not. Binding reprices the
 * listing the moment a person applies it, within the engine's cap, so the
 * choice is drawn as a select with the consequence under it rather than a
 * switch that looks like a preference.
 */
function ModeField({
    idPrefix,
    mode,
    surgeOnly,
    onMode,
    onSurgeOnly,
}: {
    idPrefix: string;
    mode: PricingFactorMode;
    surgeOnly: boolean;
    onMode: (mode: PricingFactorMode) => void;
    onSurgeOnly: (value: boolean) => void;
}) {
    return (
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
            <div className="space-y-2">
                <Label htmlFor={`${idPrefix}-mode`}>Mode</Label>
                <Select value={mode} onValueChange={(next) => onMode(next as PricingFactorMode)}>
                    <SelectTrigger id={`${idPrefix}-mode`}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ADVISORY">Advisory</SelectItem>
                        <SelectItem value="BINDING">Binding</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <p className="text-xs leading-relaxed text-muted-foreground sm:pt-7">
                    {mode === "ADVISORY"
                        ? "Applying it changes the suggested rate the publisher is offered. Their listing's rate does not move."
                        : "Applying it reprices the listing there and then, within the engine's binding change cap; above the cap a price case is raised instead."}
                </p>
                {mode === "BINDING" && (
                    <label className="flex items-center gap-2 text-sm text-foreground">
                        <Checkbox
                            id={`${idPrefix}-surge`}
                            checked={surgeOnly}
                            onCheckedChange={(checked) => onSurgeOnly(checked === true)}
                        />
                        Binding only during surge — advisory the rest of the time
                    </label>
                )}
            </div>
        </div>
    );
}
