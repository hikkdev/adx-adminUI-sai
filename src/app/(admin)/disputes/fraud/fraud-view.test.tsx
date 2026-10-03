import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { FraudCase, FraudCaseFile, FraudCasesPage, LinkedAccountsRead } from "@/services/fraud";

/**
 * The fraud desk over an empty queue.
 *
 * Both by-id reads are keyed on the selected case, and the selection is the
 * first row. With no rows there is no id and no read, and the check that a
 * read belonged to the selection was `file?.id === rowId` — true for
 * `undefined === undefined`, after which `file.value` dereferenced null and
 * the boundary took the page (ERR-7F3A21C9). The desk on its first day, or
 * under a filter nothing matches, must draw its empty state instead.
 *
 * 28 Sep 2026: and the link graph, rebuilt bipartite to the frame — the
 * accounts joined to the shared-attribute nodes between them, the clean
 * parties in their own column, a hover card per node, and a list instead of
 * the drawing when the card is narrow.
 */

vi.mock("@/services/fraud", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/fraud")>();
    return {
        ...actual,
        fraudService: {
            ...actual.fraudService,
            get: vi.fn(() => Promise.reject(new Error("not read"))),
            linked: vi.fn(() => Promise.reject(new Error("not read"))),
        },
    };
});

import { fraudService } from "@/services/fraud";
import { FraudView } from "./fraud-view";

const empty: FraudCasesPage = { items: [], total: 0, page: 1, pageSize: 50, counts: {} };

describe("FraudView with nothing in the queue", () => {
    it("draws the empty state and reads nothing, rather than dereferencing a read that never happened", () => {
        render(
            <FraudView
                page={empty}
                facets={{ status: "ALL", q: "" }}
                onFacetsChange={() => {}}
                admins={[]}
                preselectId={null}
                scan={null}
            />,
        );

        expect(screen.getByText("No cases match these filters.")).toBeInTheDocument();
        expect(screen.getAllByText("Select a case").length).toBeGreaterThan(0);
        expect(fraudService.get).not.toHaveBeenCalled();
        expect(fraudService.linked).not.toHaveBeenCalled();
    });
});

const now = Date.now();
const fraudCase: FraudCase = {
    id: "frd_1",
    displayId: "FR-1184",
    subjectType: "ADVERTISER",
    subjectId: "adv_1",
    kind: "Shared payout",
    status: "OPEN",
    summary: "Four advertisers sharing one payout account",
    openedByUserId: "usr_1",
    assignedToUserId: null,
    disputeId: null,
    decision: null,
    decidedByUserId: null,
    decidedAt: null,
    score: "0.910",
    signals: null,
    scoredAt: null,
    escalatedAt: null,
    escalatedToUserId: null,
    escalationNote: null,
    createdAt: new Date(now - 3_600_000).toISOString(),
    updatedAt: new Date(now - 3_600_000).toISOString(),
};
const file: FraudCaseFile = {
    ...fraudCase,
    notes: [],
    evidence: [],
    suspension: { name: "FakeAds Ltd", scopes: [], suspendedAt: null, suspensionReason: null, suspendedById: null },
};
const read: LinkedAccountsRead = {
    subject: { type: "ADVERTISER", id: "adv_1", name: "FakeAds Ltd", kycStatus: "PENDING", listingId: null },
    linked: [
        { party: { type: "ADVERTISER", id: "adv_2", name: "Prime Ads" }, via: ["SHARED_PAN", "SHARED_DEVICE", "SHARED_BANK"], walletBalance: "12500.00", openBookings: 3, kycStatus: "VERIFIED" },
        { party: { type: "ADVERTISER", id: "adv_3", name: "Nova Reach" }, via: ["SHARED_DEVICE", "SHARED_BANK"], walletBalance: null, openBookings: 0, kycStatus: "PENDING" },
        { party: { type: "PUBLISHER", id: "pub_9", name: "Skyline Co" }, via: ["SHARED_PAN", "SHARED_DEVICE"], walletBalance: "0.00", openBookings: 1 },
    ],
    evaluated: [
        { party: { type: "ADVERTISER", id: "adv_7", name: "Zepto" }, linked: false },
        { party: { type: "ADVERTISER", id: "adv_8", name: "Blinkit" }, linked: false },
    ],
    attributes: [
        { signal: "SHARED_PAN", label: "PAN number", display: "PAN ••••234F", accounts: 2 },
        { signal: "SHARED_BANK", label: "Payout account", display: "HDFC ••4821", accounts: 2 },
        { signal: "SHARED_DEVICE", label: "Device fingerprint", display: "Device 4f2a", accounts: 3 },
    ],
    valueAtRisk: "12500.00",
    computedAt: new Date(now).toISOString(),
};
const onePage: FraudCasesPage = { items: [fraudCase], total: 1, page: 1, pageSize: 100, counts: { OPEN: 1 } };

function renderDesk() {
    vi.mocked(fraudService.get).mockImplementation(() => Promise.resolve(file));
    vi.mocked(fraudService.linked).mockImplementation(() => Promise.resolve(read));
    return render(<FraudView page={onePage} facets={{ status: "ALL", q: "" }} onFacetsChange={() => {}} admins={[]} preselectId={null} scan={null} />);
}

const originalObserver = globalThis.ResizeObserver;
afterEach(() => {
    globalThis.ResizeObserver = originalObserver;
});

