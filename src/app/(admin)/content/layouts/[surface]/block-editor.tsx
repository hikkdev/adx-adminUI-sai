"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownField } from "@/components/adx/markdown-field";
import { cn } from "@/lib/utils";
import { CITY_STAGES, CITY_STAGE_LABEL, type CityStage } from "@/services/geo";
import {
    SIDE_LABEL,
    SURFACE_SIDES,
    asCtaValue,
    asTargetValue,
    formProblems,
    fromFormModel,
    groupFields,
    isKnownInput,
    moveBlock,
    toFormModel,
    typeRuleProblems,
    type BlockTypeDef,
    type FieldSpec,
    type FormModel,
    type FormValue,
    type LayoutBlock,
    type LayoutSide,
    type LayoutSurface,
} from "@/services/layouts";
import { CityPick, ContentSlugField, CtaField, FormKeyField, ListingIdsField, MediaField, SlotKeyField, TargetField } from "./field-inputs";

const NONE = "__none__";

/** An ISO instant → the `datetime-local` value, in the browser's zone. */
export function toLocalInput(iso: string | undefined): string {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A `datetime-local` value → an ISO instant, or undefined when empty or unreadable. */
export function fromLocalInput(value: string): string | undefined {
    if (!value) return undefined;
    const time = Date.parse(value);
    return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

/** A banner's picture field takes either shape; once the shape is chosen, the picker offers only that one. */
export function narrowSpec(type: string, spec: FieldSpec, model: FormModel): FieldSpec {
    if (type !== "promo_banner" || spec.input !== "media" || !spec.spec?.includes(",")) return spec;
    const aspect = model.aspect;
    if (aspect === "WIDE") return { ...spec, spec: "PROMO_WIDE" };
    if (aspect === "SQUARE") return { ...spec, spec: "PROMO_SQUARE" };
    return spec;
}

interface BlockEditorProps {
    surface: LayoutSurface;
    block: LayoutBlock;
    def: BlockTypeDef | undefined;
    pinned: boolean;
    /** After a save was tried, every problem shows, touched or not. */
    showErrors: boolean;
    onChange: (next: LayoutBlock) => void;
}

/**
 * One block's editor: its props as the backend's FieldSpec describes them,
 * then who sees it (sides, cities, city stages) and when (from / to). Every
 * change lands in the draft at once; nothing here talks to the server.
 */
export function BlockEditor({ surface, block, def, pinned, showErrors, onChange }: BlockEditorProps) {
    const specs = React.useMemo(() => def?.props ?? [], [def]);
    const [model, setModel] = React.useState<FormModel>(() => toFormModel(specs, block.props));
    const [touched, setTouched] = React.useState<Set<string>>(() => new Set());

    const problems = formProblems(specs, model);
    const rules = typeRuleProblems(block.type, block.props);
    const shown = (path: string) => (showErrors || touched.has(path.split(".")[0]!) ? problems[path] : undefined);

    const setField = (key: string, value: FormValue) => {
        const next = { ...model, [key]: value };
        setModel(next);
        setTouched((current) => new Set(current).add(key));
        onChange({ ...block, props: fromFormModel(specs, next, block.props) });
    };

    const visibility = block.visibility ?? {};
    const sides = SURFACE_SIDES[surface];

    return (
        <div className="space-y-5">
            {!def && <p className="rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">The server does not know the type “{block.type}”. It will refuse the draft until this block is removed.</p>}

            {specs.length > 0 ? (
                <div className="space-y-4">
                    {specs.map((spec) => (
                        <FieldRow key={spec.key} spec={narrowSpec(block.type, spec, model)} error={shown(spec.key)} errors={problems} showAll={showErrors || touched.has(spec.key)} value={model[spec.key]} onChange={(value) => setField(spec.key, value)} />
                    ))}
                </div>
            ) : (
                def && <p className="text-xs text-muted-foreground">{def.kind === "SYSTEM" ? "A system block — the app draws it; the layout decides only where, for whom and when." : "Nothing to set."}</p>
            )}
            {rules.length > 0 && (showErrors || touched.size > 0) && (
                <ul className="space-y-0.5 text-xs text-danger">
                    {rules.map((rule) => (
                        <li key={rule}>{rule}</li>
                    ))}
                </ul>
            )}

            <fieldset className="space-y-3 border-t pt-4" disabled={pinned}>
                <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Who sees it</legend>
                {pinned && <p className="text-xs text-muted-foreground">This block closes the screen and shows to everyone, always.</p>}
                <div className="space-y-1.5">
                    <Label className="text-xs">Sides — none ticked shows to every side</Label>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                        {sides.map((side) => (
                            <label key={side} className="flex items-center gap-1.5 text-sm">
                                <Checkbox
                                    checked={visibility.sides?.includes(side) ?? false}
                                    onCheckedChange={(checked) => {
                                        const current = new Set<LayoutSide>(visibility.sides ?? []);
                                        if (checked) current.add(side);
                                        else current.delete(side);
                                        onChange({ ...block, visibility: { ...visibility, sides: [...current] } });
                                    }}
                                />
                                {SIDE_LABEL[side]}
                            </label>
                        ))}
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Cities — none picked shows everywhere</Label>
                    <CityPick value={visibility.cityIds ?? []} onChange={(cityIds) => onChange({ ...block, visibility: { ...visibility, cityIds } })} />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">City stages — the viewer’s city must be at one of these</Label>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                        {CITY_STAGES.map((stage) => (
                            <label key={stage} className="flex items-center gap-1.5 text-sm">
                                <Checkbox
                                    checked={visibility.stages?.includes(stage) ?? false}
                                    onCheckedChange={(checked) => {
                                        const current = new Set<CityStage>(visibility.stages ?? []);
                                        if (checked) current.add(stage);
                                        else current.delete(stage);
                                        onChange({ ...block, visibility: { ...visibility, stages: [...current] } });
                                    }}
                                />
                                {CITY_STAGE_LABEL[stage]}
                            </label>
                        ))}
                    </div>
                </div>
            </fieldset>

            <fieldset className="space-y-3 border-t pt-4" disabled={pinned}>
                <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">When</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label htmlFor={`${block.id}-from`} className="text-xs">
                            From — empty is now
                        </Label>
                        <Input
                            id={`${block.id}-from`}
                            type="datetime-local"
                            value={toLocalInput(block.schedule?.startsAt)}
                            onChange={(e) => onChange({ ...block, schedule: { ...block.schedule, startsAt: fromLocalInput(e.target.value) } })}
                            className="h-9"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor={`${block.id}-to`} className="text-xs">
                            Until — empty is always
                        </Label>
                        <Input
                            id={`${block.id}-to`}
                            type="datetime-local"
                            value={toLocalInput(block.schedule?.endsAt)}
                            onChange={(e) => onChange({ ...block, schedule: { ...block.schedule, endsAt: fromLocalInput(e.target.value) } })}
                            className="h-9"
                        />
                    </div>
                </div>
            </fieldset>
        </div>
    );
}

