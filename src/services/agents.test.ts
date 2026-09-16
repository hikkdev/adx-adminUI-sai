import { describe, expect, it } from "vitest";
import { agentDisplayName, agentStatus, clockLabel, hoursLabel, shapeAgent, tierLabel, workingDaysLabel, type WireAgent } from "./agents";
import { priorityLabel } from "./agents";
import { AGENT_STATUS_META } from "@/types";

/**
 * The shaping the console does to an agent, and the one status it derives.
 *
 * Agents came off fixtures by adopting `GET /agents` as the shape rather than
 * translating into the console's own. These pin the places that can still go
 * quietly wrong: a join the listing leaves out, a name that is whitespace, and
 * a status that used to have three values and now has the one the backend can
 * actually vouch for.
 */

const wire = (over: Partial<WireAgent> = {}): WireAgent => ({
    id: "cmzAgent001",
    userId: "cmzUser001",
    displayId: "AGT-1009-2601",
    city: "Bengaluru",
    state: "Karnataka",
    tier: "BRONZE",
    referralCode: "cmzRef001",
    createdAt: "2026-09-10T09:30:00.000Z",
    user: { id: "cmzUser001", name: "Rahul Kumar", mobile: "+919876543210", isActive: true },
    ...over,
});

describe("deriving whether an agent can sign in", () => {
    it("is active while the user is", () => {
        expect(agentStatus({ user: { isActive: true } })).toBe("active");
    });

    it("is deactivated once the user is switched off", () => {
        expect(agentStatus({ user: { isActive: false } })).toBe("deactivated");
    });

    /** A thin join is missing evidence, not evidence of a deactivation. */
    it("does not call a missing join a deactivation", () => {
        expect(agentStatus({})).toBe("active");
        expect(agentStatus({ user: null })).toBe("active");
    });

    it("has exactly the states the backend can vouch for — sign-in, and the D5 profile status", () => {
        expect(Object.keys(AGENT_STATUS_META).sort()).toEqual(["active", "deactivated", "on_leave", "suspended"]);
    });
});

describe("shaping the row", () => {
    it("lifts the person off the join and renames createdAt to what the page calls it", () => {
        const agent = shapeAgent(wire());
        expect(agent.name).toBe("Rahul Kumar");
        expect(agent.mobile).toBe("+919876543210");
        expect(agent.joinedAt).toBe("2026-09-10T09:30:00.000Z");
        expect(agent.status).toBe("active");
    });

    /** The listing joins no email; only the by-id read does. */
    it("keeps email null when the listing left it out", () => {
        expect(shapeAgent(wire()).email).toBeNull();
        expect(
            shapeAgent(
                wire({
                    user: {
                        name: "Rahul Kumar",
                        mobile: "+919876543210",
                        email: "rahul@adx.in",
                        isActive: true,
                    },
                })
            ).email
        ).toBe("rahul@adx.in");
    });

    /** `User.name` is nullable, and a row created from a bare number has none. */
    it("turns a missing or blank name into null rather than an empty string", () => {
        expect(
            shapeAgent(wire({ user: { name: null, mobile: "+919876543210", isActive: true } })).name
        ).toBeNull();
        expect(
            shapeAgent(wire({ user: { name: "   ", mobile: "+919876543210", isActive: true } })).name
        ).toBeNull();
    });

    /** Rows older than the identifier migration have no AGT- yet. */
    it("keeps a missing identifier null instead of rendering undefined", () => {
        expect(shapeAgent(wire({ displayId: null })).displayId).toBeNull();
    });
});

