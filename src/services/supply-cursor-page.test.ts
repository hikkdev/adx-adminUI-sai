import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The supply queues that the backend bounded — attempts and compliance
 * cases — come as one cursor page, `{ rows, nextCursor }`, where the
 * console once read a bare array. What is pinned: the console asks for the
 * server's largest page, hands the rows on with whether there were more,
 * and still reads a backend that answers with the old bare array — the
 * routes flipped one at a time, and the first to flip took the verification
 * queue down with `cases.filter is not a function` (ERR-7F3A21C9).
 */

const { backend } = vi.hoisted(() => ({
    backend: {
        answer: null as unknown,
        paths: [] as string[],
    },
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        api: {
            ...actual.api,
            get: async (path: string) => {
                backend.paths.push(path);
                return backend.answer;
            },
        },
    };
});

import { CURSOR_PAGE_LIMIT, supplyService } from "./supply";

const openCase = { id: "cc_1", listingId: "lst_1", status: "OPEN", dueAt: "2026-09-16T00:00:00.000Z" };

beforeEach(() => {
    backend.answer = null;
    backend.paths = [];
});

describe("the bounded supply reads", () => {
    it("asks for the largest page of compliance cases and hands the rows on with whether there were more", async () => {
        backend.answer = { rows: [openCase], nextCursor: "cc_1" };
        const page = await supplyService.complianceCases();
        expect(backend.paths).toEqual([`/supply/compliance/cases?limit=${CURSOR_PAGE_LIMIT}`]);
        expect(page.rows).toEqual([openCase]);
        expect(page.nextCursor).toBe("cc_1");
    });

    it("still reads a backend that answers the compliance cases as a bare array", async () => {
        backend.answer = [openCase];
        expect(await supplyService.complianceCases()).toEqual({ rows: [openCase], nextCursor: null });
    });

    it("reads an empty page as no rows and no more", async () => {
        backend.answer = { rows: [], nextCursor: null };
        expect(await supplyService.complianceCases()).toEqual({ rows: [], nextCursor: null });
    });

    it("shapes each attempt on the page and keeps the cursor", async () => {
        backend.answer = { rows: [{ id: "att_1", publisher: { name: "Sharma Hoardings" } }], nextCursor: null };
        const page = await supplyService.attempts();
        expect(backend.paths).toEqual([`/supply/attempts?limit=${CURSOR_PAGE_LIMIT}`]);
        expect(page.rows).toHaveLength(1);
        expect(page.rows[0]).toMatchObject({ id: "att_1", publisherName: "Sharma Hoardings", listings: [] });
        expect(page.nextCursor).toBeNull();
    });

    it("passes the cursor back for the page after the last one read (Q-C item 6)", async () => {
        backend.answer = { rows: [], nextCursor: null };
        await supplyService.complianceCases("cc_9");
        await supplyService.attempts("att_9");
        expect(backend.paths).toEqual([
            `/supply/compliance/cases?limit=${CURSOR_PAGE_LIMIT}&cursor=cc_9`,
            `/supply/attempts?limit=${CURSOR_PAGE_LIMIT}&cursor=att_9`,
        ]);
    });

    it("reads the claims as a page narrowed by ?status=, shaped with the nullable columns defaulted (Q-C item 3)", async () => {
        backend.answer = { rows: [{ id: "clm_1", listingId: "lst_1", claimantPublisherId: "pub_1", status: "PENDING", createdAt: "2026-09-15T00:00:00.000Z" }], nextCursor: null };
        const page = await supplyService.claims("PENDING");
        expect(backend.paths).toEqual([`/supply/claims?limit=${CURSOR_PAGE_LIMIT}&status=PENDING`]);
        expect(page.rows).toEqual([
            { id: "clm_1", listingId: "lst_1", claimantPublisherId: "pub_1", status: "PENDING", evidenceNote: null, decisionNote: null, decidedAt: null, decidedByUserId: null, createdAt: "2026-09-15T00:00:00.000Z" },
        ]);
        backend.paths = [];
        await supplyService.claims(null, "clm_1");
        expect(backend.paths).toEqual([`/supply/claims?limit=${CURSOR_PAGE_LIMIT}&cursor=clm_1`]);
    });
});
