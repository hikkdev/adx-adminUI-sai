import { ApiError, api as http } from "@/lib/api-client";
import type { StatusMeta } from "@/types";
import type { PayoutMethodCheck } from "./finance";

/**
 * The verification layer, as the desk sees it — Cashfree Phase 2 (1 Oct 2026).
 *
 * Digio stays the KYC provider; Cashfree Secure ID is its backup and the
 * only provider of the single checks (PAN, bank, GSTIN, DigiLocker, face,
 * licence, vehicle). Every call either makes is an **attempt** on record
 * against a case. This file holds the vocabulary, the three desk reads and
 * writes (`/verification/attempts`, `/verification/health`,
 * `/verification/cases/:caseType/:caseId/resend-on-backup`), the two
 * Settings › Integrations sections (`secureId`, `verificationRouting`) and
 * the words the desk prints for a provider that could not be reached.
 *
 * The rule the layer is built round: a provider that could not answer (a
 * technical failure) is failed over; a provider that answered "no" gave a
 * BUSINESS answer, which is final. The panel prints the two differently.
 */

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

export const CHECK_TYPES = [
    "PAN",
    "BANK_ACCOUNT",
    "UPI_VPA",
    "GSTIN",
    "VEHICLE_RC",
    "DRIVING_LICENCE",
    "FACE_LIVENESS",
    "FACE_MATCH",
    "NAME_MATCH",
    "DIGILOCKER",
    "HOSTED_KYC",
] as const;
export type CheckType = (typeof CHECK_TYPES)[number];

/** A step of a session — the checks a person takes on ADX's own screens, plus PAPERS (the desk reads them). */
export type CheckKind = "DIGILOCKER" | "FACE_LIVENESS" | "FACE_MATCH" | "DRIVING_LICENCE" | "VEHICLE_RC" | "PAN" | "GSTIN" | "PAPERS" | "BANK_ACCOUNT" | "NAME_MATCH";

export type VerificationProvider = "DIGIO" | "CASHFREE_SECURE_ID";

export type VerificationCaseType = "PUBLISHER_KYC" | "ADVERTISER_KYC" | "AGENT_KYC" | "PRINT_PARTNER_KYC" | "EMPLOYEE_KYC" | "PAYOUT_METHOD" | "LISTING";

/** The five party cases the desk can send to the backup. */
export type KycCaseType = Extract<VerificationCaseType, "PUBLISHER_KYC" | "ADVERTISER_KYC" | "AGENT_KYC" | "PRINT_PARTNER_KYC" | "EMPLOYEE_KYC">;

/** What the desk calls each check and step. */
export const CHECK_LABEL: Record<CheckType | CheckKind, string> = {
    PAN: "PAN",
    BANK_ACCOUNT: "Bank account",
    UPI_VPA: "UPI ID",
    GSTIN: "GSTIN",
    VEHICLE_RC: "Vehicle RC",
    DRIVING_LICENCE: "Driving licence",
    FACE_LIVENESS: "Face liveness",
    FACE_MATCH: "Face match",
    NAME_MATCH: "Name match",
    DIGILOCKER: "DigiLocker",
    HOSTED_KYC: "Hosted KYC",
    PAPERS: "Business papers",
};

export const checkLabel = (check: string): string => CHECK_LABEL[check as CheckType] ?? check;

/** A provider's own label when the server sent none. */
export const PROVIDER_LABEL: Record<VerificationProvider, string> = {
    DIGIO: "Digio",
    CASHFREE_SECURE_ID: "Cashfree Secure ID",
};

export type StepStatus = "OPEN" | "PENDING" | "VERIFIED" | "FAILED" | "REVIEW";
export type SessionStatus = "OPEN" | "NEEDS_USER_ACTION" | "IN_REVIEW" | "VERIFIED" | "FAILED" | "EXPIRED";
export type AttemptStatus = "VERIFIED" | "FAILED" | "PENDING" | "NEEDS_USER_ACTION";

