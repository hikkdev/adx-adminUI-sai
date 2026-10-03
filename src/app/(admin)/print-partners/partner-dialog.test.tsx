import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * The print partner's Edit dialog and the entity type — Phase D (the
 * owner, 1 Oct 2026).
 *
 * What is pinned: the edit offers "Entity type" with the four a print
 * partner may verify as (a new partner's dialog does not); the PATCH names
 * it only when the desk chose one the row does not carry; 409 `KYC_LOCKED`
 * is explained; a verified Individual becoming a business is confirmed, in
 * the desk's words, before anything is sent; and Digio failing that
 * upgrade is said in the owner's words.
 *
 * Onboarding addresses (the owner, 1 Oct 2026): the shop's address is found
 * with the one "Find the address" bar — no map, no coordinate inputs. A pick
 * fills the address, the city, the state and the PIN and keeps the pin
 * silently, which rides the save as `latitude` / `longitude`; with the
 * vendor silent the typed address still saves, with no pin.
 */

const backend = vi.hoisted(() => ({
    calls: [] as { method: string; path: string; body?: unknown }[],
    refuse: null as { status: number; code: string; message: string; details?: unknown } | null,
    /* The geo answers, by path prefix; a geo path with none is the vendor saying nothing. */
    geo: new Map<string, unknown>(),
    reset() {
        this.calls = [];
        this.refuse = null;
        this.geo.clear();
    },
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

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
        if (method === "GET") {
            // The server's lists: a print partner may be one of four.
            return {
                PUBLISHER: [],
                ADVERTISER: [],
                PRINT_PARTNER: [
                    { value: "INDIVIDUAL", label: "Individual" },
                    { value: "SOLE_PROPRIETOR", label: "Sole proprietor" },
                    { value: "COMPANY", label: "Company" },
                    { value: "LLP_PARTNERSHIP", label: "LLP or partnership" },
                ],
            };
        }
        if (backend.refuse) throw new actual.ApiError(backend.refuse.status, backend.refuse.code, backend.refuse.message, backend.refuse.details);
        return { ...shop, ...(body as object) };
    };
    return {
        ...actual,
        api: {
            ...actual.api,
            get: (path: string) => wrap("GET", path),
            post: (path: string, body?: unknown) => wrap("POST", path, body),
            patch: (path: string, body?: unknown) => wrap("PATCH", path, body),
        },
    };
});

// The catalogue's city picker, stubbed to a plain box: the dialog's contract with it is the value.
vi.mock("@/components/adx/city-combobox", () => ({
    CityCombobox: ({ id, value, onChange }: { id: string; value: string; onChange: (city: string) => void }) => <input id={id} aria-label="City" value={value} onChange={(event) => onChange(event.target.value)} />,
}));

import type { PrintPartner } from "@/services/print-partners";
import { PartnerDialog, partnerPatch } from "./partner-dialog";

const shop = {
    id: "prt_1",
    displayId: "PRT-1209-2601",
    userId: "usr_prt",
    name: "Asha Prints",
    legalName: null,
    gstin: null,
    panNumber: null,
    contactName: null,
    mobile: "+919845012345",
    email: null,
    address: null,
    city: "Pune",
    state: null,
    postalCode: null,
    latitude: null,
    longitude: null,
    capabilities: ["flex"],
    maxWidthFt: null,
    turnaroundDays: null,
    isActive: true,
    notes: null,
    activatedAt: null,
    activatedById: null,
    acceptsQuoteRequests: true,
    rateCard: { fileId: null, rows: [] },
    invoiceUploadFileId: null,
    kycStatus: "PENDING",
    entityType: null,
    entityTypeStored: false,
    createdAt: "2026-09-12T00:00:00.000Z",
    updatedAt: "2026-09-12T00:00:00.000Z",
} as unknown as PrintPartner;

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
    toast.error.mockReset();
});

/** Opens the Radix select by keyboard (jsdom has no pointer) and picks the option. */
const pickEntity = async (option: string) => {
    fireEvent.keyDown(screen.getByLabelText("Entity type"), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: option }));
};
const patches = () => backend.calls.filter((call) => call.method === "PATCH");

describe("partnerPatch", () => {
    it("names the entity type only when the desk chose one the row does not carry", () => {
        const draft = { name: "Asha Prints", mobile: "+919845012345", legalName: "", gstin: "", panNumber: "", contactName: "", email: "", address: "", city: "Pune", state: "", postalCode: "", latitude: null, longitude: null, capabilities: "flex", maxWidthFt: "", turnaroundDays: "", notes: "" };
        expect(partnerPatch(shop, { ...draft, entityType: "" })).toEqual({});
        expect(partnerPatch(shop, { ...draft, entityType: "COMPANY" })).toEqual({ entityType: "COMPANY" });
        expect(partnerPatch({ ...shop, entityType: "COMPANY" }, { ...draft, entityType: "COMPANY" })).toEqual({});
    });
});

