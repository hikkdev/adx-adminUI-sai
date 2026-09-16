import { describe, expect, it, vi } from "vitest";

/**
 * Rate cards as the console publishes them — E10-2's dry-run flow.
 *
 * The approve dialog's Impact step used to persist the grid (and revise an
 * ACTIVE card) before it could be measured, so cancelling left a draft
 * behind. Now the measurement is `POST /rate-cards/:id/impact/dry-run`
 * over the grid as typed, and the server is written only when Approve is
 * pressed — in one order, pinned here. The approvals queue's facets and
 * paging are the list contract's, also pinned.
 */

const { calls } = vi.hoisted(() => ({ calls: [] as { method: string; path: string; body?: unknown }[] }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (method: string) => async (path: string, body?: unknown) => {
        calls.push({ method, path, body });
        // A revision answers with the next version; everything else echoes enough to continue.
        if (path.endsWith("/revise")) return { id: "rc_2", status: "DRAFT", version: 4 };
        if (path.endsWith("/approve")) return { id: path.split("/")[2], status: "ACTIVE", impact: { affected: 2, raised: 1, listingIds: ["lst_1"] } };
        return {};
    };
    return {
        ...actual,
        api: { get: record("GET"), post: record("POST"), patch: record("PATCH"), put: record("PUT"), delete: record("DELETE") },
    };
});

import { approvalsQuery, dryRunBody, publishDraft, rateCardService, type RateCard, type RateCardDraft } from "./rate-cards";

const card = (over: Partial<RateCard> = {}): RateCard => ({
    id: "rc_1",
    name: "Bengaluru",
    version: 3,
    status: "ACTIVE",
    cityId: "cty_blr",
    cityName: "Bengaluru",
    effectiveFrom: null,
    effectiveTo: null,
    floorPct: "0.8000",
    graceDays: 14,
    roundingRupees: 50,
    notes: null,
    approvedById: "usr_1",
    approvedAt: "2026-09-01T00:00:00.000Z",
    submittedById: null,
    submittedAt: null,
    supersedesId: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...over,
});

const draft: RateCardDraft = {
    entries: [
        { mediaTypeId: "mt_1", grade: "A", ratePerDay: "1200.00" },
        { mediaTypeId: "mt_1", grade: "B", ratePerDay: null },
    ],
    floorPct: "0.8200",
    graceDays: 21,
    roundingRupees: 100,
};

describe("the dry-run", () => {
    it("measures the grid as typed against the stored card and writes nothing", async () => {
        calls.length = 0;
        await rateCardService.impactDryRun("rc_1", draft);
        expect(calls).toEqual([
            {
                method: "POST",
                path: "/rate-cards/rc_1/impact/dry-run",
                body: { entries: draft.entries, floorPct: "0.8200", graceDays: 21 },
            },
        ]);
    });

    it("sends the cells, the floor and the grace — rounding is not something the floor reads", () => {
        expect(Object.keys(dryRunBody(draft)).sort()).toEqual(["entries", "floorPct", "graceDays"]);
    });
});

describe("the publish flow, run only on Approve", () => {
    it("revises an ACTIVE card first, persists the measured draft to the revision, submits it and approves it", async () => {
        calls.length = 0;
        const { target, approved } = await publishDraft(card(), draft);
        expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
            "POST /rate-cards/rc_1/revise",
            "PATCH /rate-cards/rc_2",
            "PUT /rate-cards/rc_2/entries",
            "POST /rate-cards/rc_2/submit",
            "POST /rate-cards/rc_2/approve",
        ]);
        expect(calls[1].body).toEqual({ roundingRupees: 100, floorPct: "0.8200", graceDays: 21 });
        expect(calls[2].body).toEqual({ entries: draft.entries });
        expect(target.id).toBe("rc_2");
        expect(approved.impact.raised).toBe(1);
    });

    it("writes a DRAFT card itself — no revision — and submits before approving", async () => {
        calls.length = 0;
        const { target } = await publishDraft(card({ status: "DRAFT", approvedById: null, approvedAt: null }), draft);
        expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
            "PATCH /rate-cards/rc_1",
            "PUT /rate-cards/rc_1/entries",
            "POST /rate-cards/rc_1/submit",
            "POST /rate-cards/rc_1/approve",
        ]);
        expect(target.id).toBe("rc_1");
    });

    it("does not submit a card already awaiting approval", async () => {
        calls.length = 0;
        await publishDraft(card({ status: "PENDING_APPROVAL" }), draft);
        expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
            "PATCH /rate-cards/rc_1",
            "PUT /rate-cards/rc_1/entries",
            "POST /rate-cards/rc_1/approve",
        ]);
    });
});

describe("the approvals queue", () => {
    it("names the server's facets and always the page, so the list contract answers rather than the bare array", () => {
        expect(approvalsQuery({ status: "PENDING", source: "CARD_REVISION", listingId: " lst_1 ", page: 2, pageSize: 25 })).toBe(
            "status=PENDING&source=CARD_REVISION&listingId=lst_1&page=2&pageSize=25",
        );
        expect(approvalsQuery()).toBe("page=1&pageSize=20");
        expect(approvalsQuery({ listingId: "  ", pageSize: 500 })).toBe("page=1&pageSize=100");
    });

    it("reads the queue where the module mounts it", async () => {
        calls.length = 0;
        await rateCardService.approvals({ source: "PUBLISH_REQUEST" });
        expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /rate-cards/approvals?source=PUBLISH_REQUEST&page=1&pageSize=20"]);
    });
});
