import { api as http } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";
import type { StatusMeta } from "@/types";
import { CITY_STAGES, type CityStage } from "./geo";

/**
 * LM-1 (27 Sep 2026): layouts — what each screen draws, in what order, for
 * whom and when. A surface's layout is a list of blocks; the desk edits one
 * draft per surface, previews it resolved for a side and a city, publishes it
 * (the live one retires) and can restore any earlier version as a new one.
 *
 * The block vocabulary is the backend's: `GET /layouts/block-types` names
 * every type, the surfaces it may sit on and the fields its props take
 * (`FieldSpec`), and the editor draws its forms from that — so a new block
 * type is a backend change, not a console one. Clients skip types they do
 * not know and fall back to their baked order when nothing is published.
 */

export const LAYOUT_SURFACES = [
    "WEB_HOME",
    "WEB_EXPLORE",
    "WEB_FORMATS",
    "WEB_LISTING",
    /* PB-3 (27 Sep 2026): the rest of the website's own pages, sections in Studio. */
    "WEB_CATEGORIES",
    "WEB_HOW_IT_WORKS",
    "WEB_ADVERTISE",
    "WEB_PUBLISHERS",
    "WEB_HELP",
    "APP_ADVERTISER_HOME",
    "APP_PUBLISHER_HOME",
    "APP_PARTNER_HOME",
    "AGENT_HOME",
] as const;
export type LayoutSurface = (typeof LAYOUT_SURFACES)[number];

/** The backend's `SURFACE_LABEL` (renamed 27 Sep 2026: "Formats" is the website's Advertising formats page). */
export const LAYOUT_SURFACE_LABEL: Record<LayoutSurface, string> = {
    WEB_HOME: "Website — Home page",
    WEB_EXPLORE: "Website — Explore page",
    WEB_FORMATS: "Website — Advertising formats page",
    WEB_LISTING: "Website — Listing page",
    WEB_CATEGORIES: "Website — All categories page",
    WEB_HOW_IT_WORKS: "Website — How it works page",
    WEB_ADVERTISE: "Website — Advertise with ADX page",
    WEB_PUBLISHERS: "Website — For publishers page",
    WEB_HELP: "Website — Help page",
    APP_ADVERTISER_HOME: "User app — Advertiser home",
    APP_PUBLISHER_HOME: "User app — Publisher home",
    APP_PARTNER_HOME: "User app — Print partner home",
    AGENT_HOME: "Agent app — Home",
};

/** Which client draws the surface — the preview frames it accordingly. */
export const SURFACE_CLIENT: Record<LayoutSurface, "WEB" | "APP"> = {
    WEB_HOME: "WEB",
    WEB_EXPLORE: "WEB",
    WEB_FORMATS: "WEB",
    WEB_LISTING: "WEB",
    WEB_CATEGORIES: "WEB",
    WEB_HOW_IT_WORKS: "WEB",
    WEB_ADVERTISE: "WEB",
    WEB_PUBLISHERS: "WEB",
    WEB_HELP: "WEB",
    APP_ADVERTISER_HOME: "APP",
    APP_PUBLISHER_HOME: "APP",
    APP_PARTNER_HOME: "APP",
    AGENT_HOME: "APP",
};

export const isLayoutSurface = (value: string): value is LayoutSurface => (LAYOUT_SURFACES as readonly string[]).includes(value);

/** PB-3: the website's surfaces — the pages Studio lays out on the web; the rest are app homes the builder here keeps. */
export const WEB_SURFACES: readonly LayoutSurface[] = LAYOUT_SURFACES.filter((surface) => SURFACE_CLIENT[surface] === "WEB");
export const isWebSurface = (surface: LayoutSurface): boolean => SURFACE_CLIENT[surface] === "WEB";

export const LAYOUT_SIDES = ["VISITOR", "ADVERTISER", "PUBLISHER", "PARTNER", "AGENT_FIELD", "AGENT_SALES"] as const;
export type LayoutSide = (typeof LAYOUT_SIDES)[number];

