import { ApiError, api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import type {
    EditableFlow,
    FieldKindSpec,
    FlowField,
    FlowScreen,
    FlowSummary,
    FlowVocabulary,
    KycCaptureColumn,
    LadderStep,
    OnboardingTemplate,
    StepLadder,
    StepLadderVocabulary,
    TemplateAccountType,
    TemplateParty,
    WizardFlow,
} from "@/types";

/**
 * The flow editor, wired to the backend `app-config` module (Q83, Q148).
 *
 * The console is the sole editor of `flows`, and it speaks the apps'
 * vocabulary rather than one of its own: the board is built from
 * `GET /config/schema`, the flows come off `GET /config`, and a save is
 * `PATCH /config/flows/:key`, validated server-side against the same
 * schemas the seed is held to. Whatever the server refuses comes back in
 * `details` — since E10-2 as `issues` with the full Zod path beside the
 * flattened form — and `flowIssues` turns that into lines a person can act
 * on, each carrying the path so the board can point at the field itself.
 *
 * No fixture fallback. The three seeded flows this replaced used field kinds
 * no phone renders; with the API off the screens say so.
 *
 * Lot G (Q126/Q141, package CG3): every flow carries a `description` the
 * list prints under its key, and two step ladders join the row —
 * `agent-job` (the A1–A8 checklist, read by `orders`' submit gate) and
 * `employee-intake` (the KYC desk's ladder). `GET /config/flows` lists all
 * four known keys even before they are stored; a board opened on one the
 * row does not hold yet starts from the code ladder the apps climb today,
 * read off `GET /orders/job-ladder` or `GET /employee-kyc/ladder`.
 */

export const LISTING_FLOW_KEY = "listing";
export const ONBOARDING_FLOW_KEY = "onboarding";
export const AGENT_JOB_FLOW_KEY = "agent-job";
export const EMPLOYEE_INTAKE_FLOW_KEY = "employee-intake";
/** LH7: the invite landing's copy per side. */
export const LEAD_LANDING_FLOW_KEY = "lead-landing";

/** The two keys whose flow is a step ladder, and where the code's fallback ladder is read from. */
export const STEP_LADDER_SOURCES: Record<string, { route: string; domain: "orders" | "kyc" | "leads"; noun: string }> = {
    [AGENT_JOB_FLOW_KEY]: { route: "/orders/job-ladder", domain: "orders", noun: "the agent job checklist" },
    [EMPLOYEE_INTAKE_FLOW_KEY]: { route: "/employee-kyc/ladder", domain: "kyc", noun: "the employee intake ladder" },
    // LH7: the invite landing's copy per side — one step per side, its "proofs" the blocks the page shows.
    [LEAD_LANDING_FLOW_KEY]: { route: "/leads/landing-copy", domain: "leads", noun: "the invite landing copy" },
};

/** `GET /orders/job-ladder` and `GET /employee-kyc/ladder`: the ladder in force, and whether it is the row's or the code's. */
export interface LadderInForce extends StepLadder {
    source: "config" | "code";
}

/** `GET /config` — the row both apps boot from. Only `flows` is read here. */
export interface ConfigDocument {
    enums: Record<string, unknown>;
    flows: Record<string, EditableFlow>;
}

function live() {
    if (!isLive("flows")) throw new Error("The flow editor reads the API; connect the console to the ADX backend first.");
    return http;
}

export const flowService = {
    /** Keys, versions and when each last moved. */
    list: (): Promise<FlowSummary[]> => live().get<FlowSummary[]>("/config/flows"),

    /** The whole row — the flow bodies the summaries describe. */
    document: async (): Promise<ConfigDocument> => {
        const row = await live().get<Partial<ConfigDocument>>("/config");
        return { enums: row.enums ?? {}, flows: row.flows ?? {} };
    },

    /** The vocabulary the editor offers: field kinds, step kinds, the rules. */
    schema: (): Promise<FlowVocabulary> => live().get<FlowVocabulary>("/config/schema"),

    /**
     * One flow replaced whole. The body carries the `version` the editor
     * loaded so a stale board is refused (409) rather than overwriting a
     * colleague's save; the server stamps the next version and `updatedAt`.
     */
    save: (key: string, flow: EditableFlow): Promise<EditableFlow> =>
        live().patch<EditableFlow>(`/config/flows/${encodeURIComponent(key)}`, flowBody(flow)),

    /**
     * The row as it was before the last write — one step, and itself
     * undoable. It is the whole config row, not one flow: a revert after
     * editing `listing` and then `onboarding` puts back the second edit only.
     */
    revert: (): Promise<ConfigDocument> => live().post<ConfigDocument>("/config/revert"),

    /**
     * The step ladder the apps climb today for a key the row does not hold
     * yet — the code's, off the module that reads it. Null for a key that
     * is not a step ladder or whose module is off. A stored ladder answers
     * `source: 'config'`, which is the same body `GET /config` holds.
     */
    ladderInForce: async (key: string): Promise<LadderInForce | null> => {
        const source = STEP_LADDER_SOURCES[key];
        if (!source || !isLive(source.domain)) return null;
        return live().get<LadderInForce>(source.route);
    },
};

/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

export const isLadder = (key: string): boolean => key === ONBOARDING_FLOW_KEY;

/** Whether a key's flow is a step ladder — the two Lot G keys. */
export const isStepLadderKey = (key: string): boolean => key in STEP_LADDER_SOURCES;

export function isWizardFlow(flow: EditableFlow | null | undefined): flow is WizardFlow {
    return !!flow && Array.isArray((flow as WizardFlow).screens);
}

/** A step ladder holds `steps` as an array; the onboarding template holds them as a record keyed by id. */
export function isStepLadder(flow: EditableFlow | null | undefined): flow is StepLadder {
    return !!flow && Array.isArray((flow as StepLadder).steps) && !Array.isArray((flow as WizardFlow).screens);
}

export function isOnboardingTemplate(flow: EditableFlow | null | undefined): flow is OnboardingTemplate {
    return (
        !!flow &&
        typeof (flow as OnboardingTemplate).steps === "object" &&
        !Array.isArray((flow as OnboardingTemplate).steps) &&
        !Array.isArray((flow as WizardFlow).screens)
    );
}

/**
 * The sentence a card prints under its key: the stored flow's own, else
 * the summary's (the code's, for a key not stored yet). Null when neither
 * says anything — the card then draws no line rather than a placeholder.
 */
export function flowDescription(summary: { description?: string | null }, flow: EditableFlow | undefined): string | null {
    const stored = flow && typeof flow.description === "string" ? flow.description.trim() : "";
    if (stored) return stored;
    const known = summary.description?.trim();
    return known || null;
}

/** The server's cap on `audience` (1–80 characters; blank is dropped from the body). */
export const AUDIENCE_MAX = 80;

/**
 * G13-B: the card's audience line — the stored flow's own, else the
 * summary's (the code's default for a key not stored yet). Null when
 * neither says anything.
 */
export function flowAudience(summary: { audience?: string | null }, flow: EditableFlow | undefined): string | null {
    const stored = flow && typeof flow.audience === "string" ? flow.audience.trim() : "";
    if (stored) return stored;
    const known = summary.audience?.trim();
    return known || null;
}

/**
 * What the PATCH takes: the flow minus the server's own `updatedAt`.
 * `version` stays — it is what the conflict check reads. A blank
 * `audience` is left out rather than sent as "" — the server wants one to
 * eighty characters or nothing (G13-B).
 */
export function flowBody(flow: EditableFlow): EditableFlow {
    const { updatedAt: _updatedAt, audience, ...rest } = flow;
    void _updatedAt;
    const trimmed = typeof audience === "string" ? audience.trim() : "";
    return (trimmed ? { ...rest, audience: trimmed } : rest) as EditableFlow;
}

/** The card's three numbers: screens, fields and branches; steps, tiles and ladders; or steps, proofs and the steps that collect one. */
export function flowStats(flow: EditableFlow | undefined): { screens: number; fields: number; branches: number } {
    if (isStepLadder(flow)) {
        return {
            screens: flow.steps.length,
            fields: flow.steps.reduce((sum, step) => sum + (step.proofs?.length ?? 0), 0),
            branches: flow.steps.filter((step) => (step.proofs?.length ?? 0) > 0).length,
        };
    }
    if (isWizardFlow(flow)) {
        const branchScreens = Object.values(flow.branches ?? {}).flatMap((branch) => branch.screens ?? []);
        const all = [...flow.screens, ...branchScreens];
        return {
            screens: all.length,
            fields: all.reduce((sum, screen) => sum + (screen.fields?.length ?? 0), 0),
            branches: Object.keys(flow.branches ?? {}).length,
        };
    }
    if (isOnboardingTemplate(flow)) {
        const steps = Object.values(flow.steps ?? {});
        const ladders = Object.values(flow.ladders ?? {}).flatMap((byType) => Object.values(byType ?? {}));
        return {
            screens: steps.length,
            fields: steps.reduce((sum, step) => sum + (step.kind === "capture" ? step.documents.length : 0), 0),
            branches: ladders.length,
        };
    }
    return { screens: 0, fields: 0, branches: 0 };
}

/* ------------------------------------------------------------------ */
/* What the server refused                                             */
/* ------------------------------------------------------------------ */

export interface FlowIssue {
    /** `screens`, `branches`, `ladders` — the top-level key Zod's flatten keeps. */
    where: string;
    message: string;
    /**
     * E10-2: the full Zod path as segments — `["branches", "indoor",
     * "screens", "1", "fields", "0", "type"]` — when the server gave one.
     * Absent on a 409, a flatten-only refusal, or a line the board made.
     */
    path?: string[];
    /** The same path the way the console prints it: `branches.indoor.screens[1].fields[0].type`. */
    pointer?: string;
}

/** What the server sends per issue since E10-2. */
interface WireIssue {
    path?: unknown;
    pointer?: unknown;
    message?: unknown;
    code?: unknown;
}

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((segment) => typeof segment === "string");

/** `["screens", "1", "fields", "0", "type"]` → `screens[1].fields[0].type` — the server's own rule, for a path it did not point. */
export function pointerOf(path: readonly string[]): string {
    return path.reduce<string>((acc, segment) => (/^\d+$/.test(segment) ? `${acc}[${segment}]` : acc ? `${acc}.${segment}` : segment), "");
}

/**
 * The 400 as lines.
 *
 * E10-2's `details.issues` carries the full Zod path, so a duplicate screen
 * key three levels down arrives as `screens[2].key` and the board can
 * scroll to it; the flattened `fieldErrors` / `formErrors` are read only
 * when `issues` is absent (a server one release behind), keeping the first
 * path segment the way they always did. A 409 is a stale editor and is one
 * line naming the live version. Anything else is the error's own sentence.
 */
export function flowIssues(error: unknown): FlowIssue[] {
    if (!(error instanceof ApiError)) {
        return [{ where: "request", message: error instanceof Error ? error.message : "Could not save the flow." }];
    }
    if (error.status === 409) {
        const current = (error.details as { currentVersion?: number } | undefined)?.currentVersion;
        return [
            {
                where: "version",
                message:
                    current === undefined
                        ? error.message
                        : `${error.message}. Reload the board to pick up version ${current} before saving again.`,
            },
        ];
    }
    const details = error.details as { issues?: unknown; fieldErrors?: Record<string, string[]>; formErrors?: string[] } | undefined;
    const lines: FlowIssue[] = [];
    if (Array.isArray(details?.issues)) {
        for (const raw of details.issues as WireIssue[]) {
            const path = isStringArray(raw.path) ? raw.path : [];
            const message = typeof raw.message === "string" ? raw.message : error.message;
            lines.push({
                where: path[0] ?? "flow",
                message,
                path,
                pointer: typeof raw.pointer === "string" && raw.pointer ? raw.pointer : pointerOf(path),
            });
        }
        if (lines.length > 0) return lines;
    }
    for (const message of details?.formErrors ?? []) lines.push({ where: "flow", message });
    for (const [where, messages] of Object.entries(details?.fieldErrors ?? {})) {
        for (const message of messages) lines.push({ where, message });
    }
    return lines.length > 0 ? lines : [{ where: "flow", message: error.message }];
}

/* ------------------------------------------------------------------ */
/* Where on the board a refusal lands                                  */
/* ------------------------------------------------------------------ */

/**
 * One issue's place on the wizard board, resolved from its path against
 * the flow the editor holds: the lane (null for the main flow, else the
 * branch id), the screen by key, the field by id, and the prop the path
 * goes on to name — `type`, `options`, `required` — so the editor can
 * outline the exact control. Indices are resolved to keys and ids because
 * the board addresses screens and fields by those, and a key survives a
 * reorder where an index does not.
 */
export interface WizardIssueTarget {
    /** Null for the main flow; a branch id otherwise. */
    lane: string | null;
    screenKey: string | null;
    fieldId: string | null;
    /** The screen prop (`key`, `title`) or field prop (`type`, `options`) the path ends on, when it goes that deep. */
    prop: string | null;
}

/**
 * Resolves a server path to a board location, or null when the path names
 * nothing on the board — the flow's `label`, its `version`, a branch that
 * is not in the editor, or an index past the end. The shapes the server
 * writes (`flow-schema.ts`):
 *
 *   screens[s]                          branches.<id>
 *   screens[s].key                      branches.<id>.id
 *   screens[s].fields[f]                branches.<id>.screens[s].fields[f].<prop>
 *   screens[s].fields[f].<prop>
 */
export function resolveWizardIssue(flow: WizardFlow, path: readonly string[] | undefined): WizardIssueTarget | null {
    if (!path || path.length === 0) return null;
    let lane: string | null = null;
    let screens: FlowScreen[] = flow.screens ?? [];
    let rest = [...path];

    if (rest[0] === "branches") {
        const branch = flow.branches?.[rest[1] ?? ""];
        if (!branch) return null;
        lane = branch.id;
        screens = branch.screens ?? [];
        rest = rest.slice(2);
        // `branches.<id>` or `branches.<id>.id|title|description` — the lane itself.
        if (rest.length === 0 || rest[0] !== "screens") return { lane, screenKey: null, fieldId: null, prop: rest[0] ?? null };
    }

    if (rest[0] !== "screens") return null;
    if (rest.length === 1) return { lane, screenKey: null, fieldId: null, prop: null };
    const screen = screens[Number(rest[1])];
    if (!screen) return null;
    const afterScreen = rest.slice(2);
    if (afterScreen.length === 0) return { lane, screenKey: screen.key, fieldId: null, prop: null };
    if (afterScreen[0] !== "fields") return { lane, screenKey: screen.key, fieldId: null, prop: afterScreen[0] ?? null };
    if (afterScreen.length === 1) return { lane, screenKey: screen.key, fieldId: null, prop: "fields" };
    const field = screen.fields?.[Number(afterScreen[1])];
    if (!field) return { lane, screenKey: screen.key, fieldId: null, prop: "fields" };
    return { lane, screenKey: screen.key, fieldId: field.id, prop: afterScreen[2] ?? null };
}

/**
 * One issue's place on the ladder board — the ladder it names (party and
 * account type, and the rung when the path goes that far) or the library
 * step, so the board can switch to the lane and select the step. Null for
 * a path that names neither.
 */
export interface LadderIssueTarget {
    party: string | null;
    accountType: string | null;
    /** The step id the issue lands on — the rung's entry, or the library step. */
    stepKey: string | null;
    prop: string | null;
}

export function resolveLadderIssue(template: OnboardingTemplate, path: readonly string[] | undefined): LadderIssueTarget | null {
    if (!path || path.length === 0) return null;
    if (path[0] === "ladders") {
        const party = path[1] ?? null;
        const accountType = path[2] ?? null;
        const rung = path[3] === undefined ? null : Number(path[3]);
        const ladder = party && accountType ? ((template.ladders as Record<string, Record<string, string[]> | undefined> | undefined)?.[party]?.[accountType] ?? []) : [];
        const stepKey = rung !== null && Number.isInteger(rung) ? (ladder[rung] ?? null) : null;
        return { party, accountType, stepKey, prop: null };
    }
    if (path[0] === "steps") {
        const stepKey = path[1] ?? null;
        if (!stepKey || !template.steps?.[stepKey]) return null;
        return { party: null, accountType: null, stepKey, prop: path[2] ?? null };
    }
    return null;
}

/**
 * One issue's place on the step-ladder board: the step by key (an index
 * resolved against the ladder that was sent) and the prop or the proof
 * the path goes on to name. Null for a path that names nothing on the
 * board — the label, the version, an index past the end.
 */
export interface StepLadderIssueTarget {
    stepKey: string | null;
    /** The proof's index within the step, when the path goes that deep. */
    proofIndex: number | null;
    prop: string | null;
}

export function resolveStepLadderIssue(ladder: StepLadder, path: readonly string[] | undefined): StepLadderIssueTarget | null {
    if (!path || path.length === 0 || path[0] !== "steps") return null;
    if (path.length === 1) return { stepKey: null, proofIndex: null, prop: "steps" };
    const step = ladder.steps[Number(path[1])];
    if (!step) return null;
    const rest = path.slice(2);
    if (rest.length === 0) return { stepKey: step.key, proofIndex: null, prop: null };
    if (rest[0] !== "proofs") return { stepKey: step.key, proofIndex: null, prop: rest[0] ?? null };
    if (rest.length === 1) return { stepKey: step.key, proofIndex: null, prop: "proofs" };
    const proofIndex = Number(rest[1]);
    return { stepKey: step.key, proofIndex: Number.isInteger(proofIndex) ? proofIndex : null, prop: rest[2] ?? "proofs" };
}

/**
 * The ladder's own rules, mirrored so the board can say what the server
 * would refuse before it does: every required proof collected by some
 * step, a proof collected by at most one, step keys unique. Each line is
 * shaped as the server's refusal would be, path and all.
 */
export function stepLadderIssues(ladder: StepLadder, vocabulary: StepLadderVocabulary): FlowIssue[] {
    const issues: FlowIssue[] = [];
    const seenKeys = new Set<string>();
    const collectedBy = new Map<string, string>();
    ladder.steps.forEach((step, s) => {
        if (seenKeys.has(step.key)) {
            const path = ["steps", String(s), "key"];
            issues.push({ where: "steps", message: `Step key "${step.key}" is used twice.`, path, pointer: pointerOf(path) });
        }
        seenKeys.add(step.key);
        (step.proofs ?? []).forEach((proof, p) => {
            const path = ["steps", String(s), "proofs", String(p), "key"];
            if (!vocabulary.proofs.includes(proof.key)) {
                issues.push({ where: "steps", message: `"${proof.key}" is not a proof this ladder can collect.`, path, pointer: pointerOf(path) });
                return;
            }
            const earlier = collectedBy.get(proof.key);
            if (earlier !== undefined && !vocabulary.repeatable) {
                issues.push({ where: "steps", message: `Proof "${proof.key}" is already collected by step "${earlier}".`, path, pointer: pointerOf(path) });
            } else if (vocabulary.repeatable && earlier === step.key) {
                issues.push({ where: "steps", message: `Block "${proof.key}" is on this step twice.`, path, pointer: pointerOf(path) });
            } else {
                collectedBy.set(proof.key, step.key);
            }
        });
    });
    const missing = vocabulary.requiredProofs.filter((proof) => !collectedBy.has(proof));
    if (missing.length > 0) {
        issues.push({ where: "steps", message: `No step collects ${missing.join(", ")}.`, path: ["steps"], pointer: "steps" });
    }
    return issues;
}

/** A fresh step for the board: the next number, a placeholder title, no proofs yet. */
export function blankLadderStep(key: string, number: number): LadderStep {
    return { key, number, title: "New step", proofs: [] };
}

/**
 * What a proof key reads as on the board — G11-1: the vocabulary's own
 * `proofOptions` label ('Check in', 'Government ID front', …). A server one
 * release behind serves no labels, and the key itself is printed rather
 * than a spelling the console makes up.
 */
export function proofLabelFrom(vocabulary: Pick<StepLadderVocabulary, "proofOptions">): (key: string) => string {
    const labels = new Map((vocabulary.proofOptions ?? []).map((option) => [option.key, option.label]));
    return (key) => labels.get(key) ?? key;
}

/* ------------------------------------------------------------------ */
/* The vocabulary, read                                                */
/* ------------------------------------------------------------------ */

/** The prop names a field of this kind may carry — the common ones plus its own. */
export function allowedProps(spec: FieldKindSpec | undefined, commonProps: string[]): Set<string> {
    return new Set([...commonProps, ...(spec?.props ?? [])]);
}

/**
 * A field re-typed: props the new kind does not read are dropped, because
 * the server refuses a field carrying one, and what it requires is given a
 * starting value so the board does not save a `select` with no options.
 */
export function retypeField(field: FlowField, next: FieldKindSpec, commonProps: string[]): FlowField {
    const allowed = allowedProps(next, commonProps);
    const kept = Object.fromEntries(Object.entries(field).filter(([prop]) => allowed.has(prop))) as FlowField;
    kept.type = next.kind;
    if (!next.input) delete kept.required;
    if (next.requires.includes("options") && !kept.options?.length) {
        kept.options = [{ id: "option-1", title: "Option 1" }];
    }
    if (next.requires.includes("scope") && !kept.scope) kept.scope = next.kind === "content-prohibited" ? "PROHIBITED" : "RESTRICTED";
    if (next.requires.includes("from") && !kept.from?.length) kept.from = [];
    return kept;
}

/**
 * The fields whose kind the vocabulary does not name — one line each, in
 * the shape the server's own refusal would take, so the board can refuse
 * before it PATCHes. The editor only ever offers the schema's kinds; this
 * catches a row loaded with a kind the vocabulary has since dropped.
 */
export function unknownKinds(flow: WizardFlow, kinds: FieldKindSpec[]): FlowIssue[] {
    const known = new Set(kinds.map((spec) => spec.kind));
    const issues: FlowIssue[] = [];
    const walk = (where: string, screens: FlowScreen[]) => {
        for (const screen of screens ?? []) {
            for (const field of screen.fields ?? []) {
                if (!known.has(field.type)) issues.push({ where, message: `Field "${field.id}" on screen "${screen.key}" has an unknown kind "${field.type}".` });
            }
        }
    };
    walk("screens", flow.screens);
    for (const branch of Object.values(flow.branches ?? {})) walk("branches", branch.screens);
    return issues;
}

/**
 * The ladder's own rule, mirrored so the board can say which column a
 * ladder never captures before the server says the same in a 400: every
 * required column, on a tile that is not inert, on a step the ladder names.
 */
export function ladderCoverage(
    template: OnboardingTemplate,
    party: TemplateParty,
    accountType: TemplateAccountType,
    required: Record<TemplateAccountType, KycCaptureColumn[]>,
): { covered: KycCaptureColumn[]; missing: KycCaptureColumn[]; unknownSteps: string[] } {
    const ladder = template.ladders?.[party]?.[accountType] ?? [];
    const covered = new Set<KycCaptureColumn>();
    const unknownSteps: string[] = [];
    for (const id of ladder) {
        const step = template.steps?.[id];
        if (!step) {
            unknownSteps.push(id);
            continue;
        }
        if (step.kind === "capture") for (const tile of step.documents) if (!tile.inert) covered.add(tile.field);
    }
    const wanted = required[accountType] ?? [];
    return {
        covered: wanted.filter((column) => covered.has(column)),
        missing: wanted.filter((column) => !covered.has(column)),
        unknownSteps,
    };
}
