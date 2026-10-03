import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * The Landing pages tab (2 Oct 2026) — the owner: "Landing pages section,
 * we don't even know how they work".
 *
 * Pinned: the one-line explainer under the title; the read
 * (`GET /campaigns/landing-pages?status=&q=&page=&pageSize=`); the shared
 * table — Page (the hero's title and /p/slug, live in a new tab) ·
 * Campaign · Advertiser · Status · AI-drafted · Published on · Views · CTA
 * clicks · Enquiries — with the Status select's counts; the preview drawer
 * (the live page without scripts, a draft's blocks); the row menu; and
 * "Unpublish selected…" with one reason, the drafts skipped, a failure
 * kept ticked.
 */

const { backend, toast, router } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string; body?: unknown }[],
        refuse: new Set<string>(),
        page: null as unknown,
        reset() {
            this.calls = [];
            this.refuse = new Set();
        },
    },
    toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
    router: { push: vi.fn(), replace: vi.fn() },
}));

vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: router.push, replace: router.replace, refresh: vi.fn() }),
    usePathname: () => "/campaigns/landing-pages",
    useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/lib/auth", () => ({
    useAuth: () => ({ user: { id: "usr_admin" }, can: () => true }),
    useOptionalAuth: () => ({ user: { id: "usr_admin" }, can: () => true }),
}));
vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true, baseUrl: "https://api.adx.in/api/v1" }, isLive: () => true };
});
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const handle = (method: string) => async (path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        if (backend.refuse.has(`${method} ${path}`)) throw new actual.ApiError(409, "CONFLICT", "Already a draft");
        if (method === "GET") return backend.page;
        return {};
    };
    return { ...actual, api: { get: handle("GET"), post: handle("POST"), patch: handle("PATCH"), put: handle("PUT"), delete: handle("DELETE") } };
});

import { formatDate } from "@/lib/format";
import type { LandingPageRow, LandingPagesPage } from "@/services/landing-pages";
import { LandingPagesLoader } from "./landing-pages-loader";
import { LANDING_EXPLAINER, LandingPagesView } from "./landing-pages-view";

const ASHA = { userId: "usr_asha", name: "Asha Rao", displayId: "ADX-0210-2601", business: { id: "adv_rao", name: "Rao Sweets", displayId: "ADV-0210-2601" } };

const row = (over: Partial<LandingPageRow>): LandingPageRow => ({
    id: "lp_1",
    campaignId: "cmp_1",
    slug: "diwali-rao",
    blocks: [{ type: "hero", headline: "Diwali sweets, 20% off" }],
    theme: null,
    version: 2,
    status: "PUBLISHED",
    generatedByAi: true,
    publishedAt: "2026-09-30T10:00:00.000Z",
    createdByUserId: "usr_asha",
    createdAt: "2026-09-28T10:00:00.000Z",
    updatedAt: "2026-09-30T10:00:00.000Z",
    campaign: { id: "cmp_1", reference: "ADX-CMP-2026-482913", name: "Diwali Season Push", status: "LIVE", advertiserId: "adv_rao", advertiser: { id: "adv_rao", name: "Asha Rao", companyName: "Rao Sweets" } },
    advertiser: ASHA,
    heroTitle: "Diwali sweets, 20% off",
    views: 640,
    ctaClicks: 90,
    enquiries: 14,
    ...over,
});

const ROWS = [
    row({}),
    row({
        id: "lp_2",
        campaignId: "cmp_2",
        slug: "monsoon-coffee",
        status: "DRAFT",
        generatedByAi: false,
        publishedAt: null,
        heroTitle: undefined,
        blocks: [{ type: "hero", headline: "Rain, coffee, you" }],
        advertiser: undefined,
        views: undefined,
        ctaClicks: undefined,
        enquiries: undefined,
        campaign: { id: "cmp_2", reference: "ADX-CMP-2026-200200", name: "Monsoon Coffee Launch", status: "DRAFT", advertiserId: "adv_tw", advertiser: { id: "adv_tw", name: "Ravi", companyName: "Third Wave" } },
    }),
    row({ id: "lp_3", campaignId: "cmp_3", slug: "hampi-utsav", heroTitle: "Hampi Utsav", campaign: { id: "cmp_3", reference: "ADX-CMP-2026-300300", name: "Hampi Utsav campaign", status: "LIVE", advertiserId: "adv_k", advertiser: { id: "adv_k", name: "K", companyName: null } } }),
];

const PAGE: LandingPagesPage = { items: ROWS, total: 3, page: 1, pageSize: 25, counts: { PUBLISHED: 2, DRAFT: 1 } };

function renderView(props: Partial<React.ComponentProps<typeof LandingPagesView>> = {}) {
    const handlers = { onStatusChange: vi.fn(), onSearchText: vi.fn(), onPage: vi.fn(), onChanged: vi.fn() };
    render(<LandingPagesView page={PAGE} status="ALL" searchText="" pageNumber={1} pageSize={25} refreshing={false} {...handlers} {...props} />);
    return handlers;
}

const rowOf = (text: string) => screen.getByText(text).closest("tr")!;
const tick = (text: string) => fireEvent.click(within(rowOf(text)).getByRole("checkbox", { name: "Select row" }));
const openMenu = async (text: string) => {
    fireEvent.keyDown(within(rowOf(text)).getByRole("button", { name: "Row actions" }), { key: "ArrowDown" });
    return screen.findByTestId("roster-row-menu");
};

beforeEach(() => {
    backend.reset();
    vi.clearAllMocks();
});

describe("the read", () => {
    it("asks for the published pages first, and searches on the server", async () => {
        backend.page = PAGE;
        render(<LandingPagesLoader />);
        await waitFor(() => expect(screen.getByText("Diwali sweets, 20% off")).toBeTruthy());
        expect(backend.calls[0]!.path).toBe("/campaigns/landing-pages?status=PUBLISHED&pageSize=25");
    });
});

