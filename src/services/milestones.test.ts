import { describe, expect, it } from "vitest";
import {
    offerStateOf,
    parseRequirements,
    planItemsBody,
    shapeMilestone,
    shapePlan,
    shapeTemplate,
    type WireMilestone,
    type WireMilestonePlan,
    type WireMilestoneTemplate,
} from "./milestones";

/**
 * How the console reads a milestone's offer (A12): one word for where the
 * step is, folded from the status and the offer columns.
 */

const NOW = new Date("2026-09-10T10:00:00.000Z");

const wire = (over: Partial<WireMilestone> = {}): WireMilestone => ({
    id: "ms_1",
    orderId: "ord_1",
    templateId: "tpl_1",
    assignedAgentId: "agt_1",
    status: "DISPATCHED",
    order: 1,
    isOptional: false,
    dueDate: null,
    notes: null,
    startedAt: null,
    completedAt: null,
    offeredAt: "2026-09-10T09:50:00.000Z",
    offerExpiresAt: "2026-09-10T10:15:00.000Z",
    acceptedAt: null,
    rejectionReason: null,
    scheduledStart: null,
    scheduledEnd: null,
    template: { id: "tpl_1", title: "Advertiser visit", type: "VERIFICATION" },
    assignedAgent: { id: "agt_1", displayId: "AGT-1009-2601", user: { name: "Rahul Kumar", mobile: "+919876543210" } },
    evidence: [],
    ...over,
});

describe("offerStateOf", () => {
    it("reads an open offer, an expired one, and the answers", () => {
        expect(offerStateOf(wire(), NOW)).toBe("offered");
        expect(offerStateOf(wire(), new Date("2026-09-10T10:20:00.000Z"))).toBe("expired");
        expect(offerStateOf(wire({ acceptedAt: "2026-09-10T09:55:00.000Z" }), NOW)).toBe("accepted");
        expect(offerStateOf(wire({ acceptedAt: "2026-09-10T09:55:00.000Z", scheduledStart: "2026-09-11T04:30:00.000Z" }), NOW)).toBe("scheduled");
    });

    it("reads a visit that came back, and one nobody has been given", () => {
        expect(offerStateOf(wire({ status: "PENDING", assignedAgentId: null, rejectionReason: "TOO_FAR" }), NOW)).toBe("declined");
        expect(offerStateOf(wire({ status: "PENDING", assignedAgentId: null, rejectionReason: "EXPIRED" }), NOW)).toBe("expired");
        expect(offerStateOf(wire({ status: "PENDING", assignedAgentId: null, offerExpiresAt: null }), NOW)).toBe("unassigned");
    });

    it("treats a row older than the offer columns as accepted work", () => {
        expect(offerStateOf(wire({ offeredAt: null, offerExpiresAt: null, acceptedAt: null }), NOW)).toBe("accepted");
        expect(offerStateOf(wire({ status: "IN_PROGRESS" }), NOW)).toBe("working");
        expect(offerStateOf(wire({ status: "COMPLETED" }), NOW)).toBe("done");
        expect(offerStateOf(wire({ status: "SKIPPED" }), NOW)).toBe("skipped");
    });
});

describe("shapeMilestone", () => {
    it("names the agent, prints the clock while offered, and the reason once declined", () => {
        const offered = shapeMilestone(wire(), NOW);
        expect(offered.agentName).toBe("Rahul Kumar");
        expect(offered.expiresAt).not.toBeNull();
        expect(offered.declinedFor).toBeNull();

        const declined = shapeMilestone(wire({ status: "PENDING", assignedAgentId: null, assignedAgent: null, rejectionReason: "OTHER: Site closed" }), NOW);
        expect(declined.agentName).toBeNull();
        expect(declined.declinedFor).toBe("OTHER: Site closed");
        expect(declined.expiresAt).toBeNull();
    });
});

/**
 * D9 — the templates and plans behind `/flows/templates`, read live.
 *
 * `OrderMilestoneTemplate.requirements` is loose JSON on the backend, and
 * its read path drops rows that no longer parse rather than throwing, so an
 * unreadable requirement cannot make a milestone impossible to complete. The
 * console applies the same rule to the same column, for the same reason: a
 * card that crashes on one bad row hides every other template with it.
 */

const template = (over: Partial<WireMilestoneTemplate> = {}): WireMilestoneTemplate => ({
    id: "tpl_survey",
    title: "Site survey",
    type: "SURVEY",
    description: "Confirm condition and visibility before the campaign goes live.",
    isActive: true,
    requirements: [
        { kind: "location_checkin" },
        { kind: "photo", label: "Wide angle shot" },
        { kind: "photo", label: "Context shot", optional: true },
        { kind: "checklist_item", label: "Structure is safe" },
    ],
    estimatedDurationMins: 25,
    createdAt: "2026-08-01T04:30:00.000Z",
    updatedAt: "2026-09-01T04:30:00.000Z",
    ...over,
});

