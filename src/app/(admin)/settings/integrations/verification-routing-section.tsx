"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { VerificationProviderRows, useVerificationHealth } from "@/components/adx/verification-providers";
import { integrationsService } from "@/services/integrations";
import type { DigioWorkflow } from "@/services/kyc-provider";
import {
    MAX_FALLBACKS,
    UPI_CHECK_DESCRIPTION,
    UPI_CHECK_LABEL,
    upiCheckOptions,
    breakerChanged,
    checkLabel,
    compositeProblem,
    integrationSaveError,
    providersFor,
    routeChanged,
    sameSteps,
    routingDraftOf,
    routingDraftProblem,
    routingPatch,
    type CheckKind,
    type CheckRoute,
    type CheckType,
    type CompositeStep,
    type RoutingDefaults,
    type RoutingDraft,
    type UpiCheck,
    type VerificationProvider,
    type VerificationRoutingSettings,
} from "@/services/verification";

/** The Select sentinel for "no fallback" — Radix refuses an empty value. */
const NONE = "NONE";

export const BACKUP_SENTENCE = "When Digio can't be reached, people verify on ADX's own screens instead. Turn on once the Secure ID keys are in.";


/** The mark on a row that differs from the default — with defaults to compare against, the only rows that offer "Reset". */
function ChangedChip() {
    return <StatusBadge status={{ label: "Changed", tone: "warning" }} />;
}

/** "Digio → Cashfree Secure ID": a route as the desk reads it. */
const routeLine = (route: CheckRoute, nameOf: (provider: VerificationProvider) => string) => [route.primary, ...route.fallbacks].map(nameOf).join(" → ");

/**
 * Verification routing — Cashfree Phase 2, on /settings/integrations.
 *
 * `GET /integrations` → `verificationRouting` is the settings in force
 * (the stored subset over the defaults) with the catalogue the card is
 * drawn from; `PUT /integrations { section: "verificationRouting", patch }`
 * is strict and merged key by key, `null` on a check or a workflow resetting
 * it to the default. The card sends only what moved.
 *
 * Six parts, in the contract's order: the KYC backup switch, who answers
 * each check (primary + at most two fallbacks, only providers that can
 * answer the check, a fallback never the primary), when to stop asking a
 * failing provider (the breaker), the name-match minimum, the UPI payout
 * check (the owner's decision) and the steps per account type. The
 * providers' health (`GET /verification/health`) heads the card.
 *
 * `verificationRouting.defaults` is what a reset restores. A check, a
 * workflow, the breaker or the name match that differs from it is marked
 * "Changed" and only those offer "Reset"; after a reset the row shows the
 * default itself. A server without `defaults` gets the older card: every
 * row offers "Reset" and a reset reads "Back to the default on save".
 */
export function VerificationRoutingSection({
    stored,
    workflows,
    onChanged,
}: {
    stored: VerificationRoutingSettings | undefined;
    workflows: DigioWorkflow[] | undefined;
    onChanged: () => void;
}) {
    const health = useVerificationHealth();
    return (
        <div id="verification-routing" className="scroll-mt-20">
            <SectionCard
                title="Verification routing"
                description="Who answers each identity, bank and business check, when the backup takes over, and what ADX's own screens ask each kind of account."
                actions={stored ? <StatusBadge status={stored.hostedKycBackup === "ON" ? { label: "Backup on", tone: "success" } : { label: "Backup off", tone: "neutral" }} /> : undefined}
            >
                <div className="space-y-5">
                    <div className="rounded-md border border-border p-3" data-testid="routing-health">
                        <p className="mb-2 text-sm font-medium text-foreground">Providers now</p>
                        {health.loading && !health.data ? (
                            <p className="text-sm text-muted-foreground">Reading the providers…</p>
                        ) : health.error ? (
                            <p className="text-sm text-danger">{health.error}</p>
                        ) : health.data ? (
                            <VerificationProviderRows providers={health.data.providers} />
                        ) : (
                            <p className="text-sm text-muted-foreground">Read from the API; turn the KYC domain on to see the providers.</p>
                        )}
                    </div>
                    {stored ? (
                        <RoutingForm key={JSON.stringify(stored)} stored={stored} workflows={workflows ?? []} onChanged={onChanged} />
                    ) : (
                        <p className="text-sm text-muted-foreground" data-testid="routing-absent">
                            This backend does not carry the verification routing yet.
                        </p>
                    )}
                </div>
            </SectionCard>
        </div>
    );
}

