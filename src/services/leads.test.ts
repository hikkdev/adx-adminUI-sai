import { describe, expect, it } from "vitest";

import {
    LEAD_STATUSES,
    MAX_LIST_PAGE_SIZE,
    assignedLabel,
    listPageSize,
    callEvidenceLine,
    qaEvidenceLine,
    qualityHint,
    qualityLabel,
    recycledFlag,
    visitEvidenceLine,
    isUnassigned,
    leadStatusLabel,
    pillTone,
    shapeLead,
    whereLabel,
    type LeadStatus,
    type WireLead,
    temperatureMeta,
    pointsLabel,
    LEAD_STAGES,
    LEAD_LOST_REASONS,
    STAGE_META,
    LOST_REASON_META,
    stageRank,
    isOpenStage,
    deskMayMove,
    daysInStage,
    channelLabel,
    rateLabel,
    bboxParam,
    zoneState,
    zoneBudgetUsed,
    ringCentre,
    OUTREACH_CHANNELS,
    SEQUENCE_CHANNELS,
    MANUAL_CHANNELS,
    messagePreview,
    messageTone,
    runLine,
    delayLabel,
    reachableState,
    inboxChips,
    replyRate,
    parseCallerIds,
    type ChannelState,
    type LeadMessage,
    proposalLine,
    proposalState,
    proposalKindsFor,
    openedAgo,
    landingBlocks,
    INVITE_STATE_META,
    type LandingPayload,
    type LeadProposal,
} from "./leads";
import { proposalDraftProblem, proposalInputFrom } from "@/app/(admin)/leads/[id]/lead-invite";
import { stepsProblem } from "@/app/(admin)/leads/sequences/sequence-dialog";
import { stepsLine, unconfiguredChannels } from "@/app/(admin)/leads/sequences/sequences-view";
import { lastCallLine } from "@/app/(admin)/leads/tele-queue/tele-queue-view";
import { ratePct } from "@/app/(admin)/leads/funnel/channel-funnel";
import { cardState, parseTemplateLines, templateLines } from "@/app/(admin)/settings/integrations/channels-section";
import { channelsSummary } from "@/app/(admin)/leads/[id]/lead-conversation";
import type { LeadScoringPolicy } from "./settings";
import { fromDraft, fromHuntDraft } from "@/app/(admin)/settings/leads-scoring/leads-scoring-view";
import { clusterTone, heatCells, pinTone } from "@/app/(admin)/leads/map/map-view";
import { totalSpent } from "@/app/(admin)/leads/priority-zones/zones-view";

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

