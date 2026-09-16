import { describe, expect, it } from "vitest";

import {
    LISTING_STATUS_TONE,
    listingStatusLabel,
    shapeListing,
    sizeLabel,
    type WireListing,
} from "./listings";

/**
 * DR 06 / DR 10 — the admin listings table, live.
 *
 * The console used to draw this from fixtures with a five-value status
 * vocabulary of its own (`pending_review`, `live`, `paused`, …) while the
 * backend keeps ten. Squeezing ten into five would have meant a listing
 * AWAITING_DOCUMENTS reading as "Draft" on the one screen ops use to chase it,
 * so the console adopts the API's shape and labels it — the same way the agent
 * roster was migrated.
 */

const wire = (over: Partial<WireListing> = {}): WireListing =>
    ({
        id: "lst_1",
        displayId: "LST-0001",
        title: "MG Road Digital Billboard",
        category: "OUTDOOR",
        subType: "Digital screen",
        status: "PENDING_REVIEW",
        address: "MG Road, Central Bengaluru",
        city: "Bengaluru",
        widthFt: "40",
        heightFt: "20",
        ratePerDay: "18000.00",
        submittedAt: "2026-03-01T00:00:00.000Z",
        createdAt: "2026-02-05T00:00:00.000Z",
        publisher: { id: "pub_1", name: "Suraj Kumar Prints" },
        agent: null,
        photos: [{ id: "ph_1", url: "https://cdn.adx.in/1.jpg" }],
        ...over,
    }) as WireListing;

describe("shapeListing", () => {
    it("keeps the API's id so a row click opens the record it names", () => {
        expect(shapeListing(wire()).id).toBe("lst_1");
    });

    it("carries the publisher's name, and says so when a listing has none", () => {
        expect(shapeListing(wire()).publisherName).toBe("Suraj Kumar Prints");
        // An unclaimed scraped listing genuinely has no publisher yet.
        expect(shapeListing(wire({ publisher: null })).publisherName).toBeNull();
    });

    it("counts photos rather than carrying them into a table cell", () => {
        expect(shapeListing(wire()).photoCount).toBe(1);
        expect(shapeListing(wire({ photos: [] })).photoCount).toBe(0);
    });

    it("keeps the rate as the decimal string the API sent", () => {
        // Money never becomes a JS number on the way to a screen.
        expect(shapeListing(wire()).ratePerDay).toBe("18000.00");
        expect(shapeListing(wire({ ratePerDay: null })).ratePerDay).toBeNull();
    });

    it("keeps every one of the API's ten statuses rather than folding them", () => {
        expect(shapeListing(wire({ status: "AWAITING_DOCUMENTS" })).status).toBe(
            "AWAITING_DOCUMENTS"
        );
    });

    /** The map skips a spot with no fix; half a fix is no fix. */
    it("carries a fix only when both coordinates are numbers", () => {
        const placed = shapeListing(wire({ latitude: 12.9716, longitude: 77.5946 }));
        expect(placed.latitude).toBe(12.9716);
        expect(placed.longitude).toBe(77.5946);
        expect(shapeListing(wire()).latitude).toBeNull();
        const half = shapeListing(wire({ latitude: 12.9716, longitude: null }));
        expect(half.latitude).toBeNull();
        expect(half.longitude).toBeNull();
    });
});

describe("labels", () => {
    it("gives every status a sentence and a tone", () => {
        for (const status of [
            "UNCLAIMED",
            "DRAFT",
            "AWAITING_AGREEMENT",
            "AWAITING_DOCUMENTS",
            "PENDING_REVIEW",
            "AWAITING_SITE_VERIFICATION",
            "ACTIVE",
            "SUSPENDED",
            "REJECTED",
            "INACTIVE",
        ] as const) {
            expect(listingStatusLabel(status)).toMatch(/\S/);
            expect(LISTING_STATUS_TONE[status]).toBeDefined();
        }
    });

    it("reads a size off the measured dimensions, and nothing when unmeasured", () => {
        expect(sizeLabel(wire())).toBe("40 × 20 ft");
        expect(sizeLabel(wire({ widthFt: null, heightFt: null }))).toBeNull();
    });
});