export const SIDE_LABEL: Record<LayoutSide, string> = {
    VISITOR: "Visitor (signed out)",
    ADVERTISER: "Advertiser",
    PUBLISHER: "Publisher",
    PARTNER: "Print partner",
    AGENT_FIELD: "Field agent",
    AGENT_SALES: "Sales agent",
};

/** The sides that can ever see a surface — the preview's side chooser offers these. */
export const SURFACE_SIDES: Record<LayoutSurface, readonly LayoutSide[]> = {
    WEB_HOME: ["VISITOR", "ADVERTISER", "PUBLISHER"],
    WEB_EXPLORE: ["VISITOR", "ADVERTISER", "PUBLISHER"],
    WEB_FORMATS: ["VISITOR", "ADVERTISER", "PUBLISHER"],
    WEB_LISTING: ["VISITOR", "ADVERTISER", "PUBLISHER"],
    WEB_CATEGORIES: ["VISITOR", "ADVERTISER", "PUBLISHER"],
    WEB_HOW_IT_WORKS: ["VISITOR", "ADVERTISER", "PUBLISHER"],
    WEB_ADVERTISE: ["VISITOR", "ADVERTISER", "PUBLISHER"],
    WEB_PUBLISHERS: ["VISITOR", "ADVERTISER", "PUBLISHER"],
    WEB_HELP: ["VISITOR", "ADVERTISER", "PUBLISHER"],
    APP_ADVERTISER_HOME: ["ADVERTISER"],
    APP_PUBLISHER_HOME: ["PUBLISHER"],
    APP_PARTNER_HOME: ["PARTNER"],
    AGENT_HOME: ["AGENT_FIELD", "AGENT_SALES"],
};

export type LayoutVersionStatus = "DRAFT" | "PUBLISHED" | "RETIRED";

export const LAYOUT_VERSION_STATUS_META: Record<LayoutVersionStatus, StatusMeta> = {
    DRAFT: { label: "Draft", tone: "warning" },
    PUBLISHED: { label: "Live", tone: "success" },
    RETIRED: { label: "Retired", tone: "neutral" },
};

/** PB-1: `PAGE` names a Studio page by its key — the website resolves it to the page's current address, the apps open the Page screen. */
export const TARGET_KINDS = ["ROUTE", "URL", "LISTING", "CATEGORY", "VENUE", "CONTENT", "NEW_CAMPAIGN", "EXPLORE", "PAGE"] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

export const TARGET_KIND_META: Record<TargetKind, { label: string; needsValue: boolean; placeholder: string }> = {
    ROUTE: { label: "Website path", needsValue: true, placeholder: "/spaces?category=BILLBOARD" },
    URL: { label: "Web address", needsValue: true, placeholder: "https://…" },
    LISTING: { label: "A listing", needsValue: true, placeholder: "Listing id" },
    CATEGORY: { label: "A category", needsValue: true, placeholder: "BILLBOARD" },
    VENUE: { label: "A venue type", needsValue: true, placeholder: "Venue type id" },
    CONTENT: { label: "An article", needsValue: true, placeholder: "how-it-works" },
    NEW_CAMPAIGN: { label: "Start a campaign", needsValue: false, placeholder: "" },
    EXPLORE: { label: "Explore", needsValue: false, placeholder: "" },
    PAGE: { label: "A page", needsValue: true, placeholder: "Page key" },
};

export interface LayoutTarget {
    kind: TargetKind;
    value?: string;
}

export interface BlockVisibility {
    sides?: LayoutSide[];
    cityIds?: string[];
    stages?: CityStage[];
}

export interface BlockSchedule {
    startsAt?: string;
    endsAt?: string;
}

export interface LayoutBlock {
    /** Stable across versions — a moved block is the same block. */
    id: string;
    type: string;
    props: Record<string, unknown>;
    visibility?: BlockVisibility;
    schedule?: BlockSchedule;
    hidden?: boolean;
}