/* LH1 (the Lead Hunt): the temperature and the score, as the desk prints them. */
describe("LH1: temperature and the score", () => {
    it("prints a temperature's meta, and a placeholder for a lead not yet scored", () => {
        expect(temperatureMeta("HOT")).toMatchObject({ label: "Hot", tone: "danger" });
        expect(temperatureMeta("WARM")).toMatchObject({ label: "Warm", tone: "warning" });
        expect(temperatureMeta("COLD")).toMatchObject({ label: "Cold", tone: "neutral" });
        expect(temperatureMeta(null)).toMatchObject({ label: "Unscored" });
        expect(temperatureMeta(undefined)).toMatchObject({ label: "Unscored" });
    });

    it("prints a signal's points with a sign, and a true minus", () => {
        expect(pointsLabel(22)).toBe("+22");
        expect(pointsLabel(-5)).toBe("−5");
        expect(pointsLabel(0)).toBe("0");
    });

    it("keeps the score fields the wire sends, and survives an older server that sends none", () => {
        const scored = shapeLead(wire({ score: 79, temperature: "HOT", estimatedValue: "43500.00", scoreReasons: [{ signal: "FIT", points: 22, note: "Gym" }] } as never));
        expect(scored.score).toBe(79);
        expect(scored.temperature).toBe("HOT");
        expect(scored.scoreReasons).toHaveLength(1);
        const older = shapeLead(wire());
        expect(older.score).toBeUndefined();
        expect(temperatureMeta(older.temperature).label).toBe("Unscored");
    });

    it("Settings › Leads scoring reads the defaults back whole and refuses warm at or above hot", () => {
        const policy: LeadScoringPolicy = {
            weights: { fitMax: 30, intentMax: 35, recencyMin: -25, sourceMax: 15, agentFlag: 10 },
            recency: { afterDays7: -5, afterDays21: -15, afterDays45: -25 },
            thresholds: { hot: 70, warm: 40 },
            agentFlagDays: 14,
            intent: { CALLED: 5, LINK_OPENED: 10 },
            fit: { defaultCategory: 12, categoryBySide: { PUBLISHER: { gym: 22 }, ADVERTISER: { clinic: 22 } }, importanceBonus: { KEY: 4, ENTERPRISE: 8 }, localityBonus: 6, localityRadiusM: 1000 },
        };
        const draft = {
            fitMax: "30", intentMax: "35", recencyMin: "-25", sourceMax: "15", agentFlag: "10",
            afterDays7: "-5", afterDays21: "-15", afterDays45: "-25", hot: "70", warm: "40", agentFlagDays: "14",
            intent: { CALLED: "5", LINK_OPENED: "10" }, defaultCategory: "12",
            publisherCategories: [{ key: "Gym", points: "22" }], advertiserCategories: [{ key: "clinic", points: "22" }],
            keyBonus: "4", enterpriseBonus: "8", localityBonus: "6", localityRadiusM: "1000",
        };
        expect(fromDraft(draft)).toEqual(policy);
        expect(fromDraft({ ...draft, warm: "70" })).toBeNull();
        expect(fromDraft({ ...draft, recencyMin: "5" })).toBeNull();
        expect(fromDraft({ ...draft, afterDays7: "−5" })?.recency.afterDays7).toBe(-5); // a typed true minus is read
        expect(fromDraft({ ...draft, publisherCategories: [{ key: "Gym", points: "22" }, { key: "gym", points: "10" }] })).toBeNull(); // a category twice
        expect(fromDraft({ ...draft, publisherCategories: [{ key: "", points: "22" }] })).toBeNull();
    });
});

/* LH2 (the Lead Hunt): the stages, the desk's moves, the loss reasons, the funnel's labels. */
describe("LH2: stages", () => {
    it("orders the twelve stages and knows which are open and won", () => {
        expect(LEAD_STAGES).toHaveLength(12);
        expect(stageRank("SOURCED")).toBe(0);
        expect(stageRank("LOST")).toBe(11);
        expect(isOpenStage("PROPOSED")).toBe(true);
        expect(isOpenStage("CONVERTED")).toBe(false);
        for (const stage of LEAD_STAGES) expect(STAGE_META[stage].label).toMatch(/\S/);
    });

    it("offers the desk only the moves the server will land", () => {
        expect(deskMayMove("SCORED", "CLAIMED")).toBe(true);
        expect(deskMayMove("CLAIMED", "SCORED")).toBe(false);
        expect(deskMayMove("PROPOSED", "CONVERTED")).toBe(false);
        expect(deskMayMove("ONBOARDING", "ACTIVATED")).toBe(false);
        expect(deskMayMove("CONVERTED", "ONBOARDING")).toBe(true);
        expect(deskMayMove("SCORED", "ONBOARDING")).toBe(false);
        expect(deskMayMove("ENGAGED", "LOST")).toBe(true);
        expect(deskMayMove("ACTIVATED", "LOST")).toBe(false);
        expect(deskMayMove("LOST", "SCORED")).toBe(true);
        expect(deskMayMove("LOST", "ENGAGED")).toBe(false);
        expect(deskMayMove("ENGAGED", "ENGAGED")).toBe(false);
    });

    it("names every loss reason with what happens next, and counts days in stage", () => {
        for (const reason of LEAD_LOST_REASONS) expect(LOST_REASON_META[reason].hint).toMatch(/\S/);
        expect(LOST_REASON_META.PRICE.hint).toContain("60 days");
        expect(LOST_REASON_META.WRONG_CONTACT.hint).toContain("sourcing");
        const now = new Date("2026-09-22T09:00:00.000Z");
        expect(daysInStage("2026-09-19T09:00:00.000Z", now)).toBe(3);
        expect(daysInStage("2026-09-22T08:00:00.000Z", now)).toBe(0);
        expect(daysInStage(null, now)).toBeNull();
        expect(channelLabel("WHATSAPP")).toBe("WhatsApp");
        expect(channelLabel("CARRIER_PIGEON")).toBe("CARRIER_PIGEON");
        expect(rateLabel(3, 12)).toBe("25 %");
        expect(rateLabel(0, 0)).toBe("—");
    });
});

