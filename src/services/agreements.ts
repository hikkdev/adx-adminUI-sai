import { api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import type { StatusMeta } from "@/types";

/**
 * Agreement templates and acceptances, wired to the backend `agreements`
 * module (`/agreements/*`).
 *
 * Live in every mode, with no fixture fallback — the same reasoning the rate
 * cards use. A template here is the legal text a publisher or advertiser
 * clicks through, and an acceptance is the record that they did. A seeded
 * stand-in would put an agreement in front of ops that nobody has published
 * and an acceptance nobody made. With the API off these screens say so.
 *
 * Two facts the screens lean on, both from the backend README:
 *
 *  - Only a DRAFT may be edited or discarded. A version that has been live is
 *    what people accepted, and their acceptance points at the row itself.
 *  - Going live does not by itself ask anybody to accept again. A platform
 *    version activated with `requiresReacceptance` (Lot D, Q55) does: until
 *    the party clicks again they are blocked, and the stale report says so.
 */

export type AgreementKind =
    | "PLATFORM"
    | "LISTING"
    | "ADVERTISER_PLATFORM"
    | "INSERTION_ORDER"
    | "PACKAGE_SALE"
    | "JOB_TERMS"
    | "AGENT_PUBLISHER_PLATFORM"
    | "AGENT_ADVERTISER_PLATFORM"
    | "EMPLOYEE_APPOINTMENT"
    | "PRINT_PARTNER_SERVICE"
    | "PUBLISHER_LICENCE";
export type PartyType = "publisher" | "advertiser" | "agent";
/** DS-1: who a kind binds — the three acceptance parties, and the two that only ever e-sign. */
export type AgreementParty = PartyType | "employee" | "print-partner";
export type TemplateState = "DRAFT" | "ACTIVE" | "SUPERSEDED";

/** Click-accept today; the seam for an e-sign later (Lot D, Q123). */
export type SignatureProvider = "NONE" | "DIGIO";

export const AGREEMENT_KINDS: AgreementKind[] = [
    "PLATFORM",
    "LISTING",
    "PUBLISHER_LICENCE",
    "ADVERTISER_PLATFORM",
    "INSERTION_ORDER",
    "PACKAGE_SALE",
    "JOB_TERMS",
    "AGENT_PUBLISHER_PLATFORM",
    "AGENT_ADVERTISER_PLATFORM",
    "EMPLOYEE_APPOINTMENT",
    "PRINT_PARTNER_SERVICE",
];

/** DS-1: the party groups the templates rail draws — the three that click, then the two that only sign. */
export const AGREEMENT_PARTIES: AgreementParty[] = ["publisher", "advertiser", "agent", "employee", "print-partner"];

export const PARTY_TYPES: PartyType[] = ["publisher", "advertiser", "agent"];

/** The party types the lookup can find — an agent has no platform terms and no party page here. */
export const LOOKUP_PARTY_TYPES: PartyType[] = ["publisher", "advertiser"];

export const PARTY_LABEL: Record<AgreementParty, { singular: string; plural: string }> = {
    publisher: { singular: "Publisher", plural: "Publishers" },
    advertiser: { singular: "Advertiser", plural: "Advertisers" },
    agent: { singular: "Agent", plural: "Agents" },
    employee: { singular: "Employee", plural: "Employees" },
    "print-partner": { singular: "Print partner", plural: "Print partners" },
};

export interface KindMeta {
    party: AgreementParty;
    scope: "PLATFORM" | "TRANSACTION";
    label: string;
    /** What the agreement gates, in the words the screen uses. */
    gate: string;
    /** Authoring hint shown in the editor, where the body has a placeholder. */
    hint?: string;
}

export const KIND_META: Record<AgreementKind, KindMeta> = {
    PLATFORM: {
        party: "publisher",
        scope: "PLATFORM",
        label: "Publisher platform terms",
        gate: "Every publisher accepts this before they can list. Nothing they do gets past activation until a version is live.",
    },
    LISTING: {
        party: "publisher",
        scope: "TRANSACTION",
        label: "Listing agreement",
        gate: "Accepted once per batch of listings, enumerating every spot in it. Only the spots whose documents clear go live.",
        hint: "Write {{listings}} where the enumeration of spots should appear. Without it the list is appended at the end.",
    },
    ADVERTISER_PLATFORM: {
        party: "advertiser",
        scope: "PLATFORM",
        label: "Advertiser platform terms",
        gate: "Every advertiser accepts this before they can book. Verified KYC first, then this, and the account is active.",
    },
    INSERTION_ORDER: {
        party: "advertiser",
        scope: "TRANSACTION",
        label: "Insertion order",
        gate: "Accepted once per campaign, naming its sites. The text as accepted is stored with the acceptance, because sites change.",
        hint: "Write {{spots}} where the schedule of sites should appear. Without it the schedule is appended at the end.",
    },
    PACKAGE_SALE: {
        party: "advertiser",
        scope: "TRANSACTION",
        label: "Package terms",
        gate: "Accepted once per package sale before it can be paid. A sale with no live version cannot take money.",
    },
    JOB_TERMS: {
        party: "agent",
        scope: "TRANSACTION",
        label: "Job terms",
        gate: "Recorded on the agent's own tap when they accept an order. With no live version the tap is refused with NO_ACTIVE_TEMPLATE.",
    },
    AGENT_PUBLISHER_PLATFORM: {
        party: "agent",
        scope: "PLATFORM",
        label: "Field agent engagement terms",
        gate: "Accepted at the application's terms step (AG-1). With e-signing on, signed through Digio at activation; the agent works once it is signed.",
        hint: "Merge fields: {{party.name}}, {{party.displayId}}, {{agent.side}}, {{agent.grade}}, {{agent.engagement}}, {{agent.startDate}}, {{date}}, {{reference}}.",
    },
    AGENT_ADVERTISER_PLATFORM: {
        party: "agent",
        scope: "PLATFORM",
        label: "Sales agent engagement terms",
        gate: "Accepted at the application's terms step (AG-1). With e-signing on, signed through Digio at activation; the agent works once it is signed.",
        hint: "Merge fields: {{party.name}}, {{party.displayId}}, {{agent.side}}, {{agent.grade}}, {{agent.engagement}}, {{agent.startDate}}, {{date}}, {{reference}}.",
    },
    EMPLOYEE_APPOINTMENT: {
        party: "employee",
        scope: "PLATFORM",
        label: "Employee appointment and NDA",
        gate: "E-signed only (DS-2): sent from Employees › New through a hosted link; a console invitation asked for at the same time waits on the signature.",
        hint: "Merge fields: {{party.name}}, {{employee.designation}}, {{employee.department}}, {{employee.employmentType}}, {{date}}, {{reference}}.",
    },
    PRINT_PARTNER_SERVICE: {
        party: "print-partner",
        scope: "PLATFORM",
        label: "Print partner service agreement",
        gate: "E-signed only (DS-2): sent the moment the partner's KYC verifies; a quote and a job's Accept wait on the signature.",
        hint: "Merge fields: {{party.name}}, {{party.tradeName}}, {{party.gstin}}, {{party.pan}}, {{party.signer}}, {{date}}, {{reference}}.",
    },
    PUBLISHER_LICENCE: {
        party: "publisher",
        scope: "PLATFORM",
        label: "Publisher licence to display",
        gate: "E-signed only (DS-3): one master licence per publisher, asked for at the first approved listing (or the first submission); the next attempt waits on it.",
        hint: "Write {{listings}} where Schedule A — the publisher's listings — should appear. Merge fields: {{party.name}}, {{party.type}}, {{party.gstin}}, {{party.band}}, {{date}}, {{reference}}.",
    },
};

/** The platform terms each party type is stuck behind until a version is live. */
export const PLATFORM_KIND_FOR: Record<PartyType, AgreementKind | null> = {
    publisher: "PLATFORM",
    advertiser: "ADVERTISER_PLATFORM",
    /** An agent has no platform terms: their party view carries `platform: null`. */
    agent: null,
};

/** The kinds a party type signs, platform terms first. */
export const KINDS_FOR_PARTY: Record<AgreementParty, AgreementKind[]> = {
    publisher: ["PLATFORM", "LISTING", "PUBLISHER_LICENCE"],
    advertiser: ["ADVERTISER_PLATFORM", "INSERTION_ORDER", "PACKAGE_SALE"],
    agent: ["AGENT_PUBLISHER_PLATFORM", "AGENT_ADVERTISER_PLATFORM", "JOB_TERMS"],
    employee: ["EMPLOYEE_APPOINTMENT"],
    "print-partner": ["PRINT_PARTNER_SERVICE"],
};

/* ------------------------------------------------------------------ */
/* DS-1: e-signatures                                                  */
/* ------------------------------------------------------------------ */

export type SigningParty = "PUBLISHER" | "ADVERTISER" | "AGENT" | "EMPLOYEE" | "PRINT_PARTNER";
export type SigningStatus = "REQUESTED" | "PARTIALLY_SIGNED" | "COMPLETED" | "EXPIRED" | "CANCELLED" | "FAILED";
export type SigningDocument = "AGENT_ENGAGEMENT" | "EMPLOYEE_APPOINTMENT" | "PRINT_PARTNER_SERVICE" | "PUBLISHER_LICENCE" | "INSERTION_ORDER";

export const SIGNING_PARTIES: SigningParty[] = ["PUBLISHER", "ADVERTISER", "AGENT", "EMPLOYEE", "PRINT_PARTNER"];
export const SIGNING_STATUSES: SigningStatus[] = ["REQUESTED", "PARTIALLY_SIGNED", "COMPLETED", "EXPIRED", "CANCELLED", "FAILED"];
/** The kinds the rail e-signs — the five documents. */
export const SIGNABLE_KINDS: AgreementKind[] = ["AGENT_PUBLISHER_PLATFORM", "AGENT_ADVERTISER_PLATFORM", "EMPLOYEE_APPOINTMENT", "PRINT_PARTNER_SERVICE", "PUBLISHER_LICENCE", "INSERTION_ORDER"];

export const SIGNING_PARTY_LABEL: Record<SigningParty, string> = {
    PUBLISHER: "Publisher",
    ADVERTISER: "Advertiser",
    AGENT: "Agent",
    EMPLOYEE: "Employee",
    PRINT_PARTNER: "Print partner",
};

export const SIGNING_STATUS_META: Record<SigningStatus, StatusMeta> = {
    REQUESTED: { label: "Awaiting signature", tone: "warning" },
    PARTIALLY_SIGNED: { label: "Partly signed", tone: "info" },
    COMPLETED: { label: "Signed", tone: "success" },
    EXPIRED: { label: "Expired", tone: "neutral" },
    CANCELLED: { label: "Voided", tone: "neutral" },
    FAILED: { label: "Declined", tone: "danger" },
};

/** The kind a signing party's SIGNABLE documents belong to, for the send dialog. */
export const SIGNABLE_KINDS_FOR: Record<SigningParty, AgreementKind[]> = {
    PUBLISHER: ["PUBLISHER_LICENCE"],
    ADVERTISER: ["INSERTION_ORDER"],
    AGENT: ["AGENT_PUBLISHER_PLATFORM", "AGENT_ADVERTISER_PLATFORM"],
    EMPLOYEE: ["EMPLOYEE_APPOINTMENT"],
    PRINT_PARTNER: ["PRINT_PARTNER_SERVICE"],
};

export interface SignerState {
    role: "PARTY" | "ADX";
    name: string;
    identifier: string;
    status: "requested" | "signed" | "expired" | "declined" | "cancelled";
    signedAt: string | null;
}

/** One e-signature request as `GET /agreements/signing` lists it. */
export interface SigningRequest {
    id: string;
    kind: AgreementKind;
    document: SigningDocument | null;
    label: string;
    title: string;
    templateVersion: number;
    partyType: SigningParty;
    partyId: string;
    campaignId: string | null;
    attemptId: string | null;
    status: SigningStatus;
    mock: boolean;
    signer: { name: string; identifier: string; userId: string | null };
    signers: SignerState[];
    signMethod: string;
    signingUrl: string | null;
    countersign: boolean;
    stamp: { state: string; amount: string; ref: string | null } | null;
    /** `/files/:id` ids — the rendered document, the signed copy, the audit certificate. */
    files: { document: string | null; signed: string | null; certificate: string | null };
    requestedAt: string;
    expiresAt: string;
    completedAt: string | null;
    cancelledAt: string | null;
    cancelReason: string | null;
    failureReason: string | null;
    lastReminderAt: string | null;
    providerRef: string | null;
}

export interface SigningFilter {
    kind?: AgreementKind;
    status?: SigningStatus;
    partyType?: SigningParty;
    partyId?: string;
    campaignId?: string;
    q?: string;
    limit?: number;
    cursor?: string;
}

export interface OpenSigningInput {
    kind: AgreementKind;
    partyType: SigningParty;
    partyId: string;
    campaignId?: string;
    force?: boolean;
}

/** Whether the request can still be reminded, voided or signed. */
export const signingOpen = (request: Pick<SigningRequest, "status">): boolean => request.status === "REQUESTED" || request.status === "PARTIALLY_SIGNED";

/** The console route that opens the party behind a request, where there is one. */
export function signingPartyHref(request: Pick<SigningRequest, "partyType" | "partyId" | "campaignId">): string | null {
    switch (request.partyType) {
        case "PUBLISHER":
            return `/publishers/${request.partyId}`;
        case "ADVERTISER":
            return request.campaignId ? `/campaigns/${request.campaignId}` : `/advertisers/${request.partyId}`;
        case "AGENT":
            return `/agents/${request.partyId}`;
        case "PRINT_PARTNER":
            return `/print-partners/${request.partyId}`;
        default:
            return null;
    }
}

/** The `?a=b` for a signing filter, skipping what is unset. */
export function signingQuery(filter: SigningFilter): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filter)) {
        if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
    }
    const query = params.toString();
    return query ? `?${query}` : "";
}

