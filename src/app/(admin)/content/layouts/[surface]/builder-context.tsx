"use client";

import * as React from "react";
import type { GeoCity } from "@/services/geo";
import type { BlockTypeDef } from "@/services/layouts";
import type { MediaAsset, MediaSpec } from "@/services/media";
import type { AdSlot } from "@/services/promotions";

/**
 * What every field of the builder may need to draw itself: the size specs,
 * the pictures by id (so a picked id shows its thumbnail), the slots, the
 * published content pages, and names for the city and listing ids a block
 * carries. A pick teaches the builder the name, so it never shows a bare id
 * for something it was just shown.
 */
export interface BuilderLookups {
    types: Map<string, BlockTypeDef>;
    specs: MediaSpec[];
    media: Map<string, MediaAsset>;
    rememberMedia: (asset: MediaAsset) => void;
    slots: AdSlot[];
    /** Published articles, for the content-slug select and the CONTENT target. */
    pages: { slug: string; title: string }[];
    /** PB-1: the site's pages, for the PAGE target — key, title and the address it answers at. */
    sitePages: { key: string; title: string; path: string }[];
    /** PB-1: the forms, for the `form` block's key. */
    forms: { key: string; title: string; live: boolean }[];
    cityNames: Map<string, string>;
    rememberCity: (city: Pick<GeoCity, "id" | "name">) => void;
    listingNames: Map<string, string>;
    rememberListing: (id: string, label: string) => void;
}

const BuilderContext = React.createContext<BuilderLookups | null>(null);

export function BuilderProvider({ value, children }: { value: BuilderLookups; children: React.ReactNode }) {
    return <BuilderContext.Provider value={value}>{children}</BuilderContext.Provider>;
}

export function useBuilder(): BuilderLookups {
    const value = React.useContext(BuilderContext);
    if (!value) throw new Error("useBuilder outside the layout builder");
    return value;
}

/** A Map that re-renders its owner when something is remembered. */
export function useRememberingMap<V>(initial: () => [string, V][]): [Map<string, V>, (key: string, value: V) => void] {
    const [map, setMap] = React.useState(() => new Map(initial()));
    const remember = React.useCallback((key: string, value: V) => {
        setMap((current) => {
            if (current.get(key) === value) return current;
            const next = new Map(current);
            next.set(key, value);
            return next;
        });
    }, []);
    return [map, remember];
}
