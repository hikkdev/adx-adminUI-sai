import { api as http } from "@/lib/api-client";
import type { Tone } from "@/types";
import { formatMoney } from "@/lib/format";

/**
 * Leads — DR 06's desk, wired to the backend `leads` module.
 *
 * A lead is a business an agent has found and not yet turned into a publisher
 * or an advertiser. The mobile app works them from the map through
 * `GET /leads/near`; this file is the admin half — the paged `GET /leads`, and
 * the two writes the desk performs on a row.
 *
 * No fixture fallback, and none is missing: there are no lead fixtures at all.
 * Nothing seeded has ever described a lead, so the console cannot draw one it
 * did not get from the API, and cannot hand a made-up id to a real endpoint.
 *
 * Two rules the rest of this file exists to keep:
 *
 * - `estimatedCommission` is a decimal STRING or null, and stays one. It is
 *   what the agent stands to earn, null means nobody has estimated it, and the
 *   two are not the same fact. It becomes a number in exactly one place — the
 *   `formatINR` call in the table cell that prints it.
 *
 * - `pill` comes off the wire. The server owns the mapping from status to the
 *   words on a badge, and the console does not keep a second opinion about it;
 *   `pillTone` below bridges the API's four tone words onto the five the
 *   StatusBadge draws and does nothing else.
 */

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

export type LeadStatus = "NEW" | "CONTACTED" | "HOT" | "VISIT_BOOKED" | "CONVERTED" | "LOST";

export const LEAD_STATUSES: readonly LeadStatus[] = [
    "NEW",
    "CONTACTED",
    "HOT",
    "VISIT_BOOKED",
    "CONVERTED",
    "LOST",
];

/**
 * What to call a status in the filter.
 *
 * This is NOT the card's pill. The pill is a property of a lead and arrives
 * with it; these are the six options in a dropdown, which the server has no
 * reason to send and no endpoint to send them on. They are deliberately worded
 * as filter options — "Closed as lost", not "Lost" — so nobody mistakes the
 * Select for a second copy of the badge.
 */
const FACET_LABEL: Record<LeadStatus, string> = {
    NEW: "New",
    CONTACTED: "Contacted",
    HOT: "Hot",
    VISIT_BOOKED: "Visit booked",
    CONVERTED: "Converted",
    LOST: "Closed as lost",
};

export const leadStatusLabel = (status: LeadStatus): string => FACET_LABEL[status] ?? status;

/** Which side of the marketplace the lead would join. */
export type LeadSide = "PUBLISHER" | "ADVERTISER";

/* LH1 (the Lead Hunt, 22 Sep 2026): the computed temperature. */
export type LeadTemperature = "HOT" | "WARM" | "COLD";
export const LEAD_TEMPERATURES: readonly LeadTemperature[] = ["HOT", "WARM", "COLD"];
export const TEMPERATURE_META: Record<LeadTemperature, { label: string; tone: Tone; hint: string }> = {
    HOT: { label: "Hot", tone: "danger", hint: "Call today" },
    WARM: { label: "Warm", tone: "warning", hint: "This week" },
    COLD: { label: "Cold", tone: "neutral", hint: "Nurture" },
};

export type ScoreSignal = "FIT" | "INTENT" | "RECENCY" | "SOURCE" | "AGENT_FLAG";
export const SCORE_SIGNAL_LABEL: Record<ScoreSignal, string> = {
    FIT: "Fit",
    INTENT: "Intent",
    RECENCY: "Recency",
    SOURCE: "Source",
    AGENT_FLAG: "Agent's flag",
};
export interface ScoreReason {
    signal: ScoreSignal;
    points: number;
    note: string;
}

/** "+22" / "−5" / "0" — a signal's points as the breakdown prints them. */
export function pointsLabel(points: number): string {
    if (points > 0) return `+${points}`;
    if (points < 0) return `−${Math.abs(points)}`;
    return "0";
}

/** The temperature's meta, or a placeholder for a lead not yet scored. */
export function temperatureMeta(temperature: LeadTemperature | null | undefined): { label: string; tone: Tone; hint: string } {
    return temperature ? TEMPERATURE_META[temperature] : { label: "Unscored", tone: "neutral", hint: "Scored tonight" };
}

/* LH2 (the Lead Hunt): the twelve stages (D12), the loss reasons (D11), the attribution (D14). */
export type LeadStage = "SOURCED" | "SCORED" | "CLAIMED" | "CONTACTED" | "ENGAGED" | "VISIT_BOOKED" | "PROPOSED" | "CONVERTED" | "ONBOARDING" | "ACTIVATED" | "RETAINED" | "LOST";
export const LEAD_STAGES: readonly LeadStage[] = ["SOURCED", "SCORED", "CLAIMED", "CONTACTED", "ENGAGED", "VISIT_BOOKED", "PROPOSED", "CONVERTED", "ONBOARDING", "ACTIVATED", "RETAINED", "LOST"];
/** The board's columns — the open stages a hand works through, then the won ones, then LOST. */
export const STAGE_META: Record<LeadStage, { label: string; short: string; tone: Tone; hand: boolean }> = {
    SOURCED: { label: "Sourced", short: "S1", tone: "neutral", hand: true },
    SCORED: { label: "Scored", short: "S2", tone: "neutral", hand: true },
    CLAIMED: { label: "Claimed", short: "S3", tone: "info", hand: true },
    CONTACTED: { label: "Contacted", short: "S4", tone: "info", hand: true },
    ENGAGED: { label: "Engaged", short: "S5", tone: "info", hand: true },
    VISIT_BOOKED: { label: "Visit booked", short: "S6", tone: "warning", hand: true },
    PROPOSED: { label: "Proposal", short: "S7", tone: "warning", hand: true },
    CONVERTED: { label: "Converted", short: "S8", tone: "success", hand: false },
    ONBOARDING: { label: "Onboarding", short: "S9", tone: "success", hand: true },
    ACTIVATED: { label: "Activated", short: "S10", tone: "success", hand: false },
    RETAINED: { label: "Retained", short: "S11", tone: "success", hand: false },
    LOST: { label: "Lost", short: "S12", tone: "danger", hand: true },
};
export const stageRank = (stage: LeadStage): number => LEAD_STAGES.indexOf(stage);
export const isOpenStage = (stage: LeadStage): boolean => stageRank(stage) < stageRank("CONVERTED");

/** Whether the desk may drag `from` → `to` — the server's rule, so the board only offers what will land. */
export function deskMayMove(from: LeadStage, to: LeadStage): boolean {
    if (from === to) return false;
    if (to === "LOST") return isOpenStage(from);
    if (from === "LOST") return to === "SCORED" || to === "SOURCED";
    if (stageRank(to) < stageRank(from)) return false;
    if (to === "CONVERTED" || to === "ACTIVATED" || to === "RETAINED") return false;
    if (to === "ONBOARDING") return from === "CONVERTED";
    return STAGE_META[to].hand;
}

export type LeadLostReason = "NOT_INTERESTED" | "WRONG_CONTACT" | "COMPETITOR" | "PRICE" | "TIMING" | "OTHER";
export const LEAD_LOST_REASONS: readonly LeadLostReason[] = ["NOT_INTERESTED", "WRONG_CONTACT", "COMPETITOR", "PRICE", "TIMING", "OTHER"];
export const LOST_REASON_META: Record<LeadLostReason, { label: string; hint: string }> = {
    NOT_INTERESTED: { label: "Not interested", hint: "Stays lost" },
    WRONG_CONTACT: { label: "Wrong contact", hint: "Goes back to sourcing for a better number" },
    COMPETITOR: { label: "With a competitor", hint: "Stays lost" },
    PRICE: { label: "Price", hint: "Back in the pool after 60 days" },
    TIMING: { label: "Timing", hint: "Back in the pool after 60 days" },
    OTHER: { label: "Other", hint: "Say why in a note" },
};

export type LeadChannel = "SMS" | "EMAIL" | "WHATSAPP" | "INSTAGRAM" | "MESSENGER" | "GOOGLE_BUSINESS" | "CALL" | "LINKEDIN" | "IN_PERSON" | "LINK" | "OTHER";
export const CHANNEL_LABEL: Record<LeadChannel, string> = {
    SMS: "SMS",
    EMAIL: "Email",
    WHATSAPP: "WhatsApp",
    INSTAGRAM: "Instagram",
    MESSENGER: "Messenger",
    GOOGLE_BUSINESS: "Google Business",
    CALL: "Call",
    LINKEDIN: "LinkedIn",
    IN_PERSON: "In person",
    LINK: "Invite link",
    OTHER: "Other",
};
export const channelLabel = (channel: string): string => CHANNEL_LABEL[channel as LeadChannel] ?? channel;

export interface LeadAttribution {
    firstContact?: { channel: string; at: string };
    engaged?: { channel: string; at: string };
    converted?: { channel: string; at: string };
}

export interface LeadNextStep {
    label: string;
    action: string;
}

/** "3 days in Contacted" — how long the lead has sat where it is. */
export function daysInStage(stageChangedAt: string | null | undefined, now = new Date()): number | null {
    if (!stageChangedAt) return null;
    return Math.max(0, Math.floor((now.getTime() - new Date(stageChangedAt).getTime()) / 86_400_000));
}

/* The funnel, as GET /leads/funnel answers it — aggregates only. */
export interface FunnelGroup {
    key: string;
    label?: string;
    total: number;
    converted: number;
    activated: number;
}
export interface LeadFunnel {
    byStage: { stage: LeadStage; count: number; value: string | null; avgDaysInStage: number | null }[];
    bySource: FunnelGroup[];
    byAgent: FunnelGroup[];
    byCity: FunnelGroup[];
    byCategory: FunnelGroup[];
    byChannel: { channel: string; firstContact: number; engaged: number; converted: number }[];
    lossMix: { reason: string; count: number }[];
    avgDaysToConvert: number | null;
    totals: { leads: number; converted: number; activated: number; retained: number; lost: number; recycled: number };
}
export interface FunnelQuery {
    side?: LeadSide;
    sourceId?: string;
    agentId?: string;
    city?: string;
    category?: string;
    from?: string;
    to?: string;
}