describe("FraudView — the bipartite link graph (28 Sep 2026)", () => {
    it("draws the accounts joined to shared-attribute nodes, the clean column, and no edge captions", async () => {
        renderDesk();
        const canvas = await screen.findByTestId("fraud-graph-canvas");
        const nodes = within(canvas).getAllByTestId("fraud-graph-node");
        const kinds = nodes.map((node) => node.getAttribute("data-kind"));
        expect(kinds.filter((kind) => kind === "subject")).toHaveLength(1);
        expect(kinds.filter((kind) => kind === "account")).toHaveLength(3);
        expect(kinds.filter((kind) => kind === "attribute")).toHaveLength(3);
        expect(kinds.filter((kind) => kind === "clean")).toHaveLength(2);

        const captions = within(canvas).getAllByTestId("fraud-graph-caption").map((node) => node.textContent);
        expect(captions).toEqual(expect.arrayContaining(["PAN ••••234F", "shared with 2", "HDFC ••4821", "Device 4f2a", "shared with 3", "Prime Ads", "Zepto · no link"]));
        // What ties two accounts is the node between them — no line carries a signal's name.
        expect(captions.some((caption) => caption?.includes("PAN number") || caption?.includes("Device fingerprint"))).toBe(false);
        // Bipartite: the subject to all three attributes, then 3 + 2 + 2 from the accounts.
        expect(within(canvas).getAllByTestId("fraud-graph-edge")).toHaveLength(3 + 3 + 2 + 2);
        // Keyboard: every node is reachable, and says what it is.
        expect(screen.getByRole("button", { name: /PAN ••••234F, PAN number, shared with 2/ })).toHaveAttribute("tabindex", "0");
        expect(screen.getByRole("link", { name: /Prime Ads, advertiser, flagged, shares PAN number, Device fingerprint, Payout account/ })).toHaveAttribute(
            "href",
            "/advertisers/adv_2"
        );

        // The Linked accounts table carries what the old cards did, and the KYC.
        const table = screen.getByTestId("fraud-linked-accounts");
        expect(within(table).getByText("Prime Ads")).toBeInTheDocument();
        expect(within(table).getByText("₹12,500.00")).toBeInTheDocument();
        expect(within(table).getByText("Prime Ads").closest("tr")).toHaveTextContent(/Advertiser.*PAN ••••234F.*Device 4f2a.*HDFC ••4821/);
        expect(within(table).getByText("Prime Ads").closest("tr")).toHaveTextContent("Verified");
        expect(within(table).getByText(/Compared by the last scoring and clean: Zepto, Blinkit/)).toBeInTheDocument();
    });

    it("opens a hover card on a node — type, KYC, wallet, open bookings — and lights its edges", async () => {
        renderDesk();
        await screen.findByTestId("fraud-graph-canvas");
        const prime = screen.getByRole("link", { name: /^Prime Ads, advertiser/ });
        fireEvent.mouseEnter(prime);
        const card = screen.getByTestId("fraud-graph-card");
        expect(within(card).getByText("Prime Ads")).toBeInTheDocument();
        expect(within(card).getByText("Flagged")).toBeInTheDocument();
        expect(within(card).getByText("Verified")).toBeInTheDocument();
        expect(within(card).getByText("₹12,500.00")).toBeInTheDocument();
        expect(within(card).getByText("3")).toBeInTheDocument();
        const lit = screen.getAllByTestId("fraud-graph-edge").filter((edge) => edge.getAttribute("stroke-width") === "1.5");
        expect(lit).toHaveLength(3);
        fireEvent.mouseLeave(prime);
        expect(screen.queryByTestId("fraud-graph-card")).not.toBeInTheDocument();

        // Focus opens it too.
        fireEvent.focus(screen.getByRole("button", { name: /Device 4f2a/ }));
        expect(within(screen.getByTestId("fraud-graph-card")).getByText(/Held by FakeAds Ltd and 3 linked accounts: Prime Ads, Nova Reach, Skyline Co/)).toBeInTheDocument();
    });

    it("narrows the Linked accounts table to the accounts sharing an attribute when the attribute is clicked", async () => {
        renderDesk();
        await screen.findByTestId("fraud-graph-canvas");
        fireEvent.click(screen.getByRole("button", { name: /HDFC ••4821/ }));
        const table = screen.getByTestId("fraud-linked-accounts");
        expect(within(table).getByText("Nova Reach")).toBeInTheDocument();
        expect(within(table).queryByText("Skyline Co")).not.toBeInTheDocument();
        fireEvent.click(within(table).getByRole("button", { name: /Sharing HDFC ••4821/ }));
        expect(within(table).getByText("Skyline Co")).toBeInTheDocument();
    });

    it("lists the attribute groups instead of drawing when the card is narrower than 520 px", async () => {
        globalThis.ResizeObserver = class {
            private readonly callback: ResizeObserverCallback;
            constructor(callback: ResizeObserverCallback) {
                this.callback = callback;
            }
            observe() {
                this.callback([{ contentRect: { width: 480 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
            }
            unobserve() {}
            disconnect() {}
        };
        renderDesk();
        const list = await screen.findByTestId("fraud-graph-list");
        expect(screen.queryByTestId("fraud-graph-canvas")).not.toBeInTheDocument();
        const items = within(list).getAllByRole("listitem");
        expect(items[0]).toHaveTextContent("PAN ••••234F");
        expect(items[0]).toHaveTextContent("PAN number · shared with 2");
        expect(items[0]).toHaveTextContent("FakeAds Ltd (subject), Prime Ads, Skyline Co");
        expect(within(list).getByText(/Compared and clean: Zepto, Blinkit/)).toBeInTheDocument();
    });
});
