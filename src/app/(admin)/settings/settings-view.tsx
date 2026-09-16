"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/adx/page-header";
import { SectionCard } from "@/components/adx/section-card";
import { FeatureGate } from "@/lib/use-feature";
import {
    SETTING_BOUNDS,
    SUPPORT_PRIORITIES,
    SUPPORT_PRIORITY_LABEL,
    countLeaves,
    settingsService,
    type InstallationCommissionMode,
    type PlatformSettings,
    type SubscriptionAudience,
    type SupportPriority,
} from "@/services/settings";
import { draftPatch, fromDraft, toDraft, type CommsDraft, type SettingsDraft, type SubscriptionPolicyDraft } from "./settings-form";
import { NO_TIERS, SubscriptionsCard, type PolicyTiers } from "./subscriptions-card";

const sections = [
    { id: "marketplace", label: "Marketplace" },
    { id: "verification", label: "Verification" },
    { id: "publisher", label: "Publisher" },
    { id: "support", label: "Support" },
    { id: "subscriptions", label: "Subscriptions" },
    { id: "retention", label: "Retention" },
    { id: "access", label: "Access" },
    { id: "installation", label: "Installation" },
    { id: "comms", label: "Comms" },
    { id: "people", label: "People" },
    { id: "elsewhere", label: "Elsewhere" },
    { id: "danger", label: "Danger zone" },
];

/** Where the settings this page used to draw actually live. */
const ELSEWHERE = [
    { label: "Commission", href: "/finance/revenue", why: "The take rate on booked media and the fees an advertiser pays on top." },
    { label: "Payouts", href: "/finance/settings", why: "Daily withdrawal caps by tier, tax withheld at source, agent incentive rates." },
    { label: "App status", href: "/settings/app-status", why: "The supported builds, the maintenance switch and how each service is faring." },
];

interface SettingsViewProps {
    settings: PlatformSettings;
    /** Lot J2: the tiers the plans and the catalogue name, for the trial-days rows; empty when a read failed. */
    tiers?: PolicyTiers;
    /** Called after the PUT lands, so the page refetches the row. */
    onSaved: () => void;
}

/**
 * "Settings · /settings" on DR 10: the section rail on the left, a card per
 * section on the right, a sticky save bar once something moves.
 *
 * The sections are not the frame's. It drew a currency, a take rate, a payout
 * cadence and three notification toggles, and nothing on the server read any
 * of them — every switch changed a toast. What is here is exactly the set of
 * settings `getPlatformSettings()` serves to other modules, each with the
 * sentence of who it affects, and Save sends only the leaves that moved.
 *
 * Lot G (package CG4, Q117): the Comms section is the dispatcher's quiet
 * hours and weekly cap — the `comms` keys of the same row — which the
 * template editor's rules card reads and links here to change. A backend
 * that does not serve the section gets a card saying so, not a default.
 *
 * Lot G (package CG3, Q120/Q139): the People section is the two workload
 * thresholds — `hr.workloadThresholds` — that band the employees
 * overview's "Workload distribution" chart. Same rule for a backend that
 * does not serve the section.
 *
 * Lot J2: the Subscriptions section is the two purchase policies —
 * `subscriptions.publisher` and `subscriptions.advertiser` — that the plans
 * and the packages are sold under; the catalogue's rules strip reads them
 * and links here. Same rule again for a backend that does not serve them.
 */