export type FieldInput =
    | "text"
    | "textarea"
    | "markdown"
    | "media"
    | "target"
    | "select"
    | "multiselect"
    | "number"
    | "listingIds"
    | "slotKey"
    | "contentSlug"
    /** PB-1: a form's key, picked from the forms desk — the `form` block. */
    | "formKey"
    /** PB-1: a call to action — a label and where it opens (`hero`, `cta_strip`). */
    | "cta"
    /** A repeated group (`tile_grid`'s tiles): `of` describes one item, `min`/`max` bound the count. */
    | "list";

/** One prop of a block type, as the backend describes it. `input` may name one this console does not know; that field is edited as JSON. */
export interface FieldSpec {
    key: string;
    label: string;
    input: FieldInput | (string & {});
    required?: boolean;
    options?: { value: string; label: string }[];
    min?: number;
    max?: number;
    /** A media size spec key (`PROMO_WIDE`) the picked image must meet. */
    spec?: string;
    /** One line of guidance the form shows under the label. */
    hint?: string;
    /** For a `list` field: the fields of one item. */
    of?: FieldSpec[];
}

export interface BlockTypeDef {
    type: string;
    label: string;
    kind: "SYSTEM" | "CONTENT";
    surfaces: LayoutSurface[];
    props: FieldSpec[];
    description?: string;
    /** `results` on Explore: always last, never hidden. */
    pinned?: boolean;
}

export interface LayoutSummary {
    surface: LayoutSurface;
    label: string;
    live: { number: number; publishedAt: string | null } | null;
    draft: { number: number; updatedAt: string } | null;
}

export interface LayoutPerson {
    id: string;
    name?: string | null;
    email?: string | null;
}

export interface LayoutVersionView {
    id: string;
    number: number;
    status: LayoutVersionStatus;
    blocks: LayoutBlock[];
    changeNote: string | null;
    createdAt: string;
    publishedAt: string | null;
    publishedBy?: LayoutPerson | string | null;
    updatedAt?: string;
    retiredAt?: string | null;
}

export interface LayoutDetail {
    surface: LayoutSurface;
    label?: string;
    live: LayoutVersionView | null;
    draft: LayoutVersionView | null;
    defaults: LayoutBlock[];
}

export interface ResolvedMedia {
    url: string;
    width: number | null;
    height: number | null;
    altText: string | null;
}

export interface ResolvedAd {
    adBookingId: string;
    displayId: string | null;
    media: ResolvedMedia | null;
    headline: string | null;
    ctaLabel: string | null;
    targetUrl: string | null;
}

/** A block after visibility, schedule and `hidden`, with its media, query, markdown or ads resolved. */
export interface ResolvedBlock {
    id: string;
    type: string;
    props: Record<string, unknown>;
    query?: Record<string, unknown>;
    markdown?: string;
    slot?: { key: string; label: string; spec: string };
    ads?: ResolvedAd[];
}

export interface ResolvedLayout {
    surface: LayoutSurface;
    version: number;
    isDefault: boolean;
    blocks: ResolvedBlock[];
}

/* ------------------------------------------------------------------ */
/* Pure helpers — the list                                             */
/* ------------------------------------------------------------------ */

/** A copy of the list with the item at `from` moved to `to` (clamped). */
export function moveBlock<T>(list: readonly T[], from: number, to: number): T[] {
    const next = [...list];
    if (from < 0 || from >= next.length) return next;
    const target = Math.max(0, Math.min(next.length - 1, to));
    const [item] = next.splice(from, 1);
    next.splice(target, 0, item as T);
    return next;
}

/** One step up (-1) or down (+1) by id, the keyboard's reorder. Pinned blocks (and the step past them) do not move. */
export function nudgeBlock(list: readonly LayoutBlock[], id: string, delta: -1 | 1, pinnedTypes: readonly string[] = []): LayoutBlock[] {
    const from = list.findIndex((block) => block.id === id);
    if (from < 0) return [...list];
    const to = from + delta;
    if (to < 0 || to >= list.length) return [...list];
    if (pinnedTypes.includes(list[from]!.type) || pinnedTypes.includes(list[to]!.type)) return [...list];
    return moveBlock(list, from, to);
}

