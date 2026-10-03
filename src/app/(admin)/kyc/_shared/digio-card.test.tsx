import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * The Digio card's restart — Phase D (the owner, 1 Oct 2026).
 *
 * What is pinned, on the card the three case pages share (publisher,
 * advertiser, print partner): a restart answered 409 `ENTITY_TYPE_REQUIRED`
 * opens the picker with the server's options and goes again to the party's
 * own restart route with `{ entityType }`; a restart with a known type
 * sends the empty body it always did; Digio failing the restart while the
 * switch is on is said in the owner's words; and the switch's own 503 still
 * says Digio is off and points at the manual review.
 */

const backend = vi.hoisted(() => ({
    posts: [] as { path: string; body: unknown }[],
    refusals: [] as { status: number; code: string; message: string; details?: unknown }[],
    reset() {
        this.posts = [];
        this.refusals = [];
    },
    async post(path: string, body?: unknown) {
        this.posts.push({ path, body });
        const refusal = this.refusals.shift();
        if (refusal) {
            const { ApiError } = await import("@/lib/api-client");
            throw new ApiError(refusal.status, refusal.code, refusal.message, refusal.details);
        }
        return { kycId: "dg_2", validTill: "2026-10-02T00:00:00.000Z", digioStatus: "pending", notified: true };
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
    return {
        ...actual,
        api: {
            ...actual.api,
            // The card reads the provider switch off the integrations config.
            get: async () => ({ kyc: { clientId: null, clientSecret: null, baseUrl: null, kycProvider: "DIGIO" } }),
            post: (path: string, body?: unknown) => backend.post(path, body),
        },
    };
});

import { advertiserKycService } from "@/services/advertiser-kyc";
import { kycService } from "@/services/kyc";
import type { KycEntityType } from "@/services/kyc-entity-types";
import { printPartnerKycService } from "@/services/print-partner-kyc";
import { DigioCard } from "./digio-card";

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
    toast.error.mockReset();
});

const options = [
    { value: "INDIVIDUAL", label: "Individual" },
    { value: "COMPANY", label: "Company" },
    { value: "NON_PROFIT", label: "Non-profit (NGO, trust, society, Section 8)" },
];
const required = (party: string) => ({ status: 409, code: "ENTITY_TYPE_REQUIRED", message: "Say who the account is for.", details: { party, options } });

function draw(onRestart: (entityType?: KycEntityType) => Promise<{ notified: boolean }>) {
    const onChanged = vi.fn();
    render(<DigioCard party="Sharma Hoardings" digio={null} verified={false} imagesPurgedAt={null} onRestart={onRestart} onReviewManually={() => {}} manualReview={false} onChanged={onChanged} />);
    return { onChanged };
}

const parties = [
    { kind: "publisher", party: "PUBLISHER", restart: (entityType?: KycEntityType) => kycService.restartDigio("pub_1", entityType), path: "/publishers/kyc-queue/pub_1/digio/restart" },
    { kind: "advertiser", party: "ADVERTISER", restart: (entityType?: KycEntityType) => advertiserKycService.restartDigio("akyc_1", entityType), path: "/advertiser-kyc/akyc_1/digio/restart" },
    { kind: "print partner", party: "PRINT_PARTNER", restart: (entityType?: KycEntityType) => printPartnerKycService.restartDigio("pkyc_1", entityType), path: "/print-partner-kyc/pkyc_1/digio/restart" },
] as const;

describe("DigioCard — the restart and the entity type", () => {
    for (const party of parties) {
        it(`a ${party.kind}'s restart answered 409 ENTITY_TYPE_REQUIRED opens the picker and restarts with the chosen type`, async () => {
            backend.refusals = [required(party.party)];
            const { onChanged } = draw(party.restart);
            fireEvent.click(screen.getByRole("button", { name: "Start a Digio check" }));

            const picker = await screen.findByTestId("entity-type-picker");
            expect(within(picker).getByRole("heading", { name: "Who is this account for?" })).toBeInTheDocument();
            expect(within(picker).getAllByRole("radio").map((radio) => radio.getAttribute("value"))).toEqual(["INDIVIDUAL", "COMPANY", "NON_PROFIT"]);
            expect(onChanged).not.toHaveBeenCalled();
            expect(toast.error).not.toHaveBeenCalled();

            fireEvent.click(within(picker).getByRole("radio", { name: "Company" }));
            fireEvent.click(within(picker).getByRole("button", { name: "Continue to verification" }));
            await waitFor(() => expect(onChanged).toHaveBeenCalled());
            expect(backend.posts).toEqual([
                { path: party.path, body: {} },
                { path: party.path, body: { entityType: "COMPANY" } },
            ]);
            expect(screen.queryByTestId("entity-type-picker")).not.toBeInTheDocument();
            expect(toast.success).toHaveBeenCalledWith("A fresh Digio check is on its way to Sharma Hoardings", expect.anything());
        });
    }

    it("a restart for an account whose type is known sends the empty body and asks nothing", async () => {
        const { onChanged } = draw(parties[0].restart);
        fireEvent.click(screen.getByRole("button", { name: "Start a Digio check" }));
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.posts).toEqual([{ path: "/publishers/kyc-queue/pub_1/digio/restart", body: {} }]);
        expect(screen.queryByTestId("entity-type-picker")).not.toBeInTheDocument();
    });

    it("says Digio's own failures in the owner's words, and the switch's 503 as the switch", async () => {
        draw(parties[0].restart);
        const restart = screen.getByRole("button", { name: "Start a Digio check" });

        backend.refusals = [{ status: 503, code: "KYC_PROVIDER_UNAVAILABLE", message: "Digio did not answer", details: { provider: "DIGIO", reason: "PROVIDER_ERROR" } }];
        fireEvent.click(restart);
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Digio isn't answering right now. Try again in a few minutes."));

        toast.error.mockReset();
        backend.refusals = [{ status: 502, code: "KYC_PROVIDER_REFUSED", message: "Digio refused", details: { provider: "DIGIO", status: 404, code: "TEMPLATE_NOT_FOUND" } }];
        fireEvent.click(restart);
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Online verification isn't available for this account type yet. Please contact ADX support."));

        toast.error.mockReset();
        backend.refusals = [{ status: 503, code: "KYC_PROVIDER_UNAVAILABLE", message: "Digio is off", details: { provider: "MANUAL", retryAfter: 300 } }];
        fireEvent.click(restart);
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Digio is switched off", { description: "Review the documents by hand instead." }));
    });
});
