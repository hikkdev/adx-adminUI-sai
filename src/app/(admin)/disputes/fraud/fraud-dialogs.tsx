"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-client";
import {
    FRAUD_DECISION_MIN,
    FRAUD_ESCALATION_NOTE_MIN,
    FRAUD_KIND_MIN,
    FRAUD_SUBJECT_TYPES,
    FRAUD_SUMMARY_MIN,
    confirmableScopes,
    defaultScopesFor,
    fraudService,
    type FraudCase,
    type FraudDecision,
    type FraudSubjectType,
} from "@/services/fraud";
import { PARTY_LABEL, SCOPE_LABEL, scopeConsequence, type SuspensionScope } from "@/services/suspension";
import type { UserRow } from "@/services/users";

/* ------------------------------------------------------------------ */
/* Open a case                                                         */
/* ------------------------------------------------------------------ */

export interface OpenCaseDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Pre-filled when the case is opened from a party page or a dispute. With an id, the subject is locked. */
    subjectType?: FraudSubjectType;
    subjectId?: string;
    subjectName?: string | null;
    /** The dispute this case cites, when opened from one. */
    disputeId?: string | null;
    /** Lot G: pre-filled from a scan — the hot signals in the summary. Editable. */
    kind?: string;
    summary?: string;
    onOpened: (fraudCase: FraudCase) => void;
}

/**
 * `POST /fraud/cases`. The subject is one of the four parties a suspension
 * can land on; the summary is the case record and the schema wants at
 * least ten characters of it. A subject that does not exist answers 404
 * from the suspension read, which is the existence check.
 */
export function OpenCaseDialog({ open, onOpenChange, ...rest }: OpenCaseDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                {open && <OpenCaseForm {...rest} onClose={() => onOpenChange(false)} />}
            </DialogContent>
        </Dialog>
    );
}