export interface StepView {
    check: CheckKind;
    required: boolean;
    status: StepStatus;
    at: string | null;
    failureCode: string | null;
    /** 0–3. */
    triesLeft: number;
}

export interface SessionView {
    id: string;
    provider: "CASHFREE";
    caseType: VerificationCaseType;
    caseId: string;
    workflowKey: string | null;
    status: SessionStatus;
    steps: StepView[];
    expiresAt: string;
    createdAt: string;
    updatedAt: string;
}

export const STEP_STATUS_META: Record<StepStatus, StatusMeta> = {
    OPEN: { label: "Open", tone: "neutral" },
    PENDING: { label: "Waiting", tone: "warning" },
    VERIFIED: { label: "Verified", tone: "success" },
    FAILED: { label: "Failed", tone: "danger" },
    REVIEW: { label: "Desk review", tone: "info" },
};

export const SESSION_STATUS_META: Record<SessionStatus, StatusMeta> = {
    OPEN: { label: "Open", tone: "neutral" },
    NEEDS_USER_ACTION: { label: "Waiting on the person", tone: "warning" },
    IN_REVIEW: { label: "In review", tone: "info" },
    VERIFIED: { label: "Verified", tone: "success" },
    FAILED: { label: "Failed", tone: "danger" },
    EXPIRED: { label: "Expired", tone: "neutral" },
};

export const ATTEMPT_STATUS_META: Record<AttemptStatus, StatusMeta> = {
    VERIFIED: { label: "Verified", tone: "success" },
    FAILED: { label: "Failed", tone: "danger" },
    PENDING: { label: "Pending", tone: "warning" },
    NEEDS_USER_ACTION: { label: "Waiting on the person", tone: "warning" },
};

/* ------------------------------------------------------------------ */
/* The desk's reads and writes                                         */
/* ------------------------------------------------------------------ */

/** One provider call made for a case. `result` is already PII-minimised by the server. */
export interface VerificationAttempt {
    id: string;
    caseType: VerificationCaseType;
    caseId: string;
    sessionId: string | null;
    checkType: CheckType;
    provider: VerificationProvider;
    providerLabel: string;
    attemptNo: number;
    verificationId: string;
    status: AttemptStatus;
    /** BUSINESS: the provider answered. Anything else: it could not answer — the technical class. */
    errorClass: string | null;
    failureCode: string | null;
    latencyMs: number | null;
    providerRef: string | null;
    nameMatchScore: number | null;
    result: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
}

export interface CaseAttempts {
    attempts: VerificationAttempt[];
    sessions: SessionView[];
    backup: { setting: "ON" | "OFF"; available: boolean };
}

export type BreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export const BREAKER_STATE_META: Record<BreakerState, StatusMeta> = {
    CLOSED: { label: "Answering", tone: "success" },
    OPEN: { label: "Left alone", tone: "danger" },
    HALF_OPEN: { label: "Trying again", tone: "warning" },
};

export interface ProviderHealth {
    name: VerificationProvider;
    label: string;
    configured: boolean;
    capabilities: CheckType[];
    breaker: { state: BreakerState; failures: number; openedAt: string | null; retryAt: string | null };
    last24h: { attempts: number; technicalFailures: number; successRate: number | null; p95LatencyMs: number | null };
    failoversToday: number;
}

export interface BreakerSettings {
    failures: number;
    windowMinutes: number;
    cooldownMinutes: number;
}

export interface VerificationHealth {
    at: string;
    hostedKycBackup: "ON" | "OFF";
    breakerSettings: BreakerSettings;
    providers: ProviderHealth[];
}

export interface ResendOnBackupResult {
    session: SessionView;
    notified: boolean;
}

