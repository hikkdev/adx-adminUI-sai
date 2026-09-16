import { describe, expect, it, vi } from "vitest";

/**
 * The desk's reading of a case.
 *
 * The server's six statuses project onto the console's badges: SLA breach is
 * an open case past its due time — unless the clock is paused while a party
 * answers — and refunded is a resolved case with a credit. The re-install a
 * REINSTALL verdict raises and the fraud case citing the dispute ride on
 * the same read; and the calls the desk makes are the routes the apps'
 * screens read back from.
 */

const { calls } = vi.hoisted(() => ({ calls: [] as { method: string; path: string; body?: unknown }[] }));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (method: string) => async (path: string, body?: unknown) => {
        calls.push({ method, path, body });
        return {};
    };
    return { ...actual, api: { get: record("GET"), post: record("POST"), patch: record("PATCH"), put: record("PUT"), delete: record("DELETE") } };
});

import { chipCount, consoleStatusOf, disputeQueuePath, disputeService, QUEUE_CHIP_STATUSES, shapeDispute, slaNoteOf, type WireDispute } from "./disputes";

const now = new Date("2026-09-11T10:00:00.000Z");

const wire = (over: Partial<WireDispute> = {}): WireDispute => ({
    id: "dsp_1",
    displayId: "DSP-1109-2601",
    raisedByUserId: "usr_adv",
    raisedAs: "ADVERTISER",
    againstParty: "PUBLISHER",
    againstUserId: "usr_pub",
    orderId: "ord_00000341",
    listingId: "lst_1",
    reason: "PROOF_REJECTED",
    detail: "The after photo shows the wrong wall.",
    expectedResolution: "Re-review my proof",
    amountClaimed: "1200.00",
    status: "OPEN",
    statusNote: null,
    slaDueAt: "2026-09-13T06:00:00.000Z",
    reviewStartedAt: null,
    resolvedAt: null,
    outcome: null,
    resolutionNote: null,
    creditedAmount: null,
    creditStatus: "NONE",
    creditReleasedAt: null,
    reopenUntil: null,
    createdAt: "2026-09-09T06:00:00.000Z",
    updatedAt: "2026-09-09T06:00:00.000Z",
    order: { id: "ord_00000341", status: "COMPLETED", campaignName: "Monsoon sale", listing: { id: "lst_1", title: "Warehouse Gate 2, Koramangala", address: "Koramangala", city: "Bengaluru" } },
    ...over,
});

describe("the badge a case wears", () => {
    it("folds SLA and credit into the six statuses", () => {
        expect(consoleStatusOf(wire(), now)).toBe("open");
        expect(consoleStatusOf(wire({ status: "UNDER_REVIEW" }), now)).toBe("in_review");
        expect(consoleStatusOf(wire({ status: "AWAITING_RESPONSE" }), now)).toBe("awaiting_publisher");
        expect(consoleStatusOf(wire({ status: "UNDER_REVIEW", slaDueAt: "2026-09-10T06:00:00.000Z" }), now)).toBe("sla_breach");
        expect(consoleStatusOf(wire({ status: "ESCALATED", slaDueAt: "2026-09-10T06:00:00.000Z" }), now)).toBe("escalated");
        expect(consoleStatusOf(wire({ status: "RESOLVED" }), now)).toBe("resolved");
        expect(consoleStatusOf(wire({ status: "RESOLVED", creditedAmount: "450.00" }), now)).toBe("refunded");
        expect(consoleStatusOf(wire({ status: "REJECTED", slaDueAt: "2026-09-10T06:00:00.000Z" }), now)).toBe("rejected");
    });

    it("never breaches while the clock is paused on a party's answer, and trusts the server's view when it rides along", () => {
        const paused = wire({ status: "AWAITING_RESPONSE", slaDueAt: "2026-09-10T06:00:00.000Z", sla: { breached: false, paused: true, dueAt: "2026-09-12T06:00:00.000Z", dueIn: 72 * 3_600_000 } });
        expect(consoleStatusOf(paused, now)).toBe("awaiting_publisher");
        expect(slaNoteOf(paused, now)).toBe("SLA paused — awaiting a response");
        expect(shapeDispute(paused, now).slaPaused).toBe(true);
        const late = wire({ status: "UNDER_REVIEW", slaDueAt: "2026-09-13T06:00:00.000Z", sla: { breached: true, paused: false, dueAt: "2026-09-11T08:00:00.000Z", dueIn: -2 * 3_600_000 } });
        expect(consoleStatusOf(late, now)).toBe("sla_breach");
        expect(slaNoteOf(late, now)).toBe("SLA breached 2h ago");
    });
});

