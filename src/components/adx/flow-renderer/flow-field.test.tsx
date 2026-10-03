import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * FL-3: every kind in the flow vocabulary drawn with the console's inputs
 * — the twenty-three the apps' `fields.tsx` switch on — writing the same
 * shape of answer the phone writes: a string, a boolean, a point, a rules
 * array, a documents array, a URL.
 */

vi.mock("@/lib/api-config", () => ({ isLive: () => true, apiConfig: { live: true } }));
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const answer = async () => [];
    return { ...actual, api: { get: answer, post: answer, patch: answer, put: answer, delete: answer } };
});
vi.mock("@/components/adx/city-combobox", () => ({
    CityCombobox: ({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) => <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />,
}));
vi.mock("@/components/adx/pin-picker", () => ({
    PinPicker: ({ id, latitude, longitude, onChange, onAddress }: { id: string; latitude: string; longitude: string; onChange: (next: { latitude: string; longitude: string }) => void; onAddress?: (place: Record<string, unknown>) => void }) => (
        <div data-testid={`${id}-pin`} data-lat={latitude} data-lng={longitude}>
            <input aria-label="Latitude" value={latitude} onChange={(e) => onChange({ latitude: e.target.value, longitude })} />
            <input aria-label="Longitude" value={longitude} onChange={(e) => onChange({ latitude, longitude: e.target.value })} />
            <button type="button" onClick={() => onAddress?.({ formattedAddress: "Powai, Mumbai", latitude: 19.12, longitude: 72.98, placeId: "pl_9", city: "Mumbai", state: "Maharashtra", postalCode: "400076" })}>
                use address
            </button>
        </div>
    ),
}));

import { FlowFieldView, fieldSpan, type FieldContext } from "./flow-field";
import { CONTENT_RULES_FIELD, withAnswer, type FlowAnswers } from "./flow-model";
import { LISTING_FLOW_FIXTURE, VOCAB_FIXTURE } from "./test-fixtures";
import type { FlowField } from "@/types";

/** A harness holding the answers the way a form does, with the flow's clearing rules. */
function Harness({ field, initial = {}, category = "indoor", upload, onAnswers }: { field: FlowField; initial?: FlowAnswers; category?: string | null; upload?: FieldContext["upload"]; onAnswers?: (answers: FlowAnswers) => void }) {
    const [answers, setAnswers] = React.useState<FlowAnswers>(initial);
    const ctx: FieldContext = {
        answers,
        set: (id, value) =>
            setAnswers((current) => {
                const next = withAnswer(LISTING_FLOW_FIXTURE, current, id, value);
                onAnswers?.(next);
                return next;
            }),
        vocab: VOCAB_FIXTURE,
        category,
        upload,
        idPrefix: "t",
    };
    return (
        <div>
            <FlowFieldView field={field} ctx={ctx} />
            <pre data-testid="answers">{JSON.stringify(answers)}</pre>
        </div>
    );
}

const answers = () => JSON.parse(screen.getByTestId("answers").textContent ?? "{}") as FlowAnswers;
const fieldOf = (branch: string, id: string): FlowField => LISTING_FLOW_FIXTURE.branches[branch]!.screens.flatMap((s) => s.fields).find((f) => f.id === id)!;

describe("the plain kinds", () => {
    it("text, number, textarea, date write strings; a switch and a checkbox write booleans; a time range writes from and until", () => {
        render(<Harness field={fieldOf("outdoor", "title")} />);
        fireEvent.change(screen.getByLabelText("Ad spot name"), { target: { value: "MG Road" } });
        expect(answers()).toEqual({ title: "MG Road" });
        cleanup();

        render(<Harness field={fieldOf("outdoor", "width_ft")} />);
        fireEvent.change(screen.getByLabelText("Width (ft)"), { target: { value: "40" } });
        expect(answers()).toEqual({ width_ft: "40" });
        cleanup();

        render(<Harness field={fieldOf("outdoor", "description")} />);
        fireEvent.change(screen.getByLabelText("Advertising space description"), { target: { value: "Faces the flyover" } });
        expect(answers()).toEqual({ description: "Faces the flyover" });
        cleanup();

        render(<Harness field={fieldOf("outdoor", "available_from")} />);
        fireEvent.change(screen.getByLabelText("Available from"), { target: { value: "2026-10-01" } });
        expect(answers()).toEqual({ available_from: "2026-10-01" });
        cleanup();

        render(<Harness field={{ id: "auto", type: "switch", label: "Accept automatically" }} />);
        fireEvent.click(screen.getByRole("radio", { name: "No" }));
        expect(answers()).toEqual({ auto: false });
        cleanup();

        render(<Harness field={fieldOf("outdoor", "terms")} />);
        fireEvent.click(screen.getByRole("checkbox", { name: /Terms agreement/ }));
        expect(answers()).toEqual({ terms: true });
        cleanup();

        render(<Harness field={fieldOf("outdoor", "available_hours")} />);
        fireEvent.change(screen.getByLabelText("Visibility hours — from"), { target: { value: "10 AM" } });
        fireEvent.change(screen.getByLabelText("Visibility hours — until"), { target: { value: "10 PM" } });
        expect(answers()).toEqual({ available_hours: { from: "10 AM", to: "10 PM" } });
    });

    it("draws the cards and branches on the one chosen", () => {
        render(<Harness field={LISTING_FLOW_FIXTURE.screens[0]!.fields[0]!} initial={{ venue_type_id: "vt_mall" }} />);
        fireEvent.click(screen.getByRole("radio", { name: /Outdoor/ }));
        expect(screen.getByRole("radio", { name: /Outdoor/ })).toHaveAttribute("aria-checked", "true");
        /* The branch moved: the venue chosen on the old one is gone. */
        expect(answers()).toEqual({ category: "outdoor" });
    });

    it("prints a computed area from the tape, and a section heading named by the spot type chosen", () => {
        render(<Harness field={fieldOf("outdoor", "area_sq_ft")} initial={{ width_ft: "40", height_ft: "20" }} />);
        expect(screen.getByTestId("t-area_sq_ft-computed")).toHaveTextContent("800.00 sq.ft");
        cleanup();
        render(<Harness field={fieldOf("outdoor", "sec_spot")} initial={{ media_type_id: "mt_atrium" }} />);
        expect(screen.getByTestId("t-sec_spot-section")).toHaveTextContent("Atrium LED wall");
        cleanup();
        render(<Harness field={fieldOf("outdoor", "sec_spot")} />);
        expect(screen.getByTestId("t-sec_spot-section")).toHaveTextContent("Ad spot");
    });

    it("draws an unknown kind as a text box with a note", () => {
        render(<Harness field={{ id: "x", type: "hologram", label: "Hologram" }} />);
        expect(screen.getByText(/does not know the "hologram" field yet/)).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("Hologram"), { target: { value: "still answerable" } });
        expect(answers()).toEqual({ x: "still answerable" });
    });

    it("gives the whole row to the wide kinds and to any field with a hint", () => {
        expect(fieldSpan(fieldOf("outdoor", "title"))).toBe(1);
        expect(fieldSpan(fieldOf("outdoor", "description"))).toBe(2);
        expect(fieldSpan(fieldOf("outdoor", "rights_valid_until"))).toBe(2);
        expect(fieldSpan(fieldOf("outdoor", "location"))).toBe(2);
    });
});

