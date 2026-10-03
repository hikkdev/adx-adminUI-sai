import { describe, expect, it } from "vitest";
import type { LayoutBlock } from "@/services/layouts";
import { slotHref } from "../../content/layouts/[surface]/field-inputs";
import { liveBlocks, placementsBySlot } from "./placed-on";

/** AS-1: "Placed on" — the screens whose live layout carries an ad slot. */

const ad = (slotKey: unknown, extra: Partial<LayoutBlock> = {}): LayoutBlock => ({ id: `b-${String(slotKey)}`, type: "ad_slot", props: { slotKey }, ...extra });
const version = (blocks: LayoutBlock[]) => ({
    id: "v",
    number: 2,
    status: "PUBLISHED" as const,
    blocks,
    changeNote: null,
    createdAt: "2026-09-27T00:00:00Z",
    publishedAt: "2026-09-27T00:00:00Z",
});

describe("what a screen draws today", () => {
    it("is the published layout when there is one", () => {
        expect(liveBlocks({ live: version([ad("A")]), defaults: [ad("DEFAULT")] })).toEqual([ad("A")]);
    });

    it("is the default order while nothing is published", () => {
        expect(liveBlocks({ live: null, defaults: [ad("WEB_LISTING_SIDEBAR")] })).toEqual([ad("WEB_LISTING_SIDEBAR")]);
    });
});

describe("where each slot is placed", () => {
    const screens = [
        { surface: "WEB_LISTING" as const, label: "Website — Listing page", blocks: [{ id: "p", type: "publisher_listings", props: {} }, ad("WEB_LISTING_SIDEBAR")] },
        { surface: "WEB_HOME" as const, label: "Website — Home page", blocks: [ad("WEB_HOME_BANNER"), ad("WEB_LISTING_SIDEBAR"), ad("WEB_LISTING_SIDEBAR", { id: "dup" })] },
        { surface: "APP_ADVERTISER_HOME" as const, label: "User app — Advertiser home", blocks: [ad("APP_BANNER", { hidden: true }), ad(""), ad(42)] },
    ];
    const placed = placementsBySlot(screens);

    it("lists every screen whose live blocks name the slot, once each, in order", () => {
        expect(placed.get("WEB_LISTING_SIDEBAR")).toEqual([
            { surface: "WEB_LISTING", label: "Website — Listing page" },
            { surface: "WEB_HOME", label: "Website — Home page" },
        ]);
        expect(placed.get("WEB_HOME_BANNER")).toEqual([{ surface: "WEB_HOME", label: "Website — Home page" }]);
    });

    it("places nothing with a hidden block, an empty key or a key that is not text", () => {
        expect(placed.has("APP_BANNER")).toBe(false);
        expect([...placed.keys()].sort()).toEqual(["WEB_HOME_BANNER", "WEB_LISTING_SIDEBAR"]);
    });

    it("answers nothing for a slot no screen names", () => {
        expect(placed.get("NOWHERE")).toBeUndefined();
    });
});

describe("the layout builder's Open slot link", () => {
    it("lands on the slot's row on Slots & pricing", () => {
        expect(slotHref("WEB_LISTING_SIDEBAR")).toBe("/ads/slots#WEB_LISTING_SIDEBAR");
    });
});
