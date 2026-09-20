import type * as React from "react";
import type { LiveDomain } from "@/lib/api-config";
import { IMPORT_PARTY_DOMAIN, partyImportService, type FormatKind, type ImportParty, type ListingKind, type PartyImport, type PartyImportApi, type PartyImportRow } from "@/services/party-imports";
import { IMPORT_COLUMNS as PUBLISHER_COLUMNS, publisherImportService, type PublisherImport } from "@/services/publishers";

/**
 * What the import kit needs to know about a party — package S.
 *
 * The screens are the same for every party: upload one CSV, read the
 * server's per-row plan, commit or revoke, come back to the report from
 * the history. What differs is here: the columns the server reads for
 * this party (its `party-imports.schema.ts`, or the publisher's
 * `importRowSchema`), the cells the grid draws, where a committed row can
 * be opened, and the service that talks to its routes.
 */

export type ImportKitParty = "publishers" | ImportParty | ListingKind;

/** Package U: the publisher a listings or rate-card import is for, as the header and the picker name them. */
export interface ImportPublisher {
    id: string;
    name: string;
    displayId: string | null;
}

export interface ImportColumn {
    /** The header the CSV carries — the schema's key, in any order. */
    key: string;
    label: string;
    /** Only `mobile` everywhere, plus `side` for agents (it picks the role). */
    required?: boolean;
    /** What the server accepts — enum values, formats, the merge rule. */
    hint: string;
    example: string;
}

export interface GridColumn {
    key: string;
    label: string;
    /** Drawn in the mono face — numbers, PAN. */
    mono?: boolean;
    /** Package U: a cell that is not one value of the row — a rate before → after, a floor flag. Wins over `key`. */
    render?: (row: PartyImportRow) => React.ReactNode;
}

export interface PartyImportConfig {
    party: ImportKitParty;
    /** "publisher" / "publishers". */
    singular: string;
    plural: string;
    /** The back link at the top — the section's root. */
    section: { label: string; href: string };
    /** The page itself; `?id=` opens one import. */
    href: string;
    /**
     * Where a created or merged row opens, by the ids the commit stamped on
     * it — the record's for most parties; the employee profile takes the
     * user id (`targetUserId`), so its link is null until that is known.
     */
    targetHref: (targetId: string, targetUserId: string | null) => string | null;
    liveDomain: LiveDomain;
    /** Package U: which guide `GET /party-imports/formats/:kind` answers for this kind — the File format panel and the template. */
    formatKind: FormatKind;
    /**
     * Package U: the import is FOR a publisher — every route takes
     * `?publisherId=`, and the upload step is gated on the picker until one
     * is chosen. The party imports are not.
     */
    needsPublisher?: boolean;
    columns: ImportColumn[];
    /** The cells the report grid draws between the row number and the outcome. */
    grid: GridColumn[];
    /** The dropzone's hint — what the file is usually called. The template itself is the server's (`/party-imports/formats/:kind/template.csv`). */
    templateFileName: string;
    notePlaceholder: string;
    /** What one commit does for this party — under the dialog's title. */
    commitDescription: (record: Pick<PartyImport, "createdCount" | "mergedCount">) => string;
    /** Under the toast once the commit has landed. */
    commitToast: string;
    /** The note below the grid — how merges and warnings read for this party. */
    rules: { title: string; body: string };
    /** The routes — for the publisher's two kinds, scoped to the publisher named; the parties ignore the argument. */
    api: (publisherId: string | null) => PartyImportApi;
    /** Package U: what the report draws above its grid beyond the four tiles — the map pins and the agreement for listings, the floor flags for a rate card. */
    reportExtras?: (props: { record: PartyImport; onChanged: () => void }) => React.ReactNode;
}

/* ------------------------------------------------------------------ */
/* The publisher — its own routes, the same screens                     */
/* ------------------------------------------------------------------ */

/** The publisher's import on the kit's contract: `publisherId` is the row's target, the party is named. */
function fromPublisherImport(record: PublisherImport): PartyImport {
    const { rows, ...rest } = record;
    return {
        ...rest,
        party: "publishers",
        rows: rows?.map(({ publisherId, ...row }) => ({ ...row, targetId: publisherId, targetUserId: null })),
    };
}

const publisherApi: PartyImportApi = {
    validate: async (file, note) => fromPublisherImport(await publisherImportService.validate(file, note)),
    list: async () => (await publisherImportService.list()).map(fromPublisherImport),
    get: async (id) => fromPublisherImport(await publisherImportService.get(id)),
    commit: async (id) => fromPublisherImport(await publisherImportService.commit(id)),
    revoke: async (id) => fromPublisherImport(await publisherImportService.revoke(id)),
    reportUrl: (id) => publisherImportService.reportUrl(id),
};

