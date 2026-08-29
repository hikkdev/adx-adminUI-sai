"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/adx/page-header";
import { SectionCard } from "@/components/adx/section-card";
import { cn } from "@/lib/utils";
import type {
    CategoryRuleRow,
    FactorRow,
    RateCard,
    RuleCondition,
    SizeBand,
    SurgeWindow,
} from "@/types";
import { RateCardsTable } from "../rate-cards/rate-cards-table";
import { CategoriesView } from "../categories/categories-view";
import { SeasonalityView } from "../seasonality/seasonality-view";
import { RuleBuilder } from "../rules/rule-builder";

interface PricingModelViewProps {
    sizeBands: SizeBand[];
    illumination: FactorRow[];
    aspects: { label: string; rows: FactorRow[] }[];
    rateCards: RateCard[];
    categories: { rows: CategoryRuleRow[]; controls: React.ComponentProps<typeof CategoriesView>["controls"] };
    seasonality: {
        weeks: React.ComponentProps<typeof SeasonalityView>["weeks"];
        windows: SurgeWindow[];
        detail: React.ComponentProps<typeof SeasonalityView>["detail"];
    };
    rule: React.ComponentProps<typeof RuleBuilder>["rule"];
}

const tabTriggerClasses =
    "mb-0 w-full justify-start rounded-lg border border-b border-transparent px-3 py-2 text-left text-sm font-medium text-muted-foreground shadow-none hover:bg-card/60 hover:text-foreground data-[state=active]:border-border data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-none";

/** "1.30×" → 1.3 */
const toNumber = (multiplier: string) => Number(multiplier.replace(/[^\d.]/g, "")) || 1;

interface Knob {
    key: string;
    label: string;
    helper?: string;
    value: number;
}

function MultiplierField({
    knob,
    onChange,
    dirty,
}: {
    knob: Knob;
    onChange: (value: number) => void;
    dirty: boolean;
}) {
    return (
        <div className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-center sm:gap-4">
            <div className="min-w-0">
                <Label htmlFor={knob.key} className="text-sm font-medium text-foreground">
                    {knob.label}
                </Label>
                {knob.helper && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{knob.helper}</p>
                )}
            </div>
            <div className="relative">
                <Input
                    id={knob.key}
                    type="number"
                    step="0.05"
                    min="0"
                    value={knob.value}
                    onChange={(event) => onChange(Number(event.target.value))}
                    className={cn(
                        "h-9 pr-7 text-right tabular-nums",
                        dirty && "border-primary/40 bg-primary/[0.04]"
                    )}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    ×
                </span>
            </div>
        </div>
    );
}

