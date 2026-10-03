import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * QR-13 — the desk onboards a publisher the way the app's ladder does.
 *
 * Pinned: the form's rules are the app's (per account type); a create
 * sends the ladder's fields as `POST /publishers` with the registered name
 * composed for an individual; a place picked off the "Find the address" bar
 * fills the address, city, state and PIN and sends the coordinates without
 * any map or coordinate input on screen (the owner, 1 Oct 2026); edit mode prefills from the row and the person
 * and sends `PATCH /publishers/:id` without the number; and a server
 * refusal is shown on the field it names.
 *
 * Phase D (1 Oct 2026): the edit carries an "Entity type" select beside
 * the account type, sent only when changed; 409 `KYC_LOCKED` is explained;
 * and a verified Individual becoming a business is confirmed before it is
 * saved.
 */

const { backend, geo } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string; body?: unknown }[],
        refuse: null as { status: number; code: string; message: string; fieldErrors?: Record<string, string[]> } | null,
        /** FL-3: what `GET /config` answers — the flows row the form takes its sections from. */
        config: { flows: {} } as Record<string, unknown>,
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
        if (path === "/config") return backend.config;
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
// The address bar is the real `AddressFinder` (no stub): its suggestions come off the `/geo/*` answers above.
vi.mock("@/components/adx/city-combobox", () => ({
    CityCombobox: ({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) => <input id={id} aria-label="City" value={value} onChange={(e) => onChange(e.target.value)} />,
}));

import { EMPTY_VALUES, PublisherOnboardingForm, problemsOf, publisherBodyOf, publisherTypeOf, registeredName, valuesOf, type PublisherFormValues } from "./publisher-onboarding-form";
import { ONBOARDING_TEMPLATE_FIXTURE } from "@/components/adx/flow-renderer/test-fixtures";
import type { Publisher } from "@/types";

const filled: PublisherFormValues = {
    ...EMPTY_VALUES,
    accountType: "INDIVIDUAL",
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
    backend.config = { flows: {} };
    geo.predictions = [];
    geo.place = null;
});

/**
 * FL-3: payload parity. The `common` body `handleSubmit` built before the
 * form was drawn from the ladder, copied verbatim; `publisherBodyOf` must
 * produce the same keys and values, and the two writes wrap it as before.
 * DR 08 parity: the legacy `type` is now derived from the account type and
 * the entity type, so the old builder is handed the type it used to read.
 */
function legacyCommon(values: PublisherFormValues, type: string) {
    return {
        name: registeredName(values),
        email: values.email,
        type,
        city: values.city,
        firstName: values.firstName,
        lastName: values.lastName,
        dateOfBirth: values.dateOfBirth,
        ...(values.gender ? { gender: values.gender } : {}),
        address: values.address,
        state: values.state,
        postalCode: values.postalCode,
        ...(values.latitude !== null && values.longitude !== null ? { latitude: values.latitude, longitude: values.longitude } : {}),
        gstin: values.gstin.toUpperCase(),
        contactName: values.contactName,
        contactMobile: values.contactMobile,
        contactEmail: values.contactEmail,
    };
}

