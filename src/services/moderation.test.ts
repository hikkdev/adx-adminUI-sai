import { describe, expect, it, vi } from "vitest";

/**
 * Creative moderation as the console reads and writes it (Lot D, Q44).
 *
 * What is pinned is the part a click-through cannot catch: the note rule the
 * server enforces (a refusal has to say why), the checklist the workbench
 * draws from the two computed checks plus the reviewer's three, the rail of
 * "next six", and the exact routes and bodies — because a decision here
 * notifies a real advertiser and gates a real print run.
 */

const { calls } = vi.hoisted(() => ({ calls: [] as { method: string; path: string; body?: unknown }[] }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (method: string) => async (path: string, body?: unknown) => {
        calls.push({ method, path, body });
        return {};
    };
    return {
        ...actual,
        api: { get: record("GET"), post: record("POST"), patch: record("PATCH"), put: record("PUT"), delete: record("DELETE") },
    };
});

import {
    checklistOf,
    fileSizeLabel,
    flagLabel,
    isVideo,
    moderationService,
    noteRequired,
    placementLabel,
    queueRail,
    reviewQueueQuery,
    type CreativeReviewRow,
} from "./moderation";

const row = (over: Partial<CreativeReviewRow> = {}): CreativeReviewRow => ({
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
    ...over,
});

describe("the note rule", () => {
    it("lets an approval go without a note", () => {
        expect(noteRequired("APPROVED", "")).toBeNull();
    });

    it("refuses a rejection or a change request that says nothing — the schema's own words", () => {
        expect(noteRequired("REJECTED", "   ")).toMatch(/note is required/);
        expect(noteRequired("CHANGES_REQUESTED", "")).toMatch(/note is required/);
        expect(noteRequired("REJECTED", "Text runs below the safe area")).toBeNull();
    });
});

describe("the checklist", () => {
    it("draws the two computed checks first, then the reviewer's three as not judged", () => {
        const list = checklistOf(row().checks);
        expect(list.map((check) => check.code)).toEqual([
            "DIMENSIONS_MATCH",
            "VENUE_STANCE",
            "QR_PRESENT",
            "TEXT_LEGIBLE",
            "BRAND_SAFE",
        ]);
        expect(list[0]).toEqual({ code: "DIMENSIONS_MATCH", result: "PASS", note: "40×20 ft against 1920×960 px" });
        expect(list[1].result).toBe("UNKNOWN");
        expect(list[4].result).toBe("UNKNOWN");
    });

    it("keeps a stored manual verdict over the default", () => {
        const list = checklistOf([{ code: "BRAND_SAFE", result: "FAIL" }]);
        expect(list.find((check) => check.code === "BRAND_SAFE")?.result).toBe("FAIL");
    });

    it("copes with a row that stored nothing", () => {
        expect(checklistOf(null)).toHaveLength(5);
    });
});

describe("the rail", () => {
    const items = ["a", "b", "c", "d", "e", "f", "g", "h", "i"].map((id) => row({ id }));

    it("is the next six after the artwork on screen", () => {
        expect(queueRail(items, "b").map((item) => item.id)).toEqual(["c", "d", "e", "f", "g", "h"]);
    });

    it("falls back to the head of the queue when the artwork has left it", () => {
        expect(queueRail(items, "zzz").map((item) => item.id)).toEqual(["a", "b", "c", "d", "e", "f"]);
    });

    it("never lists the artwork itself", () => {
        expect(queueRail(items, "a").map((item) => item.id)).not.toContain("a");
    });
});

describe("what the cards print", () => {
    it("sizes a file in KB below a megabyte and MB above", () => {
        expect(fileSizeLabel(860_160)).toBe("840 KB");
        expect(fileSizeLabel(9_856_614)).toBe("9.4 MB");
        expect(fileSizeLabel(null)).toBeNull();
    });

    it("names the placement from the spot's size and the upload's pixels", () => {
        expect(placementLabel(row())).toBe("40×20 ft · 1920×960 px");
        expect(placementLabel(row({ spot: null }))).toBe("Campaign-level · 1920×960 px");
        expect(
            placementLabel(row({ widthPx: null, heightPx: null, spot: { ...row().spot!, listing: { ...row().spot!.listing, widthFt: null, heightFt: null } } })),
        ).toBe("Spot size not stated");
    });

    it("labels the flags the server raises, and spells out one it has not heard of", () => {
        expect(flagLabel("QR_MISSING")).toBe("QR-tracked, but no code named");
        expect(flagLabel("SOMETHING_NEW")).toBe("SOMETHING NEW");
    });

    it("treats the video path and a video mime type alike", () => {
        expect(isVideo(row({ path: "VIDEO_OR_MOTION" }))).toBe(true);
        expect(isVideo(row({ mimeType: "video/mp4" }))).toBe(true);
        expect(isVideo(row())).toBe(false);
    });
});

describe("the routes", () => {
    it("builds the queue query the list contract takes, and nothing it does not", () => {
        expect(reviewQueueQuery({})).toBe("");
        expect(reviewQueueQuery({ status: ["IN_REVIEW", "REJECTED"], flagged: true, kind: "STATIC_IMAGES", q: "diwali" })).toBe(
            "?status=IN_REVIEW%2CREJECTED&kind=STATIC_IMAGES&flagged=true&q=diwali",
        );
        expect(reviewQueueQuery({ resubmitted: false, pageSize: 50 })).toBe("?resubmitted=false&pageSize=50");
    });

    it("reviews one creative on its campaign's route with the decision, note and checks", async () => {
        calls.length = 0;
        await moderationService.review("cmp_1", "crt_1", {
            decision: "REJECTED",
            note: "Wrong shape",
            checks: [{ code: "DIMENSIONS_MATCH", result: "FAIL" }],
        });
        expect(calls).toEqual([
            {
                method: "PATCH",
                path: "/campaigns/cmp_1/creatives/crt_1/review",
                body: { decision: "REJECTED", note: "Wrong shape", checks: [{ code: "DIMENSIONS_MATCH", result: "FAIL" }] },
            },
        ]);
    });

    it("reviews several through the bulk route, and leaves an empty note off the body", async () => {
        calls.length = 0;
        await moderationService.reviewMany(["a", "b"], "APPROVED");
        expect(calls).toEqual([
            { method: "POST", path: "/campaigns/creatives/review", body: { creativeIds: ["a", "b"], decision: "APPROVED" } },
        ]);
    });

    it("uploads ADX-designed artwork with the flag only an admin may set", async () => {
        calls.length = 0;
        await moderationService.uploadDesigned("cmp_1", { fileUrl: "https://cdn/x.png", fileName: "x.png" });
        expect(calls[0]).toEqual({
            method: "POST",
            path: "/campaigns/cmp_1/creatives",
            body: { fileUrl: "https://cdn/x.png", fileName: "x.png", designedByAdx: true },
        });
    });

    it("reads one artwork from the desk's own route", async () => {
        calls.length = 0;
        await moderationService.get("crt_9");
        expect(calls[0]).toMatchObject({ method: "GET", path: "/campaigns/creatives/crt_9" });
    });
});
