import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * "Request KYC" — Lot N.
 *
 * What is pinned: the dialog posts the channel and the trimmed note to the
 * party's own request route — `POST /publishers/kyc-queue/:id/request`,
 * `POST /advertiser-kyc/:id/request`, `POST /print-partner-kyc/:id/request`
 * — and nothing else; the confirm names what the party receives before the
 * desk commits; and a party already verified is explained, not retried.
 *
 * Phase D (1 Oct 2026): a Digio ask answered 409 `ENTITY_TYPE_REQUIRED`
 * makes the dialog ask "Who is this account for?" with the server's
 * options and send the same request again with `{ entityType }`; a manual
 * ask never carries one; Digio's own failures are said in the owner's words.
 */

const backend = vi.hoisted(() => ({
    posts: [] as { path: string; body: unknown }[],
    verified: false,
    /** Phase D: what the next posts are refused with, in order; a post with none left succeeds. */
    refusals: [] as { status: number; code: string; message: string; details?: unknown }[],
    reset() {
        this.posts = [];
        this.verified = false;
        this.refusals = [];
    },
    async post(path: string, body: unknown) {
        this.posts.push({ path, body });
        const { ApiError } = await import("@/lib/api-client");
        if (this.verified) throw new ApiError(409, "KYC_ALREADY_VERIFIED", "Already verified");
        const refusal = this.refusals.shift();
        if (refusal) throw new ApiError(refusal.status, refusal.code, refusal.message, refusal.details);
        return { kyc: { id: "k1" }, digio: null, notified: true };
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
    return { ...actual, api: { ...actual.api, post: (path: string, body: unknown) => backend.post(path, body) } };
});

import { kycService } from "@/services/kyc";
import { advertiserKycService } from "@/services/advertiser-kyc";
import { printPartnerKycService } from "@/services/print-partner-kyc";
import { RequestKycDialog } from "./request-kyc-dialog";

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
    toast.error.mockReset();
});

const parties = [
    { kind: "publisher", request: (channel: "DIGIO" | "MANUAL", note?: string) => kycService.request("pub_1", channel, note), path: "/publishers/kyc-queue/pub_1/request" },
    { kind: "advertiser", request: (channel: "DIGIO" | "MANUAL", note?: string) => advertiserKycService.request("usr_adv", channel, note), path: "/advertiser-kyc/usr_adv/request" },
    { kind: "print partner", request: (channel: "DIGIO" | "MANUAL", note?: string) => printPartnerKycService.request("prt_1", channel, note), path: "/print-partner-kyc/prt_1/request" },
] as const;

describe("RequestKycDialog", () => {
    for (const party of parties) {
        it(`posts the channel and the note to the ${party.kind}'s request route`, async () => {
            const onRequested = vi.fn();
            render(<RequestKycDialog open onOpenChange={() => {}} party="Asha" hasAccount onRequest={party.request} onRequested={onRequested} />);

            fireEvent.click(screen.getByRole("radio", { name: /Manual — upload on the phone/ }));
            fireEvent.change(screen.getByLabelText("Note to Asha"), { target: { value: "  Bring the GST certificate  " } });
            expect(screen.getByTestId("request-outcome")).toHaveTextContent("upload their documents in the app");

            fireEvent.click(screen.getByRole("button", { name: "Send the request" }));
            await waitFor(() => expect(onRequested).toHaveBeenCalled());
            expect(backend.posts).toEqual([{ path: party.path, body: { channel: "MANUAL", note: "Bring the GST certificate" } }]);
        });
    }

    it("defaults to Digio, names what the party receives, and sends no note when none was typed", async () => {
        const onRequested = vi.fn();
        render(<RequestKycDialog open onOpenChange={() => {}} party="Asha" hasAccount={false} onRequest={parties[0].request} onRequested={onRequested} />);
        expect(screen.getByTestId("request-outcome")).toHaveTextContent("Digio identity check is opened on Asha's behalf");
        expect(screen.getByTestId("request-outcome")).toHaveTextContent("no app account yet");
        fireEvent.click(screen.getByRole("button", { name: "Open the Digio check" }));
        await waitFor(() => expect(onRequested).toHaveBeenCalled());
        expect(backend.posts).toEqual([{ path: "/publishers/kyc-queue/pub_1/request", body: { channel: "DIGIO" } }]);
    });

    it("explains a party already verified and closes rather than retrying", async () => {
        backend.verified = true;
        const onOpenChange = vi.fn();
        const onRequested = vi.fn();
        render(<RequestKycDialog open onOpenChange={onOpenChange} party="Asha" hasAccount onRequest={parties[2].request} onRequested={onRequested} />);
        fireEvent.click(screen.getByRole("button", { name: "Open the Digio check" }));
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
        expect(onRequested).not.toHaveBeenCalled();
        expect(backend.posts).toHaveLength(1);
    });
});

