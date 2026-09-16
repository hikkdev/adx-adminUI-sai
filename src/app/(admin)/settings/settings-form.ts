import {
    CLOCK_TIME_PATTERN,
    SETTING_BOUNDS,
    SUBSCRIPTION_AUDIENCES,
    SUPPORT_PRIORITIES,
    changedKeys,
    parseBounded,
    parseBoundedDecimal,
    parseWorkloadThreshold,
    type CommsSettings,
    type FinanceSettings,
    type HrSettings,
    type InstallationCommissionMode,
    type LiveChatSettings,
    type PlatformSettings,
    type PlatformSettingsPatch,
    type SubscriptionAudience,
    type SubscriptionChangePolicy,
    type SubscriptionCycle,
    type SubscriptionPolicies,
    type SubscriptionPolicy,
    type SupportPriority,
} from "@/services/settings";
import type { PaymentGateway } from "@/services/payments";
import type { AdminTwoFactorPolicy } from "@/services/two-factor";

/**
 * The Settings form's state, kept apart from the document it edits.
 *
 * Inputs hold text while somebody types — "4" on the way to "48" is not a
 * number the schema would take, and clearing a field to retype it is not a
 * request to set it to zero. So the draft is strings, the document is
 * numbers, and `fromDraft` is the one place that decides whether the draft
 * is a document yet.
 */

export interface SlaDraft {
    firstResponseHours: string;
    resolutionHours: string;
}

/** Lot G (Q117): the quiet-hours window as typed, and the cap as text. */
export interface CommsDraft {
    quietFrom: string;
    quietTo: string;
    quietTz: string;
    weeklyCapPerUser: string;
}

/**
 * Lot I: the live-chat block as typed.
 *
 * `publisherTiers` is a comma-separated list in the field and an array in the
 * document — empty meaning every running subscription is entitled, which is
 * the default and the thing an operator most often means.
 */
export interface LiveChatDraft {
    enabled: boolean;
    from: string;
    to: string;
    tz: string;
    firstResponseTargetSec: string;
    publisherTiers: string;
    attachmentMaxMb: string;
}

/** "STARTER, GROWTH" → ["STARTER", "GROWTH"]; an empty field is every tier, not no tier. */
export function parseTierList(text: string): string[] {
    return text
        .split(",")
        .map((part) => part.trim().toUpperCase())
        .filter((part) => part.length > 0);
}

/**
 * Lot J2: one audience's purchase rules as typed.
 *
 * The lists (`cyclesOffered`, `gatewaysAllowed`) are the checkbox sets as
 * they stand; `trialDays` holds only the tiers the document carries — a tier
 * the catalogue names but the policy does not is drawn empty with "0" as
 * its placeholder, and typing into it adds the key, so an untouched tier is
 * never sent. `prorateOnChange` keeps its value under QUEUE_AFTER_TERM (the
 * server ignores it there); the card disables the switch rather than
 * flipping a setting nobody touched.
 */
export interface SubscriptionPolicyDraft {
    cyclesOffered: SubscriptionCycle[];
    annualDiscountPct: string;
    changePolicy: SubscriptionChangePolicy;
    prorateOnChange: boolean;
    graceDays: string;
    trialDays: Record<string, string>;
    reminderLeadDays: string;
    unpaidOrderExpiryDays: string;
    walletAllowed: boolean;
    gatewaysAllowed: PaymentGateway[];
    autoRenewAllowed: boolean;
}

