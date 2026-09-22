import { ApiError, api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { shapeKycSummary } from "./kyc-state";
import { shapeListing, type AdminListing, type WireOwnListing } from "@/services/listings";
import type {
    ComplianceCase,
    KycStatus,
    StatusMeta,
    ListingVerification,
    Publisher,
    ListingAttempt,
    PublisherFunnelRow,
    SupplyFunnel,
    SuspensionColumns,
    SuspensionScope,
    VerificationQueueRow,
    RightsQueueRow,
    WireKycSummary,
    PublisherPerson,
    OnboardingFacts,
} from "@/types";

/**
 * Publisher supply lifecycle, wired to the backend `supply` module.
 *
 * These were the first calls in the console to hit real endpoints beyond
 * auth, so they set the pattern the other domains followed as they
 * connected: one function per endpoint, HTTP only. The seeded funnel,
 * attempts, queue and compliance cases are gone (CE4); with the API off
 * every read refuses with a message rather than improvising.
 *
 * The API client keeps its token in localStorage, so every one of these must be
 * called from the browser. That is why the supply screens fetch through
 * `useApiResource` rather than being async server components.
 */

/* ------------------------------------------------------------------ */
/* Response shaping                                                    */
/* ------------------------------------------------------------------ */

/** Prisma dates arrive as ISO strings over JSON; the UI types already say so. */
type Wire<T> = T;

/**
 * The backend returns the attempt with its listings and a `progress` block, but
 * without the publisher's name — it is on the relation, not the row. Until the
 * endpoint joins it, fall back to the id so the screen still reads.
 */
function shapeAttempt(raw: Wire<ListingAttempt> & { publisher?: { name?: string } }): ListingAttempt {
    return {
        ...raw,
        publisherName: raw.publisherName ?? raw.publisher?.name ?? null,
        listings: raw.listings ?? [],
    };
}

/**
 * The backend's bounded reads: a queue that is written to while it is read
 * comes as one cursor page — `rows` and the id to pass back as `?cursor=`
 * for the next, null when the list is exhausted. The console reads the
 * largest page the server allows and says when there is more, rather than
 * paging a queue whose rows move under it.
 */
export interface CursorPage<T> {
    rows: T[];
    nextCursor: string | null;
}

/** The server's ceiling on `?limit=`. */
export const CURSOR_PAGE_LIMIT = 200;

/** `?limit=<ceiling>` and, from the second page on, `&cursor=<last id>`. */
export function cursorQuery(cursor: string | null = null): string {
    const params = new URLSearchParams({ limit: String(CURSOR_PAGE_LIMIT) });
    if (cursor) params.set("cursor", cursor);
    return params.toString();
}

/**
 * A page, whichever shape it arrived in. The routes went from a bare array to
 * a cursor page one at a time, and a read typed to the old shape called
 * `.filter` on an object and took the page down (ERR-7F3A21C9); a backend
 * behind or ahead of this file is not something the console should fail on.
 */
function cursorPage<T>(data: CursorPage<T> | T[] | null | undefined): CursorPage<T> {
    if (Array.isArray(data)) return { rows: data, nextCursor: null };
    return { rows: data?.rows ?? [], nextCursor: data?.nextCursor ?? null };
}

/* ------------------------------------------------------------------ */
/* Calls                                                               */
/* ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ */
/* The publisher roster — DR 10 `/publishers`, live                     */
/* ------------------------------------------------------------------ */

/** A publisher exactly as `GET /publishers` sends it. */
export interface WirePublisher {
    id: string;
    displayId: string | null;
    name: string;
    mobile: string;
    email?: string | null;
    /** AG-5: the importance band ops set; absent on a server older than the routing. */
    sizeBand?: string | null;
    city: string | null;
    type: string | null;
    kycStatus: string;
    onboardingStatus?: string | null;
    activatedAt?: string | null;
    agentId: string | null;
    createdAt: string;
    listings?: { id: string }[];
    /** N2-B: the account behind the profile, on every roster row (the bare `?q=` array and the `?page=` list alike); null until somebody registers against it. */
    userId?: string | null;
    /** QR-14: who onboarded them; absent on a server older than the stamp. */
    onboarding?: OnboardingFacts | null;
    /* Lot A. Optional on the wire for rows older than the columns. */
    suspensionScopes?: SuspensionScope[];
    suspensionReason?: string | null;
    suspendedAt?: string | null;
}

/**
 * One row of the roster.
 *
 * Deliberately shorter than the fixture row it replaces. `monthlyEarnings`,
 * `lastActive`, `pan` and `gstin` are gone rather than zero-filled: nothing on
 * the API computes them, and a column of plausible zeroes beside real records
 * is the thing this migration exists to remove.
 */
export interface RosterPublisher extends SuspensionColumns {
    id: string;
    displayId: string | null;
    /** N2-B: the publisher's own user id — the desk uploads under it and attests presence against it; null when nobody has registered yet. */
    userId: string | null;
    name: string;
    mobile: string;
    city: string | null;
    type: string | null;
    kycStatus: string;
    onboardingStatus: string | null;
    listingCount: number;
    onboardedByAgent: boolean;
    /** QR-14: who onboarded them, and how — null on a row older than the stamp. */
    onboarding: OnboardingFacts | null;
    createdAt: string;
}

/** `GET /publishers?page=` — E10-1: the list contract; `counts` is by `kycStatus`, counted with the KYC tab removed. */
export interface WirePublishersPage {
    items: WirePublisher[];
    total: number;
    page: number;
    pageSize: number;
    counts: Record<string, number>;
}

export function shapePublisher(wire: WirePublisher): RosterPublisher {
    return {
        id: wire.id,
        displayId: wire.displayId,
        userId: wire.userId ?? null,
        name: wire.name,
        mobile: wire.mobile,
        city: wire.city,
        type: wire.type,
        kycStatus: wire.kycStatus,
        onboardingStatus: wire.onboardingStatus ?? null,
        listingCount: wire.listings?.length ?? 0,
        // DR 08 lets a publisher sign up with no agent at all; the roster says
        // which arrived that way rather than leaving the column blank.
        onboardedByAgent: wire.agentId !== null,
        onboarding: wire.onboarding ?? null,
        createdAt: wire.createdAt,
        suspensionScopes: wire.suspensionScopes ?? [],
        suspensionReason: wire.suspensionReason ?? null,
        suspendedAt: wire.suspendedAt ?? null,
    };
}

/**
 * `GET /publishers/:id` — the roster row with the relations the detail read
 * joins (`kyc`, `listings`, `user`) and E6's `openOrders`. Everything beyond
 * the roster row is optional on the wire: the same include serves the list.
 */
export interface WirePublisherDetail extends WirePublisher {
    userId?: string | null;
    gstin?: string | null;
    contactName?: string | null;
    contactMobile?: string | null;
    contactEmail?: string | null;
    /** QR-13. */
    address?: string | null;
    state?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    person?: PublisherPerson | null;
    /**
     * The `PublisherKyc` row's facts — N3-B: `state` and `kycId` beside the
     * record's columns, and never null before a record (the six-column
     * summary with `status: null` then). A server one release behind sends
     * the PAN alone, or null.
     */
    kyc?: (WireKycSummary & { panNumber?: string | null }) | null;
    user?: { closedAt: string | null; closeReason: string | null } | null;
    openOrders?: number;
}

/**
 * The detail page's row. Same rule as `shapePublisher`: what the API does not
 * carry is null here rather than a plausible stand-in — a fresh publisher has
 * no PAN, no listings and no contact person, and the page says so.
 */
export function shapePublisherDetail(wire: WirePublisherDetail): Publisher {
    return {
        id: wire.id,
        displayId: wire.displayId,
        userId: wire.userId ?? null,
        user: wire.user ?? null,
        openOrders: wire.openOrders ?? 0,
        name: wire.name,
        mobile: wire.mobile,
        email: wire.email ?? null,
        city: wire.city,
        type: wire.type,
        // The enum's string, typed; `kycStatusMeta` labels a value the enum grows.
        kycStatus: wire.kycStatus as KycStatus,
        contactName: wire.contactName ?? null,
        contactMobile: wire.contactMobile ?? null,
        contactEmail: wire.contactEmail ?? null,
        gstin: wire.gstin ?? null,
        pan: wire.kyc?.panNumber ?? null,
        // N3-B: the party's KYC state as the server derives it — the same word the queue row carries.
        kyc: shapeKycSummary(wire.kyc, wire.kycStatus),
        sizeBand: wire.sizeBand ?? null,
        sites: wire.listings?.length ?? 0,
        agentId: wire.agentId,
        onboardingStatus: wire.onboardingStatus ?? null,
        createdAt: wire.createdAt,
        activatedAt: wire.activatedAt ?? null,
        suspensionScopes: wire.suspensionScopes ?? [],
        suspensionReason: wire.suspensionReason ?? null,
        suspendedAt: wire.suspendedAt ?? null,
        // QR-13: the address, its pin and the person, for the desk's Edit details.
        address: wire.address ?? null,
        state: wire.state ?? null,
        latitude: wire.latitude ?? null,
        longitude: wire.longitude ?? null,
        person: wire.person ?? null,
        onboarding: wire.onboarding ?? null,
    };
}

/**
 * The chip tone per backend `KycStatus` — the four values the enum has and
 * no others (Q-C item 7: SUBMITTED, UNDER_REVIEW and NOT_STARTED were never
 * values of it). Keyed on `string` because the roster row carries the
 * status as the wire's string; a reader falls back to neutral on a value it
 * does not know.
 */
export const KYC_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
    VERIFIED: "success",
    PENDING: "warning",
    NEEDS_INFO: "warning",
    REJECTED: "danger",
};

