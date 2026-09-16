/**
 * Lot X-B: a list's city facet as the shared combobox hands it back — the
 * text in the field, and the catalogue slug when the text came from a pick.
 * The request sends the slug where there is one (the key is the identity:
 * every row keyed to the city, whatever it was typed as) and the text as
 * typed otherwise (the null-keyed rows, matched on the spelling). The
 * party list routes take either.
 */
export interface CityFacet {
    text: string;
    slug: string | null;
}

export const EMPTY_CITY_FACET: CityFacet = { text: "", slug: null };

/** What `?city=` carries — the slug of a pick, the trimmed text otherwise, "" for nothing. */
export function cityFacetValue(facet: CityFacet): string {
    const text = facet.text.trim();
    if (!text) return "";
    return facet.slug ?? text;
}