describe("the taxonomy kinds", () => {
    it("offers the venues of the category, with a no-venue row when the field is not required, and clears the spot type on a change", async () => {
        render(<Harness field={fieldOf("outdoor", "venue_type_id")} category="indoor" initial={{ category: "indoor", media_type_id: "mt_atrium" }} />);
        fireEvent.click(screen.getByRole("combobox", { name: "Venue" }));
        const list = within(await screen.findByRole("listbox"));
        expect(list.getByText("No venue — roadside or vehicle exterior")).toBeInTheDocument();
        expect(list.getByText("Shopping mall")).toBeInTheDocument();
        expect(list.queryByText("Metro station")).not.toBeInTheDocument();
        fireEvent.click(list.getByText("Gym"));
        expect(answers()).toEqual({ category: "indoor", venue_type_id: "vt_gym" });
    });

    it("offers the spot types of the venue under their catalogue heading, with the venue's prefix trimmed", async () => {
        render(<Harness field={fieldOf("indoor", "media_type_id")} category="indoor" initial={{ category: "indoor", venue_type_id: "vt_mall" }} />);
        fireEvent.click(screen.getByRole("combobox", { name: "Ad spot type" }));
        const list = within(await screen.findByRole("listbox"));
        expect(list.getByText("Atrium LED wall")).toBeInTheDocument();
        expect(list.getByText("Standee")).toBeInTheDocument();
        expect(list.queryByText("Billboard")).not.toBeInTheDocument();
        fireEvent.click(list.getByText("Atrium LED wall"));
        expect(answers()).toMatchObject({ media_type_id: "mt_atrium" });
    });

    it("says when a venue has no spot types yet", () => {
        render(<Harness field={fieldOf("indoor", "media_type_id")} category="indoor" initial={{ category: "indoor", venue_type_id: "vt_gym" }} />);
        expect(screen.getByText(/No spot types are defined for this venue yet/)).toBeInTheDocument();
    });

    it("draws the placement as a select when the venue names areas and as a text box when it does not", () => {
        render(<Harness field={fieldOf("indoor", "placement")} category="indoor" initial={{ venue_type_id: "vt_mall" }} />);
        expect(screen.getByRole("combobox", { name: "Placement area" })).toBeInTheDocument();
        cleanup();
        render(<Harness field={fieldOf("indoor", "placement")} category="indoor" initial={{ venue_type_id: "vt_gym" }} />);
        fireEvent.change(screen.getByLabelText("Placement area"), { target: { value: "Mirror wall" } });
        expect(answers()).toEqual({ venue_type_id: "vt_gym", placement: "Mirror wall" });
    });

    it("writes the city as typed", () => {
        render(<Harness field={fieldOf("outdoor", "city")} />);
        fireEvent.change(screen.getByLabelText("City"), { target: { value: "Mumbai" } });
        expect(answers()).toEqual({ city: "Mumbai" });
    });
});

