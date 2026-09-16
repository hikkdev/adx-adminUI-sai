import { describe, expect, it } from "vitest";

import {
    VISIT_BOARD_COLUMNS,
    VISIT_COLUMN_OF,
    VISIT_STATUSES,
    VISIT_STATUS_META,
    buildVisitsQuery,
    expiresInLabel,
    shapeCounts,
    shapeVisit,
    visitPillTone,
    whereLabel,
    type VisitStatus,
    type WireVisit,
} from "./visits";

/**
 * DR 06 — the dispatch board.
 *
 * There is no DR 10 frame for this screen; the console's own board idiom
 * stands in. So what this file pins is the shaping and the query, not a
 * layout — the things the board gets wrong if nobody is watching.
 *
 * 1. `earned` is a decimal string or null, and stays one. "₹145 earned" on a
 *    completed card is the wallet's figure, and null is a completion with no
 *    rate configured — which is not zero.
 *
 * 2. `expiresInSeconds` is the server's clock and passes through untouched.
 *    The console draws it; it does not keep a second clock.
 *
 * 3. The status histogram is counted server-side without the status facet so
 *    the chips never collapse; a status the server did not mention reads as
 *    zero rather than as `undefined` on a chip.
 *
 * 4. The query goes to the API in the exact shape `adminVisitsQuerySchema`
 *    parses: a comma list for status, an ISO date for the day, and nothing
 *    sent for a facet the caller did not set.
 */

const wire = (over: Partial<WireVisit> = {}): WireVisit => ({
    id: "cld_visit_1",
    displayId: "VIS-0042",
    kind: "ONBOARDING",
    status: "REQUESTED",
    pill: { label: "New request", tone: "warn" },
    businessName: "Sri Balaji Sweets",
    locality: "Jayanagar 4th Block",
    city: "Bengaluru",
    latitude: 12.9252,
    longitude: 77.5938,
    scheduledFor: null,
    offerExpiresAt: "2026-09-11T10:25:00.000Z",
    expiresInSeconds: 1500,
    startedAt: null,
    completedAt: null,
    earned: null,
    leadId: "cld_lead_1",
    publisherId: null,
    advertiserId: null,
    agentId: "cld_agent_7",
    notes: null,
    ...over,
});

describe("shapeVisit — money", () => {
    it("keeps what a completed visit earned as the decimal string the API sent", () => {
        const visit = shapeVisit(wire({ status: "COMPLETED", earned: "145.00" }));
        expect(visit.earned).toBe("145.00");
        expect(typeof visit.earned).toBe("string");
    });

    it("leaves a completion with no rate null rather than filling it with zero", () => {
        const visit = shapeVisit(wire({ status: "COMPLETED", earned: null }));
        expect(visit.earned).toBeNull();
        expect(visit.earned).not.toBe("0.00");
    });
});

describe("shapeVisit — the clock", () => {
    it("passes the server's countdown through untouched", () => {
        expect(shapeVisit(wire({ expiresInSeconds: 1500 })).expiresInSeconds).toBe(1500);
        expect(shapeVisit(wire({ expiresInSeconds: 0 })).expiresInSeconds).toBe(0);
        expect(shapeVisit(wire({ status: "SCHEDULED", expiresInSeconds: null })).expiresInSeconds).toBeNull();
    });

    it("says how long a request has left, from the server's clock when there is no local one", () => {
        expect(expiresInLabel(shapeVisit(wire({ expiresInSeconds: 1500 })), null)).toBe("Expires in 25 min");
        // Rounded up: 61 seconds is still two minutes of somebody's attention.
        expect(expiresInLabel(shapeVisit(wire({ expiresInSeconds: 61 })), null)).toBe("Expires in 2 min");
        expect(expiresInLabel(shapeVisit(wire({ expiresInSeconds: 0 })), null)).toBe("Expiring now");
    });

    it("counts down against the local clock once there is one", () => {
        const visit = shapeVisit(wire({ offerExpiresAt: "2026-09-11T10:25:00.000Z", expiresInSeconds: 1500 }));
        expect(expiresInLabel(visit, Date.parse("2026-09-11T10:15:00.000Z"))).toBe("Expires in 10 min");
        expect(expiresInLabel(visit, Date.parse("2026-09-11T10:30:00.000Z"))).toBe("Expiring now");
    });

    it("has no clock on anything but a request", () => {
        expect(expiresInLabel(shapeVisit(wire({ status: "SCHEDULED", offerExpiresAt: null, expiresInSeconds: null })), null)).toBeNull();
        expect(expiresInLabel(shapeVisit(wire({ status: "COMPLETED", offerExpiresAt: null, expiresInSeconds: null })), null)).toBeNull();
    });
});

