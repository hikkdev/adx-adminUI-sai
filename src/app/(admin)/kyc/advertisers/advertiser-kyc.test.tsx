import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * The advertiser KYC tab on the publisher queue's layout — 2 Oct 2026 (the
 * owner, KYC › Publishers beside KYC › Advertisers: "Why do they look so
 * different? Why can't they look uniform?").
 *
 * What is pinned: the tab is the publisher desk's — the title and the
 * one-line summary where the three number cards were, the state chips, the
 * search box with "Columns", one table in the shared column order with the
 * entity type where Publishers puts its own, "Open the case" on a row with a
 * record — and the case opens on its own page, `/kyc/advertisers/:profileId`,
 * not in a pane beside the list. The case page loads by the PROFILE id and
 * keeps every action the pane had (Assign to me, Escalate, Verify, the
 * Verification checks panel). A link that named a case for the pane
 * (`?case=`) goes to the page.
 */

const { backend, router } = vi.hoisted(() => {
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        caseRead: null as unknown,
        queue: null as unknown,
        reset() {
            this.calls = [];
            this.caseRead = null;
            this.queue = null;
        },
    };
    const router = { replace: vi.fn(), push: vi.fn(), search: "" };
    return { backend, router };
});

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: router.push, replace: router.replace, refresh: vi.fn() }),
    usePathname: () => "/kyc/advertisers",
    useSearchParams: () => new URLSearchParams(router.search),
    notFound: () => {
        throw new Error("NEXT_NOT_FOUND");
    },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

vi.mock("@/lib/auth", () => {
    const value = () => ({ user: { id: "usr_admin", name: "Priya", roles: ["ADMIN"] }, loading: false, can: () => true });
    return { useAuth: value, useOptionalAuth: value };
});

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const answer = (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        if (method === "GET" && path.startsWith("/advertiser-kyc?")) return backend.queue;
        if (method === "GET" && path.startsWith("/advertiser-kyc/")) return backend.caseRead;
        if (method === "GET" && path.startsWith("/verification/attempts")) return { caseType: "ADVERTISER_KYC", caseId: "adv_1", attempts: [], sessions: [], backup: null };
        if (method === "GET" && path.startsWith("/files/")) return null;
        if (method === "GET") return { kyc: { clientId: null, clientSecret: null, baseUrl: null, kycProvider: "DIGIO" } };
        return backend.caseRead;
    };
    return {
        ...actual,
        api: {
            ...actual.api,
            get: async (path: string) => answer("GET", path),
            post: async (path: string, body?: unknown) => answer("POST", path, body),
            patch: async (path: string, body?: unknown) => answer("PATCH", path, body),
            put: async (path: string, body?: unknown) => answer("PUT", path, body),
        },
    };
});

import { shapeAdvertiserKyc, type WireAdvertiserKyc } from "@/services/advertiser-kyc";
import { shapeKycStateCounts } from "@/services/kyc-state";
import { AdvertiserKycLoader } from "./advertiser-kyc-loader";
import { AdvertiserKycView } from "./advertiser-kyc-view";
import { AdvertiserCaseLoader } from "./[id]/advertiser-case-loader";

const blank = {
    nationalIdUrl: null,
    panCardUrl: null,
    utilityBillUrl: null,
    drivingLicenseUrl: null,
    commercialIncCertUrl: null,
    commercialAssociationArticleUrl: null,
    commercialPanIdUrl: null,
    commercialGstCertUrl: null,
    ngoRegCertUrl: null,
    ngo80gCertUrl: null,
    ngoFcraRegUrl: null,
    agencyAuthLetterUrl: null,
    agencyGovtIdUrl: null,
    govIdType: null,
    govIdFrontUrl: null,
    govIdBackUrl: null,
    panNumber: null,
    panSignatureUrl: null,
    addressProofType: null,
    addressProofUrl: null,
    selfieUrl: null,
    rejectionReason: null,
    reviewedAt: null,
} satisfies Partial<WireAdvertiserKyc>;

/** An advertiser with a record under review — the four INDIVIDUAL documents in, past the SLA. */
const underReview: WireAdvertiserKyc = {
    ...blank,
    id: "akyc_1",
    kycId: "akyc_1",
    advertiserId: "usr_adv",
    advertiserProfileId: "adv_1",
    state: "PENDING",
    kycType: "INDIVIDUAL",
    nationalIdUrl: "/files/f_national",
    panCardUrl: "/files/f_pan",
    utilityBillUrl: "/files/f_bill",
    drivingLicenseUrl: "/files/f_dl",
    panNumber: "ABCDE1234F",
    status: "PENDING",
    method: "MANUAL",
    submittedAt: "2026-09-29T10:00:00.000Z",
    createdAt: "2026-09-20T10:00:00.000Z",
    ageHours: 72,
    slaBreached: true,
    party: { id: "adv_1", displayId: "ADV-2009-2601", name: "Kiran Rao", companyName: "Bright Signs", email: "kiran@bright.example", mobile: "+919800000002", city: "Pune", userId: "usr_adv", kycStatus: "PENDING", type: "INDIVIDUAL", createdAt: "2026-09-20T10:00:00.000Z" },
};

