"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import {
    CATEGORY_EFFECT_META,
    SECTORS,
    priceModelService,
    type CategoryRuleEffect,
    type PricingCategoryRule,
} from "@/services/price-model";
import type { MediaType } from "@/types/pricing-engine";

interface CategoriesViewProps {
    rules: PricingCategoryRule[];
    mediaTypes: MediaType[];
    embedded?: boolean;
    onChanged: () => void;
}

/** The column every sector has: a rule with no media type applies to all of them. */
const ALL = "__all__";

function CellValue({ rule }: { rule: PricingCategoryRule | undefined }) {
    if (!rule) return <span className="tabular-nums text-muted-foreground/60">1.00×</span>;
    if (rule.effect === "BLOCKED") {
        return <StatusBadge status={{ label: "Blocked", tone: "danger" }} />;
    }
    if (rule.effect === "LEGAL_APPROVAL") {
        return <StatusBadge status={{ label: "Legal approval", tone: "warning" }} />;
    }
    const value = Number(rule.multiplier ?? 1);
    return (
        <span
            className={cn(
                "font-medium tabular-nums",
                value > 1 ? "text-foreground" : value < 1 ? "text-success" : "text-muted-foreground"
            )}
        >
            {value.toFixed(2)}×
        </span>
    );
}

/**
 * The DR 10 category matrix: advertiser sectors down the side, media types
 * across the top, a multiplier or a restriction in each cell. The rail edits
 * the selected cell's rule.
 *
 * Columns are the media types a rule names plus "All media", because the
 * catalogue has 1,377 spot types and a column for each would be a wall. A new
 * column appears the moment a rule names a new media type.
 *
 * The old fixture's "permitted cities" and "approval chain" are not drawn: no
 * table holds either, and a list nothing enforces is a promise the screen
 * cannot keep.
 */
