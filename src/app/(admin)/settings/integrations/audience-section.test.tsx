import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AudienceSettings } from "@/services/integrations";

/**
 * Y-C — the audience card on Integrations.
 *
 * What this pins: the two vendor switches with each vendor's configured
 * state and, when on, its credentials; the policy rows — a primary, a
 * fallback switch, the footfall blend — and the one-line preview that
 * follows them; and the PUT: `{ section: 'audience', patch }` with the set
 * whole when it moved, the policy as a per-key diff, a key only when
 * typed, never the legacy `provider`. A legacy one-vendor row (no
 * `providers`) reads as a one-element set.
 *
 * AC-C over AC-B2: the GeoIQ variable map is edited — the rows come from
 * `GET /integrations/audience/fields`, the affinity group is an
 * add-a-row list, and the PUT carries `geoiqVariables` as ONE record
 * with the typed ids and without blanks (only when something in it
 * moved). Each vendor's Test button POSTs `/integrations/audience/test`
 * and every verdict kind — no key, unreachable, refused, answered,
 * nothing answered — is printed inline from the backend's fixture, the
 * vendor's own sentence verbatim.
 */

const { backend, toast } = vi.hoisted(() => {
    const toast = { success: vi.fn(), error: vi.fn() };
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        answer: {} as unknown,
        /** Per-route answers (`"GET /integrations/audience/fields"`); the fields catalogue is set by `reset` so every mount can draw the map. */
        routes: {} as Record<string, unknown>,
        reset() {
            this.calls = [];
            this.answer = {};
            this.routes = {
                "GET /integrations/audience/fields": {
                    fields: [
                        { field: "footfall.daily", group: "footfall", label: "Daily footfall", required: true },
                        { field: "age.18_24", group: "age", label: "Age 18–24", required: false },
                        { field: "age.25_34", group: "age", label: "Age 25–34", required: false },
                        { field: "gender.male", group: "gender", label: "Male", required: false },
                        { field: "gender.female", group: "gender", label: "Female", required: false },
                        { field: "income.affluent", group: "income", label: "Income: affluent", required: false },
                    ],
                    groups: [
                        { group: "footfall", label: "Footfall", freeForm: false },
                        { group: "age", label: "Age bands (shares)", freeForm: false },
                        { group: "gender", label: "Gender split (shares)", freeForm: false },
                        { group: "income", label: "Household income bands (shares)", freeForm: false },
                        { group: "affinity", label: "Affinities (POI counts or shares)", freeForm: true, pattern: "affinity.<name>" },
                    ],
                    pattern: "^(footfall\\.daily|age\\.[a-z0-9_]+|gender\\.(male|female|other)|income\\.[a-z0-9_]+|affinity\\.[a-z0-9_]+)$",
                    testPoint: { lat: 12.9755, lng: 77.6068, label: "MG Road, Bengaluru" },
                },
            };
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
        const key = `${method} ${path}`;
        if (key in backend.routes) {
            const answer = backend.routes[key];
            if (answer instanceof Error) throw answer;
            return answer;
        }
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

import { AudienceSection } from "./audience-section";
import type { AudienceVendorTest } from "@/services/audience";

const stored = (over: Partial<AudienceSettings> = {}): AudienceSettings => ({
    provider: "GEOIQ",
    providers: ["GEOIQ"],
    policy: {
        footfall: { primary: "AZIRA", fallback: true, blend: "AVERAGE" },
        demographics: { primary: "GEOIQ", fallback: true },
        affinities: { primary: "GEOIQ", fallback: true },
    },
    geoiqApiKey: "••••ab12",
    geoiqBaseUrl: "https://api.geoiq.io",
    geoiqVariables: { "footfall.daily": "v_1", "gender.female": "v_2" },
    aziraApiKey: null,
    aziraClientId: null,
    aziraBaseUrl: null,
    catchmentRadiusM: 500,
    ...over,
});

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
    toast.error.mockReset();
});

/** Opens a Radix select by keyboard (jsdom has no pointer) and picks the option. */
async function pick(trigger: HTMLElement, option: string) {
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: option }));
}

