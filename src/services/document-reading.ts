import { api as http } from "@/lib/api-client";

/**
 * DR-1 (23 Sep 2026): reading what is written on an uploaded document.
 *
 * `POST /files/:id/read { kind }` sends the file to the vision model and
 * holds the answer to the kind's field list; `GET /files/:id/reading` is the
 * reading kept on the file. The desk names the kind from the column the
 * document sits in (`kindForDocument`), draws the fields under the picture,
 * badges a value that disagrees with what was typed
 * (`readingMismatches`), and prefills a number or an expiry
 * (`PRIMARY_NUMBER_FIELD`, `EXPIRY_FIELD`). Nothing here decides anything.
 *
 * Aadhaar is never a kind — the reader returns null for it and the desk
 * shows no reading on those tiles.
 */

export const DOCUMENT_KINDS = [
    "PAN",
    "DRIVING_LICENCE",
    "PASSPORT",
    "VOTER_ID",
    "GST_CERTIFICATE",
    "INCORPORATION_CERTIFICATE",
    "UTILITY_BILL",
    "BANK_STATEMENT",
    "AGREEMENT",
    "VEHICLE_RC",
    "VEHICLE_INSURANCE",
    "PERMIT_OR_LICENCE",
    "AUTHORISATION_LETTER",
    "OTHER",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
    PAN: "PAN card",
    DRIVING_LICENCE: "Driving licence",
    PASSPORT: "Passport",
    VOTER_ID: "Voter ID",
    GST_CERTIFICATE: "GST certificate",
    INCORPORATION_CERTIFICATE: "Registration certificate",
    UTILITY_BILL: "Utility bill",
    BANK_STATEMENT: "Bank statement",
    AGREEMENT: "Agreement",
    VEHICLE_RC: "Vehicle RC",
    VEHICLE_INSURANCE: "Vehicle insurance",
    PERMIT_OR_LICENCE: "Permit or licence",
    AUTHORISATION_LETTER: "Authorisation letter",
    OTHER: "Document",
};

/** The field labels the backend's `DOCUMENT_FIELDS` carry, in the order it asks for them. */
export const DOCUMENT_FIELD_LABEL: Record<DocumentKind, Record<string, string>> = {
    PAN: { number: "PAN", name: "Name", fatherName: "Father's name", dateOfBirth: "Date of birth" },
    DRIVING_LICENCE: { number: "Licence number", name: "Name", dateOfBirth: "Date of birth", address: "Address", validUntil: "Valid until", issuingAuthority: "Issuing RTO" },
    PASSPORT: { number: "Passport number", name: "Name", nationality: "Nationality", dateOfBirth: "Date of birth", validUntil: "Valid until", placeOfIssue: "Place of issue" },
    VOTER_ID: { number: "EPIC number", name: "Name", address: "Address" },
    GST_CERTIFICATE: { gstin: "GSTIN", legalName: "Legal name", tradeName: "Trade name", address: "Principal place of business", registrationDate: "Date of registration", constitution: "Constitution" },
    INCORPORATION_CERTIFICATE: { cin: "CIN / registration number", companyName: "Name", incorporationDate: "Date of incorporation", registrar: "Registrar" },
    UTILITY_BILL: { name: "Name", address: "Service address", billDate: "Bill date", provider: "Provider", consumerNumber: "Consumer number" },
    BANK_STATEMENT: { accountHolder: "Account holder", bankName: "Bank", accountNumberLast4: "Account ends in", ifsc: "IFSC", address: "Address", statementPeriod: "Statement period" },
    AGREEMENT: { title: "Title", partyA: "First party", partyB: "Second party", propertyAddress: "Property", startDate: "Term starts", endDate: "Term ends", amount: "Consideration" },
    VEHICLE_RC: { registrationNumber: "Registration", ownerName: "Owner", vehicleClass: "Class", makerModel: "Make and model", fuel: "Fuel", registrationDate: "Registered on", validUntil: "Valid until" },
    VEHICLE_INSURANCE: { policyNumber: "Policy number", insurer: "Insurer", vehicleRegistration: "Vehicle", insuredName: "Insured", validFrom: "Valid from", validUntil: "Valid until" },
    PERMIT_OR_LICENCE: { title: "Title", issuingAuthority: "Issued by", holder: "Holder", propertyAddress: "Site", referenceNumber: "Reference", startDate: "Valid from", endDate: "Valid until" },
    AUTHORISATION_LETTER: { issuer: "Issued by", authorisedPerson: "Authorised", purpose: "For", date: "Dated", validUntil: "Valid until" },
    OTHER: { title: "Title", issuer: "Issued by", holder: "Holder", referenceNumber: "Reference", date: "Dated", validUntil: "Valid until" },
};

