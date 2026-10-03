import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * VA-1 — the AI review on the Creative Review workbench.
 *
 * What is pinned: the card asks the model through the creative's own route
 * and shows the four readings; a reading moves nothing until the reviewer
 * applies it, and then only brand-safe and legibility follow it, with the
 * model's reason as the row's note; a video is not offered to the model.
 */

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const { service } = vi.hoisted(() => ({ service: { analyse: vi.fn(), review: vi.fn(async () => ({})) } }));

vi.mock("next/navigation", () => ({
    useRouter: () => router,
    usePathname: () => "/creatives/crt_1",
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/* The artwork bytes are PrivateFile's own suite's business; here they would only leave a request hanging. */
vi.mock("@/components/adx/private-file", () => ({
    PrivateFile: ({ alt }: { alt: string }) => <span data-testid="artwork">{alt}</span>,
    openPrivateFile: vi.fn(),
    usePrivateObjectUrl: () => ({ url: null, kind: "image", loading: false, error: null }),
}));

vi.mock("@/services/moderation", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/moderation")>();
    return { ...actual, moderationService: { ...actual.moderationService, ...service } };
});

import { CreativeDetail } from "./creative-detail";
import type { CreativeAnalysis, CreativeReviewRow } from "@/services/moderation";

const creative = (over: Partial<CreativeReviewRow> = {}): CreativeReviewRow => ({
    id: "crt_1",
    campaignId: "cmp_1",
    spotId: "spot_1",
    path: "STATIC_IMAGES",
    status: "IN_REVIEW",
    fileUrl: "/files/f_1",
    fileName: "hoarding.png",
    fileSize: 860_160,
    mimeType: "image/png",
    widthPx: 1920,
    heightPx: 960,
    durationMs: null,
    reviewNote: null,
    reviewedById: null,
    reviewedAt: null,
    submittedAt: "2026-09-12T08:00:00.000Z",
    flags: [],
    checks: [{ code: "DIMENSIONS_MATCH", result: "PASS", note: "40×20 ft against 1920×960 px" }],
    resubmissionOfId: null,
    designedByAdx: false,
    advertiserAcceptedAt: null,
    advertiserAcceptedById: null,
    trackingCodeId: null,
    createdAt: "2026-09-12T08:00:00.000Z",
    updatedAt: "2026-09-12T08:00:00.000Z",
    campaign: {
        id: "cmp_1",
        reference: "ADX-CMP-2026-000001",
        name: "Diwali Season Push",
        status: "SCHEDULED",
        advertiserId: "adv_1",
        agentId: null,
        createdByUserId: "usr_1",
        trackingMethod: "QR_OR_DEEPLINK",
        contentCategoryId: "cat_1",
        advertiser: { id: "adv_1", name: "Anita", companyName: "Anita's Coffee" },
    },
    spot: {
        id: "spot_1",
        listingId: "lst_1",
        listing: { id: "lst_1", title: "MG Road Billboard", city: "Bengaluru", widthFt: "40.00", heightFt: "20.00" },
    },
    analysis: null,
    ...over,
});

const analysis = (over: Partial<CreativeAnalysis> = {}): CreativeAnalysis => ({
    id: "can_1",
    creativeId: "crt_1",
    provider: "google",
    model: "gemini-2.5-pro",
    appropriate: { verdict: "PASS", reason: null },
    relevant: { verdict: "UNSURE", reason: "No coffee in the picture" },
    legal: { verdict: "FAIL", reason: "A health claim with no disclaimer" },
    rating: "REGULAR",
    ratingReason: "Nothing a child could not see",
    flags: ["HEALTH_CLAIM", "LOW_LEGIBILITY"],
    summary: "A coffee cup on a red ground with a claim about sleep.",
    confidence: 0.86,
    unique: false,
    nearest: { creativeId: "crt_7", distance: 4 },
    createdAt: "2026-09-23T10:00:00.000Z",
    ...over,
});

describe("the AI review card", () => {
    it("asks the model through the creative's route and shows the readings", async () => {
        service.analyse.mockResolvedValueOnce(analysis());
        render(<CreativeDetail creative={creative()} queue={[]} onChanged={vi.fn()} />);
        expect(screen.queryByTestId("ai-review-result")).toBeNull();
        fireEvent.click(screen.getByTestId("ai-review-run"));
        await waitFor(() => expect(screen.getByTestId("ai-review-result")).toBeTruthy());
        expect(service.analyse).toHaveBeenCalledWith("crt_1");
        expect(screen.getByText("A coffee cup on a red ground with a claim about sleep.")).toBeTruthy();
        const card = within(screen.getByTestId("ai-review-result"));
        expect(card.getByText("Fail")).toBeTruthy();
        expect(card.getByText("Unsure")).toBeTruthy();
        expect(card.getByText("Regular")).toBeTruthy();
        expect(card.getByText("Near-duplicate")).toBeTruthy();
        expect(screen.getByTestId("ai-review-nearest").getAttribute("href")).toBe("/creatives/crt_7");
        expect(screen.getByTestId("ai-review-flags").textContent).toContain("Health claim");
        expect(screen.getByTestId("ai-review-flags").textContent).toContain("Hard to read");
        expect(screen.getByTestId("ai-review-run").textContent).toContain("Analyse again");
    });

    it("moves nothing on the checklist until the reviewer applies it, then only the two rows the model can speak to", () => {
        render(<CreativeDetail creative={creative({ analysis: analysis() })} queue={[]} onChanged={vi.fn()} />);
        // The reason is in the card only, not yet on the checklist row.
        expect(screen.getAllByText("A health claim with no disclaimer")).toHaveLength(1);
        expect(screen.getByText("Text height against the placement")).toBeTruthy();
        fireEvent.click(screen.getByTestId("ai-review-apply"));
        expect(screen.getAllByText("A health claim with no disclaimer")).toHaveLength(2);
        expect(screen.getByText("AI review: the text is hard to read")).toBeTruthy();
        // The QR row is still the reviewer's to judge.
        expect(screen.getByText("The tracking code is visible in the artwork")).toBeTruthy();
    });

    it("does not offer a video to the model", () => {
        render(<CreativeDetail creative={creative({ path: "VIDEO_OR_MOTION", mimeType: "video/mp4", fileName: "spot.mp4" })} queue={[]} onChanged={vi.fn()} />);
        expect((screen.getByTestId("ai-review-run") as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByText("The model reads still images only; a video is reviewed by eye.")).toBeTruthy();
    });
});
