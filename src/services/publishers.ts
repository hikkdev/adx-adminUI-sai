import { api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { importBody, type ImportOutcome, type ImportStatus } from "./party-imports";

/**
 * Opening a publisher account from the desk — `POST /publishers` (Q29).
 *
 * The roster and the detail page read through `supplyService` in
 * `supply.ts`; this file holds only the one write the dashboard card makes,
 * so the card and the roster can change hands without touching each other.
 *
 * What the card used to promise was an "activation link with the KYC
 * checklist" emailed to an owner. Nothing sends one: a publisher's identity
 * is their mobile, and the owner claims the account by signing in with that
 * number — OTP, not a link. The fields here are exactly the schema's.
 */

export const PUBLISHER_TYPES = ["INDIVIDUAL", "BUSINESS", "NGO", "POLITICAL"] as const;
export type PublisherType = (typeof PUBLISHER_TYPES)[number];

export const PUBLISHER_TYPE_LABEL: Record<PublisherType, string> = {
    INDIVIDUAL: "Individual",
    BUSINESS: "Business",
    NGO: "NGO",
    POLITICAL: "Political",
};

/** `createPublisherSchema`. Mobile is the identity and the only required contact. */
export interface CreatePublisherInput {
    name: string;
    mobile: string;
    email?: string;
    type?: PublisherType;
    city?: string;
    /**
     * Whose book this publisher goes on. An admin's publisher has no agent
     * unless one is named here — attribution is never implied (Q29) — and the
     * agent has to exist, or the API answers 404.
     */
    attributeToAgentId?: string;
}

/** What comes back: the row, with the identifier the server minted. */
export interface CreatedPublisher {
    id: string;
    displayId: string | null;
    name: string;
    mobile: string;
    email?: string | null;
    type?: string | null;
    city?: string | null;
    agentId: string | null;
    userId?: string | null;
    createdAt: string;
}

/** Only the keys with a value go up; the schema treats an absent key and an empty string differently. */
export function createPublisherBody(input: CreatePublisherInput): Record<string, string> {
    const body: Record<string, string> = { name: input.name.trim(), mobile: input.mobile.trim() };
    const email = input.email?.trim();
    if (email) body.email = email;
    if (input.type) body.type = input.type;
    const city = input.city?.trim();
    if (city) body.city = city;
    if (input.attributeToAgentId) body.attributeToAgentId = input.attributeToAgentId;
    return body;
}

function live() {
    if (!isLive("supply")) throw new Error("Publishers read the API; connect the console to the ADX backend first.");
    return http;
}

export const publishersService = {
    /** Opens the account. 409 CONFLICT when the number already has one. */
    create: (input: CreatePublisherInput): Promise<CreatedPublisher> =>
        live().post<CreatedPublisher>("/publishers", createPublisherBody(input)),
};

/* ------------------------------------------------------------------ */
/* The detail card — P-B / P-C                                          */
/* ------------------------------------------------------------------ */

/** The five sources the feed is merged from; a kind the server grows still prints. */
export type PublisherFeedKind = "ACTIVITY" | "FIELD_VISIT" | "LISTING_LIVE" | "BOOKING_AUTHORISED" | "PAYOUT_RELEASED";

export const PUBLISHER_FEED_KIND_LABEL: Record<PublisherFeedKind, string> = {
    ACTIVITY: "Activity",
    FIELD_VISIT: "Field visit",
    LISTING_LIVE: "Listing live",
    BOOKING_AUTHORISED: "Booking authorised",
    PAYOUT_RELEASED: "Payout released",
};

/** The feed's kind as a word; an unknown kind reads as itself, title-cased. */
export function feedKindLabel(kind: string): string {
    const known = (PUBLISHER_FEED_KIND_LABEL as Partial<Record<string, string>>)[kind];
    if (known) return known;
    return kind.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export interface PublisherFeedEvent {
    kind: PublisherFeedKind | (string & {});
    at: string;
    title: string;
    detail: string | null;
}

/** Who onboarded the publisher, as `GET /publishers/:id` joins it (P-B); null for a self-signup. */
export interface PublisherAgentLabel {
    id: string;
    displayId: string | null;
    name: string;
}

/** A spot as the summary lists it — status, whether it is live and booked, and the review snapshot. */
export interface PublisherSummaryListing {
    id: string;
    displayId: string | null;
    title: string;
    category: string;
    city: string | null;
    status: string;
    live: boolean;
    occupied: boolean;
    publishedAt: string | null;
    ratePerDay: string | null;
    ratingAvg: string | null;
    reviewCount: number;
}

/**
 * `GET /publishers/:id/summary` — the publisher's detail card, the mirror
 * of the advertiser's: the row (with the agent joined), the money, the
 * spots and an activity feed. Every money figure is a decimal string,
 * printed and never parsed; the months are the Indian calendar month.
 */
export interface PublisherSummary {
    publisher: {
        id: string;
        agent?: PublisherAgentLabel | null;
    };
    metrics: {
        /** Net of commission, accrued this calendar month. */
        earningsThisMonth: string;
        earningsLifetime: string;
        payoutsReleased: { lifetime: string; thisMonth: string };
        /** "0.00" while no wallet exists yet. */
        walletBalance: string;
        withdrawable: string;
        listingsTotal: number;
        listingsLive: number;
        bookingsThisMonth: number;
        bookingsLifetime: number;
        /** Across the spots' review snapshots, weighted; null with no review at all. */
        ratingAvg: string | null;
        subscription: { tier: string; endsAt: string | null } | null;
    };
    listings: PublisherSummaryListing[];
    /** Merged newest first, thirty at most. */
    activity: PublisherFeedEvent[];
}

/** The tier line under the header: "Plus plan until 30 Sep 2026"; null without a running subscription. */
export function subscriptionLine(
    subscription: PublisherSummary["metrics"]["subscription"] | null | undefined,
    formatDate: (iso: string) => string,
): string | null {
    if (!subscription) return null;
    const tier = subscription.tier.charAt(0) + subscription.tier.slice(1).toLowerCase();
    return subscription.endsAt ? `${tier} plan until ${formatDate(subscription.endsAt)}` : `${tier} plan`;
}

/* ------------------------------------------------------------------ */
/* The action log — R-B / R-C                                           */
/* ------------------------------------------------------------------ */

/** The backend's `AccountActivityKind`: what an agent logs against the account by hand. */
export type AccountActivityKind = "CHECK_IN" | "FOLLOW_UP" | "CALLED" | "MESSAGED" | "NOTE";

export const ACCOUNT_ACTIVITY_KINDS: readonly AccountActivityKind[] = ["CHECK_IN", "FOLLOW_UP", "CALLED", "MESSAGED", "NOTE"];

export const ACCOUNT_ACTIVITY_KIND_LABEL: Record<AccountActivityKind, string> = {
    CHECK_IN: "Check-in",
    FOLLOW_UP: "Follow-up",
    CALLED: "Called",
    MESSAGED: "Messaged",
    NOTE: "Note",
};

/** The kind as a word; one the server grows reads as itself, title-cased. */
export function activityKindLabel(kind: string): string {
    return (ACCOUNT_ACTIVITY_KIND_LABEL as Partial<Record<string, string>>)[kind] ?? feedKindLabel(kind);
}

/** One row of `GET /publishers/:id/activity` — and what `POST` answers (201). */
export interface PublisherActivity {
    id: string;
    kind: AccountActivityKind | (string & {});
    note: string | null;
    at: string;
    agentId: string;
}

/** `POST /publishers/:id/activity` — the note is optional and, when sent, at most 1000 characters. */
export interface LogActivityInput {
    kind: AccountActivityKind;
    note?: string;
}

/** The list contract the log is served on; `counts` is per kind, taken with the kind facet removed. */
export interface PublisherActivityPage {
    items: PublisherActivity[];
    total: number;
    page: number;
    pageSize: number;
    counts: Record<string, number>;
}

/** Only a note with something in it goes up; the schema refuses an empty string. */
export function logActivityBody(input: LogActivityInput): { kind: AccountActivityKind; note?: string } {
    const note = input.note?.trim();
    return note ? { kind: input.kind, note } : { kind: input.kind };
}

export const publisherService = {
    /** The detail card. API only: there is no seeded earnings figure, and a fixture's would look exactly like a real one. */
    summary: (id: string): Promise<PublisherSummary> =>
        live().get<PublisherSummary>(`/publishers/${encodeURIComponent(id)}/summary`),
    /** R-B: the action log, newest first. 403 for an agent the account is not attributed to. */
    activity: (id: string, query: { kind?: AccountActivityKind; q?: string; page?: number; pageSize?: number } = {}): Promise<PublisherActivityPage> => {
        const params = new URLSearchParams();
        if (query.kind) params.set("status", query.kind);
        if (query.q) params.set("q", query.q);
        if (query.page) params.set("page", String(query.page));
        if (query.pageSize) params.set("pageSize", String(query.pageSize));
        const qs = params.toString();
        return live().get<PublisherActivityPage>(`/publishers/${encodeURIComponent(id)}/activity${qs ? `?${qs}` : ""}`);
    },
    /**
     * R-B: Check in, Follow up, a call, a message, a note — the mirror of
     * the advertiser's. The account's own agent or ADMIN; 409 `CONFLICT`
     * when the account has no agent to log against.
     */
    logActivity: (id: string, input: LogActivityInput): Promise<PublisherActivity> =>
        live().post<PublisherActivity>(`/publishers/${encodeURIComponent(id)}/activity`, logActivityBody(input)),
};

/* ------------------------------------------------------------------ */
/* The legacy book, imported — Lot D (Q43/Q86)                          */
/* ------------------------------------------------------------------ */

/* The vocabulary is the party importer's (package S): one status, one
   outcome and one multipart body for every party's import, the publisher's
   included. Re-exported so the names this file always carried still resolve. */
export { importBody, type ImportOutcome, type ImportStatus };

/** The twelve columns the CSV may carry; `mobile` is the only one required. */
export const IMPORT_COLUMNS = [
    "name",
    "mobile",
    "email",
    "type",
    "gstin",
    "address",
    "city",
    "state",
    "contactName",
    "contactMobile",
    "contactEmail",
    "panNumber",
] as const;

export interface PublisherImportRow {
    id: string;
    rowNumber: number;
    /** The row as typed, normalised, with the plan the commit will run. */
    data: Record<string, unknown>;
    outcome: ImportOutcome;
    publisherId: string | null;
    message: string | null;
}

export interface PublisherImport {
    id: string;
    fileName: string;
    note: string | null;
    uploadedById: string;
    status: ImportStatus;
    rowCount: number;
    createdCount: number;
    mergedCount: number;
    skippedCount: number;
    warningCount: number;
    invalidCount: number;
    createdAt: string;
    committedAt: string | null;
    /** On `GET /publishers/imports/:id` and the validate/commit answers; absent on the list. */
    rows?: PublisherImportRow[];
}

export const publisherImportService = {
    /** Step one: validate. 201, a VALIDATED import with a per-row plan. Nothing refuses the batch. */
    validate: (file: File, note?: string): Promise<PublisherImport> => live().post<PublisherImport>("/publishers/import", importBody(file, note)),

    /** The history, newest first. */
    list: (): Promise<PublisherImport[]> => live().get<PublisherImport[]>("/publishers/imports"),

    /** One import with its rows. */
    get: (id: string): Promise<PublisherImport> => live().get<PublisherImport>(`/publishers/imports/${id}`),

    /** Step three: commit, once. 409 twice, 409 after a revoke. */
    commit: (id: string): Promise<PublisherImport> => live().post<PublisherImport>(`/publishers/imports/${id}/commit`, {}),

    /** Only an uncommitted import can be withdrawn. */
    revoke: (id: string): Promise<PublisherImport> => live().post<PublisherImport>(`/publishers/imports/${id}/revoke`, {}),

    /** Where the report CSV lives — fetched with the token, not linked. */
    reportUrl: (id: string): string => `/publishers/imports/${id}/report.csv`,
};
