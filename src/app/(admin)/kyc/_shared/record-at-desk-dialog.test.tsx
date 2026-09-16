import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * "Record KYC at the desk" — Lot N.
 *
 * What is pinned: a tile picked at the desk goes up under the party's KYC
 * purpose in the party's name (`ownerUserId`) and lands in the body as its
 * `/files/:id` URL; "Attest presence" posts the note to
 * `POST /user-kyc/:userId/attest`; submit is the party's own PUT —
 * `/publishers/kyc-queue/:id`, `/advertiser-kyc/:id`,
 * `/print-partner-kyc/:id` — with the tiles and the typed facts, and
 * nothing for a fact left blank; a party with an account is not recorded
 * until their presence is proved (decision 131); and the workbench opens
 * on the new case.
 */

const backend = vi.hoisted(() => ({
    posts: [] as { path: string; body: unknown }[],
    puts: [] as { path: string; body: unknown }[],
    reset() {
        this.posts = [];
        this.puts = [];
    },
    async post(path: string, body: unknown) {
        const sent = body instanceof FormData ? { purpose: body.get("purpose"), ownerUserId: body.get("ownerUserId"), name: (body.get("file") as File).name } : body;
        this.posts.push({ path, body: sent });
        if (path === "/upload") return { id: "f_pan", url: "https://api.adx.in/api/v1/files/f_pan" };
        if (path.endsWith("/attest")) return { kyc: { id: "uk1", status: "VERIFIED", attestedAt: "2026-09-14T09:00:00.000Z" }, created: true };
        throw new Error(`No answer scripted for ${path}`);
    },
    async put(path: string, body: unknown) {
        this.puts.push({ path, body });
        return { id: "ppk_1", status: "PENDING", printPartner: { id: "prt_1", name: "Sharma Prints", mobile: "1", email: null, userId: "usr_p", city: null, isActive: true, kycStatus: "PENDING", displayId: null }, method: "MANUAL" };
    },
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        api: { ...actual.api, post: (path: string, body: unknown) => backend.post(path, body), put: (path: string, body: unknown) => backend.put(path, body) },
    };
});

import { kycService, PUBLISHER_DESK_FACTS } from "@/services/kyc";
import { advertiserKycService } from "@/services/advertiser-kyc";
import { PARTNER_DESK_FACTS, printPartnerKycService } from "@/services/print-partner-kyc";
import { deskBody, RecordAtDeskDialog } from "./record-at-desk-dialog";

beforeEach(() => backend.reset());

const tiles = [
    { field: "panFrontUrl", label: "PAN card" },
    { field: "gstUrl", label: "GST certificate" },
];

describe("deskBody", () => {
    it("sends the tiles that hold a URL and the facts that are filled, and nothing else", () => {
        expect(deskBody({ documents: { panFrontUrl: "https://api.adx.in/api/v1/files/f1", gstUrl: undefined }, panNumber: " abcde1234f ", govIdType: "", addressProofType: "UTILITY_BILL" }, PUBLISHER_DESK_FACTS)).toEqual({
            panFrontUrl: "https://api.adx.in/api/v1/files/f1",
            panNumber: "ABCDE1234F",
            addressProofType: "UTILITY_BILL",
        });
        expect(deskBody({ documents: {}, panNumber: "", govIdType: "AADHAAR", addressProofType: "UTILITY_BILL" }, PARTNER_DESK_FACTS)).toEqual({ govIdType: "AADHAAR" });
    });

    it("refuses a PAN that is not one", () => {
        expect(() => deskBody({ documents: {}, panNumber: "12345", govIdType: "", addressProofType: "" }, PUBLISHER_DESK_FACTS)).toThrow(/PAN/);
    });
});

