import type { StatusMeta } from "./common";

/* ------------------------------------------------------------------ */
/* Fraud investigation                                                 */
/* ------------------------------------------------------------------ */

export type FraudNodeKind = "flagged" | "shared" | "clean";

export interface FraudNode {
    id: string;
    label: string;
    sub: string;
    kind: FraudNodeKind;
    /** Percentage position within the graph canvas. */
    x: number;
    y: number;
}

export type FraudCaseStatus = "open" | "suspended" | "dismissed" | "escalated";

export const FRAUD_CASE_STATUS_META: Record<FraudCaseStatus, StatusMeta> = {
    open: { label: "Open", tone: "warning" },
    suspended: { label: "Accounts suspended", tone: "danger" },
    dismissed: { label: "Dismissed", tone: "neutral" },
    escalated: { label: "Escalated to legal", tone: "danger" },
};

export interface FraudTimelineEntry {
    label: string;
    ago: string;
}

export interface FraudCase {
    id: string;
    title: string;
    /** 0 to 1. Anything at or above 0.8 auto-suspends. */
    score: number;
    status: FraudCaseStatus;
    summary: string;
    openedAgo: string;
    accountCount: number;
    valueAtRisk: number;
    nodes: FraudNode[];
    edges: [string, string][];
    sharedSignals: [string, string][];
    timeline: FraudTimelineEntry[];
}
