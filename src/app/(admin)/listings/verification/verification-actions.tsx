"use client";

import * as React from "react";
import { BellRing, CalendarPlus, CheckCircle2, MapPinned, PhoneCall } from "lucide-react";
import type { BulkAction } from "@/components/adx/bulk-actions";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { useRosterPermission } from "@/components/adx/party-roster-row-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { isLive } from "@/lib/api-config";
import { runWithSummary, type BulkOutcome } from "@/lib/bulk";
import { supplyService } from "@/services/supply";
import {
    CONTACT_CHANNEL_CHOICES,
    EXTEND_DEFAULT_DAYS,
    EXTEND_MAX_DAYS,
    EXTEND_REASON_MIN,
    VERIFICATION_ACTION_PERMISSION,
    caseClosedSkip,
    extendSkip,
    lapseSuspended,
    remindSkip,
    siteCheckSkip,
    type ContactChannelChoice,
} from "@/services/verification-queue";
import type { ComplianceCase, VerificationQueueRow } from "@/types";
import { useListingSuspensionBulkActions } from "../listings-bulk";

/**
 * What Listings › Verification can do about a lapse — 3 Oct 2026, the owner:
 * "If verifications lapsed, what action can we take here?"
 *
 * Each action is the single-row route, run over the ticked rows a few at a
 * time through the shared bulk bar (`BulkActions`, `@/lib/bulk`) — and the
 * row menu runs the same definition on one row (`RowActionDialog`), so a
 * decision from the menu and from the bar are one decision:
 *
 *   Remind publisher   `POST /supply/listings/:id/reverification/remind`      supply.edit
 *   Send an agent      `POST /supply/listings/:id/reverification/site-check`  supply.edit
 *   Give more time…    `POST /supply/listings/:id/reverification/extend`      supply.approve
 *   Suspend… / Reinstate  the Listings table's own (`/listings/:id/suspend`)   supply.suspend
 *
 * and on the compliance cases:
 *
 *   Log contact attempt…  `POST /supply/compliance/cases/:id/attempts`      supply.edit
 *   Resolve…              `PATCH /supply/compliance/cases/:id/resolve`      supply.approve
 *
 * An action the viewer may not take is not offered. Nothing here marks a
 * spot verified — that is the coordinator's open question to the owner.
 */

const listingNoun = ["listing", "listings"] as const;
const caseNoun = ["case", "cases"] as const;

