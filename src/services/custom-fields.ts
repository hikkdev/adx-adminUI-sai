import { api as http } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";

/**
 * CF-1 (27 Sep 2026): custom fields — the extra questions ops ask of a
 * publisher, an advertiser, a listing or a lead that no column holds.
 *
 * A definition is per record type: a key, a label, a kind, whether it is
 * required, where it shows (the desk, the apps, the website) and whether
 * the record's own owner may answer it. A value is JSON under the record;
 * the four detail pages draw the "Extra details" card from the definitions
 * with `showOnDesk`, the apps and the website their own sections. Aadhaar
 * is never a field here either.
 */

export const CUSTOM_FIELD_ENTITIES = ["PUBLISHER", "ADVERTISER", "LISTING", "LEAD"] as const;
export type CustomFieldEntity = (typeof CUSTOM_FIELD_ENTITIES)[number];

export const CUSTOM_FIELD_ENTITY_LABEL: Record<CustomFieldEntity, string> = {
    PUBLISHER: "Publishers",
    ADVERTISER: "Advertisers",
    LISTING: "Listings",
    LEAD: "Leads",
};

export const CUSTOM_FIELD_KINDS = ["text", "textarea", "number", "select", "multiselect", "checkbox", "date", "email", "phone", "url", "location"] as const;
export type CustomFieldKind = (typeof CUSTOM_FIELD_KINDS)[number];

export const CUSTOM_FIELD_KIND_LABEL: Record<CustomFieldKind, string> = {
    text: "Short text",
    textarea: "Long text",
    number: "Number",
    select: "Pick one",
    multiselect: "Pick many",
    checkbox: "Yes / no",
    date: "Date",
    email: "Email",
    phone: "Phone",
    url: "Web address",
    location: "Location on a map",
};

/** The kinds that carry options. */
export const takesOptions = (kind: string): boolean => kind === "select" || kind === "multiselect";

export interface CustomFieldOption {
    value: string;
    label: string;
}

export interface CustomFieldDef {
    id: string;
    entity: CustomFieldEntity;
    key: string;
    label: string;
    kind: CustomFieldKind | (string & {});
    options: CustomFieldOption[] | null;
    hint: string | null;
    required: boolean;
    showOnDesk: boolean;
    showInApps: boolean;
    showOnWebsite: boolean;
    editableByOwner: boolean;
    sortOrder: number;
    archivedAt: string | null;
    createdAt?: string;
    updatedAt?: string;
}

export interface CustomFieldDefInput {
    entity: CustomFieldEntity;
    key: string;
    label: string;
    kind: CustomFieldKind;
    options?: CustomFieldOption[];
    hint?: string;
    required?: boolean;
    showOnDesk?: boolean;
    showInApps?: boolean;
    showOnWebsite?: boolean;
    editableByOwner?: boolean;
    sortOrder?: number;
}

/** What `PATCH /custom-fields/:id` takes — everything but the entity and the key; `null` clears the options or the hint. */
export type CustomFieldDefPatch = Partial<Omit<CustomFieldDefInput, "entity" | "key" | "options" | "hint">> & { options?: CustomFieldOption[] | null; hint?: string | null };

/** A `location` value. */
export interface LocationValue {
    latitude: number;
    longitude: number;
    address?: string;
    cityId?: string;
}