export const verificationService = {
    /** `GET /verification/attempts` — every provider call for the case, newest first, its sessions, and whether the backup can be sent. Needs `kyc.view`. */
    attempts: (caseType: VerificationCaseType, caseId: string) =>
        http.get<CaseAttempts>(`/verification/attempts?${new URLSearchParams({ caseType, caseId }).toString()}`),

    /** `GET /verification/health` — per provider: configured, breaker, last 24 h, failovers today. Needs `kyc.view`. */
    health: () => http.get<VerificationHealth>("/verification/health"),

    /** `POST /verification/cases/:caseType/:caseId/resend-on-backup` — opens ADX's own identity check for the person. Needs `kyc.edit`; audited. */
    resendOnBackup: (caseType: KycCaseType, caseId: string) =>
        http.post<ResendOnBackupResult>(`/verification/cases/${caseType}/${encodeURIComponent(caseId)}/resend-on-backup`, {}),
};

/* ------------------------------------------------------------------ */
/* What the desk says                                                  */
/* ------------------------------------------------------------------ */

/** The raw provider status a KYC record carries when Digio could not be asked and the backup may be sent. */
export const PROVIDER_FAILED = "PROVIDER_FAILED";

export const RESEND_CONFIRM_TITLE = "Resend on backup?";
export const RESEND_CONFIRM = "Send this person ADX's own identity check? They'll get a notification to finish it in the app.";
export const resendToastTitle = (notified: boolean): string =>
    notified ? "Sent — they've been notified." : "Sent — they have no app account yet, so tell them yourself.";
export const BACKUP_SWITCHED_OFF = "The backup is switched off under Settings › Integrations › Verification routing.";

/** Was this attempt a provider's answer (BUSINESS), or a provider that could not answer? */
export const answeredByProvider = (attempt: Pick<VerificationAttempt, "errorClass">): boolean => attempt.errorClass === "BUSINESS";

/** The online provider a record's `method` names — Digio, Cashfree on the backup, or none. */
export type OnlineProvider = "DIGIO" | "CASHFREE";

export function onlineProviderOf(method: string | null | undefined): OnlineProvider | null {
    if (method === "CASHFREE") return "CASHFREE";
    if (method === "DIGIO") return "DIGIO";
    return null;
}

export const ONLINE_PROVIDER_LABEL: Record<OnlineProvider, string> = { DIGIO: "Digio", CASHFREE: "Cashfree" };

/** The chip for a record whose Digio could not be reached. */
export const PROVIDER_FAILED_META: StatusMeta = { label: "Digio couldn't be reached", tone: "warning" };

export const isProviderFailed = (status: string | null | undefined): boolean => status === PROVIDER_FAILED;

/**
 * A queue's method cell for an online check: the provider and its answer,
 * or the "Digio couldn't be reached" chip — never the raw PROVIDER_FAILED.
 */
export function onlineCheckMeta(provider: OnlineProvider | null | undefined, status: string | null | undefined): StatusMeta {
    if (isProviderFailed(status)) return PROVIDER_FAILED_META;
    const name = ONLINE_PROVIDER_LABEL[provider ?? "DIGIO"];
    switch ((status ?? "").toLowerCase()) {
        case "approved":
            return { label: `${name} · approved`, tone: "success" };
        case "rejected":
            return { label: `${name} · rejected`, tone: "danger" };
        default:
            return { label: `${name} · waiting`, tone: "warning" };
    }
}

/** The short word a roster prints for the method: the provider, "Digio couldn't be reached", or documents. */
export function methodWord(method: string | null | undefined, digioStatus: string | null | undefined): string | null {
    if (isProviderFailed(digioStatus)) return PROVIDER_FAILED_META.label;
    const provider = onlineProviderOf(method);
    return provider ? ONLINE_PROVIDER_LABEL[provider] : null;
}

/** The same word off a case's online check (`{ provider, status }`), or null for a documents case. */
export function onlineWordOf(digio: { provider?: OnlineProvider; status: string | null } | null | undefined): string | null {
    if (!digio) return null;
    if (isProviderFailed(digio.status)) return PROVIDER_FAILED_META.label;
    return ONLINE_PROVIDER_LABEL[digio.provider ?? "DIGIO"];
}

/**
 * A desk Digio request or restart that failed may carry
 * `details.backup = { available: true, caseType, caseId }` — the backup can
 * be sent for this case. The case, or null.
 */
