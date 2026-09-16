import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { GeoCity } from "@/services/geo";

/**
 * V-C — the shared city combobox.
 *
 * What this pins: the field is free text and hands back whatever was
 * typed; focusing it asks `GET /geo/cities` for the launched cities and
 * typing asks for a search over every stage (the search path, with the
 * cap and the sort); the matches are grouped by state with the stage pill;
 * a pick writes the display name and hands the row back; a name that
 * matches nothing is kept as typed and says so.
 */

const { backend } = vi.hoisted(() => ({
    backend: {
        calls: [] as string[],
        items: [] as unknown[],
        reset() {
            this.calls = [];
            this.items = [];
        },
    },
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        api: {
            ...actual.api,
            get: async (path: string) => {
                backend.calls.push(path);
                return { items: backend.items, total: backend.items.length, page: 1, pageSize: 20, counts: {} };
            },
        },
    };
});

import { CityCombobox, groupByState } from "./city-combobox";

const city = (slug: string, name: string, state: string, stage: GeoCity["stage"]): GeoCity => ({
    id: `c_${slug}`,
    slug,
    name,
    state,
    aliases: [],
    isActive: stage !== "PLANNED",
    stateId: null,
    districtId: null,
    latitude: null,
    longitude: null,
    population: 100_000,
    kind: "TOWN",
    geonameId: null,
    source: "GEONAMES",
    stage,
    switches: { supplyIntake: false, publishing: false, demand: false, agentOnboarding: false, printPartners: false, leadFeeds: false },
    launchedAt: null,
    pausedAt: null,
    withdrawnAt: null,
    rolloutNote: null,
    geoState: { code: "x", name: state },
    geoDistrict: null,
});

function Harness({ initial = "" }: { initial?: string }) {
    const [value, setValue] = React.useState(initial);
    const [picked, setPicked] = React.useState<string | null>(null);
    return (
        <>
            <CityCombobox id="city" value={value} onChange={(next, row) => (setValue(next), setPicked(row?.slug ?? null))} aria-label="City" />
            <output data-testid="value">{value}</output>
            <output data-testid="picked">{picked ?? "-"}</output>
        </>
    );
}

beforeEach(() => {
    backend.reset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
});

describe("CityCombobox", () => {
    it("asks for the launched cities on focus and for a search over every stage once typed", async () => {
        backend.items = [city("pune", "Pune", "Maharashtra", "LAUNCHED"), city("punalur", "Punalur", "Kerala", "PLANNED")];
        render(<Harness />);
        const input = screen.getByLabelText("City");
        fireEvent.focus(input);
        await waitFor(() => expect(backend.calls).toContain("/geo/cities?stage=LAUNCHED&sort=population&pageSize=20"));

        fireEvent.change(input, { target: { value: "pun" } });
        expect(screen.getByTestId("value")).toHaveTextContent("pun");
        await vi.advanceTimersByTimeAsync(350);
        await waitFor(() => expect(backend.calls).toContain("/geo/cities?q=pun&sort=population&pageSize=20"));

        const list = await screen.findByRole("listbox", { name: "Matching cities" });
        expect(within(list).getByRole("group", { name: "Maharashtra" })).toBeInTheDocument();
        expect(within(list).getByRole("group", { name: "Kerala" })).toBeInTheDocument();
        expect(within(list).getByRole("option", { name: /Pune/ })).toHaveTextContent("Launched");
        expect(within(list).getByRole("option", { name: /Punalur/ })).toHaveTextContent("Planned");

        fireEvent.click(within(list).getByRole("option", { name: /Punalur/ }));
        expect(screen.getByTestId("value")).toHaveTextContent("Punalur");
        expect(screen.getByTestId("picked")).toHaveTextContent("punalur");
        expect(screen.queryByRole("listbox")).toBeNull();
    });

    it("keeps a name the catalogue lacks as typed, and says so", async () => {
        backend.items = [];
        render(<Harness />);
        const input = screen.getByLabelText("City");
        fireEvent.change(input, { target: { value: "Navi Mumbai" } });
        await vi.advanceTimersByTimeAsync(350);
        const list = await screen.findByRole("listbox", { name: "Matching cities" });
        await waitFor(() => expect(list).toHaveTextContent("No catalogued city matches “Navi Mumbai” — the name is kept as typed."));
        expect(screen.getByTestId("value")).toHaveTextContent("Navi Mumbai");
        expect(screen.getByTestId("picked")).toHaveTextContent("-");
    });

    it("groups the rows under their state in the order they arrived", () => {
        const groups = groupByState([city("a", "A", "Kerala", "LAUNCHED"), city("b", "B", "Goa", "LAUNCHED"), city("c", "C", "Kerala", "SEEDING")]);
        expect(groups.map(([state, rows]) => [state, rows.map((row) => row.slug)])).toEqual([
            ["Kerala", ["a", "c"]],
            ["Goa", ["b"]],
        ]);
    });
});
