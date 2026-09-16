import { api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { compareMoney, formatINR } from "@/lib/format";
import type { StatusMeta, Tone } from "@/types";

/**
 * Growth — DR 05's agent gamification, wired to the backend `agents` module:
 * milestone templates, the tier ladder and the city leaderboard.
 *
 * This is the third thing called "milestone" and the one the Growth CMS
 * edits. `services/milestones.ts` is the ORDER flavour (the steps an agent
 * completes on a booking) and shares nothing with this file but the word.
 *
 * No fixture fallback, and one was removed to get here. The console used to
 * draw six seeded programs with an audience, a target event, auto-enrol and
 * push switches, and enrolled/completed counts — none of which exists on
 * `MilestoneTemplate`. Every agent is on one ladder (there is no audience);
 * progress is derived from counters on read (there is no event to target);
 * every active template is materialised onto every board on read (nothing
 * to enrol); push is not wired (DR 07 recorded it); and "live / paused /
 * draft" is one switch, `isActive`. Enrolled and completed have no endpoint
 * and are not shown rather than shown as zero.
 *
 * Three rules the rest of this file exists to keep:
 *
 * - Money is a decimal STRING. `rewardAmount` on a template, `reward` and
 *   `progressAmount` on a card, `earnings` on the podium: printed by
 *   `formatMoney`, never a number. The form takes a reward as a string that
 *   matches the schema's own regex and sends it as typed.
 *
 * - A card's chip comes off the wire. The server folds six states onto the
 *   labels the frame draws; the console bridges the tone onto the five the
 *   badge can paint and keeps no second opinion.
 *
 * - A benefit is real or absent. The tier view lists a bonus only when a
 *   rate is configured and a support line only when ops stored one; the
 *   console prints what arrives and invents nothing.
 */

/* ------------------------------------------------------------------ */
/* Milestone templates                                                 */
/* ------------------------------------------------------------------ */

export type AgentMilestoneType = "ONBOARDING" | "ACTIVITY" | "REVENUE" | "QUALITY";

export const AGENT_MILESTONE_TYPES: readonly AgentMilestoneType[] = ["ONBOARDING", "ACTIVITY", "REVENUE", "QUALITY"];

export interface MilestoneTypeMeta {
    label: string;
    /** One line on what the type counts — the same counters the server derives from. */
    counts: string;
    /** The unit a target is printed in: "10 accounts". */
    unit: string;
    /** The singular, for a target of one. */
    unitOne: string;
}

/**
 * What each type counts. These are the server's own derivations
 * (`agent-milestones.service.ts` `derive`), stated once so the editor can
 * tell ops what a target of 10 will be measured against.
 */
export const MILESTONE_TYPE_META: Record<AgentMilestoneType, MilestoneTypeMeta> = {
    ONBOARDING: {
        label: "Onboarding",
        counts: "Accounts the agent has brought through onboarding — publishers with onboarding complete and advertisers activated. The same count the tier ladder climbs on.",
        unit: "accounts",
        unitOne: "account",
    },
    ACTIVITY: {
        label: "Activity",
        counts: "Completed field visits plus listing verifications that were accepted.",
        unit: "visits & verifications",
        unitOne: "visit or verification",
    },
    REVENUE: {
        label: "Revenue",
        counts: "Incentives credited to the agent, in rupees. Pending money does not count until ops credit it.",
        unit: "rupees",
        unitOne: "rupee",
    },
    QUALITY: {
        label: "Quality",
        counts: "On-time arrivals, judged the way the agent's rating judges them.",
        unit: "on-time arrivals",
        unitOne: "on-time arrival",
    },
};

export const milestoneTypeLabel = (type: string): string =>
    MILESTONE_TYPE_META[type as AgentMilestoneType]?.label ?? type;

/** "10 accounts", "₹5,000 credited" — the target with the unit its type counts in. */
export function targetLabel(type: string, target: number): string {
    const meta = MILESTONE_TYPE_META[type as AgentMilestoneType];
    if (!meta) return String(target);
    // A revenue target is a whole-rupee count on the template, not a money
    // string off the wire, so the integer formatter is the right one.
    if (type === "REVENUE") return `${formatINR(target)} credited`;
    return `${target} ${target === 1 ? meta.unitOne : meta.unit}`;
}

/** "30 days", or "All time" for a template that never closes. */
export function windowLabel(days: number | null | undefined): string {
    if (!days) return "All time";
    return `${days} day${days === 1 ? "" : "s"}`;
}

/** "2 milestones" to complete first, or a dash when nothing locks it. */
export function unlockLabel(count: number | null | undefined): string {
    if (!count) return "—";
    return `${count} milestone${count === 1 ? "" : "s"}`;
}

/** The schema's own rule for a rupee amount: digits, optionally two places. */
const MONEY_INPUT = /^\d{1,12}(\.\d{1,2})?$/;

export const isMoneyInput = (value: string): boolean => MONEY_INPUT.test(value);

/** A template exactly as `GET /milestones/templates` sends it. */
export interface WireTemplate {
    id: string;
    type: AgentMilestoneType | string;
    title: string;
    description: string;
    target: number;
    /** Decimal string — "5000.00". Never a number. */
    rewardAmount: string;
    sortOrder: number;
    isActive: boolean;
    /** Days the window runs; null counts all time. */
    windowDays: number | null;
    startsAt: string | null;
    /** Milestones to complete before this one opens; null or 0 means none. */
    unlockAfter: number | null;
    createdAt: string;
    updatedAt: string;
}

/** One row of the CMS. Identical to the wire; the nullables are made explicit. */
export type TemplateRow = WireTemplate;

export function shapeTemplate(wire: WireTemplate): TemplateRow {
    return {
        ...wire,
        rewardAmount: wire.rewardAmount,
        windowDays: wire.windowDays ?? null,
        startsAt: wire.startsAt ?? null,
        unlockAfter: wire.unlockAfter ?? null,
    };
}

/** `POST /milestones/templates`. The type is fixed once the template exists. */
export interface CreateTemplateInput {
    type: AgentMilestoneType;
    title: string;
    description: string;
    target: number;
    /** Decimal string as typed — "5000" or "5000.00". */
    rewardAmount: string;
    sortOrder?: number;
    isActive?: boolean;
    windowDays?: number | null;
    startsAt?: string | null;
    unlockAfter?: number | null;
}

/** `PATCH /milestones/templates/:id`. Any subset; the server refuses an empty body. */
export type PatchTemplateInput = Partial<Omit<CreateTemplateInput, "type">>;

/** The editable half of a template — what the editor's draft holds. The type is fixed. */
export type TemplateDraft = Pick<
    TemplateRow,
    "title" | "description" | "target" | "rewardAmount" | "sortOrder" | "isActive" | "windowDays" | "startsAt" | "unlockAfter"
>;

/**
 * Only what changed, so the PATCH says what ops did and nothing else.
 *
 * The reward is compared in paise rather than as text: a draft that reads
 * "5000" over a stored "5000.00" is the same figure and is not sent. Text is
 * compared trimmed, because the schema trims it too and a trailing space is
 * not an edit.
 */
export function templatePatch(before: TemplateDraft, after: TemplateDraft): PatchTemplateInput {
    const patch: PatchTemplateInput = {};
    if (after.title.trim() !== before.title) patch.title = after.title.trim();
    if (after.description.trim() !== before.description) patch.description = after.description.trim();
    if (after.target !== before.target) patch.target = after.target;
    if (compareMoney(after.rewardAmount, before.rewardAmount) !== 0) patch.rewardAmount = after.rewardAmount;
    if (after.sortOrder !== before.sortOrder) patch.sortOrder = after.sortOrder;
    if (after.isActive !== before.isActive) patch.isActive = after.isActive;
    if (after.windowDays !== before.windowDays) patch.windowDays = after.windowDays;
    if (!sameMinute(after.startsAt, before.startsAt)) patch.startsAt = after.startsAt;
    if (after.unlockAfter !== before.unlockAfter) patch.unlockAfter = after.unlockAfter;
    return patch;
}

/**
 * Whether two starts are the same instant to the minute — a `datetime-local`
 * input holds no seconds, so a stored start with seconds on it is not an edit
 * just because the input could not carry them back.
 */
function sameMinute(a: string | null, b: string | null): boolean {
    if (a === null || b === null) return a === b;
    return Math.floor(Date.parse(a) / 60_000) === Math.floor(Date.parse(b) / 60_000);
}

/* ------------------------------------------------------------------ */
/* An agent's board                                                    */
/* ------------------------------------------------------------------ */

export type MilestoneState = "LOCKED" | "UPCOMING" | "ACTIVE" | "COMPLETED" | "CLAIMED" | "EXPIRED";
export type MilestoneChip = "ALL" | "ACTIVE" | "UPCOMING" | "COMPLETED";
export const MILESTONE_CHIPS: readonly MilestoneChip[] = ["ALL", "ACTIVE", "UPCOMING", "COMPLETED"];

/** A card exactly as `GET /agents/:id/milestones` sends it. */
export interface WireMilestoneCard {
    id: string;
    templateId: string;
    type: AgentMilestoneType | string;
    title: string;
    description: string;
    target: number;
    /** Capped at the target. */
    progress: number;
    /** REVENUE only: the rupees behind `progress`, as a decimal string. */
    progressAmount: string | null;
    pct: number;
    /** Decimal string. */
    reward: string;
    state: MilestoneState;
    chip: { label: string; tone: string };
    /** "Due in 10 days" / "Complete 2 milestones first" / "Completed 05 Jul". */
    timing: string | null;
    startsAt: string | null;
    deadline: string | null;
    deadlineLabel: string | null;
    completedAt: string | null;
    claimedAt: string | null;
    claimable: boolean;
    link: "LEADS" | "VISITS" | "EARNINGS" | "RATING" | string;
}

export interface MilestoneCard extends Omit<WireMilestoneCard, "chip"> {
    chip: StatusMeta;
}

/**
 * The API's tone vocabulary onto the console's — the same bridge the visits
 * board uses, because the server paints both with one palette.
 */
export function milestoneChipTone(tone: string): Tone {
    switch (tone) {
        case "warn":
            return "warning";
        case "new":
            return "info";
        case "live":
            return "success";
        default:
            return "neutral";
    }
}

export function shapeMilestoneCard(wire: WireMilestoneCard): MilestoneCard {
    return { ...wire, chip: { label: wire.chip.label, tone: milestoneChipTone(wire.chip.tone) } };
}

export interface WireMilestoneBoard {
    tier: string;
    milestones: WireMilestoneCard[];
    claimable: WireMilestoneCard | null;
    active: WireMilestoneCard | null;
    counts: Partial<Record<MilestoneChip, number>>;
}

export interface MilestoneBoard {
    tier: string;
    milestones: MilestoneCard[];
    /** The first completed, unclaimed milestone. */
    claimable: MilestoneCard | null;
    /** The first active one — the dashboard's hero line. */
    active: MilestoneCard | null;
    counts: Record<MilestoneChip, number>;
}

export function shapeBoard(wire: WireMilestoneBoard): MilestoneBoard {
    const counts = {} as Record<MilestoneChip, number>;
    for (const chip of MILESTONE_CHIPS) counts[chip] = wire.counts?.[chip] ?? 0;
    return {
        tier: wire.tier,
        milestones: (wire.milestones ?? []).map(shapeMilestoneCard),
        claimable: wire.claimable ? shapeMilestoneCard(wire.claimable) : null,
        active: wire.active ? shapeMilestoneCard(wire.active) : null,
        counts,
    };
}

/* ------------------------------------------------------------------ */
/* The tier ladder                                                     */
/* ------------------------------------------------------------------ */

export type TierName = "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";
export type TierLevel = "I" | "II" | "III";

export const AGENT_TIERS: readonly TierName[] = ["BRONZE", "SILVER", "GOLD", "PLATINUM"];
export const TIER_LEVELS: readonly TierLevel[] = ["I", "II", "III"];

export const TIER_NAME_LABEL: Record<TierName, string> = {
    BRONZE: "Bronze",
    SILVER: "Silver",
    GOLD: "Gold",
    PLATINUM: "Platinum",
};

/** One rung: where on the ladder a count of onboarded accounts lands. */
export interface Rung {
    tier: TierName;
    level: TierLevel;
    /** Onboarded accounts from which this rung applies. */
    from: number;
}

export interface LadderView {
    rungs: Rung[];
    /** A support line per tier, only for the tiers ops stored one for. */
    supportLines: Partial<Record<TierName, string>>;
}

/** `PUT /agents/tier-ladder` — either half, or both. */
export interface SaveLadderInput {
    rungs?: Rung[];
    supportLines?: Record<TierName, string | null>;
}

/**
 * The four inputs as the schema wants them: a typed line trimmed, a blank
 * one as null so the server clears it rather than storing an empty string.
 */
export function supportLinesBody(lines: Record<TierName, string>): Record<TierName, string | null> {
    const body = {} as Record<TierName, string | null>;
    for (const tier of AGENT_TIERS) {
        const line = lines[tier]?.trim() ?? "";
        body[tier] = line ? line : null;
    }
    return body;
}

export interface TierPosition {
    tier: TierName;
    level: TierLevel;
    /** "Bronze III" */
    label: string;
}

export interface TierEventView {
    id: string;
    from: TierPosition;
    to: TierPosition;
    direction: "UP" | "DOWN" | "SAME";
    reason: string;
    at: string;
    acknowledgedAt: string | null;
}

export const TIER_DIRECTION_META: Record<TierEventView["direction"], StatusMeta> = {
    UP: { label: "Climbed", tone: "success" },
    DOWN: { label: "Fell", tone: "warning" },
    SAME: { label: "Pinned", tone: "neutral" },
};

export interface TierBenefit {
    key: "BONUS" | "SUPPORT_LINE" | string;
    title: string;
    detail: string;
}

/** `GET /agents/:id/tier` — the rung, the ladder, the benefits and the history. */
export interface TierView {
    current: TierPosition & { pinned: boolean };
    next: TierPosition | null;
    stepDone: number;
    stepTarget: number;
    onboarded: { publishers: number; advertisers: number; total: number };
    ladder: Rung[];
    /** Real or absent — may be empty. */
    benefits: TierBenefit[];
    promotion: TierEventView | null;
    history: TierEventView[];
}

/** `PATCH /agents/:id/tier` — pin, or unpin with `tier: null`. A reason either way. */
export type PinTierInput = { tier: TierName; level: TierLevel; reason: string } | { tier: null; reason: string };

/* ------------------------------------------------------------------ */
/* The leaderboard                                                     */
/* ------------------------------------------------------------------ */

export type LeaderboardPeriod = "WEEK" | "MONTH" | "ALL";
export const LEADERBOARD_PERIODS: readonly LeaderboardPeriod[] = ["WEEK", "MONTH", "ALL"];
export const LEADERBOARD_PERIOD_LABEL: Record<LeaderboardPeriod, string> = {
    WEEK: "This week",
    MONTH: "This month",
    ALL: "All time",
};

export interface PublicRow {
    rank: number;
    agentId: string;
    name: string;
    locality: string | null;
    you: boolean;
}

/** The podium: the only rows that carry a figure. Decimal string. */
export interface PodiumRow extends PublicRow {
    earnings: string;
}

export interface LeaderboardView {
    period: LeaderboardPeriod;
    cohort: { city: string | null; size: number; minimum: number; enough: boolean };
    /** Always null on the desk's read — ops have no row of their own. */
    me: {
        rank: number;
        earnings: string;
        delta: number | null;
        behind: { rank: number; gap: string } | null;
        ahead: { rank: number; gap: string } | null;
    } | null;
    top: PodiumRow[];
    /** Rank 4 onward, name and locality only. The whole cohort on the desk's read. */
    window: PublicRow[];
    around: PublicRow[];
    /** There is no prize. Nothing pays one. */
    prize: null;
}

export const leaderboardPath = (city: string, period: LeaderboardPeriod): string => {
    const params = new URLSearchParams();
    params.set("city", city);
    params.set("period", period);
    return `/agents/leaderboard?${params.toString()}`;
};

/** Where one agent stands on the board, or null when the board has no rank for them. */
export function rankOf(board: LeaderboardView, agentId: string): number | null {
    if (!board.cohort.enough) return null;
    const row = board.top.find((r) => r.agentId === agentId) ?? board.window.find((r) => r.agentId === agentId);
    return row ? row.rank : null;
}

/** Why there is no board — with the size and the floor, so ops can see how far off it is. */
export function cohortMessage(cohort: LeaderboardView["cohort"]): string {
    const where = cohort.city ? ` in ${cohort.city}` : "";
    return `Not enough agents${where} for a board yet — ${cohort.size} on the roster, ${cohort.minimum} needed.`;
}

/* ------------------------------------------------------------------ */
/* The service                                                         */
/* ------------------------------------------------------------------ */

/**
 * Refuses to talk to the API while the domain is off. There is nothing to
 * fall back to; throwing before a request goes out keeps a "saved" toast
 * from ever appearing over nothing.
 */
function live() {
    if (!isLive("growth")) throw new Error("Growth reads the API; connect the console to the ADX backend first.");
    return http;
}

export const growthService = {
    /** Every template, active or not, in the order the board draws them. */
    templates: async (): Promise<TemplateRow[]> =>
        ((await live().get<WireTemplate[]>("/milestones/templates")) ?? []).map(shapeTemplate),

    template: async (id: string): Promise<TemplateRow> =>
        shapeTemplate(await live().get<WireTemplate>(`/milestones/templates/${id}`)),

    /**
     * A new template. Sent inactive unless the caller says otherwise: the
     * board materialises a row per ACTIVE template on every read, so one
     * switched on before it is checked lands on every agent's board at once.
     */
    createTemplate: async (input: CreateTemplateInput): Promise<TemplateRow> =>
        shapeTemplate(await live().post<WireTemplate>("/milestones/templates", input)),

    patchTemplate: async (id: string, patch: PatchTemplateInput): Promise<TemplateRow> =>
        shapeTemplate(await live().patch<WireTemplate>(`/milestones/templates/${id}`, patch)),

    /** The thresholds in force — configured, or the built-in table when none are stored. */
    ladder: (): Promise<LadderView> => live().get<LadderView>("/agents/tier-ladder"),

    /** Either half. A ladder that does not start at 0, climb, or that repeats a rung is a 400 with a sentence. */
    saveLadder: (input: SaveLadderInput): Promise<LadderView> => live().put<LadderView>("/agents/tier-ladder", input),

    /** The board for one city, nobody's own row, the whole cohort from rank 4. */
    leaderboard: (city: string, period: LeaderboardPeriod): Promise<LeaderboardView> =>
        live().get<LeaderboardView>(leaderboardPath(city, period)),
};
