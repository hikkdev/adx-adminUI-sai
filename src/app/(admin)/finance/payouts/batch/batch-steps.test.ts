import { describe, expect, it } from "vitest";
import type { BatchPreflight, PayoutBatchStatus } from "@/services/finance";
import {
    BATCH_STEPS,
    FOUR_EYES,
    canCancel,
    canEditLines,
    derivedStatus,
    lineActions,
    phaseOf,
    preflightChecks,
    primaryAction,
    stepIndex,
    tallyLines,
} from "./batch-steps";

/**
 * The payout batch wizard's step machine — Lot B (Q85/Q140).
 *
 * The step is derived from the batch, never stored, so what is pinned is the
 * mapping: which status lands on which of the frame's four steps, which one
 * button each step offers, when the builder is refused (four eyes), when
 * release is refused (a failed preflight), and how a released batch's lines
 * fold into the status the backend will derive.
 */

const batch = (status: PayoutBatchStatus, lineCount = 3, createdByUserId = "usr_builder") => ({
    status,
    lineCount,
    createdByUserId,
});

const ok: BatchPreflight = {
    ok: true,
    rail: { name: "MANUAL_NEFT", configured: true },
    ledgerHealthy: true,
    lines: [
        { withdrawalId: "w1", reference: "WDR-2026-000001", netAmount: "1000.00", problems: [] },
        { withdrawalId: "w2", reference: "WDR-2026-000002", netAmount: "2000.00", problems: [] },
    ],
};

describe("phaseOf", () => {
    it("walks the four drawn steps as the batch's status moves", () => {
        expect(BATCH_STEPS).toHaveLength(4);
        expect(phaseOf(batch("DRAFT", 0))).toBe("select");
        expect(phaseOf(batch("DRAFT"))).toBe("review");
        expect(phaseOf(batch("IN_REVIEW"))).toBe("checks");
        expect(phaseOf(batch("APPROVED"))).toBe("release");
        expect(stepIndex("select")).toBe(0);
        expect(stepIndex("release")).toBe(3);
    });

    it("treats everything after release as one phase, with all four steps done", () => {
        for (const status of ["RELEASING", "RELEASED", "COMPLETED", "PARTIALLY_FAILED", "FAILED"] as const) {
            expect(phaseOf(batch(status))).toBe("released");
        }
        expect(stepIndex("released")).toBe(4);
        expect(phaseOf(batch("CANCELLED"))).toBe("cancelled");
        expect(stepIndex("cancelled")).toBe(-1);
    });

    it("lets a draft with lines go back to picking them, and nothing else", () => {
        expect(phaseOf(batch("DRAFT"), true)).toBe("select");
        expect(phaseOf(batch("IN_REVIEW"), true)).toBe("checks");
    });
});

describe("primaryAction", () => {
    const admin = { userId: "usr_approver", canApprove: true };

    it("saves recipients only once at least one is picked", () => {
        expect(primaryAction(batch("DRAFT", 0), admin, { selectedCount: 0, preflight: null })).toMatchObject({
            action: "setLines",
            enabled: false,
        });
        expect(primaryAction(batch("DRAFT", 0), admin, { selectedCount: 2, preflight: null })).toMatchObject({
            action: "setLines",
            enabled: true,
            reason: null,
        });
    });

    it("submits a draft that has lines", () => {
        expect(primaryAction(batch("DRAFT"), admin, { selectedCount: 0, preflight: null })).toMatchObject({
            action: "submit",
            label: "Continue to review",
            enabled: true,
        });
    });

    it("refuses the builder at approval and says why — four eyes", () => {
        const builder = { userId: "usr_builder", canApprove: true };
        expect(primaryAction(batch("IN_REVIEW"), builder, { selectedCount: 0, preflight: ok })).toEqual({
            action: "approve",
            label: "Approve batch",
            enabled: false,
            reason: FOUR_EYES,
        });
        expect(primaryAction(batch("IN_REVIEW"), admin, { selectedCount: 0, preflight: ok })).toMatchObject({
            action: "approve",
            enabled: true,
        });
    });

    it("needs finance.approve to sign off or release", () => {
        const viewer = { userId: "usr_other", canApprove: false };
        expect(primaryAction(batch("IN_REVIEW"), viewer, { selectedCount: 0, preflight: ok })?.enabled).toBe(false);
        expect(primaryAction(batch("APPROVED"), viewer, { selectedCount: 0, preflight: ok })?.enabled).toBe(false);
    });

    it("releases only on a passing preflight, and waits for one", () => {
        expect(primaryAction(batch("APPROVED"), admin, { selectedCount: 0, preflight: null })).toMatchObject({
            action: "release",
            enabled: false,
            reason: "Waiting for the pre-flight.",
        });
        expect(
            primaryAction(batch("APPROVED"), admin, { selectedCount: 0, preflight: { ...ok, ok: false } })?.enabled
        ).toBe(false);
        expect(primaryAction(batch("APPROVED"), admin, { selectedCount: 0, preflight: ok })).toMatchObject({
            action: "release",
            enabled: true,
        });
    });

    it("offers no batch-level button once released or cancelled", () => {
        expect(primaryAction(batch("RELEASED"), admin, { selectedCount: 0, preflight: ok })).toBeNull();
        expect(primaryAction(batch("CANCELLED"), admin, { selectedCount: 0, preflight: ok })).toBeNull();
    });
});

