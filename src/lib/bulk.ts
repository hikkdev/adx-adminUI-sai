import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";

/**
 * Bulk actions on the Content desks and the custom fields desk (28 Sep
 * 2026). The owner, on Content › Pages: "How about bulk change options?
 * Bulk selection etc."
 *
 * There are no bulk routes behind this, on purpose. A bulk action is the
 * single-row route called once per selected row — a few at a time — so
 * every row keeps its own permission check and writes its own audit row,
 * exactly as if somebody had clicked it by hand. `runBulk` (the pricing
 * tables' older helper) fires every row at once and reports numbers only;
 * this one caps the concurrency, names every failure, and hands the failed
 * rows back so the desk can keep them selected.
 *
 * Three steps, each its own function so the desks share them and the tests
 * can drive them without a screen:
 *
 *  - `planBulk` splits a selection into the rows the action applies to and
 *    the ones it skips, grouped by why ("no draft", "a site page") — a
 *    skipped row is not an error, and the confirm dialog says so up front;
 *  - `runEach` calls the action per row, three at a time, and never throws;
 *  - `bulkSummary` turns the outcome into one line — "7 published · 1
 *    failed: <message>" — and the failures listed, row title and the API's
 *    message; `runWithSummary` runs and toasts it.
 *
 * And the CSV both directions the desks need: `parseCsv` for an import
 * (redirects) and `formatCsv` for a download built from the rows in view
 * (a form's selected answers).
 */

/* ------------------------------------------------------------------ */
/* Planning                                                            */
/* ------------------------------------------------------------------ */

/** Why a row is skipped by an action ("no draft"), or null when the action applies to it. */
export type SkipRule<T> = (row: T) => string | null;

export interface BulkPlan<T> {
    /** The rows the action runs on, in selection order. */
    apply: T[];
    /** The rows it skips, grouped by reason in first-seen order. */
    skipped: { reason: string; rows: T[] }[];
}

/** A selection split into the rows an action applies to and the ones it skips, by reason. */
export function planBulk<T>(rows: readonly T[], skip?: SkipRule<T>): BulkPlan<T> {
    const apply: T[] = [];
    const skipped: { reason: string; rows: T[] }[] = [];
    for (const row of rows) {
        const reason = skip?.(row) ?? null;
        if (reason === null) {
            apply.push(row);
            continue;
        }
        const group = skipped.find((item) => item.reason === reason);
        if (group) group.rows.push(row);
        else skipped.push({ reason, rows: [row] });
    }
    return { apply, skipped };
}

/** The number of rows a plan skips, across every reason. */
export const skippedCount = <T>(plan: BulkPlan<T>): number => plan.skipped.reduce((sum, group) => sum + group.rows.length, 0);

/**
 * The sentence the confirm dialog opens with: "3 will be published, 2
 * skipped (no draft)." — one clause per skip reason, so a mixed selection
 * says why each part is left alone.
 */
export function planLine<T>(plan: BulkPlan<T>, participle: string): string {
    const clauses = [`${plan.apply.length} will be ${participle}`, ...plan.skipped.map((group) => `${group.rows.length} skipped (${group.reason})`)];
    return `${clauses.join(", ")}.`;
}

/** "1 draft" / "3 drafts". */
export const countNoun = (count: number, [singular, plural]: readonly [string, string]): string => `${count} ${count === 1 ? singular : plural}`;

/* ------------------------------------------------------------------ */
/* Running                                                             */
/* ------------------------------------------------------------------ */

export interface BulkFailure<T> {
    row: T;
    message: string;
}

export interface BulkOutcome<T> {
    done: T[];
    failed: BulkFailure<T>[];
}

/** What a failed call said — the API's own message when it sent one. */
export function failureMessage(cause: unknown): string {
    if (cause instanceof ApiError) return cause.message;
    if (cause instanceof Error && cause.message) return cause.message;
    return "That did not go through.";
}

/** Three at a time: enough to be quick over a few dozen rows, few enough not to stampede one route. */
export const BULK_CONCURRENCY = 3;

/**
 * Calls `action` once per row, at most `concurrency` at a time, and never
 * throws: every row lands in `done` or in `failed` with what the API said.
 * `done` and `failed` keep the rows' selection order whatever order the
 * calls finished in.
 */
