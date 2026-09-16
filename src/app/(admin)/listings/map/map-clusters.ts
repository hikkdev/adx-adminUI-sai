import { meanOf } from "@/lib/map-geometry";
import type { AdminListing } from "@/services/listings";

/**
 * The map's folding, kept apart from the component so it can be pinned: which
 * rows can be placed and how they cluster by city. G13-C: the zoom-dependent
 * marker clustering and the camera maths are `lib/map-geometry.ts`, shared
 * with the map seam.
 */

/** A listing with a fix — the only kind the map can draw. */
export type Pin = AdminListing & { latitude: number; longitude: number };

export const isPlaced = (listing: AdminListing): listing is Pin =>
    listing.latitude !== null && listing.longitude !== null;

/** The rows the map can draw, and how many it could not. */
export function placeable(rows: AdminListing[]): { pins: Pin[]; skipped: number } {
    const pins = rows.filter(isPlaced);
    return { pins, skipped: rows.length - pins.length };
}

export interface Cluster {
    /** The city, or "No city" for spots placed without one. */
    name: string;
    pins: Pin[];
    /** The mean of the pins, which is where the camera is centred. */
    latitude: number;
    longitude: number;
}

export const NO_CITY = "No city";

/** Pins folded by city, largest first, each centred on its own mean. */
export function clustersOf(pins: Pin[]): Cluster[] {
    const byCity = new Map<string, Pin[]>();
    for (const pin of pins) {
        const name = pin.city?.trim() || NO_CITY;
        const bucket = byCity.get(name) ?? [];
        bucket.push(pin);
        byCity.set(name, bucket);
    }
    return [...byCity.entries()]
        .map(([name, members]) => ({ name, pins: members, ...meanOf(members) }))
        .sort((a, b) => b.pins.length - a.pins.length || a.name.localeCompare(b.name));
}