/** An advertiser with no record — the profile alone, as the queue sends it since N3-B. */
const arrived: WireAdvertiserKyc = {
    ...blank,
    id: "adv_2",
    kycId: null,
    advertiserId: null,
    state: "AWAITING_DOCUMENTS",
    kycType: null,
    status: null,
    submittedAt: null,
    createdAt: null,
    party: { id: "adv_2", displayId: "ADV-2809-2602", name: "Meera Iyer", companyName: null, email: null, mobile: "+919800000003", city: "Mumbai", userId: null, kycStatus: "PENDING", type: "INDIVIDUAL", createdAt: "2026-09-28T09:00:00.000Z" },
};

const counts = { AWAITING_DOCUMENTS: 1, REQUESTED: 0, PENDING: 1, NEEDS_INFO: 0, REJECTED: 0, VERIFIED: 3, escalated: 0, requested: 0 };

beforeEach(() => {
    backend.reset();
    router.replace.mockReset();
    router.push.mockReset();
    router.search = "";
});

describe("the advertiser KYC tab", () => {
    const queue = () => {
        const cases = [shapeAdvertiserKyc(underReview, 48), shapeAdvertiserKyc(arrived, 48)];
        return { cases, total: 5, breached: 1, slaHours: 48, counts: shapeKycStateCounts(counts), escalated: 0, requested: 0 };
    };

    it("is the publisher desk's layout: title, the one-line summary, chips, search and Columns, one table — no number cards, no side pane", () => {
        const loaded = queue();
        render(<AdvertiserKycView loaded={{ everything: loaded, visible: loaded }} chip="all" onChip={() => {}} onChanged={() => {}} />);

        expect(screen.getByRole("heading", { level: 1, name: "Advertiser KYC" })).toBeInTheDocument();
        expect(screen.getByText("1 awaiting documents · 1 under review · 1 past SLA · 48h review SLA")).toBeInTheDocument();
        // The page's actions, top right, as on Publishers.
        expect(screen.getByRole("button", { name: /Read pending documents/ })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Assign reviewers" })).toBeInTheDocument();
        // The number cards are gone; their figures are the line above.
        expect(screen.queryByText("Can book campaigns")).not.toBeInTheDocument();
        expect(screen.queryByText("Review first")).not.toBeInTheDocument();

        const chips = screen.getByRole("tablist");
        expect(within(chips).getAllByRole("tab").map((tab) => tab.textContent?.replace(/\d+$/, ""))).toEqual([
            "All",
            "Awaiting documents",
            "Requested",
            "Pending review",
            "Needs info",
            "Rejected",
            "Verified",
            "Escalated",
        ]);

        expect(screen.getByPlaceholderText("Search advertisers, display id, contact, email")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Columns/ })).toBeInTheDocument();

        const headers = screen
            .getAllByRole("columnheader")
            .map((header) => header.textContent?.trim())
            .filter(Boolean);
        expect(headers).toEqual(["Advertiser", "Entity type", "Method", "Submitted / arrived", "Requested / recorded by", "SLA", "Working it", "State"]);

        // The row with a record: the shared row, and "Open the case" goes to the case page by the PROFILE id.
        const reviewRow = screen.getByText("Bright Signs").closest("tr")!;
        expect(within(reviewRow).getByText("ADV-2009-2601 · Pune · +919800000002")).toBeInTheDocument();
        expect(within(reviewRow).getByText("Individual")).toBeInTheDocument();
        expect(within(reviewRow).getByText("4 uploaded")).toBeInTheDocument();
        expect(within(reviewRow).getByText("Breached · 72h")).toBeInTheDocument();
        expect(within(reviewRow).getByText("Nobody")).toBeInTheDocument();
        expect(within(reviewRow).getByRole("link", { name: /Open the case/ })).toHaveAttribute("href", "/kyc/advertisers/adv_1");
        expect(within(reviewRow).getByTestId("kyc-row-menu")).toBeInTheDocument();

        // The profile alone: when it arrived, the pill, the one click — and no case to open.
        const arrivedRow = screen.getByText("Meera Iyer").closest("tr")!;
        expect(within(arrivedRow).getByText(/Arrived 28 Sept? 2026/)).toBeInTheDocument();
        expect(within(arrivedRow).getByRole("button", { name: "Send Digio request" })).toBeInTheDocument();
        expect(within(arrivedRow).queryByText("Open the case")).not.toBeInTheDocument();

        // No pane beside the list.
        expect(screen.queryByTestId("advertiser-party-pane")).not.toBeInTheDocument();
    });

    it("opens a case with a record on its own page from the row", () => {
        const loaded = queue();
        render(<AdvertiserKycView loaded={{ everything: loaded, visible: loaded }} chip="all" onChip={() => {}} onChanged={() => {}} />);
        fireEvent.click(screen.getByText("Bright Signs"));
        expect(router.push).toHaveBeenCalledWith("/kyc/advertisers/adv_1");
        router.push.mockReset();
        fireEvent.click(screen.getByText("Meera Iyer"));
        expect(router.push).not.toHaveBeenCalled();
    });

    it("sends a link that opened a case in the old pane (`?case=`) to the case page", async () => {
        router.search = "case=adv_1";
        backend.queue = { items: [], total: 0, page: 1, pageSize: 100, counts, breached: 0, slaHours: 48 };
        render(<AdvertiserKycLoader />);
        await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/kyc/advertisers/adv_1"));
    });
});

