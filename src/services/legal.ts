import { api as http } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";

/**
 * The read documents, the app's own status, and the safety queue — DR 07's
 * wave 4 on the console side (D2, D3, D4).
 *
 * Like agreements, and for the same reason, there are **no fixtures**: a
 * seeded privacy policy would look exactly like a published one to the person
 * deciding whether the terms are ready, and a seeded app status would tell ops
 * every build was supported when nobody had said so. The screens say "not
 * connected" instead.
 */

export type LegalKind =
    | "PRIVACY_POLICY"
    | "TERMS_OF_SERVICE"
    | "REFUND_POLICY"
    | "CONTENT_POLICY"
    | "COMMUNITY_GUIDELINES"
    | "COMMISSION_STRUCTURE"
    | "CODE_OF_CONDUCT"
    | "LEGAL_DISCLAIMER"
    | "CONTACT_INFO"
    | "ABOUT"
    | "FAQ"
    | "SAFETY_GUIDELINES"
    | "OPEN_SOURCE_LICENSES";

export type DocumentState = "DRAFT" | "ACTIVE" | "SUPERSEDED";

export const DOCUMENT_STATE_META: Record<DocumentState, { label: string; tone: "info" | "success" | "neutral" }> = {
    DRAFT: { label: "Draft", tone: "info" },
    ACTIVE: { label: "Live", tone: "success" },
    SUPERSEDED: { label: "Superseded", tone: "neutral" },
};

export interface KindMeta {
    label: string;
    blurb: string;
    /** Contact info and FAQs carry a structured payload beside the markdown. */
    structured: boolean;
}

export const LEGAL_KIND_META: Record<LegalKind, KindMeta> = {
    PRIVACY_POLICY: { label: "Privacy policy", blurb: "How we collect and use your data", structured: false },
    TERMS_OF_SERVICE: { label: "Terms of service", blurb: "User agreement and platform rules", structured: false },
    REFUND_POLICY: { label: "Refund policy", blurb: "When money comes back, and how", structured: false },
    CONTENT_POLICY: { label: "Content policy", blurb: "What may be advertised, and where", structured: false },
    COMMUNITY_GUIDELINES: { label: "Community guidelines", blurb: "Professional conduct expectations", structured: false },
    COMMISSION_STRUCTURE: { label: "Commission structure", blurb: "Earnings methodology and payment terms", structured: false },
    CODE_OF_CONDUCT: { label: "Code of conduct", blurb: "Integrity and dispute resolution", structured: false },
    LEGAL_DISCLAIMER: { label: "Legal disclaimer", blurb: "Limits of liability and of advice", structured: false },
    CONTACT_INFO: { label: "Contact info", blurb: "Office, support line and email", structured: true },
    ABOUT: { label: "About ADX", blurb: "Who runs the platform", structured: false },
    FAQ: { label: "FAQs", blurb: "Common questions, answered", structured: true },
    SAFETY_GUIDELINES: { label: "Safety guidelines", blurb: "Working at height, electrical, traffic", structured: false },
    OPEN_SOURCE_LICENSES: { label: "Open source licenses", blurb: "The software this app is built on", structured: false },
};

/** The order the editor's rail lists them in: the ten policies, then the three structured. */
export const LEGAL_KIND_ORDER: LegalKind[] = [
    "PRIVACY_POLICY",
    "TERMS_OF_SERVICE",
    "REFUND_POLICY",
    "CONTENT_POLICY",
    "COMMUNITY_GUIDELINES",
    "COMMISSION_STRUCTURE",
    "CODE_OF_CONDUCT",
    "LEGAL_DISCLAIMER",
    "ABOUT",
    "SAFETY_GUIDELINES",
    "OPEN_SOURCE_LICENSES",
    "CONTACT_INFO",
    "FAQ",
];

export interface LegalDocument {
    id: string;
    kind: LegalKind;
    version: number;
    title: string;
    summary: string | null;
    body: string;
    meta: unknown;
    isActive: boolean;
    effectiveFrom: string;
    activatedAt: string | null;
    retiredAt: string | null;
    createdByUserId: string | null;
    changeNote: string | null;
    createdAt: string;
    updatedAt: string;
    state: DocumentState;
}

export interface CreateDocumentInput {
    kind: LegalKind;
    title: string;
    summary?: string;
    body: string;
    meta?: Record<string, unknown>;
    changeNote?: string;
    activate?: boolean;
}

export interface UpdateDocumentInput {
    title?: string;
    summary?: string | null;
    body?: string;
    meta?: Record<string, unknown> | null;
    changeNote?: string | null;
}

export type ServiceState = "UP" | "DEGRADED" | "DOWN";

