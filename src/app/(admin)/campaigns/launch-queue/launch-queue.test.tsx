import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * The launch queue (2 Oct 2026).
 *
 * Pinned: the read (`GET /campaigns/launch-queue?reason=&q=&page=&pageSize=`,
 * the reason off the URL); the shared table with the "Waiting on" select
 * in the Status style carrying the counts per reason; each row's pills,
 * how long it has waited, and its one-click fix — Request KYC, Review
 * artwork (the creative's page), Send design quote (the quote dialog),
 * Remind advertiser (`POST …/remind-payment`) — the fix following the
 * reason the queue is cut to.
 */

const { backend, toast, router } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string; body?: unknown }[],
        page: null as unknown,
        reset() {
            this.calls = [];
        },
    },
    toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
    router: { push: vi.fn(), replace: vi.fn(), search: "" },
}));

vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: router.push, replace: router.replace, refresh: vi.fn() }),
    usePathname: () => "/campaigns/launch-queue",
    useSearchParams: () => new URLSearchParams(router.search),
}));
vi.mock("@/lib/auth", () => ({
    useAuth: () => ({ user: { id: "usr_admin" }, can: () => true }),
    useOptionalAuth: () => ({ user: { id: "usr_admin" }, can: () => true }),
}));
vi.mock("@/lib/use-feature", () => ({ useFeature: () => ({ enabled: false }) }));
vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const handle = (method: string) => async (path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        if (method === "GET") return backend.page;
        return {};
    };
    return { ...actual, api: { get: handle("GET"), post: handle("POST"), patch: handle("PATCH"), put: handle("PUT"), delete: handle("DELETE") } };
});

import type { LaunchQueuePage, LaunchQueueRow } from "@/services/campaigns";
import { LaunchQueueLoader, LaunchQueueView, primaryReason, waitedDays, waitedLabel } from "./launch-queue-loader";

const ASHA = { userId: "usr_asha", name: "Asha Rao", displayId: "ADX-0210-2601", business: { id: "adv_rao", name: "Rao Sweets", displayId: "ADV-0210-2601" } };

const row = (over: Partial<LaunchQueueRow>): LaunchQueueRow => ({
    id: "cmp_1",
    reference: "ADX-CMP-2026-482913",
    name: "Diwali Season Push",
    status: "SCHEDULED",
    advertiser: ASHA,
    paidAt: "2026-09-28T10:00:00.000Z",
    paidAmount: "18400.00",
    waitingDays: 4,
    waitingOn: ["KYC"],
    waitingFacts: { KYC: { advertiserId: "adv_rao", kycStatus: "REQUESTED", accountState: "ACTIVE" } },
    ...over,
});

const ROWS = [
    row({}),
    row({ id: "cmp_2", reference: "ADX-CMP-2026-200200", name: "Monsoon Coffee Launch", waitingOn: ["ARTWORK"], waitingDays: 2, waitingFacts: { ARTWORK: { creatives: [{ id: "cr_8", status: "CHANGES_REQUESTED" }, { id: "cr_9", status: "IN_REVIEW" }] } } }),
    row({ id: "cmp_3", reference: "ADX-CMP-2026-300300", name: "Hampi Utsav", waitingOn: ["DESIGN_QUOTE", "KYC"], waitingDays: 0, waitingFacts: { DESIGN_QUOTE: { state: "NOT_QUOTED", amount: null, quotedAt: null } } }),
    row({ id: "cmp_4", reference: "ADX-CMP-2026-400400", name: "Airport bus takeover", waitingOn: ["RESERVATION_FEE"], waitingDays: 1 }),
];

const PAGE: LaunchQueuePage = { items: ROWS, total: 4, page: 1, pageSize: 25, counts: { ALL: 4, KYC: 2, ARTWORK: 1, DESIGN_QUOTE: 1, RESERVATION_FEE: 1 } };

function renderView(props: Partial<React.ComponentProps<typeof LaunchQueueView>> = {}) {
    const handlers = { onReason: vi.fn(), onChanged: vi.fn(), onPage: vi.fn(), onSearchText: vi.fn() };
    render(<LaunchQueueView page={PAGE} reason={null} searchText="" pageNumber={1} refreshing={false} {...handlers} {...props} />);
    return handlers;
}