describe("shapeVisit — the pill the server sent", () => {
    it("carries the label through and bridges the tone onto one the badge can draw", () => {
        const visit = shapeVisit(wire());
        expect(visit.pill.label).toBe("New request");
        expect(visit.pill.tone).toBe("warning");
    });

    it("bridges each of the API's tone words onto one of the console's five", () => {
        expect(visitPillTone("warn")).toBe("warning");
        expect(visitPillTone("new")).toBe("info");
        expect(visitPillTone("live")).toBe("success");
        expect(visitPillTone("neutral")).toBe("neutral");
        expect(visitPillTone("something-new")).toBe("neutral");
    });

    it("has a badge of its own for every status, for the chips and the offline card", () => {
        const drawable = ["success", "warning", "danger", "info", "neutral"];
        expect(VISIT_STATUSES).toHaveLength(7);
        for (const status of VISIT_STATUSES) {
            expect(VISIT_STATUS_META[status].label).toMatch(/\S/);
            expect(drawable).toContain(VISIT_STATUS_META[status].tone);
        }
    });
});

describe("the board's columns", () => {
    it("puts every status in exactly one column", () => {
        const placed = VISIT_BOARD_COLUMNS.flatMap((column) => column.statuses);
        expect([...placed].sort()).toEqual([...VISIT_STATUSES].sort());
        for (const status of VISIT_STATUSES) {
            expect(VISIT_COLUMN_OF[status]).toBeTruthy();
        }
    });

    it("folds the three settled statuses into one Closed column", () => {
        const closed: VisitStatus[] = ["DECLINED", "EXPIRED", "CANCELLED"];
        for (const status of closed) expect(VISIT_COLUMN_OF[status]).toBe("closed");
        expect(VISIT_COLUMN_OF.REQUESTED).toBe("requested");
        expect(VISIT_COLUMN_OF.COMPLETED).toBe("completed");
    });
});

describe("shapeCounts", () => {
    it("reads a status the server did not mention as zero, so a chip never says undefined", () => {
        const counts = shapeCounts({ REQUESTED: 3, COMPLETED: 1 });
        expect(counts.REQUESTED).toBe(3);
        expect(counts.COMPLETED).toBe(1);
        expect(counts.SCHEDULED).toBe(0);
        expect(counts.CANCELLED).toBe(0);
        for (const status of VISIT_STATUSES) expect(typeof counts[status]).toBe("number");
    });

    it("survives a response with no histogram at all", () => {
        const counts = shapeCounts(undefined);
        for (const status of VISIT_STATUSES) expect(counts[status]).toBe(0);
    });
});

describe("buildVisitsQuery", () => {
    const parse = (query: string) => Object.fromEntries(new URLSearchParams(query));

    it("sends the day as the ISO date the schema parses", () => {
        expect(parse(buildVisitsQuery({ date: "2026-09-11" })).date).toBe("2026-09-11");
    });

    it("leaves the day off when the caller asked for any day", () => {
        expect(parse(buildVisitsQuery({}))).not.toHaveProperty("date");
    });

    it("sends the status facet as the comma list a chip row serialises to", () => {
        expect(parse(buildVisitsQuery({ status: ["REQUESTED", "SCHEDULED"] })).status).toBe("REQUESTED,SCHEDULED");
        expect(parse(buildVisitsQuery({ status: [] }))).not.toHaveProperty("status");
    });

    it("narrows to one agent and one kind when asked", () => {
        const parsed = parse(buildVisitsQuery({ agentId: "cld_agent_7", kind: "RENEWAL", city: "Bengaluru" }));
        expect(parsed.agentId).toBe("cld_agent_7");
        expect(parsed.kind).toBe("RENEWAL");
        expect(parsed.city).toBe("Bengaluru");
    });

    it("always pages, so the board never asks for an unbounded list", () => {
        const parsed = parse(buildVisitsQuery({}));
        expect(parsed.page).toBe("1");
        expect(Number(parsed.pageSize)).toBeGreaterThan(0);
        expect(parse(buildVisitsQuery({ page: 2, pageSize: 50 }))).toMatchObject({ page: "2", pageSize: "50" });
    });

    it("sends a search only when there is one", () => {
        expect(parse(buildVisitsQuery({ q: "balaji" })).q).toBe("balaji");
        expect(parse(buildVisitsQuery({ q: "" }))).not.toHaveProperty("q");
    });
});

describe("labels", () => {
    it("reads a place off whichever half of it the visit has", () => {
        expect(whereLabel(shapeVisit(wire()))).toBe("Jayanagar 4th Block · Bengaluru");
        expect(whereLabel(shapeVisit(wire({ locality: null })))).toBe("Bengaluru");
        expect(whereLabel(shapeVisit(wire({ locality: null, city: null })))).toBe("—");
    });
});
