/**
 * Human-readable party identifiers, mirroring the backend `identifiers` module.
 * PUB-1909-2601 reads as: a publisher, joined 19 September, 2026, first that day.
 */

export type PartyType =
    | "PUBLISHER"
    | "ADVERTISER"
    | "PARTNER"
    | "EMPLOYEE"
    | "AGENT"
    | "USER"
    | "LISTING"
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

/**
 * The eighteen series of the backend's `PartyType`: the five parties, the
 * person's own id (QR-4, ADX-…), the listing reference (QR-8, LST-…), the
 * eight numbered records (R-C) and the three work series (Lot AA).
 */
export const PARTY_LABELS: Record<PartyType, string> = {
    PUBLISHER: "Publishers",
    ADVERTISER: "Advertisers",
    PARTNER: "Print partners",
    EMPLOYEE: "Employees",
    AGENT: "Field agents",
    USER: "People (every account)",
    LISTING: "Listings",
    TICKET: "Support tickets",
    FEEDBACK: "Feedback",
    DISPUTE: "Disputes",
    SAFETY: "Safety reports",
    LEAD: "Leads",
    VISIT: "Field visits",
    CERTIFICATE: "Certificates",
    FRAUD_CASE: "Fraud cases",
    TASK: "Tasks",
    ISSUE: "Issues",
    PROJECT: "Projects",
};

export const PARTY_ORDER: PartyType[] = [
    "PUBLISHER",
    "ADVERTISER",
    "PARTNER",
    "AGENT",
    "EMPLOYEE",
    "USER",
    "LISTING",
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

export interface IdentifierFormat {
    id: string;
    party: PartyType;
    prefix: string;
    pattern: string;
    seqPadding: number;
    timeZone: string;
    isActive: boolean;
    updatedAt: string;
}

/** The tokens a pattern may contain. Anything else is treated as literal text. */
export const PATTERN_TOKENS: { token: string; meaning: string }[] = [
    { token: "{PREFIX}", meaning: "The party prefix, e.g. PUB" },
    { token: "{DD}", meaning: "Day of the month, 2 digits" },
    { token: "{MM}", meaning: "Month, 2 digits" },
    { token: "{YY}", meaning: "Year, last 2 digits" },
    { token: "{YYYY}", meaning: "Year, 4 digits" },
    { token: "{SEQ}", meaning: "Position among that day's joiners" },
];

/**
 * Renders a pattern client-side so the preview updates as you type, without a
 * round trip. The backend renders the same way when it issues one for real —
 * this is a mirror, never the source of an issued identifier.
 */
export function renderIdentifierPreview(
    format: Pick<IdentifierFormat, "prefix" | "pattern" | "seqPadding" | "timeZone">,
    at: Date,
    sequence: number
): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: format.timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(at);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const year = get("year");

    const tokens: Record<string, string> = {
        "{PREFIX}": format.prefix,
        "{DD}": get("day"),
        "{MM}": get("month"),
        "{YY}": year.slice(-2),
        "{YYYY}": year,
        "{SEQ}": String(sequence).padStart(Math.max(1, format.seqPadding), "0"),
    };

    return Object.entries(tokens).reduce(
        (out, [token, value]) => out.split(token).join(value),
        format.pattern
    );
}