/* LH5 (the Lead Hunt): the map's vocabulary — the viewport param, a zone's state and meter, the pin and cluster colours, the heat, the hunt settings. */
describe("LH5: the hunting map", () => {
    const now = new Date("2026-09-22T09:00:00.000Z");

    it("spells the viewport the way the server parses it, five decimals, south first", () => {
        expect(bboxParam({ south: 12.925, west: 77.615, north: 12.945, east: 77.635 })).toBe("12.92500,77.61500,12.94500,77.63500");
    });

    it("names where a zone stands and how much of its budget has gone", () => {
        const zone = { startsAt: "2026-09-20T00:00:00.000Z", endsAt: "2026-09-30T00:00:00.000Z", isActive: true };
        expect(zoneState(zone, now)).toMatchObject({ state: "LIVE", tone: "success" });
        expect(zoneState({ ...zone, startsAt: "2026-09-25T00:00:00.000Z" }, now).state).toBe("SCHEDULED");
        expect(zoneState({ ...zone, endsAt: "2026-09-21T00:00:00.000Z" }, now).state).toBe("ENDED");
        expect(zoneState({ ...zone, isActive: false }, now).state).toBe("OFF");
        expect(zoneBudgetUsed({ spent: "250.00", budgetCap: "1000.00" })).toBe(0.25);
        expect(zoneBudgetUsed({ spent: "1500.00", budgetCap: "1000.00" })).toBe(1);
        expect(zoneBudgetUsed({ spent: "250.00", budgetCap: null })).toBeNull();
        expect(totalSpent([{ spent: "250.00" }, { spent: "0.50" }, { spent: "1000.00" }])).toBe("1250.50");
        expect(totalSpent([])).toBe("0.00");
    });

    it("finds a ring's centre in latitude / longitude from GeoJSON order", () => {
        expect(ringCentre([[77.6, 12.9], [77.7, 12.9], [77.7, 13.0], [77.6, 13.0]])).toEqual({ latitude: 12.95, longitude: 77.65 });
        expect(ringCentre([])).toBeNull();
    });

    it("colours a pin by temperature, blue when held, and a cluster by its majority", () => {
        expect(pinTone({ temperature: "HOT", claim: null })).toBe("danger");
        expect(pinTone({ temperature: "WARM", claim: null })).toBe("warning");
        expect(pinTone({ temperature: "COLD", claim: null })).toBe("neutral");
        expect(pinTone({ temperature: null, claim: null })).toBe("neutral");
        expect(pinTone({ temperature: "HOT", claim: { agentId: "agt_1", mine: false, expiresAt: null } })).toBe("info");
        expect(clusterTone({ hot: 3, warm: 2, cold: 1 })).toBe("danger");
        expect(clusterTone({ hot: 1, warm: 2, cold: 1 })).toBe("warning");
        expect(clusterTone({ hot: 0, warm: 0, cold: 4 })).toBe("neutral");
    });

    it("scales the heat against its warmest cell and drops the cold ones", () => {
        const cells = heatCells({ cellDeg: 0.01, cells: [{ latitude: 12.9, longitude: 77.6, supply: 1, demand: 5, gap: 4, weight: 4 }, { latitude: 12.91, longitude: 77.6, supply: 2, demand: 2, gap: 0, weight: 2 }, { latitude: 12.92, longitude: 77.6, supply: 3, demand: 0, gap: -3, weight: 0 }] });
        expect(cells).toHaveLength(2);
        expect(cells[0]).toMatchObject({ sizeDeg: 0.01, weight: 1, title: "5 demand · 1 supply" });
        expect(cells[1]!.weight).toBe(0.5);
        expect(heatCells(null)).toEqual([]);
    });

    it("reads the hunt settings back from the form: blank caps are unlimited, a bad number is refused", () => {
        const draft = { holdHours: "72", bronze: "10", silver: "20", gold: "40", platinum: "", cooldownDays: "7", referralCredit: "250", topUp: "200", monthlyCap: "25000" };
        expect(fromHuntDraft(draft)).toEqual({ claims: { holdHours: 72, caps: { BRONZE: 10, SILVER: 20, GOLD: 40, PLATINUM: null }, cooldownDays: 7 }, referralCredit: 250, priority: { topUp: 200, monthlyCap: 25000 } });
        expect(fromHuntDraft({ ...draft, holdHours: "0" })).toBeNull();
        expect(fromHuntDraft({ ...draft, bronze: "x" })).toBeNull();
        expect(fromHuntDraft({ ...draft, referralCredit: "" })?.referralCredit).toBeNull();
        expect(fromHuntDraft({ ...draft, topUp: "-1" })).toBeNull();
    });
});

