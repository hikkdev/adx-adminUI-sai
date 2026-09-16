import { api as http } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";
import { PAYMENT_GATEWAYS, type PaymentGateway } from "@/services/payments";
import type { AdminTwoFactorPolicy } from "@/services/two-factor";

/**
 * Platform settings — the `AppConfig` row keyed `platform`, wired to
 * `GET/PUT /settings/platform` (Lot A, Q31).
 *
 * The handful of numbers other modules read on their hot paths: the KYC
 * review SLA, whether a verified listing goes live on its own, the
 * marketplace floors, the retention windows, the support SLAs. Every field
 * drawn by the Settings page is one the backend actually reads; there is no
 * currency, no take rate and no notification toggle here because nothing
 * on the server reads one.
 *
 * The PUT is a deep patch, never a replacement, and it refuses unknown keys.
 * `changedKeys` is the whole reason this file has a test: Save sends the
 * leaves that moved and nothing beside them, so two admins editing different
 * sections in the same minute do not overwrite each other's numbers.
 */

export const SUPPORT_PRIORITIES = ["URGENT", "HIGH", "NORMAL", "LOW"] as const;
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];

export const SUPPORT_PRIORITY_LABEL: Record<SupportPriority, string> = {
    URGENT: "Urgent",
    HIGH: "High",
    NORMAL: "Normal",
    LOW: "Low",
};

export interface SupportSla {
    firstResponseHours: number;
    resolutionHours: number;
}

/**
 * Lot I: live chat, which is a feature for paid subscribers.
 *
 * Every default the backend ships is reversible from here rather than by a
 * deploy. `enabled` is ops' own switch beside the `support.live-chat` kill
 * flag; `hours` is the window the desk answers live, `[from, to)` on the local
 * clock, and outside it a subscriber's message becomes a ticket with the next
 * opening promised; `firstResponseTargetSec` is the clock the live inbox draws
 * and the sweep breaches against; `publisherTiers` narrows which publisher
 * tiers are entitled, empty meaning every running subscription;
 * `attachmentMaxMb` caps an image or PDF on a message.
 */
export interface LiveChatSettings {
    enabled: boolean;
    hours: { from: string; to: string; tz: string };
    firstResponseTargetSec: number;
    publisherTiers: string[];
    attachmentMaxMb: number;
}

export type InstallationCommissionMode = "FLAT" | "PER_ORDER";

/*
 * Lot J2: the purchase rules for a subscription, one policy per audience —
 * `subscriptions.publisher` for the plans `revenue` sells and
 * `subscriptions.advertiser` for the packages `packages` sells. Every
 * default the backend ships is today's behaviour; the Subscriptions card on
 * /settings changes it from here on. GST is NOT a field of the policy: both
 * pricing paths read revenue's tax row (`GET/PATCH /revenue/tax`).
 */

export const SUBSCRIPTION_AUDIENCES = ["publisher", "advertiser"] as const;
export type SubscriptionAudience = (typeof SUBSCRIPTION_AUDIENCES)[number];
export const SUBSCRIPTION_AUDIENCE_LABEL: Record<SubscriptionAudience, string> = {
    publisher: "Publishers",
    advertiser: "Advertisers",
};

export const SUBSCRIPTION_CYCLES = ["MONTHLY", "ANNUAL"] as const;
export type SubscriptionCycle = (typeof SUBSCRIPTION_CYCLES)[number];
export const SUBSCRIPTION_CYCLE_LABEL: Record<SubscriptionCycle, string> = { MONTHLY: "Monthly", ANNUAL: "Annual" };

export const SUBSCRIPTION_CHANGE_POLICIES = ["REPLACE_NOW", "QUEUE_AFTER_TERM"] as const;
export type SubscriptionChangePolicy = (typeof SUBSCRIPTION_CHANGE_POLICIES)[number];
export const SUBSCRIPTION_CHANGE_POLICY_LABEL: Record<SubscriptionChangePolicy, string> = {
    REPLACE_NOW: "Replace now",
    QUEUE_AFTER_TERM: "Queue after the current term",
};

/** The gateways a policy may list — the same three `payments` exposes and the integrations page configures. */
export const SUBSCRIPTION_GATEWAYS: readonly PaymentGateway[] = PAYMENT_GATEWAYS;

