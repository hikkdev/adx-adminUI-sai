import { describe, expect, it } from "vitest";

import {
    AGENT_MILESTONE_TYPES,
    AGENT_TIERS,
    LEADERBOARD_PERIODS,
    MILESTONE_TYPE_META,
    TIER_LEVELS,
    cohortMessage,
    isMoneyInput,
    leaderboardPath,
    milestoneChipTone,
    rankOf,
    shapeBoard,
    shapeMilestoneCard,
    shapeTemplate,
    supportLinesBody,
    targetLabel,
    templatePatch,
    unlockLabel,
    windowLabel,
    type LeaderboardView,
    type WireMilestoneCard,
    type WireTemplate,
} from "./growth";

/**
 * DR 05 — the Growth CMS, the ladder and the leaderboard, as the console
 * reads them.
 *
 * What this file pins is the shaping, not a layout: the things the screens
 * get wrong if nobody is watching.
 *
 * 1. A reward is a decimal STRING and stays one. "5000.00" on a template and
 *    "₹5,000.00" on the screen are the same figure; a float in between is a
 *    paisa lost somewhere around a lakh.
 *
 * 2. The three nullable template fields — the window, the start and the
 *    lock — read as null, never as zero, because "counts all time" and
 *    "counts for 0 days" are different sentences.
 *
 * 3. A card's chip comes off the wire. The server decides the label and the
 *    tone; the console only bridges the tone onto one the badge can draw.
 *
 * 4. The leaderboard prints figures for the podium and nobody else, and a
 *    cohort under the floor has no rank for anyone.
 */

const wireTemplate = (over: Partial<WireTemplate> = {}): WireTemplate => ({
    id: "cld_tpl_1",
    type: "ONBOARDING",
    title: "Onboard 10 publishers",
    description: "Bring ten businesses through onboarding.",
    target: 10,
    rewardAmount: "5000.00",
    sortOrder: 1,
    isActive: true,
    windowDays: 30,
    startsAt: null,
    unlockAfter: null,
    createdAt: "2026-09-01T04:30:00.000Z",
    updatedAt: "2026-09-10T04:30:00.000Z",
    ...over,
});

describe("shapeTemplate — money and the three nullables", () => {
    it("keeps the reward as the decimal string the API sent", () => {
        const row = shapeTemplate(wireTemplate({ rewardAmount: "12500.50" }));
        expect(row.rewardAmount).toBe("12500.50");
        expect(typeof row.rewardAmount).toBe("string");
    });

    it("reads a template with no window, no start and no lock as null, not zero", () => {
        const row = shapeTemplate(wireTemplate({ windowDays: null, startsAt: null, unlockAfter: null }));
        expect(row.windowDays).toBeNull();
        expect(row.startsAt).toBeNull();
        expect(row.unlockAfter).toBeNull();
    });

    it("keeps a window, a start and a lock when they are set", () => {
        const row = shapeTemplate(
            wireTemplate({ windowDays: 45, startsAt: "2026-10-01T00:00:00.000Z", unlockAfter: 2 }),
        );
        expect(row.windowDays).toBe(45);
        expect(row.startsAt).toBe("2026-10-01T00:00:00.000Z");
        expect(row.unlockAfter).toBe(2);
    });
});

describe("the four types", () => {
    it("has a label and a one-line explanation of what each type counts", () => {
        expect(AGENT_MILESTONE_TYPES).toEqual(["ONBOARDING", "ACTIVITY", "REVENUE", "QUALITY"]);
        expect(MILESTONE_TYPE_META.ONBOARDING.label).toBe("Onboarding");
        expect(MILESTONE_TYPE_META.ACTIVITY.label).toBe("Activity");
        expect(MILESTONE_TYPE_META.REVENUE.label).toBe("Revenue");
        expect(MILESTONE_TYPE_META.QUALITY.label).toBe("Quality");
        for (const type of AGENT_MILESTONE_TYPES) {
            expect(MILESTONE_TYPE_META[type].counts).toMatch(/\S/);
            expect(MILESTONE_TYPE_META[type].unit).toMatch(/\S/);
        }
    });

    it("says what each type counts against — onboarded accounts, visits and verifications, rupees, on-time arrivals", () => {
        expect(MILESTONE_TYPE_META.ONBOARDING.counts).toMatch(/onboard/i);
        expect(MILESTONE_TYPE_META.ACTIVITY.counts).toMatch(/visit/i);
        expect(MILESTONE_TYPE_META.ACTIVITY.counts).toMatch(/verification/i);
        expect(MILESTONE_TYPE_META.REVENUE.counts).toMatch(/credited/i);
        expect(MILESTONE_TYPE_META.QUALITY.counts).toMatch(/on[- ]time/i);
    });

    it("prints the target with the unit its type counts in", () => {
        expect(targetLabel("ONBOARDING", 10)).toBe("10 accounts");
        expect(targetLabel("ONBOARDING", 1)).toBe("1 account");
        expect(targetLabel("ACTIVITY", 25)).toBe("25 visits & verifications");
        expect(targetLabel("QUALITY", 20)).toBe("20 on-time arrivals");
        // A revenue target is a whole-rupee count, printed as rupees.
        expect(targetLabel("REVENUE", 5000)).toBe("₹5,000 credited");
        expect(targetLabel("SOMETHING_NEW", 3)).toBe("3");
    });
});