describe("what to call an agent", () => {
    it("title-cases the tier the backend stores in upper case", () => {
        expect(tierLabel("BRONZE")).toBe("Bronze");
        expect(tierLabel("silver")).toBe("Silver");
        expect(tierLabel("")).toBe("—");
        expect(tierLabel(null)).toBe("—");
    });

    /** DR 05: the rung has a level, and the console prints what the agent sees. */
    it("prints the rung with its level the way the app does — Bronze III", () => {
        expect(tierLabel("BRONZE", "III")).toBe("Bronze III");
        expect(tierLabel("GOLD", "I")).toBe("Gold I");
        // A row older than the level column, or a caller with only the tier, reads as the tier alone.
        expect(tierLabel("SILVER", null)).toBe("Silver");
        expect(tierLabel("SILVER", undefined)).toBe("Silver");
        expect(tierLabel(null, "II")).toBe("—");
    });

    it("carries the level off the wire and reads a row without one as null", () => {
        expect(shapeAgent(wire({ tierLevel: "II" })).tierLevel).toBe("II");
        expect(shapeAgent(wire()).tierLevel).toBeNull();
    });

    it("prefers name and city, then the identifier, then the number", () => {
        expect(
            agentDisplayName({ name: "Rahul Kumar", city: "Bengaluru", displayId: null, mobile: "+91" })
        ).toBe("Rahul Kumar · Bengaluru");
        expect(
            agentDisplayName({ name: "Rahul Kumar", city: null, displayId: null, mobile: "+91" })
        ).toBe("Rahul Kumar");
        expect(
            agentDisplayName({ name: null, city: "Pune", displayId: "AGT-1009-2601", mobile: "+91" })
        ).toBe("AGT-1009-2601");
        expect(
            agentDisplayName({ name: null, city: null, displayId: null, mobile: "+919876543210" })
        ).toBe("+919876543210");
    });
});

describe("D5: the profile's standing and how its preferences read", () => {
    it("folds two facts into one badge — sign-in wins, then whether ops offers them work", () => {
        expect(agentStatus(wire({ status: "ON_LEAVE" }))).toBe("on_leave");
        expect(agentStatus(wire({ status: "SUSPENDED" }))).toBe("suspended");
        expect(agentStatus(wire({ status: "ON_LEAVE", user: { ...wire().user!, isActive: false } }))).toBe("deactivated");
        expect(agentStatus(wire({ status: undefined }))).toBe("active");
    });

    it("reads a row older than the columns as its defaults", () => {
        const agent = shapeAgent(wire());
        expect(agent).toMatchObject({ workingDays: [], orderTypes: [], autoAcceptInZone: false, maxActiveOrders: null, homeZone: null });
    });

    it("prints the days as DR 07 draws them", () => {
        expect(workingDaysLabel(["MON", "TUE", "WED", "THU", "FRI", "SAT"])).toBe("Mon to Sat");
        expect(workingDaysLabel(["FRI", "MON", "WED"])).toBe("Mon, Wed, Fri");
        expect(workingDaysLabel(["SAT", "SUN"])).toBe("Sat, Sun");
        expect(workingDaysLabel([])).toBe("—");
    });

    it("prints the hours as DR 07 draws them", () => {
        expect(clockLabel("09:00")).toBe("9 AM");
        expect(clockLabel("13:30")).toBe("1:30 PM");
        expect(clockLabel("00:15")).toBe("12:15 AM");
        expect(hoursLabel("09:00", "19:00")).toBe("9 AM to 7 PM");
        expect(hoursLabel("09:00", null)).toBe("—");
    });
});

describe("priorityLabel", () => {
    it("names the lane and the share behind it, or says there is too little to judge", () => {
        expect(priorityLabel({ lane: "FAST", offered: 12, declined: 1, declineRate: 1 / 12, windowDays: 30 })).toBe(
            "Fast lane — 8% declined or expired in 30 days"
        );
        expect(priorityLabel({ lane: "SLOWED", offered: 10, declined: 3, declineRate: 0.3, windowDays: 30 })).toBe(
            "Slowed — 30% declined or expired in 30 days"
        );
        expect(priorityLabel({ lane: "FAST", offered: 2, declined: 2, declineRate: null, windowDays: 30 })).toBe(
            "Fast lane — too few offers in 30 days to judge"
        );
    });
});