const rowOf = (name: string) => within(screen.getByText(name).closest("tr")!);

beforeEach(() => {
    backend.reset();
    router.search = "";
    vi.clearAllMocks();
});

describe("the read", () => {
    it("asks the queue for the reason and the search the URL names", async () => {
        backend.page = PAGE;
        router.search = "reason=kyc&q=rao&page=2";
        render(<LaunchQueueLoader />);
        await waitFor(() => expect(screen.getByText("Diwali Season Push")).toBeTruthy());
        expect(backend.calls[0]).toEqual({ method: "GET", path: "/campaigns/launch-queue?reason=KYC&q=rao&page=2&pageSize=25", body: undefined });
    });
});

describe("the queue", () => {
    it("draws the Waiting on select with its counts, the pills and how long each has waited", () => {
        renderView();
        expect(screen.getByRole("combobox", { name: "Waiting on" })).toHaveTextContent("Every reason · 4");
        expect(rowOf("Hampi Utsav").getByText("Design quote")).toBeTruthy();
        expect(rowOf("Hampi Utsav").getByText("Advertiser KYC")).toBeTruthy();
        expect(rowOf("Diwali Season Push").getByTestId("waited")).toHaveTextContent("4 days");
        expect(rowOf("Airport bus takeover").getByTestId("waited")).toHaveTextContent("1 day");
        expect(rowOf("Hampi Utsav").getByTestId("waited")).toHaveTextContent("Since today");
        expect(rowOf("Diwali Season Push").getByTestId("queue-advertiser")).toHaveAttribute("href", "/advertisers/adv_rao");
    });

    it("puts each row's fix one click away", async () => {
        const { onChanged } = renderView();
        expect(rowOf("Diwali Season Push").getByRole("button", { name: "Request KYC" })).toBeEnabled();
        expect(rowOf("Monsoon Coffee Launch").getByRole("link", { name: "Review artwork" })).toHaveAttribute("href", "/creatives/cr_9");
        fireEvent.click(rowOf("Hampi Utsav").getByRole("button", { name: "Send design quote" }));
        expect(await screen.findByRole("dialog")).toHaveTextContent("Quote the design");
        fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
        fireEvent.click(rowOf("Airport bus takeover").getByRole("button", { name: "Remind advertiser" }));
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.calls).toEqual([{ method: "POST", path: "/campaigns/cmp_4/remind-payment", body: {} }]);
    });

    it("follows the reason the queue is cut to", () => {
        renderView({ reason: "KYC" });
        expect(rowOf("Hampi Utsav").getByRole("button", { name: "Request KYC" })).toBeTruthy();
        expect(rowOf("Hampi Utsav").queryByRole("button", { name: "Send design quote" })).toBeNull();
        expect(primaryReason({ waitingOn: ["DESIGN_QUOTE", "KYC"] }, null)).toBe("DESIGN_QUOTE");
        expect(primaryReason({ waitingOn: ["DESIGN_QUOTE", "KYC"] }, "KYC")).toBe("KYC");
        expect(primaryReason({ waitingOn: [] }, null)).toBeNull();
    });

    it("cuts the queue to a reason from the select", async () => {
        const { onReason } = renderView();
        fireEvent.keyDown(screen.getByRole("combobox", { name: "Waiting on" }), { key: "ArrowDown" });
        fireEvent.keyDown(await screen.findByRole("option", { name: /^Artwork approval/ }), { key: "Enter" });
        expect(onReason).toHaveBeenCalledWith("ARTWORK");
    });

    it("counts the wait from the payment when the server sends no figure", () => {
        expect(waitedDays({ waitingDays: 3, waitingSince: null, paidAt: null })).toBe(3);
        expect(waitedDays({ waitingDays: null, waitingSince: null, paidAt: null })).toBeNull();
        expect(waitedLabel(null)).toBe("—");
        expect(waitedLabel(12)).toBe("12 days");
    });
});
