import type { BatchPreflight, PayoutBatchStatus, Withdrawal, WithdrawalStatus } from "@/services/finance";

/**
 * The payout batch wizard's step machine — Lot B (Q85/Q140).
 *
 * The DR 10 frame draws four steps: select recipients, review amounts,
 * compliance checks, confirm and release. Each one is a real state of the
 * batch on the backend rather than a page counter, so the step is derived from
 * the batch and never stored on the client: reloading the page lands on the
 * same step, and two admins looking at the same batch see the same one — which
 * matters, because the third step is the one the builder is not allowed to
 * take.
 *
 * Pure on purpose. The view asks three questions — which phase is this batch
 * in, what is the primary button, and what may be done to a line — and this
 * file answers all three from data alone so the answers can be pinned by a
 * test.
 */

export const BATCH_STEPS = [
    "Select recipients",
    "Review amounts",
    "Compliance checks",
    "Confirm and release",
] as const;

/** Where the batch is. The first four are the drawn steps; the last two are what comes after them. */
export type BatchPhase = "select" | "review" | "checks" | "release" | "released" | "cancelled";

/** The four permissions and facts the machine needs beside the batch itself. */
export interface BatchContext {
    /** The signed-in admin, for the four-eyes rule. */
    userId: string | null;
    /** `useAuth().can("finance.approve")` — signing off, releasing, confirming a line. */
    canApprove: boolean;
    /** The view is back on step one by choice, re-picking the lines of a draft that has some. */
    reselecting?: boolean;
}

export type BatchAction = "setLines" | "submit" | "approve" | "release";

export interface PrimaryAction {
    action: BatchAction;
    label: string;
    enabled: boolean;
    /** Why it is disabled, when it is — shown beside the button rather than hidden. */
    reason: string | null;
}

/** Which of the drawn steps a phase sits on, 0-based; `released` has finished all four. */
export function stepIndex(phase: BatchPhase): number {
    switch (phase) {
        case "select":
            return 0;
        case "review":
            return 1;
        case "checks":
            return 2;
        case "release":
            return 3;
        case "released":
            return 4;
        case "cancelled":
            return -1;
    }
}

/** The phase a batch is in, from its status and whether it has lines yet. */
export function phaseOf(
    batch: { status: PayoutBatchStatus; lineCount: number },
    reselecting = false
): BatchPhase {
    switch (batch.status) {
        case "DRAFT":
            return batch.lineCount === 0 || reselecting ? "select" : "review";
        case "IN_REVIEW":
            return "checks";
        case "APPROVED":
            return "release";
        case "RELEASING":
        case "RELEASED":
        case "COMPLETED":
        case "PARTIALLY_FAILED":
        case "FAILED":
            return "released";
        case "CANCELLED":
            return "cancelled";
    }
}

/** True for the admin who built the batch: the one person who may not sign it off. */
export const isBuilder = (batch: { createdByUserId: string }, userId: string | null): boolean =>
    userId !== null && batch.createdByUserId === userId;

export const FOUR_EYES = "A payout batch must be approved by someone other than the admin who built it.";

/**
 * The one button at the top right, for this phase. Null once the batch is
 * released or cancelled — what is left then is per line, not per batch.
 */
export function primaryAction(
    batch: { status: PayoutBatchStatus; lineCount: number; createdByUserId: string },
    context: BatchContext,
    state: { selectedCount: number; preflight: BatchPreflight | null }
): PrimaryAction | null {
    const phase = phaseOf(batch, context.reselecting);
    switch (phase) {
        case "select":
            return {
                action: "setLines",
                label: "Save recipients",
                enabled: state.selectedCount > 0,
                reason: state.selectedCount > 0 ? null : "Pick at least one approved withdrawal.",
            };
        case "review":
            return {
                action: "submit",
                label: "Continue to review",
                enabled: batch.lineCount > 0,
                reason: batch.lineCount > 0 ? null : "Add at least one line before submitting the batch.",
            };
        case "checks": {
            if (isBuilder(batch, context.userId)) {
                return { action: "approve", label: "Approve batch", enabled: false, reason: FOUR_EYES };
            }
            if (!context.canApprove) {
                return {
                    action: "approve",
                    label: "Approve batch",
                    enabled: false,
                    reason: "Approving a batch needs the finance.approve permission.",
                };
            }
            return { action: "approve", label: "Approve batch", enabled: true, reason: null };
        }
        case "release": {
            if (!context.canApprove) {
                return {
                    action: "release",
                    label: "Release batch",
                    enabled: false,
                    reason: "Releasing a batch needs the finance.approve permission.",
                };
            }
            if (!state.preflight) {
                return { action: "release", label: "Release batch", enabled: false, reason: "Waiting for the pre-flight." };
            }
            if (!state.preflight.ok) {
                return {
                    action: "release",
                    label: "Release batch",
                    enabled: false,
                    reason: "The pre-flight found a problem; nothing can be released until every check passes.",
                };
            }
            return { action: "release", label: "Release batch", enabled: true, reason: null };
        }
        case "released":
        case "cancelled":
            return null;
    }
}