export interface SettingsDraft {
    kycReviewSlaHours: string;
    /** Lot G (Q127/142): may be fractional — "1.5" is a valid multiplier. */
    kycEscalationSlaMultiplier: string;
    /**
     * Lot N: a print partner must pass KYC before activation. Null when the
     * backend did not serve the leaf (a server older than the setting), and
     * the switch says so rather than drawing a default that would save wrongly.
     */
    printPartnerActivationRequiresKyc: boolean | null;
    autoPublishOnVerification: boolean;
    minBookingDays: string;
    maxMarketsPerCampaign: string;
    spotInsightsVisible: boolean;
    financialYears: string;
    kycYears: string;
    sla: Record<SupportPriority, SlaDraft>;
    /** Lot I: the live-chat block. Null when the backend did not serve it, and the card says so. */
    liveChat: LiveChatDraft | null;
    adminPasswordLoginEnabled: boolean;
    /**
     * Lot K2: the authenticator-app policy's two switches. Null when the
     * backend did not serve `auth.adminTwoFactor`, and the Admin sign-in
     * card says so rather than drawing defaults that would save wrongly.
     */
    adminTwoFactor: AdminTwoFactorPolicy | null;
    commissionMode: InstallationCommissionMode;
    /** Carried through untouched: the rails are edited on /finance/settings, not here. */
    finance: FinanceSettings;
    /** Lot G (Q117): the Comms card. Null when the backend did not serve the section, and the card says so. */
    comms: CommsDraft | null;
    /** Lot G (Q120): the workload bands as typed. Null when the backend did not serve the section, and the People card says so. */
    hr: { workloadMedium: string; workloadHigh: string } | null;
    /** Lot J2: the two purchase policies as typed. Null when the backend did not serve the section, and the Subscriptions card says so. */
    subscriptions: Record<SubscriptionAudience, SubscriptionPolicyDraft> | null;
}

function toPolicyDraft(policy: SubscriptionPolicy): SubscriptionPolicyDraft {
    return {
        cyclesOffered: [...policy.cyclesOffered],
        annualDiscountPct: String(policy.annualDiscountPct),
        changePolicy: policy.changePolicy,
        prorateOnChange: policy.prorateOnChange,
        graceDays: String(policy.graceDays),
        trialDays: Object.fromEntries(Object.entries(policy.trialDays).map(([tier, days]) => [tier, String(days)])),
        reminderLeadDays: String(policy.reminderLeadDays),
        unpaidOrderExpiryDays: String(policy.unpaidOrderExpiryDays),
        walletAllowed: policy.payment.walletAllowed,
        gatewaysAllowed: [...policy.payment.gatewaysAllowed],
        autoRenewAllowed: policy.autoRenew.allowed,
    };
}

export function toDraft(settings: PlatformSettings): SettingsDraft {
    const sla = {} as Record<SupportPriority, SlaDraft>;
    for (const priority of SUPPORT_PRIORITIES) {
        sla[priority] = {
            firstResponseHours: String(settings.support.sla[priority].firstResponseHours),
            resolutionHours: String(settings.support.sla[priority].resolutionHours),
        };
    }
    return {
        kycReviewSlaHours: String(settings.kyc.reviewSlaHours),
        kycEscalationSlaMultiplier: String(settings.kyc.escalationSlaMultiplier),
        printPartnerActivationRequiresKyc: settings.kyc.printPartnerActivationRequiresKyc ?? null,
        autoPublishOnVerification: settings.listings.autoPublishOnVerification,
        minBookingDays: String(settings.marketplace.minBookingDays),
        maxMarketsPerCampaign: String(settings.marketplace.maxMarketsPerCampaign),
        spotInsightsVisible: settings.publisher.spotInsightsVisible,
        financialYears: String(settings.retention.financialYears),
        kycYears: String(settings.retention.kycYears),
        sla,
        liveChat: settings.support.liveChat
            ? {
                  enabled: settings.support.liveChat.enabled,
                  from: settings.support.liveChat.hours.from,
                  to: settings.support.liveChat.hours.to,
                  tz: settings.support.liveChat.hours.tz,
                  firstResponseTargetSec: String(settings.support.liveChat.firstResponseTargetSec),
                  publisherTiers: settings.support.liveChat.publisherTiers.join(", "),
                  attachmentMaxMb: String(settings.support.liveChat.attachmentMaxMb),
              }
            : null,
        adminPasswordLoginEnabled: settings.auth.adminPasswordLoginEnabled,
        adminTwoFactor: settings.auth.adminTwoFactor ? { ...settings.auth.adminTwoFactor } : null,
        commissionMode: settings.installation.commissionMode,
        finance: settings.finance,
        comms: settings.comms
            ? {
                  quietFrom: settings.comms.quietHours.from,
                  quietTo: settings.comms.quietHours.to,
                  quietTz: settings.comms.quietHours.tz,
                  weeklyCapPerUser: String(settings.comms.weeklyCapPerUser),
              }
            : null,
        hr: settings.hr
            ? { workloadMedium: String(settings.hr.workloadThresholds.medium), workloadHigh: String(settings.hr.workloadThresholds.high) }
            : null,
        subscriptions: settings.subscriptions
            ? { publisher: toPolicyDraft(settings.subscriptions.publisher), advertiser: toPolicyDraft(settings.subscriptions.advertiser) }
            : null,
    };
}