function OpenCaseForm({
    subjectType: presetType,
    subjectId: presetId,
    subjectName,
    disputeId,
    kind: presetKind,
    summary: presetSummary,
    onOpened,
    onClose,
}: Omit<OpenCaseDialogProps, "open" | "onOpenChange"> & { onClose: () => void }) {
    const locked = !!presetId;
    const [subjectType, setSubjectType] = React.useState<FraudSubjectType>(presetType ?? "ADVERTISER");
    const [subjectId, setSubjectId] = React.useState(presetId ?? "");
    const [kind, setKind] = React.useState(presetKind ?? "");
    const [summary, setSummary] = React.useState(presetSummary ?? "");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
    const ready = subjectId.trim().length > 0 && kind.trim().length >= FRAUD_KIND_MIN && summary.trim().length >= FRAUD_SUMMARY_MIN;

    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        setError(null);
        setFieldErrors({});
        try {
            const created = await fraudService.open({
                subjectType,
                subjectId: subjectId.trim(),
                kind: kind.trim(),
                summary: summary.trim(),
                ...(disputeId ? { disputeId } : {}),
            });
            toast.success(`Case ${created.displayId ?? created.id} opened`, {
                description: `Against ${PARTY_LABEL[subjectType].toLowerCase()} ${subjectName ?? subjectId.trim()}. Recorded as FRAUD_CASE_OPENED.`,
            });
            onOpened(created);
            onClose();
        } catch (cause) {
            if (cause instanceof ApiError) {
                setFieldErrors(cause.fieldErrors);
                setError(cause.message);
            } else {
                setError(cause instanceof Error ? cause.message : "Could not open the case.");
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>Open a fraud case</DialogTitle>
                <DialogDescription>
                    A case records which party, on what evidence, who looked and what was done. Nothing touches the
                    party until it is confirmed.
                    {disputeId ? " This case will cite the dispute it was opened from." : ""}
                </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                    <Label htmlFor="fraud-subject-type">Subject</Label>
                    <Select
                        value={subjectType}
                        onValueChange={(value) => setSubjectType(value as FraudSubjectType)}
                        disabled={locked}
                    >
                        <SelectTrigger id="fraud-subject-type" className="h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {FRAUD_SUBJECT_TYPES.map((type) => (
                                <SelectItem key={type} value={type}>
                                    {PARTY_LABEL[type]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid gap-1.5">
                    <Label htmlFor="fraud-subject-id">{PARTY_LABEL[subjectType]} id</Label>
                    <Input
                        id="fraud-subject-id"
                        value={subjectId}
                        onChange={(event) => setSubjectId(event.target.value)}
                        placeholder="The record's id, from its page"
                        className="h-9 font-mono text-xs"
                        disabled={locked}
                        autoComplete="off"
                    />
                    {fieldErrors.subjectId?.[0] && <p className="text-xs text-danger">{fieldErrors.subjectId[0]}</p>}
                </div>
            </div>

            <div className="grid gap-1.5">
                <Label htmlFor="fraud-kind">Kind</Label>
                <Input
                    id="fraud-kind"
                    value={kind}
                    onChange={(event) => setKind(event.target.value)}
                    placeholder="Shared payout account, duplicate listing, self-approval…"
                    className="h-9"
                    maxLength={60}
                />
                <p className="text-xs text-muted-foreground">
                    {fieldErrors.kind?.[0] ?? "A short name for the pattern. Free text, so a new one needs no release."}
                </p>
            </div>

            <div className="grid gap-1.5">
                <Label htmlFor="fraud-summary">What was seen</Label>
                <Textarea
                    id="fraud-summary"
                    value={summary}
                    onChange={(event) => setSummary(event.target.value)}
                    rows={4}
                    maxLength={4000}
                    placeholder="Four advertisers sharing one payout account; the same device fingerprint on every sign-in."
                />
                <p className="text-xs text-muted-foreground">
                    {fieldErrors.summary?.[0] ?? "At least ten characters — it is the case record."}
                </p>
            </div>

            {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onClose}>
                    Cancel
                </Button>
                <Button type="submit" disabled={!ready || busy}>
                    {busy ? "Opening…" : "Open case"}
                </Button>
            </DialogFooter>
        </form>
    );
}

/* ------------------------------------------------------------------ */
/* Decide a case                                                       */
/* ------------------------------------------------------------------ */

export interface DecideCaseDialogProps {
    fraudCase: FraudCase;
    verdict: "CONFIRMED" | "DISMISSED";
    /** Scopes the subject already carries; drawn ticked and locked, as the suspend dialog does. */
    current: SuspensionScope[];
    subjectName: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onDecided: (decision: FraudDecision) => void;
}

/**
 * `POST /fraud/cases/:id/decide`.
 *
 * CONFIRMED suspends the subject on the scopes ticked — the suspend dialog's
 * own per-party list with its consequence sentences, the default pair
 * pre-ticked — with the case number as the reason. DISMISSED on an open
 * case touches the party not at all; on a confirmed case it is an overturn
 * and lifts exactly what this case applied. Either way the decision text
 * goes on the record.
 */
export function DecideCaseDialog(props: DecideCaseDialogProps) {
    return (
        <Dialog open={props.open} onOpenChange={props.onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                {props.open && <DecideForm {...props} onClose={() => props.onOpenChange(false)} />}
            </DialogContent>
        </Dialog>
    );
}

function DecideForm({ fraudCase, verdict, current, subjectName, onDecided, onClose }: DecideCaseDialogProps & { onClose: () => void }) {
    const admitted = confirmableScopes(fraudCase.subjectType);
    const [picked, setPicked] = React.useState<SuspensionScope[]>(defaultScopesFor(fraudCase.subjectType));
    const [decision, setDecision] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const confirming = verdict === "CONFIRMED";
    const overturn = !confirming && fraudCase.status === "CONFIRMED";
    /* Only scopes not already in force are sent, as the suspend dialog does;
       the server filters the same way, so `scopesApplied` is exactly what
       this case did. */
    const adding = picked.filter((scope) => !current.includes(scope));
    const ready = decision.trim().length >= FRAUD_DECISION_MIN && (!confirming || adding.length > 0);
    const number = fraudCase.displayId ?? fraudCase.id;
    const who = subjectName ?? fraudCase.subjectId;

    const toggle = (scope: SuspensionScope) =>
        setPicked((list) => (list.includes(scope) ? list.filter((item) => item !== scope) : [...list, scope]));

    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        setError(null);
        try {
            const decided = await fraudService.decide(fraudCase.id, {
                status: verdict,
                decision: decision.trim(),
                ...(confirming ? { scopes: admitted.filter((scope) => adding.includes(scope)) } : {}),
            });
            const applied = decided.scopesApplied.map((scope) => SCOPE_LABEL[scope]).join(", ");
            const lifted = decided.scopesLifted.map((scope) => SCOPE_LABEL[scope]).join(", ");
            toast.success(confirming ? `${number} confirmed` : `${number} dismissed`, {
                description: confirming
                    ? applied
                        ? `${who} suspended: ${applied}. Reason on the case: "Fraud case ${number}".`
                        : `${who} was already carrying every scope asked for; nothing new applied.`
                    : lifted
                      ? `Lifted ${lifted} from ${who} — what this case applied, and nothing else.`
                      : `Nothing was in force from this case; ${who} is untouched.`,
            });
            onDecided(decided);
            onClose();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not decide the case.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>{confirming ? `Confirm ${number}` : overturn ? `Overturn ${number}` : `Dismiss ${number}`}</DialogTitle>
                <DialogDescription>
                    {confirming
                        ? `Suspends ${who} on the sections ticked, with the case number as the reason. Each is recorded with your name and lifted separately.`
                        : overturn
                          ? `Lifts exactly what this case applied to ${who}. A section they were carrying before the case, or took from another since, stays.`
                          : `Closes the case with nothing done to ${who}. A dismissal is final — a new case would have to be opened.`}
                </DialogDescription>
            </DialogHeader>

            {confirming && (
                <fieldset className="space-y-2" data-testid="fraud-scopes">
                    <legend className="sr-only">Sections</legend>
                    {admitted.map((scope) => {
                        const inForce = current.includes(scope);
                        const checked = inForce || picked.includes(scope);
                        const id = `fraud-scope-${scope.toLowerCase()}`;
                        return (
                            <label
                                key={scope}
                                htmlFor={id}
                                className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 has-[:disabled]:cursor-default has-[:disabled]:opacity-70"
                            >
                                <Checkbox
                                    id={id}
                                    checked={checked}
                                    disabled={inForce}
                                    onCheckedChange={() => toggle(scope)}
                                    aria-label={SCOPE_LABEL[scope]}
                                    className="mt-0.5"
                                />
                                <span className="min-w-0">
                                    <span className="block text-sm font-medium text-foreground">
                                        {SCOPE_LABEL[scope]}
                                        {inForce && (
                                            <span className="ml-2 text-xs font-normal text-muted-foreground">already in force</span>
                                        )}
                                    </span>
                                    <span className="block text-xs text-muted-foreground">
                                        {scopeConsequence(scope, fraudCase.subjectType, {})}
                                    </span>
                                </span>
                            </label>
                        );
                    })}
                </fieldset>
            )}

            <div className="grid gap-1.5">
                <Label htmlFor="fraud-decision">Decision</Label>
                <Textarea
                    id="fraud-decision"
                    value={decision}
                    onChange={(event) => setDecision(event.target.value)}
                    rows={3}
                    maxLength={4000}
                    placeholder={confirming ? "PAN, device and payout account shared across four accounts; confirmed." : "Shared device was a family shop; nothing further."}
                />
                <p className="text-xs text-muted-foreground">
                    Required. Goes on the record and the FRAUD_CASE_DECIDED audit row; the opener and the investigator are told.
                </p>
            </div>

            {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onClose}>
                    Cancel
                </Button>
                <Button type="submit" variant={confirming ? "destructive" : "default"} disabled={!ready || busy}>
                    {busy ? "Working…" : confirming ? "Confirm and suspend" : overturn ? "Overturn" : "Dismiss"}
                </Button>
            </DialogFooter>
        </form>
    );
}

/* ------------------------------------------------------------------ */
/* Escalate a case — Lot G (Q118)                                      */
/* ------------------------------------------------------------------ */

export interface EscalateCaseDialogProps {
    fraudCase: FraudCase;
    /** The console's ADMIN users — who it can be handed to. */
    admins: UserRow[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onEscalated: (fraudCase: FraudCase) => void;
}

const INVESTIGATOR = "__investigator__";

/**
 * `POST /fraud/cases/:id/escalate` — the frame's "Escalate to legal".
 *
 * The case goes ESCALATED, a working status: notes, evidence and the
 * decision all continue. The note is required; the assignee is a named
 * admin or, left as "the investigator", whoever is on the case (nobody,
 * when nobody is). The escalatee is told in-app. 409 once escalated or
 * decided.
 */
export function EscalateCaseDialog(props: EscalateCaseDialogProps) {
    return (
        <Dialog open={props.open} onOpenChange={props.onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                {props.open && <EscalateForm {...props} onClose={() => props.onOpenChange(false)} />}
            </DialogContent>
        </Dialog>
    );
}

function EscalateForm({ fraudCase, admins, onEscalated, onClose }: EscalateCaseDialogProps & { onClose: () => void }) {
    const [note, setNote] = React.useState("");
    const [toUserId, setToUserId] = React.useState<string>(INVESTIGATOR);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const number = fraudCase.displayId ?? fraudCase.id;
    /* G11-1: the case names its investigator; the pickers' list stands in for a row a write answered without names. */
    const investigator = fraudCase.assignedToUserId
        ? fraudCase.assignedTo?.name?.trim() || admins.find((user) => user.id === fraudCase.assignedToUserId)?.displayName || fraudCase.assignedToUserId
        : null;
    const ready = note.trim().length >= FRAUD_ESCALATION_NOTE_MIN;

    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        setError(null);
        try {
            const escalated = await fraudService.escalate(fraudCase.id, {
                note: note.trim(),
                ...(toUserId === INVESTIGATOR ? {} : { toUserId }),
            });
            const who = admins.find((user) => user.id === escalated.escalatedToUserId)?.displayName ?? escalated.escalatedToUserId;
            toast.success(`${number} escalated to legal`, {
                description: who ? `Handed to ${who}; they have been told. Recorded as FRAUD_CASE_ESCALATED.` : "Nobody is on the case to hand it to; the status still moved. Recorded as FRAUD_CASE_ESCALATED.",
            });
            onEscalated(escalated);
            onClose();
        } catch (cause) {
            if (cause instanceof ApiError) setError(cause.fieldErrors.note?.[0] ?? cause.message);
            else setError(cause instanceof Error ? cause.message : "Could not escalate the case.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>Escalate {number} to legal</DialogTitle>
                <DialogDescription>
                    The case stays open — notes, evidence and the decision continue — under an ESCALATED status. Whoever it is
                    handed to is told in-app.
                </DialogDescription>
            </DialogHeader>

            <div className="grid gap-1.5">
                <Label htmlFor="fraud-escalate-to">Hand to</Label>
                <Select value={toUserId} onValueChange={setToUserId}>
                    <SelectTrigger id="fraud-escalate-to" className="h-9">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={INVESTIGATOR}>
                            {investigator ? `The investigator (${investigator})` : "The investigator (nobody is on it yet)"}
                        </SelectItem>
                        {admins.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                                {user.displayName}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="grid gap-1.5">
                <Label htmlFor="fraud-escalation-note">Why</Label>
                <Textarea
                    id="fraud-escalation-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={3}
                    maxLength={4000}
                    placeholder="Four accounts on one PAN and one payout account; the sums warrant a notice."
                />
                <p className="text-xs text-muted-foreground">Required. Goes on the record and the FRAUD_CASE_ESCALATED audit row.</p>
            </div>

            {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onClose}>
                    Cancel
                </Button>
                <Button type="submit" variant="destructive" disabled={!ready || busy}>
                    {busy ? "Escalating…" : "Escalate to legal"}
                </Button>
            </DialogFooter>
        </form>
    );
}