describe("RequestKycDialog — the entity type (Phase D)", () => {
    const options = [
        { value: "INDIVIDUAL", label: "Individual" },
        { value: "SOLE_PROPRIETOR", label: "Sole proprietor" },
        { value: "COMPANY", label: "Company" },
        { value: "LLP_PARTNERSHIP", label: "LLP or partnership" },
    ];
    const required = { status: 409, code: "ENTITY_TYPE_REQUIRED", message: "Say who the account is for.", details: { party: "PRINT_PARTNER", options } };
    const partner = (channel: "DIGIO" | "MANUAL", note?: string, entityType?: Parameters<typeof printPartnerKycService.request>[3]) => printPartnerKycService.request("prt_1", channel, note, entityType);

    it("asks who the account is for inside the dialog on 409 ENTITY_TYPE_REQUIRED, and sends the request again with the chosen type", async () => {
        backend.refusals = [required];
        const onRequested = vi.fn();
        const onOpenChange = vi.fn();
        render(<RequestKycDialog open onOpenChange={onOpenChange} party="Asha Prints" hasAccount onRequest={partner} onRequested={onRequested} />);
        expect(screen.queryByTestId("entity-type-ask")).not.toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("Note to Asha Prints"), { target: { value: "By Friday" } });
        fireEvent.click(screen.getByRole("button", { name: "Open the Digio check" }));

        const ask = await screen.findByTestId("entity-type-ask");
        expect(ask).toHaveTextContent("Who is this account for?");
        expect(ask).toHaveTextContent("This decides which documents the check asks for. Pick the one their PAN is registered as.");
        expect(within(ask).getAllByRole("radio").map((radio) => radio.getAttribute("value"))).toEqual(["INDIVIDUAL", "SOLE_PROPRIETOR", "COMPANY", "LLP_PARTNERSHIP"]);
        // Nothing was sent to Digio: the dialog stays open and waits for the choice.
        expect(onRequested).not.toHaveBeenCalled();
        expect(onOpenChange).not.toHaveBeenCalledWith(false);
        const go = screen.getByRole("button", { name: "Continue to verification" });
        expect(go).toBeDisabled();

        fireEvent.click(within(ask).getByRole("radio", { name: "LLP or partnership" }));
        fireEvent.click(go);
        await waitFor(() => expect(onRequested).toHaveBeenCalled());
        expect(backend.posts).toEqual([
            { path: "/print-partner-kyc/prt_1/request", body: { channel: "DIGIO", note: "By Friday" } },
            { path: "/print-partner-kyc/prt_1/request", body: { channel: "DIGIO", note: "By Friday", entityType: "LLP_PARTNERSHIP" } },
        ]);
    });

    it("a manual ask never carries the entity type, even after the dialog asked for one", async () => {
        backend.refusals = [required];
        const onRequested = vi.fn();
        render(<RequestKycDialog open onOpenChange={() => {}} party="Asha Prints" hasAccount onRequest={partner} onRequested={onRequested} />);
        fireEvent.click(screen.getByRole("button", { name: "Open the Digio check" }));
        const ask = await screen.findByTestId("entity-type-ask");
        fireEvent.click(within(ask).getByRole("radio", { name: "Company" }));

        fireEvent.click(screen.getByRole("radio", { name: /Manual — upload on the phone/ }));
        expect(screen.queryByTestId("entity-type-ask")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Send the request" }));
        await waitFor(() => expect(onRequested).toHaveBeenCalled());
        expect(backend.posts.at(-1)).toEqual({ path: "/print-partner-kyc/prt_1/request", body: { channel: "MANUAL" } });
    });

    it("says Digio's own failures in the owner's words and stays on Digio; the switch's 503 still moves the dialog to Manual", async () => {
        backend.refusals = [{ status: 502, code: "KYC_PROVIDER_REFUSED", message: "Digio refused", details: { provider: "DIGIO", status: 404, code: "TEMPLATE_NOT_FOUND" } }];
        render(<RequestKycDialog open onOpenChange={() => {}} party="Asha Prints" hasAccount onRequest={partner} />);
        fireEvent.click(screen.getByRole("button", { name: "Open the Digio check" }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Online verification isn't available for this account type yet. Please contact ADX support."));
        expect(screen.getByRole("radio", { name: /Digio link/ })).toBeChecked();

        toast.error.mockReset();
        backend.refusals = [{ status: 503, code: "KYC_PROVIDER_UNAVAILABLE", message: "Digio did not answer", details: { provider: "DIGIO", reason: "PROVIDER_ERROR" } }];
        fireEvent.click(screen.getByRole("button", { name: "Open the Digio check" }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Digio isn't answering right now. Try again in a few minutes."));
        expect(screen.getByRole("radio", { name: /Digio link/ })).toBeChecked();

        toast.error.mockReset();
        backend.refusals = [{ status: 503, code: "KYC_PROVIDER_UNAVAILABLE", message: "Digio is off", details: { provider: "DEGRADED", retryAfter: 300 } }];
        fireEvent.click(screen.getByRole("button", { name: "Open the Digio check" }));
        await waitFor(() => expect(screen.getByRole("radio", { name: /Manual — upload on the phone/ })).toBeChecked());
        expect(toast.error).toHaveBeenCalledWith("Digio is not available right now", { description: "Ask for the documents by hand instead — choose Manual." });
    });
});

/** 2 Oct 2026 (the account lifecycle): a closed account or one suspended from new work — the server's sentence, the dialog closed, the queue read again. */
describe("RequestKycDialog — an inactive account", () => {
    it("says the server's 409 ACCOUNT_CLOSED in its own words, closes, and re-reads", async () => {
        backend.refusals = [{ status: 409, code: "ACCOUNT_CLOSED", message: "This account is closed, so KYC can't be requested." }];
        const onOpenChange = vi.fn();
        const onRequested = vi.fn();
        render(<RequestKycDialog open onOpenChange={onOpenChange} party="Asha" hasAccount onRequest={parties[0].request} onRequested={onRequested} />);
        fireEvent.click(screen.getByRole("button", { name: "Open the Digio check" }));
        await waitFor(() => expect(toast.error).toHaveBeenCalled());
        expect(toast.error).toHaveBeenCalledWith("Can't ask Asha for KYC", { description: "This account is closed, so KYC can't be requested." });
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onRequested).toHaveBeenCalled();
    });
});
