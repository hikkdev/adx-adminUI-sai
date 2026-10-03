import { api as http } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";
import type { StatusMeta } from "@/types";
import type { LayoutPerson, LayoutVersionStatus } from "./layouts";
import type { LeadSide } from "./leads";

/**
 * FM-1 (27 Sep 2026): forms — the questions a page asks and where the
 * answers go.
 *
 * The owner: forms get their OWN builder, built on the flow field vocabulary
 * but never writing into a platform record. A form is a key, a title, a
 * destination (a lead for one side, a support ticket, or the inbox here) and
 * an audience (anyone, or signed-in accounts only); its definition — screens
 * of fields, the consent line, the success message — is versioned the way a
 * layout is: one draft at a time, publish retires the live one, restore
 * publishes a copy. A page's `form` block names the key; the website and
 * the apps draw the published definition.
 *
 * Aadhaar is never a field: any field whose id or label names it is
 * refused, here before the server does.
 */

export type FormDestination = "LEAD" | "SUPPORT" | "INBOX";
export type FormAudience = "PUBLIC" | "SIGNED_IN";
export type FormSubmissionStatus = "NEW" | "READ" | "ARCHIVED";

export const FORM_DESTINATIONS = ["LEAD", "SUPPORT", "INBOX"] as const;
export const FORM_AUDIENCES = ["PUBLIC", "SIGNED_IN"] as const;
export const SUBMISSION_STATUSES = ["NEW", "READ", "ARCHIVED"] as const;

export const FORM_DESTINATION_META: Record<FormDestination, { label: string; blurb: string }> = {
    LEAD: { label: "A lead", blurb: "Every answer opens a lead for the side chosen, with the answers as its message." },
    SUPPORT: { label: "A support ticket", blurb: "Every answer opens a ticket on the support desk." },
    INBOX: { label: "The inbox here", blurb: "Answers are kept under Submissions and nowhere else." },
};

export const FORM_AUDIENCE_LABEL: Record<FormAudience, string> = {
    PUBLIC: "Anyone",
    SIGNED_IN: "Signed-in accounts",
};

export const SUBMISSION_STATUS_META: Record<FormSubmissionStatus, StatusMeta> = {
    NEW: { label: "New", tone: "info" },
    READ: { label: "Read", tone: "neutral" },
    ARCHIVED: { label: "Archived", tone: "neutral" },
};

/** The field kinds the definition takes — `GET /forms/field-kinds` is the source; this is the fallback and the type. */
export const FORM_FIELD_KINDS = ["text", "textarea", "email", "phone", "number", "select", "multiselect", "checkbox", "date", "city", "category", "location", "file"] as const;
export type FormFieldKind = (typeof FORM_FIELD_KINDS)[number];

/** One kind as `GET /forms/field-kinds` describes it. */
export interface FieldKindInfo {
    kind: FormFieldKind | (string & {});
    label: string;
    takesOptions: boolean;
    takesRange: boolean;
    signedInOnly: boolean;
}

/** The kinds as the console knows them, for a builder opened before the read lands. */
export const DEFAULT_FIELD_KINDS: FieldKindInfo[] = [
    { kind: "text", label: "Short text", takesOptions: false, takesRange: true, signedInOnly: false },
    { kind: "textarea", label: "Long text", takesOptions: false, takesRange: true, signedInOnly: false },
    { kind: "email", label: "Email", takesOptions: false, takesRange: false, signedInOnly: false },
    { kind: "phone", label: "Phone", takesOptions: false, takesRange: false, signedInOnly: false },
    { kind: "number", label: "Number", takesOptions: false, takesRange: true, signedInOnly: false },
    { kind: "select", label: "Pick one", takesOptions: true, takesRange: false, signedInOnly: false },
    { kind: "multiselect", label: "Pick many", takesOptions: true, takesRange: true, signedInOnly: false },
    { kind: "checkbox", label: "Tick box", takesOptions: false, takesRange: false, signedInOnly: false },
    { kind: "date", label: "Date", takesOptions: false, takesRange: false, signedInOnly: false },
    { kind: "city", label: "City", takesOptions: false, takesRange: false, signedInOnly: false },
    { kind: "category", label: "Listing category", takesOptions: false, takesRange: false, signedInOnly: false },
    { kind: "location", label: "Location on a map", takesOptions: false, takesRange: false, signedInOnly: false },
    { kind: "file", label: "File upload", takesOptions: false, takesRange: false, signedInOnly: true },
];

