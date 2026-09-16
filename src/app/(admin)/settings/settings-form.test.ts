import { describe, expect, it } from "vitest";

import type { PlatformSettings } from "@/services/settings";
import { draftPatch, fromDraft, toDraft } from "./settings-form";

/**
 * The Settings form's changed-keys diff.
 *
 * The draft is strings; the document is numbers. What Save sends is the
 * difference between the document the page loaded and the document the
 * draft parses to — and nothing while the draft has a field the schema
 * would refuse, because the server would say the same thing with a 400.
 */

const loaded: PlatformSettings = {
    kyc: { reviewSlaHours: 48, escalationSlaMultiplier: 2 },
    listings: { autoPublishOnVerification: true },
    marketplace: { minBookingDays: 1, maxMarketsPerCampaign: 3 },
    publisher: { spotInsightsVisible: false },
    retention: { financialYears: 8, kycYears: 8 },
    support: {
        sla: {
            URGENT: { firstResponseHours: 1, resolutionHours: 4 },
            HIGH: { firstResponseHours: 4, resolutionHours: 24 },
            NORMAL: { firstResponseHours: 8, resolutionHours: 72 },
            LOW: { firstResponseHours: 24, resolutionHours: 168 },
        },
    },
    auth: { adminPasswordLoginEnabled: true },
    installation: { commissionMode: "FLAT" },
    finance: { primaryRail: "MANUAL_NEFT", railFallbackOrder: ["RAZORPAY_X", "CASHFREE", "MANUAL_NEFT"], payoutEtaHours: 48, clearingDays: 7 },
};

describe("toDraft / fromDraft", () => {
    it("round-trips the document unchanged", () => {
        expect(fromDraft(toDraft(loaded)).settings).toEqual(loaded);
    });

    it("names every field that is out of range and parses to nothing", () => {
        const draft = toDraft(loaded);
        draft.kycReviewSlaHours = "0";
        draft.sla.HIGH.resolutionHours = "";
        const parsed = fromDraft(draft);
        expect(parsed.settings).toBeNull();
        expect([...parsed.errors].sort()).toEqual(["kyc.reviewSlaHours", "sla.HIGH.resolutionHours"]);
    });
});

describe("draftPatch", () => {
    it("is empty when the draft still matches what was loaded", () => {
        expect(draftPatch(loaded, toDraft(loaded))).toEqual({});
    });

    it("sends only the leaf that moved, in the PUT's nested shape", () => {
        const draft = toDraft(loaded);
        draft.minBookingDays = "3";
        expect(draftPatch(loaded, draft)).toEqual({ marketplace: { minBookingDays: 3 } });
    });

    it("sends one SLA number without the other seven", () => {
        const draft = toDraft(loaded);
        draft.sla.URGENT.firstResponseHours = "2";
        expect(draftPatch(loaded, draft)).toEqual({ support: { sla: { URGENT: { firstResponseHours: 2 } } } });
    });

    it("treats retyping the same number as no change", () => {
        const draft = toDraft(loaded);
        draft.kycReviewSlaHours = " 48 ";
        expect(draftPatch(loaded, draft)).toEqual({});
    });

    it("is null while any field is out of range, whatever else moved", () => {
        const draft = toDraft(loaded);
        draft.autoPublishOnVerification = false;
        draft.maxMarketsPerCampaign = "51";
        expect(draftPatch(loaded, draft)).toBeNull();
    });

    it("Lot N: sends the print-partner activation gate alone when only it moved, and nothing when the backend never served it", () => {
        const served: PlatformSettings = { ...loaded, kyc: { ...loaded.kyc, printPartnerActivationRequiresKyc: false } };
        const draft = toDraft(served);
        expect(draft.printPartnerActivationRequiresKyc).toBe(false);
        draft.printPartnerActivationRequiresKyc = true;
        expect(draftPatch(served, draft)).toEqual({ kyc: { printPartnerActivationRequiresKyc: true } });

        const unserved = toDraft(loaded);
        expect(unserved.printPartnerActivationRequiresKyc).toBeNull();
        expect(draftPatch(loaded, unserved)).toEqual({});
    });

    it("carries a switch and a select beside a number", () => {
        const draft = toDraft(loaded);
        draft.adminPasswordLoginEnabled = false;
        draft.commissionMode = "PER_ORDER";
        draft.financialYears = "10";
        expect(draftPatch(loaded, draft)).toEqual({
            retention: { financialYears: 10 },
            auth: { adminPasswordLoginEnabled: false },
            installation: { commissionMode: "PER_ORDER" },
        });
    });
});

