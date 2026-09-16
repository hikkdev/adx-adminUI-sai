import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

/**
 * Lot J2: the rules strip above the plan cards. What this pins: every cell
 * is read off the platform row's policy and revenue's tax row — the cycles
 * as offered, the discount, the GST as a percentage, the change policy with
 * its proration, the grace, the trial tiers, auto-renew — and the strip
 * links to the Settings card; a backend without the section says so and
 * still prints the GST it could read.
 */

import type { SubscriptionPolicy } from "@/services/settings";
import { RULES_SETTINGS_HREF, RulesStripView, ruleCells, trialSummary } from "./rules-strip";

const policy: SubscriptionPolicy = {
    cyclesOffered: ["MONTHLY", "ANNUAL"],
    annualDiscountPct: 20,
    changePolicy: "REPLACE_NOW",
    prorateOnChange: true,
    graceDays: 7,
    trialDays: { STANDARD: 0, PLUS: 14, PRO: 30 },
    reminderLeadDays: 7,
    unpaidOrderExpiryDays: 7,
    payment: { walletAllowed: true, gatewaysAllowed: ["RAZORPAY"] },
    autoRenew: { allowed: true, chargeFromWallet: true },
};

describe("ruleCells", () => {
    it("reads every cell off the policy and the tax row", () => {
        expect(ruleCells({ policy, tax: { mediaGstPct: "0.18" } })).toEqual([
            { label: "Cycles", value: "Monthly · Annual" },
            { label: "Annual discount", value: "20%" },
            { label: "GST", value: "18%" },
            { label: "Change of plan", value: "Replace now, prorated" },
            { label: "Grace", value: "7 days" },
            { label: "Trial", value: "PLUS 14 days, PRO 30 days" },
            { label: "Auto-renew", value: "allowed, charged from the wallet" },
        ]);
    });

    it("says when a cycle, a trial or a renewal is not offered", () => {
        const cells = ruleCells({
            policy: {
                ...policy,
                cyclesOffered: ["MONTHLY"],
                changePolicy: "QUEUE_AFTER_TERM",
                graceDays: 0,
                trialDays: { STANDARD: 0 },
                autoRenew: { allowed: false, chargeFromWallet: true },
            },
            tax: null,
        });
        expect(Object.fromEntries(cells.map((cell) => [cell.label, cell.value]))).toEqual({
            Cycles: "Monthly",
            "Annual discount": "20% (Annual not offered)",
            GST: "not read",
            "Change of plan": "Queue after the current term",
            Grace: "none",
            Trial: "none",
            "Auto-renew": "not offered",
        });
        expect(trialSummary({ PRO: 1 })).toBe("PRO 1 day");
    });

    it("keeps the GST when the backend does not serve the policy", () => {
        expect(ruleCells({ policy: null, tax: { mediaGstPct: "0.18" } })).toEqual([{ label: "GST", value: "18%" }]);
    });
});

describe("RulesStripView", () => {
    it("prints the cells and links to the Settings card", () => {
        render(<RulesStripView audience="publisher" rules={{ policy, tax: { mediaGstPct: "0.18" } }} />);
        const strip = within(screen.getByTestId("rules-strip-publisher"));
        expect(strip.getByText("Monthly · Annual")).toBeInTheDocument();
        expect(strip.getByText("18%")).toBeInTheDocument();
        expect(strip.getByText("PLUS 14 days, PRO 30 days")).toBeInTheDocument();
        expect(strip.getByRole("link", { name: "Edit in Settings" })).toHaveAttribute("href", RULES_SETTINGS_HREF);
    });

    it("says so when the section is not served", () => {
        render(<RulesStripView audience="advertiser" rules={{ policy: null, tax: null }} />);
        expect(screen.getByText("This backend does not serve the purchase rules.")).toBeInTheDocument();
    });
});