export interface FormOption {
    value: string;
    label: string;
}

export interface FormField {
    id: string;
    kind: FormFieldKind | (string & {});
    label: string;
    hint?: string;
    placeholder?: string;
    required?: boolean;
    options?: FormOption[];
    min?: number;
    max?: number;
    maxLength?: number;
    /** `file`: the MIME types or extensions accepted. */
    accept?: string[];
    /** Shown only when an earlier field's answer equals this. */
    dependsOn?: { fieldId: string; equals: string };
}

export interface FormScreen {
    key: string;
    title?: string;
    description?: string;
    fields: FormField[];
}

export interface FormDefinition {
    screens: FormScreen[];
    submitLabel?: string;
    successMessage: string;
    consentText: string;
    /** Which fields carry the person's name, email and phone, lifted onto the submission. */
    contactMap?: { name?: string; email?: string; phone?: string };
}

/** The form's own row — what a settings write answers with. The list adds what is live, what waits and the unread count. */
export interface FormRecord {
    id: string;
    key: string;
    title: string;
    destination: FormDestination;
    leadSide: LeadSide | string | null;
    audience: FormAudience;
    archivedAt: string | null;
    updatedAt: string;
    live?: { number: number; publishedAt: string | null } | null;
    draft?: { number: number; updatedAt: string } | null;
    submissionsNew?: number;
}

/** One row of `GET /forms`. */
export interface FormRow extends FormRecord {
    live: { number: number; publishedAt: string | null } | null;
    draft: { number: number; updatedAt: string } | null;
    submissionsNew: number;
}

export interface FormVersionView {
    id: string;
    number: number;
    status: LayoutVersionStatus;
    definition: FormDefinition;
    changeNote: string | null;
    createdAt: string;
    publishedAt: string | null;
    publishedBy?: LayoutPerson | string | null;
    updatedAt?: string;
    retiredAt?: string | null;
}

/** `GET /forms/:key`. */
export interface FormDetail extends FormRow {
    description: string | null;
    notifyEmails: string[];
    live: (FormVersionView & { number: number; publishedAt: string | null }) | null;
    draft: (FormVersionView & { number: number; updatedAt: string }) | null;
    versions?: FormVersionView[];
}

export interface NewFormInput {
    key: string;
    title: string;
    description?: string;
    destination: FormDestination;
    leadSide?: LeadSide;
    audience?: FormAudience;
    notifyEmails?: string[];
}

export interface FormPatch {
    title?: string;
    description?: string | null;
    destination?: FormDestination;
    leadSide?: LeadSide | null;
    audience?: FormAudience;
    notifyEmails?: string[];
}

export interface FormSubmission {
    id: string;
    createdAt: string;
    status: FormSubmissionStatus;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    cityId: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    answers: Record<string, unknown>;
    formVersion: number;
    leadId: string | null;
    ticketId: string | null;
    source: string | null;
}

export interface SubmissionColumn {
    id: string;
    label: string;
    kind: string;
}

export interface SubmissionPage {
    items: FormSubmission[];
    total: number;
    page: number;
    pageSize: number;
    /** From the latest published definition. */
    fields: SubmissionColumn[];
}

export interface SubmissionQuery {
    status?: FormSubmissionStatus;
    from?: string;
    to?: string;
    cityId?: string;
    page?: number;
    pageSize?: number;
}