export function backupOffer(cause: unknown): { caseType: KycCaseType; caseId: string } | null {
    if (!(cause instanceof ApiError)) return null;
    const backup = (cause.details as { backup?: { available?: unknown; caseType?: unknown; caseId?: unknown } } | null | undefined)?.backup;
    if (!backup || backup.available !== true || typeof backup.caseType !== "string" || typeof backup.caseId !== "string") return null;
    return { caseType: backup.caseType as KycCaseType, caseId: backup.caseId };
}

/** Why the resend was refused — the server's own sentence for 409 BACKUP_NOT_AVAILABLE and KYC_ALREADY_VERIFIED, a plain one for a 404. */
export function resendRefusal(cause: unknown): string {
    if (cause instanceof ApiError) {
        if (cause.code === "BACKUP_NOT_AVAILABLE" || cause.code === "KYC_ALREADY_VERIFIED") return cause.message;
        if (cause.status === 404) return "This account is no longer there.";
        return cause.message;
    }
    return "The backup could not be sent.";
}

/** Latency as the desk reads it. */
export const formatLatency = (ms: number | null | undefined): string =>
    ms === null || ms === undefined ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;

/** A `result` value as one line — objects are shown as JSON, nothing is ever unmasked here. */
export function resultValue(value: unknown): string {
    if (value === null || value === undefined) return "—";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return JSON.stringify(value);
}

/* ------------------------------------------------------------------ */
/* Payout methods: the penny drop's refusals                           */
/* ------------------------------------------------------------------ */

/**
 * The two refusals a penny drop can answer since the verification router
 * took it over: a UPI id with no check chosen (or one only the holder can
 * take), and a bank method missing its number or IFSC. The desk's words, or
 * null for any other failure.
 */
export function pennyDropRefusal(cause: unknown): string | null {
    if (!(cause instanceof ApiError)) return null;
    const details = (cause.details ?? {}) as { reason?: unknown; code?: unknown };
    if (cause.code === "UPI_CHECK_NOT_CONFIGURED") {
        return details.reason === "NOT_CHOSEN"
            ? "UPI IDs can't be checked from the desk yet — not until a UPI check is chosen in Settings › Integrations › Verification routing."
            : "UPI IDs can't be checked from the desk yet. Verify this one by hand.";
    }
    if (cause.code === "VERIFICATION_UNAVAILABLE" && details.code === "NOTHING_TO_CHECK") return "This method is missing what the check needs: an account number and IFSC, or a UPI ID.";
    return null;
}

/**
 * A "Check UPI ID" that did not verify (2 Oct 2026): 409 for an answer —
 * not found, a name that does not match, a refusal — and 503 when nobody
 * could answer. Both carry the answer on `details.check`; the backend's
 * sentence is the message. Null for any other failure.
 */
export function upiCheckFailure(cause: unknown): { check: PayoutMethodCheck | null; message: string } | null {
    if (!(cause instanceof ApiError) || cause.code !== "VERIFICATION_UNAVAILABLE") return null;
    const details = (cause.details ?? {}) as { code?: unknown; check?: unknown };
    if (details.code === "NOTHING_TO_CHECK") return null;
    const check = details.check && typeof details.check === "object" ? (details.check as PayoutMethodCheck) : null;
    return { check, message: cause.message };
}

/* ------------------------------------------------------------------ */
/* Settings › Integrations: Secure ID                                  */
/* ------------------------------------------------------------------ */

/** `GET /integrations` → `secureId`. The secret masked, the PEM never — only whether one is loaded and its fingerprint. */
export interface SecureIdSettings {
    clientId: string | null;
    clientSecret: string | null;
    publicKey: string | null;
    publicKeyFingerprint: string | null;
    testMode: boolean;
    configured: boolean;
    signing: "PUBLIC_KEY" | "IP_WHITELIST";
    baseUrl: string;
    source: "SETTINGS" | "ENV" | null;
}

