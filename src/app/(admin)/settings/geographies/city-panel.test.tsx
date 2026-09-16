import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { CityReadiness, GeoCityDetail } from "@/services/geo";

/**
 * V-C — the city panel.
 *
 * What this pins: the readiness checklist is drawn ahead of Launch with
 * the failing checks named, Launch waits on the read and, while a check
 * fails, is offered only as "Launch anyway (N failing)" — the server never
 * refuses, so the console asks twice; a ready city gets a plain Launch;
 * Y-B's soft audience check is printed with its basis and never counted;
 * a switch toggle is one PATCH with only that switch; the counts link into
 * the sections that take a city facet and stay plain where none does.
 */

const { backend, toast } = vi.hoisted(() => {
    const toast = { success: vi.fn(), error: vi.fn() };
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

import { CityPanel, countHref } from "./city-panel";

const detail = (over: Partial<GeoCityDetail> = {}): GeoCityDetail => ({
    id: "city_1",
    slug: "mysuru",
    name: "Mysuru",
    state: "Karnataka",
    aliases: ["mysore"],
    isActive: true,
    stateId: "st_19",
    districtId: "d_1",
    latitude: 12.3,
    longitude: 76.6,
    population: 920_550,
    kind: "DISTRICT_HQ",
    geonameId: 1262321,
    source: "GEONAMES",
    stage: "SEEDING",
    switches: { supplyIntake: true, publishing: false, demand: false, agentOnboarding: true, printPartners: false, leadFeeds: true },
    launchedAt: null,
    pausedAt: null,
    withdrawnAt: null,
    rolloutNote: null,
    geoState: { code: "19", name: "Karnataka" },
    geoDistrict: { code: "560", name: "Mysuru" },
    counts: { publishers: 4, listingsLive: 3, listingsTotal: 9, advertisers: 1, agents: 2, printPartners: 0, openLeads: 5 },
    events: [{ id: "ev_1", cityId: "city_1", fromStage: "PLANNED", toStage: "SEEDING", flags: {}, byUserId: "usr_ops", byUser: { id: "usr_ops", name: "Ops Lead" }, note: "Karnataka push", at: "2026-09-14T09:00:00.000Z" }],
    ...over,
});

const readiness = (ready: boolean): CityReadiness => ({
    city: "mysuru",
    stage: "SEEDING",
    ready,
    checks: [
        { key: "rateCard", ok: true, detail: "Karnataka standard is in force" },
        { key: "agents", ok: ready, detail: ready ? "1 publisher-side and 1 advertiser-side agent(s) active" : "1 publisher-side and 0 advertiser-side agent(s) active" },
        { key: "listings", ok: ready, detail: ready ? "12 live listing(s) of 10 wanted" : "3 live listing(s) of 10 wanted (geo.launchMinListings)" },
        { key: "printPartner", ok: true, detail: "0 active print partner(s); not required" },
        { key: "vocabulary", ok: true, detail: "Pricing vocabulary present" },
        { key: "audience", ok: false, soft: true, detail: "No audience vendor is configured (soft: never blocks a launch)" },
    ],
});

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
});