describe("parseRequirements", () => {
    it("keeps every kind the backend knows, with the optional flag where it carries one", () => {
        const parsed = parseRequirements(template().requirements);
        expect(parsed).toHaveLength(4);
        expect(parsed[0]).toEqual({ kind: "location_checkin" });
        expect(parsed[2]).toEqual({ kind: "photo", label: "Context shot", optional: true });
        // Absent means mandatory, and stays absent rather than being filled
        // with false: a template written before the flag existed is unchanged.
        expect(parsed[1]).toEqual({ kind: "photo", label: "Wide angle shot" });
    });

    it("drops a row it cannot read rather than throwing, like the backend's own read path", () => {
        const parsed = parseRequirements([
            { kind: "photo", label: "Front face" },
            { kind: "hologram", label: "Nope" },
            { kind: "photo", label: "   " },
            { kind: "checklist_item" },
            "not even an object",
            { kind: "qr_scan" },
        ]);
        expect(parsed).toEqual([{ kind: "photo", label: "Front face" }, { kind: "qr_scan" }]);
    });

    it("reads nothing off a column that is not a list", () => {
        expect(parseRequirements(null)).toEqual([]);
        expect(parseRequirements(undefined)).toEqual([]);
        expect(parseRequirements({ kind: "photo", label: "x" })).toEqual([]);
    });
});

describe("shapeTemplate", () => {
    it("carries the wire through with the requirements parsed", () => {
        const view = shapeTemplate(template());
        expect(view.id).toBe("tpl_survey");
        expect(view.type).toBe("SURVEY");
        expect(view.isActive).toBe(true);
        expect(view.estimatedDurationMins).toBe(25);
        expect(view.requirements).toHaveLength(4);
        expect(view.updatedAt).toBe("2026-09-01T04:30:00.000Z");
    });

    it("leaves an unestimated duration null rather than zero, and a missing description null", () => {
        const view = shapeTemplate(template({ estimatedDurationMins: null, description: null }));
        expect(view.estimatedDurationMins).toBeNull();
        expect(view.description).toBeNull();
        expect(shapeTemplate(template({ estimatedDurationMins: undefined })).estimatedDurationMins).toBeNull();
    });
});

describe("shapePlan", () => {
    const plan = (over: Partial<WireMilestonePlan> = {}): WireMilestonePlan => ({
        id: "pln_standard",
        name: "Standard hoarding campaign",
        description: null,
        isActive: true,
        items: [
            { id: "pi_2", planId: "pln_standard", templateId: "tpl_install", order: 2, isOptional: false, template: template({ id: "tpl_install", title: "Installation", type: "INSTALLATION" }) },
            { id: "pi_1", planId: "pln_standard", templateId: "tpl_survey", order: 1, isOptional: false, template: template() },
            { id: "pi_3", planId: "pln_standard", templateId: "tpl_check", order: 3, isOptional: true, template: null },
        ],
        ...over,
    });

    it("orders the steps by their order, whatever order the rows arrived in", () => {
        const view = shapePlan(plan());
        expect(view.items.map((item) => item.order)).toEqual([1, 2, 3]);
        expect(view.items.map((item) => item.templateId)).toEqual(["tpl_survey", "tpl_install", "tpl_check"]);
    });

    it("names each step from the joined template and says nothing when the join is missing", () => {
        const view = shapePlan(plan());
        expect(view.items[0].title).toBe("Site survey");
        expect(view.items[2].title).toBeNull();
        expect(view.items[2].optional).toBe(true);
        expect(view.items[0].optional).toBe(false);
    });

    it("reads a plan straight off POST, which comes back with no items yet", () => {
        const view = shapePlan(plan({ items: undefined }));
        expect(view.items).toEqual([]);
        expect(view.name).toBe("Standard hoarding campaign");
        expect(view.description).toBeNull();
    });
});

describe("planItemsBody", () => {
    it("numbers the steps from one in the order given, which is what the PUT demands", () => {
        const body = planItemsBody([
            { templateId: "tpl_survey", optional: false },
            { templateId: "tpl_install", optional: false },
            { templateId: "tpl_check", optional: true },
        ]);
        expect(body.items.map((item) => item.order)).toEqual([1, 2, 3]);
        expect(body.items[2]).toEqual({ templateId: "tpl_check", order: 3, isOptional: true });
        expect(body.items[0].isOptional).toBe(false);
    });
});
