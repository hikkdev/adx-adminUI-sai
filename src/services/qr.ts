import { api as http, type BlobResult } from "@/lib/api-client";
import { apiConfig, isLive } from "@/lib/api-config";
import type { StatusMeta } from "@/types";

/**
 * QR codes — the signed tokens the platform's physical touchpoints run on,
 * wired to the backend `qr` module.
 *
 * `GET /qr/:qrId` is the app-facing read the pickup-code card has always
 * drawn. K-B1 adds the desk: the list with what each code names, a code's
 * scans, one person's scans, generate, regenerate and deactivate with a
 * reason. The image routes are public on purpose — an `<img>` cannot send a
 * bearer token — so `imagePngUrl` and `imageSvgUrl` render directly.
 */

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

export type QrType = "SITE" | "AD" | "AGENT" | "ORDER" | "PUBLISHER" | "ACCESS_GRANT" | "ADVERTISER";
export const QR_TYPES: readonly QrType[] = ["SITE", "AD", "AGENT", "ORDER", "PUBLISHER", "ACCESS_GRANT", "ADVERTISER"];

export const QR_TYPE_LABEL: Record<QrType, string> = {
    SITE: "Site",
    AD: "Ad",
    AGENT: "Agent",
    ORDER: "Order",
    PUBLISHER: "Publisher",
    ACCESS_GRANT: "Access grant",
    ADVERTISER: "Advertiser",
};

/** What each type's ref names — the sentence under the type picker. */
export const QR_TYPE_DESCRIPTION: Record<QrType, string> = {
    SITE: "A listed spot — onboarding for an agent-publisher, an order check-in for an agent-advertiser.",
    AD: "A running placement, for its periodic health check.",
    AGENT: "An agent's referral code.",
    ORDER: "One order — the check-in, or the pickup code on a print package.",
    PUBLISHER: "A publisher's identity code; the agent who scans it starts their onboarding.",
    ACCESS_GRANT: "A delegated-access grant a publisher hands an assigned agent.",
    ADVERTISER: "An advertiser's identity code — the door-to-door code, demand side.",
};

/** The roles a code can be restricted to. ADMIN scans; PARTNER does not. */
export type ScanningRole = "AGENT_PUBLISHER" | "AGENT_ADVERTISER" | "PUBLISHER" | "ADVERTISER" | "ADMIN";
export const SCANNING_ROLES: readonly ScanningRole[] = ["AGENT_PUBLISHER", "AGENT_ADVERTISER", "PUBLISHER", "ADVERTISER", "ADMIN"];

/** The outcomes a scan row records — every attempt, refusals included. */
export const SCAN_OUTCOMES = ["GRANTED", "PENDING_APPROVAL", "EXPIRED", "ALREADY_USED", "NOT_AN_AGENT", "USER_DECLINED"] as const;
export type ScanOutcome = (typeof SCAN_OUTCOMES)[number];

export const SCAN_OUTCOME_META: Record<ScanOutcome, StatusMeta> = {
    GRANTED: { label: "Granted", tone: "success" },
    PENDING_APPROVAL: { label: "Awaiting approval", tone: "warning" },
    EXPIRED: { label: "Expired", tone: "neutral" },
    ALREADY_USED: { label: "Already used", tone: "danger" },
    NOT_AN_AGENT: { label: "Not an agent", tone: "danger" },
    USER_DECLINED: { label: "Declined", tone: "danger" },
};

/** A row's outcome, drawn as a badge — an outcome this file does not know is shown as it came. */
export function scanOutcomeMeta(outcome: string): StatusMeta {
    return SCAN_OUTCOME_META[outcome as ScanOutcome] ?? { label: outcome.replace(/_/g, " ").toLowerCase(), tone: "neutral" };
}

/* ------------------------------------------------------------------ */
/* The wire                                                            */
/* ------------------------------------------------------------------ */