const PUBLISHER_COLUMN_META: Record<(typeof PUBLISHER_COLUMNS)[number], Omit<ImportColumn, "key">> = {
    name: { label: "Business name", hint: "Free text.", example: "Chennai Hoardings" },
    mobile: { label: "Mobile", required: true, hint: "Ten digits; the identity a merge matches on.", example: "9876543210" },
    email: { label: "Email", hint: "Lower-cased on the way in.", example: "owner@example.in" },
    type: { label: "Type", hint: "INDIVIDUAL, BUSINESS, NGO or POLITICAL — any casing.", example: "BUSINESS" },
    gstin: { label: "GSTIN", hint: "Fifteen characters, upper-cased and format-checked.", example: "33ABCDE1234F1Z5" },
    address: { label: "Address", hint: "Free text.", example: "12 Mount Road" },
    city: { label: "City", hint: "Resolved against the catalogue; unknown is a warning.", example: "Chennai" },
    state: { label: "State", hint: "Free text.", example: "Tamil Nadu" },
    contactName: { label: "Contact name", hint: "Free text.", example: "R. Kumar" },
    contactMobile: { label: "Contact mobile", hint: "Ten digits.", example: "9876500000" },
    contactEmail: { label: "Contact email", hint: "Lower-cased.", example: "kumar@example.in" },
    panNumber: { label: "PAN", hint: "ABCDE1234F, upper-cased; one already on another publisher is a warning.", example: "ABCDE1234F" },
    // QR-13: a row naming the person opens (or adopts) their account with the publisher; with the basics in it lands complete.
    firstName: { label: "First name", hint: "Opens the owner's account with the row; the app never asks their name again.", example: "Rakesh" },
    lastName: { label: "Last name", hint: "With the first name.", example: "Sharma" },
    dateOfBirth: { label: "Date of birth", hint: "YYYY-MM-DD, 18 or over — one of the four readiness basics.", example: "1980-05-14" },
    gender: { label: "Gender", hint: "MALE, FEMALE, OTHER or PREFER_NOT_TO_SAY — any casing; optional.", example: "MALE" },
    latitude: { label: "Latitude", hint: "The address pin, with the longitude; decimal degrees.", example: "13.0604" },
    longitude: { label: "Longitude", hint: "With the latitude.", example: "80.2496" },
};

export const PUBLISHER_IMPORT_CONFIG: PartyImportConfig = {
    party: "publishers",
    singular: "publisher",
    plural: "publishers",
    section: { label: "Publishers", href: "/publishers" },
    href: "/publishers/import",
    targetHref: (id) => `/publishers/${id}`,
    liveDomain: "supply",
    formatKind: "publishers",
    columns: PUBLISHER_COLUMNS.map((key) => ({ key, ...PUBLISHER_COLUMN_META[key] })),
    grid: [
        { key: "name", label: "Business name" },
        { key: "mobile", label: "Mobile", mono: true },
        { key: "panNumber", label: "PAN", mono: true },
        { key: "email", label: "Email" },
        { key: "city", label: "City" },
    ],
    templateFileName: "publishers-master.csv",
    notePlaceholder: "The Chennai ledger, 2019–2024",
    commitDescription: ({ createdCount, mergedCount }) =>
        `${createdCount} publisher${createdCount === 1 ? "" : "s"} will be created as pending onboarding with an empty KYC row, ${mergedCount} merged into the book, in one transaction — never verified, never attributed to an agent. Invalid and skipped rows are left out. This runs once.`,
    commitToast: "Every one is pending onboarding with an empty KYC row; none is attributed to an agent.",
    rules: {
        title: "Errors are skipped, warnings import with gaps",
        body: "A mobile already on the book merges into that publisher, filling only what is empty; a PAN on another publisher and a city not in the catalogue are warnings and still create. Fix the file and upload it again to include the invalid rows.",
    },
    api: () => publisherApi,
};

/* ------------------------------------------------------------------ */
/* The four parties — `/party-imports/:party`                          */
/* ------------------------------------------------------------------ */

const MOBILE: ImportColumn = { key: "mobile", label: "Mobile", required: true, hint: "Ten digits; the identity a merge matches on.", example: "9876543210" };
const CITY: ImportColumn = { key: "city", label: "City", hint: "Resolved against the catalogue; unknown is a warning, kept as typed.", example: "Bengaluru" };
const STATE: ImportColumn = { key: "state", label: "State", hint: "Free text.", example: "Karnataka" };
const GSTIN: ImportColumn = { key: "gstin", label: "GSTIN", hint: "Fifteen characters, upper-cased and format-checked; one on another row of the party is a warning.", example: "29ABCDE1234F1Z5" };
const PAN: ImportColumn = { key: "panNumber", label: "PAN", hint: "ABCDE1234F, upper-cased; one on another row of the party is a warning.", example: "ABCDE1234F" };

