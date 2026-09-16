"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/adx/page-header";
import { SectionCard } from "@/components/adx/section-card";
import { cn } from "@/lib/utils";
import {
    priceModelService,
    type PriceDimension,
    type PriceModelSettings,
    type PriceRule,
    type PricingCategoryRule,
    type SiteOption,
} from "@/services/price-model";
import type { RateCard } from "@/services/rate-cards";
import type { MediaType, SurgeEventWindow } from "@/types/pricing-engine";
import { RateCardsTable } from "../rate-cards/rate-cards-table";
import { CategoriesView } from "../categories/categories-view";
import { SurgeView } from "../surge/surge-view";
import { RuleBuilder } from "../rules/rule-builder";

interface PricingModelViewProps {
    settings: PriceModelSettings;
    dimensions: PriceDimension[];
    cards: RateCard[];
    categoryRules: PricingCategoryRule[];
    mediaTypes: MediaType[];
    surgeWindows: SurgeEventWindow[];
    rules: PriceRule[];
    sampleSite: SiteOption | null;
    onChanged: () => void;
}

const tabTriggerClasses =
    "mb-0 w-full justify-start rounded-lg border border-b border-transparent px-3 py-2 text-left text-sm font-medium text-muted-foreground shadow-none hover:bg-card/60 hover:text-foreground data-[state=active]:border-border data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-none";

interface Knob {
    key: string;
    label: string;
    helper?: string;
    value: number;
    minAreaSqFt: string | null;
    maxAreaSqFt: string | null;
}

interface Group {
    id: string;
    name: string;
    /** Chosen by area; its options carry ranges. */
    sizeBand: boolean;
    knobs: Knob[];
}

const areaHelper = (min: string | null, max: string | null) =>
    min && max
        ? `${Number(min)}–${Number(max)} sq ft`
        : min
          ? `${Number(min)} sq ft and above`
          : max
            ? `Up to ${Number(max)} sq ft`
            : undefined;

function groupsFrom(dimensions: PriceDimension[]): Group[] {
    return dimensions
        .filter((dimension) => dimension.isActive)
        .map((dimension) => {
            const sizeBand = dimension.values.some((v) => v.minAreaSqFt !== null || v.maxAreaSqFt !== null);
            return {
                id: dimension.id,
                name: dimension.name,
                sizeBand,
                knobs: dimension.values
                    .filter((value) => value.isActive)
                    .map((value) => ({
                        key: value.id,
                        label: value.label,
                        helper: sizeBand ? areaHelper(value.minAreaSqFt, value.maxAreaSqFt) : undefined,
                        value: Number(value.multiplier),
                        minAreaSqFt: value.minAreaSqFt,
                        maxAreaSqFt: value.maxAreaSqFt,
                    })),
            };
        });
}

function MultiplierField({
    knob,
    onChange,
    onRemove,
    dirty,
}: {
    knob: Knob;
    onChange: (value: number) => void;
    onRemove: () => void;
    dirty: boolean;
}) {
    return (
        <div className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-center sm:gap-4">
            <div className="min-w-0">
                <Label htmlFor={knob.key} className="text-sm font-medium text-foreground">
                    {knob.label}
                </Label>
                {knob.helper && <p className="mt-0.5 text-xs text-muted-foreground">{knob.helper}</p>}
            </div>
            <div className="relative">
                <Input
                    id={knob.key}
                    type="number"
                    step="0.05"
                    min="0"
                    value={knob.value}
                    onChange={(event) => onChange(Number(event.target.value))}
                    className={cn("h-9 pr-7 text-right tabular-nums", dirty && "border-primary/40 bg-primary/[0.04]")}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    ×
                </span>
            </div>
            <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground"
                aria-label={`Remove ${knob.label}`}
                onClick={onRemove}
            >
                <X className="size-4" />
            </Button>
        </div>
    );
}

/**
 * The DR 10 Pricing model hub: General on the first tab, and the registers —
 * rate cards, categories, seasonality, rules — on the rest.
 *
 * General is the model's dials. The rate basis and guardrails are one settings
 * row; each multiplier section is a price dimension and its options. Both come
 * from the API and both go back to it from the one save bar, so a change here
 * is a change to what the simulator traces and what a quote charges.
 */