/* LH6 (the Lead Hunt): the outreach hub's vocabulary — channels, messages, the sequence line, the queues, the cards. */
describe("LH6: the outreach hub", () => {
    const now = new Date("2026-09-22T09:00:00.000Z");
    const message = (over: Partial<LeadMessage> = {}): LeadMessage => ({
        id: "msg_1",
        conversationId: "conv_1",
        leadId: "lead_1",
        direction: "OUTBOUND",
        channel: "SMS",
        templateKey: null,
        body: "Hi Ravi,   Asha from ADX.\nCall me?",
        providerId: null,
        status: "SENT",
        error: null,
        scheduledFor: null,
        sequenceRunId: null,
        maskedNumber: null,
        providerCallId: null,
        outcome: null,
        durationSec: null,
        consentPlayed: null,
        recordingFileId: null,
        recordingUrl: null,
        at: "2026-09-22T08:00:00.000Z",
        byAgentId: null,
        byUserId: null,
        ...over,
    });

    it("names the ten channels once, and which of them a sequence may use or a hand may log", () => {
        expect(OUTREACH_CHANNELS).toHaveLength(10);
        expect(OUTREACH_CHANNELS).not.toContain("LINK");
        expect(SEQUENCE_CHANNELS).toContain("CALL");
        expect(SEQUENCE_CHANNELS).not.toContain("LINKEDIN");
        expect(MANUAL_CHANNELS).toEqual(["LINKEDIN", "IN_PERSON", "OTHER"]);
    });

    it("cuts a message for a row and reads a call by its outcome", () => {
        expect(messagePreview(message())).toBe("Hi Ravi, Asha from ADX. Call me?");
        expect(messagePreview(message({ body: "x".repeat(120) }), 20)).toBe(`${"x".repeat(19)}…`);
        expect(messagePreview(message({ channel: "CALL", outcome: "ANSWERED", durationSec: 61, body: "Call placed" }))).toBe("Answered · 61 s");
        expect(messagePreview(message({ channel: "CALL", outcome: "NO_ANSWER", body: "Call placed" }))).toBe("No answer");
    });

    it("tones a message by its status", () => {
        expect(messageTone("FAILED")).toBe("danger");
        expect(messageTone("SKIPPED")).toBe("warning");
        expect(messageTone("QUEUED")).toBe("info");
        expect(messageTone("READ")).toBe("success");
        expect(messageTone("SENT")).toBe("neutral");
        expect(messageTone("RECEIVED")).toBe("neutral");
    });

    it("writes the sequence line — the step, its channel and when", () => {
        const run = { id: "run_1", sequenceId: "seq_1", sequenceName: "Publisher · warm", stepIndex: 1, steps: 4, nextStep: { channel: "WHATSAPP" as const, delayHours: 48, templateKey: "k" }, nextAt: "2026-09-22T12:00:00.000Z", startedAt: "2026-09-22T08:00:00.000Z", stoppedAt: null, stopReason: null };
        expect(runLine(run, now)).toBe("Publisher · warm · step 2 of 4 · WhatsApp in 3 h");
        expect(runLine({ ...run, nextAt: "2026-09-22T09:20:00.000Z" }, now)).toBe("Publisher · warm · step 2 of 4 · WhatsApp within the hour");
        expect(runLine({ ...run, nextAt: "2026-09-20T09:00:00.000Z" }, now)).toBe("Publisher · warm · step 2 of 4 · WhatsApp due now");
        expect(runLine({ ...run, nextAt: "2026-09-26T09:00:00.000Z" }, now)).toBe("Publisher · warm · step 2 of 4 · WhatsApp in 4 d");
        expect(runLine({ ...run, stoppedAt: "2026-09-22T08:30:00.000Z", stopReason: "REPLIED" }, now)).toBe("Publisher · warm · stopped (replied)");
        expect(runLine({ ...run, stoppedAt: "2026-09-22T08:30:00.000Z", stopReason: null }, now)).toBe("Publisher · warm · stopped (by hand)");
        expect(runLine({ ...run, nextStep: null }, now)).toBe("Publisher · warm · finishing");
        expect(runLine(null, now)).toBeNull();
    });

    it("labels a delay in hours or days", () => {
        expect(delayLabel(0)).toBe("at once");
        expect(delayLabel(2)).toBe("2 h");
        expect(delayLabel(48)).toBe("2 d");
        expect(delayLabel(50)).toBe("50 h");
        expect(delayLabel(168)).toBe("7 d");
    });

    it("offers only a reachable channel, chips only the channels with inbound, and rates replies over sends", () => {
        const channels: ChannelState[] = [
            { channel: "SMS", configured: true, provider: "msg91", reachable: true, reason: null, mode: "FREEFORM", windowClosesAt: null, address: "+91 •••10" },
            { channel: "WHATSAPP", configured: false, provider: null, reachable: false, reason: "not set up", mode: null, windowClosesAt: null, address: null },
        ];
        expect(reachableState(channels, "SMS")?.mode).toBe("FREEFORM");
        expect(reachableState(channels, "WHATSAPP")).toBeNull();
        expect(reachableState(channels, "EMAIL")).toBeNull();
        expect(inboxChips({ WHATSAPP: 3, CALL: 1, SMS: 0 })).toEqual([
            { value: "CALL", label: "Call · 1" },
            { value: "WHATSAPP", label: "WhatsApp · 3" },
        ]);
        expect(replyRate({ outbound: 20, replies: 5 })).toBe(0.25);
        expect(replyRate({ outbound: 0, replies: 0 })).toBeNull();
        expect(ratePct(0.25)).toBe("25 %");
        expect(ratePct(null)).toBe("—");
    });

    it("reads the masked numbers off one line", () => {
        expect(parseCallerIds("+91 80000 00000, +91 80000 00001; +91 80000 00000\n12")).toEqual(["+91 80000 00000", "+91 80000 00001"]);
        expect(parseCallerIds("")).toEqual([]);
    });

    it("refuses a sequence with no steps or a step without a template, but lets a call go bare", () => {
        expect(stepsProblem([])).toBe("Add at least one step.");
        expect(stepsProblem([{ channel: "CALL", delayHours: 0, templateKey: null }])).toBeNull();
        expect(stepsProblem([{ channel: "CALL", delayHours: 0, templateKey: null }, { channel: "SMS", delayHours: 24, templateKey: " " }])).toBe("Step 2 (SMS) needs a template key.");
        expect(stepsProblem([{ channel: "EMAIL", delayHours: 1, templateKey: "lead-seq-publisher-intro" }])).toBeNull();
    });

    it("writes a sequence's steps on one line and flags the channels with no card", () => {
        const sequence = { steps: [{ channel: "CALL" as const, delayHours: 0, templateKey: null }, { channel: "WHATSAPP" as const, delayHours: 2, templateKey: "a" }, { channel: "SMS" as const, delayHours: 24, templateKey: "b" }, { channel: "LINKEDIN" as const, delayHours: 1, templateKey: "c" }] };
        expect(stepsLine(sequence)).toBe("Call at once → WhatsApp 2 h → SMS 24 h → LinkedIn 1 h");
        const states = Object.fromEntries(OUTREACH_CHANNELS.map((c) => [c, { configured: c === "SMS", provider: null, missing: [] as string[] }])) as unknown as Record<(typeof OUTREACH_CHANNELS)[number], { configured: boolean; provider: string | null; missing: string[] }>;
        expect(unconfiguredChannels(sequence, states)).toEqual(["WHATSAPP"]);
        expect(unconfiguredChannels(sequence, null)).toEqual([]);
    });

    it("says how the last call went on the tele queue", () => {
        expect(lastCallLine({ lastCall: null, attempts: 0 })).toBe("Never called");
        expect(lastCallLine({ lastCall: null, attempts: 2 })).toBe("2 tries");
        expect(lastCallLine({ lastCall: message({ channel: "CALL", outcome: "BUSY", at: "2026-09-22T08:00:00.000Z" }), attempts: 3 })).toMatch(/^Busy · .* · 3 tries$/);
        expect(lastCallLine({ lastCall: message({ channel: "CALL", outcome: null }), attempts: 1 })).toMatch(/^Placed · /);
    });

    it("reads a card's state and the WhatsApp template lines both ways", () => {
        expect(cardState({ configured: true, missing: [] })).toEqual({ label: "Configured", tone: "success", missing: "" });
        expect(cardState({ configured: false, missing: ["bsp", "apiKey"] })).toEqual({ label: "Not configured", tone: "neutral", missing: "bsp, apiKey missing" });
        const parsed = parseTemplateLines("lead-seq-publisher-intro = lead_intro | en | contactName, agentName\nnudge = lead_nudge\nbroken line\n= nothing");
        expect(parsed).toEqual({ "lead-seq-publisher-intro": { name: "lead_intro", language: "en", params: ["contactName", "agentName"] }, nudge: { name: "lead_nudge" } });
        expect(templateLines(parsed)).toBe("lead-seq-publisher-intro = lead_intro | en | contactName,agentName\nnudge = lead_nudge");
        expect(parseTemplateLines(templateLines(parsed))).toEqual(parsed);
    });

    it("sums the channels set up for the lead page's line", () => {
        const state = (channel: ChannelState["channel"], configured: boolean): ChannelState => ({ channel, configured, provider: null, reachable: configured, reason: null, mode: null, windowClosesAt: null, address: null });
        expect(channelsSummary([state("SMS", true), state("WHATSAPP", false), state("LINKEDIN", true)])).toBe("Set up: SMS");
        expect(channelsSummary([state("WHATSAPP", false), state("IN_PERSON", true)])).toBe("No channel is set up yet — see Settings › Integrations › Channels.");
    });
});

