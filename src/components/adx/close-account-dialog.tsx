"use client";

import * as React from "react";
import { AlertCircle, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { FieldList } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import {
    CLOSURE_DECISION_META,
    WALLET_KIND_LABEL,
    blockerDetailLines,
    blockingOf,
    closureBlockedBlockers,
    accountLifecycleService,
    type ClosureBlocker,
    type ClosureCase,
    type ClosureOutcome,
    type ClosureReview,
} from "@/services/users";

/** The schema's bounds for a reason. */
const REASON_MIN = 3;
const REASON_MAX = 500;
const LOSS_NOTE_MAX = 1000;

/* ------------------------------------------------------------------ */
/* The blockers, drawn                                                 */
/* ------------------------------------------------------------------ */

/**
 * Every line of the review, with the server's verdict on each.
 *
 * A blocking line and a reported line look different on purpose: the first
 * is why the close button will not work today, the second is what the closure
 * is about to do — hand back offers, freeze a balance — and ops should see it
 * before they decide, not after.
 */
export function BlockerList({ blockers, heading }: { blockers: ClosureBlocker[]; heading?: string }) {
    if (blockers.length === 0) {
        return (
            <p className="rounded-md bg-success-soft px-3 py-2 text-sm text-success">
                Nothing stands in the way. No money is leaving, no work is running.
            </p>
        );
    }
    return (
        <div>
            {heading && <p className="text-sm font-medium text-foreground">{heading}</p>}
            <ul className={heading ? "mt-2 divide-y rounded-md border" : "divide-y rounded-md border"}>
                {blockers.map((blocker) => {
                    const lines = blockerDetailLines(blocker);
                    return (
                        <li key={blocker.kind} className="px-3 py-2.5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-foreground">
                                        <span className="tabular-nums">{blocker.count}</span> · {blocker.label}
                                    </p>
                                    {lines.length > 0 && (
                                        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                                            {lines.map((line, index) => (
                                                <li key={`${blocker.kind}-${index}`} className="font-mono">
                                                    {line}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                                <StatusBadge
                                    status={
                                        blocker.blocking
                                            ? { label: "Blocks closure", tone: "danger" }
                                            : { label: "Reported", tone: "neutral" }
                                    }
                                />
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/** The seven numbers and the wallets behind them. */
function ReviewSummary({ review }: { review: ClosureReview }) {
    const { summary } = review;
    return (
        <div className="space-y-3">
            <FieldList
                items={[
                    ["Wallet balance", formatMoney(summary.walletBalance)],
                    ["Withdrawals in flight", String(summary.withdrawalsInFlight)],
                    ["Orders still running", String(summary.openOrders)],
                    ["Agent work in hand", String(summary.openWork)],
                    ["Campaigns scheduled or live", String(summary.openCampaigns)],
                    ["Agreements signed", String(summary.openAgreements)],
                    ["Support tickets open", String(summary.openTickets)],
                ]}
            />
            {review.wallets.length > 0 && (
                <ul className="divide-y rounded-md border text-sm">
                    {review.wallets.map((line) => (
                        <li key={line.walletId} className="flex items-center justify-between gap-3 px-3 py-2">
                            <span className="text-muted-foreground">
                                {WALLET_KIND_LABEL[line.kind] ?? line.kind} wallet
                                {line.frozenAt ? " · frozen" : ""}
                            </span>
                            <span className="tabular-nums">
                                {formatMoney(line.balance)}
                                <span className="ml-2 text-xs text-muted-foreground">
                                    {formatMoney(line.withdrawable)} withdrawable
                                </span>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Deciding                                                            */
/* ------------------------------------------------------------------ */

function outcomeDescription(outcome: ClosureOutcome | null): string {
    if (!outcome) return "The case is recorded as refused; the account keeps running.";
    const parts: string[] = [];
    if (outcome.listingsRetired.length) {
        parts.push(`${outcome.listingsRetired.length} listing${outcome.listingsRetired.length === 1 ? "" : "s"} taken off the market`);
    }
    const requested = outcome.payouts.filter((payout) => payout.outcome === "REQUESTED");
    if (requested.length) {
        parts.push(`a final withdrawal of ${requested.map((payout) => formatMoney(payout.amount)).join(" + ")} raised for finance to vet`);
    }
    if (outcome.note) parts.push(outcome.note);
    return parts.length ? parts.join(". ") + "." : "Sign-in is off and the wallet is frozen.";
}

/**
 * The decision on a case — CLOSED or REFUSED, with a loss note.
 *
 * CLOSED re-runs the review on the server and runs the closure before the
 * case is marked, so a 409 `CLOSURE_BLOCKED` comes back with today's
 * blockers and the case stays pending. They are drawn here, off the error,
 * rather than summarised into a toast the operator cannot act on.
 */
export function DecideClosureForm({
    closureCase,
    onDecided,
    onClose,
}: {
    closureCase: ClosureCase;
    onDecided: () => void;
    onClose: () => void;
}) {
    const [decision, setDecision] = React.useState<"CLOSED" | "REFUSED">("CLOSED");
    const [lossNote, setLossNote] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [formError, setFormError] = React.useState<string | null>(null);
    const [blockedBy, setBlockedBy] = React.useState<ClosureBlocker[]>([]);

    const note = lossNote.trim();
    const noteOk = note.length === 0 || (note.length >= REASON_MIN && note.length <= LOSS_NOTE_MAX);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy || !noteOk) return;
        setBusy(true);
        setFormError(null);
        setBlockedBy([]);
        try {
            const result = await accountLifecycleService.decideClosure(closureCase.id, {
                decision,
                ...(note ? { lossNote: note } : {}),
            });
            toast.success(
                decision === "CLOSED" ? "Account closed" : "Closure refused",
                { description: outcomeDescription(result.outcome) }
            );
            onDecided();
            onClose();
        } catch (cause) {
            const blockers = closureBlockedBlockers(cause);
            setBlockedBy(blockers);
            setFormError(
                cause instanceof ApiError
                    ? cause.message
                    : cause instanceof Error
                      ? cause.message
                      : "Could not record the decision."
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-md bg-muted/50 px-3 py-2.5 text-sm">
                <p className="font-medium text-foreground">{closureCase.reason}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    Raised {formatDateTime(closureCase.requestedAt)}
                    {closureCase.ticketId ? ` · ticket ${closureCase.ticketId}` : ""}
                </p>
                <FieldList
                    className="mt-3"
                    items={[
                        ["Balance when raised", formatMoney(closureCase.walletBalance)],
                        ["Withdrawals in flight", String(closureCase.withdrawalsInFlight)],
                        ["Open orders", String(closureCase.openOrders)],
                        ["Open agent work", String(closureCase.openWork)],
                    ]}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                    A snapshot, not a gate — the review is run again when you decide.
                </p>
            </div>

            <RadioGroup
                value={decision}
                onValueChange={(value) => setDecision(value as "CLOSED" | "REFUSED")}
                className="grid gap-2"
            >
                <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[[data-state=checked]]:border-primary">
                    <RadioGroupItem value="CLOSED" id="decide-closed" className="mt-0.5" />
                    <span>
                        <span className="block text-sm font-medium text-foreground">Close the account</span>
                        <span className="block text-xs text-muted-foreground">
                            Stops new work, freezes the wallet, ends sign-in, retires the listings and raises the final
                            withdrawal for finance to vet. Nothing is deleted.
                        </span>
                    </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[[data-state=checked]]:border-primary">
                    <RadioGroupItem value="REFUSED" id="decide-refused" className="mt-0.5" />
                    <span>
                        <span className="block text-sm font-medium text-foreground">Refuse</span>
                        <span className="block text-xs text-muted-foreground">
                            The case is recorded as refused and the account keeps running.
                        </span>
                    </span>
                </label>
            </RadioGroup>

            <div className="grid gap-1.5">
                <Label htmlFor="decide-loss-note">Loss note</Label>
                <Textarea
                    id="decide-loss-note"
                    value={lossNote}
                    onChange={(event) => setLossNote(event.target.value)}
                    placeholder="Money ADX is writing off rather than paying out. Leave empty to raise the final payout."
                    rows={3}
                />
                <p className="text-xs text-muted-foreground">
                    {note.length > 0 && note.length < REASON_MIN
                        ? `At least ${REASON_MIN} characters, or leave it empty.`
                        : "A loss note stops the final withdrawal: the balance is written off, not paid."}
                </p>
            </div>

            {blockedBy.length > 0 && (
                <div className="space-y-2 rounded-md border border-danger/40 bg-danger-soft p-3">
                    <p className="flex items-center gap-2 text-sm font-medium text-danger">
                        <ShieldAlert className="size-4" aria-hidden />
                        The closure was refused. The case stays pending.
                    </p>
                    <BlockerList blockers={blockedBy} />
                </div>
            )}
            {formError && blockedBy.length === 0 && (
                <p className="flex items-start gap-2 text-sm text-danger" role="alert">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {formError}
                </p>
            )}

            <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button type="submit" variant={decision === "CLOSED" ? "destructive" : "default"} disabled={busy || !noteOk}>
                    {busy ? "Working…" : "Record decision"}
                </Button>
            </DialogFooter>
        </form>
    );
}

/** The decision on its own — for the queue, where the case already exists. */
export function DecideClosureDialog({
    closureCase,
    open,
    onOpenChange,
    onDecided,
}: {
    closureCase: ClosureCase;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onDecided: () => void;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Decide the closure</DialogTitle>
                    <DialogDescription>
                        {closureCase.user?.name?.trim() || closureCase.user?.mobile || closureCase.userId}
                        {closureCase.user?.name ? ` · ${closureCase.user.mobile}` : ""}
                    </DialogDescription>
                </DialogHeader>
                <div className="mb-3">
                    <StatusBadge status={CLOSURE_DECISION_META[closureCase.decision]} />
                </div>
                <DecideClosureForm closureCase={closureCase} onDecided={onDecided} onClose={() => onOpenChange(false)} />
            </DialogContent>
        </Dialog>
    );
}

/* ------------------------------------------------------------------ */
/* Closing, from a person's page                                       */
/* ------------------------------------------------------------------ */

interface CloseAccountDialogProps {
    userId: string;
    /** What to call them in the title. */
    name: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** After a case is opened or decided, so the page re-reads. */
    onChanged?: () => void;
}

/**
 * Closing an account from its page.
 *
 * Two steps in one dialog, because they are one piece of work at the desk:
 * the review — what is in the wallet, what is in flight, what is running —
 * and the case that records why. Raising the case does nothing to the
 * account; the decision does, and it is offered straight after so ops with
 * the authority need not go and find the queue.
 */
export function CloseAccountDialog({ userId, name, open, onOpenChange, onChanged }: CloseAccountDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                {/* Mounted only while open, so the review is read fresh each time. */}
                <CloseAccountBody userId={userId} name={name} onClose={() => onOpenChange(false)} onChanged={onChanged} />
            </DialogContent>
        </Dialog>
    );
}

function CloseAccountBody({
    userId,
    name,
    onClose,
    onChanged,
}: Omit<CloseAccountDialogProps, "open" | "onOpenChange"> & { onClose: () => void }) {
    const review = useApiResource<ClosureReview>(`users:closure-review:${userId}`, () =>
        accountLifecycleService.closureReview(userId)
    );
    const [opened, setOpened] = React.useState<{ case: ClosureCase; blockers: ClosureBlocker[] } | null>(null);

    if (opened) {
        const blocking = blockingOf(opened.blockers);
        return (
            <>
                <DialogHeader>
                    <DialogTitle>Closure case opened</DialogTitle>
                    <DialogDescription>
                        {name} · case {opened.case.id}. Decide it now, or leave it in the queue under Users → Closure
                        cases.
                    </DialogDescription>
                </DialogHeader>
                {blocking.length > 0 && (
                    <BlockerList blockers={blocking} heading="Still standing in the way today" />
                )}
                <DecideClosureForm
                    closureCase={opened.case}
                    onDecided={() => onChanged?.()}
                    onClose={onClose}
                />
            </>
        );
    }

    return (
        <>
            <DialogHeader>
                <DialogTitle>Close account</DialogTitle>
                <DialogDescription>
                    {name}. An account with history is closed, never deleted: the records stay, sign-in stops and the
                    balance is paid out or written off.
                </DialogDescription>
            </DialogHeader>
            <ResourceBoundary resource={review}>
                {(data) =>
                    data.closedAt ? (
                        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                            Already closed on {formatDate(data.closedAt)}.
                        </p>
                    ) : (
                        <OpenCaseForm
                            userId={userId}
                            review={data}
                            onOpened={(result) => {
                                setOpened(result);
                                onChanged?.();
                            }}
                            onClose={onClose}
                        />
                    )
                }
            </ResourceBoundary>
        </>
    );
}

function OpenCaseForm({
    userId,
    review,
    onOpened,
    onClose,
}: {
    userId: string;
    review: ClosureReview;
    onOpened: (result: { case: ClosureCase; blockers: ClosureBlocker[] }) => void;
    onClose: () => void;
}) {
    const [reason, setReason] = React.useState("");
    const [ticketId, setTicketId] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [formError, setFormError] = React.useState<string | null>(null);

    const trimmed = reason.trim();
    const ready = trimmed.length >= REASON_MIN && trimmed.length <= REASON_MAX;

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        setFormError(null);
        try {
            const result = await accountLifecycleService.createClosureCase(userId, {
                reason: trimmed,
                ...(ticketId.trim() ? { ticketId: ticketId.trim() } : {}),
            });
            toast.success("Closure case opened", {
                description: "Nothing has changed on the account yet. The decision does that.",
            });
            onOpened({ case: result.case, blockers: result.blockers });
        } catch (cause) {
            setFormError(
                cause instanceof ApiError
                    ? cause.message
                    : cause instanceof Error
                      ? cause.message
                      : "Could not open the case."
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <ReviewSummary review={review} />
            <BlockerList blockers={review.blockers} heading="What the review found" />

            <div className="grid gap-1.5">
                <Label htmlFor="close-reason">Reason</Label>
                <Textarea
                    id="close-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Why the account is being closed. Kept on the case and sent to the person."
                    rows={3}
                    required
                />
                <p className="text-xs text-muted-foreground">
                    {trimmed.length < REASON_MIN
                        ? `At least ${REASON_MIN} characters.`
                        : `${trimmed.length}/${REASON_MAX}`}
                </p>
            </div>
            <div className="grid gap-1.5">
                <Label htmlFor="close-ticket">Support ticket</Label>
                <Input
                    id="close-ticket"
                    value={ticketId}
                    onChange={(event) => setTicketId(event.target.value)}
                    placeholder="Optional — the thread this case came from"
                    className="h-9"
                />
            </div>

            {formError && (
                <p className="flex items-start gap-2 text-sm text-danger" role="alert">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {formError}
                </p>
            )}

            <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button type="submit" disabled={!ready || busy}>
                    {busy ? "Opening…" : "Open closure case"}
                </Button>
            </DialogFooter>
        </form>
    );
}
