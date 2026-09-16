import { api as http } from "@/lib/api-client";
import { isLive, type LiveDomain } from "@/lib/api-config";

/**
 * The party importer — package S (owner, 15 Sep 2026): one two-step import
 * (validate with a per-row report, then commit) for the four parties that
 * had none — advertisers, agents, print partners, employees — at
 * `/party-imports/:party`. The publisher's own importer (Lot D, Q43/Q86)
 * keeps its routes in `publishers.ts`; the two share the vocabulary
 * declared here, and the same screen kit under
 * `components/adx/party-import`.
 *
 * The server never writes a party row itself: a CREATED row goes through
 * that party's own creation service, a MERGED row through its update, so a
 * created advertiser has its identifier, wallet, brand and PENDING KYC
 * exactly as a console Create would give it. The commit runs row by row
 * with a resumable marker rather than as one transaction — a commit that
 * dies half-way is picked up where it stopped by the next call.
 */

/** The `:party` segment. Anything else is a 400 before any table is read. */
export const IMPORT_PARTIES = ["advertisers", "agents", "print-partners", "employees"] as const;
export type ImportParty = (typeof IMPORT_PARTIES)[number];

/**
 * Package U — the two kinds that are FOR a publisher rather than of a party:
 * their listings and their rate card, at `/party-imports/listings` and
 * `/party-imports/rate-card`, every route taking `?publisherId=`. ADMIN, or
 * the publisher's agent under the listing act rule.
 */
export const LISTING_KINDS = ["listings", "rate-card"] as const;
export type ListingKind = (typeof LISTING_KINDS)[number];

export type ImportStatus = "VALIDATED" | "COMMITTED" | "REVOKED";
export type ImportOutcome = "CREATED" | "MERGED" | "SKIPPED" | "WARNING" | "INVALID";

/** `PartyImportRow` — the row as typed, normalised, with the plan the commit will run (or ran). */
export interface PartyImportRow {
    id: string;
    rowNumber: number;
    /** The normalised row; after a commit, `result { action, targetId, at }` is stamped on it. */
    data: Record<string, unknown>;
    outcome: ImportOutcome;
    /** The party row the commit created or merged into — null until it lands, and on a row that never does. */
    targetId: string | null;
    /**
     * The account behind that row, for the parties whose console page takes
     * the user id rather than the record's (the employee profile) — from the
     * merge plan or the commit stamp; null before either, and for a party
     * addressed by record id.
     */
    targetUserId: string | null;
    message: string | null;
}

/** `PartyImport` — one uploaded file and its counts. */
export interface PartyImport {
    id: string;
    party: string;
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
    /** Package U: the publisher a listings or rate-card import is for; null on the party imports. */
    publisherId?: string | null;
    /** Package U: the supply attempt a listings commit opened, so one agreement covers the batch; null until the commit, and on every other kind. */
    attemptId?: string | null;
    /** On `GET /party-imports/:party/:id` and the validate/commit answers; absent on the list. */
    rows?: PartyImportRow[];
}

/** `GET /party-imports/:party` — the list contract, the histogram over the party. */
export interface PartyImportPage {
    items: PartyImport[];
    total: number;
    page: number;
    pageSize: number;
    counts: Record<string, number>;
}

/** The multipart body a validate takes — the CSV under `file`, a note beside it. Shared with the publisher's importer. */
export function importBody(file: File, note?: string): FormData {
    const body = new FormData();
    body.append("file", file, file.name);
    const trimmed = note?.trim();
    if (trimmed) body.append("note", trimmed);
    return body;
}

/** The `api-config` domain each party's screens are gated on. */
export const IMPORT_PARTY_DOMAIN: Record<ImportParty, LiveDomain> = {
    advertisers: "advertisers",
    agents: "agents",
    "print-partners": "printPartners",
    employees: "employees",
};

function live(party: ImportParty) {
    if (!isLive(IMPORT_PARTY_DOMAIN[party])) throw new Error("Imports write through the API; connect the console to the ADX backend first.");
    return http;
}

const base = (party: ImportParty) => `/party-imports/${party}`;

/**
 * What one party's screens call — the same five verbs and the report
 * location for every party, so the kit takes any of them (and the
 * publisher's, wrapped) without knowing which.
 */
export interface PartyImportApi {
    validate: (file: File, note?: string) => Promise<PartyImport>;
    list: () => Promise<PartyImport[]>;
    get: (id: string) => Promise<PartyImport>;
    commit: (id: string) => Promise<PartyImport>;
    revoke: (id: string) => Promise<PartyImport>;
    /** Where the report CSV lives, relative to the API base — fetched with the token, not linked. */
    reportUrl: (id: string) => string;
}

/** `/party-imports/:party` for one of the four parties. */
export function partyImportService(party: ImportParty): PartyImportApi {
    return {
        /** Step one: validate. 201, a VALIDATED import with a per-row plan. Nothing refuses the batch. */
        validate: (file, note) => live(party).post<PartyImport>(`${base(party)}`, importBody(file, note)),

        /** The history, newest first — the list contract's first page, large enough for a desk. */
        list: async () => (await live(party).get<PartyImportPage>(`${base(party)}?page=1&pageSize=100`)).items,

        /** One import with its rows. 404 under the wrong party. */
        get: (id) => live(party).get<PartyImport>(`${base(party)}/${encodeURIComponent(id)}`),

        /** Step three: commit — per row, resumable. 409 twice, 409 after a revoke. */
        commit: (id) => live(party).post<PartyImport>(`${base(party)}/${encodeURIComponent(id)}/commit`, {}),

        /** Only an uncommitted import can be withdrawn. */
        revoke: (id) => live(party).post<PartyImport>(`${base(party)}/${encodeURIComponent(id)}/revoke`, {}),

        reportUrl: (id) => `${base(party)}/${encodeURIComponent(id)}/report.csv`,
    };
}

