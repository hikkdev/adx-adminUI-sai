import type { LayoutBlock, LayoutDetail, LayoutSurface } from "@/services/layouts";

/** One layout screen as the Slots tab reads it: what it draws today. */
export interface ScreenBlocks {
    surface: LayoutSurface;
    label: string;
    blocks: readonly LayoutBlock[];
}

/** A screen an ad slot is placed on. */
export interface Placement {
    surface: LayoutSurface;
    label: string;
}

/**
 * What a screen draws today: its published layout, or the default order
 * while nothing is published. A draft is not placed anywhere yet.
 */
export function liveBlocks(detail: Pick<LayoutDetail, "live" | "defaults">): LayoutBlock[] {
    return detail.live ? detail.live.blocks : detail.defaults;
}

/**
 * Where each slot key is placed: every screen whose live blocks hold an
 * `ad_slot` block naming it. A hidden block draws nothing, so it places
 * nothing; a screen that names a slot twice is listed once. Screens keep
 * the order they came in.
 */
export function placementsBySlot(screens: readonly ScreenBlocks[]): Map<string, Placement[]> {
    const out = new Map<string, Placement[]>();
    for (const screen of screens) {
        const keys = new Set<string>();
        for (const block of screen.blocks) {
            if (block.type !== "ad_slot" || block.hidden) continue;
            const key = block.props?.slotKey;
            if (typeof key === "string" && key.trim()) keys.add(key.trim());
        }
        for (const key of keys) out.set(key, [...(out.get(key) ?? []), { surface: screen.surface, label: screen.label }]);
    }
    return out;
}