describe("the card", () => {
    it("draws each vendor with its configured state, the credentials of the ones that are on, and the preview", async () => {
        render(<AudienceSection stored={stored()} onChanged={() => {}} />);
        const geoiq = screen.getByTestId("vendor-GEOIQ");
        const azira = screen.getByTestId("vendor-AZIRA");
        expect(within(geoiq).getByRole("switch", { name: "GeoIQ on" })).toBeChecked();
        expect(within(azira).getByRole("switch", { name: "Azira on" })).not.toBeChecked();
        expect(geoiq).toHaveTextContent("Configured");
        expect(azira).toHaveTextContent("No API key");
        /* The credentials block follows the switch. */
        expect(within(geoiq).getByLabelText("GeoIQ API key")).toBeInTheDocument();
        expect(within(geoiq).getByLabelText("GeoIQ base URL")).toHaveAttribute("placeholder", "https://dataserving-in.geoiq.io/production/v1.0");
        await waitFor(() => expect(within(geoiq).getByLabelText(/Daily footfall/)).toHaveValue("v_1"));
        expect(geoiq).toHaveTextContent("footfall.daily");
        expect(within(azira).queryByLabelText("Azira API key")).toBeNull();

        expect(screen.getByTestId("policy-preview")).toHaveTextContent("Footfall: GeoIQ (Azira is off) · Demographics: GeoIQ alone · Affinities: GeoIQ alone");
        expect(screen.getByRole("button", { name: "Save audience data" })).toBeDisabled();
    });

    it("reads a legacy one-vendor row as a one-element set", () => {
        render(<AudienceSection stored={stored({ provider: "AZIRA", providers: undefined, policy: undefined, aziraApiKey: "••••zz99", aziraBaseUrl: "https://api.azira.example" })} onChanged={() => {}} />);
        expect(screen.getByRole("switch", { name: "Azira on" })).toBeChecked();
        expect(screen.getByRole("switch", { name: "GeoIQ on" })).not.toBeChecked();
        expect(screen.getByTestId("vendor-AZIRA")).toHaveTextContent("Configured");
        expect(screen.getByTestId("policy-preview")).toHaveTextContent("Footfall: Azira alone");
    });

    it("PUTs the set whole, the policy as a diff and a typed key — never the legacy provider", async () => {
        backend.answer = { audience: stored() };
        const onChanged = vi.fn();
        render(<AudienceSection stored={stored()} onChanged={onChanged} />);

        fireEvent.click(screen.getByRole("switch", { name: "Azira on" }));
        const azira = screen.getByTestId("vendor-AZIRA");
        expect(azira).toHaveTextContent("No API key");
        fireEvent.change(within(azira).getByLabelText("Azira API key"), { target: { value: "az-live-1" } });
        fireEvent.change(within(azira).getByLabelText("Azira base URL"), { target: { value: "https://api.azira.example" } });
        expect(screen.getByTestId("policy-preview")).toHaveTextContent("Footfall: Azira, averaged with GeoIQ when both answer · Demographics: GeoIQ, Azira as fallback");

        fireEvent.click(screen.getByRole("switch", { name: "Demographics fallback" }));
        await pick(screen.getByRole("combobox", { name: "When both answer" }), "Primary's figure only");
        await pick(within(screen.getByTestId("policy-footfall")).getByRole("combobox", { name: "Primary" }), "GeoIQ");
        expect(screen.getByTestId("policy-preview")).toHaveTextContent("Footfall: GeoIQ, Azira as fallback · Demographics: GeoIQ only · Affinities: GeoIQ, Azira as fallback");

        fireEvent.click(screen.getByRole("button", { name: "Save audience data" }));
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.calls.filter((call) => call.method === "PUT")).toEqual([
            {
                method: "PUT",
                path: "/integrations",
                body: {
                    section: "audience",
                    patch: {
                        aziraApiKey: "az-live-1",
                        aziraBaseUrl: "https://api.azira.example",
                        providers: ["GEOIQ", "AZIRA"],
                        policy: { footfall: { primary: "GEOIQ", blend: "PRIMARY" }, demographics: { fallback: false } },
                    },
                },
            },
        ]);
        expect(toast.success).toHaveBeenCalledWith("Audience data saved", expect.anything());
    });

    it("refuses a radius outside 50–5,000 and sends an empty set when both switches go off", async () => {
        backend.answer = { audience: stored({ providers: [] }) };
        render(<AudienceSection stored={stored()} onChanged={() => {}} />);
        fireEvent.change(screen.getByLabelText("Catchment radius (m)"), { target: { value: "12" } });
        expect(screen.getByRole("button", { name: "Save audience data" })).toBeDisabled();
        fireEvent.change(screen.getByLabelText("Catchment radius (m)"), { target: { value: "500" } });

        fireEvent.click(screen.getByRole("switch", { name: "GeoIQ on" }));
        expect(screen.getByTestId("policy-preview")).toHaveTextContent("No vendor is on");
        fireEvent.click(screen.getByRole("button", { name: "Save audience data" }));
        await waitFor(() => expect(backend.calls.filter((call) => call.method === "PUT")).toHaveLength(1));
        expect(backend.calls.find((call) => call.method === "PUT")?.body).toEqual({ section: "audience", patch: { providers: [] } });
    });
});

