import { ApiError, api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { shapeKycSummary } from "./kyc-state";
import type { WireKycSummary } from "@/types";
import type {
    Advertiser,
    AdvertiserType,
    AdvertiserFunnel,
    AdvertiserFunnelRow,
    AdvertiserStatus,
    Brand,
    BrandStatusFilter,
    WalletEntry,
    WalletSnapshot,
} from "@/types";

/**
 * Advertiser onboarding, wired to the backend `advertisers` module.
 * Specification: ADX-backendv1/docs/advertiser-onboarding.md.
 *
 * Same pattern as `supplyService`: one function per endpoint, HTTP only.
 * The `adv_*` fixtures that used to stand in with the API off are gone
 * (CE4): their ids were never issued by the backend, and a fixture row
 * beside a live one is how a seeded id ends up in a live request. With the
 * API off every read refuses with a message rather than improvising.
 *
 * The list endpoints are paginated on the backend and return `{ rows,
 * nextCursor }`. These unwrap to the rows, because no console screen paginates
 * yet — when one does, it takes the envelope rather than this.
 */

type Paged<T> = { rows: T[]; nextCursor: string | null };

export type TopUpMethod = "BANK_TRANSFER" | "CHEQUE";

/** `POST /advertisers/:id/wallet/top-up` — `topUpSchema` exactly. */
export interface TopUpInput {
    amount: string;
    method: TopUpMethod;
    /** The UTR of a transfer; the cheque number on a cheque. */
    utr?: string;
    /** ISO date-time the money arrived. */
    receivedAt: string;
    /** Which ADX account it landed in — `GET /finance/bank-accounts`. */
    bankAccountId?: string;
    /** An upload with purpose TOPUP_PROOF. */
    proofFileId?: string;
    note?: string;
}

/** One row of `GET /advertisers/:id/wallet/top-ups`. */
export interface WalletTopUp {
    id: string;
    walletId: string;
    amount: string;
    method: TopUpMethod | "GATEWAY";
    utr: string | null;
    receivedAt: string;
    bankAccountId: string | null;
    proofFileId: string | null;
    paymentId: string | null;
    note: string | null;
    recordedByUserId: string;
    walletEntryId: string | null;
    ledgerTransactionId: string | null;
    /** Set once a bank line explains it; a gateway settlement is reconciled at once. */
    reconciledAt: string | null;
    createdAt: string;
}

/** What a top-up answers with: the record, the wallet after, and whether it was new. */
export interface TopUpOutcome {
    topUp: WalletTopUp;
    wallet: WalletSnapshot;
    /** False when the same transfer had already been recorded. */
    created: boolean;
}

export type RefundReason = "NO_SUITABLE_ALTERNATIVE" | "PUBLISHER_WITHDREW" | "ADVERTISER_LEAVING" | "OTHER";
export type RefundDestination = "WALLET_CREDIT" | "BANK_TRANSFER" | "ORIGINAL_METHOD";

/** `POST /advertisers/:id/wallet/refund-requests` — `requestRefundSchema` exactly. */
export interface RefundRequestInput {
    amount: string;
    reason: RefundReason;
    /** Required, at least five characters. */
    note: string;
    ticketId?: string;
    destination?: RefundDestination;
    /** Required unless WALLET_CREDIT. */
    consentNote?: string;
    /** Required on BANK_TRANSFER: the advertiser's VERIFIED payout method. */
    payoutMethodId?: string;
}

/** The advertiser row as the API sends it — no derived `status`; `industry` absent from a server one release behind; N3-B: `kyc` the six facts on the by-id read. */
type WireAdvertiser = Omit<Advertiser, "status" | "joinedAt" | "industry" | "kyc"> & { createdAt: string; industry?: string | null; kyc?: WireKycSummary | null };

/**
 * Whether an account can actually spend.
 *
 * Both gates or neither: `activatedAt` is only set once KYC is verified *and*
 * the platform agreement has been accepted, so it is the single fact worth
 * reading. A rejected KYC is called out separately because it is the one state
 * somebody has to act on rather than wait for.
 */
export function advertiserStatus(row: {
    kycStatus: string;
    activatedAt: string | null;
}): AdvertiserStatus {
    if (row.kycStatus === "REJECTED") return "rejected";
    return row.activatedAt ? "active" : "pending";
}

export function shapeAdvertiser(raw: WireAdvertiser): Advertiser {
    return {
        id: raw.id,
        name: raw.name,
        displayId: raw.displayId ?? null,
        userId: raw.userId ?? null,
        user: raw.user ?? null,
        contact: raw.contact,
        email: raw.email ?? null,
        type: raw.type,
        companyName: raw.companyName ?? null,
        industry: raw.industry ?? null,
        gstin: raw.gstin ?? null,
        city: raw.city ?? null,
        state: raw.state ?? null,
        kycStatus: raw.kycStatus,
        // N3-B: the party's KYC state as the by-id read derives it; a list row carries no `kyc`, and the mirror stands in.
        kyc: shapeKycSummary(raw.kyc, raw.kycStatus),
        status: advertiserStatus(raw),
        activatedAt: raw.activatedAt ?? null,
        joinedAt: raw.createdAt,
        suspensionScopes: raw.suspensionScopes ?? [],
        suspensionReason: raw.suspensionReason ?? null,
        suspendedAt: raw.suspendedAt ?? null,
        // QR-15: the billing address, the person behind the account (the by-id read) and who onboarded them.
        billingAddress: raw.billingAddress ?? null,
        person: raw.person ?? null,
        onboarding: raw.onboarding ?? null,
    };
}

/**
 * Refuses to talk to the API while the domain is off. There is nothing to
 * fall back to, so a request stops here with a message rather than going
 * out to nowhere.
 */
function live() {
    if (!isLive("advertisers")) {
        throw new Error("Advertisers read the API; connect the console to the ADX backend first.");
    }
    return http;
}

const mutable = live;

/**
 * What the desk types to open an account for somebody who has not signed in
 * yet — `POST /advertisers` with `onBehalf: true`. The route is the same one
 * the agent app and self-serve signup use; for an ADMIN caller the backend
 * resolves no agent, so the account is held with `userId: null` and
 * `agentId: null` until its owner arrives by signing in with the number,
 * at which point `registerAdvertiser` links it rather than opening another.
 * The mobile is required here precisely because there is no session to
 * take it from.
 */
export interface CreateAdvertiserInput extends AdvertiserDeskFields {
    name: string;
    /** Ten digits, 6–9 first. */
    mobile: string;
    email?: string;
    type?: AdvertiserType;
    companyName?: string;
    /** Lot G (Q119): one of `GET /advertisers/industries`; a value off the list is 400. */
    industry?: string;
    city?: string;
    state?: string;
}

/**
 * QR-15: what the desk types beyond the bare account — the person (opened
 * on the sign-in account with the number, ADVERTISER role, when a first
 * name is given) and the billing details the app's profile gate collects.
 * Blank strings are left off the wire: the schema's `min()` would refuse
 * them, and a blank is "not said", never "clear".
 */
export interface AdvertiserDeskFields {
    firstName?: string;
    lastName?: string;
    /** YYYY-MM-DD, 18 or over. */
    dateOfBirth?: string;
    gender?: "MALE" | "FEMALE" | "OTHER" | "PREFER_NOT_TO_SAY";
    billingAddress?: string;
    gstin?: string;
}

/** `PATCH /advertisers/:id` — `updateProfileSchema`: the profile fields and the person's (QR-15); `industry: null` clears it. */
export interface UpdateAdvertiserInput extends AdvertiserDeskFields {
    name?: string;
    email?: string;
    type?: AdvertiserType;
    companyName?: string;
    industry?: string | null;
    city?: string;
    state?: string;
}

const TEXT_KEYS = ["name", "email", "companyName", "city", "state", "firstName", "lastName", "dateOfBirth", "gender", "billingAddress", "gstin"] as const;

/** The desk's fields onto a body: trimmed text where given, blanks left off, the industry as sent (null clears it). */
export function advertiserBody(input: UpdateAdvertiserInput): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    for (const key of TEXT_KEYS) {
        const value = input[key];
        if (typeof value === "string" && value.trim() !== "") body[key] = value.trim();
    }
    if (input.type) body.type = input.type;
    if (input.industry === null || (typeof input.industry === "string" && input.industry.trim() !== "")) body.industry = input.industry;
    return body;
}