/** The field that is the document's own number, when it has one — what a desk prefills. */
export const PRIMARY_NUMBER_FIELD: Partial<Record<DocumentKind, string>> = {
    PAN: "number",
    DRIVING_LICENCE: "number",
    PASSPORT: "number",
    VOTER_ID: "number",
    GST_CERTIFICATE: "gstin",
    INCORPORATION_CERTIFICATE: "cin",
    VEHICLE_RC: "registrationNumber",
    VEHICLE_INSURANCE: "policyNumber",
    PERMIT_OR_LICENCE: "referenceNumber",
    OTHER: "referenceNumber",
};

/** The field that says when the document stops being valid, when it has one. */
export const EXPIRY_FIELD: Partial<Record<DocumentKind, string>> = {
    DRIVING_LICENCE: "validUntil",
    PASSPORT: "validUntil",
    VEHICLE_RC: "validUntil",
    VEHICLE_INSURANCE: "validUntil",
    AGREEMENT: "endDate",
    PERMIT_OR_LICENCE: "endDate",
    AUTHORISATION_LETTER: "validUntil",
    OTHER: "validUntil",
};

export interface ReadField {
    value: string | null;
    confidence: number;
}

export interface DocumentReading {
    fileId: string;
    kind: DocumentKind;
    /** What the model says the document actually is. */
    documentSeen: string;
    matchesKind: boolean;
    fields: Record<string, ReadField>;
    warnings: string[];
    summary: string;
    /** The mean over the fields that came back with a value. */
    confidence: number;
    provider: string;
    model: string;
    readAt: string;
    readByUserId: string;
}

export const WARNING_LABEL: Record<string, string> = {
    AADHAAR_NUMBER_PRESENT: "An Aadhaar number is on this document and was withheld",
};