export function useVerificationActions(): BulkAction<VerificationQueueRow>[] {
    const mayRemind = useRosterPermission(VERIFICATION_ACTION_PERMISSION.remind);
    const maySend = useRosterPermission(VERIFICATION_ACTION_PERMISSION.siteCheck);
    const mayExtend = useRosterPermission(VERIFICATION_ACTION_PERMISSION.extend);
    const supplyLive = isLive("supply");
    const suspension = useListingSuspensionBulkActions<VerificationQueueRow>((row) => ({
        id: row.listingId,
        scopes: row.suspensionScopes,
        lapseSuspended: lapseSuspended(row),
    }));

    /* "Send an agent": a line for the agent. "Give more time": the days and why. Reset as each dialog opens. */
    const [agentNote, setAgentNote] = React.useState("");
    const [days, setDays] = React.useState(String(EXTEND_DEFAULT_DAYS));
    const [reason, setReason] = React.useState("");

    const dayCount = Number(days);
    const daysFit = Number.isInteger(dayCount) && dayCount >= 1 && dayCount <= EXTEND_MAX_DAYS;
    const reasonTrimmed = reason.trim();

    const actions: BulkAction<VerificationQueueRow>[] = [];
    if (supplyLive && mayRemind) {
        actions.push({
            key: "remind",
            label: "Remind publisher",
            icon: BellRing,
            skip: remindSkip,
            participle: "reminded",
            noun: listingNoun,
            phrase: (count) => `Remind the publishers of ${count}`,
            description:
                "Each publisher gets a push and an app notice that opens the listing's photo check. A listing reminded in the last 24 hours is refused and stays ticked.",
            run: (row) => supplyService.remindReverification(row.listingId),
        });
    }
    if (supplyLive && maySend) {
        actions.push({
            key: "site-check",
            label: "Send an agent",
            icon: MapPinned,
            skip: siteCheckSkip,
            participle: "sent an agent",
            noun: listingNoun,
            phrase: (count) => `Send an agent to ${count}`,
            description:
                "Each spot's visit is offered to a free agent in its city, who has 25 minutes to answer. It shows on the dispatch board tagged Re-verification. A spot with a visit already booked is refused.",
            onOpen: () => setAgentNote(""),
            body: (
                <div className="grid gap-1.5">
                    <Label htmlFor="verification-agent-note">A line for the agent (optional)</Label>
                    <Textarea
                        id="verification-agent-note"
                        value={agentNote}
                        onChange={(event) => setAgentNote(event.target.value)}
                        rows={2}
                        maxLength={500}
                        placeholder="Gate code 4411; ask for the watchman."
                    />
                </div>
            ),
            run: (row) => supplyService.dispatchSiteCheck(row.listingId, agentNote.trim() ? { note: agentNote.trim() } : {}),
        });
    }
    if (supplyLive && mayExtend) {
        actions.push({
            key: "extend",
            label: "Give more time…",
            icon: CalendarPlus,
            skip: extendSkip,
            participle: "given more time",
            noun: listingNoun,
            phrase: (count) => `Give ${count} more time`,
            description:
                "Each due date moves on by the days given — from today for one already overdue — and its earnings run again until then. Nothing is marked verified.",
            ready: daysFit && reasonTrimmed.length >= EXTEND_REASON_MIN,
            onOpen: () => {
                setDays(String(EXTEND_DEFAULT_DAYS));
                setReason("");
            },
            body: (
                <div className="space-y-3">
                    <div className="grid gap-1.5">
                        <Label htmlFor="verification-extend-days">Days (1 to {EXTEND_MAX_DAYS})</Label>
                        <Input
                            id="verification-extend-days"
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={EXTEND_MAX_DAYS}
                            value={days}
                            onChange={(event) => setDays(event.target.value)}
                            className="w-32"
                        />
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="verification-extend-reason">Reason</Label>
                        <Textarea
                            id="verification-extend-reason"
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            rows={3}
                            maxLength={500}
                            placeholder="Publisher is out of town until next week."
                        />
                    </div>
                </div>
            ),
            run: (row) => supplyService.extendReverification(row.listingId, { days: dayCount, reason: reasonTrimmed }),
        });
    }
    actions.push(...suspension);
    return actions;
}