/**
 * `GET /advertisers/:id/summary` — the detail card: the row, the metrics
 * (campaigns · spots · lifetime committed spend), the campaigns and an
 * activity feed. The console's advertiser page reads the metrics for its
 * tile row; the rest it already reads from routes of their own.
 */
export interface AdvertiserSummary {
    metrics: {
        campaigns: number;
        spots: number;
        /** Committed budget across campaigns, as money. Printed, never parsed. */
        spend: string;
    };
    /** The feed merged from the action log, field visits, campaigns gone live and packages paid — newest first, thirty at most. */
    activity?: { kind: string; at: string; title: string; detail: string | null }[];
}

/**
 * When the account was last touched: the newest `at` on the summary's feed,
 * whichever source it came from. Null while the feed is empty or the
 * summary could not be read — the tile then says nothing rather than "just
 * now". The feed is read whole rather than trusting its order, so a server
 * that merges four sources unsorted still answers the newest.
 */
export function lastActivityAt(summary: Pick<AdvertiserSummary, "activity"> | null | undefined): string | null {
    let newest: string | null = null;
    for (const event of summary?.activity ?? []) {
        if (!event.at || Number.isNaN(Date.parse(event.at))) continue;
        if (newest === null || Date.parse(event.at) > Date.parse(newest)) newest = event.at;
    }
    return newest;
}