/* LH3 (the Lead Hunt): the feeds, their runs, the referrals. */
export type FeedRunStatus = "RUNNING" | "DONE" | "FAILED" | "QUOTA";
export const FEED_RUN_META: Record<FeedRunStatus, { label: string; tone: Tone }> = {
    RUNNING: { label: "Running", tone: "info" },
    DONE: { label: "Done", tone: "success" },
    FAILED: { label: "Failed", tone: "danger" },
    QUOTA: { label: "Quota spent", tone: "warning" },
};
export interface FeedStatus {
    key: string;
    label: string;
    needs: string;
    configured: boolean;
    reason: string | null;
    source: { id: string; quality: number; quotaPerDay: number | null; termsAcceptedAt: string | null; isActive: boolean; usedToday: number } | null;
    ready: boolean;
}
export interface FeedRun {
    id: string;
    sourceId: string;
    sourceKey: string | null;
    sourceLabel: string | null;
    requestedById: string | null;
    side: LeadSide;
    category: string;
    city: string | null;
    polygon: [number, number][] | null;
    limit: number;
    status: FeedRunStatus;
    candidates: number;
    imported: number;
    skipped: number;
    warnings: number;
    report: { rows: ImportRowReport[]; alreadyHeld: number } | null;
    error: string | null;
    startedAt: string;
    finishedAt: string | null;
}
export interface RunFeedInput {
    side: LeadSide;
    category: string;
    city?: string;
    polygon?: [number, number][];
    limit?: number;
}
export type ReferrerKind = "PUBLISHER" | "ADVERTISER" | "AGENT";
export const REFERRER_KIND_LABEL: Record<ReferrerKind, string> = { PUBLISHER: "Publisher", ADVERTISER: "Advertiser", AGENT: "Agent" };
export interface Referral {
    id: string;
    referrerKind: ReferrerKind;
    referrerId: string;
    referrer: { name: string; mobile: string | null } | null;
    leadId: string;
    lead: { displayId: string | null; businessName: string; stage: LeadStage; status: LeadStatus; side: LeadSide; city: string | null } | null;
    creditAmount: string | null;
    creditedAt: string | null;
    createdAt: string;
}

/* LH3: the directory feeds' credential cards and the ad forms' secrets under Integrations. */
export type LeadFeedKey = "justdial" | "indiamart" | "mca" | "gst" | "rera";
export const LEAD_FEED_KEYS: readonly LeadFeedKey[] = ["justdial", "indiamart", "mca", "gst", "rera"];
export const LEAD_FEED_LABEL: Record<LeadFeedKey, string> = { justdial: "JustDial", indiamart: "IndiaMART", mca: "MCA company directory", gst: "GST directory", rera: "RERA projects" };
export interface LeadFeedCredentialView {
    endpoint: string | null;
    /** Masked. */
    apiKey: string | null;
    headerName: string | null;
    configured: boolean;
}
export interface LeadFormsView {
    meta: { appSecret: string | null; verifyToken: string | null; pageAccessToken: string | null; configured: boolean };
    google: { key: string | null; configured: boolean };
    linkedin: { clientSecret: string | null; configured: boolean };
}
export const leadIntegrationsService = {
    get: async (): Promise<{ leadFeeds: Record<LeadFeedKey, LeadFeedCredentialView> | null; leadForms: LeadFormsView | null }> => {
        const config = await http.get<{ leadFeeds?: Record<LeadFeedKey, LeadFeedCredentialView>; leadForms?: LeadFormsView }>("/integrations");
        return { leadFeeds: config.leadFeeds ?? null, leadForms: config.leadForms ?? null };
    },
    setFeed: (key: LeadFeedKey, patch: { endpoint?: string; apiKey?: string; headerName?: string }): Promise<unknown> => http.put("/integrations", { section: "leadFeeds", patch: { [key]: patch } }),
    setForms: (patch: { meta?: { appSecret?: string; verifyToken?: string; pageAccessToken?: string }; google?: { key?: string }; linkedin?: { clientSecret?: string } }): Promise<unknown> => http.put("/integrations", { section: "leadForms", patch }),
};

/** "Ready" / "Needs terms" / "Not configured" / "Off" / "Quota spent" — why a feed cannot run right now. */
export function feedReadiness(feed: FeedStatus): { label: string; tone: Tone } {
    if (!feed.configured) return { label: "Not configured", tone: "neutral" };
    if (feed.source && !feed.source.isActive) return { label: "Off", tone: "neutral" };
    if (feed.key !== "google-places" && !feed.source?.termsAcceptedAt) return { label: "Terms not confirmed", tone: "warning" };
    if (feed.source?.quotaPerDay !== null && feed.source?.quotaPerDay !== undefined && feed.source.usedToday >= feed.source.quotaPerDay) return { label: "Quota spent", tone: "warning" };
    return feed.ready ? { label: "Ready", tone: "success" } : { label: "Not ready", tone: "neutral" };
}

/** "12 %" — a group's conversion rate, or "—" with nothing to count. */
export function rateLabel(part: number, whole: number): string {
    if (whole <= 0) return "—";
    return `${Math.round((part / whole) * 100)} %`;
}

export const LEAD_SIDE_LABEL: Record<LeadSide, string> = {
    PUBLISHER: "Publisher",
    ADVERTISER: "Advertiser",
};

/** The four tone words the API's `pill.tone` can carry. */
export type LeadPillTone = "hot" | "new" | "live" | "neutral";

/**
 * The API's tone vocabulary onto the console's.
 *
 * A translation, not a second mapping: the server still decides which tone a
 * status gets, and this only says how each of its four words is painted here.
 * `hot` becomes warning rather than danger on purpose — a hot lead is good
 * news that needs chasing today, and danger is the colour this console uses
 * for suspended and rejected things.
 */
export function pillTone(tone: LeadPillTone | string): Tone {
    switch (tone) {
        case "hot":
            return "warning";
        case "new":
            return "info";
        case "live":
            return "success";
        default:
            return "neutral";
    }
}

/* ------------------------------------------------------------------ */
/* The wire                                                            */
/* ------------------------------------------------------------------ */

/** A lead card exactly as `GET /leads` and `GET /leads/near` send it. */
export interface WireLead {
    id: string;
    /** Issued on create; null on a row older than the identifier formats (the server names such a lead by its id). */
    displayId: string | null;
    side: LeadSide;
    businessName: string;
    category: string | null;
    locality: string | null;
    city: string | null;
    status: LeadStatus;
    /** The badge, decided server-side. Sent on every card. */
    pill: { label: string; tone: LeadPillTone };
    /** Decimal string, or null when nobody has estimated it. Never a number. */
    estimatedCommission: string | null;
    /** Metres, and only when the caller sent a point. The desk never does. */
    distanceM: number | null;
    visitBooked: boolean;
    latitude: number | null;
    longitude: number | null;
    contactName: string | null;
    phone: string | null;
    interest: string | null;
    source: string | null;
    bestTimeFrom: string | null;
    bestTimeTo: string | null;
    firstContactedAt: string | null;
    /** null is the open pool — a lead any agent may take. */
    assignedAgentId: string | null;
    /** AG-5: the band, and the grade the routing settings send it to. Absent on an older server. */
    importance?: "STANDARD" | "KEY" | "ENTERPRISE";
    requiredGrade?: string;
    /** LH1: the score and its temperature; null until the first computation, absent on an older server. */
    score?: number | null;
    temperature?: LeadTemperature | null;
    /** LH1: what the business is worth to ADX (a decimal string), not the agent's fee. */
    estimatedValue?: string | null;
    scoreReasons?: ScoreReason[] | null;
    agentFlaggedHotAt?: string | null;
    lastTouchedAt?: string | null;
    /** LH2: where the deal is, and what moves it forward. Absent on an older server. */
    stage?: LeadStage;
    stageChangedAt?: string | null;
    nextStep?: LeadNextStep;
    lostReason?: LeadLostReason | null;
    lostNote?: string | null;
    activatedAt?: string | null;
    retainedAt?: string | null;
    recycleAt?: string | null;
    /** LH11: when it last came back to the cold pool, and how many times. Absent on an older server. */
    recycledAt?: string | null;
    recycleCount?: number;
    attribution?: LeadAttribution | null;
    /** LH4: spotted in the street — by whom, when, and the photo file ids (private, `/files/:id`). */
    capturedByAgentId?: string | null;
    capturedAt?: string | null;
    photoFileIds?: string[];
}

/** One row of the desk. Identical to the wire but for the painted pill. */
export interface Lead extends Omit<WireLead, "pill"> {
    pill: { label: string; tone: Tone };
}

export function shapeLead(wire: WireLead): Lead {
    return { ...wire, pill: { label: wire.pill.label, tone: pillTone(wire.pill.tone) } };
}

/* ------------------------------------------------------------------ */
/* How the desk reads a row                                            */
/* ------------------------------------------------------------------ */

/** A lead nobody owns yet — the queue the "Unassigned only" toggle isolates. */
export const isUnassigned = (lead: Pick<Lead, "assignedAgentId">): boolean =>
    lead.assignedAgentId === null;

/**
 * Who is on it.
 *
 * The open pool is said in words rather than left as an empty cell: it is a
 * real state — DR 06 lets any agent in range take one of these — and a blank
 * reads as missing data.
 *
 * The agent's identifier rather than their name: `GET /leads` joins no agent,
 * so a name here would be one the console invented. The table resolves it
 * against the roster where it can and falls back to this.
 */
export const assignedLabel = (lead: Pick<Lead, "assignedAgentId">): string =>
    lead.assignedAgentId ?? "Open pool";