export interface SecureIdDraft {
    clientId: string;
    clientSecret: string;
    publicKey: string;
    removePublicKey: boolean;
    testMode: boolean;
}

export const secureIdDraftOf = (stored: SecureIdSettings): SecureIdDraft => ({
    clientId: stored.clientId ?? "",
    clientSecret: "",
    publicKey: "",
    removePublicKey: false,
    testMode: stored.testMode,
});

/** The strict patch: the client id when it moved, a secret or PEM only when typed (blank keeps), `publicKey: null` to remove, the mode when it moved. */
export function secureIdPatch(stored: SecureIdSettings, draft: SecureIdDraft): Record<string, string | boolean | null> {
    const patch: Record<string, string | boolean | null> = {};
    const clientId = draft.clientId.trim();
    if (clientId && clientId !== (stored.clientId ?? "")) patch.clientId = clientId;
    const secret = draft.clientSecret.trim();
    if (secret && !secret.startsWith("••••")) patch.clientSecret = secret;
    if (draft.removePublicKey) patch.publicKey = null;
    else if (draft.publicKey.trim()) patch.publicKey = draft.publicKey.trim();
    if (draft.testMode !== stored.testMode) patch.testMode = draft.testMode;
    return patch;
}

export const ENCRYPTION_KEY_MISSING = "Set INTEGRATIONS_ENCRYPTION_KEY on the server before saving keys.";

/** A save's failure in the desk's words: the encryption-key 503 by name, a 400's own person-facing sentence otherwise. */
export function integrationSaveError(cause: unknown, fallback: string): string {
    if (cause instanceof ApiError) {
        if (cause.code === "ENCRYPTION_KEY_MISSING") return ENCRYPTION_KEY_MISSING;
        const fields = Object.values(cause.fieldErrors).flat();
        if (cause.status === 400 && fields.length > 0) return fields.join(" ");
        return cause.message;
    }
    return cause instanceof Error ? cause.message : fallback;
}

/* ------------------------------------------------------------------ */
/* Settings › Integrations: verification routing                       */
/* ------------------------------------------------------------------ */

/**
 * How a UPI payout ID is checked (2 Oct 2026: the owner's decision — Digio's
 * lookup is the main check, and the backend's default). In the order the
 * card offers them.
 */
export type UpiCheck = "VPA_LOOKUP" | "PENNY_DROP" | "REVERSE_PENNY_DROP" | "NONE";

export const UPI_CHECK_ORDER: UpiCheck[] = ["VPA_LOOKUP", "PENNY_DROP", "REVERSE_PENNY_DROP", "NONE"];

export const UPI_CHECK_LABEL: Record<UpiCheck, string> = {
    VPA_LOOKUP: "Digio UPI lookup (recommended)",
    PENNY_DROP: "Cashfree ₹1 UPI transaction (needs the person's consent)",
    REVERSE_PENNY_DROP: "Reverse penny drop (the person pays ₹1)",
    NONE: "Don't check UPI IDs",
};

/** One line under the select, for the choice in it. */
export const UPI_CHECK_DESCRIPTION: Record<UpiCheck, string> = {
    VPA_LOOKUP: "Looks the UPI ID up with Digio: active or not, and the name on the account. No money moves.",
    PENNY_DROP: "Cashfree sends ₹1 to the UPI ID. The person has to agree first, so the desk can't run it for them.",
    REVERSE_PENNY_DROP: "The person pays ₹1 from the UPI ID, and the name comes back with it. The desk can't run it for them.",
    NONE: "UPI payout methods are only verified by hand.",
};

/** The options to draw: the backend's catalogue in the card's order, a value the console does not know last. */
export function upiCheckOptions(catalogue: string[]): string[] {
    if (catalogue.length === 0) return UPI_CHECK_ORDER;
    const known = UPI_CHECK_ORDER.filter((value) => catalogue.includes(value));
    return [...known, ...catalogue.filter((value) => !(UPI_CHECK_ORDER as string[]).includes(value))];
}

