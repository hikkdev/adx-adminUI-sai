import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { GeoCity, GeoUnresolved } from "@/services/geo";

/**
 * X-C — the Unresolved spellings card on Geographies › Overview.
 *
 * What this pins: the card reads `GET /geo/unresolved` and prints each
 * typed string with its rows and where they are; "Add as alias of…" picks
 * a catalogue city in the combobox and sends pricing's alias PATCH with
 * the spelling appended to what the city already answers to; "Add as a
 * city" opens the add-city form with the name filled and posts
 * `POST /geo/cities`; both re-read the card; and Re-resolve (X-L / Y-C)
 * runs `POST /geo/backfill-city-keys`, prints the per-table report and
 * re-reads, with a 409 from the lock shown as sent.
 */

const { backend, toast } = vi.hoisted(() => {
    const toast = { success: vi.fn(), error: vi.fn(), loading: vi.fn() };
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        answers: {} as Record<string, unknown>,
        reset() {
            this.calls = [];
            this.answers = {};
        },
    };
    return { backend, toast };
});

vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/auth", () => ({
    useAuth: () => ({ user: { id: "usr_admin", name: "Priya", roles: ["ADMIN"] }, loading: false, can: () => true }),
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        const key = `${method} ${path.split("?")[0]}`;
        if (!(key in backend.answers)) throw new Error(`no answer for ${key}`);
        const answer = backend.answers[key];
        if (answer instanceof Error) throw answer;
        return answer;
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

import { aliasesWith } from "./alias-of-dialog";
import { UnresolvedCard, tablesSentence, unresolvedSummary } from "./unresolved-card";

const bengaluru: GeoCity = {
    id: "city_blr",
    slug: "bengaluru",
    name: "Bengaluru",
    state: "Karnataka",
    aliases: ["Bangalore"],
    isActive: true,
    stateId: "st_19",
    districtId: null,
    latitude: 12.97,
    longitude: 77.59,
    population: 8_443_675,
    kind: "STATE_CAPITAL",
    geonameId: 1277333,
    source: "GEONAMES",
    stage: "LAUNCHED",
    switches: { supplyIntake: true, publishing: true, demand: true, agentOnboarding: true, printPartners: true, leadFeeds: true },
    launchedAt: "2026-09-01T00:00:00.000Z",
    pausedAt: null,
    withdrawnAt: null,
    rolloutNote: null,
    geoState: { code: "19", name: "Karnataka" },
    geoDistrict: null,
};

const unresolved: GeoUnresolved = {
    items: [
        { city: "Blore", total: 7, tables: { publishers: 3, leads: 4 } },
        { city: "Navi Mumbai", total: 2, tables: { listings: 2 } },
    ],
    total: 2,
    rows: 9,
};

const cityPage = (items: GeoCity[]) => ({ items, total: items.length, page: 1, pageSize: 20, counts: {} });
const states = [{ id: "st_19", code: "19", name: "Karnataka", latitude: null, longitude: null, counts: { PLANNED: 1, SEEDING: 0, LAUNCHED: 1, PAUSED: 0, WITHDRAWN: 0 }, cities: 2 }];

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
    toast.error.mockReset();
    backend.answers["GET /geo/unresolved"] = unresolved;
    backend.answers["GET /geo/states"] = states;
});

const readsOfUnresolved = () => backend.calls.filter((call) => call.method === "GET" && call.path === "/geo/unresolved").length;

describe("the helpers", () => {
    it("prints where the rows are in the tables' order and counts the card in one line", () => {
        expect(tablesSentence({ leads: 4, publishers: 3, campaigns: 0 })).toBe("Publishers 3 · Leads 4");
        expect(unresolvedSummary({ total: 2, rows: 9 })).toBe("9 rows under 2 spellings no catalogue city answers to.");
        expect(unresolvedSummary({ total: 1, rows: 1 })).toBe("1 row under 1 spelling no catalogue city answers to.");
        expect(unresolvedSummary({ total: 0, rows: 0 })).toBe("Every typed city resolves to a catalogue city.");
    });

    it("appends the spelling to the city's aliases, and refuses one the city already answers to", () => {
        expect(aliasesWith(bengaluru, "Blore")).toEqual(["Bangalore", "Blore"]);
        expect(aliasesWith(bengaluru, "bangalore")).toBeNull();
        expect(aliasesWith(bengaluru, "BENGALURU")).toBeNull();
        expect(aliasesWith(bengaluru, "  ")).toBeNull();
    });
});

