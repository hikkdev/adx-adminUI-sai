import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    LISTING_FIELDS,
    NOT_STATED,
    codeText,
    demographicsRows,
    documentWaiverRows,
    extraAnswerRows,
    fieldText,
    listingField,
    plainLabel,
    shapeListingRecord,
    vehicleRcText,
} from "./listing-record";

/**
 * The listing page's register of columns (3 Oct 2026) — the owner: "I need
 * to see everything what we store on a listing."
 *
 * Pinned:
 *  - every scalar column of the Prisma `Listing` model has a label and a
 *    section here, so a column added later without one fails this test
 *    rather than vanishing from the page;
 *  - no label is a column's own camelCase name;
 *  - an empty value reads "Not stated"; refs read as the thing they point
 *    at; the site QR reads as whether there is one; stored text is printed
 *    exactly as stored, a replacement character included;
 *  - the record keeps every column it was sent and defaults every relation.
 */

const SCHEMA = join(__dirname, "..", "..", "..", "ADX-backendv1", "prisma", "schema.prisma");

/** The scalar columns of `model Listing` — fields whose type is a scalar or an enum, never a relation. */
function listingColumns(schema: string): string[] {
    const body = /model Listing \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? "";
    const models = new Set([...schema.matchAll(/^model (\w+) \{/gm)].map((match) => match[1]));
    const columns: string[] = [];
    for (const line of body.split("\n")) {
        const match = /^\s+(\w+)\s+([\w]+)(\[\])?\??/.exec(line);
        if (!match || line.trim().startsWith("//") || line.trim().startsWith("@@")) continue;
        const [, name, type] = match;
        if (models.has(type)) continue;
        columns.push(name);
    }
    return columns;
}

const record = (columns: Record<string, unknown> = {}, extras: Record<string, unknown> = {}) =>
    shapeListingRecord({ id: "lst_1", title: "MG Road hoarding", ...columns, ...extras } as never);

describe("the register of listing columns", () => {
    it.skipIf(!existsSync(SCHEMA))("labels every scalar column the Prisma model stores", () => {
        const columns = listingColumns(readFileSync(SCHEMA, "utf8"));
        expect(columns.length).toBeGreaterThan(80);
        const missing = columns.filter((column) => !listingField(column));
        expect(missing).toEqual([]);
    });

    it("never labels a column with its own camelCase name", () => {
        for (const field of LISTING_FIELDS) {
            expect(field.label).not.toBe(field.key);
            expect(field.label).not.toMatch(/[a-z][A-Z]/);
        }
    });

    it("names an unlabelled column in plain words", () => {
        expect(plainLabel("someNewColumn")).toBe("Some new column");
        expect(plainLabel("rate_card_url")).toBe("Rate card url");
    });
});

describe("a column as words", () => {
    const field = (key: string) => listingField(key)!;

    it("says Not stated for an empty value", () => {
        expect(fieldText(field("estimatedDailyFootfall"), record({ estimatedDailyFootfall: null }))).toBe(NOT_STATED);
        expect(fieldText(field("footfallNote"), record({ footfallNote: "" }))).toBe(NOT_STATED);
        expect(fieldText(field("audienceDemographics"), record({ audienceDemographics: {} }))).toBe(NOT_STATED);
    });

    it("formats numbers, money, days and yes/no", () => {
        expect(fieldText(field("estimatedDailyFootfall"), record({ estimatedDailyFootfall: 12500 }))).toBe("12,500");
        expect(fieldText(field("ratePerDay"), record({ ratePerDay: "1200.00" }))).toBe("₹1,200.00");
        expect(fieldText(field("minBookingDays"), record({ minBookingDays: 7 }))).toBe("7 days");
        expect(fieldText(field("minBookingDays"), record({ minBookingDays: 1 }))).toBe("1 day");
        expect(fieldText(field("installationByAdx"), record({ installationByAdx: false }))).toBe("No");
        expect(fieldText(field("widthFt"), record({ widthFt: "40.00" }))).toBe("40.00 ft");
        expect(fieldText(field("rightsBasis"), record({ rightsBasis: "LEASED" }))).toBe("Leased");
        expect(fieldText(field("pricingUnit"), record({ pricingUnit: "PER_MONTH" }))).toBe("per month");
    });

    it("reads a ref as the thing it points at", () => {
        const withRefs = record({ venueTypeId: "vt_1", cityId: "c_1", agentId: null }, { venueType: { id: "vt_1", name: "Gym", slug: "gym", category: "INDOOR" }, cityRef: { id: "c_1", name: "Pune", slug: "pune", state: "Maharashtra" } });
        expect(fieldText(field("venueTypeId"), withRefs)).toBe("Gym");
        expect(fieldText(field("cityId"), withRefs)).toBe("Pune, Maharashtra");
        expect(fieldText(field("agentId"), withRefs)).toBe("Self-serve");
        expect(fieldText(field("mediaTypeId"), record({ mediaTypeId: "mt_1" }), { mediaTypeName: "Vinyl" })).toBe("Vinyl");
    });

    it("reads the site QR as whether there is one, never the token", () => {
        expect(fieldText(field("qrToken"), record({}, { hasSiteQr: true }))).toBe("Issued");
        expect(fieldText(field("qrToken"), record({}, { hasSiteQr: false }))).toBe("None");
    });

    it("prints stored text exactly as stored — a replacement character included", () => {
        expect(fieldText(field("title"), record({ title: "Web test � delete me" }))).toBe("Web test � delete me");
        expect(fieldText(field("placement"), record({ placement: "Lobby �" }))).toBe("Lobby �");
    });

    it("reads the audience profile band by band", () => {
        expect(demographicsRows({ ageBand: "25-34", genderSplit: "60/40", occupation: null })).toEqual([
            ["Primary age band", "25-34"],
            ["Gender split", "60/40"],
        ]);
        expect(demographicsRows([{ label: "18-24", share: 30 }])).toEqual([["18-24", "30"]]);
    });

    it("sums the RC check up without its personal facts", () => {
        const text = vehicleRcText({ ownerName: "Ravi Kumar", status: "ACTIVE", nameMatch: 92, insuranceUpto: "2027-01-01" });
        expect(text).toBe("RC active · owner name match 92% · insured to 2027-01-01");
        expect(text).not.toContain("Ravi");
    });
});

describe("the listing questions of 3 Oct 2026", () => {
    const field = (key: string) => listingField(key)!;

    it("files every new column under its section", () => {
        const sectionOf = (key: string) => listingField(key)?.section;
        for (const key of ["estimatedDailyFootfall", "trafficGrade", "visibility", "elevation", "widthPx", "heightPx", "vehicleType"]) expect(["site", "audience", "slots", "vehicle"]).toContain(sectionOf(key));
        expect(sectionOf("coverage")).toBe("location");
        expect(sectionOf("locationAccuracyM")).toBe("location");
        for (const key of ["termsAcceptedAt", "termsVersion", "ownershipDeclaredAt", "documentWaivers"]) expect(sectionOf(key)).toBe("trust");
        expect(sectionOf("extraAnswers")).toBe("other");
        expect(sectionOf("operatingHoursFrom")).toBe("availability");
    });

    it("reads the coded answers in the forms' own words, and an older free-text answer exactly as stored", () => {
        expect(fieldText(field("trafficGrade"), record({ trafficGrade: "VERY_HIGH" }))).toBe("Very high");
        expect(fieldText(field("visibility"), record({ visibility: "50_150M" }))).toBe("50–150 m");
        expect(fieldText(field("elevation"), record({ elevation: "FIRST_FLOOR" }))).toBe("First floor");
        expect(fieldText(field("vehicleType"), record({ vehicleType: "CAB" }))).toBe("Cab");
        expect(fieldText(field("elevation"), record({ elevation: "Mid-rise" }))).toBe("Mid-rise");
        expect(fieldText(field("visibility"), record({ visibility: "200 m" }))).toBe("200 m");
        expect(codeText("trafficGrade", "SOMETHING_NEW")).toBe("Something new");
    });

    it("reads the pin's accuracy in metres", () => {
        expect(fieldText(field("locationAccuracyM"), record({ locationAccuracyM: 12.4 }))).toBe("within 12 m");
        expect(fieldText(field("locationAccuracyM"), record({ locationAccuracyM: null }))).toBe(NOT_STATED);
    });

    it("reads the other answers as question and answer, passing over anything that is not one", () => {
        const answers = [
            { key: "parking", label: "Is there parking nearby?", value: true },
            { key: "nearest_landmark", label: "", value: "Opposite the metro" },
            { key: "floors", label: "How many floors?", value: 3 },
            { key: "languages", label: "Signage languages", value: ["Kannada", "English"] },
            "junk",
            { value: "no key or label" },
        ];
        expect(extraAnswerRows(answers)).toEqual([
            ["Is there parking nearby?", "Yes"],
            ["Nearest landmark", "Opposite the metro"],
            ["How many floors?", "3"],
            ["Signage languages", "Kannada, English"],
        ]);
        expect(extraAnswerRows(null)).toEqual([]);
        expect(fieldText(field("extraAnswers"), record({ extraAnswers: [] }))).toBe(NOT_STATED);
        expect(fieldText(field("extraAnswers"), record({ extraAnswers: answers.slice(0, 1) }))).toBe("Is there parking nearby?: Yes");
    });

    it("reads the papers marked not applicable with the reason and the day", () => {
        const rows = documentWaiverRows([{ kind: "MUNICIPAL_PERMIT", reason: "Private land", at: "2026-10-03T06:00:00.000Z" }, { kind: "OWNER_NOC", at: "2026-10-03T06:00:00.000Z" }, { reason: "no kind" }]);
        expect(rows).toHaveLength(2);
        expect(rows[0]![1]).toMatch(/^Private land, 3 Oct/);
        expect(rows[1]![1]).toMatch(/^no reason given/);
        expect(fieldText(field("documentWaivers"), record({ documentWaivers: null }))).toBe(NOT_STATED);
    });
});

describe("the record", () => {
    it("keeps every column it was sent and defaults every relation", () => {
        const shaped = record({ footfallNote: "Busy at 6 pm", someFutureColumn: 3 }, { photos: [{ id: "p", url: "u", type: "FRONT", createdAt: "2026-09-01" }] });
        expect(shaped.columns).toMatchObject({ footfallNote: "Busy at 6 pm", someFutureColumn: 3 });
        expect(shaped.columns).not.toHaveProperty("photos");
        expect(shaped.documents).toEqual([]);
        expect(shaped.counts.orders).toBe(0);
        expect(shaped.coverPhotoUrl).toBe("u");
        expect(shaped.photos[0]).toMatchObject({ takenAt: null, gps: null });
    });
});
