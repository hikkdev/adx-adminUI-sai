import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Lot K2 — the Admin sign-in card on /settings, end to end: flipping one of
 * the two policy switches and saving PUTs `auth.adminTwoFactor` with that
 * leaf alone, and a backend that does not serve the section gets a card
 * that says so and never a switch.
 */

const { backend, toast } = vi.hoisted(() => {
    const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        reset() {
            this.calls = [];
        },
    };
    return { backend, toast };
});

vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/use-feature", () => ({
    FeatureGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useFeature: () => ({ enabled: true, loading: false }),
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, isLive: () => true, apiConfig: { ...actual.apiConfig, live: true } };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        return {};
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

import type { PlatformSettings } from "@/services/settings";
import { SettingsView } from "./settings-view";

const loaded: PlatformSettings = {
    kyc: { reviewSlaHours: 48, escalationSlaMultiplier: 2 },
    listings: { autoPublishOnVerification: true },
    marketplace: { minBookingDays: 1, maxMarketsPerCampaign: 3 },
    publisher: { spotInsightsVisible: false },
    retention: { financialYears: 8, kycYears: 8 },
    support: {
        sla: {
            URGENT: { firstResponseHours: 1, resolutionHours: 4 },
            HIGH: { firstResponseHours: 4, resolutionHours: 24 },
            NORMAL: { firstResponseHours: 8, resolutionHours: 72 },
            LOW: { firstResponseHours: 24, resolutionHours: 168 },
        },
    },
    auth: { adminPasswordLoginEnabled: true, adminTwoFactor: { authenticatorRequired: false, smsAllowedWhenEnrolled: true } },
    installation: { commissionMode: "FLAT" },
    finance: { primaryRail: "MANUAL_NEFT", railFallbackOrder: [], payoutEtaHours: 48, clearingDays: 7 },
};

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
});

describe("the Admin sign-in card", () => {
    it("PUTs the one policy switch that moved and nothing beside it", async () => {
        const onSaved = vi.fn();
        render(<SettingsView settings={loaded} onSaved={onSaved} />);

        const required = screen.getByTestId("auth.adminTwoFactor.authenticatorRequired");
        expect(required).toHaveAttribute("aria-checked", "false");
        /* Nothing moved: no save bar. */
        expect(screen.queryByTestId("settings-save")).not.toBeInTheDocument();

        fireEvent.click(required);
        expect(required).toHaveAttribute("aria-checked", "true");
        expect(screen.getByText(/1 setting modified/i)).toBeInTheDocument();
        fireEvent.click(screen.getByTestId("settings-save"));

        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(backend.calls).toEqual([{ method: "PUT", path: "/settings/platform", body: { auth: { adminTwoFactor: { authenticatorRequired: true } } } }]);
    });

    it("says so, with no switches, when the backend does not serve the policy", () => {
        render(<SettingsView settings={{ ...loaded, auth: { adminPasswordLoginEnabled: true } }} onSaved={() => {}} />);
        expect(screen.queryByTestId("auth.adminTwoFactor.authenticatorRequired")).not.toBeInTheDocument();
        expect(screen.getByText(/does not serve the authenticator-app policy/i)).toBeInTheDocument();
    });
});
