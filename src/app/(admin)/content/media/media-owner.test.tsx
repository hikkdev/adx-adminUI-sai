import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Content › Media library is ADX's own pictures (28 Sep 2026). The owner,
 * looking at a library full of "Ad artwork" cards: "if this is about ads,
 * shouldn't it be present inside ads and promotions?" Pinned: the library
 * and the layout editor's picker ask `owner=adx`; one line under the
 * heading says where the advertisers' artwork went, and links there.
 */

const { service } = vi.hoisted(() => ({
    service: { specs: vi.fn(), list: vi.fn(), upload: vi.fn(), update: vi.fn(), archive: vi.fn(), restore: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ can: () => true, user: null }) }));
vi.mock("@/services/media", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/media")>();
    return { ...actual, mediaReadApi: () => true, mediaService: service };
});

import { MediaLoader } from "./media-loader";
import { MediaPicker } from "./media-picker";

beforeEach(() => {
    vi.clearAllMocks();
    service.specs.mockResolvedValue([]);
    service.list.mockResolvedValue([]);
});

describe("the media library", () => {
    it("asks for ADX's own pictures only", async () => {
        render(<MediaLoader />);
        await waitFor(() => expect(service.list).toHaveBeenCalled());
        expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ owner: "adx", archived: false }));
    });

    it("says under the heading where the advertisers' ad artwork lives, with a link", async () => {
        render(<MediaLoader />);
        const note = await screen.findByTestId("media-ad-artwork-note");
        expect(note).toHaveTextContent("Ad artwork uploaded by advertisers lives with their ads — Ads & sponsored › Display ads.");
        expect(screen.getByRole("link", { name: "Ads & sponsored › Display ads" })).toHaveAttribute("href", "/ads/display");
    });
});

describe("the layout editor's picker", () => {
    it("offers ADX's own pictures only", async () => {
        render(<MediaPicker open onOpenChange={vi.fn()} spec="PROMO_WIDE" specs={[]} onPick={vi.fn()} />);
        await waitFor(() => expect(service.list).toHaveBeenCalled());
        expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ owner: "adx", spec: "PROMO_WIDE", archived: false }));
    });
});