/* LH7 (the Lead Hunt): the invite link, the proposals and the landing's blocks. */
describe("LH7: the invite and the proposals", () => {
    const now = new Date("2026-09-22T09:00:00.000Z");
    const proposal = (over: Partial<LeadProposal> = {}): LeadProposal => ({
        id: "prop_1",
        kind: "RATE_ESTIMATE",
        payload: { perDay: "450.00", perMonth: "13500.00", comparables: 4, radiusM: 200, overridden: false },
        note: null,
        sentAt: "2026-09-22T08:00:00.000Z",
        openedAt: null,
        acceptedAt: null,
        ...over,
    });

    it("writes a proposal's line for each kind and says where it stands", () => {
        expect(proposalLine(proposal())).toBe("₹450.00/day · ₹13,500.00/month from 4 comparables within 200 m");
        expect(proposalLine(proposal({ payload: { perDay: "600.00", perMonth: "18000.00", comparables: 0, radiusM: 2000, overridden: true } }))).toBe("₹600.00/day · ₹18,000.00/month (your figure)");
        expect(proposalLine(proposal({ kind: "CAMPAIGN_ESTIMATE", payload: { spots: 5, days: 14, perSpotPerDay: "450.00", amount: "31500.00", comparables: 3, radiusM: 200, overridden: false } }))).toBe("5 spots × 14 days at ₹450.00 = ₹31,500.00");
        expect(proposalLine(proposal({ kind: "PACKAGE_QUOTE", payload: { tier: "GROWTH", name: "Growth", cycle: "ANNUAL", months: 12, perMonth: "4999.00", total: "53989.20", addOns: [{ code: "BOOST", name: "Boost", pricePerMonth: "999.00" }] } }))).toBe("Growth · annual · ₹4,999.00/month · ₹53,989.20 in all · Boost");
        expect(proposalState(proposal())).toEqual({ label: "Sent", tone: "neutral" });
        expect(proposalState(proposal({ openedAt: "2026-09-22T09:00:00.000Z" }))).toEqual({ label: "Opened", tone: "info" });
        expect(proposalState(proposal({ acceptedAt: "2026-09-22T09:00:00.000Z" }))).toEqual({ label: "Accepted", tone: "success" });
        expect(proposalKindsFor("PUBLISHER")).toEqual(["RATE_ESTIMATE"]);
        expect(proposalKindsFor("ADVERTISER")).toEqual(["CAMPAIGN_ESTIMATE", "PACKAGE_QUOTE"]);
    });

    it("says when the link was last opened, and names each state", () => {
        expect(openedAgo("2026-09-22T07:00:00.000Z", now)).toBe("opened 2 h ago");
        expect(openedAgo("2026-09-22T08:55:00.000Z", now)).toBe("opened 5 min ago");
        expect(openedAgo("2026-09-19T09:00:00.000Z", now)).toBe("opened 3 d ago");
        expect(openedAgo(null, now)).toBeNull();
        expect(INVITE_STATE_META.LIVE.tone).toBe("success");
        expect(INVITE_STATE_META.REVOKED.label).toBe("Replaced");
    });

    it("refuses a bad draft and shapes the request per kind", () => {
        const base = { kind: "RATE_ESTIMATE" as const, perDay: "", spots: "3", days: "30", perSpotPerDay: "", tier: "", cycle: "MONTHLY" as const, note: " Corner wall " };
        expect(proposalDraftProblem(base)).toBeNull();
        expect(proposalDraftProblem({ ...base, perDay: "abc" })).toBe("The rate is rupees per day, digits only.");
        expect(proposalInputFrom(base)).toEqual({ kind: "RATE_ESTIMATE", note: "Corner wall" });
        expect(proposalInputFrom({ ...base, perDay: "600", note: "" })).toEqual({ kind: "RATE_ESTIMATE", perDay: "600" });
        expect(proposalDraftProblem({ ...base, kind: "CAMPAIGN_ESTIMATE", spots: "0" })).toBe("Spots: 1 to 200.");
        expect(proposalInputFrom({ ...base, kind: "CAMPAIGN_ESTIMATE", spots: "5", days: "14", perSpotPerDay: "450", note: "" })).toEqual({ kind: "CAMPAIGN_ESTIMATE", spots: 5, days: 14, perSpotPerDay: "450" });
        expect(proposalDraftProblem({ ...base, kind: "PACKAGE_QUOTE" })).toBe("Name the package tier.");
        expect(proposalInputFrom({ ...base, kind: "PACKAGE_QUOTE", tier: "growth", cycle: "ANNUAL", note: "" })).toEqual({ kind: "PACKAGE_QUOTE", tier: "GROWTH", cycle: "ANNUAL" });
    });

    it("draws the landing's blocks in the copy's order, skipping the ones with nothing to say", () => {
        const copy = { headline: "h", line: null, bullets: [], cta: "Go", blocks: [{ key: "RATE_ESTIMATE", label: "What spaces like yours earn" }, { key: "NEARBY_CAMPAIGNS", label: "Brands nearby" }, { key: "PROPOSALS", label: "Your estimate" }] };
        const publisher: Pick<LandingPayload, "copy" | "hook" | "proposals"> = { copy, hook: { side: "PUBLISHER", rateEstimate: { perDay: "450.00", perMonth: "13500.00", comparables: 4, radiusM: 200 }, nearbyCampaigns: 0 }, proposals: [proposal()] };
        const blocks = landingBlocks(publisher);
        expect(blocks.map((b) => b.key)).toEqual(["RATE_ESTIMATE", "PROPOSALS"]);
        expect(blocks[0]!.lines[0]).toBe("₹450.00 a day · about ₹13,500.00 a month");
        expect(blocks[1]!.lines[0]).toMatch(/^Rate estimate: ₹450\.00\/day/);
        const advertiser: Pick<LandingPayload, "copy" | "hook" | "proposals"> = {
            copy: { ...copy, blocks: [{ key: "NEARBY_SPOTS", label: "Spots near you" }, { key: "SAMPLE_ESTIMATE", label: "A sample" }, { key: "PACKAGES", label: "Packages" }] },
            hook: { side: "ADVERTISER", nearbySpots: 12, sampleEstimate: { spots: 3, days: 30, perSpotPerDay: "450.00", amount: "40500.00" }, packages: [{ tier: "GROWTH", name: "Growth", pricePerMonth: "4999.00", description: null, isPopular: true }] },
            proposals: [],
        };
        expect(landingBlocks(advertiser).map((b) => b.lines[0])).toEqual(["12 spots live within 2 km", "3 spots for 30 days ≈ ₹40,500.00", "Growth · ₹4,999.00/month · popular"]);
        expect(landingBlocks({ ...advertiser, hook: { side: "ADVERTISER", nearbySpots: 0, sampleEstimate: null, packages: [] } })).toEqual([]);
    });
});

