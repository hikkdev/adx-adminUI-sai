import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The shared bulk runner every Content desk and the custom fields desk use:
 * the plan a confirm dialog opens with (skipped rows grouped by reason, not
 * errors), the run (three at a time, never throwing, the rows' order kept),
 * the one-line summary with every failure named, and the CSV both ways.
 */

const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("sonner", () => ({ toast }));

import { ApiError } from "@/lib/api-client";
import { BULK_CONCURRENCY, SUMMARY_LIST_MAX, bulkSummary, countNoun, csvCell, failureMessage, formatCsv, parseCsv, planBulk, planLine, runEach, runWithSummary, skippedCount } from "./bulk";

type Row = { id: string; draft: boolean; kind: "SYSTEM" | "CUSTOM" };
const rows: Row[] = [
    { id: "a", draft: true, kind: "CUSTOM" },
    { id: "b", draft: false, kind: "CUSTOM" },
    { id: "c", draft: true, kind: "SYSTEM" },
    { id: "d", draft: false, kind: "SYSTEM" },
];

beforeEach(() => {
    for (const fn of Object.values(toast)) fn.mockReset();
});

describe("planning", () => {
    it("splits a selection into what applies and what is skipped, grouped by the first reason each row meets", () => {
        const plan = planBulk(rows, (row) => (row.kind === "SYSTEM" ? "a site page" : !row.draft ? "no draft" : null));
        expect(plan.apply.map((row) => row.id)).toEqual(["a"]);
        expect(plan.skipped).toEqual([
            { reason: "no draft", rows: [rows[1]] },
            { reason: "a site page", rows: [rows[2], rows[3]] },
        ]);
        expect(skippedCount(plan)).toBe(3);
    });

    it("applies to every row without a rule", () => {
        expect(planBulk(rows).apply).toHaveLength(4);
        expect(planBulk(rows).skipped).toEqual([]);
    });

    it("says the plan up front — what will happen and why the rest is left alone", () => {
        const plan = planBulk(rows, (row) => (row.draft ? null : "no draft"));
        expect(planLine(plan, "published")).toBe("2 will be published, 2 skipped (no draft).");
        expect(planLine(planBulk(rows), "archived")).toBe("4 will be archived.");
    });

    it("counts a noun", () => {
        expect(countNoun(1, ["draft", "drafts"])).toBe("1 draft");
        expect(countNoun(3, ["draft", "drafts"])).toBe("3 drafts");
        expect(countNoun(0, ["draft", "drafts"])).toBe("0 drafts");
    });
});

describe("running", () => {
    it("never runs more than three at a time, and keeps the rows' order whatever order they finish in", async () => {
        let inFlight = 0;
        let peak = 0;
        const ids = Array.from({ length: 10 }, (_, index) => index);
        const outcome = await runEach(ids, async (id) => {
            inFlight += 1;
            peak = Math.max(peak, inFlight);
            await new Promise((resolve) => setTimeout(resolve, (10 - id) * 2));
            inFlight -= 1;
            if (id % 4 === 0) throw new ApiError(409, "CONFLICT", `row ${id} refused`);
        });
        expect(peak).toBe(BULK_CONCURRENCY);
        expect(outcome.done).toEqual([1, 2, 3, 5, 6, 7, 9]);
        expect(outcome.failed).toEqual([
            { row: 0, message: "row 0 refused" },
            { row: 4, message: "row 4 refused" },
            { row: 8, message: "row 8 refused" },
        ]);
    });

    it("goes one by one when asked", async () => {
        const order: string[] = [];
        await runEach(["x", "y", "z"], async (id) => {
            order.push(`start ${id}`);
            await Promise.resolve();
            order.push(`end ${id}`);
        }, 1);
        expect(order).toEqual(["start x", "end x", "start y", "end y", "start z", "end z"]);
    });

    it("runs nothing on an empty selection", async () => {
        const action = vi.fn();
        expect(await runEach([], action)).toEqual({ done: [], failed: [] });
        expect(action).not.toHaveBeenCalled();
    });

    it("keeps what the API said", () => {
        expect(failureMessage(new ApiError(403, "FORBIDDEN", "Needs content.approve"))).toBe("Needs content.approve");
        expect(failureMessage(new Error("offline"))).toBe("offline");
        expect(failureMessage("??")).toBe("That did not go through.");
    });
});

describe("the summary", () => {
    const label = (id: number) => `Page ${id}`;

    it("is one number when everything went through", () => {
        expect(bulkSummary({ done: [1, 2, 3], failed: [] }, "published", label)).toEqual({ tone: "success", title: "3 published", lines: [] });
    });

    it("names the failures — the row and the API's message — after the one line", () => {
        const summary = bulkSummary({ done: [1, 2, 3, 4, 5, 6, 7], failed: [{ row: 8, message: "archived — restore it first" }] }, "published", label);
        expect(summary).toEqual({ tone: "warning", title: "7 published · 1 failed: archived — restore it first", lines: ["Page 8 — archived — restore it first"] });
    });

    it("is an error when nothing went through, and caps the list", () => {
        const failed = Array.from({ length: SUMMARY_LIST_MAX + 3 }, (_, index) => ({ row: index, message: "No" }));
        const summary = bulkSummary({ done: [], failed }, "archived", label);
        expect(summary.tone).toBe("error");
        expect(summary.title).toBe(`0 archived · ${SUMMARY_LIST_MAX + 3} failed: No`);
        expect(summary.lines).toHaveLength(SUMMARY_LIST_MAX + 1);
        expect(summary.lines.at(-1)).toBe("and 3 more");
    });

    it("toasts the summary after the run and hands the outcome back", async () => {
        const outcome = await runWithSummary({
            rows: ["home", "diwali"],
            action: async (key) => {
                if (key === "diwali") throw new ApiError(409, "CONFLICT", "nothing to publish");
            },
            participle: "published",
            label: (key) => key,
        });
        expect(outcome.failed.map((failure) => failure.row)).toEqual(["diwali"]);
        expect(toast.warning).toHaveBeenCalledWith("1 published · 1 failed: nothing to publish", expect.objectContaining({ description: "diwali — nothing to publish" }));
    });
});

describe("CSV", () => {
    it("reads quotes, doubled quotes, CRLF and a BOM, and drops blank lines", () => {
        const text = '﻿from,to\r\n"/a,b",/c\r\n\r\n"/say ""hi""",https://x.in\n';
        expect(parseCsv(text)).toEqual([
            ["from", "to"],
            ["/a,b", "/c"],
            ['/say "hi"', "https://x.in"],
        ]);
    });

    it("keeps a ragged last line", () => {
        expect(parseCsv("/a,/b\n/c")).toEqual([["/a", "/b"], ["/c"]]);
    });

    it("writes a cell quoted only when it must be, and rows CRLF-terminated", () => {
        expect(csvCell(null)).toBe("");
        expect(csvCell(12.5)).toBe("12.5");
        expect(csvCell("plain")).toBe("plain");
        expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
        expect(csvCell(" padded")).toBe('" padded"');
        expect(formatCsv([["id", "name"], ["s1", null]])).toBe("id,name\r\ns1,\r\n");
    });

    it("round-trips", () => {
        const rows = [["from", "to"], ["/x,y", 'say "no"']];
        expect(parseCsv(formatCsv(rows))).toEqual(rows);
    });
});