describe("the pin", () => {
    it("writes a point only once both halves parse, and a place picked fills the address and a blank city", () => {
        render(<Harness field={fieldOf("outdoor", "location")} initial={{ address: "old" }} />);
        fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "19.07" } });
        expect(answers()).toEqual({ address: "old" });
        fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "72.87" } });
        expect(answers()).toEqual({ address: "old", location: { latitude: 19.07, longitude: 72.87 } });
        fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "" } });
        expect(answers()).toEqual({ address: "old" });
        fireEvent.click(screen.getByText("use address"));
        expect(answers()).toEqual({ address: "Powai, Mumbai", city: "Mumbai" });
    });

    it("follows a point set from outside without clobbering the same numbers typed", () => {
        render(<Harness field={fieldOf("outdoor", "location")} initial={{ location: { latitude: 12.9, longitude: 77.6 } }} />);
        expect(screen.getByTestId("t-location-pin")).toHaveAttribute("data-lat", "12.9");
        fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "12.90" } });
        expect(screen.getByTestId("t-location-pin")).toHaveAttribute("data-lat", "12.90");
        expect(answers()).toEqual({ location: { latitude: 12.9, longitude: 77.6 } });
    });
});

describe("the content rules", () => {
    it("both fields write one rules array: a stance per open category, PROHIBITED per sensitive one ticked", () => {
        render(<Harness field={fieldOf("outdoor", "restricted_categories")} />);
        expect(screen.queryByText("Tobacco")).not.toBeInTheDocument();
        fireEvent.click(within(screen.getByText("Alcohol").closest("li")!).getByRole("radio", { name: "With approval" }));
        expect(answers()).toEqual({ [CONTENT_RULES_FIELD]: [{ contentCategoryId: "cc_alcohol", stance: "REQUIRES_APPROVAL" }] });
        cleanup();

        render(<Harness field={fieldOf("outdoor", "prohibited_content")} initial={{ [CONTENT_RULES_FIELD]: [{ contentCategoryId: "cc_alcohol", stance: "ALLOWED" }] }} />);
        expect(screen.queryByText("Alcohol")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("checkbox", { name: "Tobacco" }));
        expect(answers()).toEqual({
            [CONTENT_RULES_FIELD]: [
                { contentCategoryId: "cc_alcohol", stance: "ALLOWED" },
                { contentCategoryId: "cc_tobacco", stance: "PROHIBITED" },
            ],
        });
        fireEvent.click(screen.getByRole("checkbox", { name: "Tobacco" }));
        expect(answers()).toEqual({ [CONTENT_RULES_FIELD]: [{ contentCategoryId: "cc_alcohol", stance: "ALLOWED" }] });
    });
});