export interface AppStatus {
    minimumBuild: { android: number; ios: number };
    latestBuild: { android: number; ios: number };
    storeUrl: { android: string; ios: string };
    maintenance: { active: boolean; message?: string; until?: string };
    incident?: { title: string; message: string; since?: string; severity: "INFO" | "WARNING" | "CRITICAL" } | null;
    services: { key: string; label: string; state: ServiceState; note?: string }[];
    updatedAt: string;
}

export type SafetyAlertKind = "UNSAFE_SITE" | "HARASSMENT" | "ACCIDENT" | "LOCATION_SHARE" | "OTHER";
export type SafetyAlertStatus = "OPEN" | "ACKNOWLEDGED" | "CLOSED";

export const SAFETY_KIND_LABEL: Record<SafetyAlertKind, string> = {
    UNSAFE_SITE: "Unsafe site",
    HARASSMENT: "Harassment",
    ACCIDENT: "Accident",
    LOCATION_SHARE: "Live location",
    OTHER: "Other",
};

export const SAFETY_STATUS_META: Record<SafetyAlertStatus, { label: string; tone: "danger" | "warning" | "success" }> = {
    OPEN: { label: "Open", tone: "danger" },
    ACKNOWLEDGED: { label: "On it", tone: "warning" },
    CLOSED: { label: "Closed", tone: "success" },
};

export interface SafetyAlert {
    id: string;
    displayId: string;
    raisedByUserId: string;
    kind: SafetyAlertKind;
    orderId: string | null;
    note: string | null;
    latitude: number | null;
    longitude: number | null;
    blockedOrder: boolean;
    status: SafetyAlertStatus;
    opsNote: string | null;
    acknowledgedAt: string | null;
    closedAt: string | null;
    createdAt: string;
    raisedBy: { id: string; name: string | null; mobile: string };
    order: { id: string; status: string; listing: { title: string; address: string; city: string | null } | null } | null;
}

/** These screens read the API or say they cannot; there is no seeded stand-in. */
export const legalReadsApi = (): boolean => apiConfig.live;

export const versionLabel = (document: Pick<LegalDocument, "version">): string => `v${document.version}`;

export function versionsOf(documents: LegalDocument[], kind: LegalKind): LegalDocument[] {
    return documents.filter((document) => document.kind === kind).sort((a, b) => b.version - a.version);
}

export function liveVersion(documents: LegalDocument[], kind: LegalKind): LegalDocument | null {
    return documents.find((document) => document.kind === kind && document.state === "ACTIVE") ?? null;
}

/** Whether a kind is still on the seeded placeholder ADX Legal has to replace. */
export function isPlaceholder(document: LegalDocument | null): boolean {
    if (!document) return false;
    if ((document.meta as { placeholder?: boolean } | null)?.placeholder) return true;
    return document.title.toLowerCase().includes("placeholder");
}

export interface KindCoverage {
    live: LegalDocument | null;
    versions: number;
    placeholder: boolean;
}

export function kindCoverage(documents: LegalDocument[]): Record<LegalKind, KindCoverage> {
    const coverage = {} as Record<LegalKind, KindCoverage>;
    for (const kind of LEGAL_KIND_ORDER) {
        const live = liveVersion(documents, kind);
        coverage[kind] = { live, versions: versionsOf(documents, kind).length, placeholder: isPlaceholder(live) };
    }
    return coverage;
}

/** How many kinds still carry a placeholder — the number that blocks a launch. */
export const placeholderCount = (documents: LegalDocument[]): number =>
    LEGAL_KIND_ORDER.filter((kind) => isPlaceholder(liveVersion(documents, kind))).length;

export const legalService = {
    documents: (kind?: LegalKind) => http.get<LegalDocument[]>(`/legal/documents${kind ? `?kind=${kind}` : ""}`),
    document: (id: string) => http.get<LegalDocument>(`/legal/documents/${id}`),
    create: (input: CreateDocumentInput) => http.post<LegalDocument>("/legal/documents", input),
    update: (id: string, patch: UpdateDocumentInput) => http.patch<LegalDocument>(`/legal/documents/${id}`, patch),
    discard: (id: string) => http.delete<void>(`/legal/documents/${id}`),
    activate: (id: string) => http.post<LegalDocument>(`/legal/documents/${id}/activate`),

    /* D3 — what a build must know before it can run. */
    appStatus: () => http.get<AppStatus>("/app/status"),
    saveAppStatus: (status: Omit<AppStatus, "updatedAt">) => http.put<AppStatus>("/app/status", status),

    /* D4 — the queue a safety report lands in. */
    safetyAlerts: (status?: SafetyAlertStatus) => http.get<SafetyAlert[]>(`/safety/alerts${status ? `?status=${status}` : ""}`),
    updateAlert: (id: string, patch: { status?: SafetyAlertStatus; opsNote?: string }) =>
        http.patch<SafetyAlert>(`/safety/alerts/${id}`, patch),
};