/** The file id inside a `/files/:id` URL, absolute or relative; null for a public URL, which cannot be read. */
export function fileIdOf(url: string | null | undefined): string | null {
    if (!url) return null;
    const match = /\/files\/([A-Za-z0-9_-]+)(?:[?#].*)?$/.exec(url);
    return match?.[1] ?? null;
}

export interface KindHints {
    /** The tile's label as the desk words it — "Government ID · front (Passport)". */
    label?: string | null;
    /** Which government id the party chose: AADHAAR, PASSPORT, DRIVING_LICENCE. */
    govIdType?: string | null;
    /** Which address proof: UTILITY_BILL, RENT_AGREEMENT, BANK_STATEMENT. */
    addressProofType?: string | null;
}

const has = (text: string | null | undefined, word: string) => (text ?? "").toLowerCase().includes(word);

/**
 * Which kind a document column holds — the KYC tiles of every party, the
 * agent's papers and the listing's documents share this one map. Null means
 * the tile is not read at all: an Aadhaar (never), a selfie, a photo, a
 * signature, a résumé.
 */
export function kindForDocument(field: string, hints: KindHints = {}): DocumentKind | null {
    if (/aadhaar/i.test(field)) return null;
    if (/selfie|^photo$|resume|signature|panBack/i.test(field)) return null;
    if (/^(panFrontUrl|panCardUrl|commercialPanIdUrl|PAN)$/.test(field)) return "PAN";
    if (/DRIVING_LICENCE|drivingLicense/i.test(field)) return "DRIVING_LICENCE";
    if (field === "PASSPORT") return "PASSPORT";
    if (/govId|nationalId|directorId|agencyGovtId/i.test(field)) {
        const hint = hints.govIdType ?? hints.label;
        if (has(hint, "aadhaar")) return null;
        if (has(hint, "passport")) return "PASSPORT";
        if (has(hint, "driving")) return "DRIVING_LICENCE";
        return "OTHER";
    }
    if (/gst/i.test(field)) return "GST_CERTIFICATE";
    if (/bank/i.test(field)) return "BANK_STATEMENT";
    if (/RegCert|IncCert|INCORPORATION/i.test(field)) return "INCORPORATION_CERTIFICATE";
    if (/AuthLetter|OWNER_NOC|AUTHORISATION/i.test(field)) return "AUTHORISATION_LETTER";
    if (/addressProof|utilityBill|ADDRESS_PROOF/i.test(field)) {
        const hint = hints.addressProofType ?? hints.label;
        if (has(hint, "rent")) return "AGREEMENT";
        if (has(hint, "bank")) return "BANK_STATEMENT";
        return "UTILITY_BILL";
    }
    if (field === "VEHICLE_RC") return "VEHICLE_RC";
    if (field === "VEHICLE_INSURANCE") return "VEHICLE_INSURANCE";
    if (field === "DISPLAY_AGREEMENT") return "AGREEMENT";
    if (field === "MUNICIPAL_PERMIT") return "PERMIT_OR_LICENCE";
    return "OTHER";
}

/** What the desk typed that a reading of this kind can be checked against. */
export function expectedFor(kind: DocumentKind | null, typed: { pan?: string | null; gstin?: string | null }): Record<string, string | null | undefined> | undefined {
    if (kind === "PAN" && typed.pan) return { number: typed.pan };
    if (kind === "GST_CERTIFICATE" && typed.gstin) return { gstin: typed.gstin };
    return undefined;
}

/** Letters and digits only, upper-cased — "ABCDE 1234F" and "abcde1234f" are the same PAN. */
export const normaliseForCompare = (value: string): string => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

export interface ReadingMismatch {
    field: string;
    expected: string;
    read: string;
}

/** Where what was read disagrees with what was typed. A field the model could not read is not a mismatch — it is nothing. */
export function readingMismatches(reading: Pick<DocumentReading, "fields">, expected: Record<string, string | null | undefined> | undefined): ReadingMismatch[] {
    if (!expected) return [];
    const out: ReadingMismatch[] = [];
    for (const [field, typed] of Object.entries(expected)) {
        const read = reading.fields[field]?.value;
        if (!typed || !read) continue;
        if (normaliseForCompare(typed) !== normaliseForCompare(read)) out.push({ field, expected: typed, read });
    }
    return out;
}

/** A field's confidence as a tone: sure, shaky, doubtful. */
export function confidenceTone(confidence: number): "success" | "warning" | "danger" {
    return confidence >= 0.8 ? "success" : confidence >= 0.5 ? "warning" : "danger";
}

export const documentReadingService = {
    /** The reading kept on the file, or null when nobody has asked. */
    get: (fileId: string) => http.get<DocumentReading | null>(`/files/${fileId}/reading`),
    /** The desk asks the model. Read once and kept; asking again replaces it. */
    read: (fileId: string, kind: DocumentKind) => http.post<DocumentReading>(`/files/${fileId}/read`, { kind }),
    /** The same pair for a file known by its public URL — a listing's agreement, permit or NOC. */
    getByUrl: (url: string) => http.get<DocumentReading | null>(`/files/reading?url=${encodeURIComponent(url)}`),
    readByUrl: (url: string, kind: DocumentKind) => http.post<DocumentReading>("/files/read", { url, kind }),
};

export interface ReadPendingOutcome {
    attempted: number;
    read: number;
    skipped: number;
    failed: number;
    firstError: string | null;
}

/**
 * DR-1 on the KYC queue: every readable document on an open manual case,
 * read once — a file that already has a reading is left alone. One at a
 * time; the vendor is rate-limited and a queue is not a hurry.
 */
export async function readPendingDocuments(
    cases: { method: string; state: string; documents: { field: string; type?: string; label?: string; url: string | null }[] }[],
    opts: { openStates?: string[] } = {},
): Promise<ReadPendingOutcome> {
    const openStates = opts.openStates ?? ["PENDING", "NEEDS_INFO"];
    const outcome: ReadPendingOutcome = { attempted: 0, read: 0, skipped: 0, failed: 0, firstError: null };
    for (const kycCase of cases) {
        if (kycCase.method !== "MANUAL" || !openStates.includes(kycCase.state)) continue;
        for (const document of kycCase.documents) {
            const fileId = fileIdOf(document.url);
            const kind = kindForDocument(document.field, { label: document.type ?? document.label });
            if (!fileId || !kind) continue;
            outcome.attempted += 1;
            try {
                if (await documentReadingService.get(fileId)) {
                    outcome.skipped += 1;
                    continue;
                }
                await documentReadingService.read(fileId, kind);
                outcome.read += 1;
            } catch (cause) {
                outcome.failed += 1;
                outcome.firstError ??= cause instanceof Error ? cause.message : String(cause);
            }
        }
    }
    return outcome;
}
