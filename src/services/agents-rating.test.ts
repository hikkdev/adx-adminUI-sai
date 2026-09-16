import { describe, expect, it, vi } from "vitest";

/**
 * The rating as the console reads it (D5).
 *
 * Ops and the agent are looking at the same three numbers, so the only thing
 * the console adds is how to draw them: a percentage, and whether the driver
 * is where ADX wants it — which is the other way round on the rejection rate.
 */

const { calls } = vi.hoisted(() => ({ calls: [] as string[] }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (method: string) => async (path: string) => {
        calls.push(`${method} ${path}`);
        return {};
    };
    return { ...actual, api: { get: record("GET"), post: record("POST"), patch: record("PATCH"), put: record("PUT"), delete: record("DELETE") } };
});

import { agentService, driverHealthy, ratePercent, type AgentRatingDriver } from "./agents";

const driver = (over: Partial<AgentRatingDriver>): AgentRatingDriver => ({
    key: "completion",
    label: "Completion rate",
    rate: 0.96,
    sample: 25,
    inverted: false,
    ...over,
});

describe("drawing a driver", () => {
    it("is a whole percentage, or nothing at all where there is no sample", () => {
        expect(ratePercent(0.96)).toBe(96);
        expect(ratePercent(0.125)).toBe(13);
        expect(ratePercent(null)).toBeNull();
    });

    it("knows which way is good, and says nothing where it cannot tell", () => {
        expect(driverHealthy(driver({}))).toBe(true);
        expect(driverHealthy(driver({ rate: 0.7 }))).toBe(false);
        expect(driverHealthy(driver({ key: "rejection", rate: 0.05, inverted: true }))).toBe(true);
        expect(driverHealthy(driver({ key: "rejection", rate: 0.2, inverted: true }))).toBe(false);
        expect(driverHealthy(driver({ rate: null }))).toBeNull();
    });
});

describe("what the agent page reads", () => {
    it("asks the same endpoint the agent's own screen does, by id", async () => {
        calls.length = 0;
        await agentService.rating("agt_1");
        expect(calls).toEqual(["GET /agents/agt_1/rating"]);
    });
});