/**
 * Lot I: the live-chat block.
 *
 * It is optional on the read, because a backend older than the section serves
 * none — and the difference between "not served" and "off" matters: drawing a
 * default for a section the server does not hold would save settings nobody
 * asked for the first time somebody touched an unrelated field.
 */
const withLiveChat: PlatformSettings = {
    ...loaded,
    support: {
        ...loaded.support,
        liveChat: {
            enabled: true,
            hours: { from: "09:00", to: "21:00", tz: "Asia/Kolkata" },
            firstResponseTargetSec: 120,
            publisherTiers: [],
            attachmentMaxMb: 10,
        },
    },
};

describe("the live-chat block", () => {
    it("round-trips unchanged", () => {
        expect(fromDraft(toDraft(withLiveChat)).settings).toEqual(withLiveChat);
    });

    it("is left out entirely when the backend does not serve it", () => {
        const draft = toDraft(loaded);
        expect(draft.liveChat).toBeNull();
        expect(fromDraft(draft).settings?.support.liveChat).toBeUndefined();
    });

    it("sends only the leaf that moved", () => {
        const draft = toDraft(withLiveChat);
        draft.liveChat!.firstResponseTargetSec = "90";
        expect(draftPatch(withLiveChat, draft)).toEqual({ support: { liveChat: { firstResponseTargetSec: 90 } } });
    });

    it("reads a tier list as typed, and an empty field as every tier", () => {
        const draft = toDraft(withLiveChat);
        draft.liveChat!.publisherTiers = " growth , pro ";
        expect(draftPatch(withLiveChat, draft)).toEqual({ support: { liveChat: { publisherTiers: ["GROWTH", "PRO"] } } });
        draft.liveChat!.publisherTiers = "   ";
        expect(draftPatch(withLiveChat, draft)).toEqual({});
    });

    it("refuses a target or a clock time the schema would refuse", () => {
        const draft = toDraft(withLiveChat);
        draft.liveChat!.firstResponseTargetSec = "5";
        draft.liveChat!.from = "9am";
        const parsed = fromDraft(draft);
        expect(parsed.settings).toBeNull();
        expect([...parsed.errors].sort()).toEqual([
            "support.liveChat.firstResponseTargetSec",
            "support.liveChat.hours.from",
        ]);
    });
});

/**
 * Lot J2: the two subscription policies.
 *
 * Optional on the read like the other late sections. What matters here is
 * the diff: a number moved on one audience sends that leaf under that
 * audience and nothing else; a trial-days tier goes up on its own because
 * the server merges the record tier by tier; the two lists replace whole;
 * the cycle set may not be emptied; a tier the catalogue names but the
 * policy does not is never sent untouched.
 */
const withSubscriptions: PlatformSettings = {
    ...loaded,
    subscriptions: {
        publisher: {
            cyclesOffered: ["MONTHLY", "ANNUAL"],
            annualDiscountPct: 20,
            changePolicy: "REPLACE_NOW",
            prorateOnChange: false,
            graceDays: 0,
            trialDays: { STANDARD: 0, PLUS: 0, PRO: 0 },
            reminderLeadDays: 7,
            unpaidOrderExpiryDays: 7,
            payment: { walletAllowed: true, gatewaysAllowed: ["RAZORPAY", "CASHFREE", "CCAVENUE"] },
            autoRenew: { allowed: false, chargeFromWallet: true },
        },
        advertiser: {
            cyclesOffered: ["MONTHLY", "ANNUAL"],
            annualDiscountPct: 20,
            changePolicy: "REPLACE_NOW",
            prorateOnChange: false,
            graceDays: 0,
            trialDays: { STARTER: 0, GROWTH: 0, PRO: 0 },
            reminderLeadDays: 7,
            unpaidOrderExpiryDays: 7,
            payment: { walletAllowed: true, gatewaysAllowed: ["RAZORPAY", "CASHFREE", "CCAVENUE"] },
            autoRenew: { allowed: false, chargeFromWallet: true },
        },
    },
};