/** "Jayanagar 4th Block · Bengaluru", whichever half exists, or nothing. */
export function whereLabel(lead: Pick<Lead, "locality" | "city">): string {
    const parts = [lead.locality, lead.city].filter((part): part is string => Boolean(part?.trim()));
    return parts.length ? parts.join(" · ") : "—";
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export interface LeadsPage {
    items: Lead[];
    total: number;
    page: number;
    pageSize: number;
    /** How many leads sit behind each status, counted without the status facet. */
    counts: Record<string, number>;
    /** LH1: how many sit behind each temperature, counted without the temperature facet. Absent on an older server. */
    temperatureCounts?: Record<string, number>;
    /** LH2: how many sit at each stage, counted without the stage facet. */
    stageCounts?: Record<string, number>;
}

/**
 * The two orders the desk can ask for.
 *
 * `NEAREST` is the API's third and is deliberately absent: it is refused
 * without a `lat`/`lng` pair, and the admin console has no point to send — the
 * person at this desk is not standing anywhere near the shop. Offering it here
 * would be an option that answers 400 every time.
 */
export type AdminLeadsSort = "NEWEST" | "ESTIMATE_DESC" | "HOTTEST";

/**
 * The list contract's page cap (`shared/pagination` MAX_LIST_PAGE_SIZE). The
 * server answers 400 for anything larger, which is how the Board came to
 * print "Invalid request" while asking for 200 — so the one door that
 * builds the query clamps instead of trusting every caller to remember.
 */
export const MAX_LIST_PAGE_SIZE = 100;

/** What the list may actually be asked for: at least one row, at most the contract's cap. */
export const listPageSize = (asked: number | undefined): number =>
    Math.min(MAX_LIST_PAGE_SIZE, Math.max(1, Math.floor(asked ?? 20)));

export interface AdminLeadsQuery {
    q?: string;
    status?: LeadStatus[];
    sort?: AdminLeadsSort;
    page?: number;
    pageSize?: number;
    side?: LeadSide;
    category?: string;
    city?: string;
    assignedAgentId?: string;
    /** Only leads in the open pool. Sent as `unassigned=true` or left off. */
    unassigned?: boolean;
    /** LH1: one temperature. */
    temperature?: LeadTemperature;
    /** LH2: one or more stages. */
    stage?: LeadStage[];
}

/** Any field `POST /leads` accepts, plus the two only a PATCH may move. */
export interface UpdateLeadInput {
    side?: LeadSide;
    businessName?: string;
    category?: string | null;
    contactName?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    locality?: string | null;
    city?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    interest?: string | null;
    source?: string | null;
    bestTimeFrom?: string | null;
    bestTimeTo?: string | null;
    /** A decimal string on the way out too. Never a float. */
    estimatedCommission?: string | null;
    /**
     * CONVERTED is not in this type on purpose: conversion is
     * `POST /leads/:id/convert`, which needs the publisher or advertiser the
     * lead became, and the PATCH endpoint refuses the value outright.
     */
    status?: Exclude<LeadStatus, "CONVERTED">;
    /** null returns the lead to the open pool. */
    assignedAgentId?: string | null;
}

/* ------------------------------------------------------------------ */
/* Lot D (Q56/Q93): creating, importing, converting                     */
/* ------------------------------------------------------------------ */

/** What `POST /leads` takes — `createLeadSchema`. Only keys with a value go up. */
export interface CreateLeadInput {
    side: LeadSide;
    businessName: string;
    category?: string;
    contactName?: string;
    phone?: string;
    email?: string;
    address?: string;
    locality?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
    interest?: string;
    source?: string;
    /** AG-5: STANDARD unless ops says otherwise. */
    importance?: "STANDARD" | "KEY" | "ENTERPRISE";
    bestTimeFrom?: string;
    bestTimeTo?: string;
    /** A decimal string; omitted, the platform quotes what it actually pays. */
    estimatedCommission?: string;
    assignedAgentId?: string;
}

/** One row of an import: a create, minus `source`, which the sheet carries once. */
export type ImportLeadRow = Omit<CreateLeadInput, "source">;

export type ImportOutcome = "CREATED" | "DUPLICATE_LEAD" | "EXISTING_ACCOUNT" | "INVALID" | "WARNING" | "CITY_NOT_OPEN";

export const IMPORT_OUTCOME_META: Record<ImportOutcome, { label: string; tone: Tone }> = {
    CREATED: { label: "Created", tone: "success" },
    WARNING: { label: "Created with a warning", tone: "warning" },
    DUPLICATE_LEAD: { label: "Duplicate lead", tone: "neutral" },
    EXISTING_ACCOUNT: { label: "Already an account", tone: "danger" },
    INVALID: { label: "Invalid", tone: "danger" },
    /** Lot V: a catalogued city whose rollout stage has lead feeds off. */
    CITY_NOT_OPEN: { label: "City not open", tone: "neutral" },
};

/** What became of one row. `row` is 1-based, as the sheet numbers them. */
export interface ImportRowReport {
    row: number;
    outcome: ImportOutcome;
    /** The lead or account the row collided with, or the LED- number it became. */
    ref: string | null;
    message: string;
}

export interface ImportResult {
    dryRun: boolean;
    imported: number;
    skipped: number;
    warnings: number;
    ids: string[];
    report: ImportRowReport[];
}

/** The lead with its activity, as `GET /leads/:id` returns it. */
export interface LeadDetail extends Lead {
    address: string | null;
    email: string | null;
    activity: LeadActivity[];
    /** LH7: the live invite link, or null until one is issued. */
    invite?: LeadInvite | null;
}

export type LeadActivityKind =
    | "IMPORTED"
    | "CALLED"
    | "MESSAGED"
    | "NOTE"
    | "VISIT_BOOKED"
    | "VISIT_DONE"
    | "STATUS_CHANGED"
    | "FOLLOW_UP"
    | "TEMPERATURE_CHANGED"
    | "STAGE_CHANGED"
    | "ENGAGED"
    | "PROPOSAL_SENT"
    | "LINK_OPENED"
    | "TOUCH_LOGGED";

export const LEAD_ACTIVITY_LABEL: Record<LeadActivityKind, string> = {
    IMPORTED: "Imported",
    CALLED: "Called",
    MESSAGED: "Messaged",
    NOTE: "Note",
    VISIT_BOOKED: "Visit booked",
    VISIT_DONE: "Visit done",
    STATUS_CHANGED: "Status changed",
    FOLLOW_UP: "Follow-up",
    TEMPERATURE_CHANGED: "Temperature",
    STAGE_CHANGED: "Stage",
    ENGAGED: "They replied",
    PROPOSAL_SENT: "Proposal sent",
    LINK_OPENED: "Link opened",
    TOUCH_LOGGED: "Touch logged",
};

/* LH1: the sources with their learned quality. */
export type LeadSourceKind = "IMPORT" | "FEED" | "CAPTURE" | "QR" | "INBOUND" | "REFERRAL" | "ADS" | "MANUAL";
export const SOURCE_KIND_LABEL: Record<LeadSourceKind, string> = {
    IMPORT: "Import",
    FEED: "Directory feed",
    CAPTURE: "Street capture",
    QR: "QR poster",
    INBOUND: "Inbound",
    REFERRAL: "Referral",
    ADS: "Lead-form ads",
    MANUAL: "Desk",
};
export interface LeadSource {
    id: string;
    key: string;
    kind: LeadSourceKind;
    label: string;
    /** 0–15, the score's source signal. */
    quality: number;
    quotaPerDay: number | null;
    termsAcceptedAt: string | null;
    isActive: boolean;
    config: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
}

export interface LeadActivity {
    id: string;
    kind: LeadActivityKind;
    note: string | null;
    at: string;
}

/** The lead with its activity as the wire sends it: the card plus the two fields the list leaves off. */
type WireLeadDetail = WireLead & { address: string | null; email: string | null; activity: LeadActivity[] };

const shapeDetail = (wire: WireLeadDetail): LeadDetail => ({
    ...shapeLead(wire),
    address: wire.address,
    email: wire.email,
    activity: wire.activity ?? [],
});

/** The header names an import sheet may carry, folded to the schema's keys. */
const CSV_COLUMNS: Record<string, keyof ImportLeadRow> = {
    side: "side",
    businessname: "businessName",
    business: "businessName",
    name: "businessName",
    category: "category",
    contactname: "contactName",
    contact: "contactName",
    phone: "phone",
    mobile: "phone",
    email: "email",
    address: "address",
    locality: "locality",
    area: "locality",
    city: "city",
    latitude: "latitude",
    lat: "latitude",
    longitude: "longitude",
    lng: "longitude",
    lon: "longitude",
    interest: "interest",
    besttimefrom: "bestTimeFrom",
    besttimeto: "bestTimeTo",
    estimatedcommission: "estimatedCommission",
    estimate: "estimatedCommission",
    assignedagentid: "assignedAgentId",
    agentid: "assignedAgentId",
};

/** A row the server would refuse as a whole batch: the schema's required fields and enums. */
export interface CsvRowProblem {
    row: number;
    message: string;
}

export interface ParsedLeadCsv {
    rows: ImportLeadRow[];
    /** Problems the sheet has to fix before the API will look at it — a bad row fails the whole batch, not just itself. */
    problems: CsvRowProblem[];
    /** Header columns the sheet carried that nothing here reads. */
    ignored: string[];
}

/** RFC-4180-ish: quoted fields, doubled quotes, CRLF or LF. Blank lines are dropped. */
export function splitCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (quoted) {
            if (char === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i += 1;
                } else {
                    quoted = false;
                }
            } else {
                field += char;
            }
        } else if (char === '"') {
            quoted = true;
        } else if (char === ",") {
            row.push(field);
            field = "";
        } else if (char === "\n" || char === "\r") {
            if (char === "\r" && text[i + 1] === "\n") i += 1;
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
        } else {
            field += char;
        }
    }
    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows.filter((cells) => cells.some((cell) => cell.trim().length > 0));
}

/**
 * A pasted or dropped sheet into the rows `POST /leads/import` takes.
 *
 * The first line is the header. Column names are matched case-insensitively
 * with spaces and underscores dropped, so "Business name", "business_name"
 * and "businessName" are the same column. Empty cells are left off the row
 * rather than sent as "" — the schema treats an absent key and an empty
 * string differently, and refuses the latter.
 */
export function parseLeadCsv(text: string): ParsedLeadCsv {
    const lines = splitCsv(text);
    if (lines.length === 0) return { rows: [], problems: [], ignored: [] };
    const header = lines[0].map((cell) => cell.trim().toLowerCase().replace(/[\s_-]+/g, ""));
    const keys = header.map((name) => CSV_COLUMNS[name] ?? null);
    const ignored = header.filter((_, index) => keys[index] === null);
    const rows: ImportLeadRow[] = [];
    const problems: CsvRowProblem[] = [];
    lines.slice(1).forEach((cells, index) => {
        const n = index + 1;
        const row: Record<string, string | number> = {};
        keys.forEach((key, column) => {
            if (!key) return;
            const value = cells[column]?.trim();
            if (!value) return;
            if (key === "latitude" || key === "longitude") {
                const parsed = Number(value);
                if (!Number.isFinite(parsed)) {
                    problems.push({ row: n, message: `"${value}" is not a ${key}` });
                    return;
                }
                row[key] = parsed;
            } else if (key === "side") {
                row.side = value.toUpperCase();
            } else {
                row[key] = value;
            }
        });
        if (!row.businessName) problems.push({ row: n, message: "No business name" });
        if (row.side !== "PUBLISHER" && row.side !== "ADVERTISER") {
            problems.push({ row: n, message: `Side must be PUBLISHER or ADVERTISER${row.side ? `, not "${row.side}"` : ""}` });
        }
        rows.push(row as unknown as ImportLeadRow);
    });
    return { rows, problems, ignored };
}

