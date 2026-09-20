import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * QR-13 — the desk onboards a publisher the way the app's ladder does.
 *
 * Pinned: the form's rules are the app's (per account type); a create
 * sends the ladder's fields as `POST /publishers` with the registered name
 * composed for an individual; a place picked off the map fills the address,
 * city, state and the pin; edit mode prefills from the row and the person
 * and sends `PATCH /publishers/:id` without the number; and a server
 * refusal is shown on the field it names.
 */

const { backend, geo } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string; body?: unknown }[],
        refuse: null as { status: number; code: string; message: string; fieldErrors?: Record<string, string[]> } | null,
    },
    geo: {
        predictions: [] as { placeId: string; description: string; mainText: string; secondaryText: string | null }[],
        place: null as Record<string, unknown> | null,
    },
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const answer = (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        if (backend.refuse && method !== "GET") {
            // The field errors ride in `details`, the way the API's flattened refusal does.
            throw new actual.ApiError(backend.refuse.status, backend.refuse.code, backend.refuse.message, { fieldErrors: backend.refuse.fieldErrors ?? {} });
        }
        if (path.startsWith("/geo/autocomplete")) return geo.predictions;
        if (path.startsWith("/geo/places/")) return geo.place;
        if (path === "/app/maps") return null;
        if (path.startsWith("/agents")) return [];
        return { id: "pub_new", displayId: "PUB-1709-2601", name: "Rakesh Sharma", mobile: "+919876543210", agentId: null, userId: "usr_new", createdAt: "2026-09-17T00:00:00.000Z" };
    };
    return {
        ...actual,
        api: {
            get: async (path: string) => answer("GET", path),
            post: async (path: string, body?: unknown) => answer("POST", path, body),
            put: async (path: string, body?: unknown) => answer("PUT", path, body),
            patch: async (path: string, body?: unknown) => answer("PATCH", path, body),
            delete: async (path: string) => answer("DELETE", path),
        },
        http: {
            get: async (path: string) => answer("GET", path),
            post: async (path: string, body?: unknown) => answer("POST", path, body),
            put: async (path: string, body?: unknown) => answer("PUT", path, body),
            patch: async (path: string, body?: unknown) => answer("PATCH", path, body),
            delete: async (path: string) => answer("DELETE", path),
        },
    };
});