/** The platform-scope kinds — the only ones a party can be behind on (`GET /agreements/stale`). */
export const STALE_KINDS: ("PLATFORM" | "ADVERTISER_PLATFORM")[] = ["PLATFORM", "ADVERTISER_PLATFORM"];

export const TEMPLATE_STATE_META: Record<TemplateState, StatusMeta> = {
    DRAFT: { label: "Draft", tone: "neutral" },
    ACTIVE: { label: "Live", tone: "success" },
    SUPERSEDED: { label: "Retired", tone: "neutral" },
};

/* ------------------------------------------------------------------ */
/* Wire shapes                                                         */
/* ------------------------------------------------------------------ */

export interface AgreementTemplate {
    id: string;
    kind: AgreementKind;
    version: number;
    title: string;
    /** Markdown. Rendered as plain text here; the apps render it properly. */
    body: string;
    isActive: boolean;
    effectiveFrom: string;
    activatedAt: string | null;
    retiredAt: string | null;
    createdByUserId: string | null;
    changeNote: string | null;
    createdAt: string;
    updatedAt: string;
    acceptanceCount: number;
    state: TemplateState;
    /**
     * Lot D (Q55): a platform-scope version every party must accept again
     * before transacting. False, and any acceptance of the kind clears the
     * gate. Always false on the transaction kinds.
     */
    requiresReacceptance: boolean;
}