describe("the tab", () => {
    it("says how landing pages work, under the title", () => {
        renderView();
        expect(screen.getByRole("heading", { level: 1, name: "Landing pages" })).toBeTruthy();
        expect(screen.getByText(LANDING_EXPLAINER)).toBeTruthy();
        expect(LANDING_EXPLAINER).toMatch(/^Each campaign can have one landing page at adx\.in\/p\/…\. People reach it by scanning the campaign's QR code/);
    });

    it("draws each page's title, address, campaign, advertiser, status, marker, date and numbers", () => {
        renderView();
        const live = within(rowOf("Diwali sweets, 20% off"));
        expect(live.getByRole("link", { name: "/p/diwali-rao" })).toHaveAttribute("href", "https://api.adx.in/p/diwali-rao");
        expect(live.getByRole("link", { name: "/p/diwali-rao" })).toHaveAttribute("target", "_blank");
        expect(live.getByRole("link", { name: "Diwali Season Push" })).toHaveAttribute("href", "/campaigns/cmp_1");
        expect(live.getByTestId("landing-advertiser")).toHaveTextContent("Rao SweetsADV-0210-2601 · Asha Rao");
        expect(live.getByText("Published")).toBeTruthy();
        expect(live.getByText("Yes")).toBeTruthy();
        expect(live.getByText(formatDate("2026-09-30T10:00:00.000Z"))).toBeTruthy();
        expect(live.getByText("640")).toBeTruthy();
        expect(live.getByText("90")).toBeTruthy();
        expect(live.getByText("14")).toBeTruthy();

        /* A draft: the hero's headline as the title, the address not a link, the advertiser from the campaign join, dashes for the counts. */
        const draft = within(rowOf("Rain, coffee, you"));
        expect(draft.queryByRole("link", { name: "/p/monsoon-coffee" })).toBeNull();
        expect(draft.getByTestId("landing-advertiser")).toHaveAttribute("href", "/advertisers/adv_tw");
        expect(draft.getByTestId("landing-advertiser")).toHaveTextContent("Third Wave");
        expect(draft.getAllByText("—").length).toBeGreaterThanOrEqual(3);
    });

    it("counts each status in the select and reports the choice", async () => {
        const { onStatusChange } = renderView();
        expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent("Everyone · 3");
        fireEvent.keyDown(screen.getByRole("combobox", { name: "Status" }), { key: "ArrowDown" });
        fireEvent.keyDown(await screen.findByRole("option", { name: /^Draft/ }), { key: "Enter" });
        expect(onStatusChange).toHaveBeenCalledWith("DRAFT");
    });

    it("previews a live page in a drawer without scripts, and a draft by its blocks", async () => {
        renderView();
        fireEvent.click(screen.getByText("Diwali sweets, 20% off"));
        const drawer = await screen.findByRole("dialog");
        expect(within(drawer).getByTestId("landing-iframe")).toHaveAttribute("src", "https://api.adx.in/p/diwali-rao");
        expect(within(drawer).getByTestId("landing-iframe")).toHaveAttribute("sandbox", "");
        fireEvent.keyDown(drawer, { key: "Escape" });
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

        fireEvent.click(screen.getByText("Rain, coffee, you"));
        const draftDrawer = await screen.findByRole("dialog");
        expect(within(draftDrawer).queryByTestId("landing-iframe")).toBeNull();
        expect(within(draftDrawer).getByTestId("landing-blocks")).toHaveTextContent("Rain, coffee, you");
    });

    it("offers Preview, Open page, Open campaign and Unpublish… on a live page; no page or unpublish on a draft", async () => {
        renderView();
        expect(within(await openMenu("Diwali sweets, 20% off")).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Preview", "Open page", "Open campaign", "Unpublish…"]);
        fireEvent.keyDown(screen.getByTestId("roster-row-menu"), { key: "Escape" });
        await waitFor(() => expect(screen.queryByTestId("roster-row-menu")).toBeNull());
        expect(within(await openMenu("Rain, coffee, you")).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Preview", "Open campaign"]);
    });
});

describe("Unpublish selected…", () => {
    it("sends one reason for all, skips the drafts, and keeps a failure ticked", async () => {
        backend.refuse.add("POST /campaigns/cmp_3/landing-page/unpublish");
        const { onChanged } = renderView();
        tick("Diwali sweets, 20% off");
        tick("Rain, coffee, you");
        tick("Hampi Utsav");
        fireEvent.click(screen.getByTestId("bulk-unpublish"));
        const dialog = await screen.findByRole("alertdialog");
        expect(within(dialog).getByText(/^2 will be unpublished, 1 skipped \(not published\)\./)).toBeTruthy();
        const confirm = within(dialog).getByRole("button", { name: "Unpublish 2 pages" });
        expect(confirm).toBeDisabled();
        fireEvent.change(within(dialog).getByLabelText("Reason — what the advertiser reads"), { target: { value: "Misleading offers." } });
        fireEvent.click(confirm);
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.calls.map((call) => [call.path, call.body])).toEqual([
            ["/campaigns/cmp_1/landing-page/unpublish", { reason: "Misleading offers." }],
            ["/campaigns/cmp_3/landing-page/unpublish", { reason: "Misleading offers." }],
        ]);
        expect(toast.warning).toHaveBeenCalled();
        expect(within(rowOf("Hampi Utsav")).getByRole("checkbox", { name: "Select row" })).toHaveAttribute("data-state", "checked");
        expect(within(rowOf("Diwali sweets, 20% off")).getByRole("checkbox", { name: "Select row" })).toHaveAttribute("data-state", "unchecked");
    });
});
