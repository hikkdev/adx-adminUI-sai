"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CityCombobox } from "@/components/adx/city-combobox";
import { PinPicker } from "@/components/adx/pin-picker";
import { cn } from "@/lib/utils";
import type { FlowField } from "@/types";
import type { MediaType } from "@/types/pricing-engine";
import { CONTENT_RULES_FIELD, computedValue, isBlank, type CollectedDocument, type ContentRule, type FlowAnswers, type GeoPoint } from "./flow-model";
import { REPORT_DOCUMENTS } from "./listing-body";
import { UploadTile } from "./upload-tile";
import { groupedByFormat, offeredMaterials, offeredMediaTypes, offeredVenues, shortName, type FlowVocabularies } from "./vocabulary";

/**
 * FL-3 (27 Sep 2026): one renderer per field kind in the flow vocabulary,
 * with the console's own inputs — the web twin of both apps' `fields.tsx`.
 *
 * The flow names a kind and this decides what that looks like. Adding a
 * field to a screen on the board needs no change here as long as its kind
 * is one of the twenty-three; an unknown kind draws a plain box with a
 * note rather than nothing, so a console meeting a newer vocabulary still
 * shows something an operator can answer.
 */

/** Uploads a file and answers the URL the listing will carry. The purpose decides which folder it lands in. */
export type FieldUpload = (file: File, purpose: "LISTING_PHOTO" | "VERIFICATION") => Promise<string>;

export interface FieldContext {
    answers: FlowAnswers;
    set: (id: string, value: unknown) => void;
    vocab: FlowVocabularies;
    /** The branch the answers opened — what the taxonomy kinds filter by. */
    category: string | null;
    /** Left out (a preview, an offline console), the upload tiles are drawn and not tappable. */
    upload?: FieldUpload;
    /** Drawn under the base-price field when it asks for one. Supplied by the screen, not built here. */
    indicator?: React.ReactNode;
    /** Drawn under a paragraph the flow marks `aiAssist`. */
    assist?: React.ReactNode;
    /** The prefix of every control's id: `${idPrefix}-${field.id}`. */
    idPrefix: string;
    /** The phone frame: one column, smaller tiles. */
    compact?: boolean;
    disabled?: boolean;
}

/** The kinds that take the whole row on the desk; a field with a hint takes it too, so a row's cells stay the same height (the form symmetry policy). */
const WIDE_KINDS = new Set(["section", "textarea", "geo-point", "document-upload", "content-stance", "content-prohibited", "selectable-cards", "checkbox"]);

export function fieldSpan(field: FlowField): 1 | 2 {
    return WIDE_KINDS.has(field.type) || (field.hint && field.type !== "geo-point") ? 2 : 1;
}

const NONE = "__none__";
const NO_VENUE = "__no_venue__";