export function SettingsView({ settings, tiers = NO_TIERS, onSaved }: SettingsViewProps) {
    const [draft, setDraft] = React.useState<SettingsDraft>(() => toDraft(settings));
    const [activeSection, setActiveSection] = React.useState("marketplace");
    const [busy, setBusy] = React.useState(false);

    const parsed = React.useMemo(() => fromDraft(draft), [draft]);
    const patch = React.useMemo(() => draftPatch(settings, draft), [settings, draft]);
    const changed = patch ? countLeaves(patch) : 0;
    const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(settings));

    const set = <K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) =>
        setDraft((current) => ({ ...current, [key]: value }));
    const setComms = (patch: Partial<CommsDraft>) =>
        setDraft((current) => (current.comms ? { ...current, comms: { ...current.comms, ...patch } } : current));
    const setHr = (patch: Partial<NonNullable<SettingsDraft["hr"]>>) =>
        setDraft((current) => (current.hr ? { ...current, hr: { ...current.hr, ...patch } } : current));
    /* Lot K2: the authenticator-app policy. Null when the backend did not serve it, and the card says so. */
    const setAdminTwoFactor = (patch: Partial<NonNullable<SettingsDraft["adminTwoFactor"]>>) =>
        setDraft((current) => (current.adminTwoFactor ? { ...current, adminTwoFactor: { ...current.adminTwoFactor, ...patch } } : current));
    /* Lot I: the live-chat block. Null when the backend did not serve it, and
       the card says so rather than drawing a default that would save wrongly. */
    const setLiveChat = (patch: Partial<NonNullable<SettingsDraft["liveChat"]>>) =>
        setDraft((current) => (current.liveChat ? { ...current, liveChat: { ...current.liveChat, ...patch } } : current));
    /* Lot J2: one audience's policy. Null when the backend did not serve the section. */
    const setPolicy = (audience: SubscriptionAudience, patch: Partial<SubscriptionPolicyDraft>) =>
        setDraft((current) =>
            current.subscriptions
                ? { ...current, subscriptions: { ...current.subscriptions, [audience]: { ...current.subscriptions[audience], ...patch } } }
                : current,
        );
    const setSla = (priority: SupportPriority, key: "firstResponseHours" | "resolutionHours", value: string) =>
        setDraft((current) => ({ ...current, sla: { ...current.sla, [priority]: { ...current.sla[priority], [key]: value } } }));

    const invalid = (id: string) => parsed.errors.has(id);

    async function save() {
        if (!patch || changed === 0) return;
        setBusy(true);
        try {
            await settingsService.update(patch);
            toast.success("Settings saved", {
                description: `${changed} setting${changed === 1 ? "" : "s"} changed. Every reader picks it up within a minute.`,
            });
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not save the settings.");
        } finally {
            setBusy(false);
        }
    }

    const numberField = (
        id: string,
        label: string,
        value: string,
        onChange: (value: string) => void,
        bounds: { min: number; max: number },
        affects: string,
        unit: string,
        /* Lot G: the escalation multiplier may be fractional; every other number is whole. */
        kind: "integer" | "decimal" = "integer",
    ) => (
        <div className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            <div className="flex items-center gap-2">
                <Input
                    id={id}
                    inputMode={kind === "decimal" ? "decimal" : "numeric"}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    aria-invalid={invalid(id) || undefined}
                    className={cn("max-w-[160px]", invalid(id) && "border-danger focus-visible:ring-danger")}
                />
                <span className="text-sm text-muted-foreground">{unit}</span>
            </div>
            <p className={cn("text-xs", invalid(id) ? "text-danger" : "text-muted-foreground")}>
                {invalid(id) ? `A ${kind === "decimal" ? "number" : "whole number"} from ${bounds.min} to ${bounds.max}.` : affects}
            </p>
        </div>
    );

    const switchRow = (id: string, label: string, affects: string, checked: boolean, onChange: (value: boolean) => void) => (
        <label className="flex items-center justify-between gap-4">
            <span>
                <span className="block text-sm font-medium text-foreground">{label}</span>
                <span className="block text-xs text-muted-foreground">{affects}</span>
            </span>
            <Switch checked={checked} onCheckedChange={onChange} aria-label={label} data-testid={id} />
        </label>
    );

    return (
        <div className="space-y-5 pb-20">
            <PageHeader title="Settings" subtitle="Marketplace defaults, fees, and platform behaviour" />

            <div className="grid gap-6 xl:grid-cols-[220px_1fr]">
                <nav className="h-fit space-y-1 xl:sticky xl:top-[81px]">
                    {sections.map((section) => (
                        <a
                            key={section.id}
                            href={`#${section.id}`}
                            onClick={() => setActiveSection(section.id)}
                            className={cn(
                                "block rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                                activeSection === section.id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {section.label}
                        </a>
                    ))}
                </nav>

                <div className="min-w-0 space-y-5">
                    <div id="marketplace" className="scroll-mt-24">
                        <SectionCard title="Marketplace defaults" description="Applied to every new listing and booking">
                            <div className="grid gap-5 md:grid-cols-2">
                                {numberField(
                                    "marketplace.minBookingDays",
                                    "Minimum booking days",
                                    draft.minBookingDays,
                                    (value) => set("minBookingDays", value),
                                    SETTING_BOUNDS["marketplace.minBookingDays"],
                                    "The floor under every listing's own minimum. An advertiser adding a spot to their cart cannot book a shorter flight than this.",
                                    "days",
                                )}
                                {numberField(
                                    "marketplace.maxMarketsPerCampaign",
                                    "Markets per campaign",
                                    draft.maxMarketsPerCampaign,
                                    (value) => set("maxMarketsPerCampaign", value),
                                    SETTING_BOUNDS["marketplace.maxMarketsPerCampaign"],
                                    "How many cities one campaign may target once multi-market campaigns are switched on.",
                                    "markets",
                                )}
                                <div className="md:col-span-2">
                                    {switchRow(
                                        "listings.autoPublishOnVerification",
                                        "Auto-publish on verification",
                                        "A cleared site visit takes the listing live on its own. Off, it waits at Awaiting site verification and the review desk is told.",
                                        draft.autoPublishOnVerification,
                                        (value) => set("autoPublishOnVerification", value),
                                    )}
                                </div>
                            </div>
                        </SectionCard>
                    </div>

                    <div id="verification" className="scroll-mt-24">
                        <SectionCard title="Verification" description="How long a KYC review may wait">
                            <div className="grid gap-4 md:grid-cols-2">
                                {numberField(
                                    "kyc.reviewSlaHours",
                                    "Review SLA",
                                    draft.kycReviewSlaHours,
                                    (value) => set("kycReviewSlaHours", value),
                                    SETTING_BOUNDS["kyc.reviewSlaHours"],
                                    "A pending publisher or advertiser KYC case older than this counts as breached, and the queues put breaches first.",
                                    "hours",
                                )}
                                {/* Lot G (Q127/142): the nightly sweep's threshold, as a multiple of the SLA; fractional is fine. */}
                                {numberField(
                                    "kyc.escalationSlaMultiplier",
                                    "Auto-escalation",
                                    draft.kycEscalationSlaMultiplier,
                                    (value) => set("kycEscalationSlaMultiplier", value),
                                    SETTING_BOUNDS["kyc.escalationSlaMultiplier"],
                                    `A pending case still undecided after this many review SLAs is handed to Compliance by the nightly sweep (source: Age). ${
                                        parsed.settings
                                            ? `Right now that is ${Math.round(parsed.settings.kyc.reviewSlaHours * parsed.settings.kyc.escalationSlaMultiplier)} hours.`
                                            : ""
                                    }`,
                                    "× SLA",
                                    "decimal",
                                )}
                            </div>
                            {/* Lot N: the activation gate — on, `POST /print-partners/:id/activate` answers 409 KYC_REQUIRED until the record is VERIFIED. */}
                            <div className="mt-4 border-t pt-4">
                                {draft.printPartnerActivationRequiresKyc === null ? (
                                    <p className="text-xs text-muted-foreground" data-testid="kyc.printPartnerActivationRequiresKyc-missing">
                                        The backend did not serve the print-partner activation gate; the switch is not drawn so nothing is saved by mistake.
                                    </p>
                                ) : (
                                    switchRow(
                                        "kyc.printPartnerActivationRequiresKyc",
                                        "A print partner must pass KYC before activation",
                                        "On, Activate on a partner's page is refused until their KYC record is VERIFIED — the desk records or requests it first. Off, ops activate and KYC follows.",
                                        draft.printPartnerActivationRequiresKyc,
                                        (value) => set("printPartnerActivationRequiresKyc", value),
                                    )
                                )}
                            </div>
                        </SectionCard>
                    </div>

                    <div id="publisher" className="scroll-mt-24">
                        <SectionCard title="Publisher" description="What a publisher sees about their own spots">
                            {/* CG5: the switch is the console's surface of
                                `publisher.spot-insights`. Off, it would set a
                                number nothing reads; the note says where the
                                kill switch is instead. */}
                            <FeatureGate
                                feature="publisher.spot-insights"
                                fallback={
                                    <p className="text-sm text-muted-foreground">
                                        Spot insights are switched off under{" "}
                                        <Link href="/settings/flags" className="font-medium text-foreground underline-offset-4 hover:underline">
                                            Feature flags
                                        </Link>
                                        ; the visibility setting waits until the feature is on.
                                    </p>
                                }
                            >
                                {switchRow(
                                    "publisher.spotInsightsVisible",
                                    "Spot insights visible",
                                    "Whether the publisher app shows a publisher insights about their own spots at all. The feature flag beside it decides who gets them first.",
                                    draft.spotInsightsVisible,
                                    (value) => set("spotInsightsVisible", value),
                                )}
                            </FeatureGate>
                        </SectionCard>
                    </div>

                    <div id="support" className="scroll-mt-24">
                        <SectionCard title="Support SLAs" description="How fast a ticket of each priority must be answered and closed">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                                            <th className="py-2 pr-4 font-medium">Priority</th>
                                            <th className="py-2 pr-4 font-medium">First response</th>
                                            <th className="py-2 font-medium">Resolution</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {SUPPORT_PRIORITIES.map((priority) => (
                                            <tr key={priority} className="border-b last:border-0">
                                                <td className="py-3 pr-4 font-medium text-foreground">{SUPPORT_PRIORITY_LABEL[priority]}</td>
                                                {(["firstResponseHours", "resolutionHours"] as const).map((key) => {
                                                    const id = `sla.${priority}.${key}`;
                                                    return (
                                                        <td key={key} className="py-3 pr-4">
                                                            <div className="flex items-center gap-2">
                                                                <Input
                                                                    inputMode="numeric"
                                                                    value={draft.sla[priority][key]}
                                                                    onChange={(event) => setSla(priority, key, event.target.value)}
                                                                    aria-label={`${SUPPORT_PRIORITY_LABEL[priority]} ${key === "firstResponseHours" ? "first response" : "resolution"} hours`}
                                                                    aria-invalid={invalid(id) || undefined}
                                                                    className={cn("h-9 w-24", invalid(id) && "border-danger focus-visible:ring-danger")}
                                                                />
                                                                <span className="text-xs text-muted-foreground">h</span>
                                                            </div>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="mt-3 text-xs text-muted-foreground">
                                Support tickets age against these. First response from 1 hour to {SETTING_BOUNDS.firstResponseHours.max / 24} days;
                                resolution up to {SETTING_BOUNDS.resolutionHours.max / 24} days.
                            </p>
                        </SectionCard>

                        <SectionCard
                            className="mt-5"
                            title="Live chat"
                            description="The paid-subscriber chat: when the desk answers live, how fast, and who is entitled"
                        >
                            {draft.liveChat ? (
                                <div className="space-y-5">
                                    {switchRow(
                                        "support.liveChat.enabled",
                                        "Live chat on",
                                        "Ops' own switch, beside the support.live-chat kill flag. Off, every phone is told it is not entitled and keeps the ticket thread — nothing is stranded mid-sentence.",
                                        draft.liveChat.enabled,
                                        (value) => setLiveChat({ enabled: value }),
                                    )}

                                    <div className="grid gap-5 md:grid-cols-3">
                                        {(
                                            [
                                                ["from", draft.liveChat.from],
                                                ["to", draft.liveChat.to],
                                            ] as const
                                        ).map(([edge, value]) => {
                                            const id = `support.liveChat.hours.${edge}`;
                                            return (
                                                <div key={edge} className="space-y-1.5">
                                                    <Label htmlFor={id}>{edge === "from" ? "Live from" : "Live until"}</Label>
                                                    <Input
                                                        id={id}
                                                        type="time"
                                                        value={value}
                                                        onChange={(event) =>
                                                            setLiveChat(edge === "from" ? { from: event.target.value } : { to: event.target.value })
                                                        }
                                                        aria-invalid={invalid(id) || undefined}
                                                        className={cn("max-w-[160px]", invalid(id) && "border-danger focus-visible:ring-danger")}
                                                    />
                                                    <p className={cn("text-xs", invalid(id) ? "text-danger" : "text-muted-foreground")}>
                                                        {invalid(id)
                                                            ? "A clock time, HH:MM."
                                                            : edge === "from"
                                                              ? "A window that crosses midnight is a night shift."
                                                              : "Equal edges are around the clock. Outside the window a message becomes a ticket with the next opening promised."}
                                                    </p>
                                                </div>
                                            );
                                        })}
                                        <div className="space-y-1.5">
                                            <Label htmlFor="support.liveChat.hours.tz">Time zone</Label>
                                            <Input
                                                id="support.liveChat.hours.tz"
                                                value={draft.liveChat.tz}
                                                onChange={(event) => setLiveChat({ tz: event.target.value })}
                                                aria-invalid={invalid("support.liveChat.hours.tz") || undefined}
                                                className={cn(
                                                    "max-w-[200px] font-mono text-xs",
                                                    invalid("support.liveChat.hours.tz") && "border-danger focus-visible:ring-danger",
                                                )}
                                            />
                                            <p
                                                className={cn(
                                                    "text-xs",
                                                    invalid("support.liveChat.hours.tz") ? "text-danger" : "text-muted-foreground",
                                                )}
                                            >
                                                {invalid("support.liveChat.hours.tz")
                                                    ? "An IANA zone name, at most 64 characters."
                                                    : "The clock the window is read on. Asia/Kolkata."}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid gap-5 md:grid-cols-2">
                                        {numberField(
                                            "support.liveChat.firstResponseTargetSec",
                                            "First response target",
                                            draft.liveChat.firstResponseTargetSec,
                                            (value) => setLiveChat({ firstResponseTargetSec: value }),
                                            SETTING_BOUNDS["support.liveChat.firstResponseTargetSec"],
                                            "The clock the live inbox counts down and the sweep breaches against. Past it, every operator on shift is paged once for that chat.",
                                            "seconds",
                                        )}
                                        {numberField(
                                            "support.liveChat.attachmentMaxMb",
                                            "Attachment cap",
                                            draft.liveChat.attachmentMaxMb,
                                            (value) => setLiveChat({ attachmentMaxMb: value }),
                                            SETTING_BOUNDS["support.liveChat.attachmentMaxMb"],
                                            "An image or a PDF on a chat message. Anything larger is refused before the message is written, so nothing half-sent is left behind.",
                                            "MB",
                                        )}
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor="support.liveChat.publisherTiers">Publisher tiers entitled</Label>
                                        <Input
                                            id="support.liveChat.publisherTiers"
                                            placeholder="Every running subscription"
                                            value={draft.liveChat.publisherTiers}
                                            onChange={(event) => setLiveChat({ publisherTiers: event.target.value })}
                                            className="max-w-[420px]"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Comma-separated. Empty means every publisher on a running subscription is entitled; naming tiers narrows it
                                            to those. An advertiser's side is per plan — the Live chat switch on the packages catalogue.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    This backend does not serve the <code className="rounded bg-muted px-1 py-0.5 text-xs">support.liveChat</code>{" "}
                                    section of the platform row, so the hours, the target and the caps cannot be read or edited here.
                                </p>
                            )}
                        </SectionCard>
                    </div>

                    <div id="subscriptions" className="scroll-mt-24">
                        <SubscriptionsCard draft={draft.subscriptions} tiers={tiers} invalid={invalid} onChange={setPolicy} />
                    </div>

                    <div id="retention" className="scroll-mt-24">
                        <SectionCard title="Retention" description="How long records are kept after an account closes">
                            <div className="grid gap-5 md:grid-cols-2">
                                {numberField(
                                    "retention.financialYears",
                                    "Financial records",
                                    draft.financialYears,
                                    (value) => set("financialYears", value),
                                    SETTING_BOUNDS["retention.financialYears"],
                                    "Ledgers, payouts and wallet history survive an erasure request this long before the retention sweep removes them.",
                                    "years",
                                )}
                                {numberField(
                                    "retention.kycYears",
                                    "KYC documents",
                                    draft.kycYears,
                                    (value) => set("kycYears", value),
                                    SETTING_BOUNDS["retention.kycYears"],
                                    "Identity documents and review decisions are kept this long after closure before the sweep removes them.",
                                    "years",
                                )}
                            </div>
                        </SectionCard>
                    </div>

                    <div id="access" className="scroll-mt-24 space-y-4">
                        <SectionCard title="Access" description="How admins get into this console">
                            {switchRow(
                                "auth.adminPasswordLoginEnabled",
                                "Admin password login",
                                "The email-and-password form on the admin sign-in screen. Off, admins sign in with Google only — make sure yours works first.",
                                draft.adminPasswordLoginEnabled,
                                (value) => set("adminPasswordLoginEnabled", value),
                            )}
                        </SectionCard>
                        <SectionCard title="Admin sign-in" description="The second factor every admin sign-in asks for">
                            {draft.adminTwoFactor ? (
                                <div className="space-y-4">
                                    {switchRow(
                                        "auth.adminTwoFactor.authenticatorRequired",
                                        "Require an authenticator app",
                                        "An admin without one still signs in with a code to the phone or the email, but nothing else in the console opens until the app is set up. Set your own up first.",
                                        draft.adminTwoFactor.authenticatorRequired,
                                        (value) => setAdminTwoFactor({ authenticatorRequired: value }),
                                    )}
                                    {switchRow(
                                        "auth.adminTwoFactor.smsAllowedWhenEnrolled",
                                        "SMS and email still offered once enrolled",
                                        "Off, an admin who has enrolled an app is asked for the app's code alone. A recovery code always works — it is the answer to a lost phone, not a channel.",
                                        draft.adminTwoFactor.smsAllowedWhenEnrolled,
                                        (value) => setAdminTwoFactor({ smsAllowedWhenEnrolled: value }),
                                    )}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    This backend does not serve the authenticator-app policy (<code className="font-mono text-xs">auth.adminTwoFactor</code>), so
                                    there is nothing to change here.
                                </p>
                            )}
                        </SectionCard>
                    </div>

                    <div id="installation" className="scroll-mt-24">
                        <SectionCard title="Installation" description="How an agent is paid for putting a creative up">
                            <div className="space-y-1.5">
                                <Label>Commission mode</Label>
                                <Select value={draft.commissionMode} onValueChange={(value) => set("commissionMode", value as InstallationCommissionMode)}>
                                    <SelectTrigger className="md:w-1/2" aria-label="Installation commission mode">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="FLAT">Flat — one amount per installation</SelectItem>
                                        <SelectItem value="PER_ORDER">Per order — scaled to the order's value</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    Decides what the installing agent's wallet is credited when an installation is verified.
                                </p>
                            </div>
                        </SectionCard>
                    </div>

                    <div id="comms" className="scroll-mt-24">
                        <SectionCard
                            title="Comms"
                            description="When non-transactional copy may not leave, and how much of it one person gets a week"
                        >
                            {draft.comms ? (
                                <div className="space-y-5">
                                    <div className="grid gap-5 md:grid-cols-3">
                                        {([
                                            ["from", draft.comms.quietFrom],
                                            ["to", draft.comms.quietTo],
                                        ] as const).map(([edge, value]) => {
                                            const id = `comms.quietHours.${edge}`;
                                            return (
                                                <div key={edge} className="space-y-1.5">
                                                    <Label htmlFor={id}>{edge === "from" ? "Quiet hours start" : "Quiet hours end"}</Label>
                                                    <Input
                                                        id={id}
                                                        type="time"
                                                        value={value}
                                                        onChange={(event) => setComms(edge === "from" ? { quietFrom: event.target.value } : { quietTo: event.target.value })}
                                                        aria-invalid={invalid(id) || undefined}
                                                        className={cn("max-w-[160px]", invalid(id) && "border-danger focus-visible:ring-danger")}
                                                    />
                                                    <p className={cn("text-xs", invalid(id) ? "text-danger" : "text-muted-foreground")}>
                                                        {invalid(id)
                                                            ? "A clock time, HH:MM."
                                                            : edge === "from"
                                                              ? "A window across midnight is an evening-through-morning one."
                                                              : "Equal edges are no window at all."}
                                                    </p>
                                                </div>
                                            );
                                        })}
                                        <div className="space-y-1.5">
                                            <Label htmlFor="comms.quietHours.tz">Time zone</Label>
                                            <Input
                                                id="comms.quietHours.tz"
                                                value={draft.comms.quietTz}
                                                onChange={(event) => setComms({ quietTz: event.target.value })}
                                                aria-invalid={invalid("comms.quietHours.tz") || undefined}
                                                className={cn("max-w-[200px] font-mono text-xs", invalid("comms.quietHours.tz") && "border-danger focus-visible:ring-danger")}
                                            />
                                            <p className={cn("text-xs", invalid("comms.quietHours.tz") ? "text-danger" : "text-muted-foreground")}>
                                                {invalid("comms.quietHours.tz") ? "An IANA zone name, at most 64 characters." : "An IANA zone. The platform is India-only, so Asia/Kolkata."}
                                            </p>
                                        </div>
                                    </div>
                                    {numberField(
                                        "comms.weeklyCapPerUser",
                                        "Weekly cap per person",
                                        draft.comms.weeklyCapPerUser,
                                        (value) => setComms({ weeklyCapPerUser: value }),
                                        SETTING_BOUNDS["comms.weeklyCapPerUser"],
                                        "Non-transactional emails and SMS one person receives per Indian week, every channel together. A message on two channels spends two; the row beyond the cap is skipped and logged as WEEKLY_CAP. Zero switches non-transactional copy off.",
                                        "messages a week",
                                    )}
                                    <p className="text-xs text-muted-foreground">
                                        A template marked transactional in the editor — an OTP, a decision, a payment — ignores both rules. A message raised
                                        inside the window is held and released together at its end.
                                    </p>
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    This backend does not serve the <code className="rounded bg-muted px-1 py-0.5 text-xs">comms</code> section of the
                                    platform row, so the quiet hours and the weekly cap cannot be read or edited here.
                                </p>
                            )}
                        </SectionCard>
                    </div>

                    <div id="people" className="scroll-mt-24">
                        <SectionCard title="People" description="Where the workload chart draws its bands">
                            {draft.hr ? (
                                <div className="grid gap-5 md:grid-cols-2">
                                    {(["medium", "high"] as const).map((edge) => {
                                        const id = `hr.workloadThresholds.${edge}`;
                                        const value = edge === "medium" ? draft.hr!.workloadMedium : draft.hr!.workloadHigh;
                                        return (
                                            <div key={edge} className="space-y-1.5">
                                                <Label htmlFor={id}>{edge === "medium" ? "Medium from" : "High from"}</Label>
                                                <div className="flex items-center gap-2">
                                                    <Input
                                                        id={id}
                                                        inputMode="decimal"
                                                        value={value}
                                                        onChange={(event) => setHr(edge === "medium" ? { workloadMedium: event.target.value } : { workloadHigh: event.target.value })}
                                                        aria-invalid={invalid(id) || undefined}
                                                        className={cn("max-w-[160px]", invalid(id) && "border-danger focus-visible:ring-danger")}
                                                    />
                                                    <span className="text-sm text-muted-foreground">items a week</span>
                                                </div>
                                                <p className={cn("text-xs", invalid(id) ? "text-danger" : "text-muted-foreground")}>
                                                    {invalid(id)
                                                        ? edge === "medium"
                                                            ? "A number, zero or more."
                                                            : "A number above the medium threshold."
                                                        : edge === "medium"
                                                          ? "A staffer whose weighted load reaches this many items a week reads Medium on the employees overview; below it, Low."
                                                          : "From this many items a week the load reads High. The measure weighs open KYC cases at 2, fraud cases at 3, tickets at 1, decisions at 2 and replies at ½."}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    This backend does not serve the <code className="rounded bg-muted px-1 py-0.5 text-xs">hr</code> section of the
                                    platform row, so the workload thresholds cannot be read or edited here.
                                </p>
                            )}
                        </SectionCard>
                    </div>

                    <div id="elsewhere" className="scroll-mt-24">
                        <SectionCard title="Elsewhere" description="Settings that live on their own pages">
                            <ul className="divide-y">
                                {ELSEWHERE.map((item) => (
                                    <li key={item.href}>
                                        <Link
                                            href={item.href}
                                            className="flex items-center justify-between gap-4 py-3 text-sm transition-colors hover:text-foreground"
                                        >
                                            <span>
                                                <span className="block font-medium text-foreground">{item.label}</span>
                                                <span className="block text-xs text-muted-foreground">{item.why}</span>
                                            </span>
                                            <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </SectionCard>
                    </div>

                    <div id="danger" className="scroll-mt-24">
                        <SectionCard title="Danger zone" description="Actions that pause commerce for everyone">
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div>
                                    <p className="text-sm font-medium text-foreground">Pause new bookings</p>
                                    <p className="text-xs text-muted-foreground">
                                        The maintenance switch on App status stops both apps at Back soon. Field work already saved on a device stays there.
                                    </p>
                                </div>
                                <Button variant="destructive" asChild>
                                    <Link href="/settings/app-status">Pause marketplace</Link>
                                </Button>
                            </div>
                        </SectionCard>
                    </div>
                </div>
            </div>

            {dirty && (
                <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur">
                    <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4 px-6 py-3 pl-[267px]">
                        <p className="text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">Unsaved changes</span> ·{" "}
                            {patch
                                ? `${changed} setting${changed === 1 ? "" : "s"} modified`
                                : `${parsed.errors.size} field${parsed.errors.size === 1 ? "" : "s"} out of range`}
                        </p>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" className="bg-card" onClick={() => setDraft(toDraft(settings))} disabled={busy}>
                                Discard
                            </Button>
                            <Button onClick={save} disabled={busy || !patch || changed === 0} data-testid="settings-save">
                                {busy ? "Saving…" : "Save changes"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