export interface CreateTemplateInput {
    kind: AgreementKind;
    title: string;
    body: string;
    changeNote?: string;
    /** Go live in the same call. Off by default: read it over first. */
    activate?: boolean;
    /** Lot D (Q55): platform kinds only; ignored on the transaction kinds. */
    requiresReacceptance?: boolean;
}

export interface UpdateTemplateInput {
    title?: string;
    body?: string;
    changeNote?: string | null;
    requiresReacceptance?: boolean;
}

/** A click-accept, not a signature: who accepted, which version, when, from where. */
export interface AgreementAcceptance {
    id: string;
    templateId: string;
    templateKind: AgreementKind;
    templateVersion: number;
    publisherId: string | null;
    advertiserId: string | null;
    /** Lot D (Q55): JOB_TERMS are the agent's own. */
    agentId: string | null;
    /* The anchor — the transaction the acceptance is bound to. One of these, by kind. */
    attemptId: string | null;
    campaignId: string | null;
    packageSaleId: string | null;
    orderId: string | null;
    acceptedByUserId: string;
    acceptedAt: string;
    ipAddress: string | null;
    userAgent: string | null;
    /** The enumerated agreement exactly as accepted, for the per-deal kinds. */
    renderedDocument: string | null;
    /** Lot D (Q123): click-accept today; the seam for an e-sign later. */
    signatureProvider: SignatureProvider;
    signatureRef: string | null;
    template: { title: string };
    acceptedBy: { id: string; name: string | null; mobile: string };
    publisher: { id: string; displayId: string | null; name: string } | null;
    advertiser: { id: string; displayId: string | null; name: string } | null;
}