describe("the subscription policies", () => {
    it("round-trip unchanged", () => {
        expect(fromDraft(toDraft(withSubscriptions)).settings).toEqual(withSubscriptions);
        expect(draftPatch(withSubscriptions, toDraft(withSubscriptions))).toEqual({});
    });

    it("are left out entirely when the backend does not serve them", () => {
        const draft = toDraft(loaded);
        expect(draft.subscriptions).toBeNull();
        expect(fromDraft(draft).settings?.subscriptions).toBeUndefined();
    });

    it("sends one number under its audience and nothing else", () => {
        const draft = toDraft(withSubscriptions);
        draft.subscriptions!.publisher.graceDays = "7";
        expect(draftPatch(withSubscriptions, draft)).toEqual({ subscriptions: { publisher: { graceDays: 7 } } });
    });

    it("sends a trial-days tier on its own, and a switch beside it", () => {
        const draft = toDraft(withSubscriptions);
        draft.subscriptions!.advertiser.trialDays = { ...draft.subscriptions!.advertiser.trialDays, GROWTH: "14" };
        draft.subscriptions!.advertiser.autoRenewAllowed = true;
        expect(draftPatch(withSubscriptions, draft)).toEqual({
            subscriptions: { advertiser: { trialDays: { GROWTH: 14 }, autoRenew: { allowed: true } } },
        });
    });

    it("replaces a list whole, and the change policy with the proration flag it carries", () => {
        const draft = toDraft(withSubscriptions);
        draft.subscriptions!.publisher.gatewaysAllowed = ["RAZORPAY"];
        draft.subscriptions!.publisher.cyclesOffered = ["MONTHLY"];
        draft.subscriptions!.publisher.changePolicy = "QUEUE_AFTER_TERM";
        expect(draftPatch(withSubscriptions, draft)).toEqual({
            subscriptions: {
                publisher: { cyclesOffered: ["MONTHLY"], changePolicy: "QUEUE_AFTER_TERM", payment: { gatewaysAllowed: ["RAZORPAY"] } },
            },
        });
    });

    it("refuses an empty cycle set, and a number the schema would refuse", () => {
        const draft = toDraft(withSubscriptions);
        draft.subscriptions!.publisher.cyclesOffered = [];
        draft.subscriptions!.advertiser.annualDiscountPct = "95";
        draft.subscriptions!.advertiser.reminderLeadDays = "0";
        const parsed = fromDraft(draft);
        expect(parsed.settings).toBeNull();
        expect([...parsed.errors].sort()).toEqual([
            "subscriptions.advertiser.annualDiscountPct",
            "subscriptions.advertiser.reminderLeadDays",
            "subscriptions.publisher.cyclesOffered",
        ]);
        expect(draftPatch(withSubscriptions, draft)).toBeNull();
    });

    it("never sends a tier it was not given: the draft holds only the policy's own", () => {
        const draft = toDraft(withSubscriptions);
        expect(Object.keys(draft.subscriptions!.publisher.trialDays)).toEqual(["STANDARD", "PLUS", "PRO"]);
        draft.subscriptions!.publisher.trialDays = { ...draft.subscriptions!.publisher.trialDays, ENTERPRISE: "30" };
        expect(draftPatch(withSubscriptions, draft)).toEqual({ subscriptions: { publisher: { trialDays: { ENTERPRISE: 30 } } } });
    });
});

/**
 * Lot K2: the authenticator-app policy — `auth.adminTwoFactor`. Optional on
 * the read for the same reason as the live-chat block: a backend without it
 * gets a card that says so, never a default that would save on the next
 * unrelated Save.
 */
const withPolicy: PlatformSettings = {
    ...loaded,
    auth: { adminPasswordLoginEnabled: true, adminTwoFactor: { authenticatorRequired: false, smsAllowedWhenEnrolled: true } },
};

describe("the admin sign-in policy", () => {
    it("round-trips unchanged and is left out when the backend does not serve it", () => {
        expect(fromDraft(toDraft(withPolicy)).settings).toEqual(withPolicy);
        const draft = toDraft(loaded);
        expect(draft.adminTwoFactor).toBeNull();
        expect(fromDraft(draft).settings?.auth).toEqual({ adminPasswordLoginEnabled: true });
        expect(draftPatch(withPolicy, toDraft(withPolicy))).toEqual({});
    });

    it("sends only the switch that moved, in the PUT's nested shape", () => {
        const draft = toDraft(withPolicy);
        draft.adminTwoFactor!.authenticatorRequired = true;
        expect(draftPatch(withPolicy, draft)).toEqual({ auth: { adminTwoFactor: { authenticatorRequired: true } } });

        const other = toDraft(withPolicy);
        other.adminTwoFactor!.smsAllowedWhenEnrolled = false;
        other.adminPasswordLoginEnabled = false;
        expect(draftPatch(withPolicy, other)).toEqual({ auth: { adminPasswordLoginEnabled: false, adminTwoFactor: { smsAllowedWhenEnrolled: false } } });
    });

    it("treats flipping a switch back as no change", () => {
        const draft = toDraft(withPolicy);
        draft.adminTwoFactor!.authenticatorRequired = true;
        draft.adminTwoFactor!.authenticatorRequired = false;
        expect(draftPatch(withPolicy, draft)).toEqual({});
    });
});
