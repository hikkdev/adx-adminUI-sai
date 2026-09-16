import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * AD-C: the listing form takes its point through the shared pin picker
 * now. What this pins is that `POST /listings` still carries exactly what
 * it did — `latitude` and `longitude` as numbers beside the address, the
 * media type and the price — whether the point was typed into the
 * picker's inputs or written back by a pick or a drag, that "Use this
 * address" fills the address field, and that the form stays unsubmittable
 * until both coordinates are there.
 */

const { backend, router, toast } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string; body?: unknown }[],
        reset() {
            this.calls = [];
        },
    },
    router: { push: vi.fn() },
    toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        if (path === "/listings" && method === "POST") return { id: "lst_new" };
        if (path.startsWith("/geo/reverse")) return { formattedAddress: "Powai, Mumbai, Maharashtra 400076", latitude: 19.1234567, longitude: 72.9876543, placeId: "pl_9", city: "Mumbai", state: "Maharashtra", postalCode: "400076" };
        return [];
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

/* The price line asks the server on every settled keystroke; it is not what this test is about. */
vi.mock("@/components/adx/price-indicator", () => ({ PriceIndicatorLine: () => <p data-testid="price-line" /> }));
vi.mock("@/components/adx/city-combobox", () => ({
    CityCombobox: ({ id, value, onChange }: { id: string; value: string; onChange: (value: string, city: null) => void }) => <input id={id} value={value} onChange={(event) => onChange(event.target.value, null)} />,
}));
vi.mock("@/lib/use-maps-config", () => ({ useMapsConfig: () => ({ config: { provider: "GOOGLE", googleBrowserKey: "AIza-test" }, loading: false }) }));

vi.mock("@/components/adx/map", () => ({
    MapSurface: ({ points, onPointDragEnd }: { points: { id: string; latitude: number; longitude: number; title: string }[]; onPointDragEnd?: (point: unknown, at: { latitude: number; longitude: number }) => void }) => (
        <div data-testid="map-stub">
            {points.map((point) => (
                <span key={point.id} data-testid="marker" data-at={`${point.latitude},${point.longitude}`}>
                    {point.title}
                </span>
            ))}
            {onPointDragEnd && points[0] && (
                <button type="button" data-testid="drag-pin" onClick={() => onPointDragEnd(points[0], { latitude: 19.1234567, longitude: 72.9876543 })}>
                    drop
                </button>
            )}
        </div>
    ),
}));

import { ListingCreate } from "./listing-create";
import type { RosterPublisher } from "@/services/supply";
import type { Material, MediaType, SizeClass, VenueType } from "@/types/pricing-engine";

const publishers = [{ id: "pub_1", name: "Metro Spaces", mobile: "9876543210", city: "Mumbai", kycStatus: "VERIFIED", listingCount: 3 } as unknown as RosterPublisher];
const mediaTypes: MediaType[] = [
    {
        id: "mt_billboard",
        name: "Billboard",
        slug: "billboard",
        category: "OUTDOOR",
        description: null,
        status: "ACTIVE",
        origin: "SEEDED",
        venueTypeId: null,
        formatGroup: "Outdoor",
        mergedIntoId: null,
        mergedAt: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        sizeClassIds: [],
        materialIds: [],
    },
];
const sizeClasses: SizeClass[] = [{ id: "sc_40x20", name: "40 × 20", slug: "40x20", widthFt: "40", heightFt: "20", areaSqFt: "800", isActive: true }];
const venues: VenueType[] = [];
const materials: Material[] = [];

beforeEach(() => {
    backend.reset();
    router.push.mockReset();
    toast.success.mockReset();
});

const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const submit = () => screen.getByRole("button", { name: /Create listing/ });

/** Everything but the point: the parts of the form this test is not about. */
async function fillTheRest() {
    fireEvent.change(input("Site name"), { target: { value: "MG Road Billboard" } });
    fireEvent.change(input("Address"), { target: { value: "Western Express Highway" } });
    fireEvent.change(input("City"), { target: { value: "Mumbai" } });
    /* The spot type is the cmdk combobox: click to open, click the row. */
    fireEvent.click(screen.getByRole("combobox", { name: "Spot type" }));
    fireEvent.click(within(await screen.findByRole("listbox")).getByText("Billboard"));
    fireEvent.change(input("Width (ft)"), { target: { value: "40" } });
    fireEvent.change(input("Height (ft)"), { target: { value: "20" } });
    fireEvent.change(input("Base price (₹)"), { target: { value: "12500" } });
}

const posted = () => backend.calls.find((call) => call.method === "POST" && call.path === "/listings");

describe("ListingCreate with the pin picker", () => {
    it("posts the same payload as before: latitude and longitude as numbers, typed into the picker's inputs", async () => {
        render(<ListingCreate publishers={publishers} venues={venues} mediaTypes={mediaTypes} sizeClasses={sizeClasses} materials={materials} />);
        await fillTheRest();
        expect(submit()).toBeDisabled();

        fireEvent.change(input("Latitude"), { target: { value: "19.0760" } });
        expect(submit()).toBeDisabled();
        fireEvent.change(input("Longitude"), { target: { value: "72.8777" } });
        expect(screen.getByTestId("marker")).toHaveAttribute("data-at", "19.076,72.8777");
        expect(screen.getByTestId("marker")).toHaveTextContent("MG Road Billboard");
        expect(submit()).toBeEnabled();

        fireEvent.click(submit());
        await waitFor(() => expect(router.push).toHaveBeenCalledWith("/listings/lst_new"));
        expect(posted()?.body).toEqual({
            publisherId: "pub_1",
            title: "MG Road Billboard",
            category: "OUTDOOR",
            address: "Western Express Highway",
            city: "Mumbai",
            latitude: 19.076,
            longitude: 72.8777,
            mediaTypeId: "mt_billboard",
            /* Measured, not picked: the server names the class from the dimensions. */
            widthFt: "40",
            heightFt: "20",
            pricingUnit: "PER_DAY",
            basePrice: "12500",
        });
    });

    it("posts the point the pin was dropped at, and 'Use this address' fills the address", async () => {
        render(<ListingCreate publishers={publishers} venues={venues} mediaTypes={mediaTypes} sizeClasses={sizeClasses} materials={materials} />);
        await fillTheRest();
        fireEvent.change(input("Latitude"), { target: { value: "19" } });
        fireEvent.change(input("Longitude"), { target: { value: "72" } });

        fireEvent.click(screen.getByTestId("drag-pin"));
        expect(input("Latitude").value).toBe("19.123457");
        expect(input("Longitude").value).toBe("72.987654");

        fireEvent.click(await screen.findByRole("button", { name: "Use this address" }, { timeout: 2000 }));
        expect(input("Address").value).toBe("Powai, Mumbai, Maharashtra 400076");
        /* The city was already typed; the address does not overrule it. */
        expect(input("City").value).toBe("Mumbai");

        fireEvent.click(submit());
        await waitFor(() => expect(posted()).toBeDefined());
        expect(posted()?.body).toMatchObject({ address: "Powai, Mumbai, Maharashtra 400076", city: "Mumbai", latitude: 19.123457, longitude: 72.987654 });
    });
});
