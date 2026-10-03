import { api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import type { IdentifierFormat } from "@/types";

/**
 * Party identifier formats, wired to the backend `identifiers` module.
 *
 * HTTP only: the seeded formats are gone (CE4) — a format is what the next
 * identifier is minted from, and a seeded one would have promised a prefix
 * the server never issues. With the API off the screen says so.
 *
 * Saving a format never rewrites an identifier already issued — those are
 * stored on the party row. A change here only affects the next one out, which
 * is why the screen can save without a confirmation step.
 *
 * Q-C item 4: the party list comes from the API, not from a list of the
 * console's own. `GET /identifiers/formats` answers only the parties that
 * have ever been configured or issued from; `GET /identifiers/formats/:party`
 * materialises the server's own default for one that has not, so
 * `formatsForEveryParty` reads the list and fills the gaps through that read
 * — thirteen rows, every prefix the server's, none invented here.
 */

/** The backend's `PartyType` — the thirteen series the counter mints. */
export type IdentifierParty =
    | "PUBLISHER"
    | "ADVERTISER"
    | "PARTNER"
    | "EMPLOYEE"
    | "AGENT"
    | "LISTING"
    | "TICKET"
    | "FEEDBACK"
    | "DISPUTE"
    | "SAFETY"
    | "LEAD"
    | "USER"
    | "ORDER"
    | "VISIT"
    | "CERTIFICATE"
    | "FRAUD_CASE"
    | "TASK"
    | "ISSUE"
    | "PROJECT"
    /* LM-1: ADB-… on a display ad, BST-… on a sponsored listing. */
    | "AD_BOOKING"
    | "LISTING_BOOST";

/** What the settings screen calls each series. */
export const PARTY_LABEL: Record<IdentifierParty, string> = {
    PUBLISHER: "Publishers",
    ADVERTISER: "Advertisers",
    PARTNER: "Print partners",
    EMPLOYEE: "Employees",
    AGENT: "Field agents",
    /* QR-8: LST-DDMM-YYNN, the listing's reference. */
    LISTING: "Listings",
    TICKET: "Support tickets",
    FEEDBACK: "Feedback",
    DISPUTE: "Disputes",
    SAFETY: "Safety reports",
    LEAD: "Leads",
    /* QR-4: ADX-…, the person's own id. */
    USER: "People",
    /* BK-1: BKG-DDMM-YYNN, the booking's reference — an order, named so an advertiser and a publisher can quote one. */
    ORDER: "Bookings",
    VISIT: "Field visits",
    CERTIFICATE: "Certificates",
    FRAUD_CASE: "Fraud cases",
    /* Lot AA: the DR 10 work series. */
    TASK: "Tasks",
    ISSUE: "Issues",
    PROJECT: "Projects",
    AD_BOOKING: "Display ads",
    LISTING_BOOST: "Sponsored listings",
};

/** The order the chips read in: the five parties, then the series in the order the platform grew them. */
export const PARTY_ORDER: readonly IdentifierParty[] = [
    "PUBLISHER",
    "ADVERTISER",
    "PARTNER",
    "AGENT",
    "EMPLOYEE",
    "LISTING",
    "USER",
    "ORDER",
    "TICKET",
    "FEEDBACK",
    "DISPUTE",
    "SAFETY",
    "LEAD",
    "VISIT",
    "CERTIFICATE",
    "FRAUD_CASE",
    "TASK",
    "ISSUE",
    "PROJECT",
];

/** A label for a party the server names and this file does not know yet — the enum's word, made readable. */
export const partyLabel = (party: string): string =>
    PARTY_LABEL[party as IdentifierParty] ?? party.charAt(0) + party.slice(1).toLowerCase().replace(/_/g, " ");

/**
 * Whose id a desk line is printing (29 Sep 2026, the owner: "multiple
 * profile ID assignments to a single profile"). A person has one id of
 * their own, ADX-…, and it reads "ADX ID" — the desk looks at somebody
 * else, so never "Your". Every party row has its own id too, and that one
 * is always named by its kind, never printed bare beside a person and never
 * as the person's.
 *
 * Keyed on the series rather than read off the prefix: the prefix and the
 * pattern are the identifier formats screen's to change, and every caller
 * already knows which kind of row it holds.
 */
export type IdOwner = Extract<IdentifierParty, "USER" | "PUBLISHER" | "ADVERTISER" | "PARTNER" | "AGENT">;

export const ID_LABEL: Record<IdOwner, string> = {
    USER: "ADX ID",
    PUBLISHER: "Publisher account ID",
    ADVERTISER: "Advertiser account ID",
    PARTNER: "Print partner ID",
    AGENT: "Agent ID",
};

/** "Advertiser account ID ADV-2909-2601" — null when none is issued, so a joined line drops it rather than printing a bare label. */
export function idLine(owner: IdOwner, displayId: string | null | undefined): string | null {
    const id = displayId?.trim();
    return id ? `${ID_LABEL[owner]} ${id}` : null;
}

/**
 * The API's rows in the console's order, with any party the server knows
 * and this file does not appended in the server's order — the server leads.
 */
export function orderFormats<T extends { party: string }>(rows: T[]): T[] {
    const known = PARTY_ORDER.map((party) => rows.find((row) => row.party === party)).filter((row): row is T => row !== undefined);
    const rest = rows.filter((row) => !PARTY_ORDER.includes(row.party as IdentifierParty));
    return [...known, ...rest];
}

export interface FormatPatch {
    prefix: string;
    pattern: string;
    seqPadding: number;
    timeZone: string;
}

function live() {
    if (!isLive("identifiers")) {
        throw new Error("Identifier formats read the API; connect the console to the ADX backend first.");
    }
    return http;
}

export const identifierService = {
    /** `GET /identifiers/formats` — the parties that have a row, as the server orders them. */
    formats: (): Promise<IdentifierFormat[]> => live().get<IdentifierFormat[]>("/identifiers/formats"),

    /** `GET /identifiers/formats/:party` — one party's format; the server materialises its default for one never configured. */
    format: (party: string): Promise<IdentifierFormat> =>
        live().get<IdentifierFormat>(`/identifiers/formats/${encodeURIComponent(party)}`),

    /**
     * Every party's format: the list, then one read per party the list left
     * out, so the screen shows all thirteen with the server's own defaults
     * rather than a prefix guessed here. The gap reads happen once — the
     * server keeps the row it materialised.
     */
    formatsForEveryParty: async (): Promise<IdentifierFormat[]> => {
        const listed = await identifierService.formats();
        const missing = PARTY_ORDER.filter((party) => !listed.some((row) => row.party === party));
        const filled = await Promise.all(missing.map((party) => identifierService.format(party)));
        return orderFormats([...listed, ...filled]);
    },

    updateFormat: (party: string, patch: FormatPatch): Promise<IdentifierFormat> =>
        live().patch<IdentifierFormat>(`/identifiers/formats/${encodeURIComponent(party)}`, patch),

    /**
     * Issues identifiers to rows created before their series existed —
     * publishers against their own signup date rather than today, then (QR-4)
     * people and (BK-1) bookings the same way. Idempotent, so running it twice
     * costs a round trip and nothing else. `users` and `orders` are absent on
     * a backend older than those series.
     */
    backfillPublishers: (): Promise<BackfillResult> => live().post<BackfillResult>("/identifiers/backfill/publishers"),
};

/** What one run of the backfill did per series: issued now, and still to go. */
export interface BackfillCount {
    assigned: number;
    remaining: number;
}

export interface BackfillResult extends BackfillCount {
    users?: BackfillCount;
    orders?: BackfillCount;
}

/**
 * "Issued 12 publisher, 3 people and 40 booking identifiers, 5 bookings
 * still to go" — or the plain truth that nothing was owed. One sentence
 * across the series the answer named.
 */
export function backfillSummary(result: BackfillResult): string {
    const series: { noun: [string, string]; count: BackfillCount }[] = [
        { noun: ["publisher", "publisher"], count: result },
        ...(result.users ? [{ noun: ["person", "people"] as [string, string], count: result.users }] : []),
        ...(result.orders ? [{ noun: ["booking", "booking"] as [string, string], count: result.orders }] : []),
    ];
    const issued = series.filter((row) => row.count.assigned > 0).map((row) => `${row.count.assigned} ${row.count.assigned === 1 ? row.noun[0] : row.noun[1]}`);
    const remaining = series.filter((row) => row.count.remaining > 0).map((row) => `${row.count.remaining} ${row.count.remaining === 1 ? row.noun[0] : row.noun[1]}`);
    if (issued.length === 0) return remaining.length ? `Nothing issued this run; ${remaining.join(", ")} still to go` : "Every publisher, person and booking already has an identifier";
    return `Issued ${issued.join(", ")} identifier${issued.length === 1 && series.find((row) => row.count.assigned === 1) ? "" : "s"}${remaining.length ? `, ${remaining.join(", ")} still to go` : ""}`;
}