/** `POST /leads/:id/convert` — one of the two, or neither to link the account the phone belongs to. */
/* ------------------------------------------------------------------ */
/* LH5: the hunting map, territories, claims, priority zones          */
/* ------------------------------------------------------------------ */

/** A ring in GeoJSON order: `[longitude, latitude]`. */
export type Ring = [number, number][];

export interface MapBBox {
    south: number;
    west: number;
    north: number;
    east: number;
}

export const bboxParam = (box: MapBBox): string => [box.south, box.west, box.north, box.east].map((n) => n.toFixed(5)).join(",");

export interface MapQuery {
    bbox: MapBBox;
    side?: LeadSide;
    temperature?: LeadTemperature;
    priority?: boolean;
    claimed?: "MINE" | "OPEN" | "ANY";
    category?: string;
    /** The desk's bulk plot: pins even above the cluster threshold. */
    pins?: boolean;
}

export interface MapPin {
    id: string;
    displayId: string;
    side: LeadSide;
    businessName: string;
    category: string | null;
    latitude: number;
    longitude: number;
    temperature: LeadTemperature | null;
    score: number | null;
    estimatedValue: string | null;
    estimatedCommission: string | null;
    stage: LeadStage;
    claim: { agentId: string; mine: boolean; expiresAt: string | null } | null;
    priority: boolean;
}

export interface MapClusterOut {
    latitude: number;
    longitude: number;
    count: number;
    hot: number;
    warm: number;
    cold: number;
    label: string;
}

export interface LeadMapView {
    mode: "CLUSTERS" | "PINS";
    total: number;
    clusters: MapClusterOut[];
    pins: MapPin[];
    zones: { id: string; name: string; polygon: Ring; topUp: string }[];
    territories: { id: string; name: string; side: LeadSide; agentId: string; polygon: Ring }[];
}

export interface HeatCell {
    latitude: number;
    longitude: number;
    supply: number;
    demand: number;
    gap: number;
    weight: number;
}

export interface LeadHeat {
    cellDeg: number;
    cells: HeatCell[];
}

export interface Territory {
    id: string;
    name: string;
    side: LeadSide;
    polygon: Ring;
    agentId: string;
    city: string | null;
    isActive: boolean;
    createdAt: string;
    leadCount: number;
}

export interface PriorityZone {
    id: string;
    name: string;
    side: LeadSide | null;
    polygon: Ring | null;
    category: string | null;
    /** The top-up per activation; "0.00" means the platform's default. */
    topUp: string;
    startsAt: string;
    endsAt: string;
    budgetCap: string | null;
    spent: string;
    isActive: boolean;
    createdAt: string;
}

export type ZoneState = "LIVE" | "SCHEDULED" | "ENDED" | "OFF";

/** Where a zone stands right now — what the desk's pill says. */
export function zoneState(zone: Pick<PriorityZone, "startsAt" | "endsAt" | "isActive">, now = new Date()): { state: ZoneState; label: string; tone: Tone } {
    if (!zone.isActive) return { state: "OFF", label: "Off", tone: "neutral" };
    if (new Date(zone.startsAt) > now) return { state: "SCHEDULED", label: "Scheduled", tone: "info" };
    if (new Date(zone.endsAt) < now) return { state: "ENDED", label: "Ended", tone: "neutral" };
    return { state: "LIVE", label: "Live", tone: "success" };
}

/** The budget meter: how much of the zone's cap has gone, or null with no cap. */
export function zoneBudgetUsed(zone: Pick<PriorityZone, "spent" | "budgetCap">): number | null {
    if (zone.budgetCap === null) return null;
    const cap = Number(zone.budgetCap);
    if (!Number.isFinite(cap) || cap <= 0) return null;
    return Math.max(0, Math.min(1, Number(zone.spent) / cap));
}

/** A ring's centre — where a chip flies the camera to. */
export function ringCentre(ring: Ring): { latitude: number; longitude: number } | null {
    if (ring.length === 0) return null;
    return { latitude: ring.reduce((sum, [, lat]) => sum + lat, 0) / ring.length, longitude: ring.reduce((sum, [lng]) => sum + lng, 0) / ring.length };
}

export interface ConvertLeadInput {
    publisherId?: string;
    advertiserId?: string;
}

export const leadsService = {
    /**
     * The desk's page.
     *
     * The status facet goes to the API rather than being applied here, because
     * `counts` comes back computed over the whole filter *without* the status
     * in force — which a client holding one page cannot work out for itself.
     */
    list: async (query: AdminLeadsQuery = {}): Promise<LeadsPage> => {
        const params = new URLSearchParams();
        if (query.q) params.set("q", query.q);
        if (query.status?.length) params.set("status", query.status.join(","));
        if (query.sort) params.set("sort", query.sort);
        if (query.side) params.set("side", query.side);
        if (query.category) params.set("category", query.category);
        if (query.city) params.set("city", query.city);
        if (query.assignedAgentId) params.set("assignedAgentId", query.assignedAgentId);
        if (query.temperature) params.set("temperature", query.temperature);
        if (query.stage?.length) params.set("stage", query.stage.join(","));
        // Sent only when true: `unassigned=false` is a filter the API does not
        // have, and would read as a request for assigned leads only.
        if (query.unassigned) params.set("unassigned", "true");
        params.set("page", String(query.page ?? 1));
        params.set("pageSize", String(listPageSize(query.pageSize)));

        const page = await http.get<{
            items: WireLead[];
            total: number;
            page: number;
            pageSize: number;
            counts: Record<string, number>;
            temperatureCounts?: Record<string, number>;
            stageCounts?: Record<string, number>;
        }>(`/leads?${params.toString()}`);
        return { ...page, items: (page.items ?? []).map(shapeLead) };
    },

    /* ---- LH2: the stages and the funnel ------------------------------- */

    /** `PATCH /leads/:id/stage` — the desk's move; a loss carries its reason. */
    moveStage: async (leadId: string, body: { stage: LeadStage; reason?: LeadLostReason; lostNote?: string; note?: string }): Promise<LeadDetail> =>
        shapeDetail(await http.patch<WireLeadDetail>(`/leads/${leadId}/stage`, body)),
    /* ---- LH5: the map, the territories, the zones --------------------- */

    /** `GET /leads/map?bbox=…` — clusters above sixty km², pins below (or always, with `pins`). */
    map: (query: MapQuery): Promise<LeadMapView> => {
        const params = new URLSearchParams({ bbox: bboxParam(query.bbox) });
        if (query.side) params.set("side", query.side);
        if (query.temperature) params.set("temperature", query.temperature);
        if (query.priority) params.set("priority", "true");
        if (query.claimed) params.set("claimed", query.claimed);
        if (query.category) params.set("category", query.category);
        if (query.pins) params.set("pins", "true");
        return http.get<LeadMapView>(`/leads/map?${params.toString()}`);
    },
    /** `GET /leads/map/heat?bbox=…` — demand over supply by cell. */
    heat: (bbox: MapBBox, side?: LeadSide): Promise<LeadHeat> => {
        const params = new URLSearchParams({ bbox: bboxParam(bbox) });
        if (side) params.set("side", side);
        return http.get<LeadHeat>(`/leads/map/heat?${params.toString()}`);
    },
    /** `POST /leads/map/assign` — every open, unassigned lead inside the ring to the agent. */
    assignInPolygon: (input: { polygon: Ring; side: LeadSide; agentId: string }): Promise<{ assigned: number; ids: string[] }> =>
        http.post<{ assigned: number; ids: string[] }>("/leads/map/assign", input),
    territories: (): Promise<Territory[]> => http.get<Territory[]>("/leads/territories"),
    createTerritory: (input: { name: string; side: LeadSide; polygon: Ring; agentId: string; city?: string }): Promise<Territory> =>
        http.post<Territory>("/leads/territories", input),
    updateTerritory: (id: string, patch: { name?: string; polygon?: Ring; agentId?: string; isActive?: boolean }): Promise<Territory> =>
        http.patch<Territory>(`/leads/territories/${id}`, patch),
    priorityZones: (): Promise<PriorityZone[]> => http.get<PriorityZone[]>("/leads/priority-zones"),
    createPriorityZone: (input: { name: string; side?: LeadSide; polygon?: Ring; category?: string; topUp?: number; startsAt: string; endsAt: string; budgetCap?: number | null }): Promise<PriorityZone> =>
        http.post<PriorityZone>("/leads/priority-zones", input),
    updatePriorityZone: (id: string, patch: { name?: string; topUp?: number; startsAt?: string; endsAt?: string; budgetCap?: number | null; isActive?: boolean }): Promise<PriorityZone> =>
        http.patch<PriorityZone>(`/leads/priority-zones/${id}`, patch),

    /* ---- LH3: the feeds, the runs, the referrals ---------------------- */

    feeds: (): Promise<FeedStatus[]> => http.get<FeedStatus[]>("/leads/feeds"),
    runFeed: (key: string, input: RunFeedInput): Promise<FeedRun & { ids: string[] }> => http.post<FeedRun & { ids: string[] }>(`/leads/feeds/${encodeURIComponent(key)}/run`, input),
    feedRuns: (feed?: string): Promise<FeedRun[]> => http.get<FeedRun[]>(`/leads/feeds/runs${feed ? `?feed=${encodeURIComponent(feed)}` : ""}`),
    feedRun: (runId: string): Promise<FeedRun> => http.get<FeedRun>(`/leads/feeds/runs/${encodeURIComponent(runId)}`),
    referrals: (): Promise<Referral[]> => http.get<Referral[]>("/leads/referrals"),

    /** `GET /leads/funnel` — aggregates only. */
    funnel: (query: FunnelQuery = {}): Promise<LeadFunnel> => {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(query)) if (value) params.set(key, String(value));
        const text = params.toString();
        return http.get<LeadFunnel>(`/leads/funnel${text ? `?${text}` : ""}`);
    },

    /* ---- LH1: the score and the sources ------------------------------- */

    /** `POST /leads/:id/rescore` — a fresh score now rather than tonight. */
    rescore: async (leadId: string): Promise<LeadDetail> => shapeDetail(await http.post<WireLeadDetail>(`/leads/${leadId}/rescore`, {})),
    /** `POST /leads/:id/flag-hot` — the agent's flag, from the desk too. */
    flagHot: async (leadId: string, hot: boolean): Promise<LeadDetail> => shapeDetail(await http.post<WireLeadDetail>(`/leads/${leadId}/flag-hot`, { hot })),
    sources: (): Promise<LeadSource[]> => http.get<LeadSource[]>("/leads/sources"),
    updateSource: (sourceId: string, patch: { label?: string; quality?: number; isActive?: boolean; quotaPerDay?: number | null; termsAccepted?: boolean }): Promise<LeadSource> =>
        http.patch<LeadSource>(`/leads/sources/${sourceId}`, patch),

    /** `PATCH /leads/:id`. Answers with the lead as it now stands. */
    update: async (leadId: string, patch: UpdateLeadInput): Promise<Lead> =>
        shapeLead(await http.patch<WireLead>(`/leads/${leadId}`, patch)),

    /** Put an agent on a lead, or pass null to return it to the open pool. */
    assign: (leadId: string, agentId: string | null): Promise<Lead> =>
        leadsService.update(leadId, { assignedAgentId: agentId }),

    /**
     * The end of a lead that went nowhere. Nothing is deleted — a lost lead is
     * still the record of a shop that was approached, which is what stops the
     * next agent walking in three weeks later.
     */
    closeAsLost: async (leadId: string, reason: LeadLostReason = "OTHER", lostNote = "Closed at the desk"): Promise<Lead> =>
        leadsService.moveStage(leadId, { stage: "LOST", reason, lostNote }),

    /* ---- Lot D (Q56/Q93) ---------------------------------------------- */

    /** `GET /leads/:id` — the card plus the address, the email and the activity. */
    get: async (leadId: string): Promise<LeadDetail> => shapeDetail(await http.get<WireLeadDetail>(`/leads/${leadId}`)),

    /**
     * `POST /leads`. A number already on a lead answers 409 with
     * `details.reason = DUPLICATE_LEAD`; one on a publisher or advertiser
     * account, `EXISTING_ACCOUNT` — an account is not a prospect.
     */
    create: async (input: CreateLeadInput): Promise<Lead> => shapeLead(await http.post<WireLead>("/leads", input)),

    /**
     * `POST /leads/import` — up to 500 rows, one transaction, a per-row
     * report. With `dryRun` the report comes back and nothing is written or
     * minted; without it, created rows carry their LED- number as `ref`.
     */
    import: (source: string, rows: ImportLeadRow[], dryRun: boolean): Promise<ImportResult> =>
        http.post<ImportResult>("/leads/import", { source, rows, dryRun }),

    /**
     * `POST /leads/:id/convert`. The lead's number is checked against both
     * account tables: with nothing named the match is linked, naming a
     * different account than the phone belongs to is 409, and with no match
     * and nothing named, 400.
     */
    convert: async (leadId: string, target: ConvertLeadInput): Promise<LeadDetail> =>
        shapeDetail(await http.post<WireLeadDetail>(`/leads/${leadId}/convert`, target)),
};

