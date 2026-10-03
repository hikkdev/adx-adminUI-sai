import { ApiError, api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { formatMoney } from "@/lib/format";
import { shapeKycSummary } from "./kyc-state";
import { accountStateOf, accountStatusCountsOf } from "./account-state";
import { rosterParams, type PartyRosterPage, type PartyRosterQuery } from "./party-roster";
import type { WireKycSummary } from "@/types";
import type { Agent, AgentOrderType, AgentStatus, SuspensionScope, Weekday } from "@/types";
import { shapeBoard, type MilestoneBoard, type PinTierInput, type TierView, type WireMilestoneBoard } from "@/services/growth";

/**
 * Agents, wired to the backend `agents` module.
 *
 * Same pattern as `orderService`: one function per endpoint, HTTP only —
 * the `agt_*` fixtures are gone (CE4), and with the API off the roster
 * refuses with a message rather than improvising. The console adopted
 * `GET /agents` as the shape rather than translating into a vocabulary of
 * its own — the rich fixture `Agent` (zone, rating, monthly
 * earnings, orders MTD) described figures nothing computes, and a column that
 * asserts a fact about somebody's work with no source behind it is a bug, not
 * a placeholder.
 */

/**
 * `GET /agents` and `GET /agents/:id`, as the API sends them. The listing joins
 * name, mobile and isActive; only the by-id read adds email. Both are contract
 * (prisma-agents.repository.ts).
 */
export interface WireAgent {
    id: string;
    userId: string;
    /** N3-B: the party's KYC state and the record's facts, on the by-id read; absent on a list row or a server one release behind. */
    kyc?: WireKycSummary | null;
    /** Minted by POST /agents; null on rows older than the identifier migration. */
    displayId?: string | null;
    city: string | null;
    state?: string | null;
    tier: string;
    /** I | II | III — DR 05's rung within the tier. Optional on the wire for rows older than the column. */
    tierLevel?: string | null;
    referralCode?: string;
    createdAt: string;
    /* D5. Optional on the wire only so a row older than the column reads as its defaults. */
    status?: "ACTIVE" | "ON_LEAVE" | "SUSPENDED";
    territory?: string | null;
    homeZone?: string | null;
    radiusKm?: number | null;
    workingDays?: Weekday[];
    hoursFrom?: string | null;
    hoursTo?: string | null;
    autoAcceptInZone?: boolean;
    orderTypes?: AgentOrderType[];
    maxActiveOrders?: number | null;
    businessName?: string | null;
    /* Lot A. Optional on the wire for rows older than the columns. */
    suspensionScopes?: SuspensionScope[];
    suspensionReason?: string | null;
    suspendedAt?: string | null;
    /** 2 Oct 2026: ACTIVE, SUSPENDED, DEACTIVATED, CLOSED (agents: EXITED) — on a roster row. Absent from a server one release behind. */
    accountState?: string | null;
    /* AG-1. Optional on the wire for a server older than the application ladder. */
    stage?: string;
    grade?: string | null;
    engagementType?: string | null;
    engagementStartAt?: string | null;
    engagementEndAt?: string | null;
    probationEndsAt?: string | null;
    reportingManagerId?: string | null;
    weeklyHours?: number | null;
    activatedAt?: string | null;
    exitedAt?: string | null;
    exitReason?: string | null;
    rehireEligible?: boolean;
    /** AG-1: where the profile came from — the roster's Onboarded. */
    sourceKind?: string;
    /** 29 Sep 2026: the side the agent works, on the roster read. */
    side?: "PUBLISHER" | "ADVERTISER";
    /** 29 Sep 2026: the publishers and advertisers the agent brought in, counted on the roster read. */
    onboardedCount?: number;
    user?: {
        id?: string;
        /** 28 Sep 2026: the person's own ADX-… id, on the by-id read. */
        displayId?: string | null;
        name: string | null;
        mobile: string;
        email?: string | null;
        isActive: boolean;
        /** E10-1: on the by-id read, beside the rest; the listing does not join them. */
        closedAt?: string | null;
        closeReason?: string | null;
    } | null;
}

/**
 * Two facts folded into one badge. Whether the person can sign in
 * (`User.isActive`) wins: a deactivated account is deactivated whatever the
 * profile says. Otherwise the profile's own status — whether ops is offering
 * them work. A thin join is missing evidence, not evidence of a deactivation.
 */
export function agentStatus(wire: { status?: WireAgent["status"]; user?: { isActive: boolean } | null }): AgentStatus {
    if (wire.user?.isActive === false) return "deactivated";
    if (wire.status === "ON_LEAVE") return "on_leave";
    if (wire.status === "SUSPENDED") return "suspended";
    return "active";
}

/* ── D5: the profile's vocabulary and how it reads ───────────────────────── */

export const WEEKDAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
export const WEEKDAY_LABEL: Record<Weekday, string> = {
    MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu", FRI: "Fri", SAT: "Sat", SUN: "Sun",
};
export const AGENT_ORDER_TYPES: AgentOrderType[] = ["INDOOR", "OUTDOOR", "TRANSIT", "MEDIA"];
export const ORDER_TYPE_LABEL: Record<AgentOrderType, string> = {
    INDOOR: "Indoor", OUTDOOR: "Outdoor", TRANSIT: "Transit", MEDIA: "Media",
};
export const PROFILE_STATUS_LABEL: Record<NonNullable<WireAgent["status"]>, string> = {
    ACTIVE: "Active — offered work",
    ON_LEAVE: "On leave — not offered work",
    SUSPENDED: "Suspended — not offered work",
};

/** "Mon to Sat" when the days run unbroken, "Mon, Wed, Fri" when they do not, "—" when none. */
export function workingDaysLabel(days: Weekday[]): string {
    const ordered = WEEKDAYS.filter((day) => days.includes(day));
    if (ordered.length === 0) return "—";
    if (ordered.length === 1) return WEEKDAY_LABEL[ordered[0]];
    const first = WEEKDAYS.indexOf(ordered[0]);
    const unbroken = ordered.every((day, index) => WEEKDAYS.indexOf(day) === first + index);
    if (unbroken && ordered.length >= 3) {
        return `${WEEKDAY_LABEL[ordered[0]]} to ${WEEKDAY_LABEL[ordered[ordered.length - 1]]}`;
    }
    return ordered.map((day) => WEEKDAY_LABEL[day]).join(", ");
}

/** "09:00" → "9 AM", "13:30" → "1:30 PM". */
export function clockLabel(value: string): string {
    const [hh, mm] = value.split(":").map(Number);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return value;
    const hour12 = hh % 12 === 0 ? 12 : hh % 12;
    const minutes = mm === 0 ? "" : `:${String(mm).padStart(2, "0")}`;
    return `${hour12}${minutes} ${hh < 12 ? "AM" : "PM"}`;
}

/** "9 AM to 7 PM", or "—" until both ends are set. */
export function hoursLabel(from: string | null, to: string | null): string {
    return from && to ? `${clockLabel(from)} to ${clockLabel(to)}` : "—";
}

export function orderTypesLabel(types: AgentOrderType[]): string {
    return types.length ? types.map((type) => ORDER_TYPE_LABEL[type]).join(", ") : "Any";
}

/**
 * Every offer the agent has had, folded: `GET /orders/agents/:id/offers`.
 * The count behind DR 07's "frequent rejections lower your offer priority".
 */
/**
 * An agent's rating as `GET /agents/:id/rating` answers it — DR 07 wave 6.
 *
 * Derived on read from orders, assignments, check-ins and — Lot D (Q112) —
 * the publishers' reviews, so ops and the agent are looking at the same four
 * numbers. A driver the platform cannot compute comes back null and is drawn
 * as "no data" rather than as a zero.
 */
export interface AgentRatingDriver {
    /** Lot D (Q112): `review` is the publishers' stars, the fourth driver. */
    key: "completion" | "onTime" | "rejection" | "review";
    label: string;
    rate: number | null;
    sample: number;
    inverted: boolean;
}

export interface AgentRating {
    score: number | null;
    /** E7-3: the publishers' stars as the snapshot holds them — a decimal string, null before a first star — and how many. */
    reviewAvg?: string | null;
    reviewCount?: number;
    drivers: AgentRatingDriver[];
    sample: number;
    provisional: boolean;
    windowDays: number;
    percentile: number | null;
    percentileLabel: string | null;
    lane: "FAST" | "SLOWED";
    ledger: { id: string; kind: string; title: string; detail: string | null; at: string; delta: number }[];
    computedAt: string;
}

/** The percentage a driver prints, or null where there is nothing to judge. */
export const ratePercent = (rate: number | null): number | null => (rate === null ? null : Math.round(rate * 100));

/** Whether a driver is where ADX wants it. Less is more on the inverted one. */
export function driverHealthy(driver: AgentRatingDriver): boolean | null {
    if (driver.rate === null) return null;
    return driver.inverted ? driver.rate <= 0.1 : driver.rate >= 0.8;
}

export interface AgentOffers {
    offered: number;
    accepted: number;
    pending: number;
    declined: number;
    expired: number;
    byReason: Record<string, number>;
    /** DR 07's lane, over the last thirty days — the sweep's own rule, not a rating. */
    priority: OfferPriority;
    recent: { orderId: string; status: string; reason: string | null; assignedAt: string; respondedAt: string | null }[];
}

export interface OfferPriority {
    lane: "FAST" | "SLOWED";
    offered: number;
    declined: number;
    /** declined / offered, or null with too few offers to judge. */
    declineRate: number | null;
    windowDays: number;
}

/** "Fast lane" or "Slowed", with the share behind it when there is one. */
export function priorityLabel(priority: OfferPriority): string {
    const lane = priority.lane === "FAST" ? "Fast lane" : "Slowed";
    if (priority.declineRate === null) {
        return `${lane} — too few offers in ${priority.windowDays} days to judge`;
    }
    return `${lane} — ${Math.round(priority.declineRate * 100)}% declined or expired in ${priority.windowDays} days`;
}

/** The five coded reasons an agent may decline with, as the app words them. */
export const REJECTION_LABEL: Record<string, string> = {
    TOO_FAR: "Too far from their location",
    NOT_AVAILABLE: "Not available during the window",
    NO_EXPERTISE: "Outside their specialisation",
    AT_CAPACITY: "At capacity",
    OTHER: "Other, with a note",
};

/** What ops may change from the console. A key left out is left alone; null clears. */
export interface UpdateAgentInput {
    city?: string | null;
    state?: string | null;
    businessName?: string | null;
    territory?: string | null;
    homeZone?: string | null;
    radiusKm?: number | null;
    workingDays?: Weekday[];
    hoursFrom?: string | null;
    hoursTo?: string | null;
    autoAcceptInZone?: boolean;
    orderTypes?: AgentOrderType[];
    maxActiveOrders?: number | null;
    status?: "ACTIVE" | "ON_LEAVE" | "SUSPENDED";
}

/** The route's ceiling on `limit` — one directory read. */
export const AGENT_ROSTER_PAGE_SIZE = 200;

/** Lifts the person off the join and renames `createdAt` to what the page calls it. */
export function shapeAgent(wire: WireAgent): Agent {
    const name = wire.user?.name?.trim();
    return {
        id: wire.id,
        userId: wire.userId,
        // N3-B: agents keep no mirror column; with no `kyc` on the read the agent is awaiting documents.
        kyc: shapeKycSummary(wire.kyc),
        displayId: wire.displayId ?? null,
        personDisplayId: wire.user?.displayId ?? null,
        name: name ? name : null,
        mobile: wire.user?.mobile ?? "",
        email: wire.user?.email ?? null,
        city: wire.city ?? null,
        state: wire.state ?? null,
        tier: wire.tier,
        tierLevel: wire.tierLevel ?? null,
        status: agentStatus(wire),
        referralCode: wire.referralCode ?? null,
        joinedAt: wire.createdAt,
        territory: wire.territory ?? null,
        homeZone: wire.homeZone ?? null,
        radiusKm: wire.radiusKm ?? null,
        workingDays: wire.workingDays ?? [],
        hoursFrom: wire.hoursFrom ?? null,
        hoursTo: wire.hoursTo ?? null,
        autoAcceptInZone: wire.autoAcceptInZone ?? false,
        orderTypes: wire.orderTypes ?? [],
        maxActiveOrders: wire.maxActiveOrders ?? null,
        businessName: wire.businessName ?? null,
        suspensionScopes: wire.suspensionScopes ?? [],
        suspensionReason: wire.suspensionReason ?? null,
        suspendedAt: wire.suspendedAt ?? null,
        accountState: accountStateOf(wire.accountState),
        // 29 Sep 2026: the roster's Type, Onboarded and Activity — absent on a read that does not carry them.
        side: wire.side ?? null,
        sourceKind: wire.sourceKind ?? null,
        onboardedCount: wire.onboardedCount ?? null,
        engagement: wire.stage
            ? {
                  stage: wire.stage,
                  grade: wire.grade ?? null,
                  type: wire.engagementType ?? null,
                  startAt: wire.engagementStartAt ?? null,
                  endAt: wire.engagementEndAt ?? null,
                  probationEndsAt: wire.probationEndsAt ?? null,
                  reportingManagerId: wire.reportingManagerId ?? null,
                  weeklyHours: wire.weeklyHours ?? null,
                  activatedAt: wire.activatedAt ?? null,
                  exitedAt: wire.exitedAt ?? null,
                  exitReason: wire.exitReason ?? null,
                  rehireEligible: wire.rehireEligible ?? true,
              }
            : null,
        /* E10-1: the closure columns ride on the by-id read's `user`. A join
           without them (the listing) leaves the field undefined, so a page
           that needs them knows they were not sent rather than reading "open". */
        ...(wire.user === null
            ? { user: null }
            : wire.user && wire.user.closedAt !== undefined
              ? { user: { closedAt: wire.user.closedAt ?? null, closeReason: wire.user.closeReason ?? null } }
              : {}),
    };
}

/**
 * "BRONZE", "III" → "Bronze III" — the rung the way the agent's app prints
 * it. The backend stores the tier in upper case; the level is I, II or III
 * and is left off when the caller has none, so a row older than the level
 * column reads as the tier alone rather than as "Bronze null".
 */
export function tierLabel(tier: string | null | undefined, level?: string | null): string {
    const value = tier?.trim();
    if (!value) return "—";
    const name = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
    const rung = level?.trim();
    return rung ? `${name} ${rung}` : name;
}

/** Name and city, then the identifier, then the number — whatever the row has. */
export function agentDisplayName(agent: {
    name: string | null;
    city: string | null;
    displayId: string | null;
    mobile: string;
}): string {
    if (agent.name) return agent.city ? `${agent.name} · ${agent.city}` : agent.name;
    return agent.displayId ?? agent.mobile;
}

/* ── The picker shape ─────────────────────────────────────────────────────
 *
 * Two screens put agents in a dropdown — assigning a support ticket, and
 * assigning an order — and want the thin listing rather than the shaped row.
 * Kept separate on purpose: a picker that is handed a fixture `Agent` in live
 * mode would post a fixture id to a real endpoint.
 */

export interface AgentSummary {
    id: string;
    userId: string;
    /** AGT-1009-2601 — issued when ops creates the agent; null on older rows. */
    displayId?: string | null;
    city: string | null;
    tier: string;
    tierLevel?: string | null;
    user?: { name: string | null; mobile: string };
}

/** What to call an agent in a dropdown when the join came back thin. */
export function agentLabel(agent: AgentSummary): string {
    const name = agent.user?.name?.trim();
    if (name) return agent.city ? `${name} · ${agent.city}` : name;
    return agent.user?.mobile ?? agent.id;
}

/**
 * What ops types at the desk to bring an agent into existence: the number they
 * will sign in with, their name, and which side of the marketplace they sell
 * for. The server normalises the mobile and mints the identifier.
 */
export interface CreateAgentInput {
    mobile: string;
    name: string;
    email?: string;
    side: "PUBLISHER" | "ADVERTISER";
    city?: string;
    state?: string;
    /**
     * AG-3: start them on the application ladder (the desk fills the rest
     * in for them, or they finish it in the app) rather than active at
     * once. The default at the desk; off is the pre-AG-1 shortcut.
     */
    asApplication?: boolean;
}

export const agentService = {
    /** The thin listing, for pickers and name lookups — everyone (2 Oct 2026: the roster answers working agents by default). */
    list: () => http.get<AgentSummary[]>("/agents?status=ALL"),

    /**
     * The listing narrowed by name or mobile — `GET /agents?search=`, which is
     * the parameter the API takes (there is no `q` on this route). For the
     * pickers that cannot hold the whole roster, like attributing a publisher
     * from the dashboard.
     */
    search: (query: string, limit = 20) =>
        http.get<AgentSummary[]>(`/agents?search=${encodeURIComponent(query.trim())}&limit=${limit}&status=ALL`),

    /**
     * 29 Sep 2026 — the directory, cut on the server by the five filters
     * every party roster takes (`services/party-roster`; the route names the
     * text `search`). `cursor` is the offset to read from; the next is
     * offered while the rows read fall short of the meta's total.
     */
    rosterPage: async (query: PartyRosterQuery, cursor: string | null): Promise<PartyRosterPage<Agent>> => {
        if (!isLive("agents")) throw new Error("Agents read the API; connect the console to the ADX backend first.");
        const offset = cursor ? Math.max(0, Number(cursor) || 0) : 0;
        const params = rosterParams(query, "search");
        params.set("limit", String(AGENT_ROSTER_PAGE_SIZE));
        if (offset > 0) params.set("offset", String(offset));
        const reply = await http.getEnvelope<WireAgent[], { meta?: { total?: number; limit?: number; offset?: number; counts?: unknown; statusCounts?: unknown } }>(
            `/agents?${params.toString()}`,
        );
        const rows = (reply.data ?? []).map(shapeAgent);
        const total = reply.meta?.total ?? null;
        const read = offset + rows.length;
        return { rows, total, nextCursor: total !== null && rows.length > 0 && read < total ? String(read) : null, statusCounts: accountStatusCountsOf(reply.meta) };
    },

    /** The roster, shaped for the table. */
    directory: async (): Promise<Agent[]> => {
        if (!isLive("agents")) throw new Error("Agents read the API; connect the console to the ADX backend first.");
        /* 2 Oct 2026: the roster answers working accounts by default; a picker or a name lookup needs everyone. */
        const rows = await http.get<WireAgent[]>("/agents?status=ALL");
        return rows.map(shapeAgent);
    },

    /** One agent, or null when the id names nobody. */
    get: async (id: string): Promise<Agent | null> => {
        if (!isLive("agents")) throw new Error("Agents read the API; connect the console to the ADX backend first.");
        try {
            return shapeAgent(await http.get<WireAgent>(`/agents/${id}`));
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 404) return null;
            throw cause;
        }
    },

    /**
     * The only way an agent comes to exist. 409 when the number is already an
     * agent, or the email is somebody else's — the API says which.
     */
    create: async (input: CreateAgentInput): Promise<Agent> =>
        shapeAgent(await http.post<WireAgent>("/agents", input)),

    /** Every offer they have had, with the five coded reasons counted. Live only. */
    offers: (id: string): Promise<AgentOffers> => http.get<AgentOffers>(`/orders/agents/${id}/offers`),

    /** D5: the rating beside the lane — the same numbers the agent sees. */
    rating: (id: string): Promise<AgentRating> => http.get<AgentRating>(`/agents/${id}/rating`),

    /** DR 05: the rung, the ladder, the benefits and the promotion history. Live only. */
    tier: (id: string): Promise<TierView> => http.get<TierView>(`/agents/${id}/tier`),

    /**
     * DR 05: pins a tier with a reason, or hands the rung back to the ladder
     * with `tier: null`. `PATCH /agents/:id` deliberately cannot write the
     * tier; this is the explicit door, and it is logged.
     */
    pinTier: (id: string, input: PinTierInput): Promise<TierView> => http.patch<TierView>(`/agents/${id}/tier`, input),

    /** DR 05: the agent's milestone board, derived the same way the app derives it. Live only. */
    milestones: async (id: string): Promise<MilestoneBoard> =>
        shapeBoard(await http.get<WireMilestoneBoard>(`/agents/${id}/milestones`)),

    /** D5: the territory, the preferences, and whether they are offered work — from the desk. */
    update: async (id: string, patch: UpdateAgentInput): Promise<Agent> => {
        if (!isLive("agents")) throw new Error("Agents read the API; connect the console to the ADX backend first.");
        return shapeAgent(await http.patch<WireAgent>(`/agents/${id}`, patch));
    },
};