/** One audience's purchase rules, exactly as `subscriptionPolicySchema` parses them. */
export interface SubscriptionPolicy {
    /** Non-empty: a cycle not listed is refused at the quote (400 CYCLE_NOT_OFFERED). */
    cyclesOffered: SubscriptionCycle[];
    /** Off twelve months bought at once, 0–90. */
    annualDiscountPct: number;
    /** What a different tier does to the running term. */
    changePolicy: SubscriptionChangePolicy;
    /** REPLACE_NOW only: the replaced term's unused days come back as wallet credit. */
    prorateOnChange: boolean;
    /** Entitlements survive this many days after the term ends, 0–90. Never the commission rate. */
    graceDays: number;
    /** Per UPPER_SNAKE tier: a first-ever subscriber may start this many free days, 0–90; absent is no trial. */
    trialDays: Record<string, number>;
    /** The daily sweep's expiring notice, this many days before the end, 1–30. */
    reminderLeadDays: number;
    /** An unpaid order older than this becomes EXPIRED, 1–30. */
    unpaidOrderExpiryDays: number;
    payment: {
        walletAllowed: boolean;
        /** An empty list closes the gateway path for this audience. */
        gatewaysAllowed: PaymentGateway[];
    };
    autoRenew: {
        allowed: boolean;
        /** The only rail a renewal charges today; the schema takes nothing else. */
        chargeFromWallet: true;
    };
}

export type SubscriptionPolicies = Record<SubscriptionAudience, SubscriptionPolicy>;

/** Any subset of a policy: `trialDays` merges tier by tier on the server, the two lists replace whole. */
export type SubscriptionPolicyPatch = Partial<Omit<SubscriptionPolicy, "payment" | "autoRenew" | "trialDays">> & {
    trialDays?: Record<string, number>;
    payment?: Partial<SubscriptionPolicy["payment"]>;
    autoRenew?: Partial<SubscriptionPolicy["autoRenew"]>;
};

/** The document exactly as `platformSettingsSchema` parses it. */
export interface PlatformSettings {
    /**
     * Lot G (Q127/142): `escalationSlaMultiplier` × `reviewSlaHours` is when
     * the nightly sweep escalates a PENDING case to Compliance. Lot N:
     * `printPartnerActivationRequiresKyc` — on, a print partner whose KYC is
     * not VERIFIED cannot be activated (409 KYC_REQUIRED); absent on a read
     * from a server older than the setting, and the switch says so.
     */
    kyc: { reviewSlaHours: number; escalationSlaMultiplier: number; printPartnerActivationRequiresKyc?: boolean };
    listings: { autoPublishOnVerification: boolean };
    marketplace: { minBookingDays: number; maxMarketsPerCampaign: number };
    publisher: { spotInsightsVisible: boolean };
    retention: { financialYears: number; kycYears: number };
    /**
     * The ticket SLAs, and (Lot I) the live-chat block. `liveChat` is optional
     * on the read for a backend older than the section; the card then says it
     * is not served rather than drawing a default that would save wrongly.
     */
    support: { sla: Record<SupportPriority, SupportSla>; liveChat?: LiveChatSettings };
    /**
     * How admins get in. Lot K2: `adminTwoFactor` is the authenticator-app
     * policy — optional on the read for a backend older than the section;
     * the Admin sign-in card on /settings then says it is not served.
     */
    auth: { adminPasswordLoginEnabled: boolean; adminTwoFactor?: AdminTwoFactorPolicy };
    installation: { commissionMode: InstallationCommissionMode };
    /** Lot B (Q85): the rails, and the two windows a party is told about. Edited on /finance/settings. */
    finance: FinanceSettings;
    /**
     * Lot G (Q117): the dispatcher's quiet hours and weekly cap for
     * non-transactional copy. Optional on the read for a backend older than
     * the section; the Comms card on /settings then says it is not served.
     */
    comms?: CommsSettings;
    /**
     * Lot G (Q120/Q139): the bands of the employees overview's workload
     * chart. Optional on the read for a backend older than the section; the
     * People card on /settings then says it is not served.
     */
    hr?: HrSettings;
    /**
     * Lot J2: the purchase rules, one policy per audience. Optional on the
     * read for a backend older than the section; the Subscriptions card on
     * /settings then says it is not served rather than drawing a default.
     */
    subscriptions?: SubscriptionPolicies;
    /**
     * Lot V: the city rollout's three knobs — what `GET /geo/cities/:slug/readiness`
     * checks before ops launch a city, and whether the app's pickers list
     * SEEDING cities and PLANNED capitals as "coming soon". Optional on the
     * read for a backend older than the section; the Settings card on the
     * Geographies desk then says it is not served.
     */
    geo?: GeoSettings;
}

/** Lot V: `settings.geo`. `launchMinListings` is 0–10,000 on the schema. */
export interface GeoSettings {
    launchMinListings: number;
    launchNeedsPrintPartner: boolean;
    comingSoonWaitlist: boolean;
}