/* ------------------------------------------------------------------ */
/* LH6: the outreach hub — the thread, the channels, sequences, queues */
/* ------------------------------------------------------------------ */

/** The ten channels a thread can be on (LINK is an attribution channel only — LH7's landing). */
export type OutreachChannel = Exclude<LeadChannel, "LINK">;
export const OUTREACH_CHANNELS: readonly OutreachChannel[] = ["CALL", "WHATSAPP", "SMS", "EMAIL", "INSTAGRAM", "MESSENGER", "GOOGLE_BUSINESS", "LINKEDIN", "IN_PERSON", "OTHER"];
/** The channels a sequence step may name — everything the hub sends, plus a call (a task on the holder). */
export const SEQUENCE_CHANNELS: readonly OutreachChannel[] = ["CALL", "WHATSAPP", "SMS", "EMAIL", "INSTAGRAM", "MESSENGER", "GOOGLE_BUSINESS"];
/** Logged by hand, never sent (D13). */
export const MANUAL_CHANNELS: readonly OutreachChannel[] = ["LINKEDIN", "IN_PERSON", "OTHER"];

export type ReachMode = "FREEFORM" | "TEMPLATE" | "REPLY" | "CALL" | "MANUAL";
export const REACH_MODE_LABEL: Record<ReachMode, string> = {
    FREEFORM: "Free text",
    TEMPLATE: "Approved template",
    REPLY: "Reply (window open)",
    CALL: "Call through ADX",
    MANUAL: "Log by hand",
};

/** What a channel would do for this lead right now — the composer offers exactly the reachable ones. */
export interface ChannelState {
    channel: OutreachChannel;
    configured: boolean;
    provider: string | null;
    reachable: boolean;
    reason: string | null;
    mode: ReachMode | null;
    windowClosesAt: string | null;
    address: string | null;
}

export type MessageDirection = "INBOUND" | "OUTBOUND";
export type MessageStatus = "QUEUED" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "SKIPPED" | "RECEIVED";
export const MESSAGE_STATUS_LABEL: Record<MessageStatus, string> = {
    QUEUED: "Queued",
    SENT: "Sent",
    DELIVERED: "Delivered",
    READ: "Read",
    FAILED: "Failed",
    SKIPPED: "Skipped",
    RECEIVED: "Received",
};
export type CallOutcome = "ANSWERED" | "NO_ANSWER" | "BUSY" | "VOICEMAIL";
export const CALL_OUTCOME_LABEL: Record<CallOutcome, string> = { ANSWERED: "Answered", NO_ANSWER: "No answer", BUSY: "Busy", VOICEMAIL: "Voicemail" };

export interface LeadConversation {
    id: string;
    leadId: string;
    channel: OutreachChannel;
    providerThreadId: string | null;
    windowClosesAt: string | null;
    lastInboundAt: string | null;
    lastOutboundAt: string | null;
    windowOpen: boolean;
}

export interface LeadMessage {
    id: string;
    conversationId: string;
    leadId: string;
    direction: MessageDirection;
    channel: OutreachChannel;
    templateKey: string | null;
    body: string;
    providerId: string | null;
    status: MessageStatus;
    error: string | null;
    scheduledFor: string | null;
    sequenceRunId: string | null;
    maskedNumber: string | null;
    providerCallId: string | null;
    outcome: CallOutcome | null;
    durationSec: number | null;
    consentPlayed: boolean | null;
    recordingFileId: string | null;
    /** `/api/v1/files/:id` when a consented recording is kept (90 days); the player fetches it with the token. */
    recordingUrl: string | null;
    at: string;
    byAgentId: string | null;
    byUserId: string | null;
}

export interface SequenceStep {
    channel: OutreachChannel;
    delayHours: number;
    templateKey: string | null;
}

export interface SequenceRunView {
    id: string;
    sequenceId: string;
    sequenceName: string;
    stepIndex: number;
    steps: number;
    nextStep: SequenceStep | null;
    nextAt: string | null;
    startedAt: string;
    stoppedAt: string | null;
    stopReason: string | null;
}

/** `GET /leads/:id/thread` — the unified conversation, the channel states, the sequence on it. */
export interface LeadThread {
    conversations: LeadConversation[];
    messages: LeadMessage[];
    channels: ChannelState[];
    run: SequenceRunView | null;
    runs: SequenceRunView[];
}

export interface LeadSequence {
    id: string;
    side: LeadSide;
    temperature: LeadTemperature;
    name: string;
    steps: SequenceStep[];
    stopOnReply: boolean;
    isActive: boolean;
    activeRuns: number;
    totalRuns: number;
    createdAt: string;
    updatedAt: string;
}
export interface SequenceInput {
    side: LeadSide;
    temperature: LeadTemperature;
    name: string;
    steps: SequenceStep[];
    stopOnReply: boolean;
    isActive: boolean;
}
export interface StepPreview {
    key: string;
    subject: string | null;
    short: string;
    email: string | null;
}

export type SendOutcome = { outcome: "SENT"; message: LeadMessage } | { outcome: "QUEUED"; message: LeadMessage; scheduledFor: string };

/** One adapter's configured state, from `GET /leads/outreach/channels`. */
export interface AdapterState {
    configured: boolean;
    provider: string | null;
    missing: string[];
}

export interface InboxRow extends LeadConversation {
    lead: Lead;
    last: LeadMessage | null;
    unanswered: number;
}
export interface InboxPage {
    items: InboxRow[];
    total: number;
    byChannel: Record<string, number>;
    page: number;
    pageSize: number;
}
export interface InboxQuery {
    channel?: OutreachChannel;
    side?: LeadSide;
    city?: string;
    unanswered?: boolean;
    page?: number;
    pageSize?: number;
}

export interface TeleRow extends Lead {
    lastCall: LeadMessage | null;
    attempts: number;
    callbackDue: string | null;
}
export interface TelePage {
    items: TeleRow[];
    total: number;
    page: number;
    pageSize: number;
}
export interface TeleQuery {
    side?: LeadSide;
    city?: string;
    temperature?: LeadTemperature;
    q?: string;
    page?: number;
    pageSize?: number;
}

export interface ChannelFunnelRow {
    channel: OutreachChannel;
    outbound: number;
    delivered: number;
    failed: number;
    inbound: number;
    replies: number;
    firstContact: number;
    engaged: number;
    converted: number;
}
export interface ChannelFunnel {
    from: string;
    to: string;
    channels: ChannelFunnelRow[];
}

export interface PlaceCallResult {
    message: LeadMessage;
    maskedNumber: string;
    providerCallId: string;
    recording: boolean;
    consentLine: string | null;
}