/** Before release only: the lines go back to reserved-and-unbatched and nothing reverses. */
export const canCancel = (status: PayoutBatchStatus): boolean =>
    status === "DRAFT" || status === "IN_REVIEW" || status === "APPROVED";

/** A draft's lines may be re-picked; nothing else's may. */
export const canEditLines = (status: PayoutBatchStatus): boolean => status === "DRAFT";

export type LineAction = "mark-paid" | "fail";

/**
 * What may be done to one line. Only a line the rail is holding can be
 * confirmed or bounced; an APPROVED line still in an unreleased batch is
 * handled by the batch, and a settled line is history.
 */
export function lineActions(batchStatus: PayoutBatchStatus, lineStatus: WithdrawalStatus): LineAction[] {
    if (phaseOf({ status: batchStatus, lineCount: 1 }) !== "released") return [];
    if (lineStatus !== "PROCESSING") return [];
    return ["mark-paid", "fail"];
}

export interface LineTally {
    total: number;
    paid: number;
    failed: number;
    /** Still with the rail. */
    processing: number;
    /** Reserved and not yet released — a release that died half-way leaves some. */
    waiting: number;
}

/** The released batch's lines, counted the way `batch-status.ts` derives its status. */
export function tallyLines(lines: readonly Pick<Withdrawal, "status">[]): LineTally {
    const tally: LineTally = { total: lines.length, paid: 0, failed: 0, processing: 0, waiting: 0 };
    for (const line of lines) {
        if (line.status === "PAID") tally.paid += 1;
        else if (line.status === "FAILED") tally.failed += 1;
        else if (line.status === "PROCESSING") tally.processing += 1;
        else tally.waiting += 1;
    }
    return tally;
}

/**
 * The status a released batch will read once the tally settles — the same
 * rule as the backend's `deriveBatchStatus`, so the screen can say what a
 * mark-paid is about to do before the response lands.
 */
export function derivedStatus(tally: LineTally): Extract<PayoutBatchStatus, "RELEASED" | "COMPLETED" | "PARTIALLY_FAILED" | "FAILED"> {
    if (tally.paid + tally.failed < tally.total) return "RELEASED";
    if (tally.total > 0 && tally.failed === tally.total) return "FAILED";
    if (tally.failed > 0) return "PARTIALLY_FAILED";
    return "COMPLETED";
}

/** A pre-flight, folded into the checklist the frame draws: one row per verdict. */
export interface PreflightCheck {
    id: string;
    label: string;
    verdict: "pass" | "fail";
    /** The lines that failed it, by reference. */
    detail: string | null;
}

export function preflightChecks(preflight: BatchPreflight): PreflightCheck[] {
    const byProblem = new Map<string, string[]>();
    for (const line of preflight.lines) {
        for (const problem of line.problems) {
            const code = problem.startsWith("NOT_APPROVED:") ? "NOT_APPROVED" : problem;
            const list = byProblem.get(code) ?? [];
            list.push(line.reference);
            byProblem.set(code, list);
        }
    }
    const lineCheck = (id: string, label: string): PreflightCheck => {
        const failing = byProblem.get(id) ?? [];
        return {
            id,
            label,
            verdict: failing.length === 0 ? "pass" : "fail",
            detail: failing.length === 0 ? null : failing.join(", "),
        };
    };
    return [
        lineCheck("KYC_NOT_VERIFIED", "All KYC verified"),
        lineCheck("METHOD_NOT_VERIFIED", "Every payout method verified"),
        lineCheck("WALLET_SHORT", "Wallets cover every line"),
        lineCheck("WALLET_FROZEN", "No wallet frozen"),
        {
            id: "ACCOUNT_ACTIVE",
            label: "Every account active",
            verdict:
                (byProblem.get("USER_INACTIVE")?.length ?? 0) + (byProblem.get("PARTNER_INACTIVE")?.length ?? 0) === 0
                    ? "pass"
                    : "fail",
            detail:
                [...(byProblem.get("USER_INACTIVE") ?? []), ...(byProblem.get("PARTNER_INACTIVE") ?? [])].join(", ") ||
                null,
        },
        lineCheck("NOT_APPROVED", "Every line still approved"),
        lineCheck("WALLET_MISSING", "Every line has a wallet"),
        {
            id: "RAIL",
            label: "Rail configured",
            verdict: preflight.rail.configured ? "pass" : "fail",
            detail: preflight.rail.configured ? null : `${preflight.rail.name} has no credentials`,
        },
        {
            id: "LEDGER",
            label: "Ledger balanced",
            verdict: preflight.ledgerHealthy ? "pass" : "fail",
            detail: preflight.ledgerHealthy ? null : "The books do not agree with the wallets",
        },
        {
            id: "LINES",
            label: "At least one line",
            verdict: preflight.lines.length > 0 ? "pass" : "fail",
            detail: preflight.lines.length > 0 ? null : "The batch is empty",
        },
    ];
}
