import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Settings › Fraud — order screening (2 Oct 2026). Watch mode is the
 * default and the page says what it means; the thresholds are the 0–100
 * score; the form refuses what the server would, with one line under the
 * row (form symmetry); Save sits at the card's top right and sends only
 * what moved.
 */

const { calls } = vi.hoisted(() => ({ calls: { updates: [] as unknown[] } }));
vi.mock("@/services/settings", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/settings")>();
    return {
        ...actual,
        settingsService: {
            get: vi.fn(),
            update: vi.fn(async (patch: unknown) => {
                calls.updates.push(patch);
                return {};
            }),
        },
    };
});

import { ORDER_SCREENING_DEFAULTS } from "@/services/order-screening";
import { FraudSettingsView } from "./fraud-settings-view";

beforeEach(() => {
    calls.updates = [];
});

const mount = (over: Partial<React.ComponentProps<typeof FraudSettingsView>> = {}) => {
    const props = { settings: ORDER_SCREENING_DEFAULTS, live: true, mayEdit: true, onSaved: vi.fn(), ...over };
    render(<FraudSettingsView {...props} />);
    return props;
};

describe("Settings › Fraud", () => {
    it("says when the backend does not serve the block", () => {
        mount({ settings: null });
        expect(screen.getByText(/does not serve/)).toBeInTheDocument();
    });

    it("shows watch mode by default, with the automatic holds switch off", () => {
        mount();
        expect(screen.getByLabelText("Automatic holds")).toHaveAttribute("data-state", "unchecked");
        expect(screen.getByTestId("screening-auto-hold-state")).toHaveTextContent("Off — watch mode");
        expect(screen.getByText(/Watch mode flags orders for review but never pauses them on its own/)).toBeInTheDocument();
    });

    it("types the thresholds as the 0–100 score", () => {
        mount();
        expect(screen.getByLabelText(/Review at/)).toHaveValue("50");
        expect(screen.getByLabelText(/Hold at/)).toHaveValue("80");
    });

    it("keeps Save at the card's top right, off until something moves", () => {
        mount();
        const save = screen.getByRole("button", { name: "Save" });
        expect(save.closest("[class*='border-b']")).not.toBeNull();
        expect(save).toBeDisabled();
    });

    it("refuses a hold line under the review line, with one line under the row", () => {
        mount();
        fireEvent.change(screen.getByLabelText(/Review at/), { target: { value: "90" } });
        expect(screen.getByText("The hold line cannot be below the review line.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("saves only what moved — the hold line as 0–1 and automatic holds on", async () => {
        const props = mount();
        fireEvent.change(screen.getByLabelText(/Hold at/), { target: { value: "85" } });
        fireEvent.click(screen.getByLabelText("Automatic holds"));
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(calls.updates).toEqual([{ fraud: { orderScreening: { holdThreshold: 0.85, autoHold: true } } }]));
        expect(props.onSaved).toHaveBeenCalled();
    });

    it("locks the form for a role that may only read it", () => {
        mount({ mayEdit: false });
        expect(screen.getByLabelText(/Review at/)).toBeDisabled();
        expect(screen.getByText(/can read this but not change it/)).toBeInTheDocument();
    });
});
