import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * QR-15 — the desk onboards an advertiser the way the app does.
 *
 * Pinned: the form's rules are the app's (a company name only for anyone
 * but an individual; the billing address and city for everyone); a create
 * sends the desk's fields as `POST /advertisers { onBehalf }` with the
 * person's name composed and blanks left off; edit mode prefills from the
 * row and the person behind it and sends `PATCH /advertisers/:id` without
 * the number; and a server refusal is shown on the field it names.
 *
 * Phase D (1 Oct 2026): the edit carries an "Entity type" select beside
 * the account type, sent only when changed; 409 `KYC_LOCKED` is explained;
 * a verified Individual becoming a business is confirmed before it is
 * saved; and Digio failing that upgrade is said in the owner's words.
 *
 * DR 08 parity (1 Oct 2026): the account type is Individual / Business /
 * Organisation, the entity select beside it (create and edit) is filtered
 * to the account type's kinds, and the legacy type is derived — a business
 * COMMERCIAL (an agency stays AGENCY), an organisation NGO.
 *
 * Address search everywhere (the owner, 1 Oct 2026): the billing address is
 * found as it is typed — a pick fills the line, the city, the state and the
 * PIN (never the country, which the place does not name, and never a pin);
 * with the vendor silent the typed address still saves.
 */

const { backend } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string; body?: unknown }[],
        refuse: null as { status: number; code: string; message: string; fieldErrors?: Record<string, string[]> } | null,
        /* The geo answers, by path prefix; a geo path with none is the vendor saying nothing. */
        geo: new Map<string, unknown>(),
    },
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const answer = (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        if (backend.refuse && method !== "GET") {
            throw new actual.ApiError(backend.refuse.status, backend.refuse.code, backend.refuse.message, { fieldErrors: backend.refuse.fieldErrors ?? {} });
        }
        if (path === "/advertisers/industries") return ["Retail", "Food & beverage"];
        if (method === "GET" && path.startsWith("/geo/")) {
            const key = [...backend.geo.keys()].find((prefix) => path.startsWith(prefix));
            if (key === undefined) throw new actual.ApiError(503, "MAPS_UNAVAILABLE", "The maps vendor did not answer.");
            return backend.geo.get(key);
        }
        if (method === "GET") return [];
        return { id: "adv_new", displayId: "ADV-1709-2601", name: "Meera Shah", contact: "+919876543210", email: null, type: "INDIVIDUAL", companyName: null, gstin: null, city: "Pune", state: null, kycStatus: "PENDING", activatedAt: null, userId: "usr_new", createdAt: "2026-09-17T00:00:00.000Z" };
    };
    const client = {
        get: async (path: string) => answer("GET", path),
        post: async (path: string, body?: unknown) => answer("POST", path, body),
        put: async (path: string, body?: unknown) => answer("PUT", path, body),
        patch: async (path: string, body?: unknown) => answer("PATCH", path, body),
        delete: async (path: string) => answer("DELETE", path),
    };
    return { ...actual, api: client, http: client };
});