export interface CheckRoute {
    primary: VerificationProvider;
    fallbacks: VerificationProvider[];
}

export interface CompositeStep {
    step: CheckKind;
    required: boolean;
}

/** `GET /integrations` → `verificationRouting`: the settings in force, defaults filled in, and the catalogue the card is drawn from. */
export interface VerificationRoutingSettings {
    checks: Record<CheckType, CheckRoute>;
    breaker: BreakerSettings;
    composites: Record<string, CompositeStep[]>;
    nameMatchMin: number;
    upiCheck: UpiCheck;
    hostedKycBackup: "ON" | "OFF";
    /** What a reset restores — the defaults the stored subset lies over. Absent on a server older than the routing defaults. */
    defaults?: RoutingDefaults;
    catalogue: {
        checks: CheckType[];
        providers: { name: VerificationProvider; label: string; capabilities: CheckType[] }[];
        steps: CheckKind[];
        upiChecks: string[];
    };
}

/** `verificationRouting.defaults` — the values a "Reset" goes back to. */
export interface RoutingDefaults {
    checks: Record<CheckType, CheckRoute>;
    breaker: BreakerSettings;
    composites: Record<string, CompositeStep[]>;
    nameMatchMin: number;
}

/** A primary and at most two fallbacks. */
export const MAX_FALLBACKS = 2;

/** The providers the card may offer for a check: those whose capabilities include it. */
export function providersFor(settings: Pick<VerificationRoutingSettings, "catalogue">, check: CheckType): { name: VerificationProvider; label: string }[] {
    return settings.catalogue.providers.filter((provider) => provider.capabilities.includes(check));
}

/** Why a route is refused before the round trip; null when the server would take it. */
export function routeProblem(route: CheckRoute, offered: readonly VerificationProvider[]): string | null {
    if (route.fallbacks.length > MAX_FALLBACKS) return "At most two fallbacks.";
    if (route.fallbacks.includes(route.primary)) return "A fallback can't be the primary.";
    if (new Set(route.fallbacks).size !== route.fallbacks.length) return "A provider can be a fallback only once.";
    if (![route.primary, ...route.fallbacks].every((name) => offered.includes(name))) return "That provider can't answer this check.";
    return null;
}

/** Why a composite is refused before the round trip; null when the server would take it. */
export function compositeProblem(steps: readonly CompositeStep[]): string | null {
    if (steps.length === 0) return "Keep at least one step, or reset to the default.";
    if (new Set(steps.map((row) => row.step)).size !== steps.length) return "A step can appear only once.";
    return null;
}

export const sameRoute = (a: CheckRoute, b: CheckRoute) => a.primary === b.primary && a.fallbacks.join(",") === b.fallbacks.join(",");
export const sameSteps = (a: readonly CompositeStep[], b: readonly CompositeStep[]) =>
    a.length === b.length && a.every((row, index) => row.step === b[index]!.step && row.required === b[index]!.required);

/** What the routing card edits; `null` on a check or a composite is "Reset to default". */
export interface RoutingDraft {
    checks: Partial<Record<CheckType, CheckRoute | null>>;
    breaker: BreakerSettings;
    composites: Record<string, CompositeStep[] | null>;
    nameMatchMin: number;
    upiCheck: UpiCheck;
    hostedKycBackup: "ON" | "OFF";
}

export const routingDraftOf = (stored: VerificationRoutingSettings): RoutingDraft => ({
    checks: { ...stored.checks },
    breaker: { ...stored.breaker },
    composites: Object.fromEntries(Object.entries(stored.composites).map(([key, steps]) => [key, steps.map((row) => ({ ...row }))])),
    nameMatchMin: stored.nameMatchMin,
    upiCheck: stored.upiCheck,
    hostedKycBackup: stored.hostedKycBackup,
});