/**
 * The backend's `VerificationStatus` — what a reviewed site verification
 * carries on the wire. ACCEPTED, not APPROVED: the review route writes
 * ACCEPTED, and the chip has to know the word the server uses.
 */
export type VerificationStatus = "SUBMITTED" | "ACCEPTED" | "REJECTED";

export const VERIFICATION_STATUS_META: Record<VerificationStatus, StatusMeta> = {
    SUBMITTED: { label: "Awaiting review", tone: "warning" },
    ACCEPTED: { label: "Accepted", tone: "success" },
    REJECTED: { label: "Rejected", tone: "danger" },
};

/** The chip for a verification's status, whatever spelling the row carries. */
export const verificationStatusMeta = (status: string): StatusMeta =>
    VERIFICATION_STATUS_META[status as VerificationStatus] ?? { label: kycLabel(status), tone: "neutral" };

/* ------------------------------------------------------------------ */
/* Listing claims — Q-C item 3                                          */
/* ------------------------------------------------------------------ */

/** The backend's `ListingClaimStatus`. */
export type ListingClaimStatus = "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN";

export const LISTING_CLAIM_STATUSES: readonly ListingClaimStatus[] = ["PENDING", "APPROVED", "REJECTED", "WITHDRAWN"];

export const LISTING_CLAIM_STATUS_META: Record<ListingClaimStatus, StatusMeta> = {
    PENDING: { label: "Pending", tone: "warning" },
    APPROVED: { label: "Approved", tone: "success" },
    REJECTED: { label: "Rejected", tone: "danger" },
    WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
};