export interface PartySummary {
    type: PartyType;
    id: string;
    displayId: string | null;
    name: string;
    mobile: string;
    city: string | null;
    kycStatus: string;
    activatedAt: string | null;
    createdAt: string;
}

export interface PartyAgreements {
    party: PartySummary;
    /** Where the party stands on the platform terms — the gate they can stall at. Null for an agent. */
    platform: {
        kind: AgreementKind;
        /** The version live now. Null is the stall: nothing to accept. */
        currentVersion: number | null;
        /** The highest version this party has accepted, if any. */
        accepted: AgreementAcceptance | null;
        /** They accepted an older version than the one live now. Enforced only when `requiresReacceptance`. */
        outdated: boolean;
        /** Lot D (Q55): whether the live version demands the click again. */
        requiresReacceptance: boolean;
    } | null;
    /** Everything they ever accepted, newest first, per-deal agreements included. */
    acceptances: AgreementAcceptance[];
}

export interface AcceptanceFilter {
    publisherId?: string;
    advertiserId?: string;
    agentId?: string;
    templateId?: string;
    kind?: AgreementKind;
    /** E7-3: the transaction anchors — the acceptance behind one campaign, order, sale or attempt. */
    campaignId?: string;
    orderId?: string;
    packageSaleId?: string;
    attemptId?: string;
    limit?: number;
    cursor?: string;
}