const partyRules = (what: string) => ({
    title: "Errors are skipped, warnings import with gaps",
    body: `A mobile already on the ${what} merges into it, filling only what is empty; a PAN or GSTIN on another row and a city not in the catalogue are warnings and still create. A row the party's own service would refuse is invalid here, with the reason. Fix the file and upload it again to include the invalid rows.`,
});

/** The commit is per row and resumable: a call that dies half-way is picked up by the next. */
const perRow = (created: number, merged: number, noun: string, extra: string) =>
    `${created} ${noun}${created === 1 ? "" : "s"} will be created through the desk's own Create — ${extra} — and ${merged} merged, row by row. Invalid and skipped rows are left out. A commit that stops half-way carries on from where it stopped on the next call.`;

export const PARTY_IMPORT_CONFIGS: Record<ImportParty, PartyImportConfig> = {
    advertisers: {
        party: "advertisers",
        singular: "advertiser",
        plural: "advertisers",
        section: { label: "Advertisers", href: "/advertisers" },
        href: "/advertisers/import",
        targetHref: (id) => `/advertisers/${id}`,
        liveDomain: IMPORT_PARTY_DOMAIN.advertisers,
        formatKind: "advertisers",
        columns: [
            { key: "name", label: "Name", hint: "Free text.", example: "Priya Menon" },
            MOBILE,
            { key: "email", label: "Email", hint: "Lower-cased on the way in.", example: "priya@example.in" },
            { key: "type", label: "Type", hint: "INDIVIDUAL, COMMERCIAL, NGO or AGENCY — any casing.", example: "COMMERCIAL" },
            { key: "companyName", label: "Company", hint: "Free text.", example: "Menon Retail" },
            { key: "industry", label: "Industry", hint: "One of the advertiser industries (Retail, Food & beverage, Real estate, …) — any casing.", example: "Retail" },
            GSTIN,
            { ...PAN, hint: "Validated and kept on the report, not written: an advertiser's PAN lives on the KYC record." },
            { key: "address", label: "Address", hint: "Lands as the billing address.", example: "4 MG Road" },
            CITY,
            STATE,
            { key: "contactName", label: "Contact name", hint: "Validated and kept on the report, not written: the profile has no contact column.", example: "A. Rao" },
            /* QR-15: the person — given a first name, the row opens the sign-in account up front, as the desk does. */
            { key: "firstName", label: "First name", hint: "Given, the row opens the sign-in account with the number (lastName, address and city needed too; companyName unless INDIVIDUAL).", example: "Priya" },
            { key: "lastName", label: "Last name", hint: "The person's last name.", example: "Menon" },
            { key: "dateOfBirth", label: "Date of birth", hint: "YYYY-MM-DD, 18 or over; on the account, not the profile.", example: "1988-02-14" },
            { key: "gender", label: "Gender", hint: "MALE, FEMALE, OTHER or PREFER_NOT_TO_SAY — any casing; on the account.", example: "FEMALE" },
        ],
        grid: [
            { key: "name", label: "Name" },
            { key: "mobile", label: "Mobile", mono: true },
            { key: "companyName", label: "Company" },
            { key: "email", label: "Email" },
            { key: "city", label: "City" },
        ],
        templateFileName: "advertisers-master.csv",
        notePlaceholder: "The agency's client list, 2024",
        commitDescription: ({ createdCount, mergedCount }) => perRow(createdCount, mergedCount, "advertiser", "identifier, wallet and brand, pending KYC, no agent"),
        commitToast: "Every one has its identifier, wallet and brand, is pending KYC and is attributed to no agent.",
        rules: partyRules("advertiser book"),
        api: () => partyImportService("advertisers"),
    },
    agents: {
        party: "agents",
        singular: "agent",
        plural: "agents",
        section: { label: "Agents", href: "/agents" },
        href: "/agents/import",
        targetHref: (id) => `/agents/${id}`,
        liveDomain: IMPORT_PARTY_DOMAIN.agents,
        formatKind: "agents",
        columns: [
            { key: "name", label: "Name", hint: "The account's name.", example: "Suresh Babu" },
            MOBILE,
            { key: "email", label: "Email", hint: "The account's email — one already on another account is invalid.", example: "suresh@example.in" },
            { key: "side", label: "Side", required: true, hint: "PUBLISHER or ADVERTISER — it picks the role.", example: "PUBLISHER" },
            CITY,
            STATE,
        ],
        grid: [
            { key: "name", label: "Name" },
            { key: "mobile", label: "Mobile", mono: true },
            { key: "side", label: "Side" },
            { key: "email", label: "Email" },
            { key: "city", label: "City" },
        ],
        templateFileName: "agents-roster.csv",
        notePlaceholder: "The field team, south region",
        commitDescription: ({ createdCount, mergedCount }) =>
            perRow(createdCount, mergedCount, "agent", "the account, the role and the profile in one write; a number already on an account gains the role"),
        commitToast: "Each has its account, role and profile; a merge filled only city and state.",
        rules: partyRules("roster"),
        api: () => partyImportService("agents"),
    },
    "print-partners": {
        party: "print-partners",
        singular: "print partner",
        plural: "print partners",
        section: { label: "Print partners", href: "/print-partners" },
        href: "/print-partners/import",
        targetHref: (id) => `/print-partners/${id}`,
        liveDomain: IMPORT_PARTY_DOMAIN["print-partners"],
        formatKind: "print-partners",
        columns: [
            { key: "name", label: "Shop name", hint: "Free text.", example: "Rapid Flex Prints" },
            { ...MOBILE, hint: "Ten digits; a number already on an ADX account is invalid — a partner never attaches to a person." },
            { key: "legalName", label: "Legal name", hint: "Free text.", example: "Rapid Flex Prints Pvt Ltd" },
            GSTIN,
            PAN,
            { key: "contactName", label: "Contact name", hint: "Free text.", example: "M. Iyer" },
            { key: "email", label: "Email", hint: "Lower-cased; one already on another account is invalid.", example: "print@example.in" },
            { key: "address", label: "Address", hint: "Free text.", example: "18 Industrial Estate" },
            CITY,
            { key: "capabilities", label: "Capabilities", hint: "Pipe-separated: flex|vinyl|backlit.", example: "flex|vinyl" },
            { key: "maxWidthFt", label: "Max width (ft)", hint: "A number with at most two decimals.", example: "12.5" },
            { key: "turnaroundDays", label: "Turnaround (days)", hint: "A whole number up to 365.", example: "3" },
        ],
        grid: [
            { key: "name", label: "Shop" },
            { key: "mobile", label: "Mobile", mono: true },
            { key: "panNumber", label: "PAN", mono: true },
            { key: "email", label: "Email" },
            { key: "city", label: "City" },
        ],
        templateFileName: "print-partners-roster.csv",
        notePlaceholder: "The Bengaluru vendor list",
        commitDescription: ({ createdCount, mergedCount }) => perRow(createdCount, mergedCount, "print partner", "a sign-in-disabled account, identifier and wallet"),
        commitToast: "Each has its sign-in-disabled account, identifier and wallet.",
        rules: partyRules("roster"),
        api: () => partyImportService("print-partners"),
    },
    employees: {
        party: "employees",
        singular: "employee",
        plural: "employees",
        section: { label: "Employees", href: "/employees" },
        href: "/employees/import",
        targetHref: (_recordId, userId) => (userId ? `/employees/directory/${userId}` : null),
        liveDomain: IMPORT_PARTY_DOMAIN.employees,
        formatKind: "employees",
        columns: [
            { key: "name", label: "Name", hint: "The account's name.", example: "Anita Desai" },
            MOBILE,
            { key: "email", label: "Email", hint: "The account's email — one already on another account is invalid.", example: "anita@keysquare.in" },
            { key: "department", label: "Department", hint: "Free text.", example: "Operations" },
            { key: "designation", label: "Designation", hint: "Free text.", example: "Ops associate" },
            { key: "region", label: "Region", hint: "Free text.", example: "South" },
            { key: "workMode", label: "Work mode", hint: "OFFICE, REMOTE, HYBRID or FIELD — any casing.", example: "OFFICE" },
            { key: "employmentType", label: "Employment type", hint: "FULL_TIME, PART_TIME, CONTRACT or INTERN — any casing.", example: "FULL_TIME" },
        ],
        grid: [
            { key: "name", label: "Name" },
            { key: "mobile", label: "Mobile", mono: true },
            { key: "email", label: "Email" },
            { key: "department", label: "Department" },
            { key: "designation", label: "Designation" },
        ],
        templateFileName: "employees-roster.csv",
        notePlaceholder: "The HR export, September",
        commitDescription: ({ createdCount, mergedCount }) =>
            perRow(createdCount, mergedCount, "employee", "an account with no console role (that comes from an invitation) and the record"),
        commitToast: "Each has an account with no console role — an invitation grants that — and its record.",
        rules: partyRules("roster"),
        api: () => partyImportService("employees"),
    },
};

/** Every party the kit serves, the publisher included. The publisher's two kinds (package U) are in `listing-import-config.tsx`. */
export const IMPORT_KIT_CONFIGS: Record<Exclude<ImportKitParty, ListingKind>, PartyImportConfig> = {
    publishers: PUBLISHER_IMPORT_CONFIG,
    ...PARTY_IMPORT_CONFIGS,
};