/* ------------------------------------------------------------------ */
/* CP-1 â what an agent is paid, and what it covers                    */
/* ------------------------------------------------------------------ */

/**
 * An agent's pay terms. The salary covers `dailyQuota` onboardings a working
 * day; past the quota an onboarding pays `commissionPerExtra`, which is the
 * planned unit cost plus the uplift.
 *
 * `workingDaysPerMonth` is a planning figure that prices the commission â it
 * is NOT a claim about days worked, and no screen should print it as one. It
 * differs by grade because the work does: a field agent walking a market has
 * six days a week, anyone selling into offices has five.
 */
export interface AgentCompensation {
    id: string;
    agentId: string;
    /** Decimal strings, all of them. */
    monthlySalary: string;
    dailyQuota: number;
    workingDaysPerMonth: number;
    commissionUpliftPct: string;
    /** `salary / (quota Ã days)` â what one onboarding costs in salary. Null when it cannot be priced. */
    plannedUnitCost: string | null;
    /** What an onboarding past the day's quota pays. */
    commissionPerExtra: string | null;
    plannedPerMonth: number;
    effectiveFrom: string;
    /** Set when a later record superseded this one. */
    effectiveTo: string | null;
    note: string | null;
    createdByUserId: string;
    createdAt: string;
}

export interface AgentCompensationHistory {
    current: AgentCompensation | null;
    history: AgentCompensation[];
}