export function PricingModelView({
    sizeBands,
    illumination,
    aspects,
    rateCards,
    categories,
    seasonality,
    rule,
}: PricingModelViewProps) {
    const [dirty, setDirty] = React.useState<Set<string>>(new Set());

    const [size, setSize] = React.useState<Knob[]>(() =>
        sizeBands.map((band) => ({
            key: `size-${band.band}`,
            label: band.band,
            helper: `${band.dimensions} · ${band.areaRange} · ${band.rateBasis}`,
            value: toNumber(band.multiplier),
        }))
    );
    const [light, setLight] = React.useState<Knob[]>(() =>
        illumination.map((row) => ({
            key: `light-${row.factor}`,
            label: row.factor,
            value: toNumber(row.multiplier),
        }))
    );
    const [placement, setPlacement] = React.useState(() =>
        aspects.map((group) => ({
            label: group.label,
            rows: group.rows.map((row) => ({
                key: `place-${group.label}-${row.factor}`,
                label: row.factor,
                value: toNumber(row.multiplier),
            })),
        }))
    );

    const [basis, setBasis] = React.useState({
        rounding: 100,
        minimumWeekly: 12000,
        minimumWeeks: 1,
        floorProtection: true,
    });
    const [duration, setDuration] = React.useState([
        { key: "dur-2", label: "2 to 3 weeks", value: 2 },
        { key: "dur-4", label: "4 to 7 weeks", value: 4 },
        { key: "dur-8", label: "8 to 11 weeks", value: 7 },
        { key: "dur-12", label: "12 weeks or more", value: 10 },
    ]);
    const [guardrails, setGuardrails] = React.useState({
        discountCeiling: 15,
        approvalThreshold: 10,
        maxStackedUplift: 2.2,
        blockBelowFloor: true,
    });

    const touch = (key: string) => setDirty((current) => new Set(current).add(key));

    const setKnob = (
        list: Knob[],
        setList: React.Dispatch<React.SetStateAction<Knob[]>>,
        key: string,
        value: number
    ) => {
        setList(list.map((knob) => (knob.key === key ? { ...knob, value } : knob)));
        touch(key);
    };

    const peakUplift = React.useMemo(() => {
        const groups = [
            size.map((k) => k.value),
            light.map((k) => k.value),
            ...placement.map((group) => group.rows.map((k) => k.value)),
        ];
        return groups.reduce((acc, values) => acc * Math.max(...values), 1);
    }, [size, light, placement]);

    const overCap = peakUplift > guardrails.maxStackedUplift;

    const save = () => {
        setDirty(new Set());
        toast.success("Pricing variables saved");
    };

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
                            <div className="space-y-1.5">
                                <Label htmlFor="rounding">Round to nearest (₹)</Label>
                                <Input
                                    id="rounding"
                                    type="number"
                                    step="10"
                                    value={basis.rounding}
                                    onChange={(event) => {
                                        setBasis({ ...basis, rounding: Number(event.target.value) });
                                        touch("rounding");
                                    }}
                                    className="tabular-nums"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="min-weekly">Minimum weekly rate (₹)</Label>
                                <Input
                                    id="min-weekly"
                                    type="number"
                                    step="500"
                                    value={basis.minimumWeekly}
                                    onChange={(event) => {
                                        setBasis({
                                            ...basis,
                                            minimumWeekly: Number(event.target.value),
                                        });
                                        touch("min-weekly");
                                    }}
                                    className="tabular-nums"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="min-weeks">Minimum booking (weeks)</Label>
                                <Input
                                    id="min-weeks"
                                    type="number"
                                    min="1"
                                    value={basis.minimumWeeks}
                                    onChange={(event) => {
                                        setBasis({
                                            ...basis,
                                            minimumWeeks: Number(event.target.value),
                                        });
                                        touch("min-weeks");
                                    }}
                                    className="tabular-nums"
                                />
                            </div>
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-4 border-t pt-4">
                            <Label htmlFor="floor-protection" className="text-sm font-medium">
                                Floor price protection
                            </Label>
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

                    <SectionCard title="Size bands" contentClassName="divide-y px-5 py-1">
                        {size.map((knob) => (
                            <MultiplierField
                                key={knob.key}
                                knob={knob}
                                dirty={dirty.has(knob.key)}
                                onChange={(value) => setKnob(size, setSize, knob.key, value)}
                            />
                        ))}
                    </SectionCard>

                    <SectionCard title="Illumination" contentClassName="divide-y px-5 py-1">
                        {light.map((knob) => (
                            <MultiplierField
                                key={knob.key}
                                knob={knob}
                                dirty={dirty.has(knob.key)}
                                onChange={(value) => setKnob(light, setLight, knob.key, value)}
                            />
                        ))}
                    </SectionCard>

                    {placement.map((group, groupIndex) => (
                        <SectionCard
                            key={group.label}
                            title={group.label}
                            contentClassName="divide-y px-5 py-1"
                        >
                            {group.rows.map((knob) => (
                                <MultiplierField
                                    key={knob.key}
                                    knob={knob}
                                    dirty={dirty.has(knob.key)}
                                    onChange={(value) => {
                                        setPlacement(
                                            placement.map((g, i) =>
                                                i === groupIndex
                                                    ? {
                                                          ...g,
                                                          rows: g.rows.map((r) =>
                                                              r.key === knob.key ? { ...r, value } : r
                                                          ),
                                                      }
                                                    : g
                                            )
                                        );
                                        touch(knob.key);
                                    }}
                                />
                            ))}
                        </SectionCard>
                    ))}

                    <SectionCard title="Duration discounts" contentClassName="divide-y px-5 py-1">
                        {duration.map((tier) => (
                            <div
                                key={tier.key}
                                className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-center sm:gap-4"
                            >
                                <Label
                                    htmlFor={tier.key}
                                    className="text-sm font-medium text-foreground"
                                >
                                    {tier.label}
                                </Label>
                                <div className="relative">
                                    <Input
                                        id={tier.key}
                                        type="number"
                                        step="1"
                                        min="0"
                                        max="100"
                                        value={tier.value}
                                        onChange={(event) => {
                                            setDuration(
                                                duration.map((t) =>
                                                    t.key === tier.key
                                                        ? { ...t, value: Number(event.target.value) }
                                                        : t
                                                )
                                            );
                                            touch(tier.key);
                                        }}
                                        className={cn(
                                            "h-9 pr-7 text-right tabular-nums",
                                            dirty.has(tier.key) &&
                                                "border-primary/40 bg-primary/[0.04]"
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
                            <div className="space-y-1.5">
                                <Label htmlFor="approval-threshold">
                                    Discount needing approval (%)
                                </Label>
                                <Input
                                    id="approval-threshold"
                                    type="number"
                                    value={guardrails.approvalThreshold}
                                    onChange={(event) => {
                                        setGuardrails({
                                            ...guardrails,
                                            approvalThreshold: Number(event.target.value),
                                        });
                                        touch("approval-threshold");
                                    }}
                                    className="tabular-nums"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="discount-ceiling">Discount ceiling (%)</Label>
                                <Input
                                    id="discount-ceiling"
                                    type="number"
                                    value={guardrails.discountCeiling}
                                    onChange={(event) => {
                                        setGuardrails({
                                            ...guardrails,
                                            discountCeiling: Number(event.target.value),
                                        });
                                        touch("discount-ceiling");
                                    }}
                                    className="tabular-nums"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="max-uplift">Maximum stacked uplift</Label>
                                <div className="relative">
                                    <Input
                                        id="max-uplift"
                                        type="number"
                                        step="0.1"
                                        value={guardrails.maxStackedUplift}
                                        onChange={(event) => {
                                            setGuardrails({
                                                ...guardrails,
                                                maxStackedUplift: Number(event.target.value),
                                            });
                                            touch("max-uplift");
                                        }}
                                        className={cn(
                                            "pr-7 tabular-nums",
                                            overCap && "border-danger"
                                        )}
                                        aria-invalid={overCap}
                                        aria-describedby={overCap ? "max-uplift-error" : undefined}
                                    />
                                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                                        ×
                                    </span>
                                </div>
                                {overCap && (
                                    <p id="max-uplift-error" className="text-xs text-danger">
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
                    <RateCardsTable rateCards={rateCards} embedded />
                </TabsContent>

                <TabsContent value="categories" className="mt-0">
                    <CategoriesView rows={categories.rows} controls={categories.controls} embedded />
                </TabsContent>

                <TabsContent value="seasonality" className="mt-0">
                    <SeasonalityView
                        weeks={seasonality.weeks}
                        windows={seasonality.windows}
                        detail={seasonality.detail}
                        embedded
                    />
                </TabsContent>

                    <TabsContent value="rules" className="mt-0">
                        <RuleBuilder rule={rule} />
                    </TabsContent>
                </div>
            </Tabs>

            {dirty.size > 0 && (
                <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur md:left-[243px]">
                    <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
                        <p className="text-sm text-muted-foreground">
                            <span className="font-medium tabular-nums text-foreground">
                                {dirty.size}
                            </span>{" "}
                            {dirty.size === 1 ? "change" : "changes"}
                        </p>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" onClick={() => setDirty(new Set())}>
                                Discard
                            </Button>
                            <Button onClick={save}>Save</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
