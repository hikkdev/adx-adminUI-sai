import { areaSqFtFrom } from "@/lib/rate-per-day";
import type { FlowField, FlowScreen, WizardFlow } from "@/types";

/**
 * FL-2/FL-3 (27 Sep 2026): a wizard flow walked on the web, the way both
 * apps' `use-listing-flow.ts` walks it on a phone.
 *
 * Nothing here knows that screen 4 is "spot details". It knows that a flow
 * has root screens, that one root field branches, that a branch has its
 * own screens, that a field may be required and may depend on an earlier
 * one. What it adds over the apps' hook is generality: the apps clear the
 * venue, the spot type, the material and the placement by name when the
 * category moves; here a change clears every field that `dependsOn` the
 * one that changed, and a branch change clears the taxonomy kinds whose
 * offered lists the category decides — which, on the listing flow, is the
 * same four fields.
 */

export type FlowAnswers = Record<string, unknown>;

/** A geo point, as the map field stores it. */
export type GeoPoint = { latitude: number; longitude: number };

/** One venue proof, as the documents field stores it and `POST /supply/listings/:id/documents` takes it. */
export type CollectedDocument = { kind: string; url: string };

/** One content rule, as both content fields write it and `POST /listings` takes it. */
export type ContentRule = { contentCategoryId: string; stance: string };

/**
 * The one answer with no field of its own: both content fields write into
 * this array, because the API replaces a listing's whole content position
 * at once. The same name the apps use, so a draft saved by a phone and read
 * at the desk holds the same answer under the same key.
 */
export const CONTENT_RULES_FIELD = "content_rules";

/** The kinds whose offered lists the category decides — cleared when the branch moves. */
const TAXONOMY_KINDS = new Set(["venue-type", "media-type", "material", "sub-venue"]);

/** The one root field that branches, or null on a flow without one. */
export function branchingField(flow: Pick<WizardFlow, "screens">): FlowField | null {
    for (const screen of flow.screens ?? []) {
        for (const field of screen.fields ?? []) if (field.branching) return field;
    }
    return null;
}

/** The branch the answers have opened, or null before the branching field is answered. */
export function branchOf(flow: Pick<WizardFlow, "screens" | "branches">, answers: FlowAnswers): string | null {
    const field = branchingField(flow);
    if (!field) return null;
    const value = answers[field.id];
    return typeof value === "string" && flow.branches?.[value] ? value : null;
}

/**
 * Every screen this path passes through, in order: the root, then the
 * branch the answers opened. Recomputed as the answers change, which is
 * what makes the first screen a branch rather than a question.
 */
export function screensInPlay(flow: Pick<WizardFlow, "screens" | "branches">, answers: FlowAnswers): FlowScreen[] {
    const branch = branchOf(flow, answers);
    return [...(flow.screens ?? []), ...(branch ? (flow.branches[branch]?.screens ?? []) : [])];
}

/** Every field on a list of screens, by id, in order. */
export function fieldsOf(screens: FlowScreen[]): Map<string, FlowField> {
    const fields = new Map<string, FlowField>();
    for (const screen of screens) for (const field of screen.fields ?? []) fields.set(field.id, field);
    return fields;
}

export function isBlank(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value === "string") return value.trim() === "";
    if (Array.isArray(value)) return value.length === 0;
    return false;
}

/**
 * Whether a required field still has nothing the step can accept. A
 * required checkbox is an attestation and only a tick satisfies it; a
 * `switch`'s "No" is a real answer and stays one.
 */
export function isUnanswered(field: FlowField, value: unknown): boolean {
    if (field.type === "checkbox") return value !== true;
    return isBlank(value);
}

/** The required fields on a screen that still have nothing in them — their labels, as the phone's "Still needed" line prints them. */
export function missingFields(screen: FlowScreen, answers: FlowAnswers): string[] {
    return (screen.fields ?? []).filter((field) => field.required && isUnanswered(field, answers[field.id])).map((field) => field.label);
}

/**
 * The answers the screens in play actually asked for — what is submitted.
 * A branch the operator walked away from keeps its answers in the bag (so
 * coming back finds them) but must not be filed as though they answered
 * it. `content_rules` has no field of its own and is kept while either
 * content field is in play; a documents answer keeps only the rows whose
 * kind the step in play still offers.
 */
