import * as XLSX from "xlsx";
import type { MarketDataRow } from "@/types/pricing-engine";

/**
 * Reading a research sweep off disk.
 *
 * The team works in spreadsheets, so both `.xlsx` and `.csv` land here and both
 * go through the same reader — `xlsx` handles either, which saves maintaining a
 * hand-rolled CSV parser whose quoting rules would be wrong in some edge case
 * nobody finds until a locality name contains a comma.
 */

/** The fields an import row can carry. Order is the order they are offered. */
export const TARGET_FIELDS = [
    { key: "contributorName", label: "Competitor / contributor", required: true },
    { key: "mediaTypeSlug", label: "Media type", required: true },
    { key: "sizeClassSlug", label: "Size class", required: true },
    { key: "ratePerDay", label: "Rate per day", required: true },
    { key: "observedAt", label: "Observed on", required: true },
    { key: "latitude", label: "Latitude", required: true },
    { key: "longitude", label: "Longitude", required: true },
    { key: "venueTypeSlug", label: "Venue", required: false },
    { key: "materialSlug", label: "Material", required: false },
    { key: "city", label: "City", required: false },
    { key: "locality", label: "Locality", required: false },
    { key: "publisherId", label: "Publisher id (if they are on ADX)", required: false },
] as const;

export type TargetField = (typeof TARGET_FIELDS)[number]["key"];

/** Column header → field, for the headings sheets actually use. */
const SYNONYMS: Record<TargetField, string[]> = {
    contributorName: ["contributor", "competitor", "vendor", "company", "operator", "owner"],
    mediaTypeSlug: ["mediatype", "media", "type", "format", "medium"],
    sizeClassSlug: ["sizeclass", "size", "dimensions", "dimension"],
    ratePerDay: ["rate", "rateperday", "price", "dailyrate", "perday", "amount"],
    observedAt: ["observed", "observedon", "date", "surveydate", "asof"],
    latitude: ["lat"],
    longitude: ["lng", "lon", "long"],
    // Deliberately not "location": in a research sheet that column is an
    // address or an area name nine times out of ten, and auto-mapping it here
    // slugified every one into an unknown venue — rejecting the whole file and
    // filing a vocabulary proposal per row, with a mapping that looked right.
    venueTypeSlug: ["venue", "venuetype", "venuecategory", "premises"],
    materialSlug: ["material", "substrate"],
    city: ["town"],
    locality: ["area", "neighbourhood", "neighborhood", "micromarket"],
    publisherId: ["publisher", "publisherid", "adxpublisher"],
};

const normalise = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, "");

export type ParsedSheet = {
    /** Headers exactly as they appear in the file. */
    headers: string[];
    /** Every data row, as raw cell values keyed by header. */
    rows: Record<string, unknown>[];
    /** Best guess at header → field, for the mapping UI to start from. */
    guessedMapping: Partial<Record<TargetField, string>>;
};

/**
 * Guesses which column is which.
 *
 * A guess rather than a rule: the mapping UI shows what it decided and lets it
 * be changed. Silently mapping a column called "price" onto the rate and being
 * wrong would import a whole sweep at the wrong numbers, and nothing downstream
 * would look odd until a publisher argued with an indicator.
 */
function guessMapping(headers: string[]): Partial<Record<TargetField, string>> {
    const mapping: Partial<Record<TargetField, string>> = {};
    const taken = new Set<string>();

    for (const field of TARGET_FIELDS) {
        const candidates = [field.key, ...SYNONYMS[field.key]].map(normalise);
        const match = headers.find(
            (header) => !taken.has(header) && candidates.includes(normalise(header))
        );
        if (match) {
            mapping[field.key] = match;
            taken.add(match);
        }
    }
    return mapping;
}

export async function readSheet(file: File): Promise<ParsedSheet> {
    const buffer = await file.arrayBuffer();
    // `cellDates` so a date column arrives as a Date rather than an Excel serial
    // number, which would otherwise import as "45900" and be rejected as an
    // unreadable observation date.
    const book = XLSX.read(buffer, { cellDates: true });
    const sheetName = book.SheetNames[0];
    if (!sheetName) throw new Error("That file has no sheets in it.");

    const sheet = book.Sheets[sheetName];
    if (!sheet) throw new Error("That file has no sheets in it.");

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
    if (rows.length === 0) throw new Error("That sheet has a header row but no data.");

    const headers = Object.keys(rows[0] ?? {});
    return { headers, rows, guessedMapping: guessMapping(headers) };
}

export type RowProblem = { row: number; reason: string };

/**
 * A row that will be sent, tagged with the line it came from.
 *
 * The tag is attached here rather than derived later, because unreadable rows
 * are dropped on the way through: by the time a caller has the array, position
 * no longer equals line. Deriving it from the index labelled every row after
 * the first bad one with somebody else's number, and the exclusion feature was
 * keyed on exactly that wrong number.
 */
export type ImportRow = MarketDataRow & { fileRow: number };