/** Where the agent stands today and this month, in the quota's own terms. */
export interface AgentStanding {
    agentId: string;
    day: string;
    month: string;
    onTheQuotaModel: boolean;
    dailyQuota: number | null;
    doneToday: number;
    quotaLeftToday: number | null;
    doneThisMonth: number;
    monthlySalary: string | null;
    plannedUnitCost: string | null;
    commissionPerExtra: string | null;
    /** The salary spread over what was actually done â the real cost per onboarding. Null until something is. */
    salaryPerOnboarding: string | null;
}

export interface CompensationDefaults extends Omit<AgentCompensation, "id" | "agentId" | "effectiveFrom" | "effectiveTo" | "note" | "createdByUserId" | "createdAt"> {
    grade: string;
}

export interface SetCompensationInput {
    monthlySalary: string;
    dailyQuota: number;
    workingDaysPerMonth?: number;
    commissionUpliftPct?: string;
    effectiveFrom?: string;
    note?: string;
}

/**
 * "10 a day Â· â¹96.15 each Â· â¹105.77 past it" â the terms in one line.
 * Says what it cannot price rather than printing a zero.
 */
export function compensationLine(terms: Pick<AgentCompensation, "dailyQuota" | "plannedUnitCost" | "commissionPerExtra">): string {
    const parts = [`${terms.dailyQuota} a day`];
    if (terms.plannedUnitCost) parts.push(`${formatMoney(terms.plannedUnitCost)} each`);
    else parts.push("not priceable");
    if (terms.commissionPerExtra) parts.push(`${formatMoney(terms.commissionPerExtra)} past it`);
    return parts.join(" · ");
}