describe("the window and the lock", () => {
    it("reads days as a window and null as all time", () => {
        expect(windowLabel(30)).toBe("30 days");
        expect(windowLabel(1)).toBe("1 day");
        expect(windowLabel(null)).toBe("All time");
    });

    it("reads the lock as a count of milestones, and none as a dash", () => {
        expect(unlockLabel(2)).toBe("2 milestones");
        expect(unlockLabel(1)).toBe("1 milestone");
        expect(unlockLabel(0)).toBe("—");
        expect(unlockLabel(null)).toBe("—");
    });
});

describe("templatePatch — what the editor sends", () => {
    const before = shapeTemplate(wireTemplate());
    const draft = () => ({
        title: before.title,
        description: before.description,
        target: before.target,
        rewardAmount: before.rewardAmount,
        sortOrder: before.sortOrder,
        isActive: before.isActive,
        windowDays: before.windowDays,
        startsAt: before.startsAt,
        unlockAfter: before.unlockAfter,
    });

    it("sends only the fields that changed", () => {
        expect(templatePatch(before, { ...draft(), title: "Onboard 12 publishers", target: 12 })).toEqual({
            title: "Onboard 12 publishers",
            target: 12,
        });
    });

    it("sends nothing for an untouched draft, and treats a trailing space as no edit", () => {
        expect(templatePatch(before, draft())).toEqual({});
        expect(templatePatch(before, { ...draft(), title: `${before.title} ` })).toEqual({});
    });

    it("compares the reward in paise, so 5000 over 5000.00 is not a change — and sends a real change as a string", () => {
        expect(templatePatch(before, { ...draft(), rewardAmount: "5000" })).toEqual({});
        const patch = templatePatch(before, { ...draft(), rewardAmount: "7500.50" });
        expect(patch).toEqual({ rewardAmount: "7500.50" });
        expect(typeof patch.rewardAmount).toBe("string");
    });

    it("does not call a start an edit when only the seconds differ — the input cannot carry them", () => {
        const stored = shapeTemplate(wireTemplate({ startsAt: "2026-10-01T04:30:45.000Z" }));
        expect(templatePatch(stored, { ...draft(), startsAt: "2026-10-01T04:30:00.000Z" })).toEqual({});
        expect(templatePatch(stored, { ...draft(), startsAt: "2026-10-01T04:31:00.000Z" })).toEqual({
            startsAt: "2026-10-01T04:31:00.000Z",
        });
    });

    it("sends null to clear the window, the start or the lock", () => {
        expect(templatePatch(before, { ...draft(), windowDays: null })).toEqual({ windowDays: null });
        const locked = shapeTemplate(wireTemplate({ unlockAfter: 2, startsAt: "2026-10-01T00:00:00.000Z" }));
        expect(
            templatePatch(locked, { ...draft(), unlockAfter: null, startsAt: null }),
        ).toEqual({ unlockAfter: null, startsAt: null });
    });
});

describe("a reward typed at the desk", () => {
    it("accepts exactly what the schema accepts: digits, optionally two places", () => {
        expect(isMoneyInput("5000")).toBe(true);
        expect(isMoneyInput("5000.5")).toBe(true);
        expect(isMoneyInput("5000.00")).toBe(true);
        expect(isMoneyInput("0")).toBe(true);
        expect(isMoneyInput("")).toBe(false);
        expect(isMoneyInput("5,000")).toBe(false);
        expect(isMoneyInput("₹5000")).toBe(false);
        expect(isMoneyInput("5000.123")).toBe(false);
        expect(isMoneyInput("-5")).toBe(false);
    });
});

const wireCard = (over: Partial<WireMilestoneCard> = {}): WireMilestoneCard => ({
    id: "cld_ms_1",
    templateId: "cld_tpl_1",
    type: "REVENUE",
    title: "Earn ₹5,000",
    description: "Credited incentives.",
    target: 5000,
    progress: 1250,
    progressAmount: "1250.75",
    pct: 25,
    reward: "1000.00",
    state: "ACTIVE",
    chip: { label: "In progress", tone: "new" },
    timing: "Due in 10 days",
    startsAt: null,
    deadline: "2026-09-21T04:30:00.000Z",
    deadlineLabel: "21st SEP",
    completedAt: null,
    claimedAt: null,
    claimable: false,
    link: "EARNINGS",
    ...over,
});

