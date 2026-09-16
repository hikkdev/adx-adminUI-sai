import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ api: {} }));
vi.mock("@/lib/api-config", () => ({ isLive: () => true }));

import { availabilityFor } from "./campaign-wizard";

/**
 * Lot G (Q116/136), package CG1 — the Availability chip's slots state on a
 * browse card (`5102:27803`). Which listings carry a loop is the admin
 * read's own `carriesLoop` since G11-1 — nothing of the console's to test.
 *
 * A screen with a loop is never "booked" by one campaign: the chip says
 * how many slots are left, and "No slot left" when the loop is full. A
 * static wall reads as it always did. A card from a backend older than the
 * column has no `slotsTotal` and reads as a wall.
 */

describe("the availability chip", () => {
    it("reads a static wall as available, from a date, or not", () => {
        expect(availabilityFor({ availableNow: true, availableFrom: null })).toEqual({ label: "Available", tone: "success" });
        expect(availabilityFor({ availableNow: false, availableFrom: "2026-10-01" }).label).toMatch(/^From /);
        expect(availabilityFor({ availableNow: false, availableFrom: null })).toEqual({ label: "Not available", tone: "neutral" });
        expect(availabilityFor({ availableNow: true, availableFrom: null, slotsTotal: 1, slotsLeft: 1 })).toEqual({ label: "Available", tone: "success" });
    });

    it("counts a screen's slots, warns when few are left, and says so when none is", () => {
        expect(availabilityFor({ availableNow: true, availableFrom: null, slotsTotal: 6, slotsLeft: 4 })).toEqual({ label: "4 slots left", tone: "success" });
        expect(availabilityFor({ availableNow: true, availableFrom: null, slotsTotal: 8, slotsLeft: 2 })).toEqual({ label: "2 slots left", tone: "warning" });
        expect(availabilityFor({ availableNow: true, availableFrom: null, slotsTotal: 6, slotsLeft: 1 })).toEqual({ label: "1 slot left", tone: "warning" });
        expect(availabilityFor({ availableNow: false, availableFrom: null, slotsTotal: 6, slotsLeft: 0 })).toEqual({ label: "No slot left", tone: "neutral" });
    });

    it("falls back to the wall reading when a loop card carries no slotsLeft", () => {
        expect(availabilityFor({ availableNow: true, availableFrom: null, slotsTotal: 6 })).toEqual({ label: "Available", tone: "success" });
    });
});
