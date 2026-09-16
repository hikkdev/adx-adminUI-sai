import * as React from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

/**
 * Lot J2: the Subscriptions card. What this pins: the proration switch is
 * live under Replace now and disabled under Queue after the current term,
 * keeping its value either way; unticking the last cycle draws the
 * at-least-one rule rather than letting the form lie quiet; the trial rows
 * are the catalogue's tiers, an unnamed one drawn empty; the header says
 * where GST is.
 */

import type { SubscriptionAudience } from "@/services/settings";
import { fromDraft, toDraft, type SettingsDraft, type SubscriptionPolicyDraft } from "./settings-form";
import { SubscriptionsCard, TAX_SETTING_HREF, trialTiers, type PolicyTiers } from "./subscriptions-card";

const policy = (over: Partial<SubscriptionPolicyDraft> = {}): SubscriptionPolicyDraft => ({
    cyclesOffered: ["MONTHLY", "ANNUAL"],
    annualDiscountPct: "20",
    changePolicy: "REPLACE_NOW",
    prorateOnChange: true,
    graceDays: "0",
    trialDays: { STANDARD: "0", PLUS: "14", PRO: "0" },
    reminderLeadDays: "7",
    unpaidOrderExpiryDays: "7",
    walletAllowed: true,
    gatewaysAllowed: ["RAZORPAY", "CASHFREE", "CCAVENUE"],
    autoRenewAllowed: false,
    ...over,
});

/** The card as the page holds it: the draft in state, the errors from the same parser the page uses. */
function Harness({ tiers }: { tiers: PolicyTiers }) {
    const [draft, setDraft] = React.useState<Record<SubscriptionAudience, SubscriptionPolicyDraft>>({
        publisher: policy(),
        advertiser: policy({ trialDays: { STARTER: "0", GROWTH: "0", PRO: "0" } }),
    });
    const errors = fromDraft({ ...blankDraft, subscriptions: draft }).errors;
    return (
        <SubscriptionsCard
            draft={draft}
            tiers={tiers}
            invalid={(id) => errors.has(id)}
            onChange={(audience, patch) => setDraft((current) => ({ ...current, [audience]: { ...current[audience], ...patch } }))}
        />
    );
}

const blankDraft: SettingsDraft = toDraft({
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
    finance: { primaryRail: "MANUAL_NEFT", railFallbackOrder: [], payoutEtaHours: 48, clearingDays: 7 },
});

const tiers: PolicyTiers = { publisher: ["STANDARD", "PLUS", "PRO"], advertiser: ["STARTER", "GROWTH", "PRO"] };

describe("the proration switch", () => {
    it("is live under Replace now and disabled under Queue after the current term, keeping its value", () => {
        render(<Harness tiers={tiers} />);
        const prorate = screen.getByTestId("subscriptions.publisher.prorateOnChange");
        expect(prorate).toBeEnabled();
        expect(prorate).toBeChecked();

        fireEvent.click(screen.getByRole("radio", { name: /Queue after the current term/ }));
        expect(screen.getByTestId("subscriptions.publisher.prorateOnChange")).toBeDisabled();
        expect(screen.getByTestId("subscriptions.publisher.prorateOnChange")).toBeChecked();
        expect(screen.getByText(/a queued plan replaces nothing/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole("radio", { name: /Replace now/ }));
        expect(screen.getByTestId("subscriptions.publisher.prorateOnChange")).toBeEnabled();
    });
});

describe("the cycle set", () => {
    it("names the at-least-one rule once the last cycle is unticked", () => {
        render(<Harness tiers={tiers} />);
        fireEvent.click(screen.getByLabelText("Annual"));
        expect(screen.queryByText("At least one cycle must be offered.")).not.toBeInTheDocument();
        fireEvent.click(screen.getByLabelText("Monthly"));
        expect(screen.getByText("At least one cycle must be offered.")).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText("Annual"));
        expect(screen.queryByText("At least one cycle must be offered.")).not.toBeInTheDocument();
    });
});

describe("the trial rows", () => {
    it("are the catalogue's tiers in its order, then the policy's own; an unnamed tier is drawn empty", () => {
        expect(trialTiers(["PRO", "PLUS"], { STANDARD: "0", PLUS: "14" })).toEqual(["PRO", "PLUS", "STANDARD"]);
        render(<Harness tiers={{ ...tiers, publisher: ["STANDARD", "PLUS", "PRO", "ENTERPRISE"] }} />);
        expect(screen.getByLabelText("PLUS")).toHaveValue("14");
        expect(screen.getByLabelText("ENTERPRISE")).toHaveValue("");
        expect(screen.getByLabelText("ENTERPRISE")).toHaveAttribute("placeholder", "0");
    });

    it("falls back to the policy's own tiers when the catalogue could not be read", () => {
        render(<Harness tiers={{ publisher: [], advertiser: [] }} />);
        const card = within(screen.getByTestId("policy-publisher"));
        expect(card.getByLabelText("STANDARD")).toBeInTheDocument();
        expect(card.getByLabelText("PRO")).toBeInTheDocument();
    });
});

describe("the header", () => {
    it("says GST lives under Pricing › Tax and links there", () => {
        render(<Harness tiers={tiers} />);
        const line = screen.getByTestId("subscriptions-gst-line");
        expect(line).toHaveTextContent("GST is set under Pricing › Tax");
        expect(within(line).getByRole("link")).toHaveAttribute("href", TAX_SETTING_HREF);
    });

    it("switches audience on the tab", () => {
        render(<Harness tiers={tiers} />);
        fireEvent.mouseDown(screen.getByRole("tab", { name: "Advertisers" }));
        fireEvent.click(screen.getByRole("tab", { name: "Advertisers" }));
        expect(screen.getByTestId("policy-advertiser")).toBeInTheDocument();
        expect(screen.getByLabelText("GROWTH")).toBeInTheDocument();
    });
});
