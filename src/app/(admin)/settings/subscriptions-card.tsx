"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionCard } from "@/components/adx/section-card";
import { GATEWAY_LABEL } from "@/services/payments";
import {
    SETTING_BOUNDS,
    SUBSCRIPTION_AUDIENCES,
    SUBSCRIPTION_AUDIENCE_LABEL,
    SUBSCRIPTION_CHANGE_POLICIES,
    SUBSCRIPTION_CHANGE_POLICY_LABEL,
    SUBSCRIPTION_CYCLES,
    SUBSCRIPTION_CYCLE_LABEL,
    SUBSCRIPTION_GATEWAYS,
    type SubscriptionAudience,
    type SubscriptionChangePolicy,
} from "@/services/settings";
import type { SubscriptionPolicyDraft } from "./settings-form";

/** Where the one configurable GST is edited: revenue's tax row on the commission page. */
export const TAX_SETTING_HREF = "/finance/revenue#tax";

/** The tiers the plans and the catalogue name, per audience — what the trial-days rows are drawn for. */
export type PolicyTiers = Record<SubscriptionAudience, string[]>;

export const NO_TIERS: PolicyTiers = { publisher: [], advertiser: [] };

/** The catalogue's tiers first, in its order, then any tier the policy names that the catalogue does not. */
export function trialTiers(fromReads: string[], policy: Record<string, string>): string[] {
    const out = [...fromReads];
    for (const tier of Object.keys(policy)) if (!out.includes(tier)) out.push(tier);
    return out;
}

interface SubscriptionsCardProps {
    /** Null when the backend did not serve the section, and the card says so. */
    draft: Record<SubscriptionAudience, SubscriptionPolicyDraft> | null;
    tiers: PolicyTiers;
    invalid: (id: string) => boolean;
    onChange: (audience: SubscriptionAudience, patch: Partial<SubscriptionPolicyDraft>) => void;
}

const CHANGE_POLICY_NOTE: Record<SubscriptionChangePolicy, string> = {
    REPLACE_NOW: "The new plan starts now and the running term ends now.",
    QUEUE_AFTER_TERM: "The new plan starts the day the running term ends, the way a same-tier renewal does.",
};

/**
 * Lot J2: the purchase rules for a subscription — `settings.subscriptions.<audience>`.
 *
 * One card, two tabs: the publisher policy `revenue` sells plans under and
 * the advertiser policy `packages` sells packages under. Every control here
 * is a leaf of the platform row and rides the page's diff-only PUT; GST is
 * deliberately not among them, because both quotes read revenue's tax row,
 * and the header says where that is edited.
 */