describe("the body — parity with the old builder", () => {
    it("sends the same keys and values for a full business and for a bare individual", () => {
        const business: PublisherFormValues = {
            ...filled,
            accountType: "BUSINESS",
            name: " Sharma Hoardings ",
            gender: "MALE",
            latitude: 13.0604,
            longitude: 80.2496,
            gstin: "33abcde1234f1z5",
            contactName: "R. Kumar",
            contactMobile: "9876500000",
            contactEmail: "kumar@example.in",
        };
        expect(publisherBodyOf(business, "COMPANY")).toEqual(legacyCommon(business, "BUSINESS"));
        expect(Object.keys(publisherBodyOf(business)).sort()).toEqual(Object.keys(legacyCommon(business, "BUSINESS")).sort());
        expect(publisherBodyOf(filled)).toEqual(legacyCommon(filled, "INDIVIDUAL"));
        /* Half a pin is no pin, as before. */
        expect(publisherBodyOf({ ...filled, latitude: 1 })).not.toHaveProperty("latitude");
        /* The entity type is never in the shared body: the create and the edit add it on their own terms. */
        expect(publisherBodyOf(business, "COMPANY")).not.toHaveProperty("entityType");
    });

    it("derives the legacy type from DR 08's account type and the entity type", () => {
        expect(publisherTypeOf("INDIVIDUAL", "")).toBe("INDIVIDUAL");
        expect(publisherTypeOf("BUSINESS", "COMPANY")).toBe("BUSINESS");
        expect(publisherTypeOf("BUSINESS", "")).toBe("BUSINESS");
        expect(publisherTypeOf("ORGANISATION", "POLITICAL")).toBe("POLITICAL");
        expect(publisherTypeOf("ORGANISATION", "GOVERNMENT_EDUCATION")).toBe("NGO");
        expect(publisherTypeOf("ORGANISATION", "")).toBe("NGO");
        const org: PublisherFormValues = { ...filled, accountType: "ORGANISATION", name: "Sunrise Trust" };
        expect(publisherBodyOf(org, "POLITICAL").type).toBe("POLITICAL");
        expect(publisherBodyOf(org, "NON_PROFIT").type).toBe("NGO");
    });
});

describe("the sections come from the ladder", () => {
    it("draws the code ladder while the row holds no template: the account type, the publisher's details, and for a business its information and the contact", async () => {
        render(<PublisherOnboardingForm mode="create" initial={{ ...filled, accountType: "BUSINESS", name: "Sharma Hoardings" }} />);
        await waitFor(() => expect(screen.getByTestId("pf-ladder-source")).toHaveTextContent("Sections follow the code's onboarding ladder."));
        const titles = screen.getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent?.replace(/^\d+ ·/, "").trim());
        expect(titles).toEqual(["Account type", "Publisher details", "Business information", "Contact person", "Attribution"]);
        /* The address goes with the business, not the person, as the phone puts it. */
        expect(within(screen.getByTestId("pf-section-3")).getByLabelText("Registered address")).toBeInTheDocument();
        expect(within(screen.getByTestId("pf-section-3")).getByLabelText("Registered name")).toBeInTheDocument();
        expect(within(screen.getByTestId("pf-section-2")).queryByLabelText(/address/i)).not.toBeInTheDocument();
    });

    it("follows the stored template's titles and order, and the ladder of the account type chosen", async () => {
        backend.config = { flows: { onboarding: ONBOARDING_TEMPLATE_FIXTURE } };
        render(<PublisherOnboardingForm mode="create" initial={{ ...filled, accountType: "BUSINESS", name: "Sharma Hoardings" }} />);
        await waitFor(() => expect(screen.getByTestId("pf-ladder-source")).toHaveTextContent("Sections follow the onboarding ladder (v4)."));
        const titles = () => screen.getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent?.replace(/^\d+ ·/, "").trim());
        /* The fixture's business ladder puts the contact before the business. */
        expect(titles()).toEqual(["What kind of account", "Your details", "Who to reach", "The business", "Attribution"]);
        /* An NGO climbs the organisation ladder; an edit has no attribution section. */
        cleanup();
        render(<PublisherOnboardingForm mode="edit" publisherId="pub_2" initial={{ ...filled, accountType: "ORGANISATION", name: "Sunrise Trust" }} />);
        await waitFor(() => expect(screen.getByText("The organisation")).toBeInTheDocument());
        expect(screen.queryByText("Attribution")).not.toBeInTheDocument();
        expect(screen.getByLabelText(/GSTIN/)).toBeInTheDocument();
        expect(titles()).toEqual(["What kind of account", "Your details", "The organisation", "Who to reach"]);
    });
});

