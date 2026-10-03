import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

/**
 * FL-2: the three previews the flow board draws beside itself — a wizard
 * stepped through live, the onboarding ladder's steps as the phone shows
 * them, and a step ladder's — all from the board's draft, none of it sent.
 */

vi.mock("@/lib/api-config", () => ({ isLive: () => false, apiConfig: { live: false } }));
vi.mock("@/components/adx/city-combobox", () => ({
    CityCombobox: ({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) => <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />,
}));
vi.mock("@/components/adx/pin-picker", () => ({
    PinPicker: ({ id, latitude, longitude, onChange }: { id: string; latitude: string; longitude: string; onChange: (next: { latitude: string; longitude: string }) => void }) => (
        <div data-testid={`${id}-pin`}>
            <input aria-label="Latitude" value={latitude} onChange={(e) => onChange({ latitude: e.target.value, longitude })} />
            <input aria-label="Longitude" value={longitude} onChange={(e) => onChange({ latitude, longitude: e.target.value })} />
        </div>
    ),
}));

import { LadderPreview } from "./ladder-preview";
import { StepsPreview } from "./steps-preview";
import { WizardPreview } from "./wizard-preview";
import { LISTING_FLOW_FIXTURE, ONBOARDING_TEMPLATE_FIXTURE, VOCAB_FIXTURE } from "./test-fixtures";
import type { StepLadder } from "@/types";

describe("WizardPreview", () => {
    it("steps through the screens in play, gated by the required fields, with the counter and the badge as the phone prints them", () => {
        render(<WizardPreview flow={LISTING_FLOW_FIXTURE} vocab={VOCAB_FIXTURE} />);
        const frame = within(screen.getByTestId("phone-frame"));
        expect(frame.getByRole("progressbar")).toHaveAccessibleName("Step 1 of 10, Ad space category");
        expect(frame.getByText("Still needed: Category")).toBeInTheDocument();
        expect(frame.getByRole("button", { name: "Continue" })).toBeDisabled();

        fireEvent.click(frame.getByRole("radio", { name: /Outdoor/ }));
        expect(frame.getByRole("button", { name: "Continue" })).toBeEnabled();
        fireEvent.click(frame.getByRole("button", { name: "Continue" }));
        expect(frame.getByRole("progressbar")).toHaveAccessibleName("Step 2 of 10, Venue selection");
        expect(frame.getByRole("heading", { level: 3, name: "Venue selection" })).toBeInTheDocument();
        /* The venue is not required on the outdoor branch: on it goes. */
        fireEvent.click(frame.getByRole("button", { name: "Continue" }));
        expect(frame.getByRole("heading", { level: 3, name: "Ad spot type" })).toBeInTheDocument();
        expect(frame.getByRole("button", { name: "Continue" })).toBeDisabled();
        fireEvent.click(frame.getByRole("button", { name: "Back" }));
        expect(frame.getByRole("heading", { level: 3, name: "Venue selection" })).toBeInTheDocument();
    });

    it("prints the badge on an unnumbered screen and says nothing is sent from the review", () => {
        const flow = { ...LISTING_FLOW_FIXTURE, screens: [], branches: {} };
        const documents = LISTING_FLOW_FIXTURE.branches.outdoor!.screens.find((s) => s.key === "documents")!;
        const review = LISTING_FLOW_FIXTURE.branches.outdoor!.screens.find((s) => s.key === "review")!;
        render(<WizardPreview flow={{ ...flow, screens: [{ ...documents, fields: [] }, { ...review, fields: [] }] }} />);
        const frame = within(screen.getByTestId("phone-frame"));
        expect(frame.getByText("Verification")).toBeInTheDocument();
        expect(frame.queryByRole("progressbar")).not.toBeInTheDocument();
        fireEvent.click(frame.getByRole("button", { name: "Save proofs" }));
        fireEvent.click(frame.getByRole("button", { name: "Submit listing" }));
        expect(frame.getByText(/This is where the phone submits/)).toBeInTheDocument();
    });

    it("says so when the flow has no screens, and follows the board when the screen it was on goes", () => {
        const { rerender } = render(<WizardPreview flow={{ ...LISTING_FLOW_FIXTURE, screens: [], branches: {} }} />);
        expect(screen.getByText(/Add a screen on the board/)).toBeInTheDocument();
        rerender(<WizardPreview flow={LISTING_FLOW_FIXTURE} />);
        expect(screen.getByRole("heading", { level: 3, name: "Ad space category" })).toBeInTheDocument();
    });
});

describe("LadderPreview", () => {
    it("walks the party's ladder step by step, drawing each kind as its screen does", () => {
        render(<LadderPreview template={ONBOARDING_TEMPLATE_FIXTURE} party="PUBLISHER" accountType="BUSINESS" />);
        expect(screen.getByTestId("ladder-preview-account-type")).toBeInTheDocument();
        expect(screen.getByRole("progressbar")).toHaveAccessibleName("Step 1 of 11, What kind of account");
        const next = screen.getByRole("button", { name: "Next step" });

        fireEvent.click(next);
        expect(screen.getByTestId("ladder-preview-form")).toHaveTextContent("Your details");
        /* A business is not asked its address on the details step. */
        expect(screen.queryByText("Address")).not.toBeInTheDocument();
        expect(screen.getByText("Registered name, as on your documents")).toBeInTheDocument();
        fireEvent.click(next);
        expect(screen.getByRole("heading", { level: 3, name: "Who to reach" })).toBeInTheDocument();
        expect(screen.getByText("Their mobile number")).toBeInTheDocument();
        fireEvent.click(next);
        expect(screen.getByRole("heading", { level: 3, name: "The business" })).toBeInTheDocument();
        expect(screen.getByText("GSTIN")).toBeInTheDocument();
        fireEvent.click(next);
        expect(screen.getByTestId("ladder-preview-kyc-intro")).toHaveTextContent("Passport · DL");
        expect(screen.getByRole("button", { name: "Start verification" })).toBeInTheDocument();
        fireEvent.click(next);
        const capture = within(screen.getByTestId("ladder-preview-capture"));
        expect(capture.getByText("One of these:")).toBeInTheDocument();
        expect(capture.getByTestId("ladder-preview-tile-passport")).toHaveTextContent("Choosing it sets govIdType = PASSPORT.");
        expect(capture.getByTestId("ladder-preview-tile-passport-back")).toHaveTextContent("Not applicable — back not required");
        expect(capture.getByText("Skippable when the government id is PASSPORT.")).toBeInTheDocument();
        fireEvent.click(next);
        expect(screen.getByText("^[A-Z]{5}[0-9]{4}[A-Z]$")).toBeInTheDocument();
        fireEvent.click(next);
        expect(screen.getByText("Choose a file · PDF or image")).toBeInTheDocument();
        fireEvent.click(next);
        expect(screen.getByText("Face centered, both eyes clearly visible")).toBeInTheDocument();
    });

    it("says when a rung names a step the library lacks", () => {
        const holed = { ...ONBOARDING_TEMPLATE_FIXTURE, ladders: { ...ONBOARDING_TEMPLATE_FIXTURE.ladders, PUBLISHER: { ...ONBOARDING_TEMPLATE_FIXTURE.ladders.PUBLISHER, INDIVIDUAL: ["missing"] } } };
        render(<LadderPreview template={holed} party="PUBLISHER" accountType="INDIVIDUAL" />);
        expect(screen.getByText(/named on the ladder but not in the library/)).toBeInTheDocument();
    });
});

describe("StepsPreview", () => {
    const ladder: StepLadder = {
        label: "Agent job",
        steps: [
            { key: "arrive", number: 1, title: "Get to the spot", subtitle: "Check in when you are there.", hint: "Take the material with you\nCall the publisher on the way", cta: "I am here", proofs: [{ key: "CHECK_IN", label: "Check in at the spot first" }] },
            { key: "explain", number: 2, title: "What happens next", proofs: [] },
            { key: "install", number: 3, title: "Put it up", proofs: [{ key: "CONDITION", label: "A photo of the site as found" }, { key: "INSTALLATION", label: "A photo of the finished installation" }] },
        ],
    };
    const proofLabel = (key: string) => ({ CHECK_IN: "Check in", CONDITION: "Site condition", INSTALLATION: "Installation" })[key] ?? key;

    it("draws the step's counter, copy, bullets and proofs, and follows the board's selection", () => {
        const onSelect = vi.fn();
        const { rerender } = render(<StepsPreview ladder={ladder} proofLabel={proofLabel} selectedKey={null} onSelect={onSelect} />);
        expect(screen.getByRole("progressbar")).toHaveAccessibleName("Step 1 of 3, Get to the spot");
        expect(screen.getByText("Take the material with you")).toBeInTheDocument();
        expect(screen.getByText("Check in")).toBeInTheDocument();
        expect(screen.getByText("Check in at the spot first")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "I am here" })).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Next step" }));
        expect(onSelect).toHaveBeenCalledWith("explain");
        expect(screen.getByText("This step only explains; it collects nothing.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();

        rerender(<StepsPreview ladder={ladder} proofLabel={proofLabel} selectedKey="install" onSelect={onSelect} />);
        expect(screen.getByTestId("steps-preview-install")).toHaveTextContent("Site condition");
        expect(screen.getByTestId("steps-preview-install")).toHaveTextContent("Installation");
    });
});
