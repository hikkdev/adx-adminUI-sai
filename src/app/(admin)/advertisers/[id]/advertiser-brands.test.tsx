import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * The brand cards on the advertiser page, over the widened contract.
 *
 * `GET /advertisers/:id/brands` now answers with campaign counts, lifetime
 * spend and an archived flag, and takes `?status=ARCHIVED`. What this pins:
 * the counts and the spend printed from the wire (the spend from its
 * decimal string), the Archived badge, the chip sending `?status=` to the
 * API rather than cutting the list it holds, and a brand that arrived
 * without the card fields — the older row shape — drawing none of them.
 */

const backend = vi.hoisted(() => ({
    calls: [] as string[],
    reset() {
        this.calls = [];
    },
    async handle(path: string) {
        this.calls.push(path);
        const status = new URL(path, "http://x").searchParams.get("status");
        const rows = [
            {
                id: "brd_1",
                advertiserId: "adv_1",
                name: "Zomato",
                sector: "GENERAL",
                logoUrl: null,
                website: null,
                isActive: true,
                archived: false,
                awareness: "HIGH",
                industry: "QSR",
                subCategory: "Delivery",
                campaigns: { total: 5, live: 2, scheduled: 1 },
                lifetimeSpend: "1250000.50",
                createdAt: "2026-01-01T00:00:00.000Z",
            },
            {
                id: "brd_2",
                advertiserId: "adv_1",
                name: "Blinkit",
                sector: "GENERAL",
                logoUrl: null,
                website: null,
                isActive: false,
                archived: true,
                awareness: null,
                industry: null,
                subCategory: null,
                campaigns: { total: 0, live: 0, scheduled: 0 },
                lifetimeSpend: "0.00",
                createdAt: "2026-02-01T00:00:00.000Z",
            },
            // A row older than the card: nothing derived on it.
            { id: "brd_3", advertiserId: "adv_1", name: "Hyperpure", sector: "PHARMA", isActive: true },
        ];
        if (status === "ARCHIVED") return rows.filter((row) => !row.isActive);
        if (status === "ACTIVE") return rows.filter((row) => row.isActive);
        return rows;
    },
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return {
        ...actual,
        apiConfig: { ...actual.apiConfig, live: true },
        isLive: (domain: keyof typeof actual.liveDomains) => actual.liveDomains[domain],
    };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        api: { ...actual.api, get: (path: string) => backend.handle(path) },
    };
});

import { advertiserService } from "@/services/advertisers";
import { Brands, campaignsLine } from "./advertiser-money";

beforeEach(() => backend.reset());

describe("the brand cards", () => {
    it("opens on the active brands, printing counts and spend from the wire and nothing for a row that has none", async () => {
        render(<Brands advertiserId="adv_1" />);
        await screen.findByText("Zomato");
        expect(backend.calls).toEqual(["/advertisers/adv_1/brands?status=ACTIVE"]);

        const zomato = within(screen.getByText("Zomato").closest("li")!);
        expect(zomato.getByText("2 live · 1 scheduled · 5 in all")).toBeInTheDocument();
        expect(zomato.getByText("₹12,50,000.50")).toBeInTheDocument();
        expect(zomato.getByText("General · QSR · Delivery")).toBeInTheDocument();
        expect(zomato.queryByText("Archived")).not.toBeInTheDocument();

        // The older row: no counts, no spend, and the restricted sector still flagged.
        const hyperpure = within(screen.getByText("Hyperpure").closest("li")!);
        expect(hyperpure.queryByText(/in all/)).not.toBeInTheDocument();
        expect(hyperpure.queryByText(/lifetime spend/)).not.toBeInTheDocument();
        expect(hyperpure.getByText("Restricted")).toBeInTheDocument();
    });

    it("sends the Archived chip to the API as ?status=ARCHIVED and badges what comes back", async () => {
        render(<Brands advertiserId="adv_1" />);
        await screen.findByText("Zomato");
        fireEvent.click(screen.getByRole("tab", { name: "Archived" }));
        await screen.findByText("Blinkit");
        expect(backend.calls.at(-1)).toBe("/advertisers/adv_1/brands?status=ARCHIVED");
        const blinkit = within(screen.getByText("Blinkit").closest("li")!);
        expect(blinkit.getByText("Archived")).toBeInTheDocument();
        expect(blinkit.getByText("No campaigns yet")).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByText("Zomato")).not.toBeInTheDocument());
    });

    it("asks for every brand under All", async () => {
        render(<Brands advertiserId="adv_1" />);
        await screen.findByText("Zomato");
        fireEvent.click(screen.getByRole("tab", { name: "All" }));
        await screen.findByText("Blinkit");
        expect(backend.calls.at(-1)).toBe("/advertisers/adv_1/brands");
    });
});

describe("the service", () => {
    it("puts the status on the query string only when one is asked for", async () => {
        await advertiserService.brands("adv_1");
        await advertiserService.brands("adv_1", "ARCHIVED");
        expect(backend.calls).toEqual(["/advertisers/adv_1/brands", "/advertisers/adv_1/brands?status=ARCHIVED"]);
    });
});

describe("campaignsLine", () => {
    it("says what is where, and nothing when the wire sent no counts", () => {
        expect(campaignsLine({ total: 5, live: 2, scheduled: 1 })).toBe("2 live · 1 scheduled · 5 in all");
        expect(campaignsLine({ total: 3, live: 0, scheduled: 0 })).toBe("3 in all");
        expect(campaignsLine({ total: 0, live: 0, scheduled: 0 })).toBe("No campaigns yet");
        expect(campaignsLine(undefined)).toBeNull();
    });
});