/* ------------------------------------------------------------------ */
/* Package U — the publisher's two kinds                               */
/* ------------------------------------------------------------------ */

/**
 * `/party-imports/listings` and `/party-imports/rate-card` for one
 * publisher. A validate needs the publisher (the server answers 400
 * without one — the kit's picker gates the upload step on it); the
 * reads take the publisher when one is named and answer every publisher's
 * to ADX when none is, which is how a report opened from the history
 * reads without the picker.
 */
export function listingImportService(kind: ListingKind, publisherId: string | null): PartyImportApi {
    const client = () => {
        if (!isLive("listings")) throw new Error("Imports write through the API; connect the console to the ADX backend first.");
        return http;
    };
    const root = `/party-imports/${kind}`;
    /** The list's query — the page, and the publisher when one is named. */
    const listQuery = () => new URLSearchParams(publisherId ? { publisherId, page: "1", pageSize: "100" } : { page: "1", pageSize: "100" }).toString();
    return {
        validate: (file, note) => {
            if (!publisherId) return Promise.reject(new Error("Pick the publisher the file is for first."));
            return client().post<PartyImport>(`${root}?publisherId=${encodeURIComponent(publisherId)}`, importBody(file, note));
        },
        list: async () => (await client().get<PartyImportPage>(`${root}?${listQuery()}`)).items,
        get: (id) => client().get<PartyImport>(`${root}/${encodeURIComponent(id)}`),
        commit: (id) => client().post<PartyImport>(`${root}/${encodeURIComponent(id)}/commit`, {}),
        revoke: (id) => client().post<PartyImport>(`${root}/${encodeURIComponent(id)}/revoke`, {}),
        reportUrl: (id) => `${root}/${encodeURIComponent(id)}/report.csv`,
    };
}

/** The plan a listings row carries under `data.plan` after validation. */
export interface ListingRowPlan {
    action: "CREATE" | "MERGE";
    targetId?: string;
    fill?: Record<string, string>;
    warnings: string[];
}

/** The plan a rate-card row carries under `data.plan`: the listing, the rate it goes to and the rate it had. */
export interface RateCardRowPlan {
    action: "SET";
    targetId: string;
    ratePerDay: string;
    slotsTotal?: number;
    from: string | null;
    warnings: string[];
}

/** The plan off a row's data, when the server wrote one (an INVALID or SKIPPED row carries null). */
export function planOf<T extends ListingRowPlan | RateCardRowPlan>(row: Pick<PartyImportRow, "data">): T | null {
    const plan = row.data["plan"];
    return plan && typeof plan === "object" && "action" in plan ? (plan as T) : null;
}

/* ------------------------------------------------------------------ */
/* Package U — the format guide                                        */
/* ------------------------------------------------------------------ */

/**
 * Every import kind on the platform — the guide answers one JSON each
 * (`GET /party-imports/formats/:kind`) and a template.csv each. The
 * parties and the publisher's two kinds are on the kit; leads, market
 * data and the bank statement have importers of their own and carry the
 * guide's panel.
 */
export const FORMAT_KINDS = ["publishers", "advertisers", "agents", "print-partners", "employees", "listings", "rate-card", "leads", "market-data", "finance-reconciliation"] as const;
export type FormatKind = (typeof FORMAT_KINDS)[number];

export type FormatColumnType = "text" | "mobile" | "email" | "enum" | "number" | "money" | "date" | "url" | "list";

/** One column of a kind's file, as the guide describes it — kept beside the validator on the server, so it cannot drift. */
export interface FormatColumn {
    name: string;
    required: boolean;
    type: FormatColumnType;
    description: string;
    example: string;
    enumValues?: string[];
    maxLength?: number;
}

/** `GET /party-imports/formats/:kind` — the columns, the rules, two sample rows and where the template lives. */
export interface ImportFormat {
    kind: FormatKind;
    title: string;
    purpose: string;
    /** Where the file goes, and in what shape — a sentence, not a template. */
    route: string;
    columns: FormatColumn[];
    rules: string[];
    sampleRows: Record<string, string>[];
    /** Absolute, under the API prefix — fetched with the token, not linked. */
    templateCsvUrl: string;
}

/** The plain word for a column's type, on the guide's table. */
export const FORMAT_COLUMN_TYPE_WORD: Record<FormatColumnType, string> = {
    text: "Text",
    mobile: "Mobile",
    email: "Email",
    enum: "One of",
    number: "Number",
    money: "Amount",
    date: "Date",
    url: "URL",
    list: "List",
};

export const importFormatsService = {
    /** Every kind's guide, in the platform's order. */
    list: (): Promise<ImportFormat[]> => http.get<ImportFormat[]>("/party-imports/formats"),

    /** One kind's guide; 404 for a word that is not one. */
    get: (kind: FormatKind): Promise<ImportFormat> => http.get<ImportFormat>(`/party-imports/formats/${kind}`),

    /** The header row and the two sample rows, relative to the API base — fetched with the token. */
    templateUrl: (kind: FormatKind): string => `/party-imports/formats/${kind}/template.csv`,
};