vi.mock("@/lib/api-config", () => ({ isLive: () => true, apiConfig: { live: true } }));
// The console's shared address-and-pin picker (AD-C), stubbed: a search box, one pick, one drag, a clear.
vi.mock("@/components/adx/pin-picker", () => ({
    PinPicker: ({
        latitude,
        longitude,
        onChange,
        onAddress,
        labels,
    }: {
        latitude: string;
        longitude: string;
        onChange: (next: { latitude: string; longitude: string }) => void;
        onAddress?: (place: Record<string, unknown>) => void;
        labels?: { search?: string };
    }) => {
        const [q, setQ] = React.useState("");
        return (
            <div data-testid="pin-stub" data-lat={latitude} data-lng={longitude}>
                <input aria-label={labels?.search ?? "Search"} value={q} onChange={(e) => setQ(e.target.value)} />
                {q.length >= 3
                    ? geo.predictions.map((row) => (
                          <button
                              key={row.placeId}
                              type="button"
                              data-testid={`pf-place-${row.placeId}`}
                              onClick={() => {
                                  const place = geo.place!;
                                  onChange({ latitude: String(place.latitude), longitude: String(place.longitude) });
                                  onAddress?.(place);
                              }}
                          >
                              {row.mainText}
                          </button>
                      ))
                    : null}
                <button type="button" onClick={() => onChange({ latitude: "12.9", longitude: "77.6" })}>
                    drag
                </button>
                <button type="button" onClick={() => onChange({ latitude: "", longitude: "" })}>
                    clear
                </button>
            </div>
        );
    },
}));
vi.mock("@/components/adx/city-combobox", () => ({
    CityCombobox: ({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) => <input id={id} aria-label="City" value={value} onChange={(e) => onChange(e.target.value)} />,
}));

import { EMPTY_VALUES, PublisherOnboardingForm, problemsOf, registeredName, valuesOf, type PublisherFormValues } from "./publisher-onboarding-form";
import type { Publisher } from "@/types";

const filled: PublisherFormValues = {
    ...EMPTY_VALUES,
    type: "INDIVIDUAL",
    firstName: "Rakesh",
    lastName: "Sharma",
    mobile: "9876543210",
    email: "rakesh@example.in",
    dateOfBirth: "1980-05-14",
    address: "12 Mount Road, Chennai",
    city: "Chennai",
    state: "Tamil Nadu",
};

beforeEach(() => {
    backend.calls.length = 0;
    backend.refuse = null;
    geo.predictions = [];
    geo.place = null;
});

describe("the rules", () => {
    it("are the app's, per account type", () => {
        const empty = problemsOf(EMPTY_VALUES, "create");
        expect(Object.keys(empty).sort()).toEqual(["address", "city", "dateOfBirth", "email", "firstName", "lastName", "mobile", "state"]);
        expect(problemsOf(filled, "create")).toEqual({});
        // A business needs its registered name, a GSTIN and a contact person.
        const business = problemsOf({ ...filled, type: "BUSINESS" }, "create");
        expect(Object.keys(business).sort()).toEqual(["contactMobile", "contactName", "gstin", "name"]);
        // An organisation needs the contact, not the GSTIN.
        expect(Object.keys(problemsOf({ ...filled, type: "NGO", name: "Sunrise Trust" }, "create")).sort()).toEqual(["contactMobile", "contactName"]);
        // The particulars.
        expect(problemsOf({ ...filled, dateOfBirth: "2015-01-01" }, "create").dateOfBirth).toBe("Must be 18 or over.");
        expect(problemsOf({ ...filled, email: "nope" }, "create").email).toBeTruthy();
        expect(problemsOf({ ...filled, mobile: "12345" }, "create").mobile).toBe("Ten digits, starting 6 to 9.");
        expect(problemsOf({ ...filled, mobile: "+91 98765 43210" }, "create")).toEqual({});
        expect(problemsOf({ ...filled, type: "BUSINESS", name: "X", gstin: "bad", contactName: "A", contactMobile: "9876500000" }, "create").gstin).toBeTruthy();
        expect(problemsOf({ ...filled, latitude: 1, longitude: null }, "create").latitude).toBeTruthy();
        // Edit mode: the number is the identity and not asked.
        expect(problemsOf({ ...filled, mobile: "" }, "edit")).toEqual({});
        expect(registeredName(filled)).toBe("Rakesh Sharma");
        expect(registeredName({ ...filled, type: "BUSINESS", name: " Sharma Hoardings " })).toBe("Sharma Hoardings");
    });
});

describe("create", () => {
    it("refuses to send until the app's fields are in, then posts them with the registered name composed", async () => {
        const onCreated = vi.fn();
        render(<PublisherOnboardingForm mode="create" onCreated={onCreated} />);
        fireEvent.click(screen.getByTestId("pf-submit"));
        expect(backend.calls.filter((c) => c.method === "POST")).toHaveLength(0);
        expect(within(screen.getByTestId("pf-firstName")).getByRole("alert").textContent).toContain("Needed");

        fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Rakesh" } });
        fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Sharma" } });
        fireEvent.change(screen.getByLabelText("Mobile"), { target: { value: "9876543210" } });
        fireEvent.change(screen.getByLabelText("Email"), { target: { value: "rakesh@example.in" } });
        fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: "1980-05-14" } });
        fireEvent.change(screen.getByLabelText("Address"), { target: { value: "12 Mount Road" } });
        fireEvent.change(screen.getByLabelText("City"), { target: { value: "Chennai" } });
        fireEvent.change(screen.getByLabelText("State"), { target: { value: "Tamil Nadu" } });
        expect(screen.getByText("Everything the app would ask is in.")).toBeTruthy();

        fireEvent.click(screen.getByTestId("pf-submit"));
        await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
        const post = backend.calls.find((c) => c.method === "POST" && c.path === "/publishers")!;
        expect(post.body).toEqual({
            name: "Rakesh Sharma",
            mobile: "9876543210",
            email: "rakesh@example.in",
            type: "INDIVIDUAL",
            city: "Chennai",
            firstName: "Rakesh",
            lastName: "Sharma",
            dateOfBirth: "1980-05-14",
            address: "12 Mount Road",
            state: "Tamil Nadu",
        });
    });

    it("a place picked off the map fills the address, the city, the state and the pin; a drag moves the pin", async () => {
        geo.predictions = [{ placeId: "pl_1", description: "12 Mount Road, Chennai", mainText: "12 Mount Road", secondaryText: "Chennai, Tamil Nadu" }];
        geo.place = { formattedAddress: "12 Mount Road, Chennai 600002", latitude: 13.0604, longitude: 80.2496, placeId: "pl_1", city: "Chennai", state: "Tamil Nadu", postalCode: "600002" };
        render(<PublisherOnboardingForm mode="create" />);
        expect(screen.getByTestId("pin-stub").getAttribute("data-lat")).toBe("");
        fireEvent.change(screen.getByLabelText("Find the address"), { target: { value: "12 Mount" } });
        const row = await screen.findByTestId("pf-place-pl_1", {}, { timeout: 3000 });
        fireEvent.click(row);
        await waitFor(() => expect((screen.getByLabelText("Address") as HTMLInputElement).value).toBe("12 Mount Road, Chennai 600002"));
        expect((screen.getByLabelText("City") as HTMLInputElement).value).toBe("Chennai");
        expect((screen.getByLabelText("State") as HTMLInputElement).value).toBe("Tamil Nadu");
        expect(screen.getByTestId("pin-stub").getAttribute("data-lat")).toBe("13.0604");
        fireEvent.click(screen.getByText("drag"));
        expect(screen.getByTestId("pin-stub").getAttribute("data-lat")).toBe("12.9");
        fireEvent.click(screen.getByText("clear"));
        expect(screen.getByTestId("pin-stub").getAttribute("data-lat")).toBe("");
    });

    it("shows a server refusal on the field it names", async () => {
        backend.refuse = { status: 400, code: "VALIDATION_ERROR", message: "Invalid request", fieldErrors: { gstin: ["Invalid GSTIN"] } };
        render(<PublisherOnboardingForm mode="create" initial={{ ...filled, type: "BUSINESS", name: "Sharma Hoardings", gstin: "33ABCDE1234F1Z5", contactName: "R. Kumar", contactMobile: "9876500000" }} />);
        fireEvent.click(screen.getByTestId("pf-submit"));
        await waitFor(() => expect(within(screen.getByTestId("pf-gstin")).getByRole("alert").textContent).toBe("Invalid GSTIN"));
    });
});