/** "Yes, call me" cut for a row; a call row reads its outcome. */
export function messagePreview(message: Pick<LeadMessage, "body" | "channel" | "outcome" | "durationSec">, max = 90): string {
    if (message.channel === "CALL" && message.outcome) return `${CALL_OUTCOME_LABEL[message.outcome]}${message.durationSec ? ` · ${message.durationSec} s` : ""}`;
    const text = message.body.replace(/\s+/g, " ").trim();
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** The tone a message row draws: a failure or a skip stands out, a queued one waits, the rest are quiet. */
export function messageTone(status: MessageStatus): Tone {
    switch (status) {
        case "FAILED":
            return "danger";
        case "SKIPPED":
            return "warning";
        case "QUEUED":
            return "info";
        case "DELIVERED":
        case "READ":
            return "success";
        default:
            return "neutral";
    }
}

/** "Step 2 of 4 · WhatsApp in 3 h" — the sequence line on a lead. */
export function runLine(run: SequenceRunView | null, now = new Date()): string | null {
    if (!run) return null;
    if (run.stoppedAt) return `${run.sequenceName} · stopped (${(run.stopReason ?? "").toLowerCase().replace(/_/g, " ") || "by hand"})`;
    const step = run.nextStep;
    if (!step || !run.nextAt) return `${run.sequenceName} · finishing`;
    const ms = new Date(run.nextAt).getTime() - now.getTime();
    const hours = Math.max(0, Math.round(ms / 3_600_000));
    const when = ms <= 0 ? "due now" : hours < 1 ? "within the hour" : hours < 48 ? `in ${hours} h` : `in ${Math.round(hours / 24)} d`;
    return `${run.sequenceName} · step ${run.stepIndex + 1} of ${run.steps} · ${channelLabel(step.channel)} ${when}`;
}

/** The delay a step reads on the editor: "at once", "2 h", "3 d". */
export function delayLabel(hours: number): string {
    if (hours <= 0) return "at once";
    if (hours < 48) return `${hours} h`;
    return Number.isInteger(hours / 24) ? `${hours / 24} d` : `${hours} h`;
}

/** Whether the composer may send on this channel, and the mode it would go in — the reachable state or null. */
export function reachableState(channels: readonly ChannelState[], channel: OutreachChannel): ChannelState | null {
    const state = channels.find((c) => c.channel === channel);
    return state && state.reachable ? state : null;
}

/** The rows of the inbox chips: every channel with an inbound, its count. */
export function inboxChips(byChannel: Record<string, number>): { value: string; label: string }[] {
    return OUTREACH_CHANNELS.filter((channel) => (byChannel[channel] ?? 0) > 0).map((channel) => ({ value: channel, label: `${channelLabel(channel)} · ${byChannel[channel]}` }));
}

/** A funnel row's reply rate: replies over outbound, or null with nothing sent. */
export function replyRate(row: Pick<ChannelFunnelRow, "outbound" | "replies">): number | null {
    return row.outbound > 0 ? row.replies / row.outbound : null;
}

function query(params: Record<string, string | number | boolean | undefined>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "" && value !== false) search.set(key, String(value));
    const text = search.toString();
    return text ? `?${text}` : "";
}

export const outreachService = {
    /** `GET /leads/:id/thread`. */
    thread: (leadId: string): Promise<LeadThread> => http.get<LeadThread>(`/leads/${leadId}/thread`),
    /** `POST /leads/:id/messages` — typed text, or a template key; 503 when the channel has no card, 409 with `details.reason` when it cannot go. */
    send: (leadId: string, input: { channel: OutreachChannel; body?: string; subject?: string; templateKey?: string }): Promise<SendOutcome> => http.post<SendOutcome>(`/leads/${leadId}/messages`, input),
    /** `POST /leads/:id/touch` — a touch by hand (LinkedIn, in person, a DM typed elsewhere). */
    touch: (leadId: string, input: { channel: OutreachChannel; note?: string; direction?: MessageDirection; at?: string }): Promise<LeadMessage> => http.post<LeadMessage>(`/leads/${leadId}/touch`, input),
    /** `POST /leads/:id/call` — click-to-call on a masked number; 503 `INTEGRATION_NOT_CONFIGURED` without a telephony card. */
    call: (leadId: string, input: { record?: boolean } = {}): Promise<PlaceCallResult> => http.post<PlaceCallResult>(`/leads/${leadId}/call`, input),
    /** `POST /leads/:id/call-log` — a call dialled by hand, with its outcome. */
    logCall: (leadId: string, input: { outcome: CallOutcome; durationSec?: number; note?: string }): Promise<LeadMessage> => http.post<LeadMessage>(`/leads/${leadId}/call-log`, input),
    /** `POST /leads/:id/callback` — a callback task on the holder's day. */
    callback: (leadId: string, input: { when?: string; note?: string } = {}): Promise<{ taskId: string; assigneeUserId: string | null }> => http.post<{ taskId: string; assigneeUserId: string | null }>(`/leads/${leadId}/callback`, input),
    /** `POST /leads/:id/sequence` — enrol (the active one for the side and temperature, or a named one). */
    enrol: (leadId: string, input: { sequenceId?: string; force?: boolean } = {}): Promise<{ runId: string }> => http.post<{ runId: string }>(`/leads/${leadId}/sequence`, input),
    /** `DELETE /leads/:id/sequence`. */
    stopSequence: (leadId: string): Promise<{ stopped: number }> => http.delete<{ stopped: number }>(`/leads/${leadId}/sequence`),
    /** `GET /leads/outreach/channels` — every adapter's state. */
    channels: (): Promise<Record<OutreachChannel, AdapterState>> => http.get<Record<OutreachChannel, AdapterState>>("/leads/outreach/channels"),
    /** `GET /leads/outreach/inbox`. */
    inbox: (input: InboxQuery = {}): Promise<InboxPage> => http.get<InboxPage>(`/leads/outreach/inbox${query({ channel: input.channel, side: input.side, city: input.city, unanswered: input.unanswered === false ? "false" : undefined, page: input.page, pageSize: input.pageSize })}`),
    /** `GET /leads/outreach/tele-queue`. */
    teleQueue: (input: TeleQuery = {}): Promise<TelePage> => http.get<TelePage>(`/leads/outreach/tele-queue${query({ side: input.side, city: input.city, temperature: input.temperature, q: input.q, page: input.page, pageSize: input.pageSize })}`),
    /** `GET /leads/outreach/funnel`. */
    funnel: (input: { from?: string; to?: string; side?: LeadSide } = {}): Promise<ChannelFunnel> => http.get<ChannelFunnel>(`/leads/outreach/funnel${query(input)}`),
    /** `GET /leads/sequences`. */
    sequences: (input: { side?: LeadSide; active?: boolean } = {}): Promise<LeadSequence[]> => http.get<LeadSequence[]>(`/leads/sequences${query({ side: input.side, active: input.active })}`),
    createSequence: (input: SequenceInput): Promise<LeadSequence> => http.post<LeadSequence>("/leads/sequences", input),
    updateSequence: (id: string, patch: Partial<SequenceInput>): Promise<LeadSequence> => http.patch<LeadSequence>(`/leads/sequences/${id}`, patch),
    /** `GET /leads/sequences/preview?templateKey=` — the copy with sample values. */
    preview: (templateKey: string): Promise<StepPreview> => http.get<StepPreview>(`/leads/sequences/preview?templateKey=${encodeURIComponent(templateKey)}`),
};

/* LH6 (D5): the Channels cards under Integrations. */
export type WhatsAppBsp = "GUPSHUP" | "INTERAKT" | "META";
export const WHATSAPP_BSP_LABEL: Record<WhatsAppBsp, string> = { GUPSHUP: "Gupshup", INTERAKT: "Interakt", META: "Meta (Cloud API)" };
export type TelephonyProvider = "EXOTEL" | "KNOWLARITY" | "TWILIO";
export const TELEPHONY_PROVIDER_LABEL: Record<TelephonyProvider, string> = { EXOTEL: "Exotel", KNOWLARITY: "Knowlarity", TWILIO: "Twilio Voice" };
export interface WhatsAppTemplateView {
    name: string;
    language?: string;
    body?: string;
    params?: string[];
}
export interface LeadChannelsView {
    whatsapp: { bsp: WhatsAppBsp | null; apiKey: string | null; appName: string | null; sourceNumber: string | null; phoneNumberId: string | null; accessToken: string | null; appSecret: string | null; verifyToken: string | null; templates: Record<string, WhatsAppTemplateView>; configured: boolean; provider: string | null; missing: string[] };
    instagram: { pageId: string | null; accessToken: string | null; appSecret: string | null; verifyToken: string | null; configured: boolean; provider: string | null; missing: string[] };
    messenger: { pageId: string | null; accessToken: string | null; appSecret: string | null; verifyToken: string | null; configured: boolean; provider: string | null; missing: string[] };
    googleBusiness: { agentId: string | null; serviceAccountJson: string | null; partnerKey: string | null; configured: boolean; provider: string | null; missing: string[] };
    telephony: {
        provider: TelephonyProvider | null;
        accountSid: string | null;
        apiKey: string | null;
        apiToken: string | null;
        subdomain: string | null;
        callerIds: string[];
        missedCallNumber: string | null;
        ivrNumber: string | null;
        recordCalls: boolean;
        consentLine: string;
        ivrGreeting: string;
        ivrPublisherPrompt: string;
        ivrAdvertiserPrompt: string;
        webhookSecret: string | null;
        configured: boolean;
        missing: string[];
    };
}
export type LeadChannelsPatch = {
    whatsapp?: Partial<{ bsp: WhatsAppBsp; apiKey: string; appName: string; sourceNumber: string; phoneNumberId: string; accessToken: string; appSecret: string; verifyToken: string; templates: Record<string, WhatsAppTemplateView> }>;
    instagram?: Partial<{ pageId: string; accessToken: string; appSecret: string; verifyToken: string }>;
    messenger?: Partial<{ pageId: string; accessToken: string; appSecret: string; verifyToken: string }>;
    googleBusiness?: Partial<{ agentId: string; serviceAccountJson: string; partnerKey: string }>;
    telephony?: Partial<{ provider: TelephonyProvider; accountSid: string; apiKey: string; apiToken: string; subdomain: string; callerIds: string[]; missedCallNumber: string; ivrNumber: string; recordCalls: boolean; consentLine: string; ivrGreeting: string; ivrPublisherPrompt: string; ivrAdvertiserPrompt: string; webhookSecret: string }>;
};
export const leadChannelsService = {
    get: async (): Promise<LeadChannelsView | null> => {
        const config = await http.get<{ leadChannels?: LeadChannelsView }>("/integrations");
        return config.leadChannels ?? null;
    },
    set: (patch: LeadChannelsPatch): Promise<unknown> => http.put("/integrations", { section: "leadChannels", patch }),
};

/** "+91 80000 00000, +91 80000 00001" ⇄ the list — the masked numbers typed as one line. */
export function parseCallerIds(text: string): string[] {
    return [...new Set(text.split(/[,\n;]+/).map((value) => value.trim()).filter((value) => value.length >= 6))];
}

