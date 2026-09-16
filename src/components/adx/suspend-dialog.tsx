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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import {
    PARTY_LABEL,
    SCOPE_LABEL,
    SUSPENSION_REASON_MAX,
    SUSPENSION_REASON_MIN,
    admittedScopes,
    describeEffects,
    reinstateConsequence,
    scopeConsequence,
    suspensionService,
    type SuspensionPartyType,
    type SuspensionScope,
} from "@/services/suspension";

/**
 * Suspending a section of a party, and lifting it — Lot A.
 *
 * One dialog for the four parties rather than four: the difference between
 * suspending a listing and suspending an agent is which scopes are offered and
 * what each one does, and both come from `services/suspension`, which mirrors
 * the backend README's table. A scope the party does not admit is never drawn,
 * so the server's 400 for one is unreachable from here.
 *
 * Every checkbox carries its consequence sentence, because "Stop open work" is
 * a label and "3 running orders are cancelled and their advertisers refunded"
 * is a decision. The reason is required — the server refuses a suspension
 * without one, and so does the table's own CHECK.
 */

interface PartyProps {
    partyType: SuspensionPartyType;
    partyId: string;
    /** What to call them in the title and the toast. */
    partyName: string;
    /** In force now. Already-suspended scopes are shown ticked and locked. */
    current: SuspensionScope[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Called after the write lands, so the page refetches the party and its case. */
    onDone: () => void;
}

export interface SuspendDialogProps extends PartyProps {
    /**
     * How many orders STOP_OPEN_WORK would cancel, when the page already has
     * them (the listing page and the agent page read their orders). Left off,
     * the sentence has no number, which is honest rather than a zero.
     */
    runningOrders?: number | null;
    /** The advertiser's equivalent: scheduled and live campaigns. */
    runningCampaigns?: number | null;
}

export type ReinstateDialogProps = PartyProps;

/* ------------------------------------------------------------------ */
/* Suspend                                                             */
/* ------------------------------------------------------------------ */

export function SuspendDialog(props: SuspendDialogProps) {
    return (
        <Dialog open={props.open} onOpenChange={props.onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                {/* Mounted only while open, so the form is fresh each time. */}
                <SuspendForm {...props} onClose={() => props.onOpenChange(false)} />
            </DialogContent>
        </Dialog>
    );
}

function SuspendForm({
    partyType,
    partyId,
    partyName,
    current,
    runningOrders,
    runningCampaigns,
    onClose,
    onDone,
}: SuspendDialogProps & { onClose: () => void }) {
    const admitted = admittedScopes(partyType);
    const [picked, setPicked] = React.useState<SuspensionScope[]>([]);
    const [reason, setReason] = React.useState("");
    const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
    const [formError, setFormError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const trimmed = reason.trim();
    const reasonOk = trimmed.length >= SUSPENSION_REASON_MIN && trimmed.length <= SUSPENSION_REASON_MAX;
    /* Only scopes not already in force are sent: the server treats a repeat
       as a no-op on the list, but a request that asks for nothing new is a
       mis-click rather than a decision. */
    const adding = picked.filter((scope) => !current.includes(scope));
    const ready = reasonOk && adding.length > 0 && isLive("suspension");

    const toggle = (scope: SuspensionScope) =>
        setPicked((list) => (list.includes(scope) ? list.filter((item) => item !== scope) : [...list, scope]));

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        setFieldErrors({});
        setFormError(null);
        try {
            const result = await suspensionService.suspend(partyType, partyId, {
                scopes: admitted.filter((scope) => adding.includes(scope)),
                reason: trimmed,
            });
            const did = describeEffects(result.effects);
            toast.success(`${partyName} suspended`, {
                description: did.length
                    ? did.join(", ").replace(/^./, (c) => c.toUpperCase()) + "."
                    : `${adding.map((scope) => SCOPE_LABEL[scope]).join(", ")} in force. Recorded with your name against it.`,
            });
            onDone();
            onClose();
        } catch (cause) {
            if (cause instanceof ApiError) {
                setFieldErrors(cause.fieldErrors);
                setFormError(cause.message);
            } else {
                setFormError(cause instanceof Error ? cause.message : "Could not suspend.");
            }
        } finally {
            setBusy(false);
        }
    }

    const stopsWork = adding.includes("STOP_OPEN_WORK");
    const workCount = partyType === "ADVERTISER" ? runningCampaigns : runningOrders;

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>Suspend {PARTY_LABEL[partyType].toLowerCase()}</DialogTitle>
                <DialogDescription>
                    Which sections of {partyName} to stop. Each one is recorded with your name and the reason, and
                    lifted separately.
                </DialogDescription>
            </DialogHeader>

            <fieldset className="space-y-2" data-testid="suspend-scopes">
                <legend className="sr-only">Sections</legend>
                {admitted.map((scope) => {
                    const inForce = current.includes(scope);
                    const checked = inForce || picked.includes(scope);
                    const id = `suspend-${scope.toLowerCase()}`;
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
                                    {scopeConsequence(scope, partyType, { runningOrders, runningCampaigns })}
                                </span>
                            </span>
                        </label>
                    );
                })}
            </fieldset>

            {stopsWork && (
                <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" data-testid="stop-work-confirm">
                    {typeof workCount === "number"
                        ? partyType === "ADVERTISER"
                            ? `This cancels ${workCount} scheduled or live campaign${workCount === 1 ? "" : "s"} now.`
                            : partyType === "AGENT"
                              ? `This hands back ${workCount} unanswered offer${workCount === 1 ? "" : "s"} now.`
                              : `This cancels ${workCount} running order${workCount === 1 ? "" : "s"} now.`
                        : "This stops the work in flight now."}{" "}
                    Reinstating later does not bring it back.
                </p>
            )}

            <div className="grid gap-1.5">
                <Label htmlFor="suspend-reason">Reason</Label>
                <Textarea
                    id="suspend-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={3}
                    maxLength={SUSPENSION_REASON_MAX}
                    placeholder="Chargebacks under investigation."
                />
                <p className="text-xs text-muted-foreground">
                    {fieldErrors.reason?.[0] ??
                        "Required, at least three characters. Sent to the party and recorded on the case and in the audit trail."}
                </p>
            </div>

            {formError && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p>}

            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onClose}>
                    Cancel
                </Button>
                <Button type="submit" variant="destructive" disabled={!ready || busy}>
                    {busy ? "Suspending…" : "Suspend"}
                </Button>
            </DialogFooter>
        </form>
    );
}