/** A GeoIQ verdict as `POST /integrations/audience/test` answers it, overridable per case. */
const verdict = (over: Partial<AudienceVendorTest> = {}): AudienceVendorTest => ({
    vendor: "GEOIQ",
    keyPresent: true,
    variablesMapped: 2,
    reachable: true,
    authorized: true,
    status: 200,
    message: "",
    fieldsAnswered: ["footfall.daily", "gender.female"],
    fieldsMissing: [],
    sample: { footfallDaily: 18250 },
    ...over,
});

const puts = () => backend.calls.filter((call) => call.method === "PUT");

describe("the GeoIQ variable map (AC-C)", () => {
    it("draws one row per field from the fields read, grouped, the stored ids filled in, and says where the ids come from", async () => {
        render(<AudienceSection stored={stored()} onChanged={() => {}} />);
        expect(backend.calls[0]).toEqual({ method: "GET", path: "/integrations/audience/fields", body: undefined });
        const map = await screen.findByTestId("geoiq-variable-map");
        await waitFor(() => expect(within(map).getByLabelText(/Daily footfall/)).toHaveValue("v_1"));
        expect(within(map).getByLabelText("Female")).toHaveValue("v_2");
        expect(within(map).getByLabelText("Male")).toHaveValue("");
        expect(within(map).getByLabelText("Male")).toHaveAttribute("placeholder", "unmapped");
        expect(within(map).getByLabelText(/Age 18–24/)).toHaveAttribute("id", "geoiq-var-age.18_24");
        for (const group of ["footfall", "age", "gender", "income", "affinity"]) expect(within(map).getByTestId(`geoiq-group-${group}`)).toBeInTheDocument();
        expect(within(map).getByTestId("geoiq-group-affinity")).toHaveTextContent("No affinities mapped.");
        const where = within(map).getByTestId("geoiq-where-ids");
        expect(where).toHaveTextContent("Where to find ids");
        expect(within(where).getByRole("link", { name: "catalog.geoiq.io" })).toHaveAttribute("href", "https://catalog.geoiq.io");
        /* Nothing moved: nothing to save. */
        expect(screen.getByRole("button", { name: "Save audience data" })).toBeDisabled();
    });

    it("PUTs geoiqVariables as one record — the typed ids, the affinities as affinity.<name>, never a blank", async () => {
        backend.answer = { audience: stored() };
        const onChanged = vi.fn();
        render(<AudienceSection stored={stored()} onChanged={onChanged} />);
        const map = await screen.findByTestId("geoiq-variable-map");
        await waitFor(() => expect(within(map).getByLabelText(/Daily footfall/)).toHaveValue("v_1"));

        fireEvent.change(within(map).getByLabelText("Male"), { target: { value: "  v_9 " } });
        /* Emptied: unmapped, and left out of the record. */
        fireEvent.change(within(map).getByLabelText("Female"), { target: { value: "" } });
        fireEvent.click(within(map).getByRole("button", { name: "Add affinity" }));
        fireEvent.click(within(map).getByRole("button", { name: "Add affinity" }));
        /* A half-filled row is refused before the round trip. */
        fireEvent.change(within(map).getByLabelText("Affinity 1 name"), { target: { value: "Fitness" } });
        expect(screen.getByTestId("audience-problem")).toHaveTextContent('The affinity "fitness" needs a catalogue id, or remove the row.');
        expect(screen.getByRole("button", { name: "Save audience data" })).toBeDisabled();
        fireEvent.change(within(map).getByLabelText("Affinity 1 id"), { target: { value: "v_aff_1" } });
        /* The second row, left blank, is simply not a row. */
        expect(screen.queryByTestId("audience-problem")).toBeNull();
        fireEvent.change(within(map).getByLabelText("Affinity 2 name"), { target: { value: "bad name" } });
        fireEvent.change(within(map).getByLabelText("Affinity 2 id"), { target: { value: "v_x" } });
        expect(screen.getByTestId("audience-problem")).toHaveTextContent("is not an affinity name");
        fireEvent.click(within(map).getByRole("button", { name: "Remove affinity 2" }));
        expect(screen.queryByTestId("audience-problem")).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "Save audience data" }));
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(puts()).toEqual([
            {
                method: "PUT",
                path: "/integrations",
                body: {
                    section: "audience",
                    patch: { geoiqVariables: { "footfall.daily": "v_1", "gender.male": "v_9", "affinity.fitness": "v_aff_1" } },
                },
            },
        ]);
    });

    it("keeps a stored affinity and an off-catalogue field as rows, and sends nothing when the map is re-typed the same", async () => {
        render(<AudienceSection stored={stored({ geoiqVariables: { "footfall.daily": "v_1", "age.60_plus": "v_60", "affinity.travel": "v_t" } })} onChanged={() => {}} />);
        const map = await screen.findByTestId("geoiq-variable-map");
        await waitFor(() => expect(within(map).getByLabelText("age.60_plus")).toHaveValue("v_60"));
        expect(within(map).getByLabelText("Affinity 1 name")).toHaveValue("travel");
        expect(within(map).getByLabelText("Affinity 1 id")).toHaveValue("v_t");
        fireEvent.change(within(map).getByLabelText(/Daily footfall/), { target: { value: "v_1 " } });
        expect(screen.getByRole("button", { name: "Save audience data" })).toBeDisabled();
    });

    it("links the 'No catalogue id mapped' badge to the rows", async () => {
        render(<AudienceSection stored={stored({ geoiqVariables: {} })} onChanged={() => {}} />);
        const geoiq = screen.getByTestId("vendor-GEOIQ");
        const link = within(geoiq).getByTestId("geoiq-map-link");
        expect(link).toHaveTextContent("No catalogue id mapped");
        expect(link).toHaveAttribute("href", "#audience-variable-map");
        const map = await screen.findByTestId("geoiq-variable-map");
        await waitFor(() => expect(within(map).getByLabelText(/Daily footfall/)).toBeInTheDocument());
        fireEvent.click(link);
        expect(within(map).getByLabelText(/Daily footfall/)).toHaveFocus();
    });

    it("says so when the fields read fails, and still saves the rest of the card", async () => {
        backend.routes["GET /integrations/audience/fields"] = new Error("Route not found");
        render(<AudienceSection stored={stored()} onChanged={() => {}} />);
        await waitFor(() => expect(screen.getByTestId("geoiq-fields-failed")).toHaveTextContent("Route not found"));
        fireEvent.change(screen.getByLabelText("Catchment radius (m)"), { target: { value: "750" } });
        fireEvent.click(screen.getByRole("button", { name: "Save audience data" }));
        await waitFor(() => expect(puts()).toHaveLength(1));
        expect(puts()[0]?.body).toEqual({ section: "audience", patch: { catchmentRadiusM: 750 } });
    });
});

