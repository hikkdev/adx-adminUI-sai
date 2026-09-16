import type { ImportOutcome, ImportStatus } from "@/services/party-imports";
import type { StatusMeta } from "@/types";

/**
 * The import's three real steps — Lot D (Q43/Q86), shared by every party
 * since package S.
 *
 * The frame draws "Upload file › Map columns › Review and import". There
 * is no column mapping: a party's columns are fixed and the server
 * validates them itself, so the second step is the validation report it
 * answers with, and the third is the commit — once. A revoked import ends
 * at the report; a committed one ends at the commit. Pure, so the test
 * pins the machine without a screen.
 */

export const IMPORT_STEPS = ["Upload file", "Validation report", "Commit"] as const;
export type ImportStep = 0 | 1 | 2;

export interface StepState {
    /** The step the reviewer is on. */
    active: ImportStep;
    /** Steps behind them, drawn ticked. */
    done: ImportStep[];
    /** Whether the batch is closed — committed or revoked — so nothing more can happen to it. */
    closed: boolean;
}

export function stepOf(record: { status: ImportStatus } | null): StepState {
    if (!record) return { active: 0, done: [], closed: false };
    switch (record.status) {
        case "VALIDATED":
            return { active: 1, done: [0], closed: false };
        case "COMMITTED":
            return { active: 2, done: [0, 1, 2], closed: true };
        case "REVOKED":
            return { active: 1, done: [0], closed: true };
    }
}

/** How the frame's four tiles read the server's five outcomes. */
export function tilesOf(record: { rowCount: number; createdCount: number; mergedCount: number; skippedCount: number; warningCount: number; invalidCount: number }) {
    return {
        rows: record.rowCount,
        /** What the commit will create or merge, warnings included: the server creates through a warning. */
        valid: record.createdCount + record.mergedCount,
        errors: record.invalidCount,
        warnings: record.warningCount,
        skipped: record.skippedCount,
    };
}

export const OUTCOME_META: Record<ImportOutcome, StatusMeta> = {
    CREATED: { label: "Will create", tone: "success" },
    MERGED: { label: "Merges", tone: "info" },
    WARNING: { label: "Warning", tone: "warning" },
    SKIPPED: { label: "Skipped", tone: "neutral" },
    INVALID: { label: "Invalid", tone: "danger" },
};

export const IMPORT_STATUS_META: Record<ImportStatus, StatusMeta> = {
    VALIDATED: { label: "Validated", tone: "warning" },
    COMMITTED: { label: "Committed", tone: "success" },
    REVOKED: { label: "Revoked", tone: "neutral" },
};

export type OutcomeChip = "all" | ImportOutcome;

export function rowsFor<T extends { outcome: ImportOutcome }>(rows: T[], chip: OutcomeChip): T[] {
    return chip === "all" ? rows : rows.filter((row) => row.outcome === chip);
}

/** The column an INVALID row's message names (`panNumber: Invalid PAN`), so the cell can be marked. */
export function badColumnOf(row: { outcome: ImportOutcome; message: string | null }): string | null {
    if (row.outcome !== "INVALID" || !row.message) return null;
    const match = /^([a-zA-Z]+)(?::| is required)/.exec(row.message);
    return match ? match[1] : null;
}