export interface Paged<T> {
    rows: T[];
    nextCursor: string | null;
}

/** One party behind the live platform terms — `GET /agreements/stale`. */
export interface StaleParty {
    type: PartyType;
    id: string;
    displayId: string | null;
    name: string;
    acceptedVersion: number;
}

export interface StaleReport {
    kind: AgreementKind;
    currentVersion: number | null;
    /** True when the live version demands re-acceptance: these parties are blocked, not merely behind. */
    enforced: boolean;
    parties: StaleParty[];
}

/* ------------------------------------------------------------------ */
/* Pure helpers — the screens read through these, and they are tested */
/* ------------------------------------------------------------------ */

/** Whether these screens read anything at all. No fixtures, so it is the domain's flag. */
export const agreementsReadApi = (): boolean => isLive("agreements");

export const versionLabel = (template: Pick<AgreementTemplate, "version">): string =>
    `v${template.version}`;

/** Every version of a kind, newest first, the order the versions table shows. */
export function versionsOf(templates: AgreementTemplate[], kind: AgreementKind): AgreementTemplate[] {
    return templates.filter((template) => template.kind === kind).sort((a, b) => b.version - a.version);
}

export function liveVersion(templates: AgreementTemplate[], kind: AgreementKind): AgreementTemplate | null {
    return templates.find((template) => template.kind === kind && template.state === "ACTIVE") ?? null;
}

