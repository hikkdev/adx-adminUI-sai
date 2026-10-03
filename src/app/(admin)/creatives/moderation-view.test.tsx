import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * VA-4 — the AI reading on the Content Review queue.
 *
 * What is pinned: a card with a reading wears the worst verdict, the rating
 * and a near-duplicate badge, and a card without one wears nothing; the two
 * new chips send the analysed facet; "Analyse pending" runs the batch with
 * no ids and re-reads the queue; the sticky bar's Analyse sends the
 * selection.
 */

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const { service, toast } = vi.hoisted(() => ({
    service: { analysePending: vi.fn(), review: vi.fn(async () => ({})), reviewMany: vi.fn(async () => ({ reviewed: [], failed: [] })) },
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock("next/navigation", () => ({
    useRouter: () => router,
    usePathname: () => "/creatives",
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock("sonner", () => ({ toast }));

vi.mock("@/components/adx/private-file", () => ({
    PrivateFile: ({ alt }: { alt: string }) => <span data-testid="artwork">{alt}</span>,
    openPrivateFile: vi.fn(),
    usePrivateObjectUrl: () => ({ url: null, kind: "image", loading: false, error: null }),
}));

vi.mock("@/services/moderation", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/moderation")>();
    return { ...actual, moderationService: { ...actual.moderationService, ...service } };
});

import { ModerationView } from "./moderation-view";
import type { CreativeAnalysis, CreativeReviewRow, ReviewQueuePage } from "@/services/moderation";

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
    checks: [],
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
    spot: null,
    analysis: null,
    ...over,
});

const analysis = (over: Partial<CreativeAnalysis> = {}): CreativeAnalysis => ({
    id: "can_1",
    creativeId: "crt_2",
    provider: "google",
    model: "gemini-2.5-pro",
    appropriate: { verdict: "PASS", reason: null },
    relevant: { verdict: "PASS", reason: null },
    legal: { verdict: "FAIL", reason: "A health claim with no disclaimer" },
    rating: "REGULAR",
    ratingReason: null,
    flags: ["HEALTH_CLAIM"],
    summary: "A coffee cup with a claim about sleep.",
    confidence: 0.86,
    unique: false,
    nearest: { creativeId: "crt_7", distance: 4 },
    createdAt: "2026-09-23T10:00:00.000Z",
    ...over,
});

const page = (items: CreativeReviewRow[]): ReviewQueuePage => ({
    items,
    total: items.length,
    page: 1,
    pageSize: 50,
    counts: { IN_REVIEW: items.length, flagged: 0, static: items.length, video: 0, resubmitted: 0, analysed: 1, unanalysed: 1 },
});

const draw = (items: CreativeReviewRow[]) => {
    const onFacetChange = vi.fn();
    const onChanged = vi.fn();
    render(
        <ModerationView
            page={page(items)}
            status="IN_REVIEW"
            onStatusChange={vi.fn()}
            facet="all"
            onFacetChange={onFacetChange}
            q=""
            onSearch={vi.fn()}
            onChanged={onChanged}
        />,
    );
    return { onFacetChange, onChanged };
};

describe("the reading on the queue", () => {
    it("wears the worst verdict, the rating and the near-duplicate on a card that has one, and nothing on one that does not", () => {
        draw([creative(), creative({ id: "crt_2", campaign: { ...creative().campaign, name: "Monsoon Sale" }, analysis: analysis() })]);
        expect(screen.queryByTestId("queue-analysis-crt_1")).toBeNull();
        const card = within(screen.getByTestId("queue-analysis-crt_2"));
        expect(card.getByText("AI: fail")).toBeTruthy();
        expect(card.getByText("Regular")).toBeTruthy();
        expect(card.getByText("Near-duplicate")).toBeTruthy();
        expect(card.getByText("Fails: legal · Regular · near-duplicate")).toBeTruthy();
    });

    it("offers the analysed facet as two chips with their counts", () => {
        const { onFacetChange } = draw([creative()]);
        fireEvent.click(screen.getByText("Analysed"));
        expect(onFacetChange).toHaveBeenLastCalledWith("analysed");
        fireEvent.click(screen.getByText("Not analysed"));
        expect(onFacetChange).toHaveBeenLastCalledWith("unanalysed");
    });

    it("runs the batch over everything pending and re-reads the queue", async () => {
        service.analysePending.mockResolvedValueOnce({ analysed: ["crt_1"], skipped: [{ creativeId: "crt_9", reason: "a video" }], failed: [] });
        const { onChanged } = draw([creative()]);
        fireEvent.click(screen.getByTestId("queue-analyse-pending"));
        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
        expect(service.analysePending).toHaveBeenCalledWith(undefined);
        expect(toast.success).toHaveBeenCalledWith("1 analysed", expect.objectContaining({ description: "1 skipped: a video" }));
    });

    it("runs the batch over the selection from the sticky bar", async () => {
        service.analysePending.mockResolvedValueOnce({ analysed: ["crt_1"], skipped: [], failed: [{ creativeId: "crt_2", reason: "The model did not answer" }] });
        const { onChanged } = draw([creative(), creative({ id: "crt_2" })]);
        fireEvent.click(screen.getAllByLabelText("Select Diwali Season Push", { selector: "button" })[0]!);
        fireEvent.click(screen.getByTestId("queue-analyse-selected"));
        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
        expect(service.analysePending).toHaveBeenCalledWith(["crt_1"]);
        expect(toast.warning).toHaveBeenCalledWith("1 analysed, 1 failed", expect.objectContaining({ description: "The model did not answer" }));
    });
});