export function FlowFieldView({ field, ctx }: { field: FlowField; ctx: FieldContext }) {
    const id = `${ctx.idPrefix}-${field.id}`;
    const value = ctx.answers[field.id];
    const set = (next: unknown) => ctx.set(field.id, next);
    const text = typeof value === "string" ? value : "";

    switch (field.type) {
        case "selectable-cards":
            return (
                <Labelled id={id} field={field} bare>
                    <div className={cn("grid gap-2", ctx.compact ? "grid-cols-1" : "sm:grid-cols-2")} role="radiogroup" aria-labelledby={`${id}-label`}>
                        {(field.options ?? []).map((option) => {
                            const chosen = value === option.id;
                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={chosen}
                                    disabled={ctx.disabled}
                                    onClick={() => set(option.id)}
                                    className={cn(
                                        "rounded-lg border px-3.5 py-3 text-left transition-colors",
                                        chosen ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card hover:bg-muted/40",
                                    )}
                                    data-testid={`${id}-option-${option.id}`}
                                >
                                    <span className="block text-sm font-medium text-foreground">{option.title}</span>
                                    {option.description && <span className="mt-0.5 block text-xs text-muted-foreground">{option.description}</span>}
                                </button>
                            );
                        })}
                    </div>
                </Labelled>
            );

        case "venue-type": {
            const venues = offeredVenues(ctx.vocab.venues, field.filterByCategory ? ctx.category : null);
            const grouped = !field.filterByCategory || ctx.category === null;
            const items = [
                // A venue is not required on every branch — a hoarding stands on a road rather than inside anything. "No venue" is its own market, not a wildcard.
                ...(field.required ? [] : [{ label: "No venue — roadside or vehicle exterior", value: NO_VENUE }]),
                ...venues.map((venue) => ({ label: venue.name, value: venue.id, ...(grouped ? { group: venue.category } : {}) })),
            ];
            return (
                <Labelled id={id} field={field}>
                    <Combobox
                        id={id}
                        items={items}
                        value={typeof value === "string" ? value : field.required ? "" : NO_VENUE}
                        onValueChange={(next) => set(next && next !== NO_VENUE ? next : undefined)}
                        placeholder={field.placeholder ?? "Choose"}
                        searchPlaceholder="Search venues…"
                        emptyText={venues.length === 0 ? "No venues are set up for this category yet." : "Nothing matches."}
                        disabled={ctx.disabled}
                    />
                </Labelled>
            );
        }

        case "media-type": {
            const venueTypeId = (ctx.answers[field.dependsOn ?? "venue_type_id"] as string | undefined) ?? null;
            const offered = offeredMediaTypes(ctx.vocab.mediaTypes, venueTypeId, ctx.category);
            const groups = groupedByFormat(offered);
            return (
                <Labelled id={id} field={field}>
                    <Combobox
                        id={id}
                        items={offered.map((item) => ({
                            label: item.formatGroup ? shortName(item.name) : item.name,
                            value: item.id,
                            description: item.description ?? undefined,
                            ...(groups.length > 1 && item.formatGroup ? { group: item.formatGroup } : {}),
                        }))}
                        value={text}
                        onValueChange={(next) => set(next || undefined)}
                        placeholder={field.placeholder ?? "Choose"}
                        searchPlaceholder="Search this venue's spot types…"
                        emptyText="Nothing matches in this venue."
                        disabled={ctx.disabled}
                    />
                    {offered.length > 0 ? null : <p className="text-xs text-warning">No spot types are defined for this venue yet. Add some under Pricing → Media types.</p>}
                </Labelled>
            );
        }

        case "material": {
            const mediaTypeId = (ctx.answers[field.dependsOn ?? "media_type_id"] as string | undefined) ?? null;
            const mediaType = ctx.vocab.mediaTypes.find((item) => item.id === mediaTypeId) ?? null;
            const offered = offeredMaterials(ctx.vocab.materials, mediaType);
            return (
                <Labelled id={id} field={field}>
                    <Choice id={id} field={field} value={text} disabled={ctx.disabled} onChange={set} options={offered.map((material) => ({ id: material.id, title: material.name }))} placeholder="Choose" />
                </Labelled>
            );
        }

        case "sub-venue": {
            const venueTypeId = (ctx.answers[field.dependsOn ?? "venue_type_id"] as string | undefined) ?? null;
            const venue = ctx.vocab.venues.find((item) => item.id === venueTypeId);
            const areas = venue?.subVenues ?? [];
            // Free text when the venue has no named areas, because the alternative is a required field with nothing in it.
            if (areas.length === 0) {
                return (
                    <Labelled id={id} field={field}>
                        <Input id={id} value={text} placeholder={field.placeholder ?? "Reception / mirror wall"} disabled={ctx.disabled} onChange={(event) => set(event.target.value)} />
                    </Labelled>
                );
            }
            return (
                <Labelled id={id} field={field}>
                    <Choice id={id} field={field} value={text} disabled={ctx.disabled} onChange={set} options={areas.map((area) => ({ id: area, title: area }))} placeholder="Choose an area" />
                </Labelled>
            );
        }

        case "section":
            return <SectionHeading id={id} field={field} ctx={ctx} />;

        case "city":
            return (
                <Labelled id={id} field={field}>
                    <CityCombobox id={id} value={text} onChange={(city) => set(city)} stages={["LAUNCHED", "SEEDING"]} placeholder={field.placeholder ?? "Bengaluru"} disabled={ctx.disabled} />
                </Labelled>
            );

        case "document-upload":
            return <DocumentsField id={id} field={field} ctx={ctx} />;

        case "textarea":
            return (
                <Labelled id={id} field={field}>
                    <Textarea id={id} rows={ctx.compact ? 3 : 3} value={text} placeholder={field.placeholder} disabled={ctx.disabled} onChange={(event) => set(event.target.value)} />
                    {field.aiAssist ? ctx.assist : null}
                </Labelled>
            );

        case "number":
            return (
                <Labelled id={id} field={field}>
                    <Input id={id} inputMode="decimal" className="tabular-nums" value={text} placeholder={field.placeholder} disabled={ctx.disabled} onChange={(event) => set(event.target.value)} />
                </Labelled>
            );

        case "computed": {
            const computed = computedValue(field, ctx.answers);
            return (
                <div className="space-y-1.5" data-testid={`${id}-computed`}>
                    <Label id={`${id}-label`}>{field.label}</Label>
                    <p className={cn("flex h-9 items-center rounded-md bg-muted/50 px-3 text-sm tabular-nums", computed ? "font-medium text-foreground" : "text-muted-foreground")} aria-labelledby={`${id}-label`}>
                        {computed ? (field.op === "multiply" && field.from?.length === 2 ? `${computed} sq.ft` : computed) : "Enter the values above"}
                    </p>
                </div>
            );
        }

        case "geo-point":
            return <GeoPointField id={id} field={field} ctx={ctx} />;

        case "select":
            return (
                <Labelled id={id} field={field}>
                    <Choice id={id} field={field} value={text} disabled={ctx.disabled} onChange={set} options={field.options ?? []} placeholder={field.placeholder ?? "Choose"} />
                </Labelled>
            );

        case "base-price":
            return (
                <Labelled id={id} field={field}>
                    <Input id={id} inputMode="decimal" className="tabular-nums" value={text} placeholder={field.placeholder ?? "150"} disabled={ctx.disabled} onChange={(event) => set(event.target.value)} />
                    {field.showIndicator ? ctx.indicator : null}
                </Labelled>
            );

        case "date":
            return (
                <Labelled id={id} field={field}>
                    <Input id={id} type="date" value={text} disabled={ctx.disabled} onChange={(event) => set(event.target.value || undefined)} />
                </Labelled>
            );

        case "time-range": {
            const range = (value as { from?: string; to?: string } | undefined) ?? {};
            return (
                <div className="space-y-1.5">
                    <Label id={`${id}-label`}>{field.label}</Label>
                    <div className="grid grid-cols-2 gap-3">
                        <Input id={`${id}-from`} aria-label={`${field.label} — from`} value={range.from ?? ""} placeholder="10 AM" disabled={ctx.disabled} onChange={(event) => set({ ...range, from: event.target.value })} />
                        <Input id={`${id}-to`} aria-label={`${field.label} — until`} value={range.to ?? ""} placeholder="10 PM" disabled={ctx.disabled} onChange={(event) => set({ ...range, to: event.target.value })} />
                    </div>
                    {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
                </div>
            );
        }

        case "content-stance":
            return <RestrictedField id={id} field={field} ctx={ctx} />;

        case "content-prohibited":
            return <ProhibitedField id={id} field={field} ctx={ctx} />;

        case "image-upload":
        case "file-upload":
            return <UploadField id={id} field={field} ctx={ctx} />;

        case "checkbox":
            return (
                <label htmlFor={id} className={cn("flex items-start gap-3 rounded-md border bg-card px-3 py-2.5", ctx.disabled && "opacity-70")}>
                    <Checkbox id={id} className="mt-0.5" checked={value === true} disabled={ctx.disabled} onCheckedChange={(checked) => set(checked === true)} />
                    <span>
                        <span className="block text-sm font-medium text-foreground">{field.label}</span>
                        {field.description && <span className="block text-xs text-muted-foreground">{field.description}</span>}
                    </span>
                </label>
            );

        case "switch":
            return (
                <Labelled id={id} field={field} bare>
                    <Segmented
                        id={id}
                        options={[
                            { id: "yes", title: "Yes" },
                            { id: "no", title: "No" },
                        ]}
                        value={value === false ? "no" : "yes"}
                        disabled={ctx.disabled}
                        onChange={(next) => set(next === "yes")}
                    />
                </Labelled>
            );

        case "text":
            return (
                <Labelled id={id} field={field}>
                    <Input id={id} value={text} placeholder={field.placeholder} disabled={ctx.disabled} onChange={(event) => set(event.target.value)} />
                </Labelled>
            );

        default:
            // A console meeting a newer vocabulary. A text box keeps the form completable instead of a gap nobody can fill.
            return (
                <Labelled id={id} field={{ ...field, hint: `Shown as plain text — this console does not know the "${field.type}" field yet.` }}>
                    <Input id={id} value={text} disabled={ctx.disabled} onChange={(event) => set(event.target.value)} />
                </Labelled>
            );
    }
}