export interface KindCoverage {
    live: AgreementTemplate | null;
    drafts: number;
    total: number;
    /** Nothing is live: the party type this kind gates is stalled on it. */
    stalled: boolean;
}

/**
 * What each kind has, for the rail and the stall banners.
 *
 * `stalled` is only raised for the platform terms, because those gate every
 * party of that type. A missing listing agreement stalls a batch, not a
 * publisher, and a missing insertion order stalls a campaign; both matter, but
 * neither is the thing D9 exists to end.
 */
export function kindCoverage(templates: AgreementTemplate[]): Record<AgreementKind, KindCoverage> {
    const coverage = {} as Record<AgreementKind, KindCoverage>;
    for (const kind of AGREEMENT_KINDS) {
        const versions = versionsOf(templates, kind);
        const live = versions.find((template) => template.state === "ACTIVE") ?? null;
        coverage[kind] = {
            live,
            drafts: versions.filter((template) => template.state === "DRAFT").length,
            total: versions.length,
            stalled: live === null && KIND_META[kind].scope === "PLATFORM",
        };
    }
    return coverage;
}

/** Which side of the marketplace an acceptance names. Exactly one is ever set. */
export function partyOf(
    acceptance: Pick<AgreementAcceptance, "publisher" | "advertiser" | "publisherId" | "advertiserId"> & { agentId?: string | null }
): { type: PartyType; id: string; displayId: string | null; name: string } | null {
    if (acceptance.publisher) return { type: "publisher", ...acceptance.publisher };
    if (acceptance.advertiser) return { type: "advertiser", ...acceptance.advertiser };
    if (acceptance.publisherId) return { type: "publisher", id: acceptance.publisherId, displayId: null, name: "" };
    if (acceptance.advertiserId) return { type: "advertiser", id: acceptance.advertiserId, displayId: null, name: "" };
    if (acceptance.agentId) return { type: "agent", id: acceptance.agentId, displayId: null, name: "" };
    return null;
}

/**
 * The anchor a per-deal acceptance is bound to — the campaign, package sale,
 * order or attempt — with the console route that opens it, or the platform
 * terms. The id is shown shortened the way the identifiers screen does.
 */
export function acceptanceAnchor(
    acceptance: Pick<AgreementAcceptance, "templateKind" | "attemptId" | "campaignId"> & {
        packageSaleId?: string | null;
        orderId?: string | null;
    }
): { kind: "CAMPAIGN" | "PACKAGE_SALE" | "ORDER" | "ATTEMPT" | "PLATFORM" | null; label: string; href: string | null } {
    const short = (id: string) => id.slice(-6).toUpperCase();
    if (acceptance.campaignId) return { kind: "CAMPAIGN", label: `Campaign ${short(acceptance.campaignId)}`, href: `/campaigns/${acceptance.campaignId}` };
    if (acceptance.packageSaleId) return { kind: "PACKAGE_SALE", label: `Package sale ${short(acceptance.packageSaleId)}`, href: "/packages" };
    if (acceptance.orderId) return { kind: "ORDER", label: `Order ${short(acceptance.orderId)}`, href: `/orders/${acceptance.orderId}` };
    if (acceptance.attemptId) return { kind: "ATTEMPT", label: `Attempt ${short(acceptance.attemptId)}`, href: `/listings/attempts/${acceptance.attemptId}` };
    if (KIND_META[acceptance.templateKind].scope === "PLATFORM") return { kind: "PLATFORM", label: "Platform terms", href: null };
    return { kind: null, label: "—", href: null };
}

/** "Platform terms", or the batch, campaign, sale or order a per-deal acceptance covers. */
export function acceptanceScope(
    acceptance: Pick<AgreementAcceptance, "templateKind" | "attemptId" | "campaignId"> & {
        packageSaleId?: string | null;
        orderId?: string | null;
    }
): string {
    return acceptanceAnchor(acceptance).label;
}