/* ------------------------------------------------------------------ */
/* LH7: the invite link (D6), the landing, the proposals               */
/* ------------------------------------------------------------------ */

export type InviteState = "LIVE" | "EXPIRED" | "REVOKED" | "CONVERTED";
export const INVITE_STATE_META: Record<InviteState, { label: string; tone: Tone }> = {
    LIVE: { label: "Live", tone: "success" },
    EXPIRED: { label: "Expired", tone: "warning" },
    REVOKED: { label: "Replaced", tone: "neutral" },
    CONVERTED: { label: "Converted", tone: "info" },
};

export interface LeadInvite {
    id: string;
    code: string;
    url: string;
    appLink: string;
    expiresAt: string;
    state: InviteState;
    opens: number;
    lastOpenedAt: string | null;
    convertedAt: string | null;
    createdAt: string;
}

export type ProposalKind = "RATE_ESTIMATE" | "CAMPAIGN_ESTIMATE" | "PACKAGE_QUOTE";
export const PROPOSAL_KIND_LABEL: Record<ProposalKind, string> = { RATE_ESTIMATE: "Rate estimate", CAMPAIGN_ESTIMATE: "Campaign estimate", PACKAGE_QUOTE: "Package quote" };
/** Which kinds a side takes: a publisher is priced, an advertiser is estimated or quoted. */
export function proposalKindsFor(side: LeadSide): ProposalKind[] {
    return side === "PUBLISHER" ? ["RATE_ESTIMATE"] : ["CAMPAIGN_ESTIMATE", "PACKAGE_QUOTE"];
}

export interface RateEstimatePayload {
    perDay: string;
    perMonth: string;
    comparables: number;
    radiusM: number;
    overridden: boolean;
}
export interface CampaignEstimatePayload {
    spots: number;
    days: number;
    perSpotPerDay: string;
    amount: string;
    comparables: number;
    radiusM: number;
    overridden: boolean;
}
export interface PackageQuotePayload {
    tier: string;
    name: string;
    cycle: "MONTHLY" | "ANNUAL";
    months: number;
    perMonth: string;
    total: string;
    addOns: { code: string; name: string; pricePerMonth: string }[];
}
export interface LeadProposal {
    id: string;
    kind: ProposalKind;
    payload: RateEstimatePayload | CampaignEstimatePayload | PackageQuotePayload;
    note: string | null;
    sentAt: string;
    openedAt: string | null;
    acceptedAt: string | null;
}
export type ProposalInput =
    | { kind: "RATE_ESTIMATE"; perDay?: string; note?: string }
    | { kind: "CAMPAIGN_ESTIMATE"; spots?: number; days?: number; perSpotPerDay?: string; note?: string }
    | { kind: "PACKAGE_QUOTE"; tier: string; addOnCodes?: string[]; cycle?: "MONTHLY" | "ANNUAL"; note?: string };

/** "₹450/day · ₹13,500/month from 4 comparables within 200 m" — the proposal's line. */
export function proposalLine(proposal: Pick<LeadProposal, "kind" | "payload">): string {
    if (proposal.kind === "RATE_ESTIMATE") {
        const p = proposal.payload as RateEstimatePayload;
        return `${formatMoney(p.perDay)}/day · ${formatMoney(p.perMonth)}/month${p.overridden ? " (your figure)" : ` from ${p.comparables} comparable${p.comparables === 1 ? "" : "s"} within ${p.radiusM} m`}`;
    }
    if (proposal.kind === "CAMPAIGN_ESTIMATE") {
        const p = proposal.payload as CampaignEstimatePayload;
        return `${p.spots} spot${p.spots === 1 ? "" : "s"} × ${p.days} day${p.days === 1 ? "" : "s"} at ${formatMoney(p.perSpotPerDay)} = ${formatMoney(p.amount)}`;
    }
    const p = proposal.payload as PackageQuotePayload;
    return `${p.name} · ${p.cycle === "ANNUAL" ? "annual" : "monthly"} · ${formatMoney(p.perMonth)}/month · ${formatMoney(p.total)} in all${p.addOns.length ? ` · ${p.addOns.map((a) => a.name).join(", ")}` : ""}`;
}

/** "Accepted" / "Opened" / "Sent" — where a proposal stands. */
export function proposalState(proposal: Pick<LeadProposal, "openedAt" | "acceptedAt">): { label: string; tone: Tone } {
    if (proposal.acceptedAt) return { label: "Accepted", tone: "success" };
    if (proposal.openedAt) return { label: "Opened", tone: "info" };
    return { label: "Sent", tone: "neutral" };
}

