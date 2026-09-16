import { describe, expect, it } from "vitest";
import { feedKindLabel, subscriptionLine } from "./publishers";

/* P-C: the words the publisher card prints off `GET /publishers/:id/summary`. */
describe("feedKindLabel", () => {
    it("labels the five merged sources and reads a kind the server grows as itself", () => {
        expect(feedKindLabel("ACTIVITY")).toBe("Activity");
        expect(feedKindLabel("FIELD_VISIT")).toBe("Field visit");
        expect(feedKindLabel("LISTING_LIVE")).toBe("Listing live");
        expect(feedKindLabel("BOOKING_AUTHORISED")).toBe("Booking authorised");
        expect(feedKindLabel("PAYOUT_RELEASED")).toBe("Payout released");
        expect(feedKindLabel("DISPUTE_RAISED")).toBe("Dispute raised");
    });
});

describe("subscriptionLine", () => {
    const date = (iso: string) => `D(${iso})`;
    it("is nothing without a running subscription", () => {
        expect(subscriptionLine(null, date)).toBeNull();
        expect(subscriptionLine(undefined, date)).toBeNull();
    });
    it("names the tier and when it ends", () => {
        expect(subscriptionLine({ tier: "PLUS", endsAt: "2026-09-30T18:29:59.999Z" }, date)).toBe("Plus plan until D(2026-09-30T18:29:59.999Z)");
        expect(subscriptionLine({ tier: "PRO", endsAt: null }, date)).toBe("Pro plan");
    });
});
