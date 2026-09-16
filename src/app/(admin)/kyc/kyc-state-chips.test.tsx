import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

/**
 * The state chips on the KYC tabs — N3-C.
 *
 * What is pinned, on two tabs (publishers and agents): the seven chips —
 * the six party states and Escalated — drawn with the server's counts
 * (`counts` on the publisher queue, `meta.counts` on the agent queue, each
 * counted with the state facet removed) and "All" with the total; a chip
 * goes into the URL as `?state=`, and an old chip word in the URL
 * (`awaiting_review`) lands on the state it names; a party with no record
 * is drawn from the party alone — name, ids, contact, when they arrived —
 * with the state pill and the actions its state allows.
 */

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), search: "" }));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: router.push, replace: router.replace, refresh: vi.fn() }),
    usePathname: () => "/kyc",
    useSearchParams: () => new URLSearchParams(router.search),
}));

vi.mock("@/lib/auth", () => ({
    useAuth: () => ({ user: { id: "usr_admin", name: "Priya", roles: ["ADMIN"] }, loading: false, can: () => true }),
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

import { shapeKycCase, type WireKycRow } from "@/services/kyc";
import { shapeAgentKycQueueRow, type WireAgentKycQueueRow } from "@/services/agent-kyc";
import { kycStateChips, shapeKycStateCounts, stateChipFromQuery } from "@/services/kyc-state";
import { useStateChip } from "./_shared/use-state-chip";
import { KycQueueView } from "./kyc-queue";
import { AgentKycQueue } from "./agents/agent-kyc-queue";

beforeEach(() => {
    router.replace.mockReset();
    router.push.mockReset();
    router.search = "";
});

/** A publisher with no record — the party alone, as the queue sends it since N3-B. */
const arrived: WireKycRow = {
    id: "pub_new",
    displayId: "PUB-1409-2601",
    name: "Sharma Hoardings",
    mobile: "+919845012345",
    email: null,
    type: "INDIVIDUAL",
    contactName: null,
    city: "Pune",
    state: "AWAITING_DOCUMENTS",
    gstin: null,
    userId: null,
    kycStatus: "PENDING",
    onboardingStatus: "PENDING_ONBOARDING",
    createdAt: "2026-09-14T15:00:00.000Z",
    agent: null,
    kycId: null,
    kyc: null,
    ageHours: null,
    slaBreached: false,
};

const wireCounts = { AWAITING_DOCUMENTS: 3, awaitingDocuments: 3, REQUESTED: 1, PENDING: 2, NEEDS_INFO: 0, REJECTED: 1, VERIFIED: 5, escalated: 1, requested: 1 };

function ChipProbe() {
    const [chip, setChip] = useStateChip();
    return (
        <div>
            <output data-testid="chip">{chip}</output>
            <button type="button" onClick={() => setChip("REQUESTED")}>
                requested
            </button>
            <button type="button" onClick={() => setChip("all")}>
                all
            </button>
        </div>
    );
}

describe("the state chip in the URL", () => {
    it("reads `?state=` (and the old chip words), and writes the chip back as `?state=` — nothing for All", () => {
        router.search = "state=awaiting_review";
        render(<ChipProbe />);
        expect(screen.getByTestId("chip")).toHaveTextContent("PENDING");
        fireEvent.click(screen.getByRole("button", { name: "requested" }));
        expect(router.replace).toHaveBeenLastCalledWith("/kyc?state=requested");
        fireEvent.click(screen.getByRole("button", { name: "all" }));
        expect(router.replace).toHaveBeenLastCalledWith("/kyc");
        expect(stateChipFromQuery("needs_info")).toBe("NEEDS_INFO");
        expect(stateChipFromQuery("ESCALATED")).toBe("ESCALATED");
        expect(stateChipFromQuery("nonsense")).toBe("all");
    });

    it("draws the seven chips with the server's counts and All with the total", () => {
        const counts = shapeKycStateCounts(wireCounts);
        expect(kycStateChips(counts, 12).map((chip) => `${chip.label}:${chip.count}`)).toEqual([
            "All:12",
            "Awaiting documents:3",
            "Requested:1",
            "Pending review:2",
            "Needs info:0",
            "Rejected:1",
            "Verified:5",
            "Escalated:1",
        ]);
        // A server one release behind sends the record statuses alone; the missing states read 0, `requested` stands in for REQUESTED.
        expect(shapeKycStateCounts({ PENDING: 2, VERIFIED: 1 }, { escalated: 0, requested: 4 })).toMatchObject({ AWAITING_DOCUMENTS: 0, REQUESTED: 4, PENDING: 2, requested: 4 });
    });
});

describe("the publisher tab", () => {
    it("draws the chips off `counts`, a party with no record from the party alone, and its actions", () => {
        const shaped = shapeKycCase(arrived, 48);
        const queue = { cases: [shaped], total: 12, breached: 1, slaHours: 48, escalated: 1, requested: 1, counts: shapeKycStateCounts(wireCounts) };
        const onChip = vi.fn();
        render(<KycQueueView loaded={{ visible: queue, everything: queue, escalationSlaMultiplier: null }} chip="all" onChip={onChip} onChanged={() => {}} />);

        const chips = screen.getByRole("tablist");
        expect(within(chips).getByRole("tab", { name: /Awaiting documents/ })).toHaveTextContent("3");
        expect(within(chips).getByRole("tab", { name: /Requested/ })).toHaveTextContent("1");
        expect(within(chips).getByRole("tab", { name: /Verified/ })).toHaveTextContent("5");
        expect(within(chips).getByRole("tab", { name: /Escalated/ })).toHaveTextContent("1");
        fireEvent.click(within(chips).getByRole("tab", { name: /Requested/ }));
        expect(onChip).toHaveBeenCalledWith("REQUESTED");

        // The header: what is waiting on the party, what is under review, what is past the SLA.
        expect(screen.getByText(/4 awaiting documents · 2 under review · 1 past SLA/)).toBeInTheDocument();

        // The party alone: name, ids, contact, when they arrived, the pill — and no record columns invented.
        expect(shaped.state).toBe("AWAITING_DOCUMENTS");
        expect(shaped.kycId).toBeNull();
        expect(screen.getByText("Sharma Hoardings")).toBeInTheDocument();
        expect(screen.getByText("PUB-1409-2601 · Pune · +919845012345")).toBeInTheDocument();
        expect(screen.getByText(/Arrived 14 Sept? 2026/)).toBeInTheDocument();
        expect(screen.getByText("Awaiting documents", { selector: "span" })).toBeInTheDocument();
        // Its actions: the one click and the menu; no case to open, and no roster picker anywhere.
        expect(screen.getByRole("button", { name: "Send Digio request" })).toBeInTheDocument();
        expect(screen.queryByText("Open the case")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Record at the desk/ })).not.toBeInTheDocument();
    });
});

describe("the agent tab", () => {
    it("draws the chips off `meta.counts` and every agent from the moment the profile exists", () => {
        const row: WireAgentKycQueueRow = {
            id: "agt_1",
            agentId: "agt_1",
            kycId: null,
            state: "AWAITING_DOCUMENTS",
            govIdType: null,
            govIdFrontUrl: null,
            govIdBackUrl: null,
            panNumber: null,
            panFrontUrl: null,
            panSignatureUrl: null,
            addressProofType: null,
            addressProofUrl: null,
            selfieUrl: null,
            bankProofUrl: null,
            status: null,
            rejectionReason: null,
            recordedById: null,
            submittedAt: null,
            reviewedAt: null,
            reviewedById: null,
            agent: { id: "agt_1", userId: "usr_agt", displayId: "AGT-0001", city: "Pune", createdAt: "2026-09-12T09:00:00.000Z", user: { name: "Ravi Kumar", mobile: "+919900000001", email: null } },
        };
        const shaped = shapeAgentKycQueueRow(row);
        expect(shaped).toMatchObject({ state: "AWAITING_DOCUMENTS", kycId: null, status: null, documents: 0, userId: "usr_agt", createdAt: "2026-09-12T09:00:00.000Z" });
        const queue = { rows: [shaped], total: 4, counts: shapeKycStateCounts({ AWAITING_DOCUMENTS: 4, REQUESTED: 0, PENDING: 0, NEEDS_INFO: 0, REJECTED: 0, VERIFIED: 0 }) };
        const onChip = vi.fn();
        render(<AgentKycQueue loaded={{ visible: queue, everything: queue }} chip="all" onChip={onChip} live onChanged={() => {}} />);

        const chips = screen.getByRole("tablist");
        expect(within(chips).getByRole("tab", { name: /^All/ })).toHaveTextContent("4");
        expect(within(chips).getByRole("tab", { name: /Awaiting documents/ })).toHaveTextContent("4");
        fireEvent.click(within(chips).getByRole("tab", { name: /Verified/ }));
        expect(onChip).toHaveBeenCalledWith("VERIFIED");
        expect(screen.getByText("Ravi Kumar")).toBeInTheDocument();
        expect(screen.getByText("AGT-0001 · Pune · +919900000001")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Send Digio request" })).toBeInTheDocument();
    });
});