describe("the rules", () => {
    it("are the app's, per account type", () => {
        const empty = problemsOf(EMPTY_VALUES, "create");
        // AGE-1: the date of birth is offered, never required.
        expect(Object.keys(empty).sort()).toEqual(["address", "city", "email", "firstName", "lastName", "mobile", "state"]);
        expect(problemsOf(filled, "create")).toEqual({});
        // A business needs its registered name, a GSTIN and a contact person.
        const business = problemsOf({ ...filled, accountType: "BUSINESS" }, "create");
        expect(Object.keys(business).sort()).toEqual(["contactMobile", "contactName", "gstin", "name"]);
        // An organisation needs the contact, not the GSTIN.
        expect(Object.keys(problemsOf({ ...filled, accountType: "ORGANISATION", name: "Sunrise Trust" }, "create")).sort()).toEqual(["contactMobile", "contactName"]);
        // The particulars.
        // AGE-1: any real date — a child's too; not a day in the future, and none at all is fine.
        expect(problemsOf({ ...filled, dateOfBirth: "2015-01-01" }, "create").dateOfBirth).toBeUndefined();
        expect(problemsOf({ ...filled, dateOfBirth: "2999-01-01" }, "create").dateOfBirth).toBe("Not a day in the future.");
        expect(problemsOf({ ...filled, dateOfBirth: "" }, "create").dateOfBirth).toBeUndefined();
        expect(problemsOf({ ...filled, email: "nope" }, "create").email).toBeTruthy();
        expect(problemsOf({ ...filled, mobile: "12345" }, "create").mobile).toBe("Ten digits, starting 6 to 9.");
        expect(problemsOf({ ...filled, mobile: "+91 98765 43210" }, "create")).toEqual({});
        expect(problemsOf({ ...filled, accountType: "BUSINESS", name: "X", gstin: "bad", contactName: "A", contactMobile: "9876500000" }, "create").gstin).toBeTruthy();
        // The PIN is optional; given, it is six digits not starting with 0 — the backend's rule.
        expect(problemsOf({ ...filled, postalCode: "60002" }, "create").postalCode).toBe("Six digits, not starting with 0.");
        expect(problemsOf({ ...filled, postalCode: "060002" }, "create").postalCode).toBe("Six digits, not starting with 0.");
        expect(problemsOf({ ...filled, postalCode: "600002" }, "create")).toEqual({});
        // No half-pin rule: the coordinates are never typed, so there is nothing to half-fill.
        expect(problemsOf({ ...filled, latitude: 1, longitude: null }, "create")).toEqual({});
        // Edit mode: the number is the identity and not asked.
        expect(problemsOf({ ...filled, mobile: "" }, "edit")).toEqual({});
        expect(registeredName(filled)).toBe("Rakesh Sharma");
        expect(registeredName({ ...filled, accountType: "BUSINESS", name: " Sharma Hoardings " })).toBe("Sharma Hoardings");
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
        fireEvent.change(screen.getByLabelText("Date of birth (optional)"), { target: { value: "1980-05-14" } });
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

    it("a pick off the address bar fills the address, the city, the state and the PIN, and sends the coordinates — no map, no coordinate inputs", async () => {
        geo.predictions = [{ placeId: "pl_1", description: "12 Mount Road, Chennai", mainText: "12 Mount Road", secondaryText: "Chennai, Tamil Nadu" }];
        geo.place = { formattedAddress: "12 Mount Road, Chennai 600002", latitude: 13.0604, longitude: 80.2496, placeId: "pl_1", city: "Chennai", state: "Tamil Nadu", postalCode: "600002" };
        const onCreated = vi.fn();
        render(<PublisherOnboardingForm mode="create" onCreated={onCreated} />);
        const finder = screen.getByLabelText("Find the address") as HTMLInputElement;
        expect(finder.placeholder).toBe("Type a building, street or landmark");
        expect((screen.getByLabelText("Address") as HTMLInputElement).placeholder).toBe("Building, street, area");
        expect((screen.getByLabelText("PIN code (optional)") as HTMLInputElement).placeholder).toBe("Six digits — 560001");
        expect(screen.queryByTestId("pin-picker")).not.toBeInTheDocument();
        expect(screen.queryByTestId("pin-picker-map")).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/latitude/i)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/longitude/i)).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Rakesh" } });
        fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Sharma" } });
        fireEvent.change(screen.getByLabelText("Mobile"), { target: { value: "9876543210" } });
        fireEvent.change(screen.getByLabelText("Email"), { target: { value: "rakesh@example.in" } });
        fireEvent.focus(finder);
        fireEvent.change(finder, { target: { value: "12 Mount" } });
        fireEvent.click(await screen.findByRole("option", {}, { timeout: 3000 }));
        await waitFor(() => expect((screen.getByLabelText("Address") as HTMLInputElement).value).toBe("12 Mount Road, Chennai 600002"));
        expect((screen.getByLabelText("City") as HTMLInputElement).value).toBe("Chennai");
        expect((screen.getByLabelText("State") as HTMLInputElement).value).toBe("Tamil Nadu");
        expect((screen.getByLabelText("PIN code (optional)") as HTMLInputElement).value).toBe("600002");
        /* Still no coordinate on screen after the pick. */
        expect(screen.queryByDisplayValue("13.0604")).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId("pf-submit"));
        await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
        const post = backend.calls.find((c) => c.method === "POST" && c.path === "/publishers")!;
        expect(post.body).toEqual(
            expect.objectContaining({ address: "12 Mount Road, Chennai 600002", city: "Chennai", state: "Tamil Nadu", postalCode: "600002", latitude: 13.0604, longitude: 80.2496 }),
        );
    });

    it("a pick never clears a box the place does not name, and fills the PIN only when it is six digits", async () => {
        geo.predictions = [{ placeId: "pl_2", description: "Mount Road", mainText: "Mount Road", secondaryText: null }];
        geo.place = { formattedAddress: "Mount Road", latitude: 13.06, longitude: 80.25, placeId: "pl_2", city: null, state: null, postalCode: "6000" };
        render(<PublisherOnboardingForm mode="create" initial={{ ...filled, postalCode: "600001" }} />);
        const finder = screen.getByLabelText("Find the address");
        fireEvent.focus(finder);
        fireEvent.change(finder, { target: { value: "Mount Road" } });
        fireEvent.click(await screen.findByRole("option", {}, { timeout: 3000 }));
        await waitFor(() => expect((screen.getByLabelText("Address") as HTMLInputElement).value).toBe("Mount Road"));
        expect((screen.getByLabelText("City") as HTMLInputElement).value).toBe("Chennai");
        expect((screen.getByLabelText("State") as HTMLInputElement).value).toBe("Tamil Nadu");
        expect((screen.getByLabelText("PIN code (optional)") as HTMLInputElement).value).toBe("600001");
    });

    it("an address typed by hand with no pick saves, and no coordinates go up", async () => {
        const onCreated = vi.fn();
        render(<PublisherOnboardingForm mode="create" onCreated={onCreated} initial={{ ...filled, address: "" }} />);
        fireEvent.change(screen.getByLabelText("Address"), { target: { value: "14 Mount Road" } });
        fireEvent.change(screen.getByLabelText("PIN code (optional)"), { target: { value: "600002" } });
        fireEvent.click(screen.getByTestId("pf-submit"));
        await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
        const body = backend.calls.find((c) => c.method === "POST" && c.path === "/publishers")!.body as Record<string, unknown>;
        expect(body).toEqual(expect.objectContaining({ address: "14 Mount Road", postalCode: "600002" }));
        expect(body).not.toHaveProperty("latitude");
        expect(body).not.toHaveProperty("longitude");
    });

    it("shows a server refusal on the field it names", async () => {
        backend.refuse = { status: 400, code: "VALIDATION_ERROR", message: "Invalid request", fieldErrors: { gstin: ["Invalid GSTIN"] } };
        render(<PublisherOnboardingForm mode="create" initial={{ ...filled, accountType: "BUSINESS", name: "Sharma Hoardings", gstin: "33ABCDE1234F1Z5", contactName: "R. Kumar", contactMobile: "9876500000" }} />);
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
        expect(initial).toEqual(expect.objectContaining({ accountType: "BUSINESS", firstName: "Rakesh", lastName: "Sharma", dateOfBirth: "1980-05-14", gender: "MALE", latitude: 13.0604, name: "Sharma Hoardings", gstin: "33ABCDE1234F1Z5" }));
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

    it("an address retyped by hand on the edit keeps the row's coordinates; a pick replaces them", async () => {
        const onSaved = vi.fn();
        render(<PublisherOnboardingForm mode="edit" publisherId="pub_1" initial={valuesOf({ ...publisher, postalCode: "600002" } as Publisher)} onSaved={onSaved} />);
        expect((screen.getByLabelText("PIN code (optional)") as HTMLInputElement).value).toBe("600002");
        fireEvent.change(screen.getByLabelText("Registered address"), { target: { value: "14 Mount Road" } });
        fireEvent.click(screen.getByTestId("pf-submit"));
        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
        expect(backend.calls.find((c) => c.method === "PATCH")!.body).toEqual(expect.objectContaining({ address: "14 Mount Road", postalCode: "600002", latitude: 13.0604, longitude: 80.2496 }));

        geo.predictions = [{ placeId: "pl_3", description: "Anna Salai", mainText: "Anna Salai", secondaryText: null }];
        geo.place = { formattedAddress: "1 Anna Salai, Chennai 600006", latitude: 13.05, longitude: 80.26, placeId: "pl_3", city: "Chennai", state: "Tamil Nadu", postalCode: "600006" };
        const finder = screen.getByLabelText("Find the address");
        fireEvent.focus(finder);
        fireEvent.change(finder, { target: { value: "Anna Salai" } });
        fireEvent.click(await screen.findByRole("option", {}, { timeout: 3000 }));
        await waitFor(() => expect((screen.getByLabelText("Registered address") as HTMLInputElement).value).toBe("1 Anna Salai, Chennai 600006"));
        fireEvent.click(screen.getByTestId("pf-submit"));
        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2));
        expect(backend.calls.filter((c) => c.method === "PATCH").at(-1)!.body).toEqual(expect.objectContaining({ postalCode: "600006", latitude: 13.05, longitude: 80.26 }));
    });
});