describe("readiness ahead of Launch", () => {
    it("names the failing checks and offers Launch only as 'Launch anyway' while they fail", () => {
        render(<CityPanel detail={detail()} readiness={{ data: readiness(false), loading: false, error: null }} onChanged={() => {}} mayEdit />);
        const card = screen.getByTestId("readiness");
        expect(card).toHaveTextContent("2 failing");
        expect(card).toHaveTextContent("An agent on each side");
        expect(card).toHaveTextContent("0 advertiser-side agent(s) active");
        expect(card).toHaveTextContent("3 live listing(s) of 10 wanted");
        expect(within(card).getAllByLabelText("failing")).toHaveLength(2);

        const moves = screen.getByTestId("stage-moves");
        expect(within(moves).queryByRole("button", { name: "Launch" })).toBeNull();
        const anyway = within(moves).getByRole("button", { name: "Launch anyway" });
        expect(anyway).toHaveTextContent("Launch anyway (2 failing)");
        expect(anyway).toBeEnabled();
        /* The other moves a SEEDING city has. */
        expect(within(moves).getByRole("button", { name: "Pause" })).toBeInTheDocument();
        expect(within(moves).getByRole("button", { name: "Withdraw" })).toBeInTheDocument();

        /* Launch anyway still opens the confirm, on LAUNCHED. */
        fireEvent.click(anyway);
        expect(screen.getByRole("alertdialog")).toHaveTextContent("Launch Mysuru");
    });

    it("prints the soft audience check with its basis and never counts it", () => {
        render(<CityPanel detail={detail()} readiness={{ data: readiness(true), loading: false, error: null }} onChanged={() => {}} mayEdit />);
        const card = screen.getByTestId("readiness");
        expect(card).toHaveTextContent("Ready");
        const audience = within(card).getByTestId("check-audience");
        expect(audience).toHaveTextContent("Audience data");
        expect(audience).toHaveTextContent("soft — never counted");
        expect(audience).toHaveTextContent("No audience vendor is configured");
        expect(within(audience).getByLabelText("soft")).toBeInTheDocument();
        expect(within(card).queryByLabelText("failing")).toBeNull();
        expect(within(screen.getByTestId("stage-moves")).getByRole("button", { name: "Launch" })).toBeEnabled();
    });

    it("waits on the read, then offers a plain Launch when every check passes", () => {
        const { unmount } = render(<CityPanel detail={detail()} readiness={{ data: null, loading: true, error: null }} onChanged={() => {}} mayEdit />);
        expect(within(screen.getByTestId("stage-moves")).getByRole("button", { name: "Launch" })).toBeDisabled();
        unmount();
        render(<CityPanel detail={detail()} readiness={{ data: readiness(true), loading: false, error: null }} onChanged={() => {}} mayEdit />);
        expect(screen.getByTestId("readiness")).toHaveTextContent("Ready");
        expect(within(screen.getByTestId("stage-moves")).getByRole("button", { name: "Launch" })).toBeEnabled();
    });

    it("draws no checklist where Launch is not a move — a launched city", () => {
        render(<CityPanel detail={detail({ stage: "LAUNCHED" })} readiness={{ data: null, loading: false, error: null }} onChanged={() => {}} mayEdit />);
        expect(screen.queryByTestId("readiness")).toBeNull();
        const moves = screen.getByTestId("stage-moves");
        expect(within(moves).getByRole("button", { name: "Pause" })).toBeInTheDocument();
        expect(within(moves).getByRole("button", { name: "Withdraw" })).toBeInTheDocument();
        expect(within(moves).queryByRole("button", { name: "Launch" })).toBeNull();
    });
});

describe("the switches and the counts", () => {
    it("flips one switch with one PATCH naming only that switch", async () => {
        backend.answer = detail({ switches: { ...detail().switches, publishing: true } });
        const onChanged = vi.fn();
        render(<CityPanel detail={detail()} readiness={{ data: null, loading: false, error: null }} onChanged={onChanged} mayEdit />);
        fireEvent.click(screen.getByRole("switch", { name: "Publish listings in Mysuru" }));
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.calls).toEqual([{ method: "PATCH", path: "/geo/cities/mysuru/rollout", body: { publishing: true } }]);
        expect(toast.success).toHaveBeenCalledWith("Publish listings on in Mysuru", expect.anything());
    });

    it("links the counts into the sections that take a city, and leaves the rest as numbers", () => {
        render(<CityPanel detail={detail()} readiness={{ data: null, loading: false, error: null }} onChanged={() => {}} mayEdit />);
        expect(screen.getByRole("link", { name: "Publishers in Mysuru" })).toHaveAttribute("href", "/publishers?city=Mysuru");
        expect(screen.getByRole("link", { name: "Agents in Mysuru" })).toHaveAttribute("href", "/agents?city=Mysuru");
        expect(screen.queryByRole("link", { name: "Open leads in Mysuru" })).toBeNull();
        expect(countHref("listingsLive", "Mysuru")).toBeNull();
        expect(countHref("printPartners", "Navi Mumbai")).toBe("/print-partners?city=Navi%20Mumbai");
        /* The timeline prints the move, who and the note. */
        expect(screen.getByText(/Karnataka push/)).toBeInTheDocument();
        expect(screen.getByText("Ops Lead")).toBeInTheDocument();
        expect(screen.queryByText("usr_ops")).not.toBeInTheDocument();
    });

    it("draws the moves and the toggles disabled without settings.edit", () => {
        render(<CityPanel detail={detail()} readiness={{ data: readiness(true), loading: false, error: null }} onChanged={() => {}} mayEdit={false} />);
        expect(within(screen.getByTestId("stage-moves")).getByRole("button", { name: "Launch" })).toBeDisabled();
        expect(screen.getByRole("switch", { name: "Gather listings in Mysuru" })).toBeDisabled();
        expect(screen.getByText("Moving a city needs settings.edit.")).toBeInTheDocument();
    });
});
