import { describe, expect, it } from "vitest";

import { ageLabel, historyBars, opsCards, sizeLabel, type OpsHealth, type SystemHealthHistory } from "./health";

/**
 * Lot E — the ops block on `/settings/system-health`.
 *
 * `GET /settings/system-health/ops` answers four facts and the page draws
 * four cards; what this file pins is the reading of each fact, because a
 * card that says "Operational" over a dump nobody took is the one lie this
 * page must never tell. The staleness verdicts are the backend's own —
 * `backup.stale`, `jobs[].stale` — and the console repeats them rather than
 * re-deriving them from a threshold it would have to keep in step.
 */

const ops = (patch: Partial<OpsHealth> = {}): OpsHealth => ({
    targets: { rpoHours: 1, rtoHours: 4 },
    backup: {
        last: { name: "adx-2026-09-13.dump", takenAt: "2026-09-13T01:00:00.000Z", size: 52_428_800 },
        count: 14,
        ageHours: 3,
        stale: false,
        rotationDays: 14,
    },
    drill: {
        ranAt: "2026-09-07T02:00:00.000Z",
        status: "PASSED",
        dump: { name: "adx-2026-09-07.dump", size: 50_000_000 },
        durationMs: 84_000,
        ledger: null,
        warnings: null,
        error: null,
    },
    retention: { dueCount: 0, generatedAt: "2026-09-13T00:30:00.000Z", erasureOverdue: 0 },
    jobs: [
        { job: "publisher-timer", lastTickAt: "2026-09-13T04:00:00.000Z", staleMinutes: 4, stale: false },
        { job: "retention-sweep", lastTickAt: "2026-09-13T00:30:00.000Z", staleMinutes: 214, stale: true },
    ],
    ...patch,
});

describe("the ops cards", () => {
    it("draw the four facts in the frame's order", () => {
        expect(opsCards(ops()).map((card) => card.id)).toEqual(["backup", "drill", "retention", "jobs"]);
    });

    it("read a fresh dump as operational, with its age and size", () => {
        const [backup] = opsCards(ops());
        expect(backup.status.tone).toBe("success");
        expect(backup.metric).toBe("3h ago");
        expect(backup.metricLabel).toBe("last dump, 50.0 MB");
        expect(backup.detail).toBe("14 kept over 14 days · RPO target 1h");
    });

    it("read a stale dump as late rather than as an outage — the API is up, the housekeeping is not", () => {
        const [backup] = opsCards(ops({ backup: { ...ops().backup, ageHours: 30, stale: true } }));
        expect(backup.status).toEqual({ label: "Late", tone: "warning" });
        expect(backup.metric).toBe("1d 6h ago");
    });

    it("say plainly when there is no dump, and when the folder could not be listed", () => {
        const none = opsCards(ops({ backup: { last: null, count: 0, ageHours: null, stale: true, rotationDays: 14 } }))[0];
        expect(none.status.tone).toBe("warning");
        expect(none.metric).toBe("None");

        const failed = opsCards(
            ops({ backup: { last: null, count: 0, ageHours: null, stale: true, rotationDays: 14, error: "403 from storage" } }),
        )[0];
        expect(failed.status.tone).toBe("danger");
        expect(failed.detail).toBe("403 from storage");
    });

    it("carry the drill's result and its duration, or say it never ran", () => {
        const [, passed] = opsCards(ops());
        expect(passed.status.tone).toBe("success");
        expect(passed.metricLabel).toBe("84s restore of adx-2026-09-07.dump");

        const [, failed] = opsCards(ops({ drill: { ...ops().drill!, status: "FAILED", error: "pg_restore exited 1" } }));
        expect(failed.status.tone).toBe("danger");
        expect(failed.detail).toBe("pg_restore exited 1");

        const [, never] = opsCards(ops({ drill: null }));
        expect(never.status.tone).toBe("neutral");
        expect(never.metric).toBe("Never run");
    });

    it("escalate retention from operational to due to overdue", () => {
        expect(opsCards(ops())[2].status.tone).toBe("success");
        const due = opsCards(ops({ retention: { dueCount: 3, generatedAt: null, erasureOverdue: 0 } }))[2];
        expect(due.status.tone).toBe("warning");
        expect(due.metric).toBe("3");
        expect(due.detail).toBe("the sweep has not run yet");
        const overdue = opsCards(ops({ retention: { dueCount: 1, generatedAt: null, erasureOverdue: 2 } }))[2];
        expect(overdue.status.tone).toBe("danger");
        expect(overdue.detail).toBe("2 erasure requests past its thirty days");
    });

    it("count the jobs that are ticking and name the silent ones", () => {
        const [, , , jobs] = opsCards(ops());
        expect(jobs.status.tone).toBe("danger");
        expect(jobs.metric).toBe("1 of 2");
        expect(jobs.detail).toBe("Silent: retention-sweep");

        const quiet = opsCards(ops({ jobs: [] }))[3];
        expect(quiet.status.tone).toBe("neutral");
        expect(quiet.metric).toBe("None");
    });
});

describe("the history bars", () => {
    const history = (series: { day: string; count: number }[]): SystemHealthHistory => ({
        generatedAt: "2026-09-13T04:00:00.000Z",
        jobs: [],
        serverErrors: { days: 30, series, total: series.reduce((sum, row) => sum + row.count, 0), source: "redis" },
    });

    it("draw nothing when there is no series", () => {
        expect(historyBars(null)).toEqual([]);
        expect(historyBars(history([]))).toEqual([]);
    });

    it("keep the backend's order and colour a day by whether it had any server error", () => {
        const bars = historyBars(
            history([
                { day: "2026-09-11", count: 0 },
                { day: "2026-09-12", count: 4 },
                { day: "2026-09-13", count: 0 },
            ]),
        );
        expect(bars.map((bar) => bar.day)).toEqual(["2026-09-11", "2026-09-12", "2026-09-13"]);
        expect(bars.map((bar) => bar.tone)).toEqual(["success", "danger", "success"]);
        expect(bars[1].count).toBe(4);
    });
});

describe("the labels", () => {
    it("print an age in the two largest units", () => {
        expect(ageLabel(0)).toBe("0h");
        expect(ageLabel(23.9)).toBe("23h");
        expect(ageLabel(26)).toBe("1d 2h");
    });

    it("print a size the way ops read one", () => {
        expect(sizeLabel(512)).toBe("512 B");
        expect(sizeLabel(2048)).toBe("2 KB");
        expect(sizeLabel(52_428_800)).toBe("50.0 MB");
        expect(sizeLabel(3_221_225_472)).toBe("3.0 GB");
    });
});
