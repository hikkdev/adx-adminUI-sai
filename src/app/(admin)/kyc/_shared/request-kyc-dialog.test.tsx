import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * "Request KYC" — Lot N.
 *
 * What is pinned: the dialog posts the channel and the trimmed note to the
 * party's own request route — `POST /publishers/kyc-queue/:id/request`,
 * `POST /advertiser-kyc/:id/request`, `POST /print-partner-kyc/:id/request`
 * — and nothing else; the confirm names what the party receives before the
 * desk commits; and a party already verified is explained, not retried.
 */

const backend = vi.hoisted(() => ({
    posts: [] as { path: string; body: unknown }[],
    verified: false,
    reset() {
        this.posts = [];
        this.verified = false;
    },
    async post(path: string, body: unknown) {
        this.posts.push({ path, body });
        if (this.verified) {
            const { ApiError } = await import("@/lib/api-client");
            throw new ApiError(409, "KYC_ALREADY_VERIFIED", "Already verified");
        }
        return { kyc: { id: "k1" }, digio: null, notified: true };
    },
}));

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

beforeEach(() => backend.reset());

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
