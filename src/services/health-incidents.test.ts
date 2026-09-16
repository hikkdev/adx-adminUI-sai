import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lot G (Q130), package CG4 — the incident log, the sampler's series and
 * the public status page's subscribe as `/settings/system-health` reads
 * and writes them.
 *
 * What is pinned: the routes an incident moves through and the bodies
 * they take (a resolve is an update with status RESOLVED, or a PATCH with
 * a closing note), the reading of a sampled day into a bar, and that the
 * subscribe goes to the backend's root — not `/api/v1` — anonymously,
 * because it is the public page's own form.
 */

const { calls } = vi.hoisted(() => ({
    calls: [] as { method: string; path: string; body?: unknown }[],
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (method: string) => async (path: string, body?: unknown) => {
        calls.push({ method, path, body });
        return { items: [], total: 0, page: 1, pageSize: 20, counts: {} };
    };
    return {
        ...actual,
        api: { get: record("GET"), post: record("POST"), patch: record("PATCH"), put: record("PUT"), delete: record("DELETE"), blob: record("BLOB") },
    };
});

vi.mock("@/lib/api-config", () => ({
    apiConfig: { baseUrl: "https://api.adx.test/api/v1", live: true },
}));

import { ApiError } from "@/lib/api-client";
import { healthService, incidentProblem, incidentsQuery, publicStatusUrl, regionErrorRate, regionLastIncident, serviceBars, uptimePct, type HealthDay } from "./health";

beforeEach(() => {
    calls.length = 0;
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("the incident routes", () => {
    it("lists under the list contract with every facet the server cuts on", async () => {
        await healthService.incidents({ status: ["OPEN", "MONITORING"], sort: "newest", service: "API", q: " dispatch ", pageSize: 20 });
        expect(calls).toEqual([
            { method: "GET", path: "/settings/system-health/incidents?q=dispatch&status=OPEN%2CMONITORING&sort=newest&service=API&page=1&pageSize=20", body: undefined },
        ]);
        expect(incidentsQuery()).toBe("page=1&pageSize=20");
    });

    it("opens, updates, resolves and edits on the routes the module owns", async () => {
        await healthService.createIncident({ title: "Order dispatch delayed", severity: "MAJOR", services: ["API", "JOBS"], body: "Investigating." });
        await healthService.addIncidentUpdate("inc_1", { status: "MONITORING", body: "Fix rolling out." });
        await healthService.addIncidentUpdate("inc_1", { status: "RESOLVED", body: "Cleared." });
        await healthService.patchIncident("inc_1", { status: "RESOLVED", body: "Closing note." });
        await healthService.patchIncident("inc_1", { severity: "MINOR" });
        expect(calls.map((call) => [call.method, call.path])).toEqual([
            ["POST", "/settings/system-health/incidents"],
            ["POST", "/settings/system-health/incidents/inc_1/updates"],
            ["POST", "/settings/system-health/incidents/inc_1/updates"],
            ["PATCH", "/settings/system-health/incidents/inc_1"],
            ["PATCH", "/settings/system-health/incidents/inc_1"],
        ]);
        expect(calls[0]?.body).toEqual({ title: "Order dispatch delayed", severity: "MAJOR", services: ["API", "JOBS"], body: "Investigating." });
        expect(calls[2]?.body).toEqual({ status: "RESOLVED", body: "Cleared." });
        expect(calls[3]?.body).toEqual({ status: "RESOLVED", body: "Closing note." });
    });

    it("reads the regions and one incident", async () => {
        await healthService.regions();
        await healthService.incident("inc_1");
        expect(calls.map((call) => call.path)).toEqual(["/settings/system-health/regions", "/settings/system-health/incidents/inc_1"]);
    });

    it("G13-B: prints the regions table's Error rate and Last incident columns off the row", () => {
        expect(regionErrorRate({ errorRatePct: 0.12 })).toEqual({ text: "0.12%", tone: "warning" });
        expect(regionErrorRate({ errorRatePct: 0 })).toEqual({ text: "0%", tone: "success" });
        expect(regionErrorRate({ errorRatePct: 2.5 })).toEqual({ text: "2.5%", tone: "danger" });
        expect(regionErrorRate({ errorRatePct: null })).toEqual({ text: "—", tone: "neutral" });
        expect(regionErrorRate({})).toEqual({ text: "—", tone: "neutral" });
        expect(regionLastIncident({ lastIncidentAt: "2026-09-13T04:00:00.000Z" })).toBe("2026-09-13T04:00:00.000Z");
        expect(regionLastIncident({})).toBeNull();
    });

    it("refuses what the server would before the round trip", () => {
        expect(incidentProblem({ title: "ab", body: "Investigating." })).toMatch(/3 to 140/);
        expect(incidentProblem({ title: "Order dispatch delayed", body: "  " })).toMatch(/3 to 4,000/);
        expect(incidentProblem({ title: "Order dispatch delayed", body: "Investigating." })).toBeNull();
    });
});

describe("the sampled days", () => {
    const days: HealthDay[] = [
        { date: "2026-09-11", okPct: 100, p95Ms: 140 },
        { date: "2026-09-12", okPct: 96, p95Ms: 610 },
        { date: "2026-09-13", okPct: 20, p95Ms: null },
        { date: "2026-09-14", okPct: null, p95Ms: null },
    ];

    it("tone a day by the share of samples that passed, grey for no sample", () => {
        expect(serviceBars(days).map((bar) => bar.tone)).toEqual(["success", "warning", "danger", "neutral"]);
        expect(serviceBars(undefined)).toEqual([]);
    });

    it("average the uptime over the days that were sampled at all", () => {
        expect(uptimePct(days)).toBe(72);
        expect(uptimePct([{ date: "2026-09-14", okPct: null, p95Ms: null }])).toBeNull();
        expect(uptimePct(undefined)).toBeNull();
    });
});

describe("the public status page", () => {
    it("lives at the backend's root, not under /api/v1", () => {
        expect(publicStatusUrl()).toBe("https://api.adx.test/status");
    });

    it("subscribes anonymously through the page's own form and repeats the server's words", async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { message: "If this address is new, a confirmation email is on its way." } }), { status: 202 }));
        vi.stubGlobal("fetch", fetchMock);
        const outcome = await healthService.subscribe("oncall@example.com");
        expect(outcome.message).toBe("If this address is new, a confirmation email is on its way.");
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe("https://api.adx.test/status/subscribe");
        expect(init.method).toBe("POST");
        expect(init.body).toBe(JSON.stringify({ email: "oncall@example.com" }));
        expect(new Headers(init.headers).get("Authorization")).toBeNull();
        expect(calls).toEqual([]);
    });

    it("surfaces a refusal as an ApiError with the server's code", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(JSON.stringify({ success: false, error: { code: "RATE_LIMITED", message: "Try again in an hour." } }), { status: 429 })),
        );
        await expect(healthService.subscribe("oncall@example.com")).rejects.toMatchObject({ code: "RATE_LIMITED", message: "Try again in an hour." } satisfies Partial<ApiError>);
    });
});
