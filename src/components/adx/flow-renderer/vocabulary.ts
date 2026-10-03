import type { ContentCategory } from "@/services/campaigns";
import type { Material, MediaType, SizeClass, VenueType } from "@/types/pricing-engine";

/**
 * FL-3 (27 Sep 2026): the vocabularies the taxonomy kinds read — venues,
 * spot types, sizes, materials, content categories — and how each is
 * narrowed by the answers before it, the same rules the apps'
 * `use-listing-flow.ts` applies on a phone.
 */

export type { ContentCategory };

export interface FlowVocabularies {
    venues: VenueType[];
    mediaTypes: MediaType[];
    sizeClasses: SizeClass[];
    materials: Material[];
    contentCategories: ContentCategory[];
}

export const EMPTY_VOCABULARIES: FlowVocabularies = { venues: [], mediaTypes: [], sizeClasses: [], materials: [], contentCategories: [] };

/** The venues of the chosen category — every active venue while no category is chosen. */
export function offeredVenues(venues: VenueType[], category: string | null): VenueType[] {
    const upper = category?.toUpperCase() ?? null;
    return venues.filter((venue) => venue.isActive && (upper === null || venue.category === upper));
}

/**
 * The spot types offered inside the chosen venue. A format belongs to one
 * venue — null for outdoor, which has none — so the list is the venue's
 * own; offering a mall's atrium LED wall inside a hospital would create a
 * listing in a pool it can never be compared against.
 */
export function offeredMediaTypes(mediaTypes: MediaType[], venueTypeId: string | null, category: string | null): MediaType[] {
    const upper = category?.toUpperCase() ?? null;
    return mediaTypes.filter((type) => (type.venueTypeId ?? null) === (venueTypeId ?? null) && (upper === null || type.category === upper));
}

/** An empty list on the type means unconstrained rather than none. */
export function offeredMaterials(materials: Material[], mediaType: MediaType | null | undefined): Material[] {
    if (!mediaType || mediaType.materialIds.length === 0) return materials;
    return materials.filter((material) => mediaType.materialIds.includes(material.id));
}

export function offeredSizes(sizeClasses: SizeClass[], mediaType: MediaType | null | undefined): SizeClass[] {
    if (!mediaType || mediaType.sizeClassIds.length === 0) return sizeClasses;
    return sizeClasses.filter((size) => mediaType.sizeClassIds.includes(size.id));
}

/** Catalogue names are venue-qualified ("Shopping mall — Atrium LED wall"); inside a venue the prefix is noise. */
export function shortName(name: string): string {
    const parts = name.split(" — ");
    return parts[parts.length - 1] ?? name;
}

/** The size class a measurement already has a name for — a lookup by exact dimensions, never a guess. */
export function matchedSizeClass(sizeClasses: SizeClass[], widthFt: unknown, heightFt: unknown): SizeClass | null {
    const width = Number(widthFt);
    const height = Number(heightFt);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    return sizeClasses.find((size) => size.widthFt !== null && size.heightFt !== null && Number(size.widthFt) === width && Number(size.heightFt) === height) ?? null;
}

/** Spot types under their catalogue heading, in the order they arrived. */
export function groupedByFormat(mediaTypes: MediaType[]): [string, MediaType[]][] {
    const groups = new Map<string, MediaType[]>();
    for (const type of mediaTypes) {
        const key = type.formatGroup ?? "Other formats";
        const bucket = groups.get(key);
        if (bucket) bucket.push(type);
        else groups.set(key, [type]);
    }
    return [...groups.entries()];
}