describe("shapeMilestoneCard — the board's card", () => {
    it("keeps the reward and the revenue progress as the decimal strings the API sent", () => {
        const card = shapeMilestoneCard(wireCard());
        expect(card.reward).toBe("1000.00");
        expect(card.progressAmount).toBe("1250.75");
        expect(typeof card.reward).toBe("string");
    });

    it("leaves a non-revenue card's amount null rather than filling it", () => {
        expect(shapeMilestoneCard(wireCard({ type: "ONBOARDING", progressAmount: null })).progressAmount).toBeNull();
    });

    it("carries the chip's label through and bridges the tone onto one the badge can draw", () => {
        const card = shapeMilestoneCard(wireCard());
        expect(card.chip.label).toBe("In progress");
        expect(card.chip.tone).toBe("info");
    });

    it("bridges each of the API's tone words onto one of the console's five", () => {
        expect(milestoneChipTone("new")).toBe("info");
        expect(milestoneChipTone("live")).toBe("success");
        expect(milestoneChipTone("warn")).toBe("warning");
        expect(milestoneChipTone("neutral")).toBe("neutral");
        expect(milestoneChipTone("something-new")).toBe("neutral");
    });

    it("shapes a whole board, and reads a missing count as zero rather than undefined", () => {
        const board = shapeBoard({
            tier: "BRONZE",
            milestones: [wireCard(), wireCard({ id: "cld_ms_2", state: "CLAIMED", chip: { label: "Claimed", tone: "live" } })],
            claimable: null,
            active: wireCard(),
            counts: { ALL: 2, ACTIVE: 1, COMPLETED: 1 } as never,
        });
        expect(board.milestones).toHaveLength(2);
        expect(board.milestones[1].chip.tone).toBe("success");
        expect(board.active?.id).toBe("cld_ms_1");
        expect(board.claimable).toBeNull();
        expect(board.counts.UPCOMING).toBe(0);
        expect(board.counts.ALL).toBe(2);
    });
});

describe("the ladder", () => {
    it("names the four tiers and three levels the ladder climbs", () => {
        expect(AGENT_TIERS).toEqual(["BRONZE", "SILVER", "GOLD", "PLATINUM"]);
        expect(TIER_LEVELS).toEqual(["I", "II", "III"]);
    });

    it("sends a blank support line as null so the server clears it, and a typed one trimmed", () => {
        expect(
            supportLinesBody({ BRONZE: "", SILVER: "  +91 80 4000 1000 ", GOLD: "", PLATINUM: "+91 80 4000 2000" }),
        ).toEqual({ BRONZE: null, SILVER: "+91 80 4000 1000", GOLD: null, PLATINUM: "+91 80 4000 2000" });
    });
});

const board = (over: Partial<LeaderboardView> = {}): LeaderboardView => ({
    period: "WEEK",
    cohort: { city: "Bengaluru", size: 14, minimum: 10, enough: true },
    me: null,
    top: [
        { rank: 1, agentId: "a1", name: "Asha", locality: "Jayanagar", you: false, earnings: "12000.00" },
        { rank: 2, agentId: "a2", name: "Bala", locality: null, you: false, earnings: "9000.00" },
        { rank: 3, agentId: "a3", name: "Charu", locality: "Indiranagar", you: false, earnings: "8500.00" },
    ],
    window: [
        { rank: 4, agentId: "a4", name: "Dev", locality: null, you: false },
        { rank: 5, agentId: "a5", name: "Esha", locality: "HSR", you: false },
    ],
    around: [],
    prize: null,
    ...over,
});

describe("the leaderboard", () => {
    it("asks for the city and the period exactly as the schema parses them", () => {
        expect(leaderboardPath("Bengaluru", "WEEK")).toBe("/agents/leaderboard?city=Bengaluru&period=WEEK");
        // Encoded, so a city with a space survives the trip.
        expect(leaderboardPath("New Delhi", "MONTH")).toBe("/agents/leaderboard?city=New+Delhi&period=MONTH");
    });

    it("knows the three periods", () => {
        expect(LEADERBOARD_PERIODS).toEqual(["WEEK", "MONTH", "ALL"]);
    });

    it("finds an agent's rank on the podium or below it, and has none for an agent who is not ranked", () => {
        expect(rankOf(board(), "a2")).toBe(2);
        expect(rankOf(board(), "a5")).toBe(5);
        expect(rankOf(board(), "nobody")).toBeNull();
    });

    it("has no rank for anyone while the cohort is under the floor", () => {
        const small = board({ cohort: { city: "Pune", size: 4, minimum: 10, enough: false }, top: [], window: [] });
        expect(rankOf(small, "a1")).toBeNull();
    });

    it("keeps the podium's earnings as decimal strings, and sends no figure below it", () => {
        const view = board();
        expect(typeof view.top[0].earnings).toBe("string");
        expect(view.window[0]).not.toHaveProperty("earnings");
    });

    it("says honestly why there is no board, with the size and the floor", () => {
        expect(cohortMessage({ city: "Pune", size: 4, minimum: 10, enough: false })).toBe(
            "Not enough agents in Pune for a board yet — 4 on the roster, 10 needed.",
        );
        expect(cohortMessage({ city: "Pune", size: 1, minimum: 10, enough: false })).toBe(
            "Not enough agents in Pune for a board yet — 1 on the roster, 10 needed.",
        );
    });
});