/** Field ids that failed the schema's bounds — the ones drawn red. */
export type DraftErrors = Set<string>;

/**
 * The draft as a document, or the fields that stop it being one.
 *
 * Every number goes through the same bounds the server applies, so a Save
 * with a bad value never leaves the browser: the server would answer 400
 * and say the same thing, less kindly.
 */
export function fromDraft(draft: SettingsDraft): { settings: PlatformSettings; errors: DraftErrors } | { settings: null; errors: DraftErrors } {
    const errors: DraftErrors = new Set();
    const number = (id: string, text: string, bounds: { min: number; max: number }): number => {
        const value = parseBounded(text, bounds);
        if (value === null) {
            errors.add(id);
            return 0;
        }
        return value;
    };

    const sla = {} as PlatformSettings["support"]["sla"];
    for (const priority of SUPPORT_PRIORITIES) {
        sla[priority] = {
            firstResponseHours: number(`sla.${priority}.firstResponseHours`, draft.sla[priority].firstResponseHours, SETTING_BOUNDS.firstResponseHours),
            resolutionHours: number(`sla.${priority}.resolutionHours`, draft.sla[priority].resolutionHours, SETTING_BOUNDS.resolutionHours),
        };
    }

    let liveChat: LiveChatSettings | undefined;
    if (draft.liveChat) {
        const from = draft.liveChat.from.trim();
        const to = draft.liveChat.to.trim();
        const tz = draft.liveChat.tz.trim();
        if (!CLOCK_TIME_PATTERN.test(from)) errors.add("support.liveChat.hours.from");
        if (!CLOCK_TIME_PATTERN.test(to)) errors.add("support.liveChat.hours.to");
        if (tz.length === 0 || tz.length > 64) errors.add("support.liveChat.hours.tz");
        liveChat = {
            enabled: draft.liveChat.enabled,
            hours: { from, to, tz },
            firstResponseTargetSec: number(
                "support.liveChat.firstResponseTargetSec",
                draft.liveChat.firstResponseTargetSec,
                SETTING_BOUNDS["support.liveChat.firstResponseTargetSec"],
            ),
            // The order is kept as typed rather than sorted: it is a list of
            // tiers, and reordering somebody's typing under them reads as a bug.
            publisherTiers: parseTierList(draft.liveChat.publisherTiers),
            attachmentMaxMb: number(
                "support.liveChat.attachmentMaxMb",
                draft.liveChat.attachmentMaxMb,
                SETTING_BOUNDS["support.liveChat.attachmentMaxMb"],
            ),
        };
    }

    let comms: CommsSettings | undefined;
    if (draft.comms) {
        const from = draft.comms.quietFrom.trim();
        const to = draft.comms.quietTo.trim();
        const tz = draft.comms.quietTz.trim();
        if (!CLOCK_TIME_PATTERN.test(from)) errors.add("comms.quietHours.from");
        if (!CLOCK_TIME_PATTERN.test(to)) errors.add("comms.quietHours.to");
        if (tz.length === 0 || tz.length > 64) errors.add("comms.quietHours.tz");
        comms = {
            quietHours: { from, to, tz },
            weeklyCapPerUser: number("comms.weeklyCapPerUser", draft.comms.weeklyCapPerUser, SETTING_BOUNDS["comms.weeklyCapPerUser"]),
        };
    }

    let hr: HrSettings | undefined;
    if (draft.hr) {
        const medium = parseWorkloadThreshold(draft.hr.workloadMedium);
        const high = parseWorkloadThreshold(draft.hr.workloadHigh);
        if (medium === null) errors.add("hr.workloadThresholds.medium");
        // The schema's own rule: HIGH starts above MEDIUM, or there is no MEDIUM band.
        if (high === null || (medium !== null && high <= medium)) errors.add("hr.workloadThresholds.high");
        hr = { workloadThresholds: { medium: medium ?? 0, high: high ?? 0 } };
    }

    /* Lot J2: each policy back to the document, every number through the
       schema's bounds, the cycle list refused when empty (the server would
       say the same: a policy with nothing to sell is not a policy). */
    let subscriptions: SubscriptionPolicies | undefined;
    if (draft.subscriptions) {
        const policies = {} as SubscriptionPolicies;
        for (const audience of SUBSCRIPTION_AUDIENCES) {
            const policy = draft.subscriptions[audience];
            const id = (field: string) => `subscriptions.${audience}.${field}`;
            if (policy.cyclesOffered.length === 0) errors.add(id("cyclesOffered"));
            const trialDays: Record<string, number> = {};
            for (const [tier, text] of Object.entries(policy.trialDays)) {
                trialDays[tier] = number(id(`trialDays.${tier}`), text, SETTING_BOUNDS["subscriptions.trialDays"]);
            }
            policies[audience] = {
                cyclesOffered: [...policy.cyclesOffered],
                annualDiscountPct: number(id("annualDiscountPct"), policy.annualDiscountPct, SETTING_BOUNDS["subscriptions.annualDiscountPct"]),
                changePolicy: policy.changePolicy,
                prorateOnChange: policy.prorateOnChange,
                graceDays: number(id("graceDays"), policy.graceDays, SETTING_BOUNDS["subscriptions.graceDays"]),
                trialDays,
                reminderLeadDays: number(id("reminderLeadDays"), policy.reminderLeadDays, SETTING_BOUNDS["subscriptions.reminderLeadDays"]),
                unpaidOrderExpiryDays: number(
                    id("unpaidOrderExpiryDays"),
                    policy.unpaidOrderExpiryDays,
                    SETTING_BOUNDS["subscriptions.unpaidOrderExpiryDays"],
                ),
                payment: { walletAllowed: policy.walletAllowed, gatewaysAllowed: [...policy.gatewaysAllowed] },
                autoRenew: { allowed: policy.autoRenewAllowed, chargeFromWallet: true },
            };
        }
        subscriptions = policies;
    }

    const multiplier = parseBoundedDecimal(draft.kycEscalationSlaMultiplier, SETTING_BOUNDS["kyc.escalationSlaMultiplier"]);
    if (multiplier === null) errors.add("kyc.escalationSlaMultiplier");

    const settings: PlatformSettings = {
        kyc: {
            reviewSlaHours: number("kyc.reviewSlaHours", draft.kycReviewSlaHours, SETTING_BOUNDS["kyc.reviewSlaHours"]),
            escalationSlaMultiplier: multiplier ?? 0,
            ...(draft.printPartnerActivationRequiresKyc !== null ? { printPartnerActivationRequiresKyc: draft.printPartnerActivationRequiresKyc } : {}),
        },
        listings: { autoPublishOnVerification: draft.autoPublishOnVerification },
        marketplace: {
            minBookingDays: number("marketplace.minBookingDays", draft.minBookingDays, SETTING_BOUNDS["marketplace.minBookingDays"]),
            maxMarketsPerCampaign: number(
                "marketplace.maxMarketsPerCampaign",
                draft.maxMarketsPerCampaign,
                SETTING_BOUNDS["marketplace.maxMarketsPerCampaign"],
            ),
        },
        publisher: { spotInsightsVisible: draft.spotInsightsVisible },
        retention: {
            financialYears: number("retention.financialYears", draft.financialYears, SETTING_BOUNDS["retention.financialYears"]),
            kycYears: number("retention.kycYears", draft.kycYears, SETTING_BOUNDS["retention.kycYears"]),
        },
        support: { sla, ...(liveChat ? { liveChat } : {}) },
        auth: {
            adminPasswordLoginEnabled: draft.adminPasswordLoginEnabled,
            ...(draft.adminTwoFactor ? { adminTwoFactor: { ...draft.adminTwoFactor } } : {}),
        },
        installation: { commissionMode: draft.commissionMode },
        finance: draft.finance,
        ...(comms ? { comms } : {}),
        ...(hr ? { hr } : {}),
        ...(subscriptions ? { subscriptions } : {}),
    };

    return errors.size > 0 ? { settings: null, errors } : { settings, errors };
}

/**
 * What Save sends: the leaves that moved and nothing beside them. Null while
 * the draft has a field the schema would refuse, and `{}` when nothing moved.
 */
export function draftPatch(before: PlatformSettings, draft: SettingsDraft): PlatformSettingsPatch | null {
    const parsed = fromDraft(draft);
    if (!parsed.settings) return null;
    return changedKeys(
        before as unknown as Record<string, unknown>,
        parsed.settings as unknown as Record<string, unknown>,
    ) as PlatformSettingsPatch;
}
