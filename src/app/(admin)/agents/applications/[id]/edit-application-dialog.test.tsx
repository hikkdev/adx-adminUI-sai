import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Onboarding addresses (the owner, 1 Oct 2026) on the desk's copy of the
 * applicant's details. What is pinned: no map and no coordinate inputs; the
 * current address is found with the "Find the address" bar — a pick fills
 * the line, the city, the state and the PIN and keeps the pin silently,
 * which the save sends as `currentLatitude` / `currentLongitude` beside
 * `currentPostalCode`; the permanent address has its own bar that fills its
 * line and nothing else (no pin, and the city and state stay the current
 * ones); and with the vendor silent the typed addresses still save.
 */

const backend = vi.hoisted(() => ({
    calls: [] as { method: string; path: string; body?: unknown }[],
    /* The geo answers, by path prefix; a geo path with none is the vendor saying nothing. */
    geo: new Map<string, unknown>(),
    reset() {
        this.calls = [];
        this.geo.clear();
    },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        if (method === "GET" && path.startsWith("/geo/")) {
            const key = [...backend.geo.keys()].find((prefix) => path.startsWith(prefix));
            if (key === undefined) throw new actual.ApiError(503, "MAPS_UNAVAILABLE", "The maps vendor did not answer.");
            return backend.geo.get(key);
        }
        if (method === "PATCH") return view;
        return null;
    };
    return {
        ...actual,
        api: {
            get: (path: string) => wrap("GET", path),
            post: (path: string, body?: unknown) => wrap("POST", path, body),
            patch: (path: string, body?: unknown) => wrap("PATCH", path, body),
        },
    };
});

// The catalogue's city picker, stubbed to a plain box: the dialog's contract with it is the value.
vi.mock("@/components/adx/city-combobox", () => ({
    CityCombobox: ({ id, value, onChange }: { id: string; value: string; onChange: (city: string) => void }) => <input id={id} value={value} onChange={(event) => onChange(event.target.value)} />,
}));

import type { ApplicationView } from "@/services/agent-applications";
import { EditApplicationDialog } from "./edit-application-dialog";

const view = {
    agent: { id: "agt_1", userId: "usr_1", displayId: "AGT-0110-2601", stage: "PROFILE", side: "PUBLISHER" },
    person: { name: "Ravi Kumar", mobile: "+919845012345", email: null, dateOfBirth: null, gender: null },
    profile: {
        city: "Pune",
        state: "Maharashtra",
        languages: [],
        vehicleType: null,
        vehicleNumber: null,
        currentAddress: null,
        currentLatitude: null,
        currentLongitude: null,
        permanentAddress: null,
        emergencyContactName: null,
        emergencyContactRelation: null,
        emergencyContactPhone: null,
        highestEducation: null,
        salesExperienceYears: null,
        industries: [],
        noticePeriodDays: null,
        territory: null,
        homeZone: null,
    },
    educations: [],
    employments: [],
    references: [],
    platformExperiences: [],
    ladder: { stage: "PROFILE", steps: [], canSubmit: false, nextStep: null },
} as unknown as ApplicationView;

const BANER = { formattedAddress: "14, Baner Road, Pune, Maharashtra 411045", latitude: 18.559, longitude: 73.7868, placeId: "pl_b", city: "Pune", state: "Maharashtra", postalCode: "411045", name: "Baner Road" };
const NAGPUR = { formattedAddress: "7, Civil Lines, Nagpur, Maharashtra 440001", latitude: 21.15, longitude: 79.08, placeId: "pl_n", city: "Nagpur", state: "Maharashtra", postalCode: "440001", name: "Civil Lines" };

const value = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;
const patches = () => backend.calls.filter((call) => call.method === "PATCH");

beforeEach(() => backend.reset());