/** "opened 2 h ago" — the invite's line; null when never opened. */
export function openedAgo(lastOpenedAt: string | null, now = new Date()): string | null {
    if (!lastOpenedAt) return null;
    const ms = now.getTime() - new Date(lastOpenedAt).getTime();
    if (ms < 60_000) return "opened just now";
    const minutes = Math.round(ms / 60_000);
    if (minutes < 60) return `opened ${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `opened ${hours} h ago`;
    return `opened ${Math.round(hours / 24)} d ago`;
}

export const inviteService = {
    /** `GET /leads/:id/invite` — the live one, or null. */
    get: (leadId: string): Promise<LeadInvite | null> => http.get<LeadInvite | null>(`/leads/${leadId}/invite`),
    /** `POST /leads/:id/invite` — mint (or hand back the live one); `reissue` revokes the old code. */
    issue: (leadId: string, reissue = false): Promise<LeadInvite> => http.post<LeadInvite>(`/leads/${leadId}/invite`, reissue ? { reissue: true } : {}),
    proposals: (leadId: string): Promise<LeadProposal[]> => http.get<LeadProposal[]>(`/leads/${leadId}/proposals`),
    /** `POST /leads/:id/proposals` — computed on the server from the comparables or the catalogue; 409 `NO_COMPARABLES` when nothing nearby prices it. */
    sendProposal: (leadId: string, input: ProposalInput): Promise<LeadProposal> => http.post<LeadProposal>(`/leads/${leadId}/proposals`, input),
    /** `POST /leads/:id/proposals/:pid/accept` — marked by hand (accepted on the phone, say). */
    markAccepted: (leadId: string, proposalId: string): Promise<LeadProposal> => http.post<LeadProposal>(`/leads/${leadId}/proposals/${proposalId}/accept`, {}),
};

/* The public landing behind adx.in/j/<code> — anonymous, the code is the key. */
export interface LandingCopy {
    headline: string;
    line: string | null;
    bullets: string[];
    cta: string;
    blocks: { key: string; label: string }[];
}
export type LandingHook =
    | { side: "PUBLISHER"; rateEstimate: { perDay: string; perMonth: string; comparables: number; radiusM: number } | null; nearbyCampaigns: number }
    | { side: "ADVERTISER"; nearbySpots: number; sampleEstimate: { spots: number; days: number; perSpotPerDay: string; amount: string } | null; packages: { tier: string; name: string; pricePerMonth: string; description: string | null; isPopular: boolean }[] };
export interface LandingPayload {
    code: string;
    state: InviteState;
    expiresAt: string;
    side: LeadSide;
    business: { name: string; contactName: string | null; city: string | null; locality: string | null; category: string | null };
    agent: { name: string | null } | null;
    copy: LandingCopy;
    hook: LandingHook;
    proposals: LeadProposal[];
    appLink: string;
    converted: boolean;
}
export interface LandingVerifyResult {
    accessToken: string;
    refreshToken: string;
    party: { party: LeadSide; profileId: string; displayId: string | null; created: boolean };
    lead: { id: string; displayId: string | null; converted: boolean };
    appLink: string;
}
export const landingService = {
    get: (code: string): Promise<LandingPayload> => http.get<LandingPayload>(`/j/${encodeURIComponent(code)}`, { anonymous: true }),
    otp: (code: string, mobile: string): Promise<{ mobile: string; expiresInSeconds?: number }> => http.post<{ mobile: string; expiresInSeconds?: number }>(`/j/${encodeURIComponent(code)}/otp`, { mobile }, { anonymous: true }),
    verify: (code: string, input: { mobile: string; otp: string; name?: string; accountType?: "INDIVIDUAL" | "BUSINESS" | "ORGANISATION" }): Promise<LandingVerifyResult> => http.post<LandingVerifyResult>(`/j/${encodeURIComponent(code)}/verify`, input, { anonymous: true }),
    callback: (code: string, input: { when?: string; note?: string } = {}): Promise<{ taskId: string }> => http.post<{ taskId: string }>(`/j/${encodeURIComponent(code)}/callback`, input, { anonymous: true }),
    slot: (code: string, input: { at: string; kind: "VISIT" | "CALL"; note?: string }): Promise<{ kind: "VISIT" | "CALL"; at: string }> => http.post<{ kind: "VISIT" | "CALL"; at: string }>(`/j/${encodeURIComponent(code)}/slot`, input, { anonymous: true }),
    accept: (code: string, proposalId: string): Promise<LeadProposal> => http.post<LeadProposal>(`/j/${encodeURIComponent(code)}/proposals/${proposalId}/accept`, {}, { anonymous: true }),
};

/** The landing's hook blocks, in the copy's order, each with the numbers to draw — or nothing when the hook has none. */
export function landingBlocks(page: Pick<LandingPayload, "copy" | "hook" | "proposals">): { key: string; label: string; lines: string[] }[] {
    const out: { key: string; label: string; lines: string[] }[] = [];
    for (const block of page.copy.blocks) {
        const lines: string[] = [];
        if (page.hook.side === "PUBLISHER") {
            if (block.key === "RATE_ESTIMATE" && page.hook.rateEstimate) lines.push(`${formatMoney(page.hook.rateEstimate.perDay)} a day · about ${formatMoney(page.hook.rateEstimate.perMonth)} a month`, `${page.hook.rateEstimate.comparables} live space${page.hook.rateEstimate.comparables === 1 ? "" : "s"} within ${page.hook.rateEstimate.radiusM} m`);
            if (block.key === "NEARBY_CAMPAIGNS" && page.hook.nearbyCampaigns > 0) lines.push(`${page.hook.nearbyCampaigns} campaign${page.hook.nearbyCampaigns === 1 ? "" : "s"} booked nearby in the last six months`);
        } else {
            if (block.key === "NEARBY_SPOTS" && page.hook.nearbySpots > 0) lines.push(`${page.hook.nearbySpots} spot${page.hook.nearbySpots === 1 ? "" : "s"} live within 2 km`);
            if (block.key === "SAMPLE_ESTIMATE" && page.hook.sampleEstimate) lines.push(`${page.hook.sampleEstimate.spots} spots for ${page.hook.sampleEstimate.days} days ≈ ${formatMoney(page.hook.sampleEstimate.amount)}`, `${formatMoney(page.hook.sampleEstimate.perSpotPerDay)} per spot per day`);
            if (block.key === "PACKAGES") for (const p of page.hook.packages) lines.push(`${p.name} · ${formatMoney(p.pricePerMonth)}/month${p.isPopular ? " · popular" : ""}`);
        }
        if (block.key === "PROPOSALS") for (const proposal of page.proposals) lines.push(`${PROPOSAL_KIND_LABEL[proposal.kind]}: ${proposalLine(proposal)}`);
        if (lines.length) out.push({ key: block.key, label: block.label, lines });
    }
    return out;
}


/* ------------------------------------------------------------------ */
/* LH10 - anti-gaming and quality                                      */
/* ------------------------------------------------------------------ */

export const LEAD_FLAG_KINDS = ["SELF_REFERRAL", "PHONE_REUSE", "CAPTURE_BURST", "WEBHOOK_REPLAY"] as const;
export type LeadFlagKind = (typeof LEAD_FLAG_KINDS)[number];
export const LEAD_FLAG_STATUSES = ["OPEN", "CONFIRMED", "DISMISSED"] as const;
export type LeadFlagStatus = (typeof LEAD_FLAG_STATUSES)[number];

/** What each pattern is, in one line the desk can act on. */
export const FLAG_META: Record<LeadFlagKind, { label: string; hint: string }> = {
    SELF_REFERRAL: {
        label: "Self-referral",
        hint: "The referral points at the referrer's own number, login or device — a credit that pays somebody for referring themselves.",
    },
    PHONE_REUSE: {
        label: "Phone reuse",
        hint: "The number is on another lead, or it already belongs to an ADX account — a conversion farmed out of a customer we already have.",
    },
    CAPTURE_BURST: {
        label: "Capture burst",
        hint: "More street captures in one hour than a walk produces.",
    },
    WEBHOOK_REPLAY: {
        label: "Lead-form replay",
        hint: "One provider payload delivered onto more than one lead.",
    },
};

export const flagKindLabel = (kind: string): string => FLAG_META[kind as LeadFlagKind]?.label ?? kind;

export const FLAG_STATUS_TONE: Record<LeadFlagStatus, Tone> = { OPEN: "warning", CONFIRMED: "danger", DISMISSED: "neutral" };

export interface LeadFlag {
    id: string;
    leadId: string;
    displayId: string | null;
    businessName: string;
    city: string | null;
    side: LeadSide;
    stage: LeadStage;
    kind: LeadFlagKind | string;
    label: string;
    status: LeadFlagStatus;
    detail: string;
    evidence: unknown;
    agentId: string | null;
    openedAt: string;
    decidedAt: string | null;
    decidedByUserId: string | null;
    note: string | null;
}

export interface LeadFlagsPage {
    items: LeadFlag[];
    total: number;
    /** How many OPEN flags of each kind wait — the desk's chips. */
    openByKind: Record<string, number>;
}

export const QA_SAMPLE_KINDS = ["VISIT", "CALL"] as const;
export type QaSampleKind = (typeof QA_SAMPLE_KINDS)[number];
export type QaVerdict = "PASS" | "FAIL";

export interface QaSample {
    id: string;
    kind: QaSampleKind | string;
    agentId: string;
    visitId: string | null;
    messageId: string | null;
    leadId: string | null;
    evidence: unknown;
    autoVerdict: QaVerdict;
    verdict: QaVerdict | null;
    reviewedByUserId: string | null;
    reviewedAt: string | null;
    note: string | null;
    sampledAt: string;
}

export interface AgentQuality {
    /** 0–1 to two places, or null under the sample floor. */
    score: string | null;
    samples: number;
    passed: number;
    failed: number;
    reviewed: number;
    visits: number;
    calls: number;
    confirmedFlags: number;
    flagPenalty: string;
    windowDays: number;
    minimumSample: number;
}

/** What a visit's evidence says, drawn as words: "Photo · fix 16 m from the site". */
export function visitEvidenceLine(evidence: unknown): string {
    const row = (evidence ?? {}) as { photo?: boolean; gps?: boolean; metres?: number | null; site?: boolean };
    const parts: string[] = [];
    parts.push(row.photo ? "Photo" : "No photo");
    if (!row.gps) parts.push("no fix");
    else if (row.metres === null || row.metres === undefined) parts.push(row.site === false ? "fix taken, the site has no coordinates" : "fix taken");
    else parts.push(`fix ${row.metres} m from the site`);
    return parts.join(" · ");
}

/** What a call's evidence says: "Recorded with consent · 95 s · answered". */
export function callEvidenceLine(evidence: unknown): string {
    const row = (evidence ?? {}) as { recording?: boolean; consent?: boolean; durationSec?: number | null; outcome?: string | null };
    const parts: string[] = [];
    parts.push(row.recording ? (row.consent ? "Recorded with consent" : "Recorded with NO consent line") : "Not recorded");
    if (row.durationSec !== null && row.durationSec !== undefined) parts.push(`${row.durationSec} s`);
    if (row.outcome) parts.push(row.outcome.toLowerCase().replace(/_/g, " "));
    return parts.join(" · ");
}

export const qaEvidenceLine = (sample: Pick<QaSample, "kind" | "evidence">): string =>
    sample.kind === "CALL" ? callEvidenceLine(sample.evidence) : visitEvidenceLine(sample.evidence);

/** "0.73" becomes "73%"; null under the floor says so instead. */
export function qualityLabel(quality: Pick<AgentQuality, "score" | "samples" | "minimumSample">): string {
    if (quality.score === null) return `Not enough sampled work yet — ${quality.samples} of ${quality.minimumSample}`;
    return `${Math.round(Number(quality.score) * 100)}%`;
}

/** The line under the score: what it is made of. */
export function qualityHint(quality: AgentQuality): string {
    const parts = [`${quality.passed} of ${quality.samples} sampled ${quality.samples === 1 ? "piece" : "pieces"} of work passed`];
    if (quality.reviewed) parts.push(`${quality.reviewed} reviewed by hand`);
    if (quality.confirmedFlags) parts.push(`${quality.confirmedFlags} confirmed flag${quality.confirmedFlags === 1 ? "" : "s"} took off ${Math.round(Number(quality.flagPenalty) * 100)}%`);
    return `${parts.join(" · ")}. Last ${quality.windowDays} days.`;
}

export const integrityService = {
    /** `GET /leads/flags` — the scan's findings, with the open counts per kind. */
    flags: (filter: { status?: LeadFlagStatus; kind?: LeadFlagKind; agentId?: string; limit?: number } = {}): Promise<LeadFlagsPage> => {
        const params = new URLSearchParams();
        if (filter.status) params.set("status", filter.status);
        if (filter.kind) params.set("kind", filter.kind);
        if (filter.agentId) params.set("agentId", filter.agentId);
        if (filter.limit) params.set("limit", String(filter.limit));
        const query = params.toString();
        return http.get<LeadFlagsPage>(`/leads/flags${query ? `?${query}` : ""}`);
    },
    /** `POST /leads/flags/:id/decide` — CONFIRMED or DISMISSED, once, audited. */
    decide: (flagId: string, input: { status: "CONFIRMED" | "DISMISSED"; note?: string }): Promise<LeadFlag> =>
        http.post<LeadFlag>(`/leads/flags/${flagId}/decide`, input),
    /** `POST /leads/flags/scan` — the hourly scan, by hand. */
    scan: (): Promise<{ scanned: number; flagged: number; byKind: Record<string, number> }> =>
        http.post<{ scanned: number; flagged: number; byKind: Record<string, number> }>("/leads/flags/scan", {}),
    /** `GET /leads/qa` — the sampled field work. */
    qa: (filter: { agentId?: string; kind?: QaSampleKind; reviewed?: boolean; limit?: number } = {}): Promise<{ items: QaSample[]; total: number }> => {
        const params = new URLSearchParams();
        if (filter.agentId) params.set("agentId", filter.agentId);
        if (filter.kind) params.set("kind", filter.kind);
        if (filter.reviewed !== undefined) params.set("reviewed", String(filter.reviewed));
        if (filter.limit) params.set("limit", String(filter.limit));
        const query = params.toString();
        return http.get<{ items: QaSample[]; total: number }>(`/leads/qa${query ? `?${query}` : ""}`);
    },
    /** `POST /leads/qa/:id/review` — the verdict; a reason is required to overrule the evidence. */
    review: (sampleId: string, input: { verdict: QaVerdict; note?: string }): Promise<QaSample> =>
        http.post<QaSample>(`/leads/qa/${sampleId}/review`, input),
    /** `POST /leads/qa/sample` — the nightly draw, by hand. */
    sample: (): Promise<{ visits: number; calls: number; failed: number }> =>
        http.post<{ visits: number; calls: number; failed: number }>("/leads/qa/sample", {}),
    /** `GET /leads/quality/:agentId` — the agent's score and what it is made of. */
    quality: (agentId: string): Promise<AgentQuality> => http.get<AgentQuality>(`/leads/quality/${agentId}`),
    /** `POST /leads/clawbacks/run` — the clawback watch, by hand. */
    runClawbacks: (): Promise<{ checked: number; reversed: number; amount: string[] }> =>
        http.post<{ checked: number; reversed: number; amount: string[] }>("/leads/clawbacks/run", {}),
};

/**
 * LH11: the "recycled" flag — a lead that was lost on price or timing and
 * came back to the cold pool after sixty days (D11). Null on a lead that
 * never went round, and on an older server that sends neither field.
 */
export function recycledFlag(lead: Pick<WireLead, "recycledAt" | "recycleCount">): { label: string; hint: string } | null {
    const times = lead.recycleCount ?? 0;
    if (!lead.recycledAt || times < 1) return null;
    return {
        label: times === 1 ? "Recycled" : `Recycled ${times}\u00d7`,
        hint: `Lost on price or timing and back in the pool since ${new Date(lead.recycledAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}. A fresh sequence started with it.`,
    };
}