export function CategoriesView({ rules, mediaTypes, embedded, onChanged }: CategoriesViewProps) {
    const sectors = React.useMemo(() => {
        const seen = new Map<string, string>();
        for (const sector of SECTORS) seen.set(sector.toLowerCase(), sector);
        for (const rule of rules) seen.set(rule.sector.toLowerCase(), rule.sector);
        return [...seen.values()].sort((a, b) => a.localeCompare(b));
    }, [rules]);

    const columns = React.useMemo(() => {
        const named = new Map<string, string>();
        for (const rule of rules) {
            if (rule.mediaTypeId) named.set(rule.mediaTypeId, rule.mediaTypeName ?? rule.mediaTypeId);
        }
        return [
            { key: ALL, label: "All media" },
            ...[...named.entries()]
                .map(([key, label]) => ({ key, label }))
                .sort((a, b) => a.label.localeCompare(b.label)),
        ];
    }, [rules]);

    const ruleFor = React.useCallback(
        (sector: string, column: string) =>
            rules.find(
                (rule) =>
                    rule.sector.toLowerCase() === sector.toLowerCase() &&
                    (column === ALL ? rule.mediaTypeId === null : rule.mediaTypeId === column)
            ),
        [rules]
    );

    const [selected, setSelected] = React.useState<{ sector: string; column: string }>({
        sector: sectors[0] ?? "General",
        column: ALL,
    });
    const [addingSector, setAddingSector] = React.useState(false);
    const [newSector, setNewSector] = React.useState("");
    const [extraSectors, setExtraSectors] = React.useState<string[]>([]);

    const allSectors = React.useMemo(
        () =>
            [...sectors, ...extraSectors.filter((s) => !sectors.some((k) => k.toLowerCase() === s.toLowerCase()))].sort(
                (a, b) => a.localeCompare(b)
            ),
        [sectors, extraSectors]
    );

    const current = ruleFor(selected.sector, selected.column);
    const sectorRules = rules.filter(
        (rule) => rule.sector.toLowerCase() === selected.sector.toLowerCase()
    );

    return (
        <div className="space-y-5">
            <PageHeader
                size={embedded ? "section" : "page"}
                title="Category rules"
                subtitle="Rate multipliers and compliance controls per advertiser category"
                actions={
                    <Button variant="outline" className="bg-card" onClick={() => setAddingSector(true)}>
                        <Plus className="mr-1.5 size-4" />
                        Add sector
                    </Button>
                }
            />

            <div className="grid gap-4 xl:grid-cols-3">
                <Card className="overflow-hidden rounded-lg border-border shadow-none xl:col-span-2">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                    <th className="px-5 py-2.5">Category</th>
                                    {columns.map((column) => (
                                        <th key={column.key} className="px-4 py-2.5 text-right">
                                            {column.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {allSectors.map((sector) => (
                                    <tr
                                        key={sector}
                                        className={cn(
                                            "border-b transition-colors last:border-0",
                                            selected.sector === sector ? "bg-primary/[0.04]" : "hover:bg-muted/40"
                                        )}
                                    >
                                        <td
                                            className="cursor-pointer px-5 py-3 font-medium text-foreground"
                                            onClick={() => setSelected({ sector, column: ALL })}
                                        >
                                            {sector}
                                        </td>
                                        {columns.map((column) => (
                                            <td
                                                key={column.key}
                                                onClick={() => setSelected({ sector, column: column.key })}
                                                className={cn(
                                                    "cursor-pointer px-4 py-3 text-right",
                                                    selected.sector === sector &&
                                                        selected.column === column.key &&
                                                        "ring-1 ring-inset ring-primary/40"
                                                )}
                                            >
                                                <CellValue rule={ruleFor(sector, column.key)} />
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="border-t px-5 py-3 text-xs text-muted-foreground">
                        A cell showing 1.00× has no rule. A media-type rule beats the sector&apos;s
                        all-media rule when both exist.
                    </p>
                </Card>

                <ControlsRail
                    key={`${selected.sector}:${selected.column}:${current?.id ?? "new"}`}
                    sector={selected.sector}
                    column={selected.column}
                    columnLabel={columns.find((column) => column.key === selected.column)?.label ?? "All media"}
                    rule={current}
                    sectorRules={sectorRules}
                    mediaTypes={mediaTypes}
                    onColumnChange={(column) => setSelected({ sector: selected.sector, column })}
                    onChanged={onChanged}
                />
            </div>

            <ConfirmDialog
                open={addingSector}
                onOpenChange={setAddingSector}
                title="Add a sector"
                description="Sectors are free text. A new row appears in the matrix; it gets rules when you save one."
                confirmLabel="Add row"
                disabled={newSector.trim().length < 2}
                onConfirm={() => {
                    const name = newSector.trim();
                    setExtraSectors((current) => [...current, name]);
                    setSelected({ sector: name, column: ALL });
                    setNewSector("");
                    setAddingSector(false);
                }}
            >
                <div className="space-y-1.5 pt-2">
                    <Label htmlFor="new-sector">Sector</Label>
                    <Input
                        id="new-sector"
                        className="h-9"
                        value={newSector}
                        onChange={(event) => setNewSector(event.target.value)}
                        placeholder="Quick commerce"
                    />
                </div>
            </ConfirmDialog>
        </div>
    );
}

function ControlsRail({
    sector,
    column,
    columnLabel,
    rule,
    sectorRules,
    mediaTypes,
    onColumnChange,
    onChanged,
}: {
    sector: string;
    column: string;
    columnLabel: string;
    rule: PricingCategoryRule | undefined;
    sectorRules: PricingCategoryRule[];
    mediaTypes: MediaType[];
    onColumnChange: (column: string) => void;
    onChanged: () => void;
}) {
    const [effect, setEffect] = React.useState<CategoryRuleEffect>(rule?.effect ?? "MULTIPLIER");
    const [multiplier, setMultiplier] = React.useState(rule?.multiplier ?? "1.00");
    const [note, setNote] = React.useState(rule?.note ?? "");
    const [busy, setBusy] = React.useState(false);
    const [removing, setRemoving] = React.useState(false);

    const blocked = sectorRules.filter((r) => r.effect === "BLOCKED");
    const legal = sectorRules.filter((r) => r.effect === "LEGAL_APPROVAL");
    const nameOf = (r: PricingCategoryRule) => r.mediaTypeName ?? "all media";

    const banner = rule
        ? rule.note ??
          (rule.effect === "BLOCKED"
              ? `${sector} may not book ${columnLabel.toLowerCase()}.`
              : rule.effect === "LEGAL_APPROVAL"
                ? `${sector} on ${columnLabel.toLowerCase()} needs legal sign-off before it books.`
                : `${sector} pays ${Number(rule.multiplier ?? 1).toFixed(2)}× the card rate here.`)
        : `No rule for ${sector} on ${columnLabel.toLowerCase()} — quotes at 1.00×.`;

    async function save() {
        setBusy(true);
        try {
            const body = {
                sector,
                mediaTypeId: column === ALL ? null : column,
                effect,
                multiplier: effect === "MULTIPLIER" ? multiplier : null,
                note: note.trim() || null,
            };
            if (rule) await priceModelService.updateCategoryRule(rule.id, body);
            else await priceModelService.createCategoryRule(body);
            toast.success(`${sector} rule saved`);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not save the rule.");
        } finally {
            setBusy(false);
        }
    }

    async function remove() {
        if (!rule) return;
        setBusy(true);
        try {
            await priceModelService.deleteCategoryRule(rule.id);
            toast.success(`${sector} rule removed`);
            setRemoving(false);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not remove the rule.");
        } finally {
            setBusy(false);
        }
    }

    const multiplierOk = /^\d{1,3}(\.\d{1,4})?$/.test(multiplier) && Number(multiplier) > 0;

    return (
        <Card className="h-fit rounded-lg border-border p-5 shadow-none">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Category controls
            </h3>
            <p className="mt-2 text-base font-semibold text-foreground">{sector}</p>
            <p
                className={cn(
                    "mt-1 rounded-md px-3 py-2 text-xs",
                    rule?.effect === "BLOCKED"
                        ? "bg-danger-soft text-danger"
                        : rule?.effect === "LEGAL_APPROVAL"
                          ? "bg-warning-soft text-warning"
                          : "bg-muted/60 text-muted-foreground"
                )}
            >
                {banner}
            </p>
            <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">Rules on this sector</dt>
                    <dd className="text-right font-medium text-foreground">{sectorRules.length}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">Blocked on</dt>
                    <dd className="text-right font-medium text-foreground">
                        {blocked.length ? blocked.map(nameOf).join(", ") : "Nothing"}
                    </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">Needs sign-off on</dt>
                    <dd className="text-right font-medium text-foreground">
                        {legal.length ? legal.map(nameOf).join(", ") : "Nothing"}
                    </dd>
                </div>
            </dl>

            <div className="mt-5 space-y-3 border-t pt-4">
                <div className="space-y-1.5">
                    <Label>Media type</Label>
                    <Combobox
                        items={[
                            { label: "All media", value: ALL },
                            ...mediaTypes
                                .filter((type) => !type.mergedIntoId)
                                .map((type) => ({
                                    label: type.name,
                                    value: type.id,
                                    description: type.formatGroup ?? undefined,
                                })),
                        ]}
                        value={column}
                        onValueChange={onColumnChange}
                        searchPlaceholder="Search the catalogue…"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label>Effect</Label>
                    <Select value={effect} onValueChange={(value) => setEffect(value as CategoryRuleEffect)}>
                        <SelectTrigger className="h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {(Object.keys(CATEGORY_EFFECT_META) as CategoryRuleEffect[]).map((key) => (
                                <SelectItem key={key} value={key}>
                                    {CATEGORY_EFFECT_META[key].label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                {effect === "MULTIPLIER" && (
                    <div className="space-y-1.5">
                        <Label htmlFor="category-multiplier">Multiplier</Label>
                        <div className="relative">
                            <Input
                                id="category-multiplier"
                                value={multiplier}
                                onChange={(event) => setMultiplier(event.target.value)}
                                className="h-9 pr-7 text-right tabular-nums"
                                aria-invalid={!multiplierOk}
                            />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                                ×
                            </span>
                        </div>
                    </div>
                )}
                <div className="space-y-1.5">
                    <Label htmlFor="category-note">Note</Label>
                    <Textarea
                        id="category-note"
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="Why this sector is treated this way…"
                        className="min-h-16 resize-none"
                    />
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                    {rule ? (
                        <Button
                            variant="ghost"
                            className="text-danger hover:text-danger"
                            disabled={busy}
                            onClick={() => setRemoving(true)}
                        >
                            Remove rule
                        </Button>
                    ) : (
                        <span />
                    )}
                    <Button
                        disabled={busy || (effect === "MULTIPLIER" && !multiplierOk)}
                        onClick={() => void save()}
                    >
                        {rule ? "Save changes" : "Add rule"}
                    </Button>
                </div>
            </div>

            <ConfirmDialog
                open={removing}
                onOpenChange={setRemoving}
                title="Remove this rule?"
                description={`${sector} on ${columnLabel.toLowerCase()} goes back to 1.00× with no restriction.`}
                confirmLabel="Remove"
                destructive
                busy={busy}
                onConfirm={() => void remove()}
            />
        </Card>
    );
}
