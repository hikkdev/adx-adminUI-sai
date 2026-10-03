import { api as http } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";

/**
 * LM-1 (27 Sep 2026): the media library — every image a layout block, a
 * tile or a paid placement draws, with its alt text and the size spec it was
 * checked against. The spec is checked twice: here in the browser before the
 * file leaves (dimensions, ratio, weight, format) so the operator hears at
 * once, and again by the server, which is the one that counts.
 *
 * Nothing is deleted: an image is archived, and one a published layout still
 * draws cannot be (409, naming where it is used).
 */

export interface MediaSpec {
    key: string;
    label: string;
    width: number;
    height: number;
    minWidth: number;
    minHeight: number;
    maxBytes: number;
    formats: string[];
}

export interface MediaAsset {
    id: string;
    /** The server's mirror of `archivedAt`. */
    archived?: boolean;
    fileId: string | null;
    url: string;
    mime: string;
    width: number | null;
    height: number | null;
    bytes: number | null;
    altText: string | null;
    title: string | null;
    tags: string[];
    spec: string | null;
    ownerAdvertiserId: string | null;
    createdByUserId: string | null;
    archivedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

/**
 * Whose pictures (28 Sep 2026): ADX's own (no advertiser — the library and
 * every picker ask for these), the advertisers' ad artwork (it lives with
 * their ads, on Ads & sponsored › Display ads), or both — the server's
 * default when nothing is asked.
 */
export type MediaOwner = "adx" | "advertisers" | "all";

export interface MediaQuery {
    q?: string;
    tag?: string;
    spec?: string;
    archived?: boolean;
    owner?: MediaOwner;
}

export interface MediaUploadInput {
    file: File;
    spec?: string;
    altText?: string;
    title?: string;
    tags?: string[];
}

export interface MediaPatch {
    altText?: string | null;
    title?: string | null;
    tags?: string[];
}

/** The place a 409 on archive says an image is still drawn. */
export interface MediaUsage {
    surface?: string;
    /** The published version's number. */
    number?: number;
    version?: number;
    blockId?: string;
    blockType?: string;
    label?: string;
}

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

/** The ratio tolerance the server applies: exact within 1%. */
export const RATIO_TOLERANCE = 0.01;

const KB = 1024;
export const formatBytes = (bytes: number): string => (bytes < KB * KB ? `${Math.max(1, Math.round(bytes / KB))} KB` : `${(bytes / (KB * KB)).toFixed(1)} MB`);

const FORMAT_LABEL: Record<string, string> = { "image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WebP" };
export const formatLabel = (mime: string): string => FORMAT_LABEL[mime] ?? mime.replace(/^image\//, "").toUpperCase();

/** "1600 × 480 · JPEG, PNG or WebP · up to 800 KB" — a spec as its hint line reads. */
export function specLine(spec: MediaSpec): string {
    const formats = spec.formats.map(formatLabel);
    const list = formats.length > 1 ? `${formats.slice(0, -1).join(", ")} or ${formats[formats.length - 1]}` : (formats[0] ?? "any image");
    return `${spec.width} × ${spec.height} (at least ${spec.minWidth} × ${spec.minHeight}) · ${list} · up to ${formatBytes(spec.maxBytes)}`;
}

/**
 * What is wrong with a file against a spec, one sentence each — the same
 * three rules the server applies: the ratio exact within 1%, at least the
 * minimum size, no heavier than the cap; plus the format. Dimensions may be
 * unknown (a file the browser could not decode) — then only the weight and
 * the format are checked here and the server decides the rest.
 */
export function specProblems(spec: MediaSpec, file: { width: number | null; height: number | null; bytes: number; mime: string }): string[] {
    const problems: string[] = [];
    if (spec.formats.length > 0 && !spec.formats.includes(file.mime)) {
        problems.push(`It is ${formatLabel(file.mime) || "an unknown format"}; this spec takes ${spec.formats.map(formatLabel).join(", ")}.`);
    }
    if (file.bytes > spec.maxBytes) problems.push(`It is ${formatBytes(file.bytes)}; this spec takes up to ${formatBytes(spec.maxBytes)}.`);
    if (file.width !== null && file.height !== null && file.width > 0 && file.height > 0) {
        const want = spec.width / spec.height;
        const have = file.width / file.height;
        if (Math.abs(have - want) / want > RATIO_TOLERANCE) {
            problems.push(`It is ${file.width} × ${file.height}; this spec needs the shape of ${spec.width} × ${spec.height}.`);
        } else if (file.width < spec.minWidth || file.height < spec.minHeight) {
            problems.push(`It is ${file.width} × ${file.height}; this spec needs at least ${spec.minWidth} × ${spec.minHeight}.`);
        }
    }
    return problems;
}

/** Tags as typed ("festive, diwali ,  home") → a clean, de-duplicated, lower-cased list. */
export function parseTags(text: string): string[] {
    const seen = new Set<string>();
    for (const raw of text.split(/[,\n]/)) {
        const tag = raw.trim().toLowerCase().replace(/\s+/g, "-");
        if (tag) seen.add(tag);
    }
    return [...seen].slice(0, 12);
}

/** The most tags a picture carries — `parseTags` keeps the first twelve. */
export const MAX_TAGS = 12;

/**
 * A picture's tags with more added, for a bulk tag — or why not: "already
 * tagged" when nothing new would land, "would pass 12 tags" when the list
 * would outgrow the cap (a tag silently dropped is worse than a row skipped).
 */
export function tagsAdded(current: readonly string[], adding: readonly string[]): { tags: string[] } | { skip: string } {
    const merged = [...new Set([...current, ...adding])];
    if (merged.length === current.length) return { skip: "already tagged" };
    if (merged.length > MAX_TAGS) return { skip: `would pass ${MAX_TAGS} tags` };
    return { tags: merged };
}

/** A picture's tags with some taken off, or "not tagged" when it carries none of them. */
export function tagsRemoved(current: readonly string[], removing: readonly string[]): { tags: string[] } | { skip: string } {
    const kept = current.filter((tag) => !removing.includes(tag));
    return kept.length === current.length ? { skip: "not tagged" } : { tags: kept };
}

/** The places a 409 names, read off its details in whatever shape it came. */
export function usagesOf(details: unknown): MediaUsage[] {
    const bag = details as { usedIn?: unknown; usages?: unknown; where?: unknown } | unknown[] | null | undefined;
    const list = Array.isArray(bag) ? bag : Array.isArray((bag as { usedIn?: unknown })?.usedIn) ? (bag as { usedIn: unknown[] }).usedIn : Array.isArray((bag as { usages?: unknown })?.usages) ? (bag as { usages: unknown[] }).usages : Array.isArray((bag as { where?: unknown })?.where) ? (bag as { where: unknown[] }).where : [];
    return list.filter((item): item is MediaUsage => !!item && typeof item === "object");
}

/** "Website · Home v4 (promo_banner)" */
export function usageLine(usage: MediaUsage): string {
    if (usage.label) return usage.label;
    const number = usage.number ?? usage.version;
    const where = [usage.surface, number !== undefined ? `v${number}` : null].filter(Boolean).join(" ");
    return usage.blockType ? `${where} (${usage.blockType})` : where || "a published layout";
}

/** `GET /media` answers a list or the list contract's page; the desk reads either. */
export function mediaRows(answer: MediaAsset[] | { items?: MediaAsset[] } | null | undefined): MediaAsset[] {
    if (Array.isArray(answer)) return answer;
    return answer?.items ?? [];
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

export const mediaReadApi = (): boolean => apiConfig.live;

function mediaQuery(query: MediaQuery): string {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.tag) params.set("tag", query.tag);
    if (query.spec) params.set("spec", query.spec);
    if (query.archived !== undefined) params.set("archived", String(query.archived));
    if (query.owner) params.set("owner", query.owner);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
}

export const mediaService = {
    specs: () => http.get<MediaSpec[]>("/media/specs"),
    list: async (query: MediaQuery = {}): Promise<MediaAsset[]> => mediaRows(await http.get<MediaAsset[] | { items?: MediaAsset[] }>(`/media${mediaQuery(query)}`)),
    /** `content.edit`. The server checks the spec again: ratio within 1%, the minimum size, the weight cap. */
    upload: (input: MediaUploadInput) => {
        const body = new FormData();
        body.append("file", input.file);
        if (input.spec) body.append("spec", input.spec);
        if (input.altText) body.append("altText", input.altText);
        if (input.title) body.append("title", input.title);
        if (input.tags?.length) body.append("tags", input.tags.join(","));
        return http.post<MediaAsset>("/media", body);
    },
    update: (id: string, patch: MediaPatch) => http.patch<MediaAsset>(`/media/${encodeURIComponent(id)}`, patch),
    /** 409 when a published layout still draws it; the error's details name where. */
    archive: (id: string) => http.post<MediaAsset>(`/media/${encodeURIComponent(id)}/archive`, {}),
    restore: (id: string) => http.post<MediaAsset>(`/media/${encodeURIComponent(id)}/restore`, {}),
};