export function SubscriptionsCard({ draft, tiers, invalid, onChange }: SubscriptionsCardProps) {
    const [audience, setAudience] = React.useState<SubscriptionAudience>("publisher");

    return (
        <SectionCard
            title="Subscriptions"
            description="How a plan is sold: the cycles, the discount, what a change does, the grace, the trials and how it is paid"
        >
            <p className="mb-4 text-sm text-muted-foreground" data-testid="subscriptions-gst-line">
                GST is set under{" "}
                <Link href={TAX_SETTING_HREF} className="font-medium text-foreground underline-offset-4 hover:underline">
                    Pricing › Tax
                </Link>
                ; both quotes read that one rate.
            </p>

            {draft ? (
                <div className="space-y-5">
                    <Tabs value={audience} onValueChange={(next) => setAudience(next === "advertiser" ? "advertiser" : "publisher")}>
                        <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b bg-transparent p-0">
                            {SUBSCRIPTION_AUDIENCES.map((value) => (
                                <TabsTrigger
                                    key={value}
                                    value={value}
                                    className="rounded-none border-b-2 border-transparent px-0 pb-2.5 pt-1 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                                >
                                    {SUBSCRIPTION_AUDIENCE_LABEL[value]}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>

                    <PolicyFields
                        audience={audience}
                        policy={draft[audience]}
                        tiers={trialTiers(tiers[audience], draft[audience].trialDays)}
                        invalid={invalid}
                        onChange={(patch) => onChange(audience, patch)}
                    />
                </div>
            ) : (
                <p className="text-sm text-muted-foreground">
                    This backend does not serve the <code className="rounded bg-muted px-1 py-0.5 text-xs">subscriptions</code>{" "}
                    section of the platform row, so the purchase rules cannot be read or edited here.
                </p>
            )}
        </SectionCard>
    );
}

interface PolicyFieldsProps {
    audience: SubscriptionAudience;
    policy: SubscriptionPolicyDraft;
    tiers: string[];
    invalid: (id: string) => boolean;
    onChange: (patch: Partial<SubscriptionPolicyDraft>) => void;
}

function PolicyFields({ audience, policy, tiers, invalid, onChange }: PolicyFieldsProps) {
    const id = (field: string) => `subscriptions.${audience}.${field}`;
    const sold = audience === "publisher" ? "a plan" : "a package";
    const party = audience === "publisher" ? "publisher" : "advertiser";

    const numberField = (
        field: string,
        label: string,
        value: string,
        onValue: (value: string) => void,
        bounds: { min: number; max: number },
        affects: string,
        unit: string,
    ) => (
        <div className="space-y-1.5">
            <Label htmlFor={id(field)}>{label}</Label>
            <div className="flex items-center gap-2">
                <Input
                    id={id(field)}
                    inputMode="numeric"
                    value={value}
                    onChange={(event) => onValue(event.target.value)}
                    aria-invalid={invalid(id(field)) || undefined}
                    className={cn("max-w-[160px]", invalid(id(field)) && "border-danger focus-visible:ring-danger")}
                />
                <span className="text-sm text-muted-foreground">{unit}</span>
            </div>
            <p className={cn("text-xs", invalid(id(field)) ? "text-danger" : "text-muted-foreground")}>
                {invalid(id(field)) ? `A whole number from ${bounds.min} to ${bounds.max}.` : affects}
            </p>
        </div>
    );

    const switchRow = (field: string, label: string, affects: string, checked: boolean, onValue: (value: boolean) => void, disabled = false) => (
        <label className={cn("flex items-center justify-between gap-4", disabled && "opacity-60")}>
            <span>
                <span className="block text-sm font-medium text-foreground">{label}</span>
                <span className="block text-xs text-muted-foreground">{affects}</span>
            </span>
            <Switch checked={checked} onCheckedChange={onValue} aria-label={label} data-testid={id(field)} disabled={disabled} />
        </label>
    );

    const toggleCycle = (cycle: (typeof SUBSCRIPTION_CYCLES)[number], on: boolean) =>
        onChange({
            cyclesOffered: on
                ? SUBSCRIPTION_CYCLES.filter((item) => item === cycle || policy.cyclesOffered.includes(item))
                : policy.cyclesOffered.filter((item) => item !== cycle),
        });

    const toggleGateway = (gateway: (typeof SUBSCRIPTION_GATEWAYS)[number], on: boolean) =>
        onChange({
            gatewaysAllowed: on
                ? SUBSCRIPTION_GATEWAYS.filter((item) => item === gateway || policy.gatewaysAllowed.includes(item))
                : policy.gatewaysAllowed.filter((item) => item !== gateway),
        });

    const cyclesInvalid = invalid(id("cyclesOffered"));

    return (
        <div className="space-y-6" data-testid={`policy-${audience}`}>
            <div className="grid gap-5 md:grid-cols-2">
                <fieldset className="space-y-1.5">
                    <legend className="text-sm font-medium text-foreground">Cycles offered</legend>
                    <div className="flex flex-wrap gap-4 pt-1">
                        {SUBSCRIPTION_CYCLES.map((cycle) => {
                            const boxId = id(`cyclesOffered.${cycle}`);
                            return (
                                <label key={cycle} htmlFor={boxId} className="flex items-center gap-2 text-sm text-foreground">
                                    <Checkbox
                                        id={boxId}
                                        checked={policy.cyclesOffered.includes(cycle)}
                                        onCheckedChange={(value) => toggleCycle(cycle, value === true)}
                                        aria-invalid={cyclesInvalid || undefined}
                                    />
                                    {SUBSCRIPTION_CYCLE_LABEL[cycle]}
                                </label>
                            );
                        })}
                    </div>
                    <p className={cn("text-xs", cyclesInvalid ? "text-danger" : "text-muted-foreground")}>
                        {cyclesInvalid
                            ? "At least one cycle must be offered."
                            : `A cycle not listed is refused at the quote, naming the ones that are. Every ${party} on the app sees only these.`}
                    </p>
                </fieldset>

                {numberField(
                    "annualDiscountPct",
                    "Annual discount",
                    policy.annualDiscountPct,
                    (value) => onChange({ annualDiscountPct: value }),
                    SETTING_BOUNDS["subscriptions.annualDiscountPct"],
                    "Off twelve months bought at once — the SAVE badge on the annual cycle. Nothing while Annual is not offered.",
                    "%",
                )}
            </div>

            <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-1.5">
                    <Label>Changing plan</Label>
                    <RadioGroup
                        value={policy.changePolicy}
                        onValueChange={(value) => onChange({ changePolicy: value as SubscriptionChangePolicy })}
                        aria-label={`${SUBSCRIPTION_AUDIENCE_LABEL[audience]} change policy`}
                        className="pt-1"
                    >
                        {SUBSCRIPTION_CHANGE_POLICIES.map((value) => {
                            const radioId = id(`changePolicy.${value}`);
                            return (
                                <div key={value} className="flex items-start gap-2">
                                    <RadioGroupItem value={value} id={radioId} className="mt-0.5" />
                                    <Label htmlFor={radioId} className="font-normal">
                                        <span className="block text-sm text-foreground">{SUBSCRIPTION_CHANGE_POLICY_LABEL[value]}</span>
                                        <span className="block text-xs text-muted-foreground">{CHANGE_POLICY_NOTE[value]}</span>
                                    </Label>
                                </div>
                            );
                        })}
                    </RadioGroup>
                    <p className="text-xs text-muted-foreground">
                        What buying a different tier does to the running one. A same-tier purchase always queues at the term&apos;s end.
                    </p>
                </div>

                <div className="space-y-5">
                    {switchRow(
                        "prorateOnChange",
                        "Prorate the replaced term",
                        policy.changePolicy === "REPLACE_NOW"
                            ? `The unused days of the replaced term come back to the ${party}'s wallet as credit: the price per month × whole days left ÷ days in the month, rounded down to the paisa.`
                            : "Only under Replace now — a queued plan replaces nothing, so there is nothing to prorate.",
                        policy.prorateOnChange,
                        (value) => onChange({ prorateOnChange: value }),
                        policy.changePolicy !== "REPLACE_NOW",
                    )}
                    {numberField(
                        "graceDays",
                        "Grace",
                        policy.graceDays,
                        (value) => onChange({ graceDays: value }),
                        SETTING_BOUNDS["subscriptions.graceDays"],
                        "Entitlements — live chat and the other copy keys — survive this many days after the term ends. Never the commission rate.",
                        "days",
                    )}
                </div>
            </div>

            <div className="space-y-1.5">
                <Label>Trial days per tier</Label>
                {tiers.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No tier to draw: neither the catalogue nor the policy names one.</p>
                ) : (
                    <div className="grid gap-4 pt-1 sm:grid-cols-3">
                        {tiers.map((tier) => {
                            const fieldId = id(`trialDays.${tier}`);
                            const value = policy.trialDays[tier];
                            return (
                                <div key={tier} className="space-y-1.5">
                                    <Label htmlFor={fieldId} className="font-mono text-[11px] tracking-wide text-muted-foreground">
                                        {tier}
                                    </Label>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            id={fieldId}
                                            inputMode="numeric"
                                            value={value ?? ""}
                                            placeholder="0"
                                            onChange={(event) => onChange({ trialDays: { ...policy.trialDays, [tier]: event.target.value } })}
                                            aria-invalid={invalid(fieldId) || undefined}
                                            className={cn("max-w-[120px]", invalid(fieldId) && "border-danger focus-visible:ring-danger")}
                                        />
                                        <span className="text-sm text-muted-foreground">days</span>
                                    </div>
                                    {invalid(fieldId) && (
                                        <p className="text-xs text-danger">
                                            A whole number from {SETTING_BOUNDS["subscriptions.trialDays"].min} to {SETTING_BOUNDS["subscriptions.trialDays"].max}.
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
                <p className="text-xs text-muted-foreground">
                    A first-ever subscriber may start {sold} on this tier free for this many days; zero, or a tier left empty, is no
                    trial. The tiers are the catalogue&apos;s.
                </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
                {numberField(
                    "reminderLeadDays",
                    "Reminder lead",
                    policy.reminderLeadDays,
                    (value) => onChange({ reminderLeadDays: value }),
                    SETTING_BOUNDS["subscriptions.reminderLeadDays"],
                    "The daily sweep's expiring notice goes this many days before the term ends.",
                    "days",
                )}
                {numberField(
                    "unpaidOrderExpiryDays",
                    "Unpaid order expiry",
                    policy.unpaidOrderExpiryDays,
                    (value) => onChange({ unpaidOrderExpiryDays: value }),
                    SETTING_BOUNDS["subscriptions.unpaidOrderExpiryDays"],
                    "An order still awaiting payment after this many days becomes Expired.",
                    "days",
                )}
            </div>

            <div className="space-y-4">
                {switchRow(
                    "payment.walletAllowed",
                    "Pay from the ADX wallet",
                    `Off, the wallet route refuses (403 PAYMENT_METHOD_NOT_OFFERED) and ${sold} is paid through a gateway or recorded here.`,
                    policy.walletAllowed,
                    (value) => onChange({ walletAllowed: value }),
                )}
                <fieldset className="space-y-1.5">
                    <legend className="text-sm font-medium text-foreground">Gateways offered</legend>
                    <div className="flex flex-wrap gap-4 pt-1">
                        {SUBSCRIPTION_GATEWAYS.map((gateway) => {
                            const boxId = id(`payment.gatewaysAllowed.${gateway}`);
                            return (
                                <label key={gateway} htmlFor={boxId} className="flex items-center gap-2 text-sm text-foreground">
                                    <Checkbox
                                        id={boxId}
                                        checked={policy.gatewaysAllowed.includes(gateway)}
                                        onCheckedChange={(value) => toggleGateway(gateway, value === true)}
                                    />
                                    {GATEWAY_LABEL[gateway]}
                                </label>
                            );
                        })}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        A payment intent for {sold} through a gateway not listed is refused; none listed closes the gateway path for
                        this audience. Campaign payments are untouched. The keys are under{" "}
                        <Link href="/settings/integrations" className="underline underline-offset-4">
                            Integrations
                        </Link>
                        .
                    </p>
                </fieldset>
            </div>

            <div className="space-y-1.5">
                {switchRow(
                    "autoRenew.allowed",
                    "Auto-renew allowed",
                    `A ${party} may switch renewal on for their own term; the daily sweep then raises the next order the day it ends. Off, nobody is charged whatever a row's flag says.`,
                    policy.autoRenewAllowed,
                    (value) => onChange({ autoRenewAllowed: value }),
                )}
                <p className="text-xs text-muted-foreground" data-testid={id("autoRenew.chargeFromWallet")}>
                    A renewal is charged from the wallet — the only rail today. A short wallet fails the renewal once, with the shortfall,
                    and the term lapses into grace.
                </p>
            </div>
        </div>
    );
}