describe("what may be done to a batch and a line", () => {
    it("cancels before release only", () => {
        expect(canCancel("DRAFT")).toBe(true);
        expect(canCancel("IN_REVIEW")).toBe(true);
        expect(canCancel("APPROVED")).toBe(true);
        expect(canCancel("RELEASING")).toBe(false);
        expect(canCancel("COMPLETED")).toBe(false);
        expect(canEditLines("DRAFT")).toBe(true);
        expect(canEditLines("IN_REVIEW")).toBe(false);
    });

    it("marks paid or fails only a line the rail is holding, on a released batch", () => {
        expect(lineActions("RELEASED", "PROCESSING")).toEqual(["mark-paid", "fail"]);
        expect(lineActions("PARTIALLY_FAILED", "PROCESSING")).toEqual(["mark-paid", "fail"]);
        expect(lineActions("RELEASED", "PAID")).toEqual([]);
        expect(lineActions("RELEASED", "FAILED")).toEqual([]);
        // Reserved, not yet released: the batch handles it.
        expect(lineActions("APPROVED", "APPROVED")).toEqual([]);
        expect(lineActions("RELEASING", "APPROVED")).toEqual([]);
    });
});

describe("the derived status", () => {
    const lines = (...statuses: ("PAID" | "FAILED" | "PROCESSING" | "APPROVED")[]) =>
        statuses.map((status) => ({ status }));

    it("folds the lines the way batch-status.ts does", () => {
        expect(derivedStatus(tallyLines(lines("PAID", "PROCESSING")))).toBe("RELEASED");
        expect(derivedStatus(tallyLines(lines("PAID", "PAID")))).toBe("COMPLETED");
        expect(derivedStatus(tallyLines(lines("PAID", "FAILED")))).toBe("PARTIALLY_FAILED");
        expect(derivedStatus(tallyLines(lines("FAILED", "FAILED")))).toBe("FAILED");
        expect(derivedStatus(tallyLines([]))).toBe("COMPLETED");
    });

    it("counts a line a half-finished release left behind as waiting", () => {
        expect(tallyLines(lines("PAID", "APPROVED", "PROCESSING"))).toEqual({
            total: 3,
            paid: 1,
            failed: 0,
            processing: 1,
            waiting: 1,
        });
    });
});

describe("preflightChecks", () => {
    it("passes every check on a clean preflight", () => {
        const checks = preflightChecks(ok);
        expect(checks.every((check) => check.verdict === "pass")).toBe(true);
        expect(checks.map((check) => check.id)).toContain("RAIL");
        expect(checks.map((check) => check.id)).toContain("LEDGER");
    });

    it("names the lines behind each failed check, and folds the two inactive codes into one", () => {
        const checks = preflightChecks({
            ok: false,
            rail: { name: "RAZORPAY_X", configured: false },
            ledgerHealthy: true,
            lines: [
                { withdrawalId: "w1", reference: "WDR-1", netAmount: "1.00", problems: ["KYC_NOT_VERIFIED", "USER_INACTIVE"] },
                { withdrawalId: "w2", reference: "WDR-2", netAmount: "1.00", problems: ["PARTNER_INACTIVE"] },
                { withdrawalId: "w3", reference: "WDR-3", netAmount: "1.00", problems: ["NOT_APPROVED:REJECTED"] },
            ],
        });
        const byId = Object.fromEntries(checks.map((check) => [check.id, check]));
        expect(byId.KYC_NOT_VERIFIED).toMatchObject({ verdict: "fail", detail: "WDR-1" });
        expect(byId.ACCOUNT_ACTIVE).toMatchObject({ verdict: "fail", detail: "WDR-1, WDR-2" });
        expect(byId.NOT_APPROVED).toMatchObject({ verdict: "fail", detail: "WDR-3" });
        expect(byId.RAIL).toMatchObject({ verdict: "fail", detail: "RAZORPAY_X has no credentials" });
        expect(byId.WALLET_SHORT.verdict).toBe("pass");
    });

    it("fails an empty batch on the one check that counts lines", () => {
        const checks = preflightChecks({ ...ok, ok: false, lines: [] });
        expect(checks.find((check) => check.id === "LINES")?.verdict).toBe("fail");
    });
});