/** A `ListingClaim` row exactly as `GET /supply/claims` sends it — no joins. */
export interface WireListingClaim {
    id: string;
    listingId: string;
    claimantPublisherId: string;
    status: ListingClaimStatus;
    evidenceNote: string | null;
    decisionNote: string | null;
    decidedAt: string | null;
    decidedByUserId: string | null;
    createdAt: string;
}

export interface ListingClaim {
    id: string;
    listingId: string;
    claimantPublisherId: string;
    status: ListingClaimStatus;
    evidenceNote: string | null;
    decisionNote: string | null;
    decidedAt: string | null;
    decidedByUserId: string | null;
    createdAt: string;
}

/** The row as the desk reads it — the record's own columns; a server one release behind may leave the nullable ones off. */
export function shapeClaim(wire: WireListingClaim): ListingClaim {
    return {
        id: wire.id,
        listingId: wire.listingId,
        claimantPublisherId: wire.claimantPublisherId,
        status: wire.status,
        evidenceNote: wire.evidenceNote ?? null,
        decisionNote: wire.decisionNote ?? null,
        decidedAt: wire.decidedAt ?? null,
        decidedByUserId: wire.decidedByUserId ?? null,
        createdAt: wire.createdAt,
    };
}

export const kycLabel = (status: string): string =>
    status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");