describe("RecordAtDeskDialog", () => {
    it("uploads a tile as the party's, attests presence, and PUTs the partner's record with the tiles and the facts", async () => {
        const onRecorded = vi.fn();
        render(
            <RecordAtDeskDialog
                open
                onOpenChange={() => {}}
                party="Sharma Prints"
                userId="usr_partner"
                purpose="PRINT_PARTNER_KYC"
                tiles={tiles}
                facts={PARTNER_DESK_FACTS}
                onSubmit={async (body) => {
                    const recorded = await printPartnerKycService.recordAtDesk("prt_1", body);
                    return { caseHref: `/kyc/print-partners/${recorded.id}` };
                }}
                onRecorded={onRecorded}
            />
        );

        /* A tile goes up the moment it is picked — under the partner's purpose, in the partner's name. */
        const file = new File(["pan"], "pan.jpg", { type: "image/jpeg" });
        fireEvent.change(screen.getByLabelText("Upload PAN card"), { target: { files: [file] } });
        await waitFor(() => expect(backend.posts).toContainEqual({ path: "/upload", body: { purpose: "PRINT_PARTNER_KYC", ownerUserId: "usr_partner", name: "pan.jpg" } }));
        await screen.findByText("Recorded · open");

        fireEvent.change(screen.getByLabelText("PAN"), { target: { value: "abcde1234f" } });

        /* Presence: the admin's word, kept on the row. */
        fireEvent.change(screen.getByLabelText("Attest presence"), { target: { value: "Met in person at the Pune desk, 14 Sep" } });
        fireEvent.click(screen.getByRole("button", { name: "Attest presence" }));
        await waitFor(() => expect(backend.posts).toContainEqual({ path: "/user-kyc/usr_partner/attest", body: { note: "Met in person at the Pune desk, 14 Sep" } }));
        await screen.findByTestId("presence-attested");

        fireEvent.click(screen.getByRole("button", { name: "Record and open the case" }));
        await waitFor(() => expect(onRecorded).toHaveBeenCalledWith("/kyc/print-partners/ppk_1"));
        expect(backend.puts).toEqual([{ path: "/print-partner-kyc/prt_1", body: { panFrontUrl: "https://api.adx.in/api/v1/files/f_pan", panNumber: "ABCDE1234F" } }]);
    });

    it("PUTs the publisher's and the advertiser's routes, refuses an empty record, and refuses a record with no presence proof for a party with an account", async () => {
        const onRecorded = vi.fn();
        const { unmount } = render(
            <RecordAtDeskDialog
                open
                onOpenChange={() => {}}
                party="Asha"
                userId="usr_pub"
                purpose="KYC"
                tiles={tiles}
                facts={PUBLISHER_DESK_FACTS}
                initial={{ documents: { gstUrl: "https://api.adx.in/api/v1/files/f_gst" } }}
                onSubmit={async (body) => {
                    await kycService.recordAtDesk("pub_1", body);
                    return { caseHref: "/kyc/pub_1" };
                }}
                onRecorded={onRecorded}
            />
        );
        /* Decision 131: Asha has an account and nothing proves her presence yet — refused before any call (a toast says so; no PUT leaves). */
        fireEvent.click(screen.getByRole("button", { name: "Record and open the case" }));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(backend.puts).toEqual([]);
        expect(onRecorded).not.toHaveBeenCalled();

        fireEvent.change(screen.getByLabelText("Attest presence"), { target: { value: "Video call, Aadhaar shown to camera" } });
        fireEvent.click(screen.getByRole("button", { name: "Attest presence" }));
        await screen.findByTestId("presence-attested");
        fireEvent.click(screen.getByRole("button", { name: "Record and open the case" }));
        await waitFor(() => expect(onRecorded).toHaveBeenCalledWith("/kyc/pub_1"));
        expect(backend.puts).toEqual([{ path: "/publishers/kyc-queue/pub_1", body: { gstUrl: "https://api.adx.in/api/v1/files/f_gst" } }]);
        unmount();

        backend.reset();
        const onRecordedAdvertiser = vi.fn();
        render(
            <RecordAtDeskDialog
                open
                onOpenChange={() => {}}
                party="Zomato"
                userId="usr_adv"
                purpose="ADVERTISER_KYC"
                tiles={tiles}
                facts={{ panNumber: true }}
                liveness={{ id: "uk_adv", status: "PENDING", fileId: "f_video", submittedAt: "2026-09-13T08:00:00.000Z", reviewedAt: null, rejectionReason: null, recordedById: null, attestedById: null, attestedAt: null, attestationNote: null }}
                onSubmit={async (body) => {
                    await advertiserKycService.recordAtDesk("akyc_1", body);
                    return { caseHref: "/kyc/advertisers" };
                }}
                onRecorded={onRecordedAdvertiser}
            />
        );
        /* Nothing uploaded, nothing typed: refused before any call (a toast says so; no PUT leaves). */
        fireEvent.click(screen.getByRole("button", { name: "Record and open the case" }));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(backend.puts).toEqual([]);
        expect(onRecordedAdvertiser).not.toHaveBeenCalled();

        fireEvent.change(screen.getByLabelText("PAN"), { target: { value: "ABCDE1234F" } });
        /* The row already carries the advertiser's video, so presence is proved and the record goes through. */
        fireEvent.click(screen.getByRole("button", { name: "Record and open the case" }));
        await waitFor(() => expect(onRecordedAdvertiser).toHaveBeenCalledWith("/kyc/advertisers"));
        expect(backend.puts).toEqual([{ path: "/advertiser-kyc/akyc_1", body: { panNumber: "ABCDE1234F" } }]);
    });

    it("offers no presence controls for a party with no account, and says why", () => {
        render(
            <RecordAtDeskDialog open onOpenChange={() => {}} party="Asha" userId={null} purpose="KYC" tiles={tiles} facts={{}} onSubmit={async () => ({ caseHref: "/kyc/pub_1" })} onRecorded={() => {}} />
        );
        expect(screen.getByTestId("presence-section")).toHaveTextContent("has not signed in yet");
        expect(screen.queryByRole("button", { name: "Attest presence" })).toBeNull();
    });
});