/** Pinned blocks (Explore's `results`) back at the end, in their order. */
export function keepPinnedLast(list: readonly LayoutBlock[], pinnedTypes: readonly string[]): LayoutBlock[] {
    if (pinnedTypes.length === 0) return [...list];
    return [...list.filter((block) => !pinnedTypes.includes(block.type)), ...list.filter((block) => pinnedTypes.includes(block.type))];
}

/** A fresh id for a new block — the browser's UUID, or a random fallback in a test runner without one. */
export function newBlockId(): string {
    const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (cryptoRef?.randomUUID) return cryptoRef.randomUUID();
    return `blk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** The props a fresh block of this type starts with: required selects take their first option, a required number its minimum. */
export function defaultProps(specs: readonly FieldSpec[]): Record<string, unknown> {
    const props: Record<string, unknown> = {};
    for (const spec of specs) {
        if (!spec.required) continue;
        if (spec.input === "select" && spec.options?.[0]) props[spec.key] = spec.options[0].value;
        if (spec.input === "number") props[spec.key] = spec.min ?? 1;
        if (spec.input === "target") props[spec.key] = { kind: "EXPLORE" };
    }
    return props;
}

export function newBlock(def: Pick<BlockTypeDef, "type" | "props">, id = newBlockId()): LayoutBlock {
    return { id, type: def.type, props: defaultProps(def.props) };
}

/** The same block again under a new id, placed right after the original. */
export function duplicateBlock(list: readonly LayoutBlock[], id: string, newId = newBlockId()): LayoutBlock[] {
    const index = list.findIndex((block) => block.id === id);
    if (index < 0) return [...list];
    const copy = JSON.parse(JSON.stringify(list[index])) as LayoutBlock;
    copy.id = newId;
    const next = [...list];
    next.splice(index + 1, 0, copy);
    return next;
}

/** A canonical JSON of a block list — key order does not make a list dirty. */
function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>).sort()) {
            const item = (value as Record<string, unknown>)[key];
            if (item === undefined) continue;
            out[key] = canonical(item);
        }
        return out;
    }
    return value;
}

/** True when the two lists would save the same. */
export function sameBlocks(a: readonly LayoutBlock[], b: readonly LayoutBlock[]): boolean {
    return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** Empty visibility and schedule removed, so the saved block carries only what narrows it. */
export function cleanBlock(block: LayoutBlock): LayoutBlock {
    const out: LayoutBlock = { id: block.id, type: block.type, props: block.props };
    const v = block.visibility;
    if (v && ((v.sides?.length ?? 0) > 0 || (v.cityIds?.length ?? 0) > 0 || (v.stages?.length ?? 0) > 0)) {
        out.visibility = {};
        if (v.sides?.length) out.visibility.sides = v.sides;
        if (v.cityIds?.length) out.visibility.cityIds = v.cityIds;
        if (v.stages?.length) out.visibility.stages = v.stages;
    }
    const s = block.schedule;
    if (s && (s.startsAt || s.endsAt)) {
        out.schedule = {};
        if (s.startsAt) out.schedule.startsAt = s.startsAt;
        if (s.endsAt) out.schedule.endsAt = s.endsAt;
    }
    if (block.hidden) out.hidden = true;
    return out;
}

/** "Advertisers · 3 cities · from 1 Oct" — who and when, in a line; null when the block shows to everyone always. */
export function audienceLine(block: LayoutBlock): string | null {
    const parts: string[] = [];
    const v = block.visibility;
    if (v?.sides?.length) parts.push(v.sides.map((side) => SIDE_LABEL[side] ?? side).join(", "));
    if (v?.cityIds?.length) parts.push(`${v.cityIds.length} ${v.cityIds.length === 1 ? "city" : "cities"}`);
    if (v?.stages?.length) parts.push(`${v.stages.map((stage) => stage.toLowerCase()).join("/")} cities`);
    const s = block.schedule;
    const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    if (s?.startsAt && s.endsAt) parts.push(`${day(s.startsAt)} – ${day(s.endsAt)}`);
    else if (s?.startsAt) parts.push(`from ${day(s.startsAt)}`);
    else if (s?.endsAt) parts.push(`until ${day(s.endsAt)}`);
    return parts.length ? parts.join(" · ") : null;
}

/** What the schedule and visibility editor refuses before the server does. */
export function blockRuleProblems(block: LayoutBlock): string[] {
    const problems: string[] = [];
    const s = block.schedule;
    if (s?.startsAt && Number.isNaN(Date.parse(s.startsAt))) problems.push("The start is not a date.");
    if (s?.endsAt && Number.isNaN(Date.parse(s.endsAt))) problems.push("The end is not a date.");
    if (s?.startsAt && s.endsAt && Date.parse(s.endsAt) <= Date.parse(s.startsAt)) problems.push("The block would stop before it starts.");
    const stages = block.visibility?.stages ?? [];
    if (stages.some((stage) => !(CITY_STAGES as readonly string[]).includes(stage))) problems.push("An unknown city stage.");
    return problems;
}

/** The block types this surface may hold, system first then content, each alphabetically. */
export function typesForSurface(types: readonly BlockTypeDef[], surface: LayoutSurface): BlockTypeDef[] {
    return types
        .filter((def) => def.surfaces.includes(surface))
        .sort((a, b) => (a.kind === b.kind ? a.label.localeCompare(b.label) : a.kind === "SYSTEM" ? -1 : 1));
}

/** Blocks that close their surface: always last, never hidden, never targeted away. */
export const PINNED_LAST: Partial<Record<LayoutSurface, readonly string[]>> = { WEB_EXPLORE: ["results"] };
export const pinnedFor = (surface: LayoutSurface): readonly string[] => PINNED_LAST[surface] ?? [];

/** Whether another block of this type may go on: a system block sits on its surface once. */
export function canAdd(def: Pick<BlockTypeDef, "type" | "kind">, blocks: readonly LayoutBlock[]): boolean {
    return def.kind !== "SYSTEM" || !blocks.some((block) => block.type === def.type);
}

/** One problem the server named on a block — `{ index, blockId, type, path, message }` in a 400's details. */
export interface BlockIssue {
    index: number;
    blockId: string | null;
    type: string | null;
    path: string;
    message: string;
}

/** A 400's issues, by block id (or `#index` when the block had none); the list-wide ones under "". */
export function issuesByBlock(details: unknown): Map<string, BlockIssue[]> {
    const raw = (details as { issues?: unknown } | null | undefined)?.issues;
    const map = new Map<string, BlockIssue[]>();
    if (!Array.isArray(raw)) return map;
    for (const item of raw as Partial<BlockIssue>[]) {
        if (!item || typeof item.message !== "string") continue;
        const key = item.blockId ? item.blockId : typeof item.index === "number" && item.index >= 0 ? `#${item.index}` : "";
        const issue: BlockIssue = { index: item.index ?? -1, blockId: item.blockId ?? null, type: item.type ?? null, path: item.path ?? "", message: item.message };
        map.set(key, [...(map.get(key) ?? []), issue]);
    }
    return map;
}

/** The name the preview and the list print for a publisher — a string, a person, or nobody. */
export function personName(person: LayoutVersionView["publishedBy"]): string | null {
    if (!person) return null;
    if (typeof person === "string") return person;
    return person.name ?? person.email ?? null;
}

/* ------------------------------------------------------------------ */
/* Pure helpers — FieldSpec → form model and back                      */
/* ------------------------------------------------------------------ */

/** A target as the form edits it: the kind, and the value where the kind needs one. */
export type TargetValue = { kind: TargetKind | ""; value: string };
/** PB-1: a call to action as the form edits it — its label and where it opens. */
export type CtaValue = { label: string; target: TargetValue };
export type FormValue = string | string[] | TargetValue | CtaValue | FormModel[];
export type FormModel = Record<string, FormValue>;

const KNOWN_INPUTS: readonly string[] = ["text", "textarea", "markdown", "media", "target", "select", "multiselect", "number", "listingIds", "slotKey", "contentSlug", "formKey", "cta"];

/** A form value read as a target, whatever shape it arrived in. */
export const asTargetValue = (value: unknown): TargetValue => {
    const target = (value ?? {}) as Partial<LayoutTarget>;
    const kind = (TARGET_KINDS as readonly string[]).includes(target.kind ?? "") ? (target.kind as TargetKind) : "";
    return { kind, value: typeof target.value === "string" ? target.value : "" };
};

/** A form value read as a call to action. */
export const asCtaValue = (value: unknown): CtaValue => {
    const cta = (value ?? {}) as Partial<{ label: unknown; target: unknown }>;
    return { label: typeof cta.label === "string" ? cta.label : "", target: asTargetValue(cta.target) };
};

/** A target value back to the prop, or undefined when no kind is picked. */
function targetProp(target: TargetValue | undefined): LayoutTarget | undefined {
    if (!target?.kind) return undefined;
    const trimmed = target.value.trim();
    return trimmed && TARGET_KIND_META[target.kind].needsValue ? { kind: target.kind, value: trimmed } : { kind: target.kind };
}

/** The item fields of a repeated group, or null when the field is not one. */
export const groupFields = (spec: FieldSpec): FieldSpec[] | null => (Array.isArray(spec.of) ? spec.of : null);

/** An input this console draws with its own control; anything else is JSON. */
export const isKnownInput = (spec: FieldSpec): boolean => KNOWN_INPUTS.includes(spec.input) || groupFields(spec) !== null;

const asString = (value: unknown): string => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");
const asStrings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

/** One field's value as the form edits it. */
function toFormValue(spec: FieldSpec, value: unknown): FormValue {
    const group = groupFields(spec);
    if (group) {
        const items = Array.isArray(value) ? value : [];
        return items.map((item) => toFormModel(group, (item ?? {}) as Record<string, unknown>));
    }
    switch (spec.input) {
        case "multiselect":
        case "listingIds":
            return asStrings(value);
        case "target":
            return asTargetValue(value);
        case "cta":
            return asCtaValue(value);
        case "text":
        case "textarea":
        case "markdown":
        case "media":
        case "select":
        case "number":
        case "slotKey":
        case "contentSlug":
        case "formKey":
            return asString(value);
        default:
            return value === undefined ? "" : JSON.stringify(value, null, 2);
    }
}

/** The props as the form edits them, one value per spec. */
export function toFormModel(specs: readonly FieldSpec[], props: Record<string, unknown>): FormModel {
    const model: FormModel = {};
    for (const spec of specs) model[spec.key] = toFormValue(spec, props[spec.key]);
    return model;
}

/** One form value back to a prop, or `undefined` when it is empty (the prop is then left out). */
function fromFormValue(spec: FieldSpec, value: FormValue | undefined): unknown {
    const group = groupFields(spec);
    if (group) {
        const items = Array.isArray(value) ? (value as FormModel[]) : [];
        return items.length ? items.map((item) => fromFormModel(group, item)) : undefined;
    }
    switch (spec.input) {
        case "multiselect":
        case "listingIds": {
            const list = asStrings(value).map((item) => item.trim()).filter(Boolean);
            return list.length ? list : undefined;
        }
        case "target":
            return targetProp(value as TargetValue | undefined);
        case "cta": {
            const cta = value as CtaValue | undefined;
            const label = cta?.label.trim() ?? "";
            const target = targetProp(cta?.target);
            if (!label && !target) return undefined;
            return { ...(label ? { label } : {}), ...(target ? { target } : {}) };
        }
        case "number": {
            const text = asString(value).trim();
            return text === "" ? undefined : Number(text);
        }
        case "text":
        case "textarea":
        case "markdown":
        case "media":
        case "select":
        case "slotKey":
        case "contentSlug":
        case "formKey": {
            const text = typeof value === "string" ? (spec.input === "markdown" || spec.input === "textarea" ? value : value.trim()) : "";
            return text.trim() === "" ? undefined : text;
        }
        default: {
            const text = asString(value).trim();
            if (text === "") return undefined;
            try {
                return JSON.parse(text);
            } catch {
                return undefined;
            }
        }
    }
}

/**
 * The form back into props. `base` carries the props this form does not
 * edit (a key the spec list lacks, say), so saving never drops them.
 */
export function fromFormModel(specs: readonly FieldSpec[], model: FormModel, base: Record<string, unknown> = {}): Record<string, unknown> {
    const props: Record<string, unknown> = {};
    const edited = new Set(specs.map((spec) => spec.key));
    for (const [key, value] of Object.entries(base)) if (!edited.has(key)) props[key] = value;
    for (const spec of specs) {
        const value = fromFormValue(spec, model[spec.key]);
        if (value !== undefined) props[spec.key] = value;
    }
    return props;
}

/** Why a field cannot be saved as it stands, or nothing. Nested groups report as `tiles.2.label`. */
export function formProblems(specs: readonly FieldSpec[], model: FormModel, prefix = ""): Record<string, string> {
    const problems: Record<string, string> = {};
    for (const spec of specs) {
        const path = `${prefix}${spec.key}`;
        const raw = model[spec.key];
        const group = groupFields(spec);
        if (group) {
            const items = Array.isArray(raw) ? (raw as FormModel[]) : [];
            if (spec.required && items.length === 0) problems[path] = "Add at least one.";
            else if (spec.min !== undefined && items.length < spec.min) problems[path] = `At least ${spec.min}.`;
            else if (spec.max !== undefined && items.length > spec.max) problems[path] = `At most ${spec.max}.`;
            items.forEach((item, index) => Object.assign(problems, formProblems(group, item, `${path}.${index}.`)));
            continue;
        }
        const value = fromFormValue(spec, raw);
        if (spec.input === "number") {
            const text = asString(raw).trim();
            if (text !== "" && !Number.isFinite(Number(text))) {
                problems[path] = "A number.";
                continue;
            }
        }
        if (spec.input === "target") {
            const target = raw as TargetValue | undefined;
            if (target?.kind && TARGET_KIND_META[target.kind].needsValue && !target.value.trim()) {
                problems[path] = `Name the ${TARGET_KIND_META[target.kind].label.toLowerCase()}.`;
                continue;
            }
        }
        if (spec.input === "cta") {
            const cta = raw as CtaValue | undefined;
            const label = cta?.label.trim() ?? "";
            const kind = cta?.target.kind ?? "";
            if (label.length > (spec.max ?? 40)) {
                problems[path] = `At most ${spec.max ?? 40} characters.`;
                continue;
            }
            if (label && !kind) {
                problems[path] = "Say where the button opens.";
                continue;
            }
            if (!label && kind) {
                problems[path] = "Give the button a label.";
                continue;
            }
            if (kind && TARGET_KIND_META[kind].needsValue && !cta?.target.value.trim()) {
                problems[path] = `Name the ${TARGET_KIND_META[kind].label.toLowerCase()}.`;
                continue;
            }
        }
        if (!isKnownInput(spec) && asString(raw).trim() !== "" && value === undefined) {
            problems[path] = "Not valid JSON.";
            continue;
        }
        if (value === undefined) {
            if (spec.required) problems[path] = "Required.";
            continue;
        }
        if (spec.input === "number" && typeof value === "number") {
            if (spec.min !== undefined && value < spec.min) problems[path] = `At least ${spec.min}.`;
            else if (spec.max !== undefined && value > spec.max) problems[path] = `At most ${spec.max}.`;
        } else if (Array.isArray(value)) {
            if (spec.min !== undefined && value.length < spec.min) problems[path] = `Pick at least ${spec.min}.`;
            else if (spec.max !== undefined && value.length > spec.max) problems[path] = `At most ${spec.max}.`;
        } else if (typeof value === "string" && (spec.input === "text" || spec.input === "textarea")) {
            if (spec.max !== undefined && value.length > spec.max) problems[path] = `At most ${spec.max} characters.`;
        }
    }
    return problems;
}

/**
 * Cross-field rules the specs cannot say: `rich_text` takes markdown OR a
 * content page (one of the two), `listing_rail`'s CURATED source needs its
 * listings and every other named source its value.
 */
export function typeRuleProblems(type: string, props: Record<string, unknown>): string[] {
    if (type === "rich_text") {
        const markdown = typeof props.markdown === "string" && props.markdown.trim() !== "";
        const slug = typeof props.contentSlug === "string" && props.contentSlug.trim() !== "";
        if (markdown === slug) return ["Write the text here or pick a content page — one of the two."];
    }
    if (type === "listing_rail") {
        const source = props.source;
        if (source === "CURATED" && asStrings(props.listingIds).length === 0) return ["A curated rail needs its listings."];
        if ((source === "CATEGORY" || source === "VENUE" || source === "PUBLISHER") && !asString(props.value).trim()) {
            return [`A ${String(source).toLowerCase()} rail needs its ${String(source).toLowerCase()}.`];
        }
    }
    return [];
}

/* ------------------------------------------------------------------ */
/* Pure helpers — reading a resolved block                             */
/* ------------------------------------------------------------------ */

/** A resolved image, wherever the resolution put it (`media` beside the id). */
export function mediaOf(value: unknown): ResolvedMedia | null {
    const media = (value as { media?: unknown } | null)?.media as Partial<ResolvedMedia> | undefined;
    if (!media || typeof media.url !== "string") return null;
    return { url: media.url, width: media.width ?? null, height: media.height ?? null, altText: media.altText ?? null };
}

/** A fact the resolution adds, read off the block or its props. */
export function resolvedExtra<T>(block: ResolvedBlock, key: "query" | "markdown" | "slot" | "ads"): T | undefined {
    const top = (block as unknown as Record<string, unknown>)[key];
    if (top !== undefined) return top as T;
    const inProps = block.props?.[key];
    return inProps as T | undefined;
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

/** This desk reads the API or says it cannot; a seeded layout would look like the published one. */
export const layoutsReadApi = (): boolean => apiConfig.live;

export interface PreviewQuery {
    side?: LayoutSide;
    cityId?: string;
    /** "draft" or a version number. */
    version?: "draft" | number;
}

function previewQuery(query: PreviewQuery): string {
    const params = new URLSearchParams();
    if (query.side) params.set("side", query.side);
    if (query.cityId) params.set("cityId", query.cityId);
    if (query.version !== undefined) params.set("version", String(query.version));
    const qs = params.toString();
    return qs ? `?${qs}` : "";
}

const surfacePath = (surface: LayoutSurface) => `/layouts/${encodeURIComponent(surface)}`;

export const layoutsService = {
    /** Every surface with its live version and its draft. */
    list: () => http.get<LayoutSummary[]>("/layouts"),
    /** The block vocabulary: types, where they may sit, the fields their props take. */
    blockTypes: () => http.get<BlockTypeDef[]>("/layouts/block-types"),
    get: (surface: LayoutSurface) => http.get<LayoutDetail>(`/layouts/${encodeURIComponent(surface)}`),
    /** `content.edit`. Validated per type; an unknown type or a system block off its surface is a 400. */
    saveDraft: (surface: LayoutSurface, blocks: LayoutBlock[], changeNote?: string) =>
        http.put<LayoutVersionView>(`${surfacePath(surface)}/draft`, changeNote ? { blocks, changeNote } : { blocks }),
    /** `content.delete` — every DELETE names a delete power. */
    discardDraft: (surface: LayoutSurface) => http.delete<{ message?: string }>(`${surfacePath(surface)}/draft`),
    preview: (surface: LayoutSurface, query: PreviewQuery = {}) => http.get<ResolvedLayout>(`${surfacePath(surface)}/preview${previewQuery(query)}`),
    /** `content.approve`. The live version retires. */
    publish: (surface: LayoutSurface, changeNote?: string) => http.post<LayoutVersionView>(`${surfacePath(surface)}/publish`, changeNote ? { changeNote } : {}),
    versions: (surface: LayoutSurface) => http.get<LayoutVersionView[]>(`${surfacePath(surface)}/versions`),
    /** `content.approve`. Publishes that version's blocks as a new version. */
    restore: (surface: LayoutSurface, number: number) => http.post<LayoutVersionView>(`${surfacePath(surface)}/versions/${number}/restore`, {}),
};