describe("EditApplicationDialog — the addresses", () => {
    it("draws the bar and the boxes, and no map or coordinate inputs", () => {
        render(<EditApplicationDialog view={view} open onOpenChange={() => {}} onSaved={() => {}} />);
        expect((screen.getByLabelText("Find the address") as HTMLInputElement).placeholder).toBe("Type a building, street or landmark");
        expect((screen.getByLabelText("Current address") as HTMLInputElement).placeholder).toBe("Building, street, area");
        expect((screen.getByLabelText("PIN code") as HTMLInputElement).placeholder).toBe("Six digits — 560001");
        expect(screen.queryByTestId("pin-picker")).not.toBeInTheDocument();
        expect(screen.queryByTestId("pin-picker-map")).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/latitude/i)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/longitude/i)).not.toBeInTheDocument();
    });

    it("the current address: a pick fills the line, the city, the state and the PIN, and the pin rides the save unseen", async () => {
        backend.geo.set("/geo/autocomplete", [{ placeId: "pl_b", description: "Baner Road, Pune", mainText: "Baner Road", secondaryText: "Pune" }]);
        backend.geo.set("/geo/places/pl_b", BANER);
        const onSaved = vi.fn();
        render(<EditApplicationDialog view={{ ...view, profile: { ...view.profile, city: "", state: "" } }} open onOpenChange={() => {}} onSaved={onSaved} />);
        const search = screen.getByLabelText("Find the address") as HTMLInputElement;

        fireEvent.focus(search);
        fireEvent.change(search, { target: { value: "Baner Road" } });
        fireEvent.click(await screen.findByRole("option"));
        await waitFor(() => expect(value("Current address")).toBe(BANER.formattedAddress));
        expect(value("City")).toBe("Pune");
        expect(value("State")).toBe("Maharashtra");
        expect(value("PIN code")).toBe("411045");
        expect(screen.queryByDisplayValue("18.559")).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Save details" }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(patches()[0]).toMatchObject({
            path: "/agents/agt_1/application/profile",
            body: { currentAddress: BANER.formattedAddress, currentPostalCode: "411045", currentLatitude: 18.559, currentLongitude: 73.7868, city: "Pune", state: "Maharashtra", permanentAddress: null },
        });
    });

    it("the permanent address: its own Find bar — a pick fills its line, never the pin, the city, the state or the PIN", async () => {
        backend.geo.set("/geo/autocomplete", [{ placeId: "pl_n", description: "Civil Lines, Nagpur", mainText: "Civil Lines", secondaryText: "Nagpur" }]);
        backend.geo.set("/geo/places/pl_n", NAGPUR);
        const onSaved = vi.fn();
        render(<EditApplicationDialog view={view} open onOpenChange={() => {}} onSaved={onSaved} />);
        const find = screen.getByLabelText("Find the permanent address") as HTMLInputElement;
        expect(find.placeholder).toBe("Type a building, street or landmark");

        fireEvent.focus(find);
        fireEvent.change(find, { target: { value: "Civil Lines" } });
        fireEvent.click(await screen.findByRole("option"));
        await waitFor(() => expect(value("Permanent address")).toBe(NAGPUR.formattedAddress));
        expect(value("City")).toBe("Pune");
        expect(value("PIN code")).toBe("");

        fireEvent.click(screen.getByRole("button", { name: "Save details" }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(patches()[0]).toMatchObject({ body: { permanentAddress: NAGPUR.formattedAddress, city: "Pune", currentPostalCode: null, currentLatitude: null, currentLongitude: null } });
    });

    it("with the vendor silent the typed addresses still save, with no pin", async () => {
        const onSaved = vi.fn();
        render(<EditApplicationDialog view={view} open onOpenChange={() => {}} onSaved={onSaved} />);
        const search = screen.getByLabelText("Find the address");
        fireEvent.focus(search);
        fireEvent.change(search, { target: { value: "Baner Road" } });
        await screen.findByText("The maps vendor did not answer.");
        fireEvent.change(screen.getByLabelText("Current address"), { target: { value: "14, Baner Road, Pune" } });
        fireEvent.change(screen.getByLabelText("PIN code"), { target: { value: "411045" } });
        const find = screen.getByLabelText("Find the permanent address");
        fireEvent.focus(find);
        fireEvent.change(find, { target: { value: "Civil Lines" } });
        await waitFor(() => expect(backend.calls.filter((call) => call.path.startsWith("/geo/autocomplete")).length).toBeGreaterThanOrEqual(2));
        fireEvent.change(screen.getByLabelText("Permanent address"), { target: { value: "7, Civil Lines, Nagpur" } });
        fireEvent.click(screen.getByRole("button", { name: "Save details" }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(patches()[0]).toMatchObject({
            body: { currentAddress: "14, Baner Road, Pune", currentPostalCode: "411045", permanentAddress: "7, Civil Lines, Nagpur", currentLatitude: null, currentLongitude: null },
        });
    });

    it("keeps a pin already on the record when the address is retyped by hand", async () => {
        const onSaved = vi.fn();
        render(
            <EditApplicationDialog
                view={{ ...view, profile: { ...view.profile, currentAddress: "14, Baner Road", currentPostalCode: "411045", currentLatitude: 18.559, currentLongitude: 73.7868 } }}
                open
                onOpenChange={() => {}}
                onSaved={onSaved}
            />,
        );
        expect(value("PIN code")).toBe("411045");
        fireEvent.change(screen.getByLabelText("Current address"), { target: { value: "16, Baner Road" } });
        fireEvent.click(screen.getByRole("button", { name: "Save details" }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(patches()[0]).toMatchObject({ body: { currentAddress: "16, Baner Road", currentPostalCode: "411045", currentLatitude: 18.559, currentLongitude: 73.7868 } });
    });

    it("refuses a PIN that is not six digits before the save", () => {
        render(<EditApplicationDialog view={view} open onOpenChange={() => {}} onSaved={() => {}} />);
        fireEvent.change(screen.getByLabelText("PIN code"), { target: { value: "04110" } });
        expect(screen.getByText("Six digits, not starting with 0.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Save details" })).toBeDisabled();
    });
});
