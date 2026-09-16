import { describe, expect, it } from "vitest";

import {
    LEAD_STATUSES,
    assignedLabel,
    isUnassigned,
    leadStatusLabel,
    pillTone,
    shapeLead,
    whereLabel,
    type LeadStatus,
    type WireLead,
} from "./leads";

/**
 * DR 06 — the leads desk.
 *
 * There is no Figma frame for this screen: none of the 98 frames on canvas
 * 4601:2 covers leads. The console's own idiom stands in, so what this file
 * pins is the shaping, not a layout — the three things the desk gets wrong if
 * nobody is watching.
 *
 * 1. Money is a string the whole way. `estimatedCommission` is a decimal string
 *    or null, and null means "nobody has estimated this", which is not zero. A
 *    lead worth an unknown amount printing "₹0" would be read as a lead worth
 *    nothing, and it is the column ops sort the day's work by.
 *
 * 2. An unassigned lead is a different thing from an assigned one. `null` here
 *    is the open pool — the leads DR 06 lets any agent take — and folding it
 *    into a blank cell hides the only queue that needs working.
 *
 * 3. The pill on a card comes from the server, which owns the status-to-pill
 *    mapping. The console keeps the label verbatim and only bridges the API's
 *    four tone words onto the five the StatusBadge draws; it does not keep a
 *    second opinion about what a HOT lead should say.
 */

const wire = (over: Partial<WireLead> = {}): WireLead => ({
    id: "cld_lead_1",
    displayId: "LEAD-0042",
    side: "PUBLISHER",
    businessName: "Sri Balaji Sweets",
    category: "SHOP_FRONT",
    locality: "Jayanagar 4th Block",
    city: "Bengaluru",
    status: "NEW",
    pill: { label: "New", tone: "new" },
    estimatedCommission: "4500.00",
    distanceM: 1840,
    visitBooked: false,
    latitude: 12.9252,
    longitude: 77.5938,
    contactName: "Ramesh",
    phone: "+919845012345",
    interest: "Wants the shutter and the side wall priced",
    source: "FIELD_WALK",
    bestTimeFrom: "10:00",
    bestTimeTo: "18:00",
    firstContactedAt: null,
    assignedAgentId: null,
    ...over,
});

describe("shapeLead — money", () => {
    it("keeps the estimate as the decimal string the API sent", () => {
        const lead = shapeLead(wire());
        expect(lead.estimatedCommission).toBe("4500.00");
        // Not a number at any point: a float round trip loses paise, and this
        // figure is what an agent is eventually paid.
        expect(typeof lead.estimatedCommission).toBe("string");
    });

    it("leaves an unestimated lead null rather than filling it with zero", () => {
        const lead = shapeLead(wire({ estimatedCommission: null }));
        expect(lead.estimatedCommission).toBeNull();
        expect(lead.estimatedCommission).not.toBe(0);
        expect(lead.estimatedCommission).not.toBe("0");
        expect(lead.estimatedCommission).not.toBe("0.00");
    });

    it("keeps a genuine zero, which is the server saying nothing is due", () => {
        expect(shapeLead(wire({ estimatedCommission: "0.00" })).estimatedCommission).toBe("0.00");
    });
});

describe("shapeLead — who is on it", () => {
    it("tells an assigned lead from one in the open pool", () => {
        const open = shapeLead(wire({ assignedAgentId: null }));
        const taken = shapeLead(wire({ assignedAgentId: "cld_agent_7" }));

        expect(open.assignedAgentId).toBeNull();
        expect(taken.assignedAgentId).toBe("cld_agent_7");
        expect(isUnassigned(open)).toBe(true);
        expect(isUnassigned(taken)).toBe(false);
    });

    it("names the open pool in words rather than leaving the cell blank", () => {
        expect(assignedLabel(shapeLead(wire({ assignedAgentId: null })))).toBe("Open pool");
        expect(assignedLabel(shapeLead(wire({ assignedAgentId: "cld_agent_7" })))).toBe("cld_agent_7");
    });
});

describe("shapeLead — the pill the server sent", () => {
    /** What the API pairs with each status. The console repeats none of it. */
    const sent: Record<LeadStatus, WireLead["pill"]> = {
        NEW: { label: "New", tone: "new" },
        CONTACTED: { label: "Contacted", tone: "neutral" },
        HOT: { label: "Hot", tone: "hot" },
        VISIT_BOOKED: { label: "Visit booked", tone: "live" },
        CONVERTED: { label: "Converted", tone: "live" },
        LOST: { label: "Lost", tone: "neutral" },
    };

    it("carries the server's label through untouched, for all six statuses", () => {
        for (const status of LEAD_STATUSES) {
            const lead = shapeLead(wire({ status, pill: sent[status] }));
            expect(lead.status).toBe(status);
            expect(lead.pill.label).toBe(sent[status].label);
        }
    });

    it("gives every status a badge tone the console can actually draw", () => {
        const drawable = ["success", "warning", "danger", "info", "neutral"];
        for (const status of LEAD_STATUSES) {
            expect(drawable).toContain(shapeLead(wire({ status, pill: sent[status] })).pill.tone);
        }
    });

    it("bridges each of the API's four tone words onto one of the console's five", () => {
        expect(pillTone("new")).toBe("info");
        expect(pillTone("hot")).toBe("warning");
        expect(pillTone("live")).toBe("success");
        expect(pillTone("neutral")).toBe("neutral");
    });
});

describe("labels", () => {
    it("has a word for every status the facet can filter by", () => {
        expect(LEAD_STATUSES).toHaveLength(6);
        for (const status of LEAD_STATUSES) {
            expect(leadStatusLabel(status)).toMatch(/\S/);
        }
    });

    it("reads a place off whichever half of it the lead has", () => {
        expect(whereLabel(shapeLead(wire()))).toBe("Jayanagar 4th Block · Bengaluru");
        expect(whereLabel(shapeLead(wire({ locality: null })))).toBe("Bengaluru");
        expect(whereLabel(shapeLead(wire({ city: null })))).toBe("Jayanagar 4th Block");
        // A scraped lead with no address at all says nothing rather than "null".
        expect(whereLabel(shapeLead(wire({ locality: null, city: null })))).toBe("—");
    });

    it("keeps the visit flag, which is what makes an estimate worth reading", () => {
        expect(shapeLead(wire({ visitBooked: true })).visitBooked).toBe(true);
        expect(shapeLead(wire()).visitBooked).toBe(false);
    });
});