/* ------------------------------------------------------------------ */
/* Reinstate                                                           */
/* ------------------------------------------------------------------ */

export function ReinstateDialog(props: ReinstateDialogProps) {
    return (
        <Dialog open={props.open} onOpenChange={props.onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <ReinstateForm {...props} onClose={() => props.onOpenChange(false)} />
            </DialogContent>
        </Dialog>
    );
}

function ReinstateForm({
    partyType,
    partyId,
    partyName,
    current,
    onClose,
    onDone,
}: ReinstateDialogProps & { onClose: () => void }) {
    /* Only what is in force can be lifted, in the vocabulary's order. */
    const inForce = admittedScopes(partyType).filter((scope) => current.includes(scope));
    const [picked, setPicked] = React.useState<SuspensionScope[]>(inForce);
    const [reason, setReason] = React.useState("");
    const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
    const [formError, setFormError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const trimmed = reason.trim();
    const reasonOk = trimmed.length >= SUSPENSION_REASON_MIN && trimmed.length <= SUSPENSION_REASON_MAX;
    const liftingAll = picked.length === inForce.length;
    const ready = reasonOk && picked.length > 0 && isLive("suspension");

    const toggle = (scope: SuspensionScope) =>
        setPicked((list) => (list.includes(scope) ? list.filter((item) => item !== scope) : [...list, scope]));

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        setFieldErrors({});
        setFormError(null);
        try {
            /* Lifting everything sends no scopes: that is what "reinstate"
               means to the server, and it keeps a stale list from leaving
               something behind. */
            const result = await suspensionService.reinstate(partyType, partyId, {
                ...(liftingAll ? {} : { scopes: inForce.filter((scope) => picked.includes(scope)) }),
                reason: trimmed,
            });
            toast.success(`${partyName} reinstated`, {
                description:
                    result.scopes.length === 0
                        ? "Nothing is in force any more."
                        : `Lifted ${result.lifted.map((scope) => SCOPE_LABEL[scope]).join(", ")}. Still in force: ${result.scopes
                              .map((scope) => SCOPE_LABEL[scope])
                              .join(", ")}.`,
            });
            onDone();
            onClose();
        } catch (cause) {
            if (cause instanceof ApiError) {
                setFieldErrors(cause.fieldErrors);
                setFormError(cause.message);
            } else {
                setFormError(cause instanceof Error ? cause.message : "Could not reinstate.");
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>Reinstate {PARTY_LABEL[partyType].toLowerCase()}</DialogTitle>
                <DialogDescription>
                    Which sections of {partyName} to lift. All of them are ticked; untick any that should stay.
                </DialogDescription>
            </DialogHeader>

            <fieldset className="space-y-2" data-testid="reinstate-scopes">
                <legend className="sr-only">Sections in force</legend>
                {inForce.map((scope) => {
                    const id = `reinstate-${scope.toLowerCase()}`;
                    return (
                        <label
                            key={scope}
                            htmlFor={id}
                            className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3"
                        >
                            <Checkbox
                                id={id}
                                checked={picked.includes(scope)}
                                onCheckedChange={() => toggle(scope)}
                                aria-label={SCOPE_LABEL[scope]}
                                className="mt-0.5"
                            />
                            <span className="min-w-0">
                                <span className="block text-sm font-medium text-foreground">{SCOPE_LABEL[scope]}</span>
                                <span className="block text-xs text-muted-foreground">
                                    {reinstateConsequence(scope, partyType)}
                                </span>
                            </span>
                        </label>
                    );
                })}
            </fieldset>

            <div className="grid gap-1.5">
                <Label htmlFor="reinstate-reason">Reason</Label>
                <Textarea
                    id="reinstate-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={3}
                    maxLength={SUSPENSION_REASON_MAX}
                    placeholder="Investigation closed; nothing found."
                />
                <p className="text-xs text-muted-foreground">
                    {fieldErrors.reason?.[0] ?? "Required, at least three characters. Recorded on the case and in the audit trail."}
                </p>
            </div>

            {formError && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p>}

            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onClose}>
                    Cancel
                </Button>
                <Button type="submit" disabled={!ready || busy}>
                    {busy ? "Reinstating…" : liftingAll ? "Reinstate all" : `Reinstate ${picked.length} of ${inForce.length}`}
                </Button>
            </DialogFooter>
        </form>
    );
}

/* ------------------------------------------------------------------ */
/* The button pair                                                     */
/* ------------------------------------------------------------------ */

export interface SuspensionActionsProps extends Omit<SuspendDialogProps, "open" | "onOpenChange"> {
    className?: string;
}

/**
 * "Suspend" and, once anything is in force, "Reinstate" — with their dialogs.
 * Lives in one component so the page's action row and the Suspension card
 * can both mount the same pair without owning two sets of dialog state.
 */
export function SuspensionActions({ className, ...props }: SuspensionActionsProps) {
    const [suspending, setSuspending] = React.useState(false);
    const [reinstating, setReinstating] = React.useState(false);
    const live = isLive("suspension");
    const admitted = admittedScopes(props.partyType);
    const everything = admitted.every((scope) => props.current.includes(scope));

    return (
        <div className={className ?? "flex items-center gap-2"}>
            {props.current.length > 0 && (
                <Button variant="outline" className="bg-card" onClick={() => setReinstating(true)} disabled={!live}>
                    Reinstate
                </Button>
            )}
            <Button
                variant="outline"
                className="bg-card text-danger hover:text-danger"
                onClick={() => setSuspending(true)}
                disabled={!live || everything}
                title={everything ? "Every section is already suspended" : undefined}
            >
                Suspend
            </Button>
            {suspending && <SuspendDialog {...props} open onOpenChange={setSuspending} />}
            {reinstating && <ReinstateDialog {...props} open onOpenChange={setReinstating} />}
        </div>
    );
}