describe("edit", () => {
    const publisher = {
        id: "pub_1",
        displayId: "PUB-1709-2601",
        userId: "usr_1",
        user: null,
        openOrders: 0,
        name: "Sharma Hoardings",
        mobile: "+919876543210",
        email: "rakesh@example.in",
        city: "Chennai",
        type: "BUSINESS",
        kycStatus: "PENDING",
        contactName: "R. Kumar",
        contactMobile: "9876500000",
        contactEmail: null,
        gstin: "33ABCDE1234F1Z5",
        pan: null,
        kyc: { state: "AWAITING_DOCUMENTS", kycId: null, submittedAt: null, requestedAt: null, requestedChannel: null, method: null },
        sites: 0,
        agentId: null,
        onboardingStatus: "ONBOARDING_COMPLETE",
        createdAt: "2026-09-17T00:00:00.000Z",
        activatedAt: "2026-09-17T00:00:00.000Z",
        suspensionScopes: [],
        suspensionReason: null,
        suspendedAt: null,
        address: "12 Mount Road",
        state: "Tamil Nadu",
        latitude: 13.0604,
        longitude: 80.2496,
        person: { displayId: "ADX-1709-2601", firstName: "Rakesh", lastName: "Sharma", dateOfBirth: "1980-05-14", gender: "MALE", avatarUrl: null, consentAcceptedAt: null },
    } as unknown as Publisher;

    it("prefills from the row and the person, and patches without the number", async () => {
        const onSaved = vi.fn();
        const initial = valuesOf(publisher);
        expect(initial).toEqual(expect.objectContaining({ type: "BUSINESS", firstName: "Rakesh", lastName: "Sharma", dateOfBirth: "1980-05-14", gender: "MALE", latitude: 13.0604, name: "Sharma Hoardings", gstin: "33ABCDE1234F1Z5" }));
        render(<PublisherOnboardingForm mode="edit" publisherId="pub_1" initial={initial} onSaved={onSaved} />);
        expect((screen.getByLabelText("Mobile") as HTMLInputElement).disabled).toBe(true);
        fireEvent.change(screen.getByLabelText("Registered name"), { target: { value: "Sharma Hoardings Pvt Ltd" } });
        fireEvent.click(screen.getByTestId("pf-submit"));
        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
        const patch = backend.calls.find((c) => c.method === "PATCH" && c.path === "/publishers/pub_1")!;
        expect(patch.body).toEqual(
            expect.objectContaining({ name: "Sharma Hoardings Pvt Ltd", firstName: "Rakesh", lastName: "Sharma", dateOfBirth: "1980-05-14", gender: "MALE", latitude: 13.0604, longitude: 80.2496, gstin: "33ABCDE1234F1Z5" }),
        );
        expect(patch.body).not.toHaveProperty("mobile");
    });
});