/** Items per week at which a staffer's load reads MEDIUM, and HIGH; `high` must be above `medium`. */
export interface HrSettings {
    workloadThresholds: { medium: number; high: number };
}

/**
 * A non-negative number of items per week, or null for text the schema
 * would refuse. Decimals are allowed — the measure weighs a reply at half
 * an item — and the cross-field rule (`high` above `medium`) is the form's.
 */
export function parseWorkloadThreshold(text: string): number | null {
    const trimmed = text.trim();
    if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
    return Number(trimmed);
}

/** `HH:MM`, the schema's clock time. */
export const CLOCK_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Lot G (Q117): when a non-transactional email or SMS may not leave, and
 * how many one person gets a week. A window that crosses midnight is an
 * evening-through-morning one; equal edges are no window at all. The cap
 * counts every channel together over the Indian week, Monday to Monday;
 * a row beyond it is born SKIPPED with `WEEKLY_CAP` so the log shows it.
 */
export interface CommsSettings {
    quietHours: { from: string; to: string; tz: string };
    weeklyCapPerUser: number;
}

/**
 * Lot G (Q124): the weekly payout draft. `weekday` 0–6 with Sunday 0 (the
 * JavaScript convention), `hourIst` the Indian hour the job drafts at. A
 * job drafts; a person still submits, approves and releases.
 */
export interface PayoutBatchCadence {
    enabled: boolean;
    weekday: number;
    hourIst: number;
}

export const WEEKDAY_LABEL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** "Every Monday at 10:00 IST", or "Off". */
export function cadenceLabel(cadence: PayoutBatchCadence | null | undefined): string {
    if (!cadence || !cadence.enabled) return "Off";
    const hour = String(cadence.hourIst).padStart(2, "0");
    return `Every ${WEEKDAY_LABEL[cadence.weekday] ?? "week"} at ${hour}:00 IST`;
}

export type PayoutRail = "MANUAL_NEFT" | "RAZORPAY_X" | "CASHFREE";

export interface FinanceSettings {
    /** One platform-wide primary rail; `railFor` prefers it when configured. */
    primaryRail: PayoutRail;
    /** Walked in order when the primary is unconfigured. Manual is always last whatever is listed. At most three. */
    railFallbackOrder: PayoutRail[];
    /** What a party is told to expect between release and the bank line. */
    payoutEtaHours: number;
    /** Days a daily earning waits before it can be withdrawn. */
    clearingDays: number;
    /**
     * Lot C (Q88): at or above this total, an ADMIN authorising a campaign on
     * the advertiser's behalf needs a second admin (409 FOUR_EYES). Optional on
     * the read for a backend older than the field; the dialog then shows the
     * rule only when the API raises it.
     */
    opsAuthoriseThreshold?: number;
    /**
     * Lot G (Q124): the weekly draft's slot. Optional on the read for a
     * backend older than the field; the cadence card on /finance/settings
     * then says it is not served rather than drawing a default.
     */
    payoutBatchCadence?: PayoutBatchCadence;
}

/** Any subset of the sections, each any subset of its fields — what a PUT may carry. */
export type PlatformSettingsPatch = {
    kyc?: Partial<PlatformSettings["kyc"]>;
    listings?: Partial<PlatformSettings["listings"]>;
    marketplace?: Partial<PlatformSettings["marketplace"]>;
    publisher?: Partial<PlatformSettings["publisher"]>;
    retention?: Partial<PlatformSettings["retention"]>;
    support?: {
        sla?: Partial<Record<SupportPriority, Partial<SupportSla>>>;
        liveChat?: Partial<Omit<LiveChatSettings, "hours">> & { hours?: Partial<LiveChatSettings["hours"]> };
    };
    auth?: { adminPasswordLoginEnabled?: boolean; adminTwoFactor?: Partial<AdminTwoFactorPolicy> };
    installation?: Partial<PlatformSettings["installation"]>;
    finance?: Partial<Omit<FinanceSettings, "payoutBatchCadence">> & { payoutBatchCadence?: Partial<PayoutBatchCadence> };
    comms?: { quietHours?: Partial<CommsSettings["quietHours"]>; weeklyCapPerUser?: number };
    hr?: { workloadThresholds?: Partial<HrSettings["workloadThresholds"]> };
    subscriptions?: Partial<Record<SubscriptionAudience, SubscriptionPolicyPatch>>;
    geo?: Partial<GeoSettings>;
};