describe("LH10 and LH11: integrity, quality and the recycle", () => {
    it("words what a visit's and a call's evidence says", () => {
        expect(visitEvidenceLine({ photo: true, gps: true, metres: 16, site: true })).toBe("Photo · fix 16 m from the site");
        expect(visitEvidenceLine({ photo: false, gps: true, metres: null, site: false })).toBe("No photo · fix taken, the site has no coordinates");
        expect(visitEvidenceLine({ photo: true, gps: false })).toBe("Photo · no fix");
        expect(callEvidenceLine({ recording: true, consent: false, durationSec: 95, outcome: "ANSWERED" })).toBe("Recorded with NO consent line · 95 s · answered");
        expect(callEvidenceLine({ recording: false, durationSec: 4, outcome: "NO_ANSWER" })).toBe("Not recorded · 4 s · no answer");
        // A call sample reads the call's words, a visit's the visit's.
        expect(qaEvidenceLine({ kind: "CALL", evidence: { recording: false } })).toBe("Not recorded");
        expect(qaEvidenceLine({ kind: "VISIT", evidence: { photo: true, gps: true, metres: 4 } })).toContain("fix 4 m");
    });

    it("prints the quality score as a percentage, and says so under the floor", () => {
        const quality = { score: "0.73", samples: 6, passed: 5, failed: 1, reviewed: 1, visits: 4, calls: 2, confirmedFlags: 1, flagPenalty: "0.10", windowDays: 90, minimumSample: 5 };
        expect(qualityLabel(quality)).toBe("73%");
        expect(qualityHint(quality)).toBe("5 of 6 sampled pieces of work passed · 1 reviewed by hand · 1 confirmed flag took off 10%. Last 90 days.");
        expect(qualityLabel({ score: null, samples: 2, minimumSample: 5 })).toBe("Not enough sampled work yet — 2 of 5");
    });

    it("flags a recycled lead, and stays quiet on one that never went round", () => {
        const flag = recycledFlag({ recycledAt: "2026-09-20T09:00:00.000Z", recycleCount: 1 });
        expect(flag?.label).toBe("Recycled");
        expect(flag?.hint).toContain("back in the pool since");
        expect(recycledFlag({ recycledAt: "2026-09-20T09:00:00.000Z", recycleCount: 3 })?.label).toBe("Recycled 3×");
        expect(recycledFlag({ recycledAt: null, recycleCount: 0 })).toBeNull();
        // An older server sends neither field.
        expect(recycledFlag({})).toBeNull();
    });
});

describe("the list page cap", () => {
    it("never asks for more than the contract allows — the Board's 200 was a 400", () => {
        expect(MAX_LIST_PAGE_SIZE).toBe(100);
        expect(listPageSize(200)).toBe(100);
        expect(listPageSize(100)).toBe(100);
        expect(listPageSize(25)).toBe(25);
        // Nothing sensible is under one, and the default is the desk's twenty.
        expect(listPageSize(0)).toBe(1);
        expect(listPageSize(undefined)).toBe(20);
    });
});
