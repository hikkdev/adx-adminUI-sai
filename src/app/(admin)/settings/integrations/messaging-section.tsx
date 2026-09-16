"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/adx/status-badge";
import { cn } from "@/lib/utils";
import { EmailTestControl } from "./email-door";
import type { StatusMeta } from "@/types";
import type { SmsVocabulary } from "@/services/comms";
import {
    EMAIL_PRIMARIES,
    integrationsService,
    railLabel,
    railsOf,
    routingDraftOf,
    routingProblem,
    smsRoutingPatch,
    type EmailPrimary,
    type EmailSettings,
    type ResendSettings,
    type SmsRailName,
    type SmsRoutingDraft,
    type SmsSettings,
} from "@/services/integrations";

const NONE = "none";

/** The chips a rail card carries beside "Connected": its place in the routing order. */
export function railBadges(sms: SmsSettings | undefined, rail: SmsRailName): StatusMeta[] {
    const badges: StatusMeta[] = [];
    if ((sms?.primaryRail ?? "msg91") === rail) badges.push({ label: "Primary", tone: "info" });
    const fallback = (sms?.fallbackRails ?? []).indexOf(rail);
    if (fallback >= 0) badges.push({ label: `Fallback ${fallback + 1}`, tone: "neutral" });
    const kinds = Object.keys(sms?.templates?.[rail] ?? {}).length;
    if (kinds > 0) badges.push({ label: `${kinds} kind${kinds === 1 ? "" : "s"} registered`, tone: "neutral" });
    return badges;
}

/** The seam for the next operator: no keys, sends nothing, drawn so a rail the server names has a face. */
export function ThirdRailCard({ rail, sms }: { rail: SmsRailName; sms: SmsSettings | undefined }) {
    return (
        <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{railLabel(rail)}</p>
                    <StatusBadge status={{ label: "Not connected", tone: "neutral" }} />
                    {railBadges(sms, rail).map((badge) => (
                        <StatusBadge key={badge.label} status={badge} />
                    ))}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    The next operator&rsquo;s slot. Its adapter is a seam that sends nothing until one is wired; template ids registered against it are kept for that day.
                </p>
            </div>
        </div>
    );
}

/**
 * The routing table — `PUT /integrations { section: "sms", patch }`.
 *
 * Which rail sends first, which are tried when it throws, the DLT entity
 * and header every rail quotes, and each rail's own template id for each
 * kind of message ADX sends. None of it is secret; a kind with no id on
 * the rail in use is skipped, never sent (decision 128). The kinds down
 * the side and the rails across the top are the server's own list
 * (`GET /comms/sms-kinds`, E10-2), not one typed here.
 */