export function useCaseActions(): BulkAction<ComplianceCase>[] {
    const mayLog = useRosterPermission(VERIFICATION_ACTION_PERMISSION.logAttempt);
    const mayResolve = useRosterPermission(VERIFICATION_ACTION_PERMISSION.resolve);
    const supplyLive = isLive("supply");

    const [channel, setChannel] = React.useState<ContactChannelChoice>("CALL");
    const [attemptOutcome, setAttemptOutcome] = React.useState("");
    const [attemptNote, setAttemptNote] = React.useState("");
    const [resolveOutcome, setResolveOutcome] = React.useState("");
    const [resolveNote, setResolveNote] = React.useState("");

    const actions: BulkAction<ComplianceCase>[] = [];
    if (supplyLive && mayLog) {
        actions.push({
            key: "log-attempt",
            label: "Log contact attempt…",
            icon: PhoneCall,
            skip: caseClosedSkip,
            participle: "logged",
            noun: caseNoun,
            phrase: (count) => `Log an attempt on ${count}`,
            description: "The same attempt is recorded on each. An open case moves to Contacted.",
            ready: attemptOutcome.trim().length > 0,
            onOpen: () => {
                setChannel("CALL");
                setAttemptOutcome("");
                setAttemptNote("");
            },
            body: (
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="grid gap-1.5">
                            <Label htmlFor="case-attempt-channel">Channel</Label>
                            <Select value={channel} onValueChange={(value) => setChannel(value as ContactChannelChoice)}>
                                <SelectTrigger id="case-attempt-channel" className="h-9 w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {CONTACT_CHANNEL_CHOICES.map((choice) => (
                                        <SelectItem key={choice.value} value={choice.value}>
                                            {choice.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="case-attempt-outcome">Outcome</Label>
                            <Input
                                id="case-attempt-outcome"
                                value={attemptOutcome}
                                onChange={(event) => setAttemptOutcome(event.target.value)}
                                maxLength={200}
                                placeholder="No answer"
                                className="h-9"
                            />
                        </div>
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="case-attempt-note">Note (optional)</Label>
                        <Textarea id="case-attempt-note" value={attemptNote} onChange={(event) => setAttemptNote(event.target.value)} rows={2} maxLength={1000} />
                    </div>
                </div>
            ),
            run: (item) =>
                supplyService.logContactAttempt(item.id, {
                    channel,
                    outcome: attemptOutcome.trim(),
                    ...(attemptNote.trim() ? { note: attemptNote.trim() } : {}),
                }),
        });
    }
    if (supplyLive && mayResolve) {
        actions.push({
            key: "resolve",
            label: "Resolve…",
            icon: CheckCircle2,
            skip: caseClosedSkip,
            participle: "resolved",
            noun: caseNoun,
            phrase: (count) => `Resolve ${count}`,
            description: "Each case closes with your outcome and note on its record. A spot whose re-check is still overdue opens a new case on a later sweep.",
            ready: resolveOutcome.trim().length > 0,
            onOpen: () => {
                setResolveOutcome("");
                setResolveNote("");
            },
            body: (
                <div className="space-y-3">
                    <div className="grid gap-1.5">
                        <Label htmlFor="case-resolve-outcome">Outcome</Label>
                        <Input
                            id="case-resolve-outcome"
                            value={resolveOutcome}
                            onChange={(event) => setResolveOutcome(event.target.value)}
                            maxLength={200}
                            placeholder="Publisher re-verified the spot"
                        />
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="case-resolve-note">Note (optional)</Label>
                        <Textarea id="case-resolve-note" value={resolveNote} onChange={(event) => setResolveNote(event.target.value)} rows={2} maxLength={1000} />
                    </div>
                </div>
            ),
            run: (item) =>
                supplyService.resolveComplianceCase(item.id, {
                    outcome: resolveOutcome.trim(),
                    ...(resolveNote.trim() ? { note: resolveNote.trim() } : {}),
                }),
        });
    }
    return actions;
}

/** The menu item's words for an action: its label without the trailing ellipsis. */
const plainLabel = (label: string): string => label.replace(/…$/, "");

/**
 * One action from the row menu: the same definition the bulk bar runs, on
 * one row — the same inputs, the same route, and the same one-line summary
 * when it is done. The action is looked up by key on every draw, as the bar
 * does, so its inputs and its call read the dialog's current state.
 */
export function RowActionDialog<T>({
    actions,
    pending,
    label,
    onClose,
    onSettled,
}: {
    actions: BulkAction<T>[];
    pending: { key: string; row: T } | null;
    label: (row: T) => string;
    onClose: () => void;
    onSettled: (outcome: BulkOutcome<T>) => void;
}) {
    const [busy, setBusy] = React.useState(false);
    const action = pending ? actions.find((item) => item.key === pending.key) : undefined;
    if (!pending || !action) return null;
    const { row } = pending;
    const run = action.run;
    const participle = action.participle;

    async function confirm() {
        setBusy(true);
        onClose();
        // Never throws: the row lands in done or failed, and the toast has gone out.
        const outcome = await runWithSummary({ rows: [row], action: run, participle, label });
        setBusy(false);
        onSettled(outcome);
    }

    return (
        <ConfirmDialog
            open
            onOpenChange={(open) => !open && onClose()}
            title={`${plainLabel(action.label)} — ${label(row)}`}
            description={action.description ?? ""}
            confirmLabel={plainLabel(action.label)}
            destructive={action.destructive}
            busy={busy}
            disabled={action.ready === false}
            onConfirm={() => void confirm()}
        >
            {action.body}
        </ConfirmDialog>
    );
}

/** Opens a row's action: resets its inputs, as the bar does when its dialog opens, and remembers which row. */
export function useRowAction<T>(actions: BulkAction<T>[]) {
    const [pending, setPending] = React.useState<{ key: string; row: T } | null>(null);
    const open = React.useCallback(
        (key: string, row: T) => {
            actions.find((item) => item.key === key)?.onOpen?.();
            setPending({ key, row });
        },
        [actions],
    );
    return { pending, open, close: () => setPending(null) };
}