describe("the vendor test (AC-C)", () => {
    it("POSTs the vendor and prints a working verdict: fields answered, the sample daily footfall", async () => {
        backend.routes["POST /integrations/audience/test"] = verdict({ fieldsMissing: ["age.18_24"] });
        render(<AudienceSection stored={stored()} onChanged={() => {}} />);
        const geoiq = screen.getByTestId("vendor-GEOIQ");
        fireEvent.click(within(geoiq).getByRole("button", { name: "Test GeoIQ" }));
        const box = await screen.findByTestId("audience-verdict-GEOIQ");
        expect(backend.calls.find((call) => call.method === "POST")).toEqual({ method: "POST", path: "/integrations/audience/test", body: { vendor: "GEOIQ" } });
        expect(within(box).getByText("Working")).toBeInTheDocument();
        expect(box).toHaveTextContent("reachable: yes · authorised: yes · status 200");
        expect(box).toHaveTextContent("GeoIQ answered 2 of 3 fields asked.");
        expect(box).toHaveTextContent("footfall.daily, gender.female");
        expect(box).toHaveTextContent("age.18_24");
        expect(box).toHaveTextContent("Sample daily footfall");
        expect(box).toHaveTextContent("18,250");
    });

    it("prints a refusal plainly, with GeoIQ's own sentence verbatim", async () => {
        backend.routes["POST /integrations/audience/test"] = verdict({
            authorized: false,
            status: 401,
            message: "You are not authorized to access this API. Please contact GeoIQ Administrator for access.",
            fieldsAnswered: [],
            fieldsMissing: ["footfall.daily", "gender.female"],
            sample: {},
        });
        render(<AudienceSection stored={stored()} onChanged={() => {}} />);
        fireEvent.click(screen.getByRole("button", { name: "Test GeoIQ" }));
        const box = await screen.findByTestId("audience-verdict-GEOIQ");
        expect(within(box).getByText("Not authorised")).toBeInTheDocument();
        expect(box).toHaveTextContent("reachable: yes · authorised: no · status 401");
        expect(box).toHaveTextContent("The key is stored but GeoIQ refuses it — ask GeoIQ to enable the Data API on this key.");
        expect(box).toHaveTextContent("You are not authorized to access this API. Please contact GeoIQ Administrator for access.");
        /* A refusal has no field table. */
        expect(box).not.toHaveTextContent("Sample daily footfall");
    });

    it("prints an unreachable host, an empty answer, and a missing key each in their own words", async () => {
        backend.routes["POST /integrations/audience/test"] = verdict({ reachable: false, authorized: false, status: null, message: "getaddrinfo ENOTFOUND dataserving.geoiq.io", fieldsAnswered: [], fieldsMissing: ["footfall.daily"], sample: {} });
        const { unmount } = render(<AudienceSection stored={stored()} onChanged={() => {}} />);
        fireEvent.click(screen.getByRole("button", { name: "Test GeoIQ" }));
        let box = await screen.findByTestId("audience-verdict-GEOIQ");
        expect(within(box).getByText("Unreachable")).toBeInTheDocument();
        expect(box).toHaveTextContent("GeoIQ could not be reached from the backend");
        expect(box).toHaveTextContent("getaddrinfo ENOTFOUND dataserving.geoiq.io");
        expect(box).not.toHaveTextContent("status");
        unmount();
        backend.reset();

        backend.routes["POST /integrations/audience/test"] = verdict({ fieldsAnswered: [], fieldsMissing: ["footfall.daily", "gender.female"], sample: {} });
        const second = render(<AudienceSection stored={stored()} onChanged={() => {}} />);
        fireEvent.click(screen.getByRole("button", { name: "Test GeoIQ" }));
        box = await screen.findByTestId("audience-verdict-GEOIQ");
        expect(within(box).getByText("Reached, nothing answered")).toBeInTheDocument();
        expect(box).toHaveTextContent("answered none of the fields asked");
        expect(box).toHaveTextContent("Missing");
        expect(box).toHaveTextContent("footfall.daily, gender.female");
        second.unmount();
        backend.reset();

        /* No key stored: the button is disabled and says why — the test spends the stored key. */
        render(<AudienceSection stored={stored({ geoiqApiKey: null })} onChanged={() => {}} />);
        const geoiq = screen.getByTestId("vendor-GEOIQ");
        expect(within(geoiq).getByRole("button", { name: "Test GeoIQ" })).toBeDisabled();
        expect(geoiq).toHaveTextContent("Save a key first — the test spends the stored one.");
    });

    it("tests Azira under its own block", async () => {
        backend.routes["POST /integrations/audience/test"] = verdict({ vendor: "AZIRA", variablesMapped: 0, fieldsAnswered: ["footfall", "demographics"], fieldsMissing: [], sample: { footfallDaily: 20400 } });
        render(<AudienceSection stored={stored({ providers: ["GEOIQ", "AZIRA"], aziraApiKey: "••••zz99", aziraBaseUrl: "https://api.azira.example" })} onChanged={() => {}} />);
        const azira = screen.getByTestId("vendor-AZIRA");
        fireEvent.click(within(azira).getByRole("button", { name: "Test Azira" }));
        const box = await within(azira).findByTestId("audience-verdict-AZIRA");
        expect(backend.calls.find((call) => call.method === "POST")?.body).toEqual({ vendor: "AZIRA" });
        expect(box).toHaveTextContent("Azira answered 2 of 2 fields asked.");
        expect(box).toHaveTextContent("20,400");
    });
});
