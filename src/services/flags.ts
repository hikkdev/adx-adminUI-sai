import { api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";

/**
 * The feature registry and its switches — the backend `feature-flags`
 * module, Lot A (Q31) rebuilt around the registry in Lot G (answers
 * 144-146, 13 September; package CG5 on the console side).
 *
 * A feature is declared where it is built — a `features.ts` beside a
 * backend module's routes, `features.manifest.json` at each package root —
 * and the boot upsert gives every declared key a `FeatureFlag` row. So the
 * console cannot create one, and there is no Add flag here: `PATCH
 * /flags/:key` on a key nobody declared is a 404. What the console does is
 * move a flag — the kill switch, the variant, the rollout — and every move
 * lands with a `FeatureFlagChange` row, the position before it kept as
 * `lastGoodState` so `POST /flags/:key/rollback` can restore it.
 */

export const FLAG_SURFACES = ["APP_USER", "APP_AGENT", "CONSOLE", "BACKEND", "WEBSITE"] as const;
export type FlagSurface = (typeof FLAG_SURFACES)[number];

export const FLAG_SURFACE_LABEL: Record<FlagSurface, string> = {
    APP_USER: "User app",
    APP_AGENT: "Agent app",
    CONSOLE: "Console",
    BACKEND: "Backend",
    WEBSITE: "Website",
};

export const FLAG_KINDS = ["FEATURE", "KILL_SWITCH", "EXPERIMENT"] as const;
export type FlagKind = (typeof FLAG_KINDS)[number];

export const FLAG_KIND_LABEL: Record<FlagKind, string> = {
    FEATURE: "Feature",
    KILL_SWITCH: "Kill switch",
    EXPERIMENT: "Experiment",
};

export const FLAG_SOURCES = ["REGISTERED", "MANUAL"] as const;
export type FlagSource = (typeof FLAG_SOURCES)[number];

export const FLAG_SOURCE_LABEL: Record<FlagSource, string> = {
    REGISTERED: "Registered",
    MANUAL: "Manual",
};

/** Where the surfaces beyond the backend are declared: each package's `features.manifest.json`. */
export type ManifestSurface = Exclude<FlagSurface, "BACKEND">;

/** The rollout rules as stored: every list optional, an empty list meaning no restriction on that axis. */
export interface Rollout {
    roles?: string[];
    cities?: string[];
    userIds?: string[];
}

/** `{ enabled, rolloutPercent, variant, rollout }` — the position a rollback restores. */
export interface FlagPosition {
    enabled: boolean;
    rolloutPercent: number;
    variant: string | null;
    rollout: Rollout | null;
}

/** One change row exactly as the API sends it. */
export interface FlagChange {
    id: string;
    flagKey: string;
    enabled: boolean;
    rolloutPercent: number;
    variant: string | null;
    rollout: Rollout | null;
    byUserId: string;
    /** E6: the actor, joined — `name` null for an admin the platform no longer has. */
    byUser: { id: string; name: string | null };
    note: string | null;
    /** A rollback names the change it undid. */
    rollbackOfId: string | null;
    at: string;
}

/** The actor's name off a change, or the id when the platform no longer has them. */
export const changedByLabel = (change: Pick<FlagChange, "byUserId" | "byUser">): string =>
    change.byUser?.name?.trim() || change.byUserId;

/** A flag exactly as `GET /flags` sends it: the row plus the change that last moved it. */
export interface FeatureFlag {
    key: string;
    enabled: boolean;
    rolloutPercent: number;
    description: string | null;
    updatedById: string | null;
    surfaces: FlagSurface[];
    kind: FlagKind;
    source: FlagSource;
    owner: string | null;
    variant: string | null;
    variants: string[];
    rollout: Rollout | null;
    lastGoodState: FlagPosition | null;
    registeredAt: string | null;
    /** The keys this flag also answers to — what a Lot A call site still names. */
    aliases: string[];
    createdAt: string;
    updatedAt: string;
    lastChange: FlagChange | null;
}

/** One line of `GET /flags/registry`: the committed document's entry, with the row as it stands. */
export interface RegistryEntry {
    key: string;
    surfaces: FlagSurface[];
    kind: FlagKind;
    owner: string;
    launch: "on" | "dark";
    description: string;
    variants: string[];
    aliases: string[];
    /** Backend route prefixes and jobs, as declared. */
    routes: string[];
    jobs: string[];
    /** Per manifest surface, the paths that surface maps to the feature. */
    paths: Partial<Record<ManifestSurface, string[]>>;
    /** Where the feature is declared: `backend`, and each manifest surface that names it. Empty for a row the document does not know. */
    declaredIn: ("backend" | ManifestSurface)[];
    /** Null when the boot upsert has not given this entry a row yet. */
    flag: FeatureFlag | null;
}

/** G11-2: one surface's verdict from the backend's registry check — is the committed document behind the code on this surface. */
export interface SurfaceVerdict {
    surface: FlagSurface;
    behind: boolean;
    /** Why, one line each — empty when the surface is current. A surface that could not be compared says so here with `behind: false`. */
    reasons: string[];
}

/** G11-2: the check `npm run features:check` prints, served on the registry read. */
export interface RegistryCheck {
    /** No surface is behind. */
    current: boolean;
    surfaces: SurfaceVerdict[];
}

export interface RegistryRead {
    /** Null when the backend could not read `docs/feature-registry.json` at all. */
    generatedBy: string | null;
    features: RegistryEntry[];
    /** G11-2: the backend's own per-surface verdict. Absent on a backend older than the check. */
    check?: RegistryCheck;
}

/** `PATCH /flags/:key` — a patch. Naming none of the four is a 400, so the console refuses it first. */
export interface SetFlagInput {
    enabled?: boolean;
    rolloutPercent?: number;
    /** One of the row's `variants`, or null to run the default implementation. */
    variant?: string | null;
    /** The rollout rules, or null to clear them. */
    rollout?: Rollout | null;
    note?: string;
}

export const FLAG_NOTE_MAX = 500;
/** L-B: a bulk move always carries a reason — `bulkNoteSchema` is 4-500 characters after trimming. */
export const FLAG_NOTE_MIN = 4;

/* ------------------------------------------------------------------ */
/* L-B: the list's filters, its paged shape and the bulk write         */
/* ------------------------------------------------------------------ */

/** `?state=` — ON is enabled; DARK_LAUNCH is registered, off and never moved; OFF is off otherwise. */
export const FLAG_STATES = ["ON", "OFF", "DARK_LAUNCH"] as const;
export type FlagState = (typeof FLAG_STATES)[number];

export const FLAG_STATE_LABEL: Record<FlagState, string> = {
    ON: "On",
    OFF: "Off",
    DARK_LAUNCH: "Dark launch",
};

export const isFlagSurface = (value: string | null | undefined): value is FlagSurface =>
    (FLAG_SURFACES as readonly string[]).includes(value ?? "");
export const isFlagKind = (value: string | null | undefined): value is FlagKind => (FLAG_KINDS as readonly string[]).includes(value ?? "");
export const isFlagSource = (value: string | null | undefined): value is FlagSource =>
    (FLAG_SOURCES as readonly string[]).includes(value ?? "");
export const isFlagState = (value: string | null | undefined): value is FlagState => (FLAG_STATES as readonly string[]).includes(value ?? "");

/**
 * The filters `GET /flags` evaluates server-side (L-B), and the page that
 * switches its answer to the list contract. Without `page`/`pageSize` the
 * answer is the bare array, filtered or not.
 */
export interface FlagListQuery {
    surface?: FlagSurface;
    kind?: FlagKind;
    source?: FlagSource;
    state?: FlagState;
    /** Exact, case-insensitive. */
    owner?: string;
    /** A substring over key, description, owner and aliases. */
    q?: string;
    page?: number;
    pageSize?: number;
}

/** The query string `GET /flags` takes, with nothing sent that was not asked for. */
export function flagsPath(query: FlagListQuery = {}): string {
    const params = new URLSearchParams();
    if (query.surface) params.set("surface", query.surface);
    if (query.kind) params.set("kind", query.kind);
    if (query.source) params.set("source", query.source);
    if (query.state) params.set("state", query.state);
    if (query.owner?.trim()) params.set("owner", query.owner.trim());
    if (query.q?.trim()) params.set("q", query.q.trim());
    if (query.page !== undefined) params.set("page", String(query.page));
    if (query.pageSize !== undefined) params.set("pageSize", String(query.pageSize));
    const search = params.toString();
    return search ? `/flags?${search}` : "/flags";
}

/** The chip histograms on the paged read — each facet counted with its own filter removed, so a chip row stays a way back out. */
export interface FlagCounts {
    surface: Record<FlagSurface, number>;
    kind: Record<FlagKind, number>;
    state: Record<FlagState, number>;
}

/** `GET /flags?page&pageSize` — the list contract. */
export interface FlagListPage {
    items: FeatureFlag[];
    total: number;
    page: number;
    pageSize: number;
    counts: FlagCounts;
}

/** The patch `POST /flags/bulk` applies to every key named: the same four fields `PATCH /:key` takes, at least one of them. */
export type BulkFlagPatch = Omit<SetFlagInput, "note">;

/** `{ updated, skipped }` — what a bulk write or a bulk rollback answers. */
export interface BulkFlagResult {
    /** The rows written, in full. */
    updated: FeatureFlag[];
    /** A key already at the asked position, an alias named beside its key, or (on a rollback) a key that has never moved. */
    skipped: { key: string; reason: string }[];
}

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

/**
 * What the flag does for a caller with no subject, in words.
 *
 * Off is off. On at 100 is on for everyone, subject or not. On at anything
 * less is a bucketed rollout — deterministic per person, and "no" to an
 * anonymous caller — which is what the third label is warning about.
 */
export function rolloutLabel(flag: Pick<FeatureFlag, "enabled" | "rolloutPercent">): string {
    if (!flag.enabled) return "Off";
    if (flag.rolloutPercent >= 100) return "On for everyone";
    if (flag.rolloutPercent <= 0) return "On, 0% rollout";
    return `On for ${flag.rolloutPercent}% of users`;
}

/** "3 named accounts · ADMIN, AGENT · Bengaluru" — the rules beside the percentage, or null when there are none. */
export function rolloutRulesLabel(rollout: Rollout | null | undefined): string | null {
    if (!rollout) return null;
    const parts: string[] = [];
    if (rollout.userIds?.length) parts.push(`${rollout.userIds.length} named account${rollout.userIds.length === 1 ? "" : "s"}`);
    if (rollout.roles?.length) parts.push(rollout.roles.join(", "));
    if (rollout.cities?.length) parts.push(rollout.cities.join(", "));
    return parts.length ? parts.join(" · ") : null;
}

/**
 * A registered feature that arrived off: `launch: 'dark'` created the row
 * disabled and nobody has switched it on since. The badge on the row says
 * so, because an off flag that was never on is a different thing from a
 * kill switch somebody threw.
 */
export function isDarkLaunch(flag: Pick<FeatureFlag, "enabled" | "source" | "lastChange">): boolean {
    return flag.source === "REGISTERED" && !flag.enabled && flag.lastChange === null;
}

const stateOf = (row: Pick<FlagChange, "enabled" | "rolloutPercent">): string =>
    row.enabled ? `On · ${row.rolloutPercent}%` : "Off";

const sameList = (a: string[] | undefined, b: string[] | undefined): boolean => {
    const left = [...(a ?? [])].sort();
    const right = [...(b ?? [])].sort();
    return left.length === right.length && left.every((item, index) => item === right[index]);
};

/** Whether two rollout rule sets say the same thing — order and empty lists aside. */
export function sameRollout(a: Rollout | null | undefined, b: Rollout | null | undefined): boolean {
    return sameList(a?.roles, b?.roles) && sameList(a?.cities, b?.cities) && sameList(a?.userIds, b?.userIds);
}

type ChangeState = Pick<FlagChange, "enabled" | "rolloutPercent"> & Partial<Pick<FlagChange, "variant" | "rollout">>;

/**
 * "25% → 40%", "Off → On · 100%", "Variant default → treatment", "Rolled
 * back to On · 40%" — the one-cell summary of a change against the state
 * before it. Written from two change rows rather than stored, because the
 * server keeps states, not transitions. A rollback is named as one,
 * whatever it moved.
 */
export function changeSummary(change: ChangeState & Partial<Pick<FlagChange, "rollbackOfId">>, previous: ChangeState | null): string {
    if (change.rollbackOfId) return `Rolled back to ${stateOf(change)}${change.variant ? ` · ${change.variant}` : ""}`;
    if (!previous) return `Set to ${stateOf(change)}`;
    const moves: string[] = [];
    if (previous.enabled !== change.enabled) moves.push(`${stateOf(previous)} → ${stateOf(change)}`);
    else if (previous.rolloutPercent !== change.rolloutPercent) moves.push(`${previous.rolloutPercent}% → ${change.rolloutPercent}%`);
    if ((previous.variant ?? null) !== (change.variant ?? null)) {
        moves.push(`Variant ${previous.variant ?? "default"} → ${change.variant ?? "default"}`);
    }
    if (!sameRollout(previous.rollout, change.rollout)) {
        moves.push(`Rules: ${rolloutRulesLabel(change.rollout) ?? "none"}`);
    }
    return moves.length ? moves.join(" · ") : "No change";
}

/* ------------------------------------------------------------------ */
/* The rollout editor's validation                                     */
/* ------------------------------------------------------------------ */

/** A whole number from 0 to 100, or null — the rollout input holds text while somebody types. */
export function parseRollout(text: string): number | null {
    if (!/^\d{1,3}$/.test(text.trim())) return null;
    const value = Number(text.trim());
    return value <= 100 ? value : null;
}

/** The server's limits on the three lists (`rolloutSchema`). */
export const ROLLOUT_LIMITS = { roles: 20, cities: 200, userIds: 500 } as const;
const ROLE_PATTERN = /^[A-Z][A-Z_]*$/;

/** What the editor holds while somebody types: one comma- or newline-separated list per axis. */
export interface RolloutDraft {
    roles: string;
    cities: string;
    userIds: string;
}

/** The stored rules as editor text, one item per line. */
export function rolloutToDraft(rollout: Rollout | null | undefined): RolloutDraft {
    return {
        roles: (rollout?.roles ?? []).join("\n"),
        cities: (rollout?.cities ?? []).join("\n"),
        userIds: (rollout?.userIds ?? []).join("\n"),
    };
}

const splitList = (text: string, normalise: (item: string) => string = (item) => item): string[] => [
    ...new Set(
        text
            .split(/[\n,]/)
            .map((item) => normalise(item.trim()))
            .filter(Boolean),
    ),
];

export type RolloutDraftErrors = Partial<Record<keyof RolloutDraft, string>>;

/**
 * The rollout rules the editor would send, or the reasons it cannot.
 *
 * Mirrors `rolloutSchema`: a role is upper-case (`ADMIN`, `AGENT_PUBLISHER`),
 * a city is at most 80 characters, a user id at most 64, and each list has
 * a ceiling. Duplicates are folded here so the count the editor prints is
 * the count the server keeps. Three empty lists are `null` — no rules —
 * rather than an object of empty arrays, which the server would clean to
 * the same thing but the diff would call a move.
 */
export function parseRolloutDraft(draft: RolloutDraft): { rollout: Rollout | null; errors: RolloutDraftErrors } {
    const errors: RolloutDraftErrors = {};
    const roles = splitList(draft.roles, (role) => role.toUpperCase());
    const cities = splitList(draft.cities);
    const userIds = splitList(draft.userIds);

    const badRole = roles.find((role) => !ROLE_PATTERN.test(role));
    if (badRole) errors.roles = `"${badRole}" is not a role — letters and underscores, like AGENT_PUBLISHER.`;
    else if (roles.length > ROLLOUT_LIMITS.roles) errors.roles = `At most ${ROLLOUT_LIMITS.roles} roles.`;

    const badCity = cities.find((city) => city.length > 80);
    if (badCity) errors.cities = `"${badCity.slice(0, 20)}…" is longer than 80 characters.`;
    else if (cities.length > ROLLOUT_LIMITS.cities) errors.cities = `At most ${ROLLOUT_LIMITS.cities} cities.`;

    const badUser = userIds.find((id) => id.length > 64);
    if (badUser) errors.userIds = `"${badUser.slice(0, 20)}…" is longer than 64 characters.`;
    else if (userIds.length > ROLLOUT_LIMITS.userIds) errors.userIds = `At most ${ROLLOUT_LIMITS.userIds} named accounts.`;

    if (Object.keys(errors).length) return { rollout: null, errors };
    if (!roles.length && !cities.length && !userIds.length) return { rollout: null, errors };
    const rollout: Rollout = {};
    if (roles.length) rollout.roles = roles;
    if (cities.length) rollout.cities = cities;
    if (userIds.length) rollout.userIds = userIds;
    return { rollout, errors };
}

/** What the editor is asking for, once every field parsed. */
export interface FlagDraft {
    enabled: boolean;
    rolloutPercent: number;
    variant: string | null;
    rollout: Rollout | null;
    note: string;
}

/**
 * The patch the editor should send: only what moved, so widening the
 * rollout does not silently re-send a variant somebody else is switching.
 * Null when nothing moved, which the server would answer with a 400 anyway.
 * A variant not on the row's list is refused here before the server does.
 */
export function flagPatch(
    current: Pick<FeatureFlag, "enabled" | "rolloutPercent"> & Partial<Pick<FeatureFlag, "variant" | "variants" | "rollout">>,
    draft: Pick<FlagDraft, "enabled" | "rolloutPercent" | "note"> & Partial<Pick<FlagDraft, "variant" | "rollout">>,
): SetFlagInput | null {
    const patch: SetFlagInput = {};
    if (draft.enabled !== current.enabled) patch.enabled = draft.enabled;
    if (draft.rolloutPercent !== current.rolloutPercent) patch.rolloutPercent = draft.rolloutPercent;
    if (draft.variant !== undefined && draft.variant !== (current.variant ?? null)) {
        if (draft.variant !== null && !(current.variants ?? []).includes(draft.variant)) return null;
        patch.variant = draft.variant;
    }
    if (draft.rollout !== undefined && !sameRollout(draft.rollout, current.rollout)) patch.rollout = draft.rollout;
    if (patch.enabled === undefined && patch.rolloutPercent === undefined && patch.variant === undefined && patch.rollout === undefined) {
        return null;
    }
    const note = draft.note.trim();
    if (note) patch.note = note.slice(0, FLAG_NOTE_MAX);
    return patch;
}

/* ------------------------------------------------------------------ */
/* L-B: what a bulk move can ask, checked before the wire              */
/* ------------------------------------------------------------------ */

/** The state chip a row falls under — the server's own rule (`flagStateOf`), so a chip here and `?state=` there agree. */
export function flagStateOf(flag: Pick<FeatureFlag, "enabled" | "source" | "lastChange">): FlagState {
    if (isDarkLaunch(flag)) return "DARK_LAUNCH";
    return flag.enabled ? "ON" : "OFF";
}

/** Why the note cannot go — a bulk note is required, 4-500 characters once trimmed — or null when it can. */
export function bulkNoteError(note: string): string | null {
    const trimmed = note.trim();
    if (trimmed.length < FLAG_NOTE_MIN) {
        return `At least ${FLAG_NOTE_MIN} characters — a bulk move without a reason is the thing an incident review cannot reconstruct.`;
    }
    if (trimmed.length > FLAG_NOTE_MAX) return `At most ${FLAG_NOTE_MAX} characters.`;
    return null;
}

/**
 * The variant list every selected row shares, or the reason there is none.
 *
 * `POST /flags/bulk` refuses the whole batch when any key's `variants` do
 * not include the asked variant, so the bar's Set variant is enabled only
 * while one list fits every row: the same set on each (order aside), none
 * of them empty. The reason is what the disabled button says.
 */
export function sharedVariantsOf(
    flags: readonly Pick<FeatureFlag, "key" | "variants">[],
): { variants: string[]; reason: null } | { variants: null; reason: string } {
    const first = flags[0];
    if (!first) return { variants: null, reason: "Nothing selected." };
    const without = flags.filter((flag) => !flag.variants.length);
    if (without.length === flags.length) return { variants: null, reason: "None of the selected flags declares a variant." };
    if (without.length) {
        return {
            variants: null,
            reason: `${without.length} of the selected flags declare${without.length === 1 ? "s" : ""} no variant (${without[0]!.key}${without.length > 1 ? ", …" : ""}).`,
        };
    }
    const shared = [...first.variants].sort();
    const odd = flags.find((flag) => !sameList(flag.variants, shared));
    if (odd) return { variants: null, reason: `The selected flags do not share one variant set — ${first.key} and ${odd.key} differ.` };
    return { variants: shared, reason: null };
}

/* ------------------------------------------------------------------ */
/* Coverage — what the registry read says about each surface           */
/* ------------------------------------------------------------------ */

export interface SurfaceCoverage {
    surface: FlagSurface;
    /** Features the registry names on this surface. */
    features: number;
    /** Of those, how many have a row the console can switch. */
    withRow: number;
    /** Manual rows on this surface — created by hand, never touched by the upsert. */
    manual: number;
}

export interface ManifestCheck {
    surface: FlagSurface;
    ok: boolean;
    /** Why not, one line each — empty when ok. */
    problems: string[];
}

export interface Coverage {
    total: number;
    registered: number;
    manual: number;
    /** Registered rows that arrived off and have never moved. */
    dark: number;
    surfaces: SurfaceCoverage[];
    /**
     * G11-2: the backend's registry check, one verdict per surface — the
     * same one `npm run features:check` prints. Null when the backend does
     * not serve it; the card then says so rather than working one out.
     */
    check: RegistryCheck | null;
    /** Null when the backend could not read the committed document. */
    generatedBy: string | null;
}

/**
 * How many features per surface, how many manual against registered, and
 * the backend's verdict on whether each surface's manifest is where the
 * committed document says it is.
 *
 * G11-2: the verdict is the registry read's own `check` block — the fold
 * of the declarations and the manifests on disk against the committed
 * document, per surface, that `npm run features:check` also prints. The
 * console no longer derives one of its own from the rows and its bundled
 * manifest: the backend sees every manifest and every declaration, and
 * one checker means one answer.
 */
export function coverageOf(flags: FeatureFlag[], registry: RegistryRead): Coverage {
    const surfaces: SurfaceCoverage[] = FLAG_SURFACES.map((surface) => {
        const onSurface = registry.features.filter((entry) => entry.surfaces.includes(surface));
        return {
            surface,
            features: onSurface.length,
            withRow: onSurface.filter((entry) => entry.flag !== null).length,
            manual: flags.filter((flag) => flag.source === "MANUAL" && flag.surfaces.includes(surface)).length,
        };
    });

    return {
        total: flags.length,
        registered: flags.filter((flag) => flag.source === "REGISTERED").length,
        manual: flags.filter((flag) => flag.source === "MANUAL").length,
        dark: flags.filter(isDarkLaunch).length,
        surfaces,
        check: registry.check ?? null,
        generatedBy: registry.generatedBy,
    };
}

/** The check as the card lists it: one line per surface, in the registry's order, `ok` the inverse of `behind`. */
export function manifestChecksOf(check: RegistryCheck | null): ManifestCheck[] {
    if (!check) return [];
    return check.surfaces.map((verdict) => ({ surface: verdict.surface, ok: !verdict.behind, problems: verdict.reasons }));
}

/* ------------------------------------------------------------------ */
/* The operator's answers — `GET /flags/me`                            */
/* ------------------------------------------------------------------ */

export interface FlagAnswer {
    enabled: boolean;
    variant: string | null;
}

/**
 * G11-2: `GET /flags/me` — every flag on every surface as the server
 * evaluates it for the signed-in operator, `{ key: { enabled, variant } }`.
 * The console used to port the evaluator and take the SHA-1 bucket itself;
 * the same bucket, the same rules and the city through the port now
 * answer server-side, so the two cannot drift. Keys are canonical: a call
 * site must name the feature the way the registry does.
 */
export type OperatorAnswers = Record<string, FlagAnswer>;

/** The answer for one key, or "unknown" (null) — which a caller treats as off, the server's own rule for a key it does not know. */
export function answerFor(answers: OperatorAnswers, key: string): FlagAnswer | null {
    const answer = answers[key];
    if (!answer) return null;
    return { enabled: Boolean(answer.enabled), variant: answer.enabled ? (answer.variant ?? null) : null };
}

/* ------------------------------------------------------------------ */
/* The service                                                         */
/* ------------------------------------------------------------------ */

/**
 * Refuses to talk to the API while the domain is off. There is nothing to
 * fall back to, and a toggle that lands nowhere is the failure this guards.
 */
function live() {
    if (!isLive("flags")) throw new Error("Feature flags read the API; connect the console to the ADX backend first.");
    return http;
}

const keyPath = (key: string) => `/flags/${encodeURIComponent(key)}`;

export const flagsService = {
    /** Every flag, with the change that last moved it — L-B: or the ones a filter leaves, still the bare array. */
    list: async (query: Omit<FlagListQuery, "page" | "pageSize"> = {}): Promise<FeatureFlag[]> =>
        (await live().get<FeatureFlag[]>(flagsPath(query))) ?? [],

    /** L-B: one page on the list contract, `{ items, total, page, pageSize, counts }` — `pageSize` defaults to 50 server-side, 500 at most. */
    page: async (query: FlagListQuery & { page: number }): Promise<FlagListPage> => {
        const page = await live().get<Partial<FlagListPage>>(flagsPath({ pageSize: 50, ...query }));
        return {
            items: page?.items ?? [],
            total: page?.total ?? 0,
            page: page?.page ?? query.page,
            pageSize: page?.pageSize ?? query.pageSize ?? 50,
            counts: {
                surface: Object.fromEntries(FLAG_SURFACES.map((item) => [item, page?.counts?.surface?.[item] ?? 0])) as Record<FlagSurface, number>,
                kind: Object.fromEntries(FLAG_KINDS.map((item) => [item, page?.counts?.kind?.[item] ?? 0])) as Record<FlagKind, number>,
                state: Object.fromEntries(FLAG_STATES.map((item) => [item, page?.counts?.state?.[item] ?? 0])) as Record<FlagState, number>,
            },
        };
    },

    /**
     * L-B: `POST /flags/bulk` — one patch on every key, in one transaction
     * or none: a 404 names the unknown keys, a 400 the keys whose variants
     * do not include the asked one, and nothing is written either way. The
     * note is required (4-500); `bulkNoteError` says so before the wire.
     */
    bulk: (keys: string[], patch: BulkFlagPatch, note: string): Promise<BulkFlagResult> =>
        live().post<BulkFlagResult>("/flags/bulk", { keys, patch, note: note.trim().slice(0, FLAG_NOTE_MAX) }),

    /** L-B: `POST /flags/bulk/rollback` — every key back to its `lastGoodState` in one transaction; a key that never moved is skipped, not refused. ADMIN + `system.flags`. */
    bulkRollback: (keys: string[], note: string): Promise<BulkFlagResult> =>
        live().post<BulkFlagResult>("/flags/bulk/rollback", { keys, note: note.trim().slice(0, FLAG_NOTE_MAX) }),

    /** The committed document (every surface) merged with the rows; G11-2: with the backend's per-surface check. */
    registry: async (): Promise<RegistryRead> => (await live().get<RegistryRead>("/flags/registry")) ?? { generatedBy: null, features: [] },

    /** G11-2: the operator's own evaluation across every surface, `Cache-Control: no-store` — read once per session by `useFeature`. */
    me: async (): Promise<OperatorAnswers> => (await live().get<OperatorAnswers>("/flags/me")) ?? {},

    /** Moves a flag — `PATCH`, a patch. Lands with its change row, audited `FEATURE_FLAG_CHANGED`. */
    set: (key: string, input: SetFlagInput): Promise<FeatureFlag> => live().patch<FeatureFlag>(keyPath(key), input),

    /** Back to `lastGoodState`; 409 when the flag has never moved. Audited `FEATURE_FLAG_ROLLED_BACK`. */
    rollback: (key: string, note?: string): Promise<FeatureFlag> =>
        live().post<FeatureFlag>(`${keyPath(key)}/rollback`, note?.trim() ? { note: note.trim().slice(0, FLAG_NOTE_MAX) } : {}),

    /** That flag's history, newest first, capped at 50 by the server. */
    changes: async (key: string): Promise<FlagChange[]> => (await live().get<FlagChange[]>(`${keyPath(key)}/changes`)) ?? [],
};