export function answersInPlay(answers: FlowAnswers, screens: FlowScreen[]): FlowAnswers {
    const fields = fieldsOf(screens);
    const contentAsked = [...fields.values()].some((field) => field.type === "content-stance" || field.type === "content-prohibited");
    const kept: FlowAnswers = {};
    for (const [id, value] of Object.entries(answers)) {
        if (id === CONTENT_RULES_FIELD) {
            if (contentAsked) kept[id] = value;
            continue;
        }
        const field = fields.get(id);
        if (!field) continue;
        kept[id] = field.type === "document-upload" ? offeredDocuments(field, value) : value;
    }
    return kept;
}

function offeredDocuments(field: FlowField, value: unknown): unknown {
    if (!Array.isArray(value)) return value;
    const kinds = new Set((field.options ?? []).map((option) => option.id));
    return value.filter((row) => typeof row === "object" && row !== null && kinds.has((row as CollectedDocument).kind));
}

/** The proofs the documents step gathered, ready to post: rows with a kind and a URL. */
export function collectedDocuments(answers: FlowAnswers, fieldId = "documents"): CollectedDocument[] {
    const rows = answers[fieldId];
    if (!Array.isArray(rows)) return [];
    return rows.filter(
        (row): row is CollectedDocument =>
            typeof row === "object" && row !== null && typeof (row as CollectedDocument).kind === "string" && typeof (row as CollectedDocument).url === "string" && (row as CollectedDocument).url.trim() !== "",
    );
}

/**
 * A computed field's value. `multiply` of two answers is the area the
 * apps compute (rounded where the server rounds it); `add` is the sum.
 * Null while any input is missing or not a number.
 */
export function computedValue(field: FlowField, answers: FlowAnswers): string | null {
    const from = field.from ?? [];
    if (from.length === 0) return null;
    if (field.op === "multiply" && from.length === 2) {
        return areaSqFtFrom(String(answers[from[0]!] ?? ""), String(answers[from[1]!] ?? ""));
    }
    const numbers = from.map((id) => Number(String(answers[id] ?? "").trim()));
    if (numbers.some((value) => !Number.isFinite(value)) || from.some((id) => isBlank(answers[id]))) return null;
    if (field.op === "add") return String(numbers.reduce((sum, value) => sum + value, 0));
    if (field.op === "multiply") return String(numbers.reduce((product, value) => product * value, 1));
    return null;
}

/** The ids of every field on `screens` that depends, directly or through others, on `id`. */
export function dependantsOf(screens: FlowScreen[], id: string): string[] {
    const fields = [...fieldsOf(screens).values()];
    const cleared = new Set<string>();
    let frontier = [id];
    while (frontier.length > 0) {
        const next: string[] = [];
        for (const field of fields) {
            if (field.dependsOn && frontier.includes(field.dependsOn) && !cleared.has(field.id)) {
                cleared.add(field.id);
                next.push(field.id);
            }
        }
        frontier = next;
    }
    return [...cleared];
}

/**
 * The answers with one changed. Changing an answer invalidates everything
 * that depends on it, and changing the branch invalidates the taxonomy
 * answers the category filters — cleared here rather than guarded at
 * render, so what is submitted is what the operator can see on screen.
 * An `undefined` value removes the key rather than storing it.
 */
export function withAnswer(flow: Pick<WizardFlow, "screens" | "branches">, answers: FlowAnswers, id: string, value: unknown): FlowAnswers {
    const next: FlowAnswers = { ...answers };
    if (value === undefined) delete next[id];
    else next[id] = value;
    if (answers[id] === value) return next;

    const branching = branchingField(flow);
    const moved = branching !== null && branching.id === id;
    // A branch change reaches every branch's taxonomy answers, not only the screens that were in play: an answer left by a branch never entered is as stale as one just left.
    const scope = moved ? [...(flow.screens ?? []), ...Object.values(flow.branches ?? {}).flatMap((branch) => branch.screens ?? [])] : screensInPlay(flow, answers);
    const roots = new Set<string>([id]);
    if (moved) for (const field of fieldsOf(scope).values()) if (TAXONOMY_KINDS.has(field.type)) roots.add(field.id);
    for (const root of roots) {
        if (root !== id) delete next[root];
        for (const dependant of dependantsOf(scope, root)) delete next[dependant];
    }
    return next;
}

/** Field ids asked before `fieldId` on the path — what `dependsOn` and `from` may name. */
export function earlierFieldIds(screens: FlowScreen[], fieldId: string): string[] {
    const ids: string[] = [];
    for (const screen of screens) {
        for (const field of screen.fields ?? []) {
            if (field.id === fieldId) return ids;
            ids.push(field.id);
        }
    }
    return ids;
}

/** Whether a screen is one of the numbered steps (the documents and review screens sit past the total). */
export const isNumbered = (screen: Pick<FlowScreen, "step" | "totalSteps">): boolean => screen.step <= screen.totalSteps;