describe("the card", () => {
    it("lists each typed string with its rows and where they are, and offers Re-resolve", async () => {
        render(<UnresolvedCard nonce={0} onChanged={() => {}} />);
        const card = screen.getByTestId("unresolved-spellings");
        await waitFor(() => expect(card).toHaveTextContent("9 rows under 2 spellings"));
        expect(card).toHaveTextContent("Blore");
        expect(card).toHaveTextContent("Publishers 3 · Leads 4");
        expect(card).toHaveTextContent("Navi Mumbai");
        expect(card).not.toHaveTextContent("npm run backfill:city-keys");
        expect(within(card).getByRole("button", { name: "Re-resolve every null city key" })).toBeEnabled();
        expect(within(card).getAllByRole("button", { name: "Add as alias of…" })).toHaveLength(2);
        expect(within(card).getAllByRole("button", { name: "Add as a city" })).toHaveLength(2);
    });

    it("Re-resolve POSTs the backfill, prints the per-table report and re-reads", async () => {
        backend.answers["POST /geo/backfill-city-keys"] = {
            tables: [
                { table: "publishers", resolved: 3, stillNull: 0 },
                { table: "advertisers", resolved: 0, stillNull: 0 },
                { table: "agents", resolved: 0, stillNull: 0 },
                { table: "printPartners", resolved: 0, stillNull: 0 },
                { table: "listings", resolved: 2, stillNull: 0 },
                { table: "leads", resolved: 0, stillNull: 4 },
                { table: "fieldVisits", resolved: 0, stillNull: 0 },
                { table: "campaigns", resolved: 0, stillNull: 0 },
            ],
        };
        const onChanged = vi.fn();
        render(<UnresolvedCard nonce={0} onChanged={onChanged} />);
        await waitFor(() => expect(screen.getByText("Blore")).toBeInTheDocument());

        fireEvent.click(screen.getByRole("button", { name: "Re-resolve every null city key" }));
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.calls).toContainEqual({ method: "POST", path: "/geo/backfill-city-keys", body: undefined });
        const report = screen.getByTestId("backfill-report");
        expect(report).toHaveTextContent("Last re-resolve: 5 rows keyed, 4 still typed");
        expect(report).toHaveTextContent("Leads");
        expect(report).toHaveTextContent("0 keyed · 4 still typed");
        expect(toast.success).toHaveBeenCalledWith("Re-resolved: 5 rows keyed, 4 still typed", {
            description: "Publishers 3 keyed, 0 typed · Listings 2 keyed, 0 typed · Leads 0 keyed, 4 typed",
        });
        await waitFor(() => expect(readsOfUnresolved()).toBe(2));
    });

    it("shows the lock's 409 as sent and keeps the card", async () => {
        backend.answers["POST /geo/backfill-city-keys"] = new Error("A city key backfill is already running. Wait for it to finish and reload.");
        render(<UnresolvedCard nonce={0} onChanged={() => {}} />);
        await waitFor(() => expect(screen.getByText("Blore")).toBeInTheDocument());
        fireEvent.click(screen.getByRole("button", { name: "Re-resolve every null city key" }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("A city key backfill is already running. Wait for it to finish and reload."));
        expect(screen.queryByTestId("backfill-report")).toBeNull();
        expect(readsOfUnresolved()).toBe(1);
    });

    it("'Add as alias of…' picks a city and PATCHes its aliases with the spelling appended, then re-reads", async () => {
        backend.answers["GET /geo/cities"] = cityPage([bengaluru]);
        backend.answers["PATCH /pricing/cities/bengaluru"] = { slug: "bengaluru", name: "Bengaluru", state: "Karnataka", aliases: ["Bangalore", "Blore"], isActive: true };
        const onChanged = vi.fn();
        render(<UnresolvedCard nonce={0} onChanged={onChanged} />);
        await waitFor(() => expect(screen.getByText("Blore")).toBeInTheDocument());

        fireEvent.click(screen.getAllByRole("button", { name: "Add as alias of…" })[0]);
        const dialog = await screen.findByRole("dialog");
        expect(dialog).toHaveTextContent("“Blore” means a catalogue city");
        expect(within(dialog).getByRole("button", { name: "Save alias" })).toBeDisabled();

        const field = within(dialog).getByRole("combobox", { name: "City" });
        fireEvent.focus(field);
        fireEvent.change(field, { target: { value: "Beng" } });
        const option = await within(dialog).findByRole("option", { name: /Bengaluru/ });
        fireEvent.click(option);
        expect(dialog).toHaveTextContent("Bengaluru, Karnataka — 1 other spelling today.");

        const save = within(dialog).getByRole("button", { name: "Save alias" });
        expect(save).toBeEnabled();
        fireEvent.click(save);
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.calls).toContainEqual({ method: "PATCH", path: "/pricing/cities/bengaluru", body: { aliases: ["Bangalore", "Blore"] } });
        expect(toast.success).toHaveBeenCalledWith('"Blore" now resolves to Bengaluru', expect.anything());
        await waitFor(() => expect(readsOfUnresolved()).toBe(2));
    });

    it("'Add as a city' opens the add-city form with the name filled and POSTs it, then re-reads", async () => {
        backend.answers["POST /geo/cities"] = { ...bengaluru, id: "city_nm", slug: "navi-mumbai", name: "Navi Mumbai", stage: "PLANNED", source: "MANUAL" };
        const onChanged = vi.fn();
        render(<UnresolvedCard nonce={0} onChanged={onChanged} />);
        await waitFor(() => expect(screen.getByText("Navi Mumbai")).toBeInTheDocument());

        fireEvent.click(screen.getAllByRole("button", { name: "Add as a city" })[1]);
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByLabelText("Name")).toHaveValue("Navi Mumbai");
        /* No state or point yet: the form is not one the schema takes. */
        expect(within(dialog).getByRole("button", { name: "Add city" })).toBeDisabled();

        fireEvent.change(within(dialog).getByLabelText("Latitude"), { target: { value: "19.0330" } });
        fireEvent.change(within(dialog).getByLabelText("Longitude"), { target: { value: "73.0297" } });
        fireEvent.keyDown(within(dialog).getByRole("combobox", { name: "State" }), { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: "Karnataka" }));
        const add = within(dialog).getByRole("button", { name: "Add city" });
        await waitFor(() => expect(add).toBeEnabled());
        fireEvent.click(add);
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.calls).toContainEqual({ method: "POST", path: "/geo/cities", body: { name: "Navi Mumbai", stateCode: "19", lat: 19.033, lng: 73.0297 } });
        await waitFor(() => expect(readsOfUnresolved()).toBe(2));
    });
});
