import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * FL-3: the listing form is drawn from `flows.listing`. What this pins is
 * that `POST /listings` still carries exactly what it did before the form
 * was drawn from the flow — the same keys, the same values (`latitude` and
 * `longitude` as numbers beside the address, the media type and the
 * price) — whether the point was typed into the picker's inputs or written
 * back by a pick or a drag, that "Use this address" fills the address
 * field, that the form stays unsubmittable until the flow's required
 * fields are in, and that the venue proofs collected are filed onto the
 * listing after the create — and, LF-2, the audience screen's two reports
 * beside them, with the installation tick and the photo angles in the body.
 */

const { backend, router, toast } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string; body?: unknown }[],
        /** Document kinds the documents door refuses, to see an unfiled paper reported. */
        refuse: new Set<string>(),
        reset() {
            this.calls = [];
            this.refuse = new Set<string>();
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
        if (path === "/upload" && method === "POST") {
            /* The venue-proof tests read one fixed URL; LF-2's files answer by name so each post can be told apart. */
            const file = body instanceof FormData ? body.get("file") : null;
            return { id: "file_1", url: file instanceof File && file.name.startsWith("lf2-") ? `https://files/${file.name}` : "https://files/verification/noc.pdf" };
        }
        if (path.endsWith("/documents") && method === "POST" && backend.refuse.has((body as { kind: string }).kind)) throw new Error("refused");
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
import { LISTING_FLOW_FIXTURE, VOCAB_FIXTURE } from "@/components/adx/flow-renderer/test-fixtures";
import type { RosterPublisher } from "@/services/supply";

const publishers = [{ id: "pub_1", name: "Metro Spaces", mobile: "9876543210", city: "Mumbai", kycStatus: "VERIFIED", listingCount: 3 } as unknown as RosterPublisher];

beforeEach(() => {
    backend.reset();
    router.push.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
});

const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const submit = () => screen.getByRole("button", { name: /Create listing/ });
const draw = () => render(<ListingCreate publishers={publishers} venues={VOCAB_FIXTURE.venues} mediaTypes={VOCAB_FIXTURE.mediaTypes} sizeClasses={VOCAB_FIXTURE.sizeClasses} materials={VOCAB_FIXTURE.materials} contentCategories={VOCAB_FIXTURE.contentCategories} flow={LISTING_FLOW_FIXTURE} />);

/** Everything but the point: the parts of the form this test is not about. */
async function fillTheRest() {
    /* The flow's first screen: the branch. */
    fireEvent.click(screen.getByRole("radio", { name: /Outdoor/ }));
    fireEvent.change(input("Ad spot name"), { target: { value: "MG Road Billboard" } });
    fireEvent.change(input("Full address"), { target: { value: "Western Express Highway" } });
    fireEvent.change(input("City"), { target: { value: "Mumbai" } });
    /* The spot type is the cmdk combobox: click to open, click the row. */
    fireEvent.click(screen.getByRole("combobox", { name: "Ad spot type" }));
    fireEvent.click(within(await screen.findByRole("listbox")).getByText("Billboard"));
    fireEvent.change(input("Width (ft)"), { target: { value: "40" } });
    fireEvent.change(input("Height (ft)"), { target: { value: "20" } });
    fireEvent.change(input("Base price (Rs)"), { target: { value: "12500" } });
}

const posted = () => backend.calls.find((call) => call.method === "POST" && call.path === "/listings");

describe("ListingCreate drawn from the flow", () => {
    it("starts on the flow's first screen with the desk's publisher card, and only branches once a category is chosen", () => {
        draw();
        expect(screen.getByText("Publisher")).toBeInTheDocument();
        expect(screen.getByText("Ad space category")).toBeInTheDocument();
        expect(screen.queryByText("Venue selection")).not.toBeInTheDocument();
        expect(screen.getByText("Still needed: Category.")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("radio", { name: /Media/ }));
        expect(screen.getByText("Venue selection")).toBeInTheDocument();
        expect(screen.getByLabelText("Medium")).toBeInTheDocument();
        expect(screen.getByLabelText("Channel, station or publication")).toBeInTheDocument();
        /* The admin extras are around the flow: the standard size, LD-1's questions the flow does not ask, the works-out-to line. */
        expect(screen.getByLabelText("Or a standard size")).toBeInTheDocument();
        /* A broadcast or print outlet is asked only whether it is free now — no footfall, no distance, no height. */
        expect(screen.getByText("Available to book now?")).toBeInTheDocument();
        expect(screen.queryByText("How busy is it?")).not.toBeInTheDocument();
        expect(screen.queryByText("About how many people pass this spot in a day?")).not.toBeInTheDocument();
        expect(screen.getByText("Works out to")).toBeInTheDocument();
        /* The review's attestation is the submitter's; the desk does not draw it. */
        expect(screen.queryByText(/Terms agreement/)).not.toBeInTheDocument();
        expect(screen.getByText(/The publisher confirms and submits it from their own phone/)).toBeInTheDocument();
    });

    it("posts the same payload as before: latitude and longitude as numbers, typed into the picker's inputs", async () => {
        draw();
        await fillTheRest();
        expect(submit()).toBeDisabled();
        expect(screen.getByText("Still needed: Location pin.")).toBeInTheDocument();

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

    it("LD-1: asks an outdoor spot the website's and the apps' questions in their words, and posts the answers", async () => {
        draw();
        await fillTheRest();
        const asked = within(screen.getByTestId("listing-desk-questions"));
        for (const question of ["About how many people pass this spot in a day?", "How busy is it?", "From how far can it be seen?", "How high is it?", "Available to book now?"]) {
            expect(asked.getByText(question)).toBeInTheDocument();
        }
        expect(asked.getByText("Your best estimate — we may refine it with measured data.")).toBeInTheDocument();
        /* Not a screen, not a vehicle. */
        expect(asked.queryByText("What kind of vehicle?")).not.toBeInTheDocument();
        expect(asked.queryByText("Screen resolution — width (pixels)")).not.toBeInTheDocument();

        fireEvent.change(input("About how many people pass this spot in a day?"), { target: { value: "45,000" } });
        fireEvent.click(asked.getByRole("radio", { name: "No" }));
        fireEvent.change(input("Latitude"), { target: { value: "19" } });
        fireEvent.change(input("Longitude"), { target: { value: "72" } });
        fireEvent.click(submit());
        await waitFor(() => expect(posted()).toBeDefined());
        expect(posted()?.body).toMatchObject({ estimatedDailyFootfall: 45000, availableNow: false });
        expect(posted()?.body).not.toHaveProperty("trafficGrade");
        expect(posted()?.body).not.toHaveProperty("extraAnswers");
    });

    it("LD-1: asks a transit spot what kind of vehicle, and never its footfall", () => {
        draw();
        fireEvent.click(screen.getByRole("radio", { name: /Transit/ }));
        const asked = within(screen.getByTestId("listing-desk-questions"));
        expect(asked.getByText("What kind of vehicle?")).toBeInTheDocument();
        expect(asked.queryByText("About how many people pass this spot in a day?")).not.toBeInTheDocument();
        expect(asked.queryByText("How high is it?")).not.toBeInTheDocument();
    });

    it("LD-1: with a flow that asks the questions itself, draws them once — the flow's — and a screen's resolution only for a screen", async () => {
        const flow = structuredClone(LISTING_FLOW_FIXTURE);
        const outdoor = flow.branches.outdoor!.screens;
        outdoor.find((screen) => screen.key === "spot-details")!.fields.push(
            { type: "number", id: "estimated_daily_footfall", label: "About how many people pass this spot in a day?", hint: "Your best estimate — we may refine it with measured data." },
            { type: "select", id: "traffic_grade", label: "How busy is it?", options: [{ id: "HIGH", title: "High" }] },
            { type: "section", id: "sec_screen", label: "Screen resolution (pixels)" },
            { type: "number", id: "width_px", label: "Width (px)" },
            { type: "number", id: "height_px", label: "Height (px)" },
        );
        outdoor.find((screen) => screen.key === "terms")!.fields.unshift({ type: "switch", id: "available_now", label: "Available to book now?" });
        render(<ListingCreate publishers={publishers} venues={VOCAB_FIXTURE.venues} mediaTypes={VOCAB_FIXTURE.mediaTypes} sizeClasses={VOCAB_FIXTURE.sizeClasses} materials={VOCAB_FIXTURE.materials} contentCategories={VOCAB_FIXTURE.contentCategories} flow={flow} />);
        await fillTheRest();
        expect(screen.getAllByText("About how many people pass this spot in a day?")).toHaveLength(1);
        expect(screen.getAllByText("Available to book now?")).toHaveLength(1);
        /* The desk still asks what this flow does not: how far it is seen, how high. */
        const asked = within(screen.getByTestId("listing-desk-questions"));
        expect(asked.getByText("From how far can it be seen?")).toBeInTheDocument();
        expect(asked.queryByText("How busy is it?")).not.toBeInTheDocument();
        /* A billboard is not a screen. */
        expect(screen.queryByText("Width (px)")).not.toBeInTheDocument();
        expect(screen.queryByText("Screen resolution (pixels)")).not.toBeInTheDocument();
    });

    it("posts the point the pin was dropped at, and 'Use this address' fills the address", async () => {
        draw();
        await fillTheRest();
        fireEvent.change(input("Latitude"), { target: { value: "19" } });
        fireEvent.change(input("Longitude"), { target: { value: "72" } });

        fireEvent.click(screen.getByTestId("drag-pin"));
        expect(input("Latitude").value).toBe("19.123457");
        expect(input("Longitude").value).toBe("72.987654");

        fireEvent.click(await screen.findByRole("button", { name: "Use this address" }));
        expect(input("Full address").value).toBe("Powai, Mumbai, Maharashtra 400076");
        /* The city was already typed; the address does not overrule it. */
        expect(input("City").value).toBe("Mumbai");

        fireEvent.click(submit());
        await waitFor(() => expect(posted()).toBeDefined());
        expect(posted()?.body).toMatchObject({ address: "Powai, Mumbai, Maharashtra 400076", city: "Mumbai", latitude: 19.123457, longitude: 72.987654 });
    });

    it("files a venue proof collected on the documents screen onto the listing after the create, with the rights term on a permit", async () => {
        draw();
        await fillTheRest();
        fireEvent.change(input("Latitude"), { target: { value: "19" } });
        fireEvent.change(input("Longitude"), { target: { value: "72" } });
        fireEvent.change(input("Right runs out on"), { target: { value: "2027-03-31" } });
        const permitTile = screen.getByTestId("listing-documents-MUNICIPAL_PERMIT-tile");
        fireEvent.change(permitTile.querySelector("input[type=file]")!, { target: { files: [new File(["x"], "permit.pdf", { type: "application/pdf" })] } });
        await screen.findByTestId("listing-documents-MUNICIPAL_PERMIT-stored");
        expect(backend.calls.find((call) => call.path === "/upload")).toBeDefined();

        fireEvent.click(submit());
        await waitFor(() => expect(router.push).toHaveBeenCalledWith("/listings/lst_new"));
        const filed = backend.calls.find((call) => call.method === "POST" && call.path === "/supply/listings/lst_new/documents");
        /* No rights basis was chosen, so the date does not ride along; the document does. */
        expect(filed?.body).toEqual({ kind: "MUNICIPAL_PERMIT", url: "https://files/verification/noc.pdf" });
        expect(posted()?.body).not.toHaveProperty("rightsValidUntil");
    });

    /** Picks a file on a tile the flow drew and waits for it to land. */
    async function pick(fieldId: string, name: string) {
        const tile = screen.getByTestId(`listing-${fieldId}-tile`);
        fireEvent.change(tile.querySelector("input[type=file]")!, { target: { files: [new File(["x"], name, { type: name.endsWith(".jpg") ? "image/jpeg" : "application/pdf" })] } });
        await screen.findByTestId(`listing-${fieldId}-stored`);
    }

    const documentPosts = () => backend.calls.filter((call) => call.method === "POST" && call.path === "/supply/listings/lst_new/documents").map((call) => call.body);

    it("LF-2: files the BARC sheet as AUDIENCE_RATING and the footfall audit as FOOTFALL_AUDIT, and posts the installation tick and the photos by angle", async () => {
        draw();
        await fillTheRest();
        fireEvent.change(input("Latitude"), { target: { value: "19" } });
        fireEvent.change(input("Longitude"), { target: { value: "72" } });
        /* The audience screen and the booking terms are the flow's, drawn at the desk. */
        expect(screen.getByText("Audience evidence")).toBeInTheDocument();
        expect(screen.getByText("Availability & booking terms")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("checkbox", { name: /Installation by ADX/ }));
        await pick("barc_report", "lf2-barc.pdf");
        await pick("footfall_report", "lf2-footfall.pdf");
        await pick("main_photo", "lf2-front.jpg");
        await pick("right_photo", "lf2-right.jpg");

        fireEvent.click(submit());
        await waitFor(() => expect(router.push).toHaveBeenCalledWith("/listings/lst_new"));
        expect(posted()?.body).toMatchObject({
            installationByAdx: true,
            photos: [
                { url: "https://files/lf2-front.jpg", type: "FRONT" },
                { url: "https://files/lf2-right.jpg", type: "RIGHT" },
            ],
        });
        expect(documentPosts()).toEqual([
            { kind: "AUDIENCE_RATING", url: "https://files/lf2-barc.pdf" },
            { kind: "FOOTFALL_AUDIT", url: "https://files/lf2-footfall.pdf" },
        ]);
        expect(toast.error).not.toHaveBeenCalled();
    });

    it("ST-2: the reports and venue papers go up as VERIFICATION in the publisher's name; a photograph stays a listing photo", async () => {
        const registered = [{ ...publishers[0], userId: "usr_pub_1" } as RosterPublisher];
        render(<ListingCreate publishers={registered} venues={VOCAB_FIXTURE.venues} mediaTypes={VOCAB_FIXTURE.mediaTypes} sizeClasses={VOCAB_FIXTURE.sizeClasses} materials={VOCAB_FIXTURE.materials} contentCategories={VOCAB_FIXTURE.contentCategories} flow={LISTING_FLOW_FIXTURE} />);
        await fillTheRest();
        await pick("barc_report", "lf2-barc.pdf");
        await pick("footfall_report", "lf2-footfall.pdf");
        await pick("main_photo", "lf2-front.jpg");
        const permitTile = screen.getByTestId("listing-documents-MUNICIPAL_PERMIT-tile");
        fireEvent.change(permitTile.querySelector("input[type=file]")!, { target: { files: [new File(["x"], "permit.pdf", { type: "application/pdf" })] } });
        await screen.findByTestId("listing-documents-MUNICIPAL_PERMIT-stored");

        const uploads = backend.calls
            .filter((call) => call.path === "/upload")
            .map((call) => {
                const body = call.body as FormData;
                return { name: (body.get("file") as File).name, purpose: body.get("purpose"), owner: body.get("ownerUserId") };
            });
        expect(uploads).toEqual([
            { name: "lf2-barc.pdf", purpose: "VERIFICATION", owner: "usr_pub_1" },
            { name: "lf2-footfall.pdf", purpose: "VERIFICATION", owner: "usr_pub_1" },
            { name: "lf2-front.jpg", purpose: "LISTING_PHOTO", owner: null },
            { name: "permit.pdf", purpose: "VERIFICATION", owner: "usr_pub_1" },
        ]);
    });

    it("LF-2: a report the documents door refuses is reported the way an unfiled venue proof is, and the listing still opens", async () => {
        backend.refuse.add("FOOTFALL_AUDIT");
        draw();
        await fillTheRest();
        fireEvent.change(input("Latitude"), { target: { value: "19" } });
        fireEvent.change(input("Longitude"), { target: { value: "72" } });
        await pick("barc_report", "lf2-barc.pdf");
        await pick("footfall_report", "lf2-footfall.pdf");

        fireEvent.click(submit());
        await waitFor(() => expect(router.push).toHaveBeenCalledWith("/listings/lst_new"));
        expect(documentPosts()).toHaveLength(2);
        expect(toast.success).toHaveBeenCalled();
        expect(toast.error).toHaveBeenCalledWith("Could not file FOOTFALL_AUDIT — add the document from the listing's verification tab.");
    });
});