function RoutingForm({ stored, workflows, onChanged }: { stored: VerificationRoutingSettings; workflows: DigioWorkflow[]; onChanged: () => void }) {
    const initial = React.useMemo(() => routingDraftOf(stored), [stored]);
    const [draft, setDraft] = React.useState<RoutingDraft>(initial);
    const [busy, setBusy] = React.useState(false);
    const patch = routingPatch(stored, draft);
    const dirty = Object.keys(patch).length > 0;
    const problem = routingDraftProblem(stored, draft);

    const labelOf = (key: string) => workflows.find((row) => row.key === key)?.label ?? key;
    /* What a reset restores; absent on an older server, when every row offers "Reset" and a reset reads "Back to the default on save". */
    const defaults: RoutingDefaults | undefined = stored.defaults;
    const providerName = (name: VerificationProvider) => stored.catalogue.providers.find((provider) => provider.name === name)?.label ?? name;
    /* The workflows in the order the Digio card lists them, then any key the routing knows that the list does not. */
    const workflowKeys = [...workflows.map((row) => row.key).filter((key) => key in stored.composites), ...Object.keys(stored.composites).filter((key) => !workflows.some((row) => row.key === key))];

    const setCheck = (check: CheckType, route: CheckRoute | null) => setDraft((current) => ({ ...current, checks: { ...current.checks, [check]: route } }));
    const setSteps = (key: string, steps: CompositeStep[] | null) => setDraft((current) => ({ ...current, composites: { ...current.composites, [key]: steps } }));
    const setBreaker = (key: keyof RoutingDraft["breaker"], text: string) =>
        setDraft((current) => ({ ...current, breaker: { ...current.breaker, [key]: text.trim() === "" ? Number.NaN : Number(text) } }));

    const save = async () => {
        if (problem) return;
        setBusy(true);
        try {
            await integrationsService.update("verificationRouting", patch);
            toast.success("Verification routing saved", { description: "The audit trail records the routing before and after." });
            onChanged();
        } catch (cause) {
            toast.error(integrationSaveError(cause, "Could not save the verification routing."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-5" data-testid="routing-form">
            {/* (a) Backup for KYC */}
            <section className="flex items-start justify-between gap-3 rounded-md bg-muted/40 p-3" data-testid="routing-backup">
                <div className="min-w-0">
                    <Label htmlFor="routing-backup" className="text-sm font-medium">
                        Backup for KYC
                    </Label>
                    <p className="mt-0.5 text-xs text-muted-foreground">{BACKUP_SENTENCE}</p>
                </div>
                <Switch
                    id="routing-backup"
                    aria-label="Backup for KYC"
                    checked={draft.hostedKycBackup === "ON"}
                    onCheckedChange={(checked) => setDraft((current) => ({ ...current, hostedKycBackup: checked ? "ON" : "OFF" }))}
                    disabled={busy}
                />
            </section>

            {/* (b) Who answers each check */}
            <section className="space-y-2" data-testid="routing-checks">
                <p className="text-sm font-medium text-foreground">Who answers each check</p>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs text-muted-foreground">
                                <th className="py-1.5 pr-3 font-medium">Check</th>
                                <th className="py-1.5 pr-3 font-medium">Primary</th>
                                {Array.from({ length: MAX_FALLBACKS }, (_, index) => (
                                    <th key={index} className="py-1.5 pr-3 font-medium">
                                        Fallback {index + 1}
                                    </th>
                                ))}
                                <th className="py-1.5" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {stored.catalogue.checks.map((check) => (
                                <CheckRow
                                    key={check}
                                    check={check}
                                    route={draft.checks[check]}
                                    offered={providersFor(stored, check)}
                                    defaults={defaults}
                                    providerName={providerName}
                                    busy={busy}
                                    onChange={(route) => setCheck(check, route)}
                                    onUndo={() => setCheck(check, stored.checks[check])}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* (c) The breaker, (d) the name match */}
            <section className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2" data-testid="routing-breaker">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">When to stop asking a failing provider</p>
                        {defaults && breakerChanged(defaults, draft.breaker) && (
                            <span className="flex items-center gap-1" data-testid="routing-breaker-changed">
                                <ChangedChip />
                                <Button type="button" variant="ghost" size="sm" className="h-7 px-2" disabled={busy} aria-label="Reset the breaker" onClick={() => setDraft((current) => ({ ...current, breaker: { ...defaults.breaker } }))}>
                                    Reset
                                </Button>
                            </span>
                        )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        {(
                            [
                                ["failures", "Failures"],
                                ["windowMinutes", "Within (minutes)"],
                                ["cooldownMinutes", "Leave alone for (minutes)"],
                            ] as const
                        ).map(([key, label]) => (
                            <div key={key} className="space-y-1">
                                <Label htmlFor={`routing-breaker-${key}`} className="text-xs">
                                    {label}
                                </Label>
                                <Input
                                    id={`routing-breaker-${key}`}
                                    type="number"
                                    min={1}
                                    value={Number.isNaN(draft.breaker[key]) ? "" : String(draft.breaker[key])}
                                    onChange={(event) => setBreaker(key, event.target.value)}
                                    disabled={busy}
                                />
                            </div>
                        ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                        That many technical failures inside the window and the provider is left alone for the cool-down; the backup answers meanwhile.
                        {defaults ? ` Default ${defaults.breaker.failures} in ${defaults.breaker.windowMinutes} min, left alone ${defaults.breaker.cooldownMinutes} min.` : ""}
                    </p>
                </div>
                <div className="space-y-2" data-testid="routing-name-match">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">Name match</p>
                        {defaults && draft.nameMatchMin !== defaults.nameMatchMin && (
                            <span className="flex items-center gap-1" data-testid="routing-name-match-changed">
                                <ChangedChip />
                                <Button type="button" variant="ghost" size="sm" className="h-7 px-2" disabled={busy} aria-label="Reset the name match" onClick={() => setDraft((current) => ({ ...current, nameMatchMin: defaults.nameMatchMin }))}>
                                    Reset
                                </Button>
                            </span>
                        )}
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="routing-name-match" className="text-xs">
                            Minimum score (0–100)
                        </Label>
                        <Input
                            id="routing-name-match"
                            type="number"
                            min={0}
                            max={100}
                            value={Number.isNaN(draft.nameMatchMin) ? "" : String(draft.nameMatchMin)}
                            onChange={(event) => setDraft((current) => ({ ...current, nameMatchMin: event.target.value.trim() === "" ? Number.NaN : Number(event.target.value) }))}
                            disabled={busy}
                        />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                        A bank or PAN name scoring at least this against the ID passes.{defaults ? ` Default ${defaults.nameMatchMin}.` : ""}
                    </p>
                </div>
            </section>

            {/* (e) UPI payout IDs */}
            <section className="space-y-1" data-testid="routing-upi">
                <Label htmlFor="routing-upi" className="text-sm font-medium">
                    UPI payout IDs
                </Label>
                <Select value={draft.upiCheck} onValueChange={(value) => setDraft((current) => ({ ...current, upiCheck: value as UpiCheck }))} disabled={busy}>
                    <SelectTrigger id="routing-upi" aria-label="UPI payout IDs" className="max-w-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {upiCheckOptions(stored.catalogue.upiChecks).map((value) => (
                            <SelectItem key={value} value={value}>
                                {UPI_CHECK_LABEL[value as UpiCheck] ?? value}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground" data-testid="routing-upi-description">
                    {UPI_CHECK_DESCRIPTION[draft.upiCheck] ?? ""}
                </p>
            </section>

            {/* (f) Steps per account type */}
            <section className="space-y-2" data-testid="routing-composites">
                <div>
                    <p className="text-sm font-medium text-foreground">Steps per account type</p>
                    <p className="text-xs text-muted-foreground">What ADX&apos;s own screens ask in place of each Digio workflow, in order. Business papers always go to the desk.</p>
                </div>
                <div className="divide-y divide-border rounded-md border border-border">
                    {workflowKeys.map((key) => (
                        <CompositeEditor
                            key={key}
                            workflowKey={key}
                            label={labelOf(key)}
                            steps={draft.composites[key] ?? null}
                            catalogue={stored.catalogue.steps}
                            defaultSteps={defaults?.composites[key]}
                            busy={busy}
                            onChange={(steps) => setSteps(key, steps)}
                            onUndo={() => setSteps(key, stored.composites[key] ?? [])}
                        />
                    ))}
                </div>
            </section>

            {problem && dirty && (
                <p className="text-sm text-danger" role="alert" data-testid="routing-problem">
                    {problem}
                </p>
            )}
            <div className="flex items-center justify-end gap-2">
                {dirty && (
                    <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={() => setDraft(initial)}>
                        Discard
                    </Button>
                )}
                <Button size="sm" className="h-8" disabled={!dirty || busy || problem !== null} onClick={() => void save()}>
                    {busy ? "Saving…" : "Save routing"}
                </Button>
            </div>
        </div>
    );
}

function CheckRow({
    check,
    route,
    offered,
    defaults,
    providerName,
    busy,
    onChange,
    onUndo,
}: {
    check: CheckType;
    route: CheckRoute | null | undefined;
    offered: { name: VerificationProvider; label: string }[];
    defaults: RoutingDefaults | undefined;
    providerName: (name: VerificationProvider) => string;
    busy: boolean;
    onChange: (route: CheckRoute | null) => void;
    onUndo: () => void;
}) {
    const label = checkLabel(check);
    const fallback = defaults?.checks[check];
    if (route === null) {
        return (
            <tr data-testid={`routing-check-${check}`}>
                <td className="py-2 pr-3 text-foreground">{label}</td>
                <td colSpan={1 + MAX_FALLBACKS} className="py-2 pr-3 text-xs text-muted-foreground" data-testid={`routing-check-${check}-default`}>
                    {fallback ? `Default: ${routeLine(fallback, providerName)}` : "Back to the default on save."}
                </td>
                <td className="py-2 text-right">
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2" disabled={busy} onClick={onUndo}>
                        Undo
                    </Button>
                </td>
            </tr>
        );
    }
    const current = route ?? { primary: offered[0]?.name ?? "CASHFREE_SECURE_ID", fallbacks: [] };
    const changed = routeChanged(defaults, check, current);
    // With defaults to compare against, only a row that differs offers "Reset"; without them, every row does.
    const resettable = defaults ? changed : true;
    const setPrimary = (primary: VerificationProvider) => onChange({ primary, fallbacks: current.fallbacks.filter((name) => name !== primary) });
    const setFallback = (index: number, value: string) => {
        const next = [...current.fallbacks];
        if (value === NONE) next.splice(index);
        else next[index] = value as VerificationProvider;
        onChange({ primary: current.primary, fallbacks: next.filter((name, position) => name && next.indexOf(name) === position) });
    };
    return (
        <tr data-testid={`routing-check-${check}`}>
            <td className="py-2 pr-3 text-foreground">
                <span className="flex flex-wrap items-center gap-1.5">
                    {label}
                    {changed && <ChangedChip />}
                </span>
            </td>
            <td className="py-2 pr-3">
                <Select value={current.primary} onValueChange={(value) => setPrimary(value as VerificationProvider)} disabled={busy}>
                    <SelectTrigger aria-label={`${label} primary`} className="h-8 min-w-36">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {offered.map((provider) => (
                            <SelectItem key={provider.name} value={provider.name}>
                                {provider.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </td>
            {Array.from({ length: MAX_FALLBACKS }, (_, index) => {
                const value: string = current.fallbacks[index] ?? NONE;
                // A fallback is never the primary, never one already chosen before it, and only after the one before it.
                const choices = offered.filter((provider) => provider.name !== current.primary && !current.fallbacks.slice(0, index).includes(provider.name));
                const reachable = index === 0 || current.fallbacks[index - 1] !== undefined;
                return (
                    <td key={index} className="py-2 pr-3">
                        <Select value={value} onValueChange={(next) => setFallback(index, next)} disabled={busy || !reachable || (choices.length === 0 && value === NONE)}>
                            <SelectTrigger aria-label={`${label} fallback ${index + 1}`} className="h-8 min-w-36">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NONE}>None</SelectItem>
                                {choices.map((provider) => (
                                    <SelectItem key={provider.name} value={provider.name}>
                                        {provider.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </td>
                );
            })}
            <td className="py-2 text-right">
                {resettable && (
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2" disabled={busy} onClick={() => onChange(null)} aria-label={`Reset ${label}`}>
                        Reset
                    </Button>
                )}
            </td>
        </tr>
    );
}

function CompositeEditor({
    workflowKey,
    label,
    steps,
    catalogue,
    defaultSteps,
    busy,
    onChange,
    onUndo,
}: {
    workflowKey: string;
    label: string;
    steps: CompositeStep[] | null;
    catalogue: CheckKind[];
    /** What a reset restores; undefined on an older server. */
    defaultSteps: CompositeStep[] | undefined;
    busy: boolean;
    onChange: (steps: CompositeStep[] | null) => void;
    onUndo: () => void;
}) {
    const problem = steps ? compositeProblem(steps) : null;
    const changed = Boolean(defaultSteps && steps && !sameSteps(steps, defaultSteps));
    const resettable = defaultSteps ? changed : true;
    const stepLine = (rows: readonly CompositeStep[]) => rows.map((row) => `${checkLabel(row.step)}${row.required ? "" : " (optional)"}`).join(" · ");
    const unused = catalogue.filter((step) => !(steps ?? []).some((row) => row.step === step));
    const move = (index: number, by: -1 | 1) => {
        if (!steps) return;
        const next = [...steps];
        const [row] = next.splice(index, 1);
        next.splice(index + by, 0, row!);
        onChange(next);
    };
    return (
        <details className="group px-3 py-2" data-testid={`routing-composite-${workflowKey}`}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm">
                <span className="flex flex-wrap items-center gap-1.5 text-foreground">
                    {label}
                    {changed && <ChangedChip />}
                </span>
                <span className="text-xs text-muted-foreground">
                    {steps === null ? (defaultSteps ? `Default: ${stepLine(defaultSteps)}` : "Default on save") : stepLine(steps)}
                </span>
            </summary>
            <div className="mt-2 space-y-2">
                {steps === null ? (
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span data-testid={`routing-composite-${workflowKey}-default`}>
                            {defaultSteps ? `Back to the default on save: ${stepLine(defaultSteps)}.` : "Goes back to the default steps on save."}
                        </span>
                        <Button type="button" variant="ghost" size="sm" className="h-7 px-2" disabled={busy} onClick={onUndo}>
                            Undo
                        </Button>
                    </div>
                ) : (
                    <>
                        <ol className="space-y-1">
                            {steps.map((row, index) => (
                                <li key={row.step} className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1" data-testid={`routing-step-${workflowKey}-${row.step}`}>
                                    <span className="w-5 text-xs tabular-nums text-muted-foreground">{index + 1}.</span>
                                    <span className="min-w-0 flex-1 text-sm text-foreground">{checkLabel(row.step)}</span>
                                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <Switch
                                            checked={row.required}
                                            aria-label={`${checkLabel(row.step)} required for ${label}`}
                                            onCheckedChange={(checked) => onChange(steps.map((item) => (item.step === row.step ? { ...item, required: checked } : item)))}
                                            disabled={busy}
                                        />
                                        Required
                                    </label>
                                    <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Move ${checkLabel(row.step)} up`} disabled={busy || index === 0} onClick={() => move(index, -1)}>
                                        <ArrowUp className="size-3.5" />
                                    </Button>
                                    <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Move ${checkLabel(row.step)} down`} disabled={busy || index === steps.length - 1} onClick={() => move(index, 1)}>
                                        <ArrowDown className="size-3.5" />
                                    </Button>
                                    <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Remove ${checkLabel(row.step)} from ${label}`} disabled={busy} onClick={() => onChange(steps.filter((item) => item.step !== row.step))}>
                                        <X className="size-3.5" />
                                    </Button>
                                </li>
                            ))}
                        </ol>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            {unused.length > 0 ? (
                                <Select value="" onValueChange={(value) => onChange([...steps, { step: value as CheckKind, required: true }])} disabled={busy}>
                                    <SelectTrigger aria-label={`Add a step to ${label}`} className="h-8 max-w-56">
                                        <SelectValue placeholder="Add a step" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {unused.map((step) => (
                                            <SelectItem key={step} value={step}>
                                                {checkLabel(step)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <span />
                            )}
                            {resettable && (
                                <Button type="button" variant="ghost" size="sm" className="h-7 px-2" disabled={busy} onClick={() => onChange(null)} aria-label={`Reset ${label} to default`}>
                                    Reset to default
                                </Button>
                            )}
                        </div>
                        {problem && <p className="text-xs text-danger">{problem}</p>}
                    </>
                )}
            </div>
        </details>
    );
}