/** One QR code, as `GET /qr/:qrId` describes it. */
export interface QrView {
    qrId: string;
    type: QrType | string;
    refId: string;
    token: string;
    metadata: Record<string, unknown> | null;
    isActive: boolean;
    dataUrl: string;
    pngUrl: string;
    svgUrl: string;
}

/** What a code's `refId` names, resolved by the server; `label` and `href` are null when the subject is gone. */
export interface QrRef {
    kind: string;
    id: string;
    label: string | null;
    displayId: string | null;
    href: string | null;
}

/** One row of `GET /qr` — the desk's list. */
export interface QrDeskRow {
    id: string;
    type: QrType;
    refId: string;
    ref: QrRef;
    isActive: boolean;
    expiresAt: string | null;
    scansCount: number;
    lastScanAt: string | null;
    createdAt: string;
    imagePngUrl: string;
    imageSvgUrl: string;
}

/** The designed-list contract: one page, a total, and counts per facet value with the facet removed. */
export interface QrPage<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    counts: Record<string, number>;
}

/** One row of `GET /qr/:qrId/scans`. */
export interface QrScanRow {
    id: string;
    qrId: string;
    scannedBy: { id: string; name: string; mobile: string };
    role: string | null;
    action: string | null;
    outcome: string;
    latitude: number | null;
    longitude: number | null;
    distanceM: number | null;
    decidedAt: string | null;
    grantId: string | null;
    createdAt: string;
}

/** One row of `GET /qr/scans?scannedById=` — a person's scans, each with its code. */
export interface ScanByRow {
    id: string;
    qrId: string;
    scannedById: string;
    role: string | null;
    action: string | null;
    outcome: string;
    latitude: number | null;
    longitude: number | null;
    distanceM: number | null;
    decidedAt: string | null;
    grantId: string | null;
    createdAt: string;
    qr: { id: string; type: QrType; refId: string };
}

/** What `POST /qr` answers. */
export interface QrGenerated {
    qrId: string;
    token: string;
    expiresAt: string | null;
}

/** What `POST /qr/:qrId/regenerate` answers — the new row, with the old id beside it. */
export interface QrRegenerated {
    id: string;
    type: QrType;
    refId: string;
    token: string;
    isActive: boolean;
    expiresAt: string | null;
    createdAt: string;
    previousQrId: string;
    imagePngUrl: string;
    imageSvgUrl: string;
}

/* ------------------------------------------------------------------ */
/* Queries and bodies                                                  */
/* ------------------------------------------------------------------ */

export interface QrListQuery {
    type?: QrType;
    active?: boolean;
    refId?: string;
    q?: string;
    page?: number;
    pageSize?: number;
}

/** `?type=&active=&refId=&q=&page&pageSize` exactly as `qrListQuerySchema` parses them. */
export function buildQrListQuery(query: QrListQuery = {}): string {
    const params = new URLSearchParams();
    if (query.type) params.set("type", query.type);
    if (query.active !== undefined) params.set("active", String(query.active));
    if (query.refId?.trim()) params.set("refId", query.refId.trim());
    if (query.q?.trim()) params.set("q", query.q.trim());
    params.set("page", String(query.page ?? 1));
    params.set("pageSize", String(query.pageSize ?? 20));
    return params.toString();
}

export interface QrScansQuery {
    outcome?: string;
    page?: number;
    pageSize?: number;
}

export function buildQrScansQuery(query: QrScansQuery = {}): string {
    const params = new URLSearchParams();
    if (query.outcome) params.set("outcome", query.outcome);
    params.set("page", String(query.page ?? 1));
    params.set("pageSize", String(query.pageSize ?? 20));
    return params.toString();
}

/** `GET /qr/scans` — the person is required; the outcome and the window narrow it. */
export interface ScansByQuery {
    scannedById: string;
    outcome?: string;
    /** ISO instants. */
    from?: string;
    to?: string;
}

