import { toast } from "sonner";
import { countNoun, planBulk, runEach, type BulkFailure, type BulkOutcome, type BulkPlan } from "@/lib/bulk";
import { blockersLine, type UserDeletable, type UserRow } from "@/services/users";

/**
 * Bulk work on Users › Accounts (2 Oct 2026, the owner: "there is no bulk
 * action buttons, also no delete users button still").
 *
 * No bulk routes: each action is the single-row route called once per
 * account, a few at a time (`runEach`), so every account keeps its own
 * permission check and audit row. The rules here are pure so the tests can
 * drive them without a screen.
 */

const ACCOUNTS = ["account", "accounts"] as const;

/* ------------------------------------------------------------------ */
/* Deactivate / Reactivate                                             */
/* ------------------------------------------------------------------ */

export type StatusMove = "deactivate" | "reactivate";

/** Why an account is left alone by a move, or null when the move applies. The viewer's own account and closed ones are never moved. */
export function statusMoveSkip(row: UserRow, move: StatusMove, viewerId: string | null): string | null {
    if (viewerId && row.id === viewerId) return "own";
    if (row.status === "closed") return "closed";
    if (move === "deactivate" && row.status === "deactivated") return "already deactivated";
    if (move === "reactivate" && row.status === "active") return "already active";
    return null;
}

export function planStatusMove(rows: readonly UserRow[], move: StatusMove, viewerId: string | null): BulkPlan<UserRow> {
    return planBulk(rows, (row) => statusMoveSkip(row, move, viewerId));
}

/** "Skipped: your own account, 2 closed accounts, 1 already active." Empty when nothing is skipped. */
export function skippedSentence(plan: BulkPlan<UserRow>): string {
    if (plan.skipped.length === 0) return "";
    const parts = plan.skipped.map(({ reason, rows }) => {
        if (reason === "own") return "your own account";
        if (reason === "closed") return `${rows.length} closed ${rows.length === 1 ? "account" : "accounts"}`;
        return `${rows.length} ${reason}`;
    });
    return `Skipped: ${parts.join(", ")}.`;
}

/* ------------------------------------------------------------------ */
/* The result                                                          */
/* ------------------------------------------------------------------ */

/** "3 done", or "2 done, 1 couldn't be changed: <reasons>", and one line per failure under it. */
export function resultSummary(outcome: BulkOutcome<UserRow>): { tone: "success" | "warning" | "error"; title: string; lines: string[] } {
    const { done, failed } = outcome;
    if (failed.length === 0) return { tone: "success", title: `${done.length} done`, lines: [] };
    const reasons = [...new Set(failed.map((failure) => failure.message))].join("; ");
    return {
        tone: done.length === 0 ? "error" : "warning",
        title: `${done.length} done, ${failed.length} couldn't be changed: ${reasons}`,
        lines: failed.map((failure) => `${failure.row.displayName}: ${failure.message}`),
    };
}

export function announceResult(outcome: BulkOutcome<UserRow>): void {
    const summary = resultSummary(outcome);
    const options = summary.lines.length ? { description: summary.lines.join("\n"), classNames: { description: "whitespace-pre-line" }, duration: 12_000 } : undefined;
    if (summary.tone === "success") toast.success(summary.title, options);
    else if (summary.tone === "warning") toast.warning(summary.title, options);
    else toast.error(summary.title, options);
}

/* ------------------------------------------------------------------ */
/* Delete                                                              */
/* ------------------------------------------------------------------ */

export interface DeletePlan {
    /** The accounts with no history: what Confirm deletes. */
    deletable: UserRow[];
    /** The accounts that are kept, each with its first blocker ("3 bookings"). */
    blocked: { row: UserRow; reason: string }[];
    /** The viewer's own account was ticked: never deleted, never even asked about. */
    ownSkipped: boolean;
}

/**
 * Asks `GET /users/:id/deletable` for every ticked account but the viewer's
 * own, a few at a time. An account whose check failed is kept, with what the
 * server said, rather than deleted on a guess.
 */
export async function planDelete(rows: readonly UserRow[], viewerId: string | null, read: (userId: string) => Promise<UserDeletable>): Promise<DeletePlan> {
    const asked = rows.filter((row) => !viewerId || row.id !== viewerId);
    const answers = new Map<string, UserDeletable>();
    const outcome = await runEach(asked, async (row) => {
        answers.set(row.id, await read(row.id));
    });
    const failedCheck = new Map(outcome.failed.map((failure: BulkFailure<UserRow>) => [failure.row.id, failure.message]));
    const plan: DeletePlan = { deletable: [], blocked: [], ownSkipped: asked.length < rows.length };
    for (const row of asked) {
        const answer = answers.get(row.id);
        if (answer?.deletable) plan.deletable.push(row);
        else if (answer) plan.blocked.push({ row, reason: answer.blockers.length ? blockersLine(answer.blockers.slice(0, 1)) : "has history" });
        else plan.blocked.push({ row, reason: `couldn't check: ${failedCheck.get(row.id) ?? "no answer"}` });
    }
    return plan;
}

/** "2 can be deleted, 3 can't." */
export function deletePlanLine(plan: DeletePlan): string {
    return `${plan.deletable.length} can be deleted, ${plan.blocked.length} can't.`;
}

export const accountsCount = (count: number): string => countNoun(count, ACCOUNTS);