/** Opens a Radix select by keyboard (jsdom has no pointer). */
const openSelect = (label: string) => fireEvent.keyDown(screen.getByLabelText(label), { key: "ArrowDown" });
/** Opens the select and picks the option. */
const pick = async (label: string, option: string) => {
    openSelect(label);
    fireEvent.click(await screen.findByRole("option", { name: option }));
};
const optionNames = async () => (await screen.findAllByRole("option")).map((option) => option.textContent);
const closeSelect = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

describe("the account type — DR 08's three, with the entity type beside it", () => {
    it("offers Individual, Business and Organisation, and the entity select only for a business or an organisation, filtered", async () => {
        render(<PublisherOnboardingForm mode="create" />);
        openSelect("Account type");
        expect(await optionNames()).toEqual(["Individual", "Business", "Organisation"]);
        closeSelect();
        // An individual is INDIVIDUAL: nothing to choose.
        expect(screen.queryByTestId("pf-entityType")).not.toBeInTheDocument();

        await pick("Account type", "Business");
        expect(screen.getByLabelText("Entity type")).toHaveTextContent("Not chosen yet");
        expect(screen.getByTestId("pf-entity-rule")).toHaveTextContent(
            "The kind of business or organisation picks its verification workflow; if it isn't chosen now, it's asked when verification starts.",
        );
        openSelect("Entity type");
        expect(await optionNames()).toEqual(["Sole proprietor", "Company", "LLP or partnership", "Other entity (HUF, co-operative, AOP, …)"]);
        closeSelect();

        await pick("Account type", "Organisation");
        openSelect("Entity type");
        expect(await optionNames()).toEqual([
            "Non-profit (NGO, trust, society, Section 8)",
            "Government or education",
            "Political party or candidate",
            "Other entity (HUF, co-operative, AOP, …)",
        ]);
        closeSelect();
        // The ladder follows: an organisation is asked its information and the contact.
        expect(screen.getByText("Organisation information")).toBeInTheDocument();

        await pick("Account type", "Individual");
        expect(screen.queryByTestId("pf-entityType")).not.toBeInTheDocument();
        expect(screen.queryByTestId("pf-entity-rule")).not.toBeInTheDocument();
    });

    it("keeps a kind that fits the new account type and clears one that does not", async () => {
        render(<PublisherOnboardingForm mode="create" initial={{ ...filled, accountType: "BUSINESS" }} />);
        await pick("Entity type", "Other entity (HUF, co-operative, AOP, …)");
        await pick("Account type", "Organisation");
        expect(screen.getByLabelText("Entity type")).toHaveTextContent("Other entity");
        await pick("Entity type", "Political party or candidate");
        await pick("Account type", "Business");
        expect(screen.getByLabelText("Entity type")).toHaveTextContent("Not chosen yet");
    });

    it("creates an educational institution: Organisation · Government or education goes up as NGO with the entity type", async () => {
        const onCreated = vi.fn();
        render(
            <PublisherOnboardingForm
                mode="create"
                onCreated={onCreated}
                initial={{ ...filled, accountType: "ORGANISATION", name: "St. Mary's College", contactName: "Fr. Thomas", contactMobile: "9876500000" }}
            />,
        );
        await pick("Entity type", "Government or education");
        fireEvent.click(screen.getByTestId("pf-submit"));
        await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
        const post = backend.calls.find((c) => c.method === "POST" && c.path === "/publishers")!;
        expect(post.body).toEqual(expect.objectContaining({ name: "St. Mary's College", type: "NGO", entityType: "GOVERNMENT_EDUCATION" }));
    });

    it("sends a political party as the publisher type POLITICAL", async () => {
        const onCreated = vi.fn();
        render(
            <PublisherOnboardingForm mode="create" onCreated={onCreated} initial={{ ...filled, accountType: "ORGANISATION", name: "Jan Seva Party", contactName: "A. Rao", contactMobile: "9876500000" }} />,
        );
        await pick("Entity type", "Political party or candidate");
        fireEvent.click(screen.getByTestId("pf-submit"));
        await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
        expect(backend.calls.find((c) => c.method === "POST")!.body).toEqual(expect.objectContaining({ type: "POLITICAL", entityType: "POLITICAL" }));
    });

    it("leaves the entity type off a create when none is chosen — it is asked when verification starts", async () => {
        const onCreated = vi.fn();
        render(<PublisherOnboardingForm mode="create" onCreated={onCreated} initial={{ ...filled, accountType: "ORGANISATION", name: "Sunrise Trust", contactName: "A. Rao", contactMobile: "9876500000" }} />);
        fireEvent.click(screen.getByTestId("pf-submit"));
        await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
        const body = backend.calls.find((c) => c.method === "POST")!.body as Record<string, unknown>;
        expect(body.type).toBe("NGO");
        expect(body).not.toHaveProperty("entityType");
    });

    it("an edit starts from the legacy type: INDIVIDUAL, BUSINESS, and NGO or POLITICAL as Organisation", () => {
        const base = { name: "X", mobile: "+919876543210", person: null } as unknown as Publisher;
        expect(valuesOf({ ...base, type: "INDIVIDUAL" }).accountType).toBe("INDIVIDUAL");
        expect(valuesOf({ ...base, type: "BUSINESS" }).accountType).toBe("BUSINESS");
        expect(valuesOf({ ...base, type: "NGO" }).accountType).toBe("ORGANISATION");
        expect(valuesOf({ ...base, type: "POLITICAL" }).accountType).toBe("ORGANISATION");
    });
});