export function PricingModelView({
    settings,
    dimensions,
    cards,
    categoryRules,
    mediaTypes,
    surgeWindows,
    rules,
    sampleSite,
    onChanged,
}: PricingModelViewProps) {
    const [dirty, setDirty] = React.useState<Set<string>>(new Set());
    const [groups, setGroups] = React.useState<Group[]>(() => groupsFrom(dimensions));
    const [touchedGroups, setTouchedGroups] = React.useState<Set<string>>(new Set());

    const [basis, setBasis] = React.useState({
        rounding: settings.roundingRupees,
        minimumDaily: Number(settings.minimumRatePerDay),
        minimumDays: settings.minimumBookingDays,
        floorProtection: settings.floorProtection,
    });
    const [duration, setDuration] = React.useState(
        settings.durationDiscounts.map((tier, index) => ({
            key: `dur-${index}`,
            minDays: tier.minDays,
            value: tier.pct,
        }))
    );
    const [guardrails, setGuardrails] = React.useState({
        discountCeiling: Number(settings.discountCeilingPct),
        approvalThreshold: Number(settings.approvalThresholdPct),
        maxStackedUplift: Number(settings.maxStackedUplift),
        blockBelowFloor: settings.blockBelowFloor,
    });
    const [busy, setBusy] = React.useState(false);
    const [seeding, setSeeding] = React.useState(false);
    const [addingTo, setAddingTo] = React.useState<string | null>(null);
    const [draft, setDraft] = React.useState({ label: "", multiplier: "1.00", min: "", max: "" });
    // Keys for options added this session, before the server gives them ids.
    const nextKey = React.useRef(0);

    const touch = (key: string) => setDirty((current) => new Set(current).add(key));
    const touchGroup = (id: string) => setTouchedGroups((current) => new Set(current).add(id));

    const setKnob = (groupId: string, key: string, value: number) => {
        setGroups((current) =>
            current.map((group) =>
                group.id === groupId
                    ? { ...group, knobs: group.knobs.map((knob) => (knob.key === key ? { ...knob, value } : knob)) }
                    : group
            )
        );
        touch(key);
        touchGroup(groupId);
    };

    const removeKnob = (groupId: string, key: string) => {
        setGroups((current) =>
            current.map((group) =>
                group.id === groupId ? { ...group, knobs: group.knobs.filter((knob) => knob.key !== key) } : group
            )
        );
        touch(`${key}-removed`);
        touchGroup(groupId);
    };

    const addKnob = (groupId: string) => {
        const label = draft.label.trim();
        const multiplier = Number(draft.multiplier);
        if (!label || !(multiplier > 0)) return;
        nextKey.current += 1;
        const key = `new-${nextKey.current}`;
        setGroups((current) =>
            current.map((group) =>
                group.id === groupId
                    ? {
                          ...group,
                          knobs: [
                              ...group.knobs,
                              {
                                  key,
                                  label,
                                  value: multiplier,
                                  minAreaSqFt: group.sizeBand && draft.min ? draft.min : null,
                                  maxAreaSqFt: group.sizeBand && draft.max ? draft.max : null,
                                  helper: group.sizeBand
                                      ? areaHelper(draft.min || null, draft.max || null)
                                      : undefined,
                              },
                          ],
                      }
                    : group
            )
        );
        touch(key);
        touchGroup(groupId);
        setAddingTo(null);
        setDraft({ label: "", multiplier: "1.00", min: "", max: "" });
    };

    const peakUplift = React.useMemo(
        () =>
            groups.reduce(
                (acc, group) => acc * (group.knobs.length ? Math.max(...group.knobs.map((k) => k.value)) : 1),
                1
            ),
        [groups]
    );
    const overCap = peakUplift > guardrails.maxStackedUplift;

    const discard = () => {
        setGroups(groupsFrom(dimensions));
        setBasis({
            rounding: settings.roundingRupees,
            minimumDaily: Number(settings.minimumRatePerDay),
            minimumDays: settings.minimumBookingDays,
            floorProtection: settings.floorProtection,
        });
        setDuration(
            settings.durationDiscounts.map((tier, index) => ({ key: `dur-${index}`, minDays: tier.minDays, value: tier.pct }))
        );
        setGuardrails({
            discountCeiling: Number(settings.discountCeilingPct),
            approvalThreshold: Number(settings.approvalThresholdPct),
            maxStackedUplift: Number(settings.maxStackedUplift),
            blockBelowFloor: settings.blockBelowFloor,
        });
        setDirty(new Set());
        setTouchedGroups(new Set());
    };

    async function save() {
        setBusy(true);
        try {
            await priceModelService.saveSettings({
                roundingRupees: Math.max(0, Math.round(basis.rounding)),
                minimumRatePerDay: Math.max(0, basis.minimumDaily).toFixed(2),
                minimumBookingDays: Math.max(1, Math.round(basis.minimumDays)),
                floorProtection: basis.floorProtection,
                durationDiscounts: duration.map((tier) => ({
                    minDays: Math.max(1, Math.round(tier.minDays)),
                    pct: Math.min(99, Math.max(0, tier.value)),
                })),
                approvalThresholdPct: guardrails.approvalThreshold.toFixed(2),
                discountCeilingPct: guardrails.discountCeiling.toFixed(2),
                maxStackedUplift: guardrails.maxStackedUplift.toFixed(4),
                blockBelowFloor: guardrails.blockBelowFloor,
            });
            for (const group of groups) {
                if (!touchedGroups.has(group.id)) continue;
                await priceModelService.setDimensionValues(
                    group.id,
                    group.knobs.map((knob) => ({
                        label: knob.label,
                        multiplier: knob.value.toFixed(4),
                        minAreaSqFt: knob.minAreaSqFt,
                        maxAreaSqFt: knob.maxAreaSqFt,
                    }))
                );
            }
            setDirty(new Set());
            setTouchedGroups(new Set());
            toast.success("Pricing variables saved", {
                description: "The simulator and every new quote use them from now.",
            });
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not save the pricing model.");
        } finally {
            setBusy(false);
        }
    }

    async function seed() {
        setSeeding(true);
        try {
            await priceModelService.seedStandardDimensions();
            toast.success("Standard dimensions added", {
                description: "Size bands, illumination, facing, elevation and visibility.",
            });
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not add the dimensions.");
        } finally {
            setSeeding(false);
        }
    }

    const numberField = (
        id: string,
        label: string,
        value: number,
        onChange: (value: number) => void,
        extra?: { step?: string; min?: string; suffix?: string; invalid?: boolean; describedBy?: string }
    ) => (
        <div className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            <div className="relative">
                <Input
                    id={id}
                    type="number"
                    step={extra?.step}
                    min={extra?.min}
                    value={value}
                    onChange={(event) => {
                        onChange(Number(event.target.value));
                        touch(id);
                    }}
                    className={cn("tabular-nums", extra?.suffix && "pr-7", extra?.invalid && "border-danger")}
                    aria-invalid={extra?.invalid}
                    aria-describedby={extra?.describedBy}
                />
                {extra?.suffix && (
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        {extra.suffix}
                    </span>
                )}
            </div>
        </div>
    );

    return (
        <div className={cn("space-y-5", dirty.size > 0 && "pb-24")}>
            <PageHeader title="Pricing model" />

            <Tabs
                defaultValue="general"
                orientation="vertical"
                className="grid gap-6 xl:grid-cols-[190px_minmax(0,1fr)]"
            >
                <TabsList className="h-fit w-full flex-col items-stretch justify-start gap-1 rounded-none border-b-0 bg-transparent p-0 xl:sticky xl:top-[81px]">
                    <TabsTrigger value="general" className={tabTriggerClasses}>
                        General
                    </TabsTrigger>
                    <TabsTrigger value="rate-cards" className={tabTriggerClasses}>
                        Rate cards
                    </TabsTrigger>
                    <TabsTrigger value="categories" className={tabTriggerClasses}>
                        Categories
                    </TabsTrigger>
                    <TabsTrigger value="seasonality" className={tabTriggerClasses}>
                        Seasonality
                    </TabsTrigger>
                    <TabsTrigger value="rules" className={tabTriggerClasses}>
                        Rules
                    </TabsTrigger>
                </TabsList>

                <div className="min-w-0">
                    {/* General ------------------------------------------------ */}
                    <TabsContent value="general" className="mt-0 space-y-5">
                        <SectionCard title="Rate basis">
                            <div className="grid gap-4 sm:grid-cols-3">
                                {numberField("rounding", "Round to nearest (₹)", basis.rounding, (v) => setBasis({ ...basis, rounding: v }), { step: "10", min: "0" })}
                                {numberField("min-daily", "Minimum daily rate (₹)", basis.minimumDaily, (v) => setBasis({ ...basis, minimumDaily: v }), { step: "100", min: "0" })}
                                {numberField("min-days", "Minimum booking (days)", basis.minimumDays, (v) => setBasis({ ...basis, minimumDays: v }), { min: "1" })}
                            </div>
                            <div className="mt-4 flex items-center justify-between gap-4 border-t pt-4">
                                <div>
                                    <Label htmlFor="floor-protection" className="text-sm font-medium">
                                        Floor price protection
                                    </Label>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        A discount that takes a rate under the card&apos;s floor is flagged for approval.
                                    </p>
                                </div>
                                <Switch
                                    id="floor-protection"
                                    checked={basis.floorProtection}
                                    onCheckedChange={(checked) => {
                                        setBasis({ ...basis, floorProtection: checked });
                                        touch("floor-protection");
                                    }}
                                />
                            </div>
                        </SectionCard>

                        {groups.length === 0 && (
                            <SectionCard
                                title="Dimensions"
                                description="Size bands, illumination, facing, elevation and visibility — the multipliers a quote applies on top of the card rate."
                            >
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <p className="text-sm text-muted-foreground">
                                        No dimensions yet. Add the standard set and tune the multipliers, or
                                        leave it empty and quotes trace from the card rate alone.
                                    </p>
                                    <Button disabled={seeding} onClick={() => void seed()}>
                                        <Plus className="mr-1.5 size-4" />
                                        Add the standard set
                                    </Button>
                                </div>
                            </SectionCard>
                        )}

                        {groups.map((group) => (
                            <SectionCard
                                key={group.id}
                                title={group.name}
                                description={group.sizeBand ? "Chosen by measured area, never by hand." : undefined}
                                contentClassName="divide-y px-5 py-1"
                                actions={
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 bg-card"
                                        onClick={() => {
                                            setAddingTo(addingTo === group.id ? null : group.id);
                                            setDraft({ label: "", multiplier: "1.00", min: "", max: "" });
                                        }}
                                    >
                                        <Plus className="mr-1 size-3.5" />
                                        Add option
                                    </Button>
                                }
                            >
                                {group.knobs.length === 0 && (
                                    <p className="py-3 text-sm text-muted-foreground">No options yet.</p>
                                )}
                                {group.knobs.map((knob) => (
                                    <MultiplierField
                                        key={knob.key}
                                        knob={knob}
                                        dirty={dirty.has(knob.key)}
                                        onChange={(value) => setKnob(group.id, knob.key, value)}
                                        onRemove={() => removeKnob(group.id, knob.key)}
                                    />
                                ))}
                                {addingTo === group.id && (
                                    <div className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_9rem_auto] sm:items-end">
                                        <div className="space-y-1">
                                            <Label className="text-xs">Label</Label>
                                            <Input
                                                className="h-9"
                                                value={draft.label}
                                                onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                                                placeholder={group.sizeBand ? "Super" : "Back-lit"}
                                                autoFocus
                                            />
                                        </div>
                                        {group.sizeBand ? (
                                            <>
                                                <div className="space-y-1">
                                                    <Label className="text-xs">From (sq ft)</Label>
                                                    <Input
                                                        className="h-9 tabular-nums"
                                                        type="number"
                                                        value={draft.min}
                                                        onChange={(event) => setDraft({ ...draft, min: event.target.value })}
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs">To (sq ft)</Label>
                                                    <Input
                                                        className="h-9 tabular-nums"
                                                        type="number"
                                                        value={draft.max}
                                                        onChange={(event) => setDraft({ ...draft, max: event.target.value })}
                                                    />
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <span className="hidden sm:block" />
                                                <span className="hidden sm:block" />
                                            </>
                                        )}
                                        <div className="space-y-1">
                                            <Label className="text-xs">Multiplier</Label>
                                            <Input
                                                className="h-9 text-right tabular-nums"
                                                type="number"
                                                step="0.05"
                                                min="0"
                                                value={draft.multiplier}
                                                onChange={(event) => setDraft({ ...draft, multiplier: event.target.value })}
                                            />
                                        </div>
                                        <Button
                                            size="sm"
                                            className="h-9"
                                            disabled={!draft.label.trim() || !(Number(draft.multiplier) > 0)}
                                            onClick={() => addKnob(group.id)}
                                        >
                                            Add
                                        </Button>
                                    </div>
                                )}
                            </SectionCard>
                        ))}

                        <SectionCard
                            title="Duration discounts"
                            description="The longest tier a flight reaches wins; tiers do not stack."
                            contentClassName="divide-y px-5 py-1"
                        >
                            {duration.map((tier, index) => (
                                <div
                                    key={tier.key}
                                    className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_9rem_9rem] sm:items-center sm:gap-4"
                                >
                                    <Label htmlFor={tier.key} className="text-sm font-medium text-foreground">
                                        {tier.minDays} days or more
                                    </Label>
                                    <div className="relative">
                                        <Input
                                            id={`${tier.key}-days`}
                                            type="number"
                                            min="1"
                                            value={tier.minDays}
                                            onChange={(event) => {
                                                setDuration(duration.map((t, i) => (i === index ? { ...t, minDays: Number(event.target.value) } : t)));
                                                touch(`${tier.key}-days`);
                                            }}
                                            className="h-9 pr-12 text-right tabular-nums"
                                            aria-label="Minimum days for this tier"
                                        />
                                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                                            days
                                        </span>
                                    </div>
                                    <div className="relative">
                                        <Input
                                            id={tier.key}
                                            type="number"
                                            step="1"
                                            min="0"
                                            max="99"
                                            value={tier.value}
                                            onChange={(event) => {
                                                setDuration(duration.map((t, i) => (i === index ? { ...t, value: Number(event.target.value) } : t)));
                                                touch(tier.key);
                                            }}
                                            className={cn(
                                                "h-9 pr-7 text-right tabular-nums",
                                                dirty.has(tier.key) && "border-primary/40 bg-primary/[0.04]"
                                            )}
                                        />
                                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                                            %
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </SectionCard>

                        <SectionCard title="Guardrails">
                            <div className="grid gap-4 sm:grid-cols-3">
                                {numberField("approval-threshold", "Discount needing approval (%)", guardrails.approvalThreshold, (v) => setGuardrails({ ...guardrails, approvalThreshold: v }), { min: "0" })}
                                {numberField("discount-ceiling", "Discount ceiling (%)", guardrails.discountCeiling, (v) => setGuardrails({ ...guardrails, discountCeiling: v }), { min: "0" })}
                                <div>
                                    {numberField("max-uplift", "Maximum stacked uplift", guardrails.maxStackedUplift, (v) => setGuardrails({ ...guardrails, maxStackedUplift: v }), {
                                        step: "0.1",
                                        min: "0",
                                        suffix: "×",
                                        invalid: overCap,
                                        describedBy: overCap ? "max-uplift-error" : undefined,
                                    })}
                                    {overCap && (
                                        <p id="max-uplift-error" className="mt-1.5 text-xs text-danger">
                                            Below the {peakUplift.toFixed(2)}× these multipliers can reach
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="mt-4 flex items-center justify-between gap-4 border-t pt-4">
                                <Label htmlFor="block-below-floor" className="text-sm font-medium">
                                    Block quotes below the floor
                                </Label>
                                <Switch
                                    id="block-below-floor"
                                    checked={guardrails.blockBelowFloor}
                                    onCheckedChange={(checked) => {
                                        setGuardrails({ ...guardrails, blockBelowFloor: checked });
                                        touch("block-below-floor");
                                    }}
                                />
                            </div>
                        </SectionCard>
                    </TabsContent>

                    {/* Embedded registries ------------------------------------ */}
                    <TabsContent value="rate-cards" className="mt-0">
                        <RateCardsTable cards={cards} embedded onChanged={onChanged} />
                    </TabsContent>

                    <TabsContent value="categories" className="mt-0">
                        <CategoriesView rules={categoryRules} mediaTypes={mediaTypes} embedded onChanged={onChanged} />
                    </TabsContent>

                    <TabsContent value="seasonality" className="mt-0 space-y-5">
                        <PageHeader
                            size="section"
                            title="Seasonality"
                            subtitle="Surge windows the calendar has in force. A window over a site multiplies its quote."
                        />
                        <SurgeView windows={surgeWindows} onChanged={onChanged} />
                    </TabsContent>

                    <TabsContent value="rules" className="mt-0">
                        <RuleBuilder
                            rules={rules}
                            mediaTypes={mediaTypes}
                            sampleSite={sampleSite}
                            embedded
                            onChanged={onChanged}
                        />
                    </TabsContent>
                </div>
            </Tabs>

            {dirty.size > 0 && (
                <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur md:left-[243px]">
                    <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
                        <p className="text-sm text-muted-foreground">
                            <span className="font-medium tabular-nums text-foreground">{dirty.size}</span>{" "}
                            {dirty.size === 1 ? "change" : "changes"}
                        </p>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" disabled={busy} onClick={discard}>
                                Discard
                            </Button>
                            <Button disabled={busy} onClick={() => void save()}>
                                Save
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