export interface SubmissionMapPoint {
    id: string;
    latitude: number;
    longitude: number;
    contactName: string | null;
    createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Pure helpers — the definition                                       */
/* ------------------------------------------------------------------ */

export const FORM_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const FORM_KEY_MAX = 64;

/** The key a title suggests. */
export function formKeyFrom(title: string): string {
    return title
        .toLowerCase()
        .trim()
        .replace(/['’]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, FORM_KEY_MAX);
}

export function formKeyProblem(key: string, taken: readonly string[] = []): string | null {
    if (!key) return "A form needs a key.";
    if (key.length > FORM_KEY_MAX) return `At most ${FORM_KEY_MAX} characters.`;
    if (!FORM_KEY_PATTERN.test(key)) return "Lowercase letters, digits and single hyphens — “event-signup”.";
    if (taken.includes(key)) return `“${key}” is already a form.`;
    return null;
}

/** The bounds the server holds a definition to. */
export const DEFINITION_LIMITS = {
    screens: { min: 1, max: 10 },
    fields: 40,
    label: 120,
    hint: 300,
    options: { min: 1, max: 50 },
    submitLabel: 40,
    successMessage: 400,
    consentText: 600,
} as const;

/** The line under a fresh form — the shortest honest consent, to be rewritten by ops. */
export const DEFAULT_CONSENT_TEXT = "I agree to ADX contacting me about this enquiry and to the privacy policy.";
export const DEFAULT_SUCCESS_MESSAGE = "Thank you — we have your answers and will be in touch.";

/** A definition with one empty screen — what a new form's draft starts as. */
export function emptyDefinition(): FormDefinition {
    return {
        screens: [{ key: "screen-1", title: "", fields: [] }],
        submitLabel: "Send",
        successMessage: DEFAULT_SUCCESS_MESSAGE,
        consentText: DEFAULT_CONSENT_TEXT,
    };
}

/** Aadhaar is never a field kind, never stored, never a label — the server's rule, applied first here. */
export const FORBIDDEN_FIELD = /aadha?ar|\buid\b|uidai/i;
export const isForbiddenField = (field: Pick<FormField, "id" | "label">): boolean => FORBIDDEN_FIELD.test(field.id) || FORBIDDEN_FIELD.test(field.label);

/** An id for a new field: the kind, numbered past every id in use. */
export function newFieldId(kind: string, existing: readonly string[]): string {
    const base = kind.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "field";
    let n = existing.length + 1;
    let id = `${base}-${n}`;
    const taken = new Set(existing);
    while (taken.has(id)) id = `${base}-${++n}`;
    return id;
}

/** An id for a new screen, numbered past the ones in use. */
export function newScreenKey(existing: readonly string[]): string {
    let n = existing.length + 1;
    let key = `screen-${n}`;
    const taken = new Set(existing);
    while (taken.has(key)) key = `screen-${++n}`;
    return key;
}

/** Every field of the definition, in order, with the screen it sits on. */
export function allFields(definition: FormDefinition): { field: FormField; screen: FormScreen; screenIndex: number; index: number }[] {
    return definition.screens.flatMap((screen, screenIndex) => screen.fields.map((field, index) => ({ field, screen, screenIndex, index })));
}

/** The fields that come before `fieldId` — the ones a `dependsOn` may name. */
export function fieldsBefore(definition: FormDefinition, fieldId: string): FormField[] {
    const out: FormField[] = [];
    for (const { field } of allFields(definition)) {
        if (field.id === fieldId) break;
        out.push(field);
    }
    return out;
}

/** Whether a kind takes options, a range, or only signed-in forms — from the read when it landed, else the console's own list. */
export function kindInfo(kind: string, kinds: readonly FieldKindInfo[] = DEFAULT_FIELD_KINDS): FieldKindInfo {
    return kinds.find((item) => item.kind === kind) ?? { kind, label: kind, takesOptions: false, takesRange: false, signedInOnly: false };
}

/**
 * Why a definition cannot be saved, by path (`screens.0.fields.2.label`,
 * `consentText`) — the server's rules applied first: 1–10 screens, at most
 * 40 fields, unique ids, `dependsOn` naming an earlier field, options for
 * the picking kinds, `file` only on a signed-in form, no Aadhaar, and the
 * consent line present.
 */
export function definitionProblems(definition: FormDefinition, audience: FormAudience, kinds: readonly FieldKindInfo[] = DEFAULT_FIELD_KINDS): Record<string, string> {
    const problems: Record<string, string> = {};
    const { screens } = definition;
    if (screens.length < DEFINITION_LIMITS.screens.min) problems.screens = "A form needs at least one screen.";
    else if (screens.length > DEFINITION_LIMITS.screens.max) problems.screens = `At most ${DEFINITION_LIMITS.screens.max} screens.`;
    const fields = allFields(definition);
    if (fields.length > DEFINITION_LIMITS.fields) problems.fields = `At most ${DEFINITION_LIMITS.fields} fields across the form.`;
    const seenIds = new Map<string, number>();
    const seenScreens = new Set<string>();
    const before = new Set<string>();
    screens.forEach((screen, screenIndex) => {
        const screenPath = `screens.${screenIndex}`;
        if (!screen.key.trim()) problems[`${screenPath}.key`] = "A screen needs a key.";
        else if (seenScreens.has(screen.key)) problems[`${screenPath}.key`] = "Two screens share this key.";
        seenScreens.add(screen.key);
        screen.fields.forEach((field, index) => {
            const path = `${screenPath}.fields.${index}`;
            const info = kindInfo(field.kind, kinds);
            if (!field.id.trim()) problems[`${path}.id`] = "A field needs an id.";
            else if (!/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(field.id)) problems[`${path}.id`] = "Lowercase letters, digits, hyphens and underscores.";
            else if (seenIds.has(field.id)) problems[`${path}.id`] = `“${field.id}” is used twice.`;
            seenIds.set(field.id, seenIds.size);
            if (!field.label.trim()) problems[`${path}.label`] = "A field needs a label.";
            else if (field.label.length > DEFINITION_LIMITS.label) problems[`${path}.label`] = `At most ${DEFINITION_LIMITS.label} characters.`;
            if (isForbiddenField(field)) problems[`${path}.label`] = "Aadhaar is never asked for — not as a field, not as a label.";
            if (!kinds.some((item) => item.kind === field.kind)) problems[`${path}.kind`] = `“${field.kind}” is not a field kind.`;
            if (info.takesOptions) {
                const options = field.options ?? [];
                if (options.length < DEFINITION_LIMITS.options.min) problems[`${path}.options`] = "Add at least one option.";
                else if (options.length > DEFINITION_LIMITS.options.max) problems[`${path}.options`] = `At most ${DEFINITION_LIMITS.options.max} options.`;
                else if (options.some((option) => !option.value.trim() || !option.label.trim())) problems[`${path}.options`] = "Every option needs a value and a label.";
                else if (new Set(options.map((option) => option.value)).size !== options.length) problems[`${path}.options`] = "Two options share a value.";
            }
            if (info.signedInOnly && audience !== "SIGNED_IN") problems[`${path}.kind`] = `A ${info.label.toLowerCase()} field is only for a signed-in form.`;
            if (field.min !== undefined && field.max !== undefined && field.min > field.max) problems[`${path}.max`] = "The maximum is below the minimum.";
            if (field.maxLength !== undefined && field.maxLength < 1) problems[`${path}.maxLength`] = "At least 1.";
            if (field.dependsOn) {
                if (!field.dependsOn.fieldId) problems[`${path}.dependsOn`] = "Name the field this depends on.";
                else if (!before.has(field.dependsOn.fieldId)) problems[`${path}.dependsOn`] = "It can only depend on a field that comes before it.";
                else if (!field.dependsOn.equals.trim()) problems[`${path}.dependsOn`] = "Say what the earlier answer must equal.";
            }
            if (field.id) before.add(field.id);
        });
    });
    if (!definition.consentText.trim()) problems.consentText = "A consent line is required.";
    else if (definition.consentText.length > DEFINITION_LIMITS.consentText) problems.consentText = `At most ${DEFINITION_LIMITS.consentText} characters.`;
    if (!definition.successMessage.trim()) problems.successMessage = "Say what the person sees after sending.";
    else if (definition.successMessage.length > DEFINITION_LIMITS.successMessage) problems.successMessage = `At most ${DEFINITION_LIMITS.successMessage} characters.`;
    if (definition.submitLabel && definition.submitLabel.length > DEFINITION_LIMITS.submitLabel) problems.submitLabel = `At most ${DEFINITION_LIMITS.submitLabel} characters.`;
    const map = definition.contactMap ?? {};
    for (const [slot, fieldId] of Object.entries(map)) {
        if (fieldId && !seenIds.has(fieldId)) problems[`contactMap.${slot}`] = `No field is called “${fieldId}”.`;
    }
    return problems;
}

/** A canonical JSON of a definition — key order does not make it dirty. */
function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>).sort()) {
            const item = (value as Record<string, unknown>)[key];
            if (item === undefined || item === "" || item === null) continue;
            out[key] = canonical(item);
        }
        return out;
    }
    return value;
}

