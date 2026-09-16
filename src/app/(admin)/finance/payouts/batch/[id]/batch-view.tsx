"use client";

import * as React from "react";
import Link from "next/link";
import { Ban, Banknote, Check, ChevronLeft, Download, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { StatusBadge } from "@/components/adx/status-badge";
import { FieldList } from "@/components/adx/simple-table";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { formatDateTime, formatMoney, sumMoney } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import {
    PARTY_KIND_LABEL,
    PAYOUT_BATCH_STATUS_META,
    RAIL_LABEL,
    WITHDRAWAL_STATUS_META,
    describeBankAccount,
    describeMethod,
    financeService,
    preflightProblemLabel,
    shortId,
    type BatchPreflight,
    type PayoutBatchDetail,
    type Withdrawal,
} from "@/services/finance";
import {
    BATCH_STEPS,
    FOUR_EYES,
    canCancel,
    canEditLines,
    derivedStatus,
    isBuilder,
    lineActions,
    phaseOf,
    preflightChecks,
    primaryAction,
    stepIndex,
    tallyLines,
    type BatchAction,
    type LineAction,
} from "../batch-steps";

interface BatchViewProps {
    batch: PayoutBatchDetail;
    /** Every APPROVED withdrawal, for a draft to pick from. Empty past DRAFT. */
    approved: Withdrawal[];
    onChanged: () => void;
}

/**
 * The DR 10 payout batch, on the real API — Lot B (Q85/Q140).
 *
 * The frame's four steps are kept and each one is now a real state of the
 * batch: picking recipients writes the line set (`PUT /:id/lines`), review
 * submits it (`/submit`), the compliance step is the backend's own preflight
 * (`GET /:id/preflight`) with sign-off by a second admin (`/approve`, four
 * eyes), and confirm-and-release is `/release`, which debits every line and
 * on the manual rail produces the bank's bulk-transfer file. After that the
 * screen is the released batch: the file to download, a Mark paid and a Fail
 * per line, and a status derived from the lines rather than set by hand.
 *
 * Three things the fixture wizard did are gone for cause: it guessed a
 * recipient's type from their surname (the row carries `partyKind` now), it
 * drew a schedule nobody had set (the batch carries `scheduledFor` and
 * `cutoffAt`, shown only when they exist), and its "Save draft" saved
 * nothing. Every button here calls a route.
 */
export function BatchView({ batch, approved, onChanged }: BatchViewProps) {
    const { user, can } = useAuth();
    const userId = user?.id ?? null;
    const canApprove = can("finance.approve");

    const [reselecting, setReselecting] = React.useState(false);
    const [selected, setSelected] = React.useState<Set<string>>(() => new Set(batch.lines.map((line) => line.id)));
    const [busy, setBusy] = React.useState<BatchAction | "cancel" | "export" | "line" | null>(null);
    const [confirm, setConfirm] = React.useState<"approve" | "release" | "cancel" | null>(null);
    const [lineDialog, setLineDialog] = React.useState<{ action: LineAction; line: Withdrawal } | null>(null);
    const [lineText, setLineText] = React.useState("");

    const phase = phaseOf(batch, reselecting);
    const step = stepIndex(phase);
    const builder = isBuilder(batch, userId);

    /* The pool a draft picks from: approved rows in no other open batch. A
       row already on this batch is a candidate too, so an edit can drop it. */
    const candidates = React.useMemo(
        () => approved.filter((row) => row.batchId === null || row.batchId === batch.id),
        [approved, batch.id]
    );
    const selectedTotal = React.useMemo(
        () => sumMoney(candidates.filter((row) => selected.has(row.id)).map((row) => row.netAmount)),
        [candidates, selected]
    );

    /* The preflight belongs to the checks and release steps. Keyed on the
       batch's updatedAt so a line paid or a wallet frozen since is re-read. */
    const wantsPreflight = phase === "checks" || phase === "release";
    const preflightResource = useApiResource<BatchPreflight | null>(
        `finance:payout-batch-preflight:${batch.id}:${batch.updatedAt}:${wantsPreflight}`,
        () => (wantsPreflight ? financeService.payoutBatchPreflight(batch.id) : Promise.resolve(null))
    );
    const preflight = preflightResource.data;
    const checks = preflight ? preflightChecks(preflight) : [];
    const problemsByLine = React.useMemo(() => {
        const map = new Map<string, string[]>();
        for (const line of preflight?.lines ?? []) map.set(line.withdrawalId, line.problems);
        return map;
    }, [preflight]);

    const action = primaryAction(batch, { userId, canApprove, reselecting }, {
        selectedCount: selected.size,
        preflight: preflight ?? null,
    });

    const tally = tallyLines(batch.lines);
    const byKind = React.useMemo(() => {
        const counts = new Map<string, number>();
        for (const line of batch.lines) {
            const label = PARTY_KIND_LABEL[line.partyKind];
            counts.set(label, (counts.get(label) ?? 0) + 1);
        }
        return [...counts.entries()];
    }, [batch.lines]);

    function fail(cause: unknown, fallback: string) {
        if (cause instanceof ApiError) {
            const problems = (cause.details as { problems?: unknown } | undefined)?.problems;
            toast.error(cause.message, {
                description: Array.isArray(problems) ? problems.map(String).join("; ") : undefined,
            });
            return;
        }
        toast.error(fallback);
    }

    async function run(next: BatchAction) {
        if (next === "approve" || next === "release") {
            setConfirm(next);
            return;
        }
        setBusy(next);
        try {
            if (next === "setLines") {
                const saved = await financeService.setPayoutBatchLines(batch.id, [...selected]);
                toast.success(`${saved.lineCount} ${saved.lineCount === 1 ? "line" : "lines"} on ${saved.reference}`, {
                    description: `${formatMoney(saved.totalNet)} net. Review the amounts, then send it for sign-off.`,
                });
                setReselecting(false);
            } else {
                await financeService.submitPayoutBatch(batch.id);
                toast.success(`${batch.reference} sent for review`, {
                    description: "A different admin has to approve it — the person who built a batch cannot sign it off.",
                });
            }
            onChanged();
        } catch (cause) {
            fail(cause, "Could not save the batch.");
        } finally {
            setBusy(null);
        }
    }

    async function confirmed() {
        if (!confirm) return;
        setBusy(confirm);
        try {
            if (confirm === "approve") {
                await financeService.approvePayoutBatch(batch.id);
                toast.success(`${batch.reference} approved`, {
                    description: "Nothing has moved yet. Release is the step that debits the wallets.",
                });
            } else if (confirm === "release") {
                const outcome = await financeService.releasePayoutBatch(batch.id);
                toast.success(`${batch.reference} released`, {
                    description: `${outcome.released} ${outcome.released === 1 ? "line" : "lines"} with the rail${
                        outcome.failed ? `, ${outcome.failed} failed` : ""
                    }${outcome.skipped ? `, ${outcome.skipped} skipped` : ""}.${
                        outcome.rail === "MANUAL_NEFT" ? " Download the bank file and upload it to the bank." : ""
                    }`,
                });
            } else {
                await financeService.cancelPayoutBatch(batch.id);
                toast.success(`${batch.reference} cancelled`, {
                    description: "Its lines are approved and unbatched again. Nothing moved, so nothing reverses.",
                });
            }
            setConfirm(null);
            onChanged();
        } catch (cause) {
            fail(cause, "Could not record that decision.");
        } finally {
            setBusy(null);
        }
    }

    async function confirmLine() {
        if (!lineDialog) return;
        const text = lineText.trim();
        if (!text) return;
        setBusy("line");
        try {
            if (lineDialog.action === "mark-paid") {
                const { batch: after } = await financeService.markPayoutBatchLinePaid(batch.id, lineDialog.line.id, text);
                toast.success(`${lineDialog.line.reference} marked paid`, {
                    description: `UTR ${text} recorded. The batch is now ${PAYOUT_BATCH_STATUS_META[after.status].label.toLowerCase()}.`,
                });
            } else {
                const { batch: after } = await financeService.failPayoutBatchLine(batch.id, lineDialog.line.id, text);
                toast.success(`${lineDialog.line.reference} marked failed`, {
                    description: `The money is back in the wallet. The batch is now ${PAYOUT_BATCH_STATUS_META[after.status].label.toLowerCase()}.`,
                });
            }
            setLineDialog(null);
            setLineText("");
            onChanged();
        } catch (cause) {
            fail(cause, "Could not record that on the line.");
        } finally {
            setBusy(null);
        }
    }

    async function exportFile() {
        setBusy("export");
        try {
            const { filename } = await financeService.exportPayoutBatch(batch.id);
            toast.success(`${filename} downloaded`, {
                description: "One row per line: beneficiary, account, IFSC, amount, the WDR reference as narration.",
            });
        } catch (cause) {
            fail(cause, "Could not download the bank file.");
        } finally {
            setBusy(null);
        }
    }

    function beginReselect() {
        setSelected(new Set(batch.lines.map((line) => line.id)));
        setReselecting(true);
    }

    const toggle = (id: string) =>
        setSelected((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    /* E6: the read joins the builder and the approver, so a name where a
       short id used to be; "You" when it is the signed-in admin. */
    const nameOf = (person: { id: string; name: string | null } | null, id: string | null) =>
        id === null ? "—" : id === userId ? "You" : person?.name?.trim() || `Admin ${shortId(id)}`;
    const whose = (id: string | null) =>
        nameOf(id === batch.createdByUserId ? batch.createdBy : id === batch.approvedByUserId ? batch.approvedBy : null, id);

    return (
        <div className="space-y-5">
            <div>
                <Link
                    href="/finance/payouts"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="size-4" />
                    Payouts
                </Link>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="flex flex-wrap items-center gap-3">
                            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                                Payout batch {batch.reference}
                            </h1>
                            <StatusBadge status={PAYOUT_BATCH_STATUS_META[batch.status]} />
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {RAIL_LABEL[batch.rail]}
                            {batch.bankAccount ? ` · drawn on ${describeBankAccount(batch.bankAccount)}` : ""}
                            {` · built by ${whose(batch.createdByUserId).toLowerCase()}`}
                        </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                        <div className="flex items-center gap-2">
                            {canCancel(batch.status) && (
                                <Button
                                    variant="outline"
                                    className="bg-card text-danger hover:text-danger"
                                    disabled={busy !== null}
                                    onClick={() => setConfirm("cancel")}
                                >
                                    <X className="mr-1.5 size-4" />
                                    Cancel batch
                                </Button>
                            )}
                            {batch.lineCount > 0 && phase !== "cancelled" && (
                                <Button
                                    variant="outline"
                                    className="bg-card"
                                    disabled={busy !== null}
                                    onClick={exportFile}
                                >
                                    <Download className="mr-1.5 size-4" />
                                    {phase === "released" ? "Bank file" : "Preview bank file"}
                                </Button>
                            )}
                            {action && (
                                <Button disabled={!action.enabled || busy !== null} onClick={() => run(action.action)}>
                                    {busy === action.action ? "Working…" : action.label}
                                </Button>
                            )}
                        </div>
                        {action?.reason && (
                            <p className="max-w-sm text-right text-xs text-muted-foreground">{action.reason}</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Stepper rail */}
            <Card className="rounded-lg border-border shadow-none">
                <ol className="flex flex-wrap items-center gap-x-8 gap-y-2 px-5 py-4">
                    {BATCH_STEPS.map((label, index) => {
                        const done = index < step;
                        const active = index === step;
                        return (
                            <li key={label} className="flex items-center gap-2.5">
                                <span
                                    className={cn(
                                        "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                                        done && "bg-success text-white",
                                        active && "bg-primary text-primary-foreground",
                                        !done && !active && "bg-muted text-muted-foreground"
                                    )}
                                >
                                    {done ? <Check className="size-3.5" /> : index + 1}
                                </span>
                                <span
                                    className={cn(
                                        "text-sm font-medium",
                                        active ? "text-foreground" : "text-muted-foreground"
                                    )}
                                >
                                    {label}
                                </span>
                            </li>
                        );
                    })}
                    {phase === "cancelled" && (
                        <li className="text-sm text-muted-foreground">
                            Cancelled before release. Its lines went back to the queue, approved and unbatched.
                        </li>
                    )}
                </ol>
            </Card>

            <div className="grid gap-4 xl:grid-cols-3">
                {/* Step content */}
                <Card className="overflow-hidden rounded-lg border-border shadow-none xl:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-3 pt-4">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {phase === "select"
                                ? "Select recipients"
                                : phase === "review"
                                  ? "Review amounts"
                                  : phase === "checks"
                                    ? "Compliance checks"
                                    : phase === "release"
                                      ? "Confirm and release"
                                      : phase === "released"
                                        ? "Lines"
                                        : "Cancelled"}
                        </h3>
                        {phase === "review" && canEditLines(batch.status) && (
                            <button
                                type="button"
                                className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                                onClick={beginReselect}
                            >
                                Change recipients
                            </button>
                        )}
                        {phase === "select" && batch.lineCount > 0 && (
                            <button
                                type="button"
                                className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
                                onClick={() => setReselecting(false)}
                            >
                                Keep the current lines
                            </button>
                        )}
                    </div>

                    {phase === "select" ? (
                        <SelectTable candidates={candidates} selected={selected} onToggle={toggle} />
                    ) : (
                        <LinesTable
                            lines={batch.lines}
                            phase={phase}
                            batchStatus={batch.status}
                            problemsByLine={problemsByLine}
                            onLineAction={(line, next) => {
                                setLineText("");
                                setLineDialog({ action: next, line });
                            }}
                        />
                    )}

                    <div className="flex items-center justify-between border-t px-5 py-3 text-sm">
                        {phase === "select" ? (
                            <>
                                <span className="text-muted-foreground">
                                    {selected.size} of {candidates.length} approved{" "}
                                    {candidates.length === 1 ? "withdrawal" : "withdrawals"} selected
                                </span>
                                <span className="font-medium tabular-nums">{formatMoney(selectedTotal)}</span>
                            </>
                        ) : phase === "released" ? (
                            <>
                                <span className="text-muted-foreground">
                                    {tally.paid} paid · {tally.processing} with the rail · {tally.failed} failed
                                    {tally.waiting ? ` · ${tally.waiting} not yet released` : ""}
                                </span>
                                <span className="text-muted-foreground">
                                    Reads {PAYOUT_BATCH_STATUS_META[derivedStatus(tally)].label.toLowerCase()} once the
                                    tally settles
                                </span>
                            </>
                        ) : (
                            <span className="text-muted-foreground">
                                {batch.lineCount} {batch.lineCount === 1 ? "recipient" : "recipients"}
                            </span>
                        )}
                    </div>
                </Card>

                {/* Right rail */}
                <div className="space-y-4">
                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Batch total
                        </h3>
                        <p className="text-metric mt-2 tabular-nums text-foreground">
                            {formatMoney(phase === "select" ? selectedTotal : batch.totalNet)}
                        </p>
                        <FieldList
                            className="mt-4"
                            items={[
                                ["Recipients", String(phase === "select" ? selected.size : batch.lineCount)],
                                ...byKind.map(([label, count]) => [`${label}s`, String(count)] as [string, string]),
                            ]}
                        />
                        <p className="mt-3 text-xs text-muted-foreground">
                            Net of tax. TDS was withheld when each rupee was credited, so a payout deducts nothing.
                        </p>
                    </Card>

                    {(wantsPreflight || phase === "released") && (
                        <Card className="rounded-lg border-border p-5 shadow-none">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Pre-flight
                            </h3>
                            {phase === "released" ? (
                                <p className="mt-3 text-sm text-muted-foreground">
                                    Passed at release
                                    {batch.releasedAt ? ` on ${formatDateTime(batch.releasedAt)}` : ""}.
                                </p>
                            ) : preflightResource.error ? (
                                <p className="mt-3 text-sm text-danger">{preflightResource.error}</p>
                            ) : !preflight ? (
                                <p className="mt-3 text-sm text-muted-foreground">Running the checks…</p>
                            ) : (
                                <>
                                    <ul className="mt-3 space-y-2.5 text-sm">
                                        {checks.map((check) => (
                                            <li key={check.id} className="flex items-start gap-2">
                                                {check.verdict === "pass" ? (
                                                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
                                                ) : (
                                                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    <p>{check.label}</p>
                                                    {check.detail && (
                                                        <p className="text-xs text-muted-foreground">{check.detail}</p>
                                                    )}
                                                </div>
                                                <span
                                                    className={cn(
                                                        "shrink-0 text-xs",
                                                        check.verdict === "pass" ? "text-success" : "text-danger"
                                                    )}
                                                >
                                                    {check.verdict === "pass" ? "Passed" : "Failed"}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                    <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                                        {preflight.ok
                                            ? "Every check passes. Release will debit each line and hand it to the rail."
                                            : "Release is refused while any check fails; fix the line or drop it from the batch."}
                                    </p>
                                </>
                            )}
                        </Card>
                    )}

                    {phase === "checks" && (
                        <Card className="rounded-lg border-warning/40 bg-warning-soft p-4 shadow-none">
                            <p className="text-xs text-foreground">
                                <span className="font-semibold">Four eyes.</span> {FOUR_EYES}
                                {builder ? " You built this one, so somebody else has to approve it." : ""}
                            </p>
                        </Card>
                    )}

                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Batch
                        </h3>
                        <FieldList
                            className="mt-3"
                            items={[
                                ["Rail", RAIL_LABEL[batch.rail]],
                                ["Drawn on", batch.bankAccount ? describeBankAccount(batch.bankAccount) : "No account named"],
                                ["Built", `${formatDateTime(batch.createdAt)} · ${whose(batch.createdByUserId)}`],
                                ["Submitted", batch.submittedAt ? formatDateTime(batch.submittedAt) : "—"],
                                [
                                    "Approved",
                                    batch.approvedAt
                                        ? `${formatDateTime(batch.approvedAt)} · ${whose(batch.approvedByUserId)}`
                                        : "—",
                                ],
                                ["Released", batch.releasedAt ? formatDateTime(batch.releasedAt) : "—"],
                                ["Completed", batch.completedAt ? formatDateTime(batch.completedAt) : "—"],
                                ...(batch.scheduledFor
                                    ? [["Release window", formatDateTime(batch.scheduledFor)] as [string, string]]
                                    : []),
                                ...(batch.cutoffAt ? [["Cut-off", formatDateTime(batch.cutoffAt)] as [string, string]] : []),
                            ]}
                        />
                        {batch.note && <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">{batch.note}</p>}
                    </Card>
                </div>
            </div>

            <ConfirmDialog
                open={confirm !== null}
                onOpenChange={(next) => !next && setConfirm(null)}
                title={
                    confirm === "approve"
                        ? "Approve this batch?"
                        : confirm === "release"
                          ? "Release this batch?"
                          : "Cancel this batch?"
                }
                description={
                    confirm === "approve"
                        ? `${batch.lineCount} ${batch.lineCount === 1 ? "line" : "lines"}, ${formatMoney(
                              batch.totalNet
                          )} net. Approval is the second signature; it moves no money. Release is the step that debits the wallets.`
                        : confirm === "release"
                          ? `${formatMoney(batch.totalNet)} leaves ${batch.lineCount} ${
                                batch.lineCount === 1 ? "wallet" : "wallets"
                            } now and is posted to the ledger. On the manual rail the bank file is generated for upload; on a vendor rail each line is sent. This cannot be undone as a batch — only line by line.`
                          : "Before release only. Every line goes back to the queue, approved and reserved, and can be picked into another batch. Nothing moved, so nothing reverses."
                }
                confirmLabel={
                    confirm === "approve" ? "Approve batch" : confirm === "release" ? "Release batch" : "Cancel batch"
                }
                destructive={confirm === "cancel"}
                busy={busy === confirm}
                onConfirm={confirmed}
            />

            <ConfirmDialog
                open={lineDialog !== null}
                onOpenChange={(next) => !next && setLineDialog(null)}
                title={lineDialog?.action === "mark-paid" ? "Record the transfer?" : "Mark this line failed?"}
                description={
                    lineDialog?.action === "mark-paid"
                        ? `${formatMoney(lineDialog.line.netAmount)} to ${describeMethod(
                              lineDialog.line.method
                          )} for ${lineDialog.line.partyName}. Only for a transfer that has actually been made: this discharges the payable against cash.`
                        : lineDialog
                          ? `${lineDialog.line.reference}: the rail refused or the transfer bounced. The money returns to ${lineDialog.line.partyName}'s wallet.`
                          : ""
                }
                confirmLabel={lineDialog?.action === "mark-paid" ? "Record payment" : "Mark failed"}
                destructive={lineDialog?.action === "fail"}
                busy={busy === "line"}
                disabled={!lineText.trim()}
                onConfirm={confirmLine}
            >
                {lineDialog?.action === "mark-paid" ? (
                    <div className="space-y-1.5">
                        <Label htmlFor="line-utr">UTR</Label>
                        <Input
                            id="line-utr"
                            value={lineText}
                            onChange={(event) => setLineText(event.target.value)}
                            placeholder="e.g. SBIN325104871234"
                        />
                        <p className="text-xs text-muted-foreground">
                            Required. It is what the bank statement line will carry, and what reconciliation matches on.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        <Label htmlFor="line-reason">Reason</Label>
                        <Textarea
                            id="line-reason"
                            value={lineText}
                            onChange={(event) => setLineText(event.target.value)}
                            rows={3}
                            placeholder="What the bank said, and kept on the record."
                        />
                    </div>
                )}
            </ConfirmDialog>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

const HEAD = "border-y bg-muted/50 text-left text-xs font-medium text-muted-foreground";

function Recipient({ line }: { line: Withdrawal }) {
    return (
        <div className="flex items-center gap-2.5">
            <InitialsAvatar name={line.partyName} size="sm" />
            <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{line.partyName}</p>
                <p className="text-xs text-muted-foreground">{line.reference}</p>
            </div>
        </div>
    );
}

function SelectTable({
    candidates,
    selected,
    onToggle,
}: {
    candidates: Withdrawal[];
    selected: Set<string>;
    onToggle: (id: string) => void;
}) {
    if (candidates.length === 0) {
        return (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">
                No approved withdrawal is waiting for a batch. Approve requests on the withdrawal queue first.
            </p>
        );
    }
    return (
        <table className="w-full text-sm">
            <thead>
                <tr className={HEAD}>
                    <th className="w-10 px-5 py-2" />
                    <th className="px-5 py-2">Recipient</th>
                    <th className="px-5 py-2">Type</th>
                    <th className="px-5 py-2">Method</th>
                    <th className="px-5 py-2 text-right">Amount</th>
                </tr>
            </thead>
            <tbody>
                {candidates.map((line) => {
                    const checked = selected.has(line.id);
                    const unverified = line.method.status !== "VERIFIED";
                    return (
                        <tr
                            key={line.id}
                            className={cn("border-b last:border-0", checked && "bg-primary/[0.03]")}
                            onClick={() => onToggle(line.id)}
                        >
                            <td className="px-5 py-3">
                                <Checkbox
                                    checked={checked}
                                    aria-label={`Select ${line.reference}`}
                                    onCheckedChange={() => onToggle(line.id)}
                                    onClick={(event) => event.stopPropagation()}
                                />
                            </td>
                            <td className="px-5 py-3">
                                <Recipient line={line} />
                            </td>
                            <td className="px-5 py-3 text-muted-foreground">
                                {unverified ? (
                                    <span className="inline-flex items-center gap-1 text-warning">
                                        <TriangleAlert className="size-3.5" />
                                        Verification pending
                                    </span>
                                ) : (
                                    PARTY_KIND_LABEL[line.partyKind]
                                )}
                            </td>
                            <td className="px-5 py-3 text-muted-foreground">{describeMethod(line.method)}</td>
                            <td className="px-5 py-3 text-right font-medium tabular-nums">
                                {formatMoney(line.netAmount)}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

function LinesTable({
    lines,
    phase,
    batchStatus,
    problemsByLine,
    onLineAction,
}: {
    lines: Withdrawal[];
    phase: ReturnType<typeof phaseOf>;
    batchStatus: PayoutBatchDetail["status"];
    problemsByLine: Map<string, string[]>;
    onLineAction: (line: Withdrawal, action: LineAction) => void;
}) {
    if (lines.length === 0) {
        return <p className="px-5 py-12 text-center text-sm text-muted-foreground">This batch has no lines.</p>;
    }
    const released = phase === "released";
    return (
        <table className="w-full text-sm">
            <thead>
                <tr className={HEAD}>
                    <th className="px-5 py-2">Recipient</th>
                    <th className="px-5 py-2">Type</th>
                    <th className="px-5 py-2">Method</th>
                    <th className="px-5 py-2 text-right">Amount</th>
                    {released && <th className="px-5 py-2">Status</th>}
                </tr>
            </thead>
            <tbody>
                {lines.map((line) => {
                    const problems = problemsByLine.get(line.id) ?? [];
                    const actions = lineActions(batchStatus, line.status);
                    return (
                        <tr key={line.id} className="border-b last:border-0">
                            <td className="px-5 py-3">
                                <Recipient line={line} />
                            </td>
                            <td className="px-5 py-3 text-muted-foreground">
                                {problems.length > 0 ? (
                                    <span className="inline-flex items-start gap-1 text-warning">
                                        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                                        <span>{problems.map(preflightProblemLabel).join(", ")}</span>
                                    </span>
                                ) : (
                                    PARTY_KIND_LABEL[line.partyKind]
                                )}
                            </td>
                            <td className="px-5 py-3 text-muted-foreground">{describeMethod(line.method)}</td>
                            <td className="px-5 py-3 text-right font-medium tabular-nums">
                                {formatMoney(line.netAmount)}
                            </td>
                            {released && (
                                <td className="px-5 py-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <StatusBadge status={WITHDRAWAL_STATUS_META[line.status]} />
                                        {line.railReference && (
                                            <span className="text-xs text-muted-foreground">UTR {line.railReference}</span>
                                        )}
                                        {line.failureReason && (
                                            <span className="text-xs text-danger">{line.failureReason}</span>
                                        )}
                                        {actions.includes("mark-paid") && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-7 bg-card px-2 text-xs"
                                                onClick={() => onLineAction(line, "mark-paid")}
                                            >
                                                <Banknote className="mr-1 size-3.5" />
                                                Mark paid
                                            </Button>
                                        )}
                                        {actions.includes("fail") && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 px-2 text-xs text-danger hover:text-danger"
                                                onClick={() => onLineAction(line, "fail")}
                                            >
                                                <Ban className="mr-1 size-3.5" />
                                                Fail
                                            </Button>
                                        )}
                                    </div>
                                </td>
                            )}
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}