export function buildScansByQuery(query: ScansByQuery): string {
    const params = new URLSearchParams({ scannedById: query.scannedById });
    if (query.outcome) params.set("outcome", query.outcome);
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    return params.toString();
}

/**
 * `POST /qr` — `generateQrSchema`: the type, what it names, and the roles
 * that may scan it (empty means any scanning role). The schema takes no
 * expiry: a code minted from the desk is open-ended, and only the module's
 * own callers (an access grant, a pickup code) set one.
 */
export interface GenerateQrInput {
    type: QrType;
    refId: string;
    allowedRoles: ScanningRole[];
    metadata?: Record<string, unknown>;
}

/** The reason's bounds, as `deactivateQrSchema` spells them. */
export const QR_REASON_MIN = 5;
export const QR_REASON_MAX = 500;

/* ------------------------------------------------------------------ */
/* The service                                                         */
/* ------------------------------------------------------------------ */

function desk() {
    if (!isLive("qr")) throw new Error("QR codes read the API; connect the console to the ADX backend first.");
    return http;
}

/**
 * The public image route, built on the console's own API base. The wire's
 * `imagePngUrl` is root-relative when the backend runs without `BASE_URL`,
 * which on the console's origin would be a broken image; the base the
 * console already talks to is the right one either way.
 */
export function qrImageUrl(qrId: string, kind: "png" | "svg", size?: number): string {
    const suffix = kind === "png" && size ? `?size=${size}` : "";
    return `${apiConfig.baseUrl}/qr/${encodeURIComponent(qrId)}/image.${kind}${suffix}`;
}

export const qrService = {
    /** The app-facing read: token, metadata and the image urls. 404 for an inactive code. */
    get: (qrId: string) => http.get<QrView>(`/qr/${qrId}`),

    /** K-B1: the desk's list — the list contract with `counts` per type (the type facet removed). */
    list: (query: QrListQuery = {}): Promise<QrPage<QrDeskRow>> =>
        desk().get<QrPage<QrDeskRow>>(`/qr?${buildQrListQuery(query)}`),

    /** K-B1: one code's scans — the list contract, `counts` per outcome. */
    scans: (qrId: string, query: QrScansQuery = {}): Promise<QrPage<QrScanRow>> =>
        desk().get<QrPage<QrScanRow>>(`/qr/${encodeURIComponent(qrId)}/scans?${buildQrScansQuery(query)}`),

    /** One person's scans, newest first, at most 200 — an array, as the route has always answered. */
    scansBy: async (query: ScansByQuery): Promise<ScanByRow[]> =>
        (await desk().get<ScanByRow[]>(`/qr/scans?${buildScansByQuery(query)}`)) ?? [],

    /** Mints a code (201); audited `QR_GENERATED` against the admin. */
    generate: (input: GenerateQrInput): Promise<QrGenerated> =>
        desk().post<QrGenerated>("/qr", {
            type: input.type,
            refId: input.refId.trim(),
            allowedRoles: input.allowedRoles,
            ...(input.metadata ? { metadata: input.metadata } : {}),
        }),

    /** The old code dies and a new one for the same subject answers (201). */
    regenerate: (qrId: string): Promise<QrRegenerated> =>
        desk().post<QrRegenerated>(`/qr/${encodeURIComponent(qrId)}/regenerate`),

    /** The image as bytes, for the download buttons — through the blob helper like every other file the console pulls. */
    image: (qrId: string, kind: "png" | "svg"): Promise<BlobResult> =>
        desk().blob(`/qr/${encodeURIComponent(qrId)}/image.${kind}${kind === "png" ? "?size=600" : ""}`),

    /** `DELETE /qr/:qrId { reason }` — the reason travels in the body; 404 for a code that does not exist. */
    deactivate: (qrId: string, reason: string): Promise<{ message: string }> =>
        desk().delete<{ message: string }>(`/qr/${encodeURIComponent(qrId)}`, { body: { reason: reason.trim() } }),
};
