import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * V-C — the one confirm for every stage move.
 *
 * What this pins: withdrawing a city names the wind-down's consequences
 * (listings unpublished, campaigns run out, leads closed, people told) and
 * the switches the stage sets, refuses to go without a note, then sends
 * ONE `PATCH /geo/cities/:slug/rollout` with the stage and the note; a
 * list of cities is ONE `POST /geo/rollout` with `citySlugs`, the stage
 * and the note — the cities the table would refuse counted beforehand —
 * and a state is the same route with `stateCode`.
 */

const { backend, toast } = vi.hoisted(() => {
    const toast = { success: vi.fn(), error: vi.fn(), loading: vi.fn() };
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        answer: {} as unknown,
        reset() {
            this.calls = [];
            this.answer = {};
        },
    };
    return { backend, toast };
});

vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        return backend.answer;
    };
    return {
        ...actual,
        api: {
            get: (path: string) => wrap("GET", path),
            post: (path: string, body?: unknown) => wrap("POST", path, body),
            patch: (path: string, body?: unknown) => wrap("PATCH", path, body),
            put: (path: string, body?: unknown) => wrap("PUT", path, body),
            delete: (path: string) => wrap("DELETE", path),
        },
    };
});

import { StageChangeDialog, bulkBodyOf, refusedCount, stagesOffered, switchOverrides } from "./stage-change-dialog";

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
    toast.error.mockReset();
});

const dialog = () => screen.getByRole("alertdialog");
const confirmButton = () => within(dialog()).getAllByRole("button").at(-1)!;

describe("withdrawing a city", () => {
    it("names the wind-down's consequences and the switches, demands a note, then PATCHes the rollout route once", async () => {
        backend.answer = { slug: "pune", name: "Pune", stage: "WITHDRAWN" };
        const onDone = vi.fn();
        render(<StageChangeDialog target={{ kind: "city", city: { slug: "pune", name: "Pune", stage: "LAUNCHED" } }} initialStage="WITHDRAWN" onOpenChange={() => {}} onDone={onDone} />);

        expect(dialog()).toHaveTextContent("Withdraw from Pune");
        const consequences = screen.getByTestId("stage-consequences");
        expect(consequences).toHaveTextContent("Every live listing in the city is unpublished within the hour");
        expect(consequences).toHaveTextContent("Running campaigns are left to complete");
        expect(consequences).toHaveTextContent("Every open lead in the city is closed as lost");
        expect(consequences).toHaveTextContent("Every active agent in the city is told once");
        expect(consequences).toHaveTextContent("republishes nothing");
        expect(screen.getByTestId("stage-defaults")).toHaveTextContent("Every switch off.");

        /* No note, no withdrawal. */
        const button = confirmButton();
        expect(button).toHaveTextContent("Withdrawn");
        expect(button).toBeDisabled();
        fireEvent.change(screen.getByLabelText(/Note/), { target: { value: "Partner pulled out of the market" } });
        expect(button).toBeEnabled();
        fireEvent.click(button);

        await waitFor(() => expect(onDone).toHaveBeenCalledWith({ kind: "city", stage: "WITHDRAWN" }));
        expect(backend.calls).toEqual([{ method: "PATCH", path: "/geo/cities/pune/rollout", body: { stage: "WITHDRAWN", note: "Partner pulled out of the market" } }]);
        expect(toast.success).toHaveBeenCalledWith("Pune is Withdrawn", expect.objectContaining({ description: expect.stringContaining("wind-down runs within the hour") }));
    });

    it("offers a city only the moves the table allows, and a launch's defaults are every switch on", () => {
        expect(stagesOffered({ kind: "city", city: { slug: "x", name: "X", stage: "LAUNCHED" } })).toEqual(["PAUSED", "WITHDRAWN"]);
        expect(stagesOffered({ kind: "city", city: { slug: "x", name: "X", stage: "WITHDRAWN" } })).toEqual(["SEEDING", "LAUNCHED"]);
        render(<StageChangeDialog target={{ kind: "city", city: { slug: "agra", name: "Agra", stage: "PLANNED" } }} initialStage="LAUNCHED" onOpenChange={() => {}} onDone={() => {}} />);
        expect(dialog()).toHaveTextContent("Launch Agra");
        expect(screen.getByTestId("stage-defaults")).toHaveTextContent("Every switch on.");
        /* A launch needs no note. */
        expect(confirmButton()).toBeEnabled();
    });
});

describe("the bulk move", () => {
    it("posts ONE /geo/rollout with the slugs, the stage and the note, naming beforehand the cities the table refuses", async () => {
        backend.answer = { changed: [{ slug: "agra", from: "PLANNED", to: "SEEDING" }], unchanged: [], skipped: [{ slug: "pune", reason: "LAUNCHED cannot move to SEEDING" }] };
        const onDone = vi.fn();
        render(
            <StageChangeDialog
                target={{
                    kind: "cities",
                    cities: [
                        { slug: "pune", name: "Pune", stage: "LAUNCHED" },
                        { slug: "agra", name: "Agra", stage: "PLANNED" },
                    ],
                }}
                initialStage="SEEDING"
                onOpenChange={() => {}}
                onDone={onDone}
            />,
        );
        expect(dialog()).toHaveTextContent("2 cities selected.");
        expect(screen.getByTestId("stage-refused")).toHaveTextContent("1 city of the 2 cannot move to Seeding");
        expect(screen.getByTestId("stage-defaults")).toHaveTextContent("Gather listings, Onboard agents and Lead feeds on; the rest off.");

        expect(confirmButton()).toBeDisabled();
        fireEvent.change(screen.getByLabelText(/Note/), { target: { value: "UP push, Q4" } });
        fireEvent.click(confirmButton());

        await waitFor(() => expect(onDone).toHaveBeenCalled());
        expect(backend.calls).toEqual([{ method: "POST", path: "/geo/rollout", body: { stage: "SEEDING", note: "UP push, Q4", citySlugs: ["pune", "agra"] } }]);
        expect(toast.success).toHaveBeenCalledWith("1 moved · 1 skipped → Seeding", expect.objectContaining({ description: expect.stringContaining("pune") }));
    });

    it("shapes the three scopes and only the overrides that differ from the stage's defaults", () => {
        const counts = { PLANNED: 3, SEEDING: 0, LAUNCHED: 1, PAUSED: 0, WITHDRAWN: 0 };
        expect(bulkBodyOf({ kind: "state", stateCode: "19", name: "Karnataka", counts }, "SEEDING", undefined, "note")).toEqual({ stage: "SEEDING", note: "note", stateCode: "19" });
        expect(bulkBodyOf({ kind: "district", districtId: "d1", name: "Mysuru", counts }, "LAUNCHED", { demand: false }, undefined)).toEqual({ stage: "LAUNCHED", switches: { demand: false }, districtId: "d1" });
        expect(switchOverrides("SEEDING", { supplyIntake: true, publishing: true, demand: false, agentOnboarding: true, printPartners: false, leadFeeds: false })).toEqual({ publishing: true, leadFeeds: false });
        expect(switchOverrides("LAUNCHED", { supplyIntake: true, publishing: true, demand: true, agentOnboarding: true, printPartners: true, leadFeeds: true })).toBeUndefined();
        expect(refusedCount([{ slug: "a", name: "A", stage: "LAUNCHED" }, { slug: "b", name: "B", stage: "PAUSED" }], "SEEDING")).toBe(2);
    });
});