describe("shaping a case", () => {
    it("names the order and the site, ages the case, and keeps money as strings", () => {
        const shaped = shapeDispute(wire({ messages: [{ id: "m1", authorUserId: "usr_admin", authorName: "ADX Ops", isFromOps: true, body: "Send a wider photo.", createdAt: "2026-09-10T06:00:00.000Z" }], evidence: [] }), now);
        expect(shaped).toMatchObject({ orderRef: "ORDER #0341", site: "Warehouse Gate 2, Koramangala", ageDays: 2, amountClaimed: "1200.00", reason: "Proof rejected", threadLoaded: true });
        expect(shaped.messages[0]).toMatchObject({ author: "ADX Ops", fromOps: true });
        expect(shapeDispute(wire(), now).threadLoaded).toBe(false);
        expect(shapeDispute(wire({ slaDueAt: "2026-09-11T20:00:00.000Z" }), now).slaNote).toBe("SLA breach in 10h");
    });

    it("carries the re-install and the open fraud case off the ADMIN read", () => {
        const shaped = shapeDispute(
            wire({
                status: "RESOLVED",
                outcome: "REINSTALL",
                reinstallMilestoneId: "mls_1",
                reinstallStatus: "DISPATCHED",
                reinstallPending: true,
                openFraudCase: { id: "frd_1", displayId: "FRD-26-0001", status: "OPEN" },
            }),
            now
        );
        expect(shaped).toMatchObject({ reinstallMilestoneId: "mls_1", reinstallPending: true, reinstallStatus: "DISPATCHED" });
        expect(shaped.openFraudCase).toEqual({ id: "frd_1", displayId: "FRD-26-0001", status: "OPEN" });
        expect(shapeDispute(wire(), now)).toMatchObject({ reinstallMilestoneId: null, reinstallPending: false, openFraudCase: null, slaPaused: false });
    });
});

describe("the queue on the list contract (E6) and the record it is against (E7-3)", () => {
    it("sends only the facets in force, the statuses as a comma list, and always a page", () => {
        expect(disputeQueuePath()).toBe("/disputes?page=1&pageSize=50");
        expect(disputeQueuePath({ q: " wall ", status: QUEUE_CHIP_STATUSES.open, page: 3, pageSize: 20 })).toBe(
            "/disputes?q=wall&status=OPEN%2CUNDER_REVIEW%2CAWAITING_RESPONSE&page=3&pageSize=20"
        );
        expect(disputeQueuePath({ status: [], page: 0 })).toBe("/disputes?page=1&pageSize=50");
    });

    it("counts a chip off the server's per-status counts", () => {
        const counts = { OPEN: 2, UNDER_REVIEW: 1, ESCALATED: 4, RESOLVED: 3 };
        expect(chipCount(counts, QUEUE_CHIP_STATUSES.open)).toBe(3);
        expect(chipCount(counts, QUEUE_CHIP_STATUSES.escalated)).toBe(4);
        expect(chipCount(counts, QUEUE_CHIP_STATUSES.resolved)).toBe(3);
    });

    it("reads the page shape and shapes each row, and carries the against record when the read named one", async () => {
        calls.length = 0;
        const page = await disputeService.queue({ q: "gate", status: ["ESCALATED"] });
        expect(calls).toEqual([{ method: "GET", path: "/disputes?q=gate&status=ESCALATED&page=1&pageSize=50", body: undefined }]);
        expect(page).toEqual({ items: [], total: 0, page: 1, pageSize: 50, counts: {} });
        const against = { type: "PUBLISHER" as const, id: "pub_1", displayId: "PUB-0007", name: "Kumar Stores" };
        expect(shapeDispute(wire({ against }), now).against).toEqual(against);
        expect(shapeDispute(wire(), now).against).toBeNull();
    });
});

describe("the calls the desk makes", () => {
    it("are the same routes the apps read back from", async () => {
        calls.length = 0;
        await disputeService.message("dsp_1", "On it.");
        await disputeService.setStatus("dsp_1", "AWAITING_RESPONSE", "Send a wider photo.");
        await disputeService.resolve("dsp_1", { outcome: "PARTIAL_CREDIT", note: "Half back.", creditAmount: "450.00" });
        await disputeService.resolve("dsp_1", { outcome: "REINSTALL", note: "Re-do it.", agentId: "agt_2" });
        await disputeService.releaseCredit("dsp_1");
        expect(calls).toEqual([
            { method: "POST", path: "/disputes/dsp_1/messages", body: { body: "On it." } },
            { method: "PATCH", path: "/disputes/dsp_1/status", body: { status: "AWAITING_RESPONSE", note: "Send a wider photo." } },
            { method: "POST", path: "/disputes/dsp_1/resolve", body: { outcome: "PARTIAL_CREDIT", note: "Half back.", creditAmount: "450.00" } },
            { method: "POST", path: "/disputes/dsp_1/resolve", body: { outcome: "REINSTALL", note: "Re-do it.", agentId: "agt_2" } },
            { method: "POST", path: "/disputes/dsp_1/credit/release", body: {} },
        ]);
    });
});