/**
 * Refuses to talk to the API while the domain is off. There is nothing to
 * fall back to, so a request stops here with a message rather than going
 * out to nowhere.
 */
function live() {
    if (!isLive("supply")) throw new Error("Supply reads the API; connect the console to the ADX backend first.");
    return http;
}

export const supplyService = {
    /**
     * The roster. ADX sees every publisher; the same route answers an agent
     * with the ones they onboarded, which is why it is not ADMIN-gated.
     *
     * No fixture fallback: the seeded `pub_*` ids were never issued by the
     * backend, so every row click opened a publisher that does not exist —
     * inside a domain this file already declares live.
     */
    roster: async (): Promise<RosterPublisher[]> => {
        const rows = await http.get<WirePublisher[]>("/publishers");
        return (rows ?? []).map(shapePublisher);
    },

    /**
     * E10-1: the roster searched on the server — `?q=` over name, display
     * id, city and mobile — one page of `limit` rows on the list contract.
     * What the command palette reads, so a keystroke costs five rows, not
     * the whole roster.
     */
    search: async (q: string, limit: number): Promise<RosterPublisher[]> => {
        const params = new URLSearchParams({ q: q.trim(), page: "1", pageSize: String(limit) });
        const page = await http.get<WirePublishersPage>(`/publishers?${params.toString()}`);
        return (page.items ?? []).map(shapePublisher);
    },

    funnel: async (): Promise<SupplyFunnel> => live().get<SupplyFunnel>("/supply/funnel"),

    publishers: async (): Promise<PublisherFunnelRow[]> => live().get<PublisherFunnelRow[]>("/supply/funnel/publishers"),

    /**
     * One publisher, live when supply is.
     *
     * Exists to close a seam rather than to serve a screen of its own: the
     * supply screens read the API and render ids the API gave them, then linked
     * into a publisher page that resolved from fixtures. Every one of those
     * links answered 404 in live mode — a whole domain reading correctly and
     * still being unusable, because following a row was the point.
     */
    publisher: async (id: string): Promise<Publisher | null> => {
        try {
            return shapePublisherDetail(await live().get<WirePublisherDetail>(`/publishers/${id}`));
        } catch (cause) {
            // A 404 here means the id does not exist, which the page renders as
            // its own not-found rather than as a failed request.
            if (cause instanceof ApiError && cause.status === 404) return null;
            throw cause;
        }
    },

    /**
     * The publisher's listings, as rows of the listings desk. The read joins
     * neither publisher nor agent — the page knows whose they are — so the
     * rows are shaped by the desk's own shaper with those two left null.
     */
    publisherListings: async (id: string): Promise<AdminListing[]> => {
        const rows = await live().get<WireOwnListing[]>(`/publishers/${id}/listings`);
        return (rows ?? []).map(shapeListing);
    },

    verificationQueue: async (): Promise<VerificationQueueRow[]> =>
        live().get<VerificationQueueRow[]>("/supply/verification-queue"),

    /** QR-24: `GET /supply/rights-queue?horizonDays=` — terms ending within the horizon, and ended ones, soonest first. */
    rightsQueue: async (horizonDays = 60): Promise<RightsQueueRow[]> =>
        live().get<RightsQueueRow[]>(`/supply/rights-queue?horizonDays=${horizonDays}`),

    /** QR-24: `POST /supply/rights/sweep` — the reminders and lapses the job would do at its next tick, now. */
    runRightsSweep: () => http.post<{ considered: number; lapsed: number; reminded: number }>("/supply/rights/sweep"),

    /** `GET /supply/attempts` — one cursor page of the largest size, shaped; `cursor` reads the page after it. */
    attempts: async (cursor: string | null = null): Promise<CursorPage<ListingAttempt>> => {
        const page = cursorPage(await live().get<CursorPage<ListingAttempt> | ListingAttempt[]>(`/supply/attempts?${cursorQuery(cursor)}`));
        return { rows: page.rows.map(shapeAttempt), nextCursor: page.nextCursor };
    },

    attempt: async (id: string): Promise<ListingAttempt | null> =>
        shapeAttempt(await live().get<ListingAttempt>(`/supply/attempts/${id}`)),

    /** `GET /supply/compliance/cases` — one cursor page of the largest size, due-soonest first; `cursor` reads the page after it. */
    complianceCases: async (cursor: string | null = null): Promise<CursorPage<ComplianceCase>> =>
        cursorPage(await live().get<CursorPage<ComplianceCase> | ComplianceCase[]>(`/supply/compliance/cases?${cursorQuery(cursor)}`)),

    /**
     * `GET /supply/claims` — Q-C item 3: every ownership claim on a scraped
     * listing, oldest first, one cursor page at a time; `?status=` narrows
     * to one state. The row is the `ListingClaim` record alone — the route
     * joins neither the listing's title nor the claimant's name, so the desk
     * links both by id rather than printing a name it does not have.
     */
    claims: async (status: ListingClaimStatus | null = null, cursor: string | null = null): Promise<CursorPage<ListingClaim>> => {
        const query = cursorQuery(cursor);
        const page = cursorPage(
            await live().get<CursorPage<WireListingClaim> | WireListingClaim[]>(`/supply/claims?${query}${status ? `&status=${status}` : ""}`)
        );
        return { rows: page.rows.map(shapeClaim), nextCursor: page.nextCursor };
    },

    /**
     * Every verification filed against one listing, newest first, each with all
     * of its named shots.
     *
     * The endpoint has always returned the shots; nothing in the console read
     * them, so a four-photograph site visit was reviewed on the one photo
     * mirrored onto `photoUrl` while the agent app told the agent ADX checks
     * them all. This is what the review sheet reads.
     */
    verifications: async (listingId: string): Promise<ListingVerification[]> =>
        live().get<ListingVerification[]>(`/supply/listings/${listingId}/verifications`),

    /* ---------------- Mutations ---------------- */

    acceptPlatformAgreement: (publisherId: string) =>
        http.post<unknown>("/supply/agreements/accept-platform", { publisherId }),

    acceptListingAgreement: (attemptId: string) =>
        http.post<unknown>("/supply/agreements/accept-listing", { attemptId }),

    requestAttemptAcceptance: (attemptId: string) =>
        http.post<unknown>(`/supply/attempts/${attemptId}/request-acceptance`),

    reviewDocument: (documentId: string, approve: boolean, rejectionReason?: string) =>
        http.patch<unknown>(`/supply/documents/${documentId}/review`, { approve, rejectionReason }),

    reviewVerification: (verificationId: string, approve: boolean, rejectionReason?: string) =>
        http.patch<unknown>(`/supply/verifications/${verificationId}/review`, {
            approve,
            rejectionReason,
        }),

    /**
     * Idempotent by design on the backend, so a double click costs nothing but
     * a second round trip.
     */
    runEnforcementSweep: () =>
        http.post<{ lapsed: number; holdsOpened: number; casesOpened: number; suspended: number }>(
            "/supply/enforcement/sweep"
        ),

    /**
     * `PATCH /supply/claims/:claimId/decide` — `{ approve, decisionNote? }`
     * per the supply schema; a rejection needs the note (the server refuses
     * one without). Approving moves the listing to the claimant under a
     * fresh attempt awaiting the listing agreement; a claim already decided
     * answers 409.
     */
    decideClaim: (claimId: string, approve: boolean, decisionNote?: string) =>
        live().patch<ListingClaim>(`/supply/claims/${claimId}/decide`, { approve, decisionNote }),

    logContactAttempt: (
        caseId: string,
        body: { channel: string; outcome: string; note?: string }
    ) => http.post<unknown>(`/supply/compliance/cases/${caseId}/attempts`, body),

    resolveComplianceCase: (caseId: string) =>
        http.patch<unknown>(`/supply/compliance/cases/${caseId}/resolve`),
};