describe("the advertiser case page", () => {
    const caseRead = (over: Partial<WireAdvertiserKyc> = {}) => ({
        ...underReview,
        party: undefined,
        advertiser: underReview.party,
        documentReviews: [],
        liveness: null,
        slaHours: 48,
        ...over,
    });

    it("loads by the profile id and draws the case-page shell: back to the queue, the name, the summary, the documents", async () => {
        backend.caseRead = caseRead();
        render(<AdvertiserCaseLoader id="adv_1" />);

        expect(await screen.findByRole("heading", { level: 1, name: "Bright Signs" })).toBeInTheDocument();
        expect(backend.calls).toContainEqual({ method: "GET", path: "/advertiser-kyc/adv_1", body: undefined });
        expect(screen.getByRole("link", { name: /Advertiser KYC/ })).toHaveAttribute("href", "/kyc/advertisers");
        expect(screen.getByText("KYC review · advertiser")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Open the advertiser" })).toHaveAttribute("href", "/advertisers/adv_1");
        expect(screen.getByText("Documents for individual advertisers")).toBeInTheDocument();
        expect(screen.getByText("4 of 4 required on file")).toBeInTheDocument();
        // The Verification checks panel, keyed by the profile id.
        await waitFor(() => expect(backend.calls.some((call) => call.path === "/verification/attempts?caseType=ADVERTISER_KYC&caseId=adv_1")).toBe(true));
        expect(screen.getByText("Verification checks")).toBeInTheDocument();
    });

    it("keeps the desk's actions: Assign to me, Escalate, and Verify behind its confirm", async () => {
        backend.caseRead = caseRead();
        render(<AdvertiserCaseLoader id="adv_1" />);
        await screen.findByRole("heading", { level: 1, name: "Bright Signs" });

        fireEvent.click(screen.getByRole("button", { name: "Assign to me" }));
        await waitFor(() => expect(backend.calls).toContainEqual({ method: "PATCH", path: "/advertiser-kyc/akyc_1/assign", body: { adminUserId: "me" } }));

        fireEvent.click(screen.getByRole("button", { name: "Escalate" }));
        fireEvent.change(await screen.findByLabelText("Reason for escalating"), { target: { value: "The PAN name does not match" } });
        fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Escalate" }));
        await waitFor(() =>
            expect(backend.calls).toContainEqual({ method: "POST", path: "/advertiser-kyc/akyc_1/escalate", body: { reason: "The PAN name does not match" } })
        );

        fireEvent.click(screen.getByRole("button", { name: "Verify advertiser" }));
        fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Verify advertiser" }));
        await waitFor(() => expect(backend.calls).toContainEqual({ method: "PATCH", path: "/advertiser-kyc/akyc_1/review", body: { status: "VERIFIED" } }));
    });

    it("holds Verify while a required document is missing, and says so", async () => {
        backend.caseRead = caseRead({ utilityBillUrl: null });
        render(<AdvertiserCaseLoader id="adv_1" />);
        await screen.findByRole("heading", { level: 1, name: "Bright Signs" });
        expect(screen.getByRole("button", { name: "Verify advertiser" })).toBeDisabled();
        expect(screen.getByText("1 required document missing, so this cannot be verified yet")).toBeInTheDocument();
    });
});
