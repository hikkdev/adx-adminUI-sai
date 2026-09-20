import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

/**
 * QR-8 — the drafts desk, the call list for sales and onboarding.
 *
 * Pinned: the service reads `GET /listings/drafts/desk` with the idle chip
 * and the search as query params; the view draws the reference, the spot,
 * the publisher's name and number (as a tel: link, with the tick when
 * verified), where they stopped, and how long the draft has sat — a week
 * or more in amber; the chips and the search call back; an empty page says
 * why in the chip's terms.
 */

const { backend } = vi.hoisted(() => ({
    backend: {
        calls: [] as string[],
        page: { items: [] as unknown[], total: 0, page: 1, pageSize: 50 },
    },
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        api: {
            get: async (path: string) => {
                backend.calls.push(path);
                return backend.page;
            },
            post: async () => undefined,
            patch: async () => undefined,
            put: async () => undefined,
            delete: async () => undefined,
        },
    };
});

import { listingsService, type ListingDraftRow } from "@/services/listings";
import { DraftsView } from "./drafts-view";

const row = (over: Partial<ListingDraftRow> = {}): ListingDraftRow => ({
    id: "drf_1",
    displayId: "LST-1709-2601",
    category: "indoor",
    title: "Gym mirror decal",
    stepIndex: 3,
    stepKey: "spot-details",
    createdAt: "2026-09-10T00:00:00.000Z",
    updatedAt: "2026-09-12T00:00:00.000Z",
    idleDays: 5,
    publisher: { id: "pub_1", displayId: "PUB-1009-2601", name: "Asha Rao", mobile: "+919876543210", city: "Bengaluru", kycStatus: "PENDING" },
    ...over,
});

describe("the service", () => {
    it("reads the desk with the idle days, the search and the sort", async () => {
        backend.calls.length = 0;
        await listingsService.drafts({ idleDays: 7, q: "asha", sort: "IDLE", pageSize: 100 });
        expect(backend.calls[0]).toBe("/listings/drafts/desk?idleDays=7&q=asha&sort=IDLE&page=1&pageSize=100");
    });
});

describe("the desk", () => {
    it("draws the reference, the spot, who to call, where they stopped and how long it has sat", () => {
        const page = {
            items: [
                row(),
                row({ id: "drf_2", displayId: "LST-1709-2602", title: null, category: null, stepIndex: 0, stepKey: "select-category", idleDays: 9, publisher: { id: "pub_2", displayId: "PUB-1109-2601", name: "Ravi", mobile: "+919999999999", city: null, kycStatus: "VERIFIED" } }),
            ],
            total: 2,
            page: 1,
            pageSize: 50,
        };
        render(<DraftsView page={page} idle={0} onIdleChange={() => undefined} q="" onQueryChange={() => undefined} />);
        expect(screen.getByText("LST-1709-2601")).toBeTruthy();
        expect(screen.getByText("Gym mirror decal")).toBeTruthy();
        expect(screen.getByText("Spot details")).toBeTruthy();
        expect(screen.getByText("5 days")).toBeTruthy();
        expect(screen.getByRole("link", { name: /Asha Rao/ }).getAttribute("href")).toBe("/publishers/pub_1");
        expect(screen.getByRole("link", { name: "+919876543210" }).getAttribute("href")).toBe("tel:+919876543210");

        expect(screen.getByText("Untitled")).toBeTruthy();
        expect(screen.getByText("No category yet")).toBeTruthy();
        expect(screen.getByText("Category")).toBeTruthy();
        const nine = screen.getByText("9 days");
        expect(nine.className).toContain("text-amber-700");
        expect(screen.getByRole("img", { name: /verified/i })).toBeTruthy();
    });

    it("the chips and the search call back, and an empty page says why", () => {
        const onIdleChange = vi.fn();
        const onQueryChange = vi.fn();
        render(<DraftsView page={{ items: [], total: 0, page: 1, pageSize: 50 }} idle={7} onIdleChange={onIdleChange} q="" onQueryChange={onQueryChange} />);
        expect(screen.getByText("No drafts idle that long")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Idle a month+" }));
        expect(onIdleChange).toHaveBeenCalledWith(30);
        fireEvent.change(screen.getByLabelText("Search drafts"), { target: { value: "asha" } });
        expect(onQueryChange).toHaveBeenCalledWith("asha");
    });
});
