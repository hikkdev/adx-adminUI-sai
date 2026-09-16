import { describe, expect, it } from "vitest";
import { opsOverridesFor, shapeOffer, shapeOrder } from "./orders";
import type { OrderStatus } from "@/types";

/**
 * Lot D (Q51/Q90): when the order page may offer an ops move.
 *
 * Each override exists for a party who is not answering, never for one who
 * has not yet had the chance. The backend gates them on the window having
 * closed and answers 409 before; these pin the console's mirror of that
 * rule, so a button appears exactly when the route would accept it.
 */

const now = new Date("2026-09-12T10:00:00.000Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
const hoursAhead = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString();

const order = (over: Partial<Parameters<typeof opsOverridesFor>[0]> = {}) => ({
    status: "PENDING_PUBLISHER" as OrderStatus,
    agentId: null,
    publisherTimerExpiry: null,
    slotProposedAt: null,
    slotTime: null,
    checkedInAt: null,
    ...over,
});

describe("accept for the publisher", () => {
    it("is offered only at PENDING_PUBLISHER once the 30-minute window has passed", () => {
        expect(opsOverridesFor(order({ publisherTimerExpiry: hoursAgo(1) }), now).acceptPublisher).toBe(true);
        expect(opsOverridesFor(order({ publisherTimerExpiry: hoursAhead(0.2) }), now).acceptPublisher).toBe(false);
        expect(opsOverridesFor(order({ publisherTimerExpiry: null }), now).acceptPublisher).toBe(false);
        expect(opsOverridesFor(order({ status: "PENDING_PRINT", publisherTimerExpiry: hoursAgo(1) }), now).acceptPublisher).toBe(false);
    });
});

describe("confirm the slot for the publisher", () => {
    it("needs SLOT_PROPOSED, a slot on the table, and a day of silence", () => {
        const proposed = order({ status: "SLOT_PROPOSED", slotTime: hoursAhead(48), slotProposedAt: hoursAgo(25), agentId: "agt_1" });
        expect(opsOverridesFor(proposed, now).confirmSlot).toBe(true);
        expect(opsOverridesFor({ ...proposed, slotProposedAt: hoursAgo(23) }, now).confirmSlot).toBe(false);
        // Countered: the slot was cleared, so there is nothing to confirm for them.
        expect(opsOverridesFor({ ...proposed, slotTime: null }, now).confirmSlot).toBe(false);
        expect(opsOverridesFor({ ...proposed, status: "SLOT_CONFIRMED" }, now).confirmSlot).toBe(false);
    });
});

describe("record the prints as collected", () => {
    it("needs an agent who has checked in, and stops being offered once IN_PROGRESS", () => {
        const onSite = order({ status: "SLOT_CONFIRMED", agentId: "agt_1", checkedInAt: hoursAgo(0.5) });
        expect(opsOverridesFor(onSite, now).collectPrints).toBe(true);
        expect(opsOverridesFor({ ...onSite, checkedInAt: null }, now).collectPrints).toBe(false);
        expect(opsOverridesFor({ ...onSite, agentId: null }, now).collectPrints).toBe(false);
        // The route is a no-op once IN_PROGRESS; a button that does nothing is not drawn.
        expect(opsOverridesFor({ ...onSite, status: "IN_PROGRESS" }, now).collectPrints).toBe(false);
    });
});

describe("reassign", () => {
    it("is offered in any state before the proof and never after", () => {
        for (const status of ["PENDING_AGENT", "AGENT_REJECTED", "SLOT_PROPOSED", "SLOT_CONFIRMED", "IN_PROGRESS"] as OrderStatus[]) {
            expect(opsOverridesFor(order({ status }), now).reassign, status).toBe(true);
        }
        for (const status of ["PENDING_PUBLISHER", "PENDING_PRINT", "PENDING_OTP", "PENDING_APPROVAL", "COMPLETED", "CANCELLED"] as OrderStatus[]) {
            expect(opsOverridesFor(order({ status }), now).reassign, status).toBe(false);
        }
    });
});

describe("the detail read", () => {
    it("carries the stamps the overrides are gated on, the cancellation and the offers", () => {
        const shaped = shapeOrder({
            id: "ord_1",
            status: "CANCELLED",
            campaignName: null,
            budget: null,
            startDate: null,
            endDate: null,
            slotTime: null,
            createdAt: "2026-09-10T06:00:00.000Z",
            agentId: "agt_1",
            listing: { title: "Gate 2", city: "Bengaluru" },
            agent: { user: { name: "Ravi" } },
            publisherTimerExpiry: "2026-09-10T06:30:00.000Z",
            checkIn: { checkedInAt: "2026-09-11T06:00:00.000Z" },
            cancelledAt: "2026-09-11T08:00:00.000Z",
            cancellationReason: "Advertiser withdrew.",
            agentAssignments: [
                { id: "asg_2", agentId: "agt_1", status: "ACCEPTED", rejectionReason: null, assignedAt: "2026-09-10T07:00:00.000Z", respondedAt: "2026-09-10T07:05:00.000Z", quotedFee: "450.00", agent: { user: { name: "Ravi" } } },
                { id: "asg_1", agentId: "agt_0", status: "REJECTED", rejectionReason: "TOO_FAR", assignedAt: "2026-09-10T06:31:00.000Z", respondedAt: "2026-09-10T06:40:00.000Z", quotedFee: null, agent: null },
            ],
        });
        expect(shaped).toMatchObject({ publisherTimerExpiry: "2026-09-10T06:30:00.000Z", checkedInAt: "2026-09-11T06:00:00.000Z", cancellationReason: "Advertiser withdrew." });
        expect(shaped.offers).toHaveLength(2);
        expect(shaped.offers?.[0]).toMatchObject({ agentName: "Ravi", status: "ACCEPTED", quotedFee: "450.00" });
        expect(shaped.offers?.[1]).toMatchObject({ agentName: "agt_0", status: "REJECTED", rejectionReason: "TOO_FAR" });
        // A list row carries no assignments and says so, rather than an empty history.
        expect(shapeOrder({ id: "o", status: "DRAFT", campaignName: null, budget: null, startDate: null, endDate: null, slotTime: null, createdAt: "2026-09-10T06:00:00.000Z", agentId: null }).offers).toBeUndefined();
        expect(shapeOffer({ id: "a", agentId: "g", status: "PENDING", rejectionReason: null, assignedAt: "2026-09-10T06:00:00.000Z", respondedAt: null, quotedFee: null }).agentName).toBe("g");
    });
});
