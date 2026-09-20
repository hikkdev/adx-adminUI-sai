import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * QR-15 — the desk onboards an advertiser the way the app does.
 *
 * Pinned: the form's rules are the app's (a company name only for anyone
 * but an individual; the billing address and city for everyone); a create
 * sends the desk's fields as `POST /advertisers { onBehalf }` with the
 * person's name composed and blanks left off; edit mode prefills from the
 * row and the person behind it and sends `PATCH /advertisers/:id` without
 * the number; and a server refusal is shown on the field it names.
 */

const { backend } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string; body?: unknown }[],
        refuse: null as { status: number; code: string; message: string; fieldErrors?: Record<string, string[]> } | null,
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

import { AdvertiserOnboardingForm, EMPTY_ADVERTISER_VALUES, advertiserProblemsOf, advertiserValuesOf } from "./advertiser-onboarding-form";
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
});

describe("AdvertiserOnboardingForm", () => {
    it("applies the app's rules — the billing address and city for everyone, a company name for anyone but an individual", () => {
        const empty = advertiserProblemsOf(EMPTY_ADVERTISER_VALUES, "create");
        expect(Object.keys(empty).sort()).toEqual(["billingAddress", "city", "firstName", "lastName", "mobile"]);
        expect(advertiserProblemsOf({ ...EMPTY_ADVERTISER_VALUES, type: "COMMERCIAL" }, "create").companyName).toBe("Needed for a company or organisation — the app asks for it.");
        expect(advertiserProblemsOf({ ...EMPTY_ADVERTISER_VALUES, type: "INDIVIDUAL" }, "create").companyName).toBeUndefined();
        // The edit does not ask for the number; a bad date of birth or GSTIN is still refused.
        const edit = advertiserProblemsOf({ ...EMPTY_ADVERTISER_VALUES, firstName: "Meera", lastName: "Shah", billingAddress: "4, FC Road", city: "Pune", dateOfBirth: "2020-01-01", gstin: "nope" }, "edit");
        expect(edit.mobile).toBeUndefined();
        expect(edit.dateOfBirth).toBe("Must be 18 or over.");
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