export async function runEach<T>(rows: readonly T[], action: (row: T) => Promise<unknown>, concurrency: number = BULK_CONCURRENCY): Promise<BulkOutcome<T>> {
    const results: ({ ok: true } | { ok: false; message: string })[] = new Array(rows.length);
    let next = 0;
    const worker = async () => {
        while (next < rows.length) {
            const index = next++;
            try {
                await action(rows[index]!);
                results[index] = { ok: true };
            } catch (cause) {
                results[index] = { ok: false, message: failureMessage(cause) };
            }
        }
    };
    const lanes = Math.max(1, Math.min(concurrency, rows.length));
    await Promise.all(Array.from({ length: lanes }, worker));
    const outcome: BulkOutcome<T> = { done: [], failed: [] };
    rows.forEach((row, index) => {
        const result = results[index]!;
        if (result.ok) outcome.done.push(row);
        else outcome.failed.push({ row, message: result.message });
    });
    return outcome;
}

/** How many failures the summary lists by name before it says "and N more". */
export const SUMMARY_LIST_MAX = 8;

export interface BulkSummary {
    tone: "success" | "warning" | "error";
    /** "7 published" or "7 published · 1 failed: <first message>". */
    title: string;
    /** One line per failure, "<row> — <message>", at most SUMMARY_LIST_MAX and a closing count. */
    lines: string[];
}

/** The one line a run ends with, and its failures listed by row. */
export function bulkSummary<T>(outcome: BulkOutcome<T>, participle: string, label: (row: T) => string): BulkSummary {
    const { done, failed } = outcome;
    if (failed.length === 0) return { tone: "success", title: `${done.length} ${participle}`, lines: [] };
    const lines = failed.slice(0, SUMMARY_LIST_MAX).map((failure) => `${label(failure.row)} — ${failure.message}`);
    if (failed.length > SUMMARY_LIST_MAX) lines.push(`and ${failed.length - SUMMARY_LIST_MAX} more`);
    return {
        tone: done.length === 0 ? "error" : "warning",
        title: `${done.length} ${participle} · ${failed.length} failed: ${failed[0]!.message}`,
        lines,
    };
}

/** Toasts a summary: the line as the title, the failures one per line under it. */
export function announceSummary(summary: BulkSummary): void {
    const options = summary.lines.length ? { description: summary.lines.join("\n"), classNames: { description: "whitespace-pre-line" }, duration: 12_000 } : undefined;
    if (summary.tone === "success") toast.success(summary.title, options);
    else if (summary.tone === "warning") toast.warning(summary.title, options);
    else toast.error(summary.title, options);
}

/** `runEach`, then the summary toasted. The outcome comes back so the desk can keep the failed rows selected. */
export async function runWithSummary<T>(options: {
    rows: readonly T[];
    action: (row: T) => Promise<unknown>;
    participle: string;
    label: (row: T) => string;
    concurrency?: number;
}): Promise<BulkOutcome<T>> {
    const outcome = await runEach(options.rows, options.action, options.concurrency);
    announceSummary(bulkSummary(outcome, options.participle, options.label));
    return outcome;
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Rows of cells from CSV text — quotes, doubled quotes, CRLF and a leading
 * BOM handled; blank lines dropped. The backend's `shared/csv` parser, the
 * same rules, so a file the server would read reads the same here.
 */
export function parseCsv(text: string, delimiter = ","): string[][] {
    const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < source.length; i += 1) {
        const ch = source[i]!;
        if (quoted) {
            if (ch === '"') {
                if (source[i + 1] === '"') {
                    cell += '"';
                    i += 1;
                } else quoted = false;
            } else cell += ch;
            continue;
        }
        if (ch === '"') quoted = true;
        else if (ch === delimiter) {
            row.push(cell);
            cell = "";
        } else if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && source[i + 1] === "\n") i += 1;
            row.push(cell);
            rows.push(row);
            row = [];
            cell = "";
        } else cell += ch;
    }
    if (cell.length > 0 || row.length > 0) {
        row.push(cell);
        rows.push(row);
    }
    return rows.filter((cells) => cells.some((value) => value.trim() !== ""));
}

const needsQuoting = (value: string): boolean => /[",\r\n]/.test(value) || value !== value.trim();

/** One cell, quoted only when it has to be. */
export function csvCell(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return "";
    const text = String(value);
    return needsQuoting(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows to CSV text, CRLF-terminated — the shape the server's own downloads have. */
export function formatCsv(rows: readonly (readonly (string | number | null | undefined)[])[]): string {
    return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
