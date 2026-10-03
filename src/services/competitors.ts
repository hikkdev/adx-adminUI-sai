import { api as http } from "@/lib/api-client";

/**
 * VA-2 (23 Sep 2026): competitors' hoardings, photographed by our agents.
 *
 * `/competitor-sightings` — an agent files one from the app with the GPS
 * camera (the stamp on, so the picture itself says where and when); the
 * desk lists them here, asks the vision model what it sees, and exports the
 * lot as a corpus for analysis and, later, training.
 */

export type SightingFormat = "HOARDING" | "WALL" | "BUS_SHELTER" | "VEHICLE" | "DIGITAL_SCREEN" | "SHOP_FRONT" | "BANNER" | "OTHER";

export const SIGHTING_FORMAT_LABEL: Record<SightingFormat, string> = {
    HOARDING: "Hoarding",
    WALL: "Wall",
    BUS_SHELTER: "Bus shelter",
    VEHICLE: "Vehicle",
    DIGITAL_SCREEN: "Digital screen",
    SHOP_FRONT: "Shop front",
    BANNER: "Banner",
    OTHER: "Other",
};

export const SIGHTING_FORMATS: readonly SightingFormat[] = ["HOARDING", "WALL", "BUS_SHELTER", "VEHICLE", "DIGITAL_SCREEN", "SHOP_FRONT", "BANNER", "OTHER"];

export const formatLabel = (format: string | null): string => (format ? (SIGHTING_FORMAT_LABEL[format as SightingFormat] ?? format) : "—");

/** What the vision model said about the photo, when the desk asked. */
export interface SightingAnalysis {
    brand: string | null;
    category: string | null;
    format: SightingFormat | null;
    estimatedSize: string | null;
    illuminated: boolean | null;
    condition: "NEW" | "GOOD" | "WORN" | "DAMAGED" | "UNKNOWN";
    text: string | null;
    summary: string;
    confidence: number;
    provider: string;
    model: string;
    perceptualHash: string;
}

export interface Sighting {
    id: string;
    agent: { id: string; displayId: string | null; name: string | null };
    photoFileId: string;
    /** A private `/files/:id` URL — draw it through `PrivateFile`. */
    photoUrl: string;
    brand: string | null;
    category: string | null;
    format: string | null;
    note: string | null;
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    city: string | null;
    capturedAt: string;
    analysis: SightingAnalysis | null;
    analysedAt: string | null;
    createdAt: string;
}

export interface SightingsPage {
    items: Sighting[];
    total: number;
    page: number;
    pageSize: number;
    /** ALL, ANALYSED, UNANALYSED — counted without the analysed facet, so the chips keep their numbers while one is on. */
    counts: Record<string, number>;
}

export interface SightingsQuery {
    q?: string;
    brand?: string;
    format?: SightingFormat;
    agentId?: string;
    city?: string;
    from?: string;
    to?: string;
    analysed?: boolean;
    page?: number;
    pageSize?: number;
}

/** The query string, exported for the test that pins it. */
export function sightingsSearch(query: SightingsQuery): string {
    const params = new URLSearchParams();
    if (query.q?.trim()) params.set("q", query.q.trim());
    if (query.brand?.trim()) params.set("brand", query.brand.trim());
    if (query.format) params.set("format", query.format);
    if (query.agentId) params.set("agentId", query.agentId);
    if (query.city?.trim()) params.set("city", query.city.trim());
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    if (query.analysed !== undefined) params.set("analysed", String(query.analysed));
    params.set("page", String(query.page ?? 1));
    params.set("pageSize", String(query.pageSize ?? 50));
    return `?${params.toString()}`;
}

/** "Zomato · Hoarding · 40 x 20 ft" — the analysis in one line, or what the agent read when there is none. */
export function sightingLine(row: Sighting): string {
    const brand = row.analysis?.brand ?? row.brand;
    const format = row.analysis?.format ?? row.format;
    return [brand ?? "Unknown brand", format ? formatLabel(format) : null, row.analysis?.estimatedSize ?? null].filter(Boolean).join(" · ");
}

export const competitorsService = {
    list: (query: SightingsQuery = {}) => http.get<SightingsPage>(`/competitor-sightings${sightingsSearch(query)}`),
    brands: () => http.get<{ brand: string; count: number }[]>("/competitor-sightings/brands"),
    get: (id: string) => http.get<Sighting>(`/competitor-sightings/${id}`),
    /** The desk asks the vision model; the answer is kept on the row and comes back with it. */
    analyse: (id: string) => http.post<Sighting>(`/competitor-sightings/${id}/analyse`, {}),
    /** The corpus. An authenticated GET that answers a file — opened through the download door, not a bare link. */
    exportPath: (format: "csv" | "jsonl", filter: Pick<SightingsQuery, "brand" | "city" | "from" | "to"> = {}) => {
        const params = new URLSearchParams({ format });
        if (filter.brand?.trim()) params.set("brand", filter.brand.trim());
        if (filter.city?.trim()) params.set("city", filter.city.trim());
        if (filter.from) params.set("from", filter.from);
        if (filter.to) params.set("to", filter.to);
        return `/competitor-sightings/export?${params.toString()}`;
    },
};
