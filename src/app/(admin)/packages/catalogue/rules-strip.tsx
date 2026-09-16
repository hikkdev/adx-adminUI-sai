"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { useApiResource } from "@/lib/use-api-resource";
import { formatRate, revenueService } from "@/services/revenue";
import {
    SUBSCRIPTION_CHANGE_POLICY_LABEL,
    SUBSCRIPTION_CYCLE_LABEL,
    settingsReadApi,
    settingsService,
    type SubscriptionAudience,
    type SubscriptionPolicy,
} from "@/services/settings";
import type { TaxSettings } from "@/types/revenue";

/** Where the rules are edited: the Subscriptions card on the general Settings page. */
export const RULES_SETTINGS_HREF = "/settings#subscriptions";

/** What the strip read: the audience's policy, or null when the backend does not serve the section; the tax row, or null when it could not be read. */
export interface PlanRules {
    policy: SubscriptionPolicy | null;
    tax: TaxSettings | null;
}

/** "PLUS 14, PRO 30" for the tiers that offer a trial, or "none". */
export function trialSummary(trialDays: Record<string, number>): string {
    const offered = Object.entries(trialDays).filter(([, days]) => days > 0);
    return offered.length === 0 ? "none" : offered.map(([tier, days]) => `${tier} ${days} ${days === 1 ? "day" : "days"}`).join(", ");
}

/** The strip's cells, in order, from the policy and the tax row. Pure, so the test can pin the words. */
export function ruleCells(rules: PlanRules): { label: string; value: string }[] {
    const { policy, tax } = rules;
    const gst = tax ? formatRate(tax.mediaGstPct) : "not read";
    if (!policy) return [{ label: "GST", value: gst }];
    const annual = policy.cyclesOffered.includes("ANNUAL");
    return [
        { label: "Cycles", value: policy.cyclesOffered.map((cycle) => SUBSCRIPTION_CYCLE_LABEL[cycle]).join(" · ") },
        { label: "Annual discount", value: annual ? `${policy.annualDiscountPct}%` : `${policy.annualDiscountPct}% (Annual not offered)` },
        { label: "GST", value: gst },
        {
            label: "Change of plan",
            value:
                policy.changePolicy === "REPLACE_NOW"
                    ? `${SUBSCRIPTION_CHANGE_POLICY_LABEL.REPLACE_NOW}${policy.prorateOnChange ? ", prorated" : ", no proration"}`
                    : SUBSCRIPTION_CHANGE_POLICY_LABEL.QUEUE_AFTER_TERM,
        },
        { label: "Grace", value: policy.graceDays === 0 ? "none" : `${policy.graceDays} ${policy.graceDays === 1 ? "day" : "days"}` },
        { label: "Trial", value: trialSummary(policy.trialDays) },
        { label: "Auto-renew", value: policy.autoRenew.allowed ? "allowed, charged from the wallet" : "not offered" },
    ];
}

/**
 * The read-only strip above the plan cards — Lot J2.
 *
 * A price on a card is sold under rules that live on the platform row, not
 * on the plan: which cycles, the annual discount, the GST on top, what a
 * change does, the grace, the trials, whether it renews on its own. The
 * strip prints them so an operator editing a price sees the whole deal,
 * and links to the card that edits them.
 */
export function RulesStripView({ audience, rules }: { audience: SubscriptionAudience; rules: PlanRules }) {
    const cells = ruleCells(rules);
    return (
        <Card className="rounded-lg border-border bg-muted/40 px-4 py-3 shadow-none" data-testid={`rules-strip-${audience}`}>
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                    {cells.map((cell) => (
                        <div key={cell.label} className="min-w-0">
                            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{cell.label}</dt>
                            <dd className="text-foreground">{cell.value}</dd>
                        </div>
                    ))}
                </dl>
                <p className="text-xs text-muted-foreground">
                    {rules.policy ? "Sold under these rules." : "This backend does not serve the purchase rules."}{" "}
                    <Link href={RULES_SETTINGS_HREF} className="font-medium text-foreground underline-offset-4 hover:underline">
                        Edit in Settings
                    </Link>
                </p>
            </div>
        </Card>
    );
}

/** The two reads behind the strip: the platform row's policy for the audience, and revenue's tax row. Each fails on its own. */
export function RulesStrip({ audience }: { audience: SubscriptionAudience }) {
    const live = settingsReadApi();
    const resource = useApiResource<PlanRules>(`packages:rules:${audience}:${live}`, async () => {
        if (!live) return { policy: null, tax: null };
        const [settings, tax] = await Promise.all([
            settingsService.get().catch(() => null),
            revenueService.tax().catch(() => null),
        ]);
        return { policy: settings?.subscriptions?.[audience] ?? null, tax };
    });
    if (!live || !resource.data) return null;
    return <RulesStripView audience={audience} rules={resource.data} />;
}