/** The strict per-key patch the server merges: only what moved, `null` for a reset. */
export function routingPatch(stored: VerificationRoutingSettings, draft: RoutingDraft): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    const checks: Record<string, CheckRoute | null> = {};
    for (const check of Object.keys(draft.checks) as CheckType[]) {
        const next = draft.checks[check];
        if (next === undefined) continue;
        if (next === null) {
            // A reset of a row already on its default moves nothing.
            const fallback = stored.defaults?.checks[check];
            if (!(fallback && stored.checks[check] && sameRoute(stored.checks[check], fallback))) checks[check] = null;
        } else if (!stored.checks[check] || !sameRoute(next, stored.checks[check])) checks[check] = { primary: next.primary, fallbacks: [...next.fallbacks] };
    }
    if (Object.keys(checks).length) patch.checks = checks;

    const breaker: Partial<BreakerSettings> = {};
    for (const key of ["failures", "windowMinutes", "cooldownMinutes"] as const) if (draft.breaker[key] !== stored.breaker[key]) breaker[key] = draft.breaker[key];
    if (Object.keys(breaker).length) patch.breaker = breaker;

    const composites: Record<string, CompositeStep[] | null> = {};
    for (const [key, steps] of Object.entries(draft.composites)) {
        if (steps === null) {
            const fallback = stored.defaults?.composites[key];
            if (!(fallback && stored.composites[key] && sameSteps(stored.composites[key], fallback))) composites[key] = null;
        } else if (!stored.composites[key] || !sameSteps(steps, stored.composites[key])) composites[key] = steps.map((row) => ({ step: row.step, required: row.required }));
    }
    if (Object.keys(composites).length) patch.composites = composites;

    if (draft.nameMatchMin !== stored.nameMatchMin) patch.nameMatchMin = draft.nameMatchMin;
    if (draft.upiCheck !== stored.upiCheck) patch.upiCheck = draft.upiCheck;
    if (draft.hostedKycBackup !== stored.hostedKycBackup) patch.hostedKycBackup = draft.hostedKycBackup;
    return patch;
}

/**
 * Does this row differ from the default? A route or a step list against
 * `defaults`; false when the server sent no defaults (nothing to compare)
 * and for a row whose reset is pending (null — it IS the default then).
 */
export function routeChanged(defaults: RoutingDefaults | undefined, check: CheckType, route: CheckRoute | null | undefined): boolean {
    const fallback = defaults?.checks[check];
    return Boolean(fallback && route && !sameRoute(route, fallback));
}

export function stepsChanged(defaults: RoutingDefaults | undefined, key: string, steps: readonly CompositeStep[] | null | undefined): boolean {
    const fallback = defaults?.composites[key];
    return Boolean(fallback && steps && !sameSteps(steps, fallback));
}

export function breakerChanged(defaults: RoutingDefaults | undefined, breaker: BreakerSettings): boolean {
    const fallback = defaults?.breaker;
    return Boolean(fallback && (["failures", "windowMinutes", "cooldownMinutes"] as const).some((key) => breaker[key] !== fallback[key]));
}

/** The first thing in the draft the server would refuse, or null. */
export function routingDraftProblem(settings: VerificationRoutingSettings, draft: RoutingDraft): string | null {
    for (const check of Object.keys(draft.checks) as CheckType[]) {
        const route = draft.checks[check];
        if (!route) continue;
        const problem = routeProblem(route, providersFor(settings, check).map((provider) => provider.name));
        if (problem) return `${checkLabel(check)}: ${problem}`;
    }
    for (const [key, value] of Object.entries(draft.breaker)) {
        const max = key === "failures" ? 100 : 24 * 60;
        if (!Number.isInteger(value) || value < 1 || value > max) return `The breaker's numbers are whole numbers from 1 to ${max}.`;
    }
    for (const [key, steps] of Object.entries(draft.composites)) {
        if (!steps) continue;
        const problem = compositeProblem(steps);
        if (problem) return `${key}: ${problem}`;
    }
    if (!Number.isFinite(draft.nameMatchMin) || draft.nameMatchMin < 0 || draft.nameMatchMin > 100) return "The name match minimum is 0 to 100.";
    return null;
}