describe("the uploads", () => {
    const file = new File(["x"], "noc.pdf", { type: "application/pdf" });

    it("a photograph goes up as a listing photo and its URL is the answer; Remove clears it", async () => {
        const upload = vi.fn(async (_file: File, purpose: string) => `https://files/${purpose}/main.jpg`);
        render(<Harness field={fieldOf("outdoor", "main_photo")} upload={upload} />);
        fireEvent.change(screen.getByTestId("t-main_photo-tile").querySelector("input[type=file]")!, { target: { files: [file] } });
        await waitFor(() => expect(answers()).toEqual({ main_photo: "https://files/LISTING_PHOTO/main.jpg" }));
        expect(upload).toHaveBeenCalledWith(file, "LISTING_PHOTO");
        expect(screen.getByTestId("t-main_photo-stored")).toHaveTextContent("main.jpg");
        fireEvent.click(screen.getByRole("button", { name: "Remove the file" }));
        expect(answers()).toEqual({});
    });

    it("a venue proof goes up as verification paperwork, one row per kind, and an upload that fails says so", async () => {
        const upload = vi.fn(async (_file: File, purpose: string) => `https://files/${purpose}/noc.pdf`);
        render(<Harness field={fieldOf("outdoor", "documents")} upload={upload} />);
        expect(screen.queryAllByText("Tap to browse")).toHaveLength(0);
        fireEvent.change(screen.getByTestId("t-documents-OWNER_NOC-tile").querySelector("input[type=file]")!, { target: { files: [file] } });
        await waitFor(() => expect(answers()).toEqual({ documents: [{ kind: "OWNER_NOC", url: "https://files/VERIFICATION/noc.pdf" }] }));
        expect(upload).toHaveBeenCalledWith(file, "VERIFICATION");

        upload.mockRejectedValueOnce(new Error("Too big"));
        fireEvent.change(screen.getByTestId("t-documents-ADDRESS_PROOF-tile").querySelector("input[type=file]")!, { target: { files: [file] } });
        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Too big"));
        expect(answers()).toEqual({ documents: [{ kind: "OWNER_NOC", url: "https://files/VERIFICATION/noc.pdf" }] });
    });

    it("ST-2: the audience reports go up as verification paperwork, the rate card as a listing file", async () => {
        const upload = vi.fn(async (_file: File, purpose: string) => `https://files/${purpose}/report.pdf`);
        const { unmount } = render(<Harness field={fieldOf("outdoor", "barc_report")} upload={upload} />);
        fireEvent.change(screen.getByTestId("t-barc_report-tile").querySelector("input[type=file]")!, { target: { files: [file] } });
        await waitFor(() => expect(answers()).toEqual({ barc_report: "https://files/VERIFICATION/report.pdf" }));
        expect(upload).toHaveBeenLastCalledWith(file, "VERIFICATION");
        unmount();

        render(<Harness field={fieldOf("outdoor", "footfall_report")} upload={upload} />);
        fireEvent.change(screen.getByTestId("t-footfall_report-tile").querySelector("input[type=file]")!, { target: { files: [file] } });
        await waitFor(() => expect(upload).toHaveBeenLastCalledWith(file, "VERIFICATION"));
        cleanup();

        render(<Harness field={fieldOf("outdoor", "rate_card")} upload={upload} />);
        fireEvent.change(screen.getByTestId("t-rate_card-tile").querySelector("input[type=file]")!, { target: { files: [file] } });
        await waitFor(() => expect(upload).toHaveBeenLastCalledWith(file, "LISTING_PHOTO"));
    });

    it("ST-2: a private file's tile prints the name picked, not the id in its URL", async () => {
        const upload = vi.fn(async () => "http://localhost:3000/api/v1/files/0123456789abcdef");
        render(<Harness field={fieldOf("outdoor", "footfall_report")} upload={upload} />);
        fireEvent.change(screen.getByTestId("t-footfall_report-tile").querySelector("input[type=file]")!, { target: { files: [file] } });
        expect(await screen.findByTestId("t-footfall_report-stored")).toHaveTextContent("noc.pdf");
        expect(screen.getByTestId("t-footfall_report-stored")).not.toHaveTextContent("0123456789abcdef");
    });

    it("is drawn and not tappable without an uploader — the preview", () => {
        render(<Harness field={fieldOf("outdoor", "rate_card")} />);
        expect(screen.getByTestId("t-rate_card-tile")).toHaveTextContent("Tap to browse");
        expect(screen.getByTestId("t-rate_card-tile").querySelector("input[type=file]")).toBeNull();
    });
});