vi.mock("@/lib/api-config", () => ({ isLive: () => true, apiConfig: { live: true } }));
// The catalogue's city picker, stubbed to a plain box: the form's contract with it is the value and the pick.
vi.mock("@/components/adx/city-combobox", () => ({
    CityCombobox: ({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (city: string) => void; placeholder?: string }) => (
        <input id={id} aria-label="City" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AdvertiserOnboardingForm, EMPTY_ADVERTISER_VALUES, advertiserProblemsOf, advertiserTypeOf, advertiserValuesOf, withBillingPlace } from "./advertiser-onboarding-form";
import type { Advertiser } from "@/types";

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

const held: Advertiser = {
    id: "adv_1",
    name: "Meera Shah",
    displayId: "ADV-1709-2601",
    userId: "usr_1",
    contact: "+919876543210",
    email: "meera@example.in",
    type: "COMMERCIAL",
    companyName: "Menon Retail",
    industry: "Retail",
    gstin: "27ABCDE1234F1Z5",
    city: "Pune",
    state: "Maharashtra",
    kycStatus: "PENDING",
    status: "pending",
    activatedAt: null,
    joinedAt: "2026-09-17T00:00:00.000Z",
    suspensionScopes: [],
    suspensionReason: null,
    suspendedAt: null,
    billingAddress: "4, FC Road, Pune",
    person: { displayId: "ADX-1709-2601", firstName: "Meera", lastName: "Shah", dateOfBirth: "1988-02-14", gender: "FEMALE", avatarUrl: null, consentAcceptedAt: null },
    onboarding: { via: "DESK", viaLabel: "Desk", byId: "usr_ops", byName: "Asha Rao", byRole: "Ops manager", at: "2026-09-17T00:00:00.000Z" },
};

beforeEach(() => {
    backend.calls.length = 0;
    backend.refuse = null;
    backend.geo.clear();
});

describe("AdvertiserOnboardingForm", () => {
    it("applies the app's rules — the billing address and city for everyone, a company name for anyone but an individual", () => {
        const empty = advertiserProblemsOf(EMPTY_ADVERTISER_VALUES, "create");
        expect(Object.keys(empty).sort()).toEqual(["billingAddress", "city", "firstName", "lastName", "mobile"]);
        expect(advertiserProblemsOf({ ...EMPTY_ADVERTISER_VALUES, accountType: "BUSINESS" }, "create").companyName).toBe("Needed for a company or organisation — the app asks for it.");
        expect(advertiserProblemsOf({ ...EMPTY_ADVERTISER_VALUES, accountType: "INDIVIDUAL" }, "create").companyName).toBeUndefined();
        // The edit does not ask for the number; a bad GSTIN is still refused, and a date of birth under 18 is not (AGE-1).
        const edit = advertiserProblemsOf({ ...EMPTY_ADVERTISER_VALUES, firstName: "Meera", lastName: "Shah", billingAddress: "4, FC Road", city: "Pune", dateOfBirth: "2020-01-01", gstin: "nope" }, "edit");
        expect(edit.mobile).toBeUndefined();
        expect(edit.dateOfBirth).toBeUndefined();
        // AGE-1: any real date is taken — a child's too; a day in the future is not.
        const future = advertiserProblemsOf({ ...EMPTY_ADVERTISER_VALUES, firstName: "Meera", lastName: "Shah", billingAddress: "4, FC Road", city: "Pune", dateOfBirth: "2999-01-01" }, "edit");
        expect(future.dateOfBirth).toBe("Not a day in the future.");
        expect(edit.gstin).toBe("A GSTIN is 15 characters, like 22AAAAA0000A1Z5.");

        render(<AdvertiserOnboardingForm mode="create" />);
        fireEvent.click(screen.getByTestId("af-submit"));
        expect(within(screen.getByTestId("af-firstName")).getByRole("alert").textContent).toBe("Needed — the app asks for it.");
        expect(within(screen.getByTestId("af-billingAddress")).getByRole("alert").textContent).toBe("Needed — the app asks for it before the first booking.");
        expect(screen.getByText("5 fields still needed — the app's rules.")).toBeTruthy();
        expect(backend.calls.filter((call) => call.method === "POST")).toHaveLength(0);
    });

    it("sends the desk's fields as POST /advertisers on behalf, the person's name composed and blanks left off", async () => {
        const onCreated = vi.fn();
        render(<AdvertiserOnboardingForm mode="create" onCreated={onCreated} />);
        type("First name", "Meera");
        type("Last name", "Shah");
        type("Mobile", "98765 43210");
        type("Email (optional)", "meera@example.in");
        type("Date of birth (optional)", "1988-02-14");
        type("Billing address", "4, FC Road, Pune");
        type("City", "Pune");
        type("GSTIN (optional)", "27abcde1234f1z5");
        fireEvent.click(screen.getByTestId("af-submit"));
        await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
        const post = backend.calls.find((call) => call.method === "POST" && call.path === "/advertisers");
        expect(post?.body).toEqual({
            name: "Meera Shah",
            mobile: "9876543210",
            type: "INDIVIDUAL",
            email: "meera@example.in",
            firstName: "Meera",
            lastName: "Shah",
            dateOfBirth: "1988-02-14",
            billingAddress: "4, FC Road, Pune",
            city: "Pune",
            gstin: "27ABCDE1234F1Z5",
            onBehalf: true,
        });
        expect(onCreated.mock.calls[0]![0]).toMatchObject({ id: "adv_new", displayId: "ADV-1709-2601" });
    });

    it("prefills the edit from the row and the person behind it, and saves without the number", async () => {
        const onSaved = vi.fn();
        render(<AdvertiserOnboardingForm mode="edit" advertiserId="adv_1" initial={advertiserValuesOf(held)} onSaved={onSaved} />);
        const mobile = screen.getByLabelText("Mobile") as HTMLInputElement;
        expect(mobile.value).toBe("+919876543210");
        expect(mobile.disabled).toBe(true);
        expect((screen.getByLabelText("First name") as HTMLInputElement).value).toBe("Meera");
        expect((screen.getByLabelText("Registered company name") as HTMLInputElement).value).toBe("Menon Retail");
        expect((screen.getByLabelText("Date of birth (optional)") as HTMLInputElement).value).toBe("1988-02-14");
        type("Billing address", "12, MG Road, Pune");
        fireEvent.click(screen.getByTestId("af-submit"));
        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
        const patch = backend.calls.find((call) => call.method === "PATCH");
        expect(patch?.path).toBe("/advertisers/adv_1");
        expect(patch?.body).toEqual({
            name: "Meera Shah",
            email: "meera@example.in",
            type: "COMMERCIAL",
            companyName: "Menon Retail",
            industry: "Retail",
            city: "Pune",
            state: "Maharashtra",
            firstName: "Meera",
            lastName: "Shah",
            dateOfBirth: "1988-02-14",
            gender: "FEMALE",
            billingAddress: "12, MG Road, Pune",
            gstin: "27ABCDE1234F1Z5",
        });
        expect(patch?.body).not.toHaveProperty("mobile");
    });

    /* AD-1: the PIN and the country on the billing address — optional, six digits when given, a row of two. */
    it("takes a six-digit PIN and a country, refuses any other PIN, and leaves both off the wire when blank", () => {
        expect(advertiserProblemsOf({ ...EMPTY_ADVERTISER_VALUES, postalCode: "56001" }, "edit").postalCode).toBe("A PIN is six digits.");
        expect(advertiserProblemsOf({ ...EMPTY_ADVERTISER_VALUES, postalCode: "560001", country: "India" }, "edit").postalCode).toBeUndefined();
        const values = advertiserValuesOf({ ...held, postalCode: "411004", country: "India" });
        expect(values.postalCode).toBe("411004");
        expect(values.country).toBe("India");
        render(<AdvertiserOnboardingForm mode="edit" advertiserId="adv_1" initial={advertiserValuesOf(held)} />);
        expect((screen.getByLabelText("PIN code (optional)") as HTMLInputElement).value).toBe("");
        expect((screen.getByLabelText("Country (optional)") as HTMLInputElement).value).toBe("");
    });

    it("offers the row's name split while no account backs the profile", () => {
        const values = advertiserValuesOf({ ...held, userId: null, person: null, name: "Rohan Mehta" });
        expect(values.firstName).toBe("Rohan");
        expect(values.lastName).toBe("Mehta");
    });

    it("shows a server refusal on the field it names", async () => {
        backend.refuse = { status: 400, code: "VALIDATION_ERROR", message: "Invalid request", fieldErrors: { gstin: ["Enter a valid 15-character GSTIN"] } };
        render(<AdvertiserOnboardingForm mode="edit" advertiserId="adv_1" initial={advertiserValuesOf(held)} />);
        fireEvent.click(screen.getByTestId("af-submit"));
        await waitFor(() => expect(within(screen.getByTestId("af-gstin")).getByRole("alert").textContent).toBe("Enter a valid 15-character GSTIN"));
        expect(screen.getByText("Invalid request")).toBeTruthy();
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
const filledIn = () => {
    type("First name", "Meera");
    type("Last name", "Shah");
    type("Mobile", "9876543210");
    type("Billing address", "4, FC Road, Pune");
    type("City", "Pune");
};

describe("the account type — DR 08's three, with the entity type beside it", () => {
    it("offers Individual, Business and Organisation, and the entity select only for a business or an organisation, filtered", async () => {
        render(<AdvertiserOnboardingForm mode="create" />);
        openSelect("Account type");
        expect(await optionNames()).toEqual(["Individual", "Business", "Organisation"]);
        closeSelect();
        expect(screen.queryByTestId("af-entityType")).not.toBeInTheDocument();

        await pick("Account type", "Business");
        expect(screen.getByLabelText("Entity type")).toHaveTextContent("Not chosen yet");
        expect(screen.getByTestId("af-entity-rule")).toHaveTextContent(
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

        await pick("Account type", "Individual");
        expect(screen.queryByTestId("af-entityType")).not.toBeInTheDocument();
    });

    it("creates an educational institution: Organisation · Government or education goes up as NGO with the entity type", async () => {
        const onCreated = vi.fn();
        render(<AdvertiserOnboardingForm mode="create" onCreated={onCreated} />);
        await pick("Account type", "Organisation");
        await pick("Entity type", "Government or education");
        filledIn();
        type("Registered company name", "St. Mary's College");
        fireEvent.click(screen.getByTestId("af-submit"));
        await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
        const post = backend.calls.find((call) => call.method === "POST" && call.path === "/advertisers");
        expect(post?.body).toMatchObject({ type: "NGO", entityType: "GOVERNMENT_EDUCATION", companyName: "St. Mary's College", onBehalf: true });
    });

    it("sends a business as COMMERCIAL, with the entity type only when one is chosen", async () => {
        const onCreated = vi.fn();
        render(<AdvertiserOnboardingForm mode="create" onCreated={onCreated} />);
        await pick("Account type", "Business");
        filledIn();
        type("Registered company name", "Menon Retail");
        fireEvent.click(screen.getByTestId("af-submit"));
        await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
        const body = backend.calls.find((call) => call.method === "POST")!.body as Record<string, unknown>;
        expect(body.type).toBe("COMMERCIAL");
        expect(body).not.toHaveProperty("entityType");
    });

    it("derives the legacy type, and an edit's account type from it", () => {
        expect(advertiserTypeOf("INDIVIDUAL", null)).toBe("INDIVIDUAL");
        expect(advertiserTypeOf("BUSINESS", null)).toBe("COMMERCIAL");
        expect(advertiserTypeOf("BUSINESS", "AGENCY")).toBe("AGENCY");
        expect(advertiserTypeOf("ORGANISATION", "AGENCY")).toBe("NGO");
        expect(advertiserTypeOf("ORGANISATION", null)).toBe("NGO");
        expect(advertiserValuesOf({ ...held, type: "INDIVIDUAL" }).accountType).toBe("INDIVIDUAL");
        expect(advertiserValuesOf({ ...held, type: "COMMERCIAL" }).accountType).toBe("BUSINESS");
        expect(advertiserValuesOf({ ...held, type: "AGENCY" }).accountType).toBe("BUSINESS");
        expect(advertiserValuesOf({ ...held, type: "NGO" }).accountType).toBe("ORGANISATION");
    });

    it("keeps an agency an agency on edit", async () => {
        const onSaved = vi.fn();
        render(<AdvertiserOnboardingForm mode="edit" advertiserId="adv_1" initial={advertiserValuesOf({ ...held, type: "AGENCY" })} entity={{ value: null, verified: false }} onSaved={onSaved} />);
        expect(screen.getByLabelText("Account type")).toHaveTextContent("Business");
        await pick("Entity type", "Company");
        fireEvent.click(screen.getByTestId("af-submit"));
        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
        expect(backend.calls.find((call) => call.method === "PATCH")!.body).toMatchObject({ type: "AGENCY", entityType: "COMPANY" });
    });
});

describe("the entity type (Phase D)", () => {
    const patches = () => backend.calls.filter((call) => call.method === "PATCH");
    const individual = () => advertiserValuesOf({ ...held, type: "INDIVIDUAL" });

    it("starts from the row, and rides the PATCH only when the desk changed it", async () => {
        // A commercial account nobody has typed: nothing chosen, and saving as it stands sends no entity type.
        const onSaved = vi.fn();
        render(<AdvertiserOnboardingForm mode="edit" advertiserId="adv_1" initial={advertiserValuesOf(held)} entity={{ value: null, verified: false }} onSaved={onSaved} />);
        expect(screen.getByLabelText("Entity type")).toHaveTextContent("Not chosen yet");
        expect(screen.getByTestId("af-entity-rule")).toHaveTextContent("While none is chosen, it is asked when verification starts.");
        fireEvent.click(screen.getByTestId("af-submit"));
        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
        expect(patches()[0]!.body).not.toHaveProperty("entityType");

        // A business is offered a business's kinds; the chosen one is sent.
        openSelect("Entity type");
        expect(await optionNames()).toEqual(["Sole proprietor", "Company", "LLP or partnership", "Other entity (HUF, co-operative, AOP, …)"]);
        fireEvent.click(screen.getByRole("option", { name: "LLP or partnership" }));
        fireEvent.click(screen.getByTestId("af-submit"));
        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2));
        expect(patches()[1]!.body).toMatchObject({ entityType: "LLP_PARTNERSHIP", type: "COMMERCIAL" });
        // An unverified account is not asked to confirm anything.
        expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    it("an organisation chosen on edit clears a business kind; the desk picks again and the type goes up as NGO", async () => {
        const onSaved = vi.fn();
        render(<AdvertiserOnboardingForm mode="edit" advertiserId="adv_1" initial={advertiserValuesOf(held)} entity={{ value: "COMPANY", verified: false, stored: true }} onSaved={onSaved} />);
        expect(screen.getByLabelText("Entity type")).toHaveTextContent("Company");
        await pick("Account type", "Organisation");
        expect(screen.getByLabelText("Entity type")).toHaveTextContent("Not chosen yet");
        fireEvent.click(screen.getByTestId("af-submit"));
        expect(within(screen.getByTestId("af-entityType")).getByRole("alert")).toHaveTextContent("Choose the kind again — Company is not a kind of organisation.");
        expect(patches()).toHaveLength(0);
        await pick("Entity type", "Government or education");
        fireEvent.click(screen.getByTestId("af-submit"));
        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
        expect(patches()[0]!.body).toMatchObject({ type: "NGO", entityType: "GOVERNMENT_EDUCATION" });
    });

    it("explains 409 KYC_LOCKED: a verified account's type only moves from Individual to a business form", async () => {
        const onSaved = vi.fn();
        render(<AdvertiserOnboardingForm mode="edit" advertiserId="adv_1" initial={advertiserValuesOf(held)} entity={{ value: "COMPANY", verified: true }} onSaved={onSaved} />);
        expect(screen.getByLabelText("Entity type")).toHaveTextContent("Company");
        expect(screen.getByTestId("af-entity-rule")).toHaveTextContent("its entity type can only move from Individual to a business form, and that restarts verification");
        await pick("Entity type", "Sole proprietor");
        backend.refuse = { status: 409, code: "KYC_LOCKED", message: "The entity type is locked." };
        fireEvent.click(screen.getByTestId("af-submit"));
        await waitFor(() =>
            expect(
                screen.getByText("This account is verified, so its entity type can only move from Individual to a business form, and that restarts verification. Nothing in this save was written."),
            ).toBeInTheDocument(),
        );
        expect(patches()).toHaveLength(1);
        expect(patches()[0]!.body).toMatchObject({ entityType: "SOLE_PROPRIETOR" });
        expect(onSaved).not.toHaveBeenCalled();
    });

    it("confirms a verified Individual becoming a business before saving, in the desk's words", async () => {
        const onSaved = vi.fn();
        render(<AdvertiserOnboardingForm mode="edit" advertiserId="adv_1" initial={individual()} entity={{ value: "INDIVIDUAL", verified: true }} onSaved={onSaved} />);
        expect(screen.queryByTestId("af-entityType")).not.toBeInTheDocument();
        await pick("Account type", "Business");
        // Individual is not a kind of business: cleared, and on a verified account it has to be chosen.
        expect(screen.getByLabelText("Entity type")).toHaveTextContent("Not chosen yet");
        fireEvent.click(screen.getByTestId("af-submit"));
        expect(within(screen.getByTestId("af-entityType")).getByRole("alert")).toHaveTextContent("Choose the kind again — Individual is not a kind of business.");
        await pick("Entity type", "Company");
        fireEvent.click(screen.getByTestId("af-submit"));

        // Nothing is saved until the desk has read what the change does.
        const confirm = await screen.findByRole("alertdialog");
        expect(confirm).toHaveTextContent("Change the entity type to Company?");
        expect(confirm).toHaveTextContent("This account goes back to 'verification pending' until the business is verified.");
        expect(patches()).toHaveLength(0);

        fireEvent.click(within(confirm).getByRole("button", { name: "Save and restart verification" }));
        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
        expect(patches()).toHaveLength(1);
        expect(patches()[0]!.body).toMatchObject({ entityType: "COMPANY", type: "COMMERCIAL" });
    });

    it("says Digio failing the upgrade in the owner's words, and saves nothing as done", async () => {
        const onSaved = vi.fn();
        render(<AdvertiserOnboardingForm mode="edit" advertiserId="adv_1" initial={individual()} entity={{ value: "INDIVIDUAL", verified: true }} onSaved={onSaved} />);
        await pick("Account type", "Business");
        await pick("Entity type", "Company");
        backend.refuse = { status: 502, code: "KYC_PROVIDER_REFUSED", message: "Digio refused the request." };
        fireEvent.click(screen.getByTestId("af-submit"));
        fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Save and restart verification" }));
        await waitFor(() => expect(screen.getByText("Online verification isn't available for this account type yet. Please contact ADX support.")).toBeInTheDocument());
        expect(onSaved).not.toHaveBeenCalled();
    });
});

describe("the billing address — the Find the address bar over it", () => {
    const FC_ROAD = { formattedAddress: "4, FC Road, Shivajinagar, Pune, Maharashtra 411004", latitude: 18.52, longitude: 73.84, placeId: "pl_fc", city: "Pune", state: "Maharashtra", postalCode: "411004", name: "FC Road" };
    const box = () => screen.getByLabelText("Billing address") as HTMLInputElement;
    const finder = () => screen.getByLabelText("Find the address") as HTMLInputElement;

    it("fills only what the place names, and never the country", () => {
        const typed = { ...EMPTY_ADVERTISER_VALUES, billingAddress: "4, FC", city: "Poona", state: "MH", postalCode: "411000", country: "India" };
        expect(withBillingPlace(typed, FC_ROAD)).toMatchObject({ billingAddress: FC_ROAD.formattedAddress, city: "Pune", state: "Maharashtra", postalCode: "411004", country: "India" });
        expect(withBillingPlace(typed, { ...FC_ROAD, city: null, state: null, postalCode: null })).toMatchObject({ city: "Poona", state: "MH", postalCode: "411000" });
    });

    it("a pick on the create fills the line, the city, the state and the PIN, and the save sends them without coordinates", async () => {
        backend.geo.set("/geo/autocomplete", [{ placeId: "pl_fc", description: "FC Road, Pune", mainText: "FC Road", secondaryText: "Shivajinagar, Pune" }]);
        backend.geo.set("/geo/places/pl_fc", FC_ROAD);
        const onCreated = vi.fn();
        render(<AdvertiserOnboardingForm mode="create" onCreated={onCreated} />);
        type("First name", "Meera");
        type("Last name", "Shah");
        type("Mobile", "9876543210");
        expect(finder().placeholder).toBe("Type a building, street or landmark");
        expect(box().placeholder).toBe("Building, street, area");
        expect((screen.getByLabelText("PIN code (optional)") as HTMLInputElement).placeholder).toBe("Six digits — 560001");
        expect(screen.queryByTestId("pin-picker-map")).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/latitude/i)).not.toBeInTheDocument();
        fireEvent.focus(finder());
        type("Find the address", "FC Road");
        fireEvent.click(await screen.findByRole("option"));
        await waitFor(() => expect(box().value).toBe(FC_ROAD.formattedAddress));
        expect((screen.getByLabelText("City") as HTMLInputElement).value).toBe("Pune");
        expect((screen.getByLabelText("State (optional)") as HTMLInputElement).value).toBe("Maharashtra");
        expect((screen.getByLabelText("PIN code (optional)") as HTMLInputElement).value).toBe("411004");
        expect((screen.getByLabelText("Country (optional)") as HTMLInputElement).value).toBe("");

        fireEvent.click(screen.getByTestId("af-submit"));
        await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
        const post = backend.calls.find((call) => call.method === "POST" && call.path === "/advertisers");
        expect(post?.body).toMatchObject({ billingAddress: FC_ROAD.formattedAddress, city: "Pune", state: "Maharashtra", postalCode: "411004" });
        expect(post?.body).not.toHaveProperty("latitude");
        expect(post?.body).not.toHaveProperty("longitude");
    });

    it("a pick on the edit is saved in the PATCH", async () => {
        backend.geo.set("/geo/autocomplete", [{ placeId: "pl_fc", description: "FC Road, Pune", mainText: "FC Road", secondaryText: null }]);
        backend.geo.set("/geo/places/pl_fc", FC_ROAD);
        const onSaved = vi.fn();
        render(<AdvertiserOnboardingForm mode="edit" advertiserId="adv_1" initial={advertiserValuesOf(held)} onSaved={onSaved} />);
        fireEvent.focus(finder());
        type("Find the address", "FC Road");
        fireEvent.click(await screen.findByRole("option"));
        await waitFor(() => expect(box().value).toBe(FC_ROAD.formattedAddress));
        fireEvent.click(screen.getByTestId("af-submit"));
        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
        const patch = backend.calls.find((call) => call.method === "PATCH");
        expect(patch?.body).toMatchObject({ billingAddress: FC_ROAD.formattedAddress, city: "Pune", state: "Maharashtra", postalCode: "411004" });
        expect(patch?.body).not.toHaveProperty("latitude");
    });

    it("with the vendor silent the typed address still saves", async () => {
        const onCreated = vi.fn();
        render(<AdvertiserOnboardingForm mode="create" onCreated={onCreated} />);
        filledIn();
        fireEvent.focus(finder());
        type("Find the address", "4, FC Road");
        await waitFor(() => expect(backend.calls.some((call) => call.path.startsWith("/geo/autocomplete"))).toBe(true));
        type("Billing address", "4, FC Road, Pune");
        fireEvent.click(screen.getByTestId("af-submit"));
        await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
        const post = backend.calls.find((call) => call.method === "POST" && call.path === "/advertisers");
        expect(post?.body).toMatchObject({ billingAddress: "4, FC Road, Pune", city: "Pune" });
    });
});
