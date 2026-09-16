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
    | "TICKET"
    | "FEEDBACK"
    | "DISPUTE"
    | "SAFETY"
    | "LEAD"
    | "VISIT"
    | "CERTIFICATE"
    | "FRAUD_CASE"
    | "TASK"
    | "ISSUE"
    | "PROJECT";

/** What the settings screen calls each series. */
export const PARTY_LABEL: Record<IdentifierParty, string> = {
    PUBLISHER: "Publishers",
    ADVERTISER: "Advertisers",
    PARTNER: "Print partners",
    EMPLOYEE: "Employees",
    AGENT: "Field agents",
    TICKET: "Support tickets",
    FEEDBACK: "Feedback",
    DISPUTE: "Disputes",
    SAFETY: "Safety reports",
    LEAD: "Leads",
    VISIT: "Field visits",
    CERTIFICATE: "Certificates",
    FRAUD_CASE: "Fraud cases",
    /* Lot AA: the DR 10 work series. */
    TASK: "Tasks",
    ISSUE: "Issues",
    PROJECT: "Projects",
};

/** The order the chips read in: the five parties, then the series in the order the platform grew them. */
export const PARTY_ORDER: readonly IdentifierParty[] = [
    "PUBLISHER",
    "ADVERTISER",
    "PARTNER",
    "AGENT",
    "EMPLOYEE",
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
     * Issues identifiers to publishers created before the feature existed,
     * against their own signup date rather than today. Idempotent, so running
     * it twice costs a round trip and nothing else.
     */
    backfillPublishers: (): Promise<{ assigned: number; remaining: number }> =>
        live().post<{ assigned: number; remaining: number }>("/identifiers/backfill/publishers"),
};