/** The schema's bounds, so the form refuses what the server would. */
export const SETTING_BOUNDS = {
    "kyc.reviewSlaHours": { min: 1, max: 24 * 30 },
    "kyc.escalationSlaMultiplier": { min: 1, max: 30 },
    "marketplace.minBookingDays": { min: 1, max: 365 },
    "marketplace.maxMarketsPerCampaign": { min: 1, max: 50 },
    "retention.financialYears": { min: 1, max: 30 },
    "retention.kycYears": { min: 1, max: 30 },
    firstResponseHours: { min: 1, max: 24 * 30 },
    resolutionHours: { min: 1, max: 24 * 90 },
    "finance.payoutEtaHours": { min: 1, max: 24 * 14 },
    "finance.clearingDays": { min: 0, max: 60 },
    "finance.payoutBatchCadence.hourIst": { min: 0, max: 23 },
    "comms.weeklyCapPerUser": { min: 0, max: 1000 },
    /* Lot I: the schema's own bounds on the live-chat block. */
    "support.liveChat.firstResponseTargetSec": { min: 10, max: 3600 },
    "support.liveChat.attachmentMaxMb": { min: 1, max: 10 },
    /* Lot J2: the subscription policy's bounds, the same for either audience. */
    "subscriptions.annualDiscountPct": { min: 0, max: 90 },
    "subscriptions.graceDays": { min: 0, max: 90 },
    "subscriptions.trialDays": { min: 0, max: 90 },
    "subscriptions.reminderLeadDays": { min: 1, max: 30 },
    "subscriptions.unpaidOrderExpiryDays": { min: 1, max: 30 },
    /* Lot V: the readiness check's floor on live listings. */
    "geo.launchMinListings": { min: 0, max: 10_000 },
} as const;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The leaves of `after` that differ from `before`, in the nested shape the
 * PUT takes. An empty object means nothing moved and there is nothing to
 * send. Pure and generic over the document so the test can pin it on a
 * small shape as well as the real one.
 */
export function changedKeys<T extends Record<string, unknown>>(before: T, after: T): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    for (const [key, next] of Object.entries(after)) {
        const previous = before[key];
        if (isPlainObject(next) && isPlainObject(previous)) {
            const inner = changedKeys(previous, next);
            if (Object.keys(inner).length > 0) patch[key] = inner;
        } else if (Array.isArray(next) && Array.isArray(previous)) {
            // An array is a leaf the PUT replaces whole — the rail fallback
            // order — so it is compared element by element, not by identity:
            // a document that was cloned on the way in is not a change.
            if (next.length !== previous.length || next.some((item, index) => !Object.is(item, previous[index]))) {
                patch[key] = next;
            }
        } else if (!Object.is(next, previous)) {
            patch[key] = next;
        }
    }
    return patch;
}

/** How many leaves a patch names — the number on the save bar. */
export function countLeaves(patch: Record<string, unknown>): number {
    return Object.values(patch).reduce<number>(
        (sum, value) => sum + (isPlainObject(value) ? countLeaves(value) : 1),
        0,
    );
}

/** The document as dotted leaves — `kyc.reviewSlaHours: 48` — the way the audit diff names them. */
export function flattenSettings(value: Record<string, unknown>, prefix = ""): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (isPlainObject(item)) Object.assign(out, flattenSettings(item, path));
        else out[path] = item;
    }
    return out;
}

/**
 * A whole number inside the schema's bounds, or null. The inputs hold text
 * while somebody is typing; this is what decides whether "0" or "" can be
 * sent, and the answer is no.
 */
export function parseBounded(text: string, bounds: { min: number; max: number }): number | null {
    if (!/^\d+$/.test(text.trim())) return null;
    const value = Number(text.trim());
    return value >= bounds.min && value <= bounds.max ? value : null;
}

/** The same for a number the schema lets be fractional — the escalation multiplier (`1.5 ×` is a valid answer). */
export function parseBoundedDecimal(text: string, bounds: { min: number; max: number }): number | null {
    if (!/^\d+(\.\d+)?$/.test(text.trim())) return null;
    const value = Number(text.trim());
    return value >= bounds.min && value <= bounds.max ? value : null;
}

/** These screens read the API or say they cannot; a seeded floor would be a lie about checkout. */
export const settingsReadApi = (): boolean => apiConfig.live;

export const settingsService = {
    get: (): Promise<PlatformSettings> => http.get<PlatformSettings>("/settings/platform"),

    /** A deep patch. Naming one number leaves the fifteen beside it alone. */
    update: (patch: PlatformSettingsPatch): Promise<PlatformSettings> =>
        http.put<PlatformSettings>("/settings/platform", patch),
};