export function SmsRoutingCard({ sms, vocabulary, onChanged }: { sms: SmsSettings | undefined; vocabulary: SmsVocabulary; onChanged: () => void }) {
    const rails = React.useMemo(() => railsOf(sms, vocabulary.rails), [sms, vocabulary.rails]);
    const initial = React.useMemo(() => routingDraftOf(sms, rails), [sms, rails]);
    const [draft, setDraft] = React.useState<SmsRoutingDraft>(initial);
    const [busy, setBusy] = React.useState(false);

    const patch = smsRoutingPatch(sms, draft, rails);
    const dirty = Object.keys(patch).length > 0;
    const problem = routingProblem(draft);
    const set = (next: Partial<SmsRoutingDraft>) => setDraft((current) => ({ ...current, ...next }));

    const setFallback = (index: number, value: string) => {
        const next = [...draft.fallbackRails];
        if (value === NONE) next.splice(index, 1);
        else next[index] = value as SmsRailName;
        set({ fallbackRails: next.slice(0, 2) });
    };

    const setTemplateId = (rail: SmsRailName, kind: string, templateId: string) =>
        set({ templateIds: { ...draft.templateIds, [rail]: { ...(draft.templateIds[rail] ?? {}), [kind]: templateId } } });

    const save = async () => {
        if (problem) {
            toast.error(problem);
            return;
        }
        setBusy(true);
        try {
            await integrationsService.update("sms", patch);
            toast.success("SMS routing saved", {
                description: `${Object.keys(patch).length} field${Object.keys(patch).length === 1 ? "" : "s"} updated. The audit trail records the names, never the values.`,
            });
            onChanged();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not save the routing table.");
        } finally {
            setBusy(false);
        }
    };

    const fallbackOptions = (index: number) =>
        rails.filter((rail) => rail !== draft.primaryRail && !draft.fallbackRails.some((r, i) => r === rail && i !== index));

    return (
        <div className="space-y-4 rounded-lg border p-4">
            <div>
                <p className="text-sm font-semibold text-foreground">Routing</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    Which rail sends first and which are tried when it throws — each only if it has the kind registered and its keys on file.
                </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                    <Label htmlFor="sms-primary" className="text-xs">
                        Primary rail
                    </Label>
                    <Select
                        value={draft.primaryRail}
                        onValueChange={(value) => {
                            const primary = value as SmsRailName;
                            set({ primaryRail: primary, fallbackRails: draft.fallbackRails.filter((rail) => rail !== primary) });
                        }}
                    >
                        <SelectTrigger id="sms-primary">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {rails.map((rail) => (
                                <SelectItem key={rail} value={rail}>
                                    {railLabel(rail)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                {[0, 1].map((index) => (
                    <div key={index} className="space-y-1">
                        <Label htmlFor={`sms-fallback-${index}`} className="text-xs">
                            Fallback {index + 1}
                        </Label>
                        <Select value={draft.fallbackRails[index] ?? NONE} onValueChange={(value) => setFallback(index, value)}>
                            <SelectTrigger id={`sms-fallback-${index}`}>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NONE}>None</SelectItem>
                                {fallbackOptions(index).map((rail) => (
                                    <SelectItem key={rail} value={rail}>
                                        {railLabel(rail)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                    <Label htmlFor="sms-dlt" className="text-xs">
                        DLT entity id
                    </Label>
                    <Input
                        id="sms-dlt"
                        value={draft.dltEntityId}
                        maxLength={40}
                        placeholder="1101…"
                        className="font-mono text-xs"
                        onChange={(event) => set({ dltEntityId: event.target.value })}
                    />
                    <p className="text-[11px] text-muted-foreground">The TRAI principal entity every rail quotes.</p>
                </div>
                <div className="space-y-1">
                    <Label htmlFor="sms-sender" className="text-xs">
                        Sender header
                    </Label>
                    <Input
                        id="sms-sender"
                        value={draft.senderId}
                        maxLength={11}
                        placeholder="ADXOOH"
                        className="font-mono text-xs uppercase"
                        onChange={(event) => set({ senderId: event.target.value.toUpperCase() })}
                    />
                    <p className="text-[11px] text-muted-foreground">The six-letter DLT header. Twilio falls back to its number without one.</p>
                </div>
            </div>

            <div className="space-y-2">
                <div>
                    <p className="text-sm font-medium text-foreground">Template ids per kind</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        Each rail&rsquo;s own id for the DLT template of each message ADX sends. Blank means the rail has no registration and skips the kind.
                    </p>
                </div>
                <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b bg-muted/50 text-left font-medium text-muted-foreground">
                                <th className="px-3 py-2">Kind</th>
                                {rails.map((rail) => (
                                    <th key={rail} className="px-3 py-2">
                                        {railLabel(rail)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {vocabulary.kinds.length === 0 && (
                                <tr>
                                    <td colSpan={rails.length + 1} className="px-3 py-6 text-center text-muted-foreground">
                                        The server lists no SMS kinds.
                                    </td>
                                </tr>
                            )}
                            {vocabulary.kinds.map((kind) => (
                                <tr key={kind} className="border-b last:border-0">
                                    <td className="whitespace-nowrap px-3 py-1.5 font-mono text-foreground">{kind}</td>
                                    {rails.map((rail) => (
                                        <td key={rail} className="px-2 py-1.5">
                                            <Input
                                                value={draft.templateIds[rail]?.[kind] ?? ""}
                                                aria-label={`${railLabel(rail)} template id for ${kind}`}
                                                className={cn("h-8 font-mono text-xs", rail !== "msg91" && rail !== "twilio" && "border-dashed")}
                                                onChange={(event) => setTemplateId(rail, kind, event.target.value)}
                                            />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
                {problem && <p className="mr-auto text-xs text-danger">{problem}</p>}
                {dirty && (
                    <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={() => setDraft(initial)}>
                        Discard
                    </Button>
                )}
                <Button size="sm" className="h-8" disabled={!dirty || busy || Boolean(problem)} onClick={save}>
                    Save routing
                </Button>
            </div>
        </div>
    );
}

/**
 * The email door — `PUT /integrations { section: "email", patch: { primary } }`:
 * which of SMTP and Resend the dispatcher sends by (Lot E, Q87). AE-C: the
 * "Send test email" control sits under the switch, sending through the door
 * in force (`POST /integrations/email/test`) and printing the verdict; the
 * verdict is keyed away when the card re-reads.
 */
export function EmailDoorCard({
    email,
    resend,
    smtpConfigured,
    resendConfigured,
    operatorEmail,
    onChanged,
}: {
    email: EmailSettings | undefined;
    resend?: ResendSettings;
    smtpConfigured: boolean;
    resendConfigured: boolean;
    /** The signed-in operator's address, the To field's prefill. */
    operatorEmail?: string | null;
    onChanged: () => void;
}) {
    const [busy, setBusy] = React.useState<EmailPrimary | null>(null);
    const current = email?.primary ?? null;
    /** The resolver's own default when nobody has chosen: SMTP unless only a Resend key is on file. */
    const effective: EmailPrimary = current ?? (!smtpConfigured && resendConfigured ? "RESEND" : "SMTP");

    const choose = async (primary: EmailPrimary) => {
        setBusy(primary);
        try {
            await integrationsService.update("email", { primary });
            toast.success(primary === "SMTP" ? "Email goes by SMTP" : "Email goes by Resend", {
                description: "Every email the dispatcher renders from now on leaves by this door.",
            });
            onChanged();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not switch the email door.");
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="space-y-3 rounded-lg border p-4">
            <div>
                <p className="text-sm font-semibold text-foreground">Primary door</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    Which of the two the dispatcher sends by.{" "}
                    {current ? "" : "Nobody has chosen yet, so the server picks SMTP unless only a Resend key is on file."}
                </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
                {EMAIL_PRIMARIES.map((option) => {
                    const configured = option === "SMTP" ? smtpConfigured : resendConfigured;
                    const active = effective === option;
                    return (
                        <button
                            key={option}
                            type="button"
                            disabled={busy !== null || current === option}
                            onClick={() => choose(option)}
                            className={cn(
                                "flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-default",
                                active ? "border-primary bg-primary/[0.04]" : "hover:bg-muted/40",
                            )}
                        >
                            <span>
                                <span className="block font-medium text-foreground">{option === "SMTP" ? "SMTP" : "Resend"}</span>
                                <span className="block text-xs text-muted-foreground">{configured ? "Keys on file" : "Not configured"}</span>
                            </span>
                            {active && <StatusBadge status={{ label: current ? "Chosen" : "Default", tone: "info" }} />}
                        </button>
                    );
                })}
            </div>
            <div className="border-t pt-3">
                <EmailTestControl
                    // Keyed on the read so a verdict clears when the card re-reads.
                    key={JSON.stringify([email ?? null, resend ?? null])}
                    settings={{ email, resend }}
                    operatorEmail={operatorEmail}
                />
            </div>
        </div>
    );
}