/** `GET /custom-fields/values/:entity/:entityId` — the answers by key. */
export interface CustomFieldValues {
    values: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

export const FIELD_KEY_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
export const FIELD_KEY_MAX = 48;

/** The key a label suggests — snake_case, the way the seeded example `preferred_contact_time` reads. */
export function fieldKeyFrom(label: string): string {
    return label
        .toLowerCase()
        .trim()
        .replace(/['’]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/^[0-9]+/, "")
        .slice(0, FIELD_KEY_MAX);
}

export const FORBIDDEN_LABEL = /aadha?ar|\buid\b|uidai/i;

/** Why a definition cannot be saved, by field of the dialog. */
export function defProblems(input: { key: string; label: string; kind: string; options: CustomFieldOption[] }, taken: readonly string[] = []): Record<string, string> {
    const problems: Record<string, string> = {};
    if (!input.label.trim()) problems.label = "A field needs a label.";
    else if (input.label.length > 120) problems.label = "At most 120 characters.";
    if (FORBIDDEN_LABEL.test(input.label) || FORBIDDEN_LABEL.test(input.key)) problems.label = "Aadhaar is never asked for — not as a field, not as a label.";
    if (!input.key) problems.key = "A field needs a key.";
    else if (!FIELD_KEY_PATTERN.test(input.key)) problems.key = "Lowercase letters, digits and underscores — “preferred_contact_time”.";
    else if (input.key.length > FIELD_KEY_MAX) problems.key = `At most ${FIELD_KEY_MAX} characters.`;
    else if (taken.includes(input.key)) problems.key = `“${input.key}” is already a field here.`;
    if (!(CUSTOM_FIELD_KINDS as readonly string[]).includes(input.kind)) problems.kind = "Pick a kind.";
    if (takesOptions(input.kind)) {
        if (input.options.length === 0) problems.options = "Add at least one option.";
        else if (input.options.some((option) => !option.value.trim() || !option.label.trim())) problems.options = "Every option needs a value and a label.";
        else if (new Set(input.options.map((option) => option.value)).size !== input.options.length) problems.options = "Two options share a value.";
    }
    return problems;
}

/** Options as typed, one per line ("value | Label" or just "Label") → the list. */
export function parseOptions(text: string): CustomFieldOption[] {
    const out: CustomFieldOption[] = [];
    for (const raw of text.split("\n")) {
        const line = raw.trim();
        if (!line) continue;
        const [left, right] = line.split("|").map((part) => part.trim());
        const label = right || left || "";
        const value = right ? left! : fieldKeyFrom(label);
        out.push({ value, label });
    }
    return out;
}

/** The options back to the textarea's lines. */
export const optionsText = (options: readonly CustomFieldOption[] | null | undefined): string => (options ?? []).map((option) => (option.value === fieldKeyFrom(option.label) ? option.label : `${option.value} | ${option.label}`)).join("\n");

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9][0-9 \-()]{5,19}$/;
const URL_PATTERN = /^https?:\/\/[^\s]+$/i;

/** True for an answer that says nothing. */
export function isEmptyValue(kind: string, value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.trim() === "";
    if (Array.isArray(value)) return value.length === 0;
    if (kind === "checkbox") return false;
    if (kind === "location") {
        const place = value as Partial<LocationValue>;
        return typeof place.latitude !== "number" || typeof place.longitude !== "number";
    }
    return false;
}

/** Why an answer cannot be saved against its definition, or null. */
export function valueProblem(def: Pick<CustomFieldDef, "kind" | "required" | "options" | "label">, value: unknown): string | null {
    if (isEmptyValue(def.kind, value)) return def.required ? "Required." : null;
    switch (def.kind) {
        case "number":
            return typeof value === "number" && Number.isFinite(value) ? null : "A number.";
        case "checkbox":
            return typeof value === "boolean" ? null : "Yes or no.";
        case "date":
            return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? null : "A date.";
        case "email":
            return typeof value === "string" && EMAIL.test(value.trim()) ? null : "An email address.";
        case "phone":
            return typeof value === "string" && PHONE.test(value.trim()) ? null : "A phone number.";
        case "url":
            return typeof value === "string" && URL_PATTERN.test(value.trim()) ? null : "A web address starting with https://.";
        case "select": {
            const allowed = (def.options ?? []).map((option) => option.value);
            return typeof value === "string" && allowed.includes(value) ? null : "Pick one of the options.";
        }
        case "multiselect": {
            const allowed = (def.options ?? []).map((option) => option.value);
            return Array.isArray(value) && value.every((item) => typeof item === "string" && allowed.includes(item)) ? null : "Pick from the options.";
        }
        case "location": {
            const place = value as Partial<LocationValue>;
            const ok = typeof place.latitude === "number" && Math.abs(place.latitude) <= 90 && typeof place.longitude === "number" && Math.abs(place.longitude) <= 180;
            return ok ? null : "A point on the map.";
        }
        default:
            return typeof value === "string" ? null : "Text.";
    }
}

/** An answer as a card prints it. */
export function formatValue(def: Pick<CustomFieldDef, "kind" | "options">, value: unknown): string {
    if (isEmptyValue(def.kind, value)) return "—";
    switch (def.kind) {
        case "checkbox":
            return value === true ? "Yes" : "No";
        case "select":
            return (def.options ?? []).find((option) => option.value === value)?.label ?? String(value);
        case "multiselect":
            return (Array.isArray(value) ? value : [])
                .map((item) => (def.options ?? []).find((option) => option.value === item)?.label ?? String(item))
                .join(", ");
        case "date":
            return typeof value === "string" ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : String(value);
        case "location": {
            const place = value as LocationValue;
            return place.address ?? `${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)}`;
        }
        default:
            return Array.isArray(value) ? value.join(", ") : typeof value === "object" ? JSON.stringify(value) : String(value);
    }
}

/** The four switches a bulk change may set — short, so the dialog's paired cells stay one line each. */
export const SHOW_ON_SWITCHES = [
    { key: "showOnDesk", label: "On the desk" },
    { key: "showInApps", label: "In the apps" },
    { key: "showOnWebsite", label: "On the website" },
    { key: "editableByOwner", label: "Owner may answer" },
] as const;
export type ShowOnSwitch = (typeof SHOW_ON_SWITCHES)[number]["key"];
/** Per switch: leave each field as it is, or turn it on or off for every one. */
export type SwitchChoice = "leave" | "on" | "off";
export type SwitchChoices = Record<ShowOnSwitch, SwitchChoice>;
export const LEAVE_ALL: SwitchChoices = { showOnDesk: "leave", showInApps: "leave", showOnWebsite: "leave", editableByOwner: "leave" };

/**
 * The PATCH a bulk switch change makes of one definition — only the
 * switches it would actually move, so each field's audit row names what
 * changed on it — or null when it would move none.
 */
export function switchPatch(def: Pick<CustomFieldDef, ShowOnSwitch>, choices: SwitchChoices): Partial<Record<ShowOnSwitch, boolean>> | null {
    const patch: Partial<Record<ShowOnSwitch, boolean>> = {};
    for (const { key } of SHOW_ON_SWITCHES) {
        const choice = choices[key];
        if (choice === "leave") continue;
        const want = choice === "on";
        if (def[key] !== want) patch[key] = want;
    }
    return Object.keys(patch).length ? patch : null;
}

/** The definitions in the order the desk shows them: `sortOrder`, then label. */
export const sortDefs = (defs: readonly CustomFieldDef[]): CustomFieldDef[] => [...defs].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

/** This desk reads the API or says it cannot; there is no seeded stand-in. */
export const customFieldsReadApi = (): boolean => apiConfig.live;

const valuesPath = (entity: CustomFieldEntity, entityId: string) => `/custom-fields/values/${entity}/${encodeURIComponent(entityId)}`;

export const customFieldsService = {
    /** `settings.view`. The live definitions; `includeArchived` brings the archived ones too, for the desk. */
    list: (entity: CustomFieldEntity, options: { includeArchived?: boolean } = {}) =>
        http.get<CustomFieldDef[]>(`/custom-fields?entity=${entity}${options.includeArchived ? "&includeArchived=true" : ""}`),
    /** `settings.edit`. */
    create: (input: CustomFieldDefInput) => http.post<CustomFieldDef>("/custom-fields", input),
    update: (id: string, patch: CustomFieldDefPatch) => http.patch<CustomFieldDef>(`/custom-fields/${encodeURIComponent(id)}`, patch),
    archive: (id: string) => http.post<CustomFieldDef>(`/custom-fields/${encodeURIComponent(id)}/archive`, {}),
    /** The field is asked again; every answer it had is still there. */
    restore: (id: string) => http.post<CustomFieldDef>(`/custom-fields/${encodeURIComponent(id)}/restore`, {}),
    /** The record's answers — the entity's `view` group. */
    values: (entity: CustomFieldEntity, entityId: string) => http.get<CustomFieldValues>(valuesPath(entity, entityId)),
    /** The record's answers, whole — the entity's `edit` group. */
    saveValues: (entity: CustomFieldEntity, entityId: string, values: Record<string, unknown>) => http.put<CustomFieldValues>(valuesPath(entity, entityId), { values }),
};