/**
 * The calendar day a spreadsheet cell meant, as YYYY-MM-DD.
 *
 * Two things conspire to lose a day here, and `toISOString()` falls to both.
 * SheetJS returns a date a millisecond short of local midnight, so 15 August
 * arrives as the 14th at 23:59:59.999 — already the previous day *locally*, not
 * only in UTC. And a locale-formatted CSV date parses at local midnight, which
 * in any timezone east of Greenwich is the previous day in UTC.
 *
 * Nudging a second forward absorbs the first, and reading local components
 * rather than the UTC ones absorbs the second. A cell that already sits at
 * midnight is unaffected.
 *
 * This matters more than a day usually would: `observedAt` drives the staleness
 * window, and a whole sweep landing a day early skews every freshness judgement
 * built on it.
 */
function calendarDay(value: Date): string {
    const nudged = new Date(value.getTime() + 1000);
    const year = nudged.getFullYear();
    const month = String(nudged.getMonth() + 1).padStart(2, "0");
    const day = String(nudged.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/**
 * Turns mapped cells into rows the API will accept.
 *
 * Every failure carries the row number from the file — the one the operator can
 * see in their spreadsheet — because "unreadable date" without a location is not
 * something anyone can act on in a three-thousand-row sweep.
 */
export function toImportRows(
    parsed: ParsedSheet,
    mapping: Partial<Record<TargetField, string>>
): { rows: ImportRow[]; problems: RowProblem[] } {
    const rows: ImportRow[] = [];
    const problems: RowProblem[] = [];

    const cell = (source: Record<string, unknown>, field: TargetField): unknown => {
        const header = mapping[field];
        return header ? source[header] : null;
    };
    const text = (value: unknown): string =>
        value === null || value === undefined ? "" : String(value).trim();

    parsed.rows.forEach((source, index) => {
        // +2: one for the header row, one because spreadsheets count from 1.
        const at = index + 2;

        // Each coordinate is checked on its own. `Number("")` is 0, so testing
        // them together let a row with a blank latitude through at (0, lng) —
        // a point in the Gulf of Guinea, two thousand kilometres from every
        // pool it belonged to, and indistinguishable from a real observation
        // once imported.
        const latitudeRaw = text(cell(source, "latitude"));
        const longitudeRaw = text(cell(source, "longitude"));
        const latitude = Number(latitudeRaw);
        const longitude = Number(longitudeRaw);
        if (
            latitudeRaw === "" ||
            longitudeRaw === "" ||
            Number.isNaN(latitude) ||
            Number.isNaN(longitude)
        ) {
            problems.push({ row: at, reason: "Coordinates are missing or not numbers" });
            return;
        }
        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            problems.push({
                row: at,
                reason: `(${latitudeRaw}, ${longitudeRaw}) is not a point on Earth`,
            });
            return;
        }

        const rateRaw = text(cell(source, "ratePerDay")).replace(/[₹,\s]/g, "");
        if (!/^\d+(\.\d{1,2})?$/.test(rateRaw) || Number(rateRaw) <= 0) {
            problems.push({ row: at, reason: `Rate "${text(cell(source, "ratePerDay"))}" is not a positive amount` });
            return;
        }

        const observedRaw = cell(source, "observedAt");
        const observed =
            observedRaw instanceof Date ? observedRaw : new Date(text(observedRaw));
        if (Number.isNaN(observed.getTime())) {
            problems.push({ row: at, reason: `Cannot read the date "${text(observedRaw)}"` });
            return;
        }
        const observedDay = calendarDay(observed);

        const contributorName = text(cell(source, "contributorName"));
        if (!contributorName) {
            problems.push({ row: at, reason: "No contributor named" });
            return;
        }

        // Slugified here rather than at the API, so what the sheet says and what
        // the controlled list holds are compared on the same terms.
        const slug = (value: unknown): string =>
            text(value)
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "");

        rows.push({
            fileRow: at,
            contributorName,
            publisherId: text(cell(source, "publisherId")) || null,
            mediaTypeSlug: slug(cell(source, "mediaTypeSlug")),
            sizeClassSlug: slug(cell(source, "sizeClassSlug")),
            // Blank means the spot has no venue, which is right for a roadside
            // hoarding. A sweep of indoor spots that leaves the column out files
            // every row where no indoor listing will look for it.
            venueTypeSlug: slug(cell(source, "venueTypeSlug")) || null,
            materialSlug: slug(cell(source, "materialSlug")) || null,
            latitude,
            longitude,
            city: text(cell(source, "city")) || null,
            locality: text(cell(source, "locality")) || null,
            ratePerDay: Number(rateRaw).toFixed(2),
            observedAt: observedDay,
        });
    });

    return { rows, problems };
}

/** Fields that must be mapped before an import can run. */
export function missingRequired(mapping: Partial<Record<TargetField, string>>): string[] {
    return TARGET_FIELDS.filter((field) => field.required && !mapping[field.key]).map(
        (field) => field.label
    );
}