/* ── Shared pieces ──────────────────────────────────────────────────── */

/** A label over the control and the flow's hint under it. `bare` is for a control that is not one input — the label is a heading rather than a `for`. */
function Labelled({ id, field, bare = false, children }: { id: string; field: FlowField; bare?: boolean; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5" data-testid={`${id}-field`}>
            {bare ? <Label id={`${id}-label`}>{field.label}</Label> : <Label htmlFor={id}>{field.label}</Label>}
            {children}
            {field.hint && field.type !== "geo-point" ? <p className="text-xs text-muted-foreground">{field.hint}</p> : null}
        </div>
    );
}

/** A closed list as a Select; a field that is not required offers a way back to nothing. */
function Choice({
    id,
    field,
    value,
    options,
    placeholder,
    disabled,
    onChange,
}: {
    id: string;
    field: FlowField;
    value: string;
    options: { id: string; title: string; description?: string }[];
    placeholder: string;
    disabled?: boolean;
    onChange: (next: string | undefined) => void;
}) {
    const known = options.some((option) => option.id === value);
    return (
        <Select value={known ? value : ""} onValueChange={(next) => onChange(next === NONE ? undefined : next)} disabled={disabled}>
            <SelectTrigger id={id} aria-label={field.label}>
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                {!field.required && <SelectItem value={NONE}>—</SelectItem>}
                {options.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                        {option.title}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

/** The apps' Segmented control: one row of pills, one chosen. */
function Segmented({ id, options, value, disabled, onChange }: { id: string; options: { id: string; title: string }[]; value: string | null; disabled?: boolean; onChange: (next: string) => void }) {
    return (
        <div className="inline-flex rounded-md border bg-card p-0.5" role="radiogroup" aria-labelledby={`${id}-label`}>
            {options.map((option) => (
                <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={value === option.id}
                    disabled={disabled}
                    onClick={() => onChange(option.id)}
                    className={cn("rounded px-3 py-1 text-xs font-medium transition-colors", value === option.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                    {option.title}
                </button>
            ))}
        </div>
    );
}

/**
 * A heading inside a step, naming the group of fields under it. `from`
 * names an answer to print in its place — the spot type the operator
 * picked, so a group headed "Mirror decals" is the flow's doing.
 */
function SectionHeading({ id, field, ctx }: { id: string; field: FlowField; ctx: FieldContext }) {
    const source = field.from?.[0];
    const raw = source ? ctx.answers[source] : undefined;
    const named = typeof raw === "string" ? (ctx.vocab.mediaTypes.find((item) => item.id === raw)?.name ?? ctx.vocab.venues.find((item) => item.id === raw)?.name ?? raw) : undefined;
    return (
        <h4 className="pt-1 text-sm font-semibold text-foreground" data-testid={`${id}-section`}>
            {named ? shortName(named) : field.label}
        </h4>
    );
}

/* ── Documents & permits ────────────────────────────────────────────── */

function readDocuments(ctx: FieldContext, fieldId: string): CollectedDocument[] {
    const rows = ctx.answers[fieldId];
    return Array.isArray(rows) ? (rows as CollectedDocument[]) : [];
}

/**
 * Venue proof, one tile per kind of paper the flow names. Each file goes
 * up the moment it is chosen (purpose VERIFICATION — paperwork a reviewer
 * opens, not a listing photo) and its URL is held against its kind until
 * there is a listing to attach it to. Nothing here is required: the
 * server does not gate creation on documents either.
 */
function DocumentsField({ id, field, ctx }: { id: string; field: FlowField; ctx: FieldContext }) {
    const kinds = field.options ?? [];
    const rows = readDocuments(ctx, field.id);
    const [busyKind, setBusyKind] = React.useState<string | null>(null);
    const [problem, setProblem] = React.useState<string | null>(null);
    /* The set as it stands now, not as it stood when the upload began: two overlapping uploads must not erase each other. Synced after each commit, read only from the handlers. */
    const latest = React.useRef(rows);
    React.useEffect(() => {
        latest.current = rows;
    }, [rows]);

    const write = (kind: string, url: string | null) => {
        const rest = latest.current.filter((row) => row.kind !== kind);
        const next = url === null ? rest : [...rest, { kind, url }];
        latest.current = next;
        ctx.set(field.id, next);
    };

    async function choose(kind: string, file: File) {
        if (!ctx.upload) return;
        setBusyKind(kind);
        setProblem(null);
        try {
            write(kind, await ctx.upload(file, "VERIFICATION"));
        } catch (cause) {
            setProblem(cause instanceof Error ? cause.message : "Could not add that document.");
        } finally {
            setBusyKind(null);
        }
    }

    return (
        <div className="space-y-3" data-testid={`${id}-field`}>
            <div>
                <Label id={`${id}-label`}>{field.label}</Label>
                {field.hint && <p className="mt-1 text-xs text-muted-foreground">{field.hint}</p>}
            </div>
            <div className={cn("grid gap-3", ctx.compact ? "grid-cols-1" : "sm:grid-cols-2")}>
                {kinds.map((kind) => {
                    const url = rows.find((row) => row.kind === kind.id)?.url ?? null;
                    return (
                        <div key={kind.id} className="space-y-1.5">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{kind.title}</p>
                            <UploadTile
                                id={`${id}-${kind.id}`}
                                accept={[".pdf", "image/*"]}
                                url={url}
                                busy={busyKind === kind.id}
                                hint={kind.description}
                                compact={ctx.compact}
                                disabled={ctx.disabled}
                                onPick={ctx.upload ? (file) => void choose(kind.id, file) : undefined}
                                onClear={() => write(kind.id, null)}
                            />
                        </div>
                    );
                })}
            </div>
            {problem && (
                <p className="text-xs text-danger" role="alert">
                    {problem}
                </p>
            )}
        </div>
    );
}

/* ── The pin ────────────────────────────────────────────────────────── */

const toText = (point: GeoPoint | undefined): { latitude: string; longitude: string } => ({ latitude: point ? String(point.latitude) : "", longitude: point ? String(point.longitude) : "" });

const parse = (text: string): number | undefined => {
    const value = Number(text.trim());
    return text.trim() !== "" && Number.isFinite(value) ? value : undefined;
};

/**
 * The location pin, through the console's shared picker: the address
 * search, the map with one draggable marker, and the two coordinates
 * typed. The halves are held as text while they are being typed — a
 * point is only an answer once both parse, and a half-finished number
 * must not clear the field it is being typed into. A place picked fills
 * the flow's `address` answer and its `city` when that is still blank,
 * as the desk form always did.
 */
function GeoPointField({ id, field, ctx }: { id: string; field: FlowField; ctx: FieldContext }) {
    const point = ctx.answers[field.id] as GeoPoint | undefined;
    const [text, setText] = React.useState(() => toText(point));
    const [seen, setSeen] = React.useState(point);
    // The answer moved under the field — a place picked, a draft loaded — and the typed halves follow it, unless they already say the same.
    if (seen !== point) {
        setSeen(point);
        const same = point ? parse(text.latitude) === point.latitude && parse(text.longitude) === point.longitude : text.latitude.trim() === "" && text.longitude.trim() === "";
        if (!same) setText(toText(point));
    }

    const title = typeof ctx.answers.title === "string" && ctx.answers.title.trim() ? ctx.answers.title.trim() : "The spot";

    return (
        <div className="space-y-2" data-testid={`${id}-field`}>
            <PinPicker
                id={id}
                latitude={text.latitude}
                longitude={text.longitude}
                disabled={ctx.disabled}
                onChange={(next) => {
                    setText(next);
                    const latitude = parse(next.latitude);
                    const longitude = parse(next.longitude);
                    ctx.set(field.id, latitude !== undefined && longitude !== undefined ? { latitude, longitude } : undefined);
                }}
                onAddress={(place) => {
                    ctx.set("address", place.formattedAddress);
                    if (place.city && isBlank(ctx.answers.city)) ctx.set("city", place.city);
                }}
                title={title}
                labels={{ search: "Find the spot" }}
            />
            <p className="text-xs text-muted-foreground">{field.hint ?? "Drag the pin to the exact spot."} Comparables are found within 200 m and the radius never widens, so this needs to be the spot rather than the area.</p>
        </div>
    );
}

/* ── Content rules ──────────────────────────────────────────────────── */

function readRules(ctx: FieldContext): ContentRule[] {
    return (ctx.answers[CONTENT_RULES_FIELD] as ContentRule[] | undefined) ?? [];
}

function writeRule(ctx: FieldContext, contentCategoryId: string, stance: string | null) {
    const rest = readRules(ctx).filter((rule) => rule.contentCategoryId !== contentCategoryId);
    ctx.set(CONTENT_RULES_FIELD, stance === null ? rest : [...rest, { contentCategoryId, stance }]);
}

/** "No", "With approval" or "Yes" — the categories an owner can say yes to. */
function RestrictedField({ id, field, ctx }: { id: string; field: FlowField; ctx: FieldContext }) {
    const rules = readRules(ctx);
    const categories = ctx.vocab.contentCategories.filter((category) => !category.isSensitive);
    return (
        <div className="space-y-2" data-testid={`${id}-field`}>
            <Label id={`${id}-label`}>{field.label}</Label>
            {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
            {categories.length === 0 && <p className="text-xs text-muted-foreground">No content categories are set up yet.</p>}
            <ul className="divide-y rounded-md border bg-card">
                {categories.map((category) => {
                    const stance = rules.find((rule) => rule.contentCategoryId === category.id)?.stance ?? null;
                    return (
                        <li key={category.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                            <span className="text-sm text-foreground" id={`${id}-${category.id}-label`}>
                                {category.name}
                            </span>
                            <Segmented
                                id={`${id}-${category.id}`}
                                options={[
                                    { id: "NOT_ALLOWED", title: "No" },
                                    { id: "REQUIRES_APPROVAL", title: "With approval" },
                                    { id: "ALLOWED", title: "Yes" },
                                ]}
                                value={stance}
                                disabled={ctx.disabled}
                                onChange={(next) => writeRule(ctx, category.id, next)}
                            />
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/** Never, on this venue. Checkboxes, because there is no middle answer. */
function ProhibitedField({ id, field, ctx }: { id: string; field: FlowField; ctx: FieldContext }) {
    const rules = readRules(ctx);
    const categories = ctx.vocab.contentCategories.filter((category) => category.isSensitive);
    return (
        <div className="space-y-2" data-testid={`${id}-field`}>
            <Label id={`${id}-label`}>{field.label}</Label>
            {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
            {categories.length === 0 && <p className="text-xs text-muted-foreground">No sensitive categories are set up yet.</p>}
            <ul className="divide-y rounded-md border bg-card">
                {categories.map((category) => {
                    const on = rules.find((rule) => rule.contentCategoryId === category.id)?.stance === "PROHIBITED";
                    return (
                        <li key={category.id}>
                            <label htmlFor={`${id}-${category.id}`} className="flex items-center gap-3 px-3 py-2 text-sm text-foreground">
                                <Checkbox id={`${id}-${category.id}`} checked={on} disabled={ctx.disabled} onCheckedChange={(checked) => writeRule(ctx, category.id, checked === true ? "PROHIBITED" : null)} />
                                {category.name}
                            </label>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/* ── Uploads ────────────────────────────────────────────────────────── */

/**
 * ST-2 (28 Sep 2026): the audience screen's two reports — the BARC / TAM
 * sheet and the footfall audit — are paperwork a reviewer opens, filed as
 * listing documents, so they go up as VERIFICATION (a private purpose) the
 * way the venue proofs do and the phones and the website send them. Every
 * other upload on the flow is a listing photo, public.
 */
const REPORT_FIELD_IDS: ReadonlySet<string> = new Set(REPORT_DOCUMENTS.map(([fieldId]) => fieldId));

/** The purpose an upload field's file goes up under. Exported for the test that pins it. */
export const uploadPurposeOf = (fieldId: string): "LISTING_PHOTO" | "VERIFICATION" => (REPORT_FIELD_IDS.has(fieldId) ? "VERIFICATION" : "LISTING_PHOTO");

function UploadField({ id, field, ctx }: { id: string; field: FlowField; ctx: FieldContext }) {
    const url = typeof ctx.answers[field.id] === "string" ? (ctx.answers[field.id] as string) : null;
    const [busy, setBusy] = React.useState(false);
    const [problem, setProblem] = React.useState<string | null>(null);
    const image = field.type === "image-upload";

    async function choose(file: File) {
        if (!ctx.upload) return;
        setBusy(true);
        setProblem(null);
        try {
            ctx.set(field.id, await ctx.upload(file, uploadPurposeOf(field.id)));
        } catch (cause) {
            setProblem(cause instanceof Error ? cause.message : image ? "Could not add that photo." : "Could not add that file.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-1.5" data-testid={`${id}-field`}>
            <Label id={`${id}-label`}>{field.label}</Label>
            <UploadTile
                id={id}
                accept={image ? ["image/*"] : [".pdf", "image/*"]}
                url={url}
                busy={busy}
                hint={field.hint ?? (image ? "JPEG or PNG" : "PDF or image")}
                compact={ctx.compact}
                disabled={ctx.disabled}
                onPick={ctx.upload ? (file) => void choose(file) : undefined}
                onClear={() => ctx.set(field.id, undefined)}
            />
            {problem && (
                <p className="text-xs text-danger" role="alert">
                    {problem}
                </p>
            )}
        </div>
    );
}

/** The spot type chosen, when the answers name one — what the screens read for the category and the price line. */
export function chosenMediaType(answers: FlowAnswers, mediaTypes: MediaType[], fieldId = "media_type_id"): MediaType | null {
    const id = answers[fieldId];
    return typeof id === "string" ? (mediaTypes.find((item) => item.id === id) ?? null) : null;
}