describe("PartnerDialog — the entity type", () => {
    it("is offered on an edit with the four a print partner may be, and not while adding a partner", async () => {
        const { unmount } = render(<PartnerDialog open onOpenChange={() => {}} onSaved={() => {}} />);
        expect(screen.queryByTestId("partner-entity-type")).not.toBeInTheDocument();
        unmount();

        render(<PartnerDialog open onOpenChange={() => {}} partner={shop} onSaved={() => {}} />);
        expect(screen.getByLabelText("Entity type")).toHaveTextContent("Not chosen yet");
        expect(screen.getByTestId("partner-entity-type")).toHaveTextContent("While none is chosen, it is asked when verification starts.");
        await waitFor(() => expect(backend.calls).toContainEqual({ method: "GET", path: "/kyc/entity-types", body: undefined }));
        fireEvent.keyDown(screen.getByLabelText("Entity type"), { key: "ArrowDown" });
        expect((await screen.findAllByRole("option")).map((option) => option.textContent)).toEqual(["Individual", "Sole proprietor", "Company", "LLP or partnership"]);
    });

    it("sends the chosen type alone on an unverified shop, with nothing to confirm", async () => {
        const onSaved = vi.fn();
        render(<PartnerDialog open onOpenChange={() => {}} partner={shop} onSaved={onSaved} />);
        // Nothing changed yet: there is nothing to save.
        expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
        await pickEntity("Sole proprietor");
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(patches()).toEqual([{ method: "PATCH", path: "/print-partners/prt_1", body: { entityType: "SOLE_PROPRIETOR" } }]);
        expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    it("explains 409 KYC_LOCKED on a verified shop", async () => {
        const onSaved = vi.fn();
        render(<PartnerDialog open onOpenChange={() => {}} partner={{ ...shop, kycStatus: "VERIFIED", entityType: "COMPANY", entityTypeStored: true }} onSaved={onSaved} />);
        expect(screen.getByTestId("partner-entity-type")).toHaveTextContent("its entity type can only move from Individual to a business form, and that restarts verification");
        await pickEntity("LLP or partnership");
        backend.refuse = { status: 409, code: "KYC_LOCKED", message: "Locked", details: { party: "PRINT_PARTNER", entityType: "COMPANY" } };
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith("The entity type was not changed", {
                description: "This account is verified, so its entity type can only move from Individual to a business form, and that restarts verification. Nothing in this save was written.",
            }),
        );
        expect(onSaved).not.toHaveBeenCalled();
    });

    it("confirms a verified Individual becoming a business before saving, and says Digio's refusal in the owner's words", async () => {
        const onSaved = vi.fn();
        render(<PartnerDialog open onOpenChange={() => {}} partner={{ ...shop, kycStatus: "VERIFIED", entityType: "INDIVIDUAL", entityTypeStored: true }} onSaved={onSaved} />);
        await pickEntity("Company");
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

        const confirm = await screen.findByRole("alertdialog");
        expect(confirm).toHaveTextContent("Change the entity type to Company?");
        expect(confirm).toHaveTextContent("This account goes back to 'verification pending' until the business is verified.");
        expect(patches()).toHaveLength(0);

        backend.refuse = { status: 503, code: "KYC_PROVIDER_UNAVAILABLE", message: "Digio did not answer", details: { provider: "DIGIO", reason: "PROVIDER_ERROR" } };
        fireEvent.click(within(confirm).getByRole("button", { name: "Save and restart verification" }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Digio isn't answering right now. Try again in a few minutes."));
        expect(onSaved).not.toHaveBeenCalled();

        backend.refuse = null;
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
        fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Save and restart verification" }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(patches().at(-1)).toEqual({ method: "PATCH", path: "/print-partners/prt_1", body: { entityType: "COMPANY" } });
    });
});

describe("PartnerDialog — the shop's address: the bar over the boxes, no map", () => {
    const addressBox = () => screen.getByLabelText("Address") as HTMLInputElement;
    const search = () => screen.getByLabelText("Find the address") as HTMLInputElement;
    const posts = () => backend.calls.filter((call) => call.method === "POST");
    const LAXMI = { formattedAddress: "221, Laxmi Road, Pune, Maharashtra 411030", latitude: 18.5134, longitude: 73.8567, placeId: "pl_7", city: "Pune", state: "Maharashtra", postalCode: "411030", name: "Laxmi Road" };

    it("shows the bar and the boxes, and no map or coordinate inputs", () => {
        render(<PartnerDialog open onOpenChange={() => {}} onSaved={() => {}} />);
        expect(search().placeholder).toBe("Type a building, street or landmark");
        expect(addressBox().placeholder).toBe("Building, street, area");
        expect(screen.getByLabelText("State")).toBeInTheDocument();
        expect((screen.getByLabelText("PIN code") as HTMLInputElement).placeholder).toBe("Six digits — 560001");
        expect(screen.queryByTestId("pin-picker")).not.toBeInTheDocument();
        expect(screen.queryByTestId("pin-picker-map")).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/latitude/i)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/longitude/i)).not.toBeInTheDocument();
    });

    it("a pick fills the address, the city, the state and the PIN, and the pin rides the new partner unseen", async () => {
        backend.geo.set("/geo/autocomplete", [{ placeId: "pl_7", description: "Laxmi Road, Pune", mainText: "Laxmi Road", secondaryText: "Pune, Maharashtra" }]);
        backend.geo.set("/geo/places/pl_7", LAXMI);
        const onSaved = vi.fn();
        render(<PartnerDialog open onOpenChange={() => {}} onSaved={onSaved} />);
        fireEvent.change(screen.getByLabelText("Shop name"), { target: { value: "Asha Prints" } });
        fireEvent.change(screen.getByLabelText("Mobile"), { target: { value: "+919845012345" } });

        fireEvent.focus(search());
        fireEvent.change(search(), { target: { value: "Laxmi Road" } });
        fireEvent.click(await screen.findByRole("option"));

        await waitFor(() => expect(addressBox().value).toBe(LAXMI.formattedAddress));
        expect((screen.getByLabelText("City") as HTMLInputElement).value).toBe("Pune");
        expect((screen.getByLabelText("State") as HTMLInputElement).value).toBe("Maharashtra");
        expect((screen.getByLabelText("PIN code") as HTMLInputElement).value).toBe("411030");
        expect(screen.queryByDisplayValue("18.5134")).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Add partner" }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(posts()[0]).toMatchObject({
            path: "/print-partners",
            body: { name: "Asha Prints", mobile: "+919845012345", address: LAXMI.formattedAddress, city: "Pune", state: "Maharashtra", postalCode: "411030", latitude: 18.5134, longitude: 73.8567 },
        });
    });

    it("an edit sends the picked address and its pin, and typing over the line keeps the pin", async () => {
        backend.geo.set("/geo/autocomplete", [{ placeId: "pl_8", description: "FC Road, Pune", mainText: "FC Road", secondaryText: "Pune" }]);
        backend.geo.set("/geo/places/pl_8", { formattedAddress: "4, FC Road, Pune 411004", latitude: 18.52, longitude: 73.84, placeId: "pl_8", city: "Pune", state: "Maharashtra", postalCode: "411004", name: "FC Road" });
        const onSaved = vi.fn();
        render(<PartnerDialog open onOpenChange={() => {}} partner={shop} onSaved={onSaved} />);
        fireEvent.focus(search());
        fireEvent.change(search(), { target: { value: "FC Road" } });
        fireEvent.click(await screen.findByRole("option"));
        await waitFor(() => expect(addressBox().value).toBe("4, FC Road, Pune 411004"));
        fireEvent.change(addressBox(), { target: { value: "Shop 4, FC Road, Pune 411004" } });

        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(patches()).toEqual([
            { method: "PATCH", path: "/print-partners/prt_1", body: { address: "Shop 4, FC Road, Pune 411004", state: "Maharashtra", postalCode: "411004", latitude: 18.52, longitude: 73.84 } },
        ]);
    });

    it("an edit that only retypes the address keeps the row's pin out of the PATCH", async () => {
        const onSaved = vi.fn();
        render(<PartnerDialog open onOpenChange={() => {}} partner={{ ...shop, address: "221, Laxmi Road", latitude: 18.5134, longitude: 73.8567 }} onSaved={onSaved} />);
        fireEvent.change(addressBox(), { target: { value: "223, Laxmi Road" } });
        fireEvent.change(screen.getByLabelText("PIN code"), { target: { value: "411030" } });
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(patches()).toEqual([{ method: "PATCH", path: "/print-partners/prt_1", body: { address: "223, Laxmi Road", postalCode: "411030" } }]);
    });

    it("refuses a PIN that is not six digits", () => {
        render(<PartnerDialog open onOpenChange={() => {}} partner={shop} onSaved={() => {}} />);
        fireEvent.change(screen.getByLabelText("PIN code"), { target: { value: "41103" } });
        expect(screen.getByLabelText("PIN code")).toHaveAttribute("aria-invalid", "true");
        expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    });

    it("with the vendor silent the typed address still saves, with no pin", async () => {
        const onSaved = vi.fn();
        render(<PartnerDialog open onOpenChange={() => {}} onSaved={onSaved} />);
        fireEvent.change(screen.getByLabelText("Shop name"), { target: { value: "Asha Prints" } });
        fireEvent.change(screen.getByLabelText("Mobile"), { target: { value: "+919845012345" } });
        fireEvent.focus(search());
        fireEvent.change(search(), { target: { value: "Laxmi Road" } });
        await screen.findByText("The maps vendor did not answer.");
        fireEvent.change(addressBox(), { target: { value: "221, Laxmi Road, Pune" } });

        fireEvent.click(screen.getByRole("button", { name: "Add partner" }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(posts()[0]).toMatchObject({ body: { address: "221, Laxmi Road, Pune", latitude: null, longitude: null } });
    });
});