describe("edit — the entity type (Phase D)", () => {
    const patches = () => backend.calls.filter((call) => call.method === "PATCH");
    const business: PublisherFormValues = { ...filled, accountType: "BUSINESS", name: "Sharma Hoardings", gstin: "33ABCDE1234F1Z5", contactName: "R. Kumar", contactMobile: "9876500000" };

    it("starts from the row, and rides the PATCH only when the desk changed it", async () => {
        const onSaved = vi.fn();
        render(<PublisherOnboardingForm mode="edit" publisherId="pub_1" initial={business} entity={{ value: "COMPANY", verified: false, stored: true }} onSaved={onSaved} />);
        expect(screen.getByLabelText("Entity type")).toHaveTextContent("Company");
        expect(screen.getByTestId("pf-entity-rule")).toHaveTextContent("The entity type decides which Digio workflow the publisher is verified on.");
        // Untouched: the body is what it always was.
        fireEvent.click(screen.getByTestId("pf-submit"));
        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
        expect(patches()[0]!.body).not.toHaveProperty("entityType");
        expect(patches()[0]!.body).toEqual(expect.objectContaining({ type: "BUSINESS" }));

        // Changed on an unverified account: sent, and nothing to confirm.
        await pick("Entity type", "Sole proprietor");
        fireEvent.click(screen.getByTestId("pf-submit"));
        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2));
        expect(patches()[1]!.body).toEqual(expect.objectContaining({ entityType: "SOLE_PROPRIETOR", type: "BUSINESS", firstName: "Rakesh" }));
        expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    it("an individual's edit draws no entity select and sends none", async () => {
        const onSaved = vi.fn();
        render(<PublisherOnboardingForm mode="edit" publisherId="pub_1" initial={filled} entity={{ value: "INDIVIDUAL", verified: false }} onSaved={onSaved} />);
        expect(screen.queryByTestId("pf-entityType")).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId("pf-submit"));
        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
        expect(patches()[0]!.body).not.toHaveProperty("entityType");
    });

    it("moving off the row's kind asks for it again when it was stored, and sends nothing until the desk picks", async () => {
        const onSaved = vi.fn();
        render(<PublisherOnboardingForm mode="edit" publisherId="pub_1" initial={business} entity={{ value: "COMPANY", verified: false, stored: true }} onSaved={onSaved} />);
        await pick("Account type", "Organisation");
        expect(screen.getByLabelText("Entity type")).toHaveTextContent("Not chosen yet");
        fireEvent.click(screen.getByTestId("pf-submit"));
        expect(within(screen.getByTestId("pf-entityType")).getByRole("alert")).toHaveTextContent("Choose the kind again — Company is not a kind of organisation.");
        expect(patches()).toHaveLength(0);
        // Back to Business: the row's own kind is put back.
        await pick("Account type", "Business");
        expect(screen.getByLabelText("Entity type")).toHaveTextContent("Company");
        await pick("Account type", "Organisation");
        await pick("Entity type", "Non-profit (NGO, trust, society, Section 8)");
        fireEvent.click(screen.getByTestId("pf-submit"));
        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
        expect(patches()[0]!.body).toEqual(expect.objectContaining({ type: "NGO", entityType: "NON_PROFIT" }));
    });

    it("a business becoming an individual says so with the entity type", async () => {
        const onSaved = vi.fn();
        render(<PublisherOnboardingForm mode="edit" publisherId="pub_1" initial={business} entity={{ value: "COMPANY", verified: false, stored: true }} onSaved={onSaved} />);
        await pick("Account type", "Individual");
        fireEvent.click(screen.getByTestId("pf-submit"));
        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
        expect(patches()[0]!.body).toEqual(expect.objectContaining({ type: "INDIVIDUAL", entityType: "INDIVIDUAL" }));
    });

    it("reads Not chosen yet while the account has none, and explains 409 KYC_LOCKED on a verified one", async () => {
        const onSaved = vi.fn();
        render(<PublisherOnboardingForm mode="edit" publisherId="pub_1" initial={business} entity={{ value: null, verified: true }} onSaved={onSaved} />);
        expect(screen.getByLabelText("Entity type")).toHaveTextContent("Not chosen yet");
        expect(screen.getByTestId("pf-entity-rule")).toHaveTextContent("its entity type can only move from Individual to a business form, and that restarts verification");
        await pick("Entity type", "Company");
        backend.refuse = { status: 409, code: "KYC_LOCKED", message: "The entity type is locked." };
        fireEvent.click(screen.getByTestId("pf-submit"));
        await waitFor(() =>
            expect(
                screen.getByText("This account is verified, so its entity type can only move from Individual to a business form, and that restarts verification. Nothing in this save was written."),
            ).toBeInTheDocument(),
        );
        expect(patches()[0]!.body).toEqual(expect.objectContaining({ entityType: "COMPANY" }));
        expect(onSaved).not.toHaveBeenCalled();
    });

    it("confirms a verified Individual becoming a business before saving, and says Digio's refusal in the owner's words", async () => {
        const onSaved = vi.fn();
        render(<PublisherOnboardingForm mode="edit" publisherId="pub_1" initial={filled} entity={{ value: "INDIVIDUAL", verified: true }} onSaved={onSaved} />);
        // The verified rule is read on an individual's edit too, before the account type is moved.
        expect(screen.getByTestId("pf-entity-rule")).toHaveTextContent("its entity type can only move from Individual to a business form");
        await pick("Account type", "Business");
        // Individual is not a kind of business: the selection is cleared, and on a verified account it has to be chosen.
        expect(screen.getByLabelText("Entity type")).toHaveTextContent("Not chosen yet");
        fireEvent.change(screen.getByLabelText("Registered name"), { target: { value: "Sharma Hoardings" } });
        fireEvent.change(screen.getByLabelText("GSTIN"), { target: { value: "33ABCDE1234F1Z5" } });
        fireEvent.change(screen.getByLabelText("Contact person"), { target: { value: "R. Kumar" } });
        fireEvent.change(screen.getByLabelText("Their mobile"), { target: { value: "9876500000" } });
        fireEvent.change(screen.getByLabelText("Registered address"), { target: { value: "12 Mount Road" } });
        fireEvent.click(screen.getByTestId("pf-submit"));
        expect(within(screen.getByTestId("pf-entityType")).getByRole("alert")).toHaveTextContent("Choose the kind again — Individual is not a kind of business.");
        expect(patches()).toHaveLength(0);
        await pick("Entity type", "LLP or partnership");
        fireEvent.click(screen.getByTestId("pf-submit"));

        const confirm = await screen.findByRole("alertdialog");
        expect(confirm).toHaveTextContent("Change the entity type to LLP or partnership?");
        expect(confirm).toHaveTextContent("This account goes back to 'verification pending' until the business is verified.");
        expect(patches()).toHaveLength(0);

        // Digio refuses the first try: said in the owner's words, nothing reported as saved.
        backend.refuse = { status: 502, code: "KYC_PROVIDER_REFUSED", message: "Digio refused the request." };
        fireEvent.click(within(confirm).getByRole("button", { name: "Save and restart verification" }));
        await waitFor(() => expect(screen.getByText("Online verification isn't available for this account type yet. Please contact ADX support.")).toBeInTheDocument());
        expect(onSaved).not.toHaveBeenCalled();

        // The second try goes through, after the same confirmation.
        backend.refuse = null;
        fireEvent.click(screen.getByTestId("pf-submit"));
        fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Save and restart verification" }));
        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
        expect(patches().at(-1)!.body).toEqual(expect.objectContaining({ entityType: "LLP_PARTNERSHIP", type: "BUSINESS" }));
    });
});