/** "Click-accept" or the provider that e-signed it. */
export function signatureLabel(acceptance: Pick<AgreementAcceptance, "signatureProvider" | "signatureRef">): string {
    const provider = acceptance.signatureProvider ?? "NONE";
    if (provider === "NONE") return "Click-accept";
    return acceptance.signatureRef ? `${provider} · ${acceptance.signatureRef}` : provider;
}

/** The `?a=b&c=d` for an acceptance filter, skipping what is unset. */
export function acceptanceQuery(filter: AcceptanceFilter): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filter)) {
        if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
    }
    const query = params.toString();
    return query ? `?${query}` : "";
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

export const agreementService = {
    templates: (kind?: AgreementKind) =>
        http.get<AgreementTemplate[]>(`/agreements/templates${kind ? `?kind=${kind}` : ""}`),
    template: (id: string) => http.get<AgreementTemplate>(`/agreements/templates/${id}`),
    /** A new version, numbered after the highest that exists. A draft unless `activate`. */
    create: (input: CreateTemplateInput) => http.post<AgreementTemplate>("/agreements/templates", input),
    /** Drafts only — 409 on a version that has been live. */
    update: (id: string, patch: UpdateTemplateInput) =>
        http.patch<AgreementTemplate>(`/agreements/templates/${id}`, patch),
    /** Drafts only. */
    discard: (id: string) => http.delete<void>(`/agreements/templates/${id}`),
    /**
     * Makes it live and retires the previous version. Idempotent; works as a
     * rollback. E7-3: the optional body sets the re-acceptance switch in the
     * same transaction — platform kinds only, 400 otherwise; on an already-live
     * version only the switch moves.
     */
    activate: (id: string, body: { requiresReacceptance?: boolean } = {}) =>
        http.post<AgreementTemplate>(`/agreements/templates/${id}/activate`, body),

    /** Who holds older platform terms than the live version, and whether that blocks them (Lot D, Q55). */
    stale: (kind: "PLATFORM" | "ADVERTISER_PLATFORM") => http.get<StaleReport>(`/agreements/stale?kind=${kind}`),

    acceptances: (filter: AcceptanceFilter = {}) =>
        http.get<Paged<AgreementAcceptance>>(`/agreements/acceptances${acceptanceQuery(filter)}`),
    /** Publishers and advertisers by identifier, name or mobile. Two characters minimum. */
    searchParties: (q: string) =>
        http.get<PartySummary[]>(`/agreements/parties?q=${encodeURIComponent(q)}`),
    party: (type: PartyType, id: string) =>
        http.get<PartyAgreements>(`/agreements/parties/${type}/${encodeURIComponent(id)}`),

    /* DS-1: the Signatures desk. */
    signing: (filter: SigningFilter = {}) => http.get<Paged<SigningRequest>>(`/agreements/signing${signingQuery(filter)}`),
    signingRequest: (id: string) => http.get<SigningRequest>(`/agreements/signing/${encodeURIComponent(id)}`),
    /** The desk's own "send for signature" — by default forced, whatever the policy would ask. */
    openSigning: (input: OpenSigningInput) => http.post<SigningRequest & { created: boolean }>("/agreements/signing", { force: true, ...input }),
    /** Ask the provider now — what the desk presses when a webhook may have been missed. */
    refreshSigning: (id: string) => http.post<SigningRequest>(`/agreements/signing/${encodeURIComponent(id)}/refresh`, {}),
    remindSigning: (id: string) => http.post<SigningRequest>(`/agreements/signing/${encodeURIComponent(id)}/remind`, {}),
    voidSigning: (id: string, reason: string) => http.post<SigningRequest>(`/agreements/signing/${encodeURIComponent(id)}/void`, { reason }),
    /** The development door: signs a mocked request (no Digio credentials) so a flow can be walked. */
    mockSign: (id: string) => http.post<SigningRequest>(`/agreements/signing/${encodeURIComponent(id)}/mock-sign`, {}),
};