/**
 * "7 of 10 today" â and, once the quota is used up, what the next one earns,
 * because that is the number the agent and the desk both care about.
 */
export function standingLine(standing: AgentStanding): string {
    if (!standing.onTheQuotaModel) return "Not on the salary-and-quota model — onboardings pay the flat rate";
    const used = `${standing.doneToday} of ${standing.dailyQuota ?? 0} today`;
    if ((standing.quotaLeftToday ?? 0) > 0) return `${used} · ${standing.quotaLeftToday} still covered by salary`;
    return standing.commissionPerExtra ? `${used} · the next earns ${formatMoney(standing.commissionPerExtra)}` : used;
}

/**
 * The same arithmetic the backend prices with, for the form's preview line
 * only — `salary / (quota × days)`, and that plus the uplift. What is saved
 * comes back from the API and is what any figure on a page is read from;
 * this exists so the desk sees what it is about to commit to before it does.
 */
export function priceTerms(input: { monthlySalary: string; dailyQuota: number; workingDaysPerMonth: number; commissionUpliftPct: string }): {
    plannedUnitCost: string | null;
    commissionPerExtra: string | null;
    plannedPerMonth: number;
} {
    const salary = Number(input.monthlySalary);
    const plannedPerMonth = input.dailyQuota * input.workingDaysPerMonth;
    if (!Number.isFinite(salary) || salary <= 0 || plannedPerMonth <= 0) {
        return { plannedUnitCost: null, commissionPerExtra: null, plannedPerMonth: Math.max(0, plannedPerMonth) };
    }
    const unit = salary / plannedPerMonth;
    const uplift = Number(input.commissionUpliftPct);
    const extra = Number.isFinite(uplift) ? unit * (1 + uplift / 100) : null;
    return {
        plannedUnitCost: unit.toFixed(2),
        commissionPerExtra: extra === null ? null : extra.toFixed(2),
        plannedPerMonth,
    };
}

export const compensationService = {
    /** `GET /agents/:id/compensation` â the terms in force and the history behind them. */
    get: (agentId: string): Promise<AgentCompensationHistory> => http.get<AgentCompensationHistory>(`/agents/${agentId}/compensation`),
    /** `POST /agents/:id/compensation` â records new terms from a date; closes the ones before. Audited. */
    set: (agentId: string, input: SetCompensationInput): Promise<AgentCompensation> => http.post<AgentCompensation>(`/agents/${agentId}/compensation`, input),
    /** `GET /agents/:id/standing` â the quota today and the month's real unit cost. */
    standing: (agentId: string): Promise<AgentStanding> => http.get<AgentStanding>(`/agents/${agentId}/standing`),
    /** `GET /agents/compensation/defaults?grade=` â what the form starts from. */
    defaults: (grade?: string): Promise<CompensationDefaults> =>
        http.get<CompensationDefaults>(`/agents/compensation/defaults${grade ? `?grade=${encodeURIComponent(grade)}` : ""}`),
};