export const advertiserService = {
    /** The detail card's metrics. API only: there is no seeded spend, and a fixture figure would look exactly like a real one. */
    summary: (id: string): Promise<AdvertiserSummary> =>
        http.get<AdvertiserSummary>(`/advertisers/${encodeURIComponent(id)}/summary`),

    /** Lot G (Q119): the industry picklist — a constant list in code, so a new one is a line there, not a free string. */
    industries: async (): Promise<string[]> => (await live().get<string[]>("/advertisers/industries")) ?? [],

    /** The profile fields — and the person's, QR-15. 400 for an industry off the list. */
    update: async (id: string, patch: UpdateAdvertiserInput): Promise<Advertiser> =>
        shapeAdvertiser(await mutable().patch<WireAdvertiser>(`/advertisers/${encodeURIComponent(id)}`, advertiserBody(patch))),

    /** Opens an account held for its owner (201) — with a first name, the sign-in account too (QR-15). 409 when the number already has one. */
    create: async (input: CreateAdvertiserInput): Promise<Advertiser> =>
        shapeAdvertiser(await mutable().post<WireAdvertiser>("/advertisers", { ...advertiserBody(input), mobile: input.mobile.trim(), onBehalf: true })),

    list: async (): Promise<Advertiser[]> => {
        const page = await live().get<Paged<WireAdvertiser>>("/advertisers?limit=200");
        return page.rows.map(shapeAdvertiser);
    },

    /**
     * E7-3: the roster searched server-side — `GET /advertisers?q=` is a
     * case-insensitive contains over name, company, email, displayId and
     * mobile — for the pickers that cannot hold the whole directory.
     */
    search: async (q: string, limit = 25): Promise<Advertiser[]> => {
        const needle = q.trim();
        if (!needle) return [];
        const params = new URLSearchParams({ q: needle, limit: String(limit) });
        const page = await mutable().get<Paged<WireAdvertiser>>(`/advertisers?${params.toString()}`);
        return (page.rows ?? []).map(shapeAdvertiser);
    },

    /**
     * One advertiser.
     *
     * Exists to close the same seam `supplyService.publisher` does: the
     * activation funnel reads the API and renders ids the API gave it, and every
     * one of those rows links here.
     */
    get: async (id: string): Promise<Advertiser | null> => {
        try {
            return shapeAdvertiser(await live().get<WireAdvertiser>(`/advertisers/${id}`));
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 404) return null;
            throw cause;
        }
    },

    funnel: async (): Promise<AdvertiserFunnel> => live().get<AdvertiserFunnel>("/advertisers/funnel"),

    funnelRows: async (): Promise<AdvertiserFunnelRow[]> => {
        const page = await live().get<Paged<AdvertiserFunnelRow>>("/advertisers/funnel/rows");
        return page.rows;
    },

    /**
     * The brand cards. No status returns every brand, active first; ACTIVE
     * or ARCHIVED returns that half.
     */
    brands: async (advertiserId: string, status?: BrandStatusFilter): Promise<Brand[]> => {
        const query = status ? `?status=${status}` : "";
        return live().get<Brand[]>(`/advertisers/${advertiserId}/brands${query}`);
    },

    wallet: async (advertiserId: string): Promise<WalletSnapshot> =>
        live().get<WalletSnapshot>(`/advertisers/${advertiserId}/wallet`),

    statement: async (advertiserId: string): Promise<WalletEntry[]> => {
        const page = await live().get<Paged<WalletEntry>>(`/advertisers/${advertiserId}/wallet/statement`);
        return page.rows;
    },

    /* ---------------- Mutations ---------------- */

    /**
     * Lot B (Q41/Q118): a structured top-up — money that arrived outside ADX,
     * recorded at the desk. A bank transfer needs its UTR; a cheque puts its
     * number in `utr`. The wallet is credited against suspense until
     * reconciliation matches the bank line. The same UTR on the same wallet
     * is one top-up: a second entry answers 409 rather than crediting twice.
     * The gateway never calls this route.
     */
    topUp: (advertiserId: string, body: TopUpInput) =>
        mutable().post<TopUpOutcome>(`/advertisers/${advertiserId}/wallet/top-up`, body),

    /** The top-ups recorded against this wallet, newest received first. */
    topUps: async (advertiserId: string): Promise<WalletTopUp[]> => {
        const page = await live().get<Paged<WalletTopUp>>(`/advertisers/${advertiserId}/wallet/top-ups?limit=100`);
        return page.rows;
    },

    /** What could be refunded today: settled balance less holds, never goodwill. */
    refundable: async (advertiserId: string): Promise<string> => {
        const answer = await live().get<{ refundable: string }>(`/advertisers/${advertiserId}/wallet/refundable`);
        return answer.refundable;
    },

    /**
     * Raised by support on the advertiser's behalf; the amount is frozen the
     * moment it is recorded and decided at the refund desk. Cash out —
     * BANK_TRANSFER — needs the advertiser's recorded consent and a VERIFIED
     * payout method of theirs; wallet credit needs nothing more.
     */
    requestRefund: (advertiserId: string, body: RefundRequestInput) =>
        mutable().post<{ id: string; status: string; walletId: string; amount: string; destination: string }>(
            `/advertisers/${advertiserId}/wallet/refund-requests`,
            body
        ),

    /** Issued by the supply enforcement ladder; this is the manual override. */
    creditGoodwill: (advertiserId: string, amount: string, note?: string) =>
        mutable().post<WalletSnapshot>(`/advertisers/${advertiserId}/wallet/goodwill`, {
            amount,
            ...(note ? { note } : {}),
        }),

    createBrand: (advertiserId: string, body: { name: string; sector?: string }) =>
        mutable().post<Brand>(`/advertisers/${advertiserId}/brands`, body),

    updateBrand: (
        advertiserId: string,
        brandId: string,
        patch: { name?: string; sector?: string; isActive?: boolean }
    ) => mutable().patch<Brand>(`/advertisers/${advertiserId}/brands/${brandId}`, patch),

    reviewKyc: (advertiserId: string, status: "VERIFIED" | "REJECTED") =>
        mutable().patch<unknown>(`/advertisers/${advertiserId}/kyc`, { status }),
};