interface FieldRowProps {
    spec: FieldSpec;
    value: FormValue | undefined;
    error: string | undefined;
    /** Every problem of the whole form, for a group's items. */
    errors: Record<string, string>;
    showAll: boolean;
    onChange: (value: FormValue) => void;
    path?: string;
}

/** One field: its label (with the hint beside it, so paired rows stay one height) and its control. */
function FieldRow({ spec, value, error, errors, showAll, onChange, path = spec.key }: FieldRowProps) {
    const id = `field-${path}`;
    return (
        <div className="space-y-1.5">
            <Label htmlFor={id} className="text-xs">
                {spec.label}
                {spec.required ? <span className="text-danger"> *</span> : null}
                {spec.hint && <span className="font-normal text-muted-foreground"> — {spec.hint}</span>}
            </Label>
            <FieldControl id={id} spec={spec} value={value} invalid={!!error} errors={errors} showAll={showAll} onChange={onChange} path={path} />
            {error && <p className="text-xs text-danger">{error}</p>}
        </div>
    );
}

function FieldControl({ id, spec, value, invalid, errors, showAll, onChange, path }: { id: string; spec: FieldSpec; value: FormValue | undefined; invalid: boolean; errors: Record<string, string>; showAll: boolean; onChange: (value: FormValue) => void; path: string }) {
    const text = typeof value === "string" ? value : "";
    const list = Array.isArray(value) ? (value as string[]) : [];
    const group = groupFields(spec);

    if (group) {
        const items = Array.isArray(value) ? (value as FormModel[]) : [];
        const blank = () => toFormModel(group, {});
        return (
            <div className="space-y-2">
                {items.map((item, index) => (
                    <div key={index} className="space-y-3 rounded-md border bg-muted/20 p-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">
                                {spec.label.replace(/s$/, "")} {index + 1}
                            </span>
                            <div className="flex gap-0.5">
                                <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5" disabled={index === 0} onClick={() => onChange(moveBlock(items, index, index - 1))} aria-label="Move up">
                                    <ArrowUp className="size-3" />
                                </Button>
                                <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5" disabled={index === items.length - 1} onClick={() => onChange(moveBlock(items, index, index + 1))} aria-label="Move down">
                                    <ArrowDown className="size-3" />
                                </Button>
                                <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-danger hover:text-danger" onClick={() => onChange(items.filter((_, at) => at !== index))} aria-label="Remove">
                                    <Trash2 className="size-3" />
                                </Button>
                            </div>
                        </div>
                        {group.map((sub) => {
                            const subPath = `${path}.${index}.${sub.key}`;
                            return (
                                <FieldRow
                                    key={sub.key}
                                    spec={sub}
                                    path={subPath}
                                    value={item[sub.key]}
                                    error={showAll ? errors[subPath] : undefined}
                                    errors={errors}
                                    showAll={showAll}
                                    onChange={(next) => onChange(items.map((current, at) => (at === index ? { ...current, [sub.key]: next } : current)))}
                                />
                            );
                        })}
                    </div>
                ))}
                <Button type="button" variant="outline" size="sm" className="bg-card" disabled={spec.max !== undefined && items.length >= spec.max} onClick={() => onChange([...items, blank()])}>
                    <Plus className="mr-1 size-3.5" />
                    Add {spec.label.replace(/s$/, "").toLowerCase()}
                </Button>
                {spec.max !== undefined && <span className="ml-2 text-[11px] text-muted-foreground">{items.length} of at most {spec.max}</span>}
            </div>
        );
    }

    switch (spec.input) {
        case "text":
            return <Input id={id} value={text} onChange={(e) => onChange(e.target.value)} maxLength={spec.max} className={cn("h-9", invalid && "border-danger")} />;
        case "textarea":
            return <Textarea id={id} value={text} onChange={(e) => onChange(e.target.value)} maxLength={spec.max} rows={3} className={cn(invalid && "border-danger")} />;
        case "markdown":
            return <MarkdownField id={id} value={text} onChange={(next: string) => onChange(next)} rows={8} />;
        case "number":
            return <Input id={id} value={text} onChange={(e) => onChange(e.target.value)} inputMode="numeric" className={cn("h-9 w-32", invalid && "border-danger")} />;
        case "select":
            return (
                <Select value={text || NONE} onValueChange={(next) => onChange(next === NONE ? "" : next)}>
                    <SelectTrigger id={id} className={cn("h-9", invalid && "border-danger")}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {!spec.required && <SelectItem value={NONE}>Not set</SelectItem>}
                        {spec.required && !text && <SelectItem value={NONE}>Pick one</SelectItem>}
                        {(spec.options ?? []).map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            );
        case "multiselect":
            return (
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {(spec.options ?? []).map((option) => (
                        <label key={option.value} className="flex items-center gap-1.5 text-sm">
                            <Checkbox
                                checked={list.includes(option.value)}
                                onCheckedChange={(checked) => onChange(checked ? [...list, option.value] : list.filter((item) => item !== option.value))}
                            />
                            {option.label}
                        </label>
                    ))}
                </div>
            );
        case "media":
            return <MediaField value={text} onChange={onChange} spec={spec.spec} invalid={invalid} />;
        case "target":
            return <TargetField value={asTargetValue(value)} onChange={onChange} invalid={invalid} />;
        /* PB-1: the `form` block's key, and a call to action's label + target. */
        case "formKey":
            return <FormKeyField value={text} onChange={onChange} invalid={invalid} />;
        case "cta":
            return <CtaField id={id} value={asCtaValue(value)} onChange={onChange} invalid={invalid} max={spec.max} />;
        case "listingIds":
            return <ListingIdsField value={list} onChange={onChange} max={spec.max} />;
        case "slotKey":
            return <SlotKeyField value={text} onChange={onChange} invalid={invalid} />;
        case "contentSlug":
            return <ContentSlugField value={text} onChange={onChange} invalid={invalid} />;
        default:
            return (
                <div className="space-y-1">
                    <Textarea id={id} value={text} onChange={(e) => onChange(e.target.value)} rows={4} className={cn("font-mono text-xs", invalid && "border-danger")} />
                    {!isKnownInput(spec) && <p className="text-[11px] text-muted-foreground">This console has no form for “{spec.input}” yet — edit it as JSON.</p>}
                </div>
            );
    }
}