/** True when the two definitions would save the same. */
export const sameDefinition = (a: FormDefinition, b: FormDefinition): boolean => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/** The definition with empty strings and undefineds dropped — what is sent. */
export const cleanDefinition = (definition: FormDefinition): FormDefinition => canonical(definition) as FormDefinition;

/** A copy with the item at `from` moved to `to` (clamped). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
    const next = [...list];
    if (from < 0 || from >= next.length) return next;
    const target = Math.max(0, Math.min(next.length - 1, to));
    const [item] = next.splice(from, 1);
    next.splice(target, 0, item as T);
    return next;
}

/* ------------------------------------------------------------------ */
/* Pure helpers — submissions                                          */
/* ------------------------------------------------------------------ */

/** One answer as the table prints it. */
export function answerText(kind: string, value: unknown): string {
    if (value === null || value === undefined || value === "") return "—";
    if (kind === "checkbox") return value === true || value === "true" ? "Yes" : "No";
    if (kind === "location" && value && typeof value === "object") {
        const place = value as { address?: string; latitude?: number; longitude?: number };
        if (place.address) return place.address;
        if (typeof place.latitude === "number" && typeof place.longitude === "number") return `${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)}`;
    }
    if (kind === "file" && value && typeof value === "object") {
        const file = value as { name?: string; fileId?: string };
        return file.name ?? file.fileId ?? "A file";
    }
    if (Array.isArray(value)) return value.map(String).join(", ");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

/** The server CSV's fixed columns, in its order (`submissionsCsv` in the backend's forms module). */
export const SUBMISSION_CSV_FIXED = ["id", "createdAt", "status", "version", "contactName", "contactEmail", "contactPhone", "cityId", "address", "latitude", "longitude", "leadId", "ticketId", "source"] as const;

/**
 * The answer columns the server's CSV writes: one per field id across every
 * version, in the order `GET /forms/:key/versions` answers (the order the
 * server walks), the first definition naming an id giving its label.
 */
export function csvFieldColumns(versions: readonly Pick<FormVersionView, "definition">[]): SubmissionColumn[] {
    const columns = new Map<string, SubmissionColumn>();
    for (const version of versions) {
        if (!version.definition?.screens) continue;
        for (const { field } of allFields(version.definition)) if (!columns.has(field.id)) columns.set(field.id, { id: field.id, label: field.label, kind: field.kind });
    }
    return [...columns.values()];
}

/** One answer as the server's CSV writes it — not as the table prints it (a list is "; "-joined, a location keeps its point). */
export function submissionCsvCell(kind: string, value: unknown): string | number | null {
    if (value === undefined || value === null) return null;
    if (typeof value === "number" || typeof value === "string") return value;
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (Array.isArray(value)) return value.map(String).join("; ");
    if (kind === "location" && typeof value === "object") {
        const point = value as { latitude?: number; longitude?: number; address?: string };
        return point.address ? `${point.address} (${point.latitude}, ${point.longitude})` : `${point.latitude}, ${point.longitude}`;
    }
    return JSON.stringify(value);
}

/** The rows of a CSV of these answers — the header and one line each, with the server CSV's columns. */
export function submissionsCsvRows(items: readonly FormSubmission[], fields: readonly SubmissionColumn[]): (string | number | null)[][] {
    return [
        [...SUBMISSION_CSV_FIXED, ...fields.map((field) => `${field.id} (${field.label})`)],
        ...items.map((row) => [
            row.id,
            row.createdAt,
            row.status,
            row.formVersion,
            row.contactName,
            row.contactEmail,
            row.contactPhone,
            row.cityId,
            row.address,
            row.latitude,
            row.longitude,
            row.leadId,
            row.ticketId,
            row.source,
            ...fields.map((field) => submissionCsvCell(field.kind, row.answers?.[field.id])),
        ]),
    ];
}

/** Emails as typed ("a@x.in, b@x.in") → a clean list. */
export function parseEmails(text: string): string[] {
    const seen = new Set<string>();
    for (const raw of text.split(/[,\n;]/)) {
        const email = raw.trim().toLowerCase();
        if (email) seen.add(email);
    }
    return [...seen];
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The emails that are not emails. */
export const badEmails = (emails: readonly string[]): string[] => emails.filter((email) => !EMAIL_PATTERN.test(email));

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

/** This desk reads the API or says it cannot; a seeded form would look exactly like a published one. */
export const formsReadApi = (): boolean => apiConfig.live;

function submissionQuery(query: SubmissionQuery): string {
    const params = new URLSearchParams();
    if (query.status) params.set("status", query.status);
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    if (query.cityId) params.set("cityId", query.cityId);
    if (query.page) params.set("page", String(query.page));
    if (query.pageSize) params.set("pageSize", String(query.pageSize));
    const qs = params.toString();
    return qs ? `?${qs}` : "";
}

const formPath = (key: string) => `/forms/${encodeURIComponent(key)}`;

export const formsService = {
    list: () => http.get<FormRow[]>("/forms"),
    /** The kinds a field may be, with what each takes. */
    fieldKinds: () => http.get<FieldKindInfo[]>("/forms/field-kinds"),
    /** `content.edit`. A form with an empty draft v1. */
    create: (input: NewFormInput) => http.post<FormRecord>("/forms", input),
    get: (key: string) => http.get<FormDetail>(formPath(key)),
    /** The settings — never the definition, which is versioned. */
    update: (key: string, patch: FormPatch) => http.patch<FormRow>(formPath(key), patch),
    saveDraft: (key: string, definition: FormDefinition, changeNote?: string) =>
        http.put<FormVersionView>(`${formPath(key)}/draft`, changeNote ? { definition, changeNote } : { definition }),
    /** `content.delete`. */
    discardDraft: (key: string) => http.delete<{ message?: string }>(`${formPath(key)}/draft`),
    /** `content.approve`. The live version retires. */
    publish: (key: string, changeNote?: string) => http.post<FormVersionView>(`${formPath(key)}/publish`, changeNote ? { changeNote } : {}),
    versions: (key: string) => http.get<FormVersionView[]>(`${formPath(key)}/versions`),
    /** `content.approve`. Publishes that version's definition as a new version. */
    restore: (key: string, number: number) => http.post<FormVersionView>(`${formPath(key)}/versions/${number}/restore`, {}),
    /** `content.delete`. The key stays taken; the published form answers 404. */
    archive: (key: string) => http.post<FormRecord>(`${formPath(key)}/archive`, {}),
    /** The form answers again with whatever version was live. */
    restoreForm: (key: string) => http.post<FormRecord>(`${formPath(key)}/restore-form`, {}),
    submissions: (key: string, query: SubmissionQuery = {}) => http.get<SubmissionPage>(`${formPath(key)}/submissions${submissionQuery(query)}`),
    /** One column per field id across every version. */
    submissionsCsv: (key: string) => http.blob(`${formPath(key)}/submissions.csv`),
    /** The answers with a location, inside a viewport: `w,s,e,n`. */
    submissionsMap: (key: string, bbox: { west: number; south: number; east: number; north: number }) =>
        http.get<SubmissionMapPoint[]>(`${formPath(key)}/submissions/map?bbox=${[bbox.west, bbox.south, bbox.east, bbox.north].map((n) => n.toFixed(6)).join(",")}`),
    setSubmissionStatus: (key: string, id: string, status: FormSubmissionStatus) =>
        http.patch<FormSubmission>(`${formPath(key)}/submissions/${encodeURIComponent(id)}`, { status }),
};
