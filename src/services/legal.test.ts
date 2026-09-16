import { describe, expect, it, vi } from "vitest";

/**
 * The console's reading of the read documents.
 *
 * What is pinned: which version of a kind is live, how many kinds still carry
 * the seeded placeholder — the number that blocks a launch — and the URLs the
 * editor writes to.
 */

const { calls } = vi.hoisted(() => ({ calls: [] as { method: string; path: string; body?: unknown }[] }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (method: string) => async (path: string, body?: unknown) => {
        calls.push({ method, path, body });
        return {};
    };
    return { ...actual, api: { get: record("GET"), post: record("POST"), patch: record("PATCH"), put: record("PUT"), delete: record("DELETE") } };
});

import { isPlaceholder, kindCoverage, legalService, liveVersion, placeholderCount, versionsOf, type LegalDocument } from "./legal";

const document = (over: Partial<LegalDocument> = {}): LegalDocument => ({
    id: "doc_1",
    kind: "PRIVACY_POLICY",
    version: 1,
    title: "Privacy policy",
    summary: null,
    body: "# Privacy",
    meta: null,
    isActive: true,
    effectiveFrom: "2026-09-01T00:00:00.000Z",
    activatedAt: "2026-09-01T00:00:00.000Z",
    retiredAt: null,
    createdByUserId: "usr_admin",
    changeNote: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    state: "ACTIVE",
    ...over,
});

describe("versions of a kind", () => {
    it("are newest first, and the live one is the one marked active", () => {
        const documents = [
            document({ id: "doc_1", version: 1, state: "SUPERSEDED", isActive: false }),
            document({ id: "doc_2", version: 3, state: "DRAFT", isActive: false }),
            document({ id: "doc_3", version: 2 }),
        ];
        expect(versionsOf(documents, "PRIVACY_POLICY").map((row) => row.version)).toEqual([3, 2, 1]);
        expect(liveVersion(documents, "PRIVACY_POLICY")?.id).toBe("doc_3");
        expect(liveVersion(documents, "FAQ")).toBeNull();
    });
});

describe("what still blocks a launch", () => {
    it("counts the kinds whose live version is the seeded placeholder", () => {
        expect(isPlaceholder(document({ title: "Privacy policy (placeholder)" }))).toBe(true);
        expect(isPlaceholder(document({ meta: { placeholder: true } }))).toBe(true);
        expect(isPlaceholder(document())).toBe(false);
        expect(isPlaceholder(null)).toBe(false);

        const documents = [
            document({ title: "Privacy policy (placeholder)" }),
            document({ id: "doc_2", kind: "FAQ", title: "FAQs", meta: { items: [] } }),
        ];
        expect(placeholderCount(documents)).toBe(1);
        const coverage = kindCoverage(documents);
        expect(coverage.PRIVACY_POLICY).toMatchObject({ versions: 1, placeholder: true });
        expect(coverage.FAQ).toMatchObject({ placeholder: false });
        expect(coverage.TERMS_OF_SERVICE).toMatchObject({ live: null, versions: 0, placeholder: false });
    });
});

describe("what the desk writes", () => {
    it("posts a version, patches a draft, activates, and saves the app status", async () => {
        calls.length = 0;
        await legalService.create({ kind: "PRIVACY_POLICY", title: "Privacy policy 2026", body: "# v2", activate: true });
        await legalService.update("doc_1", { body: "# v2b" });
        await legalService.activate("doc_1");
        await legalService.discard("doc_2");
        await legalService.updateAlert("sft_1", { status: "ACKNOWLEDGED", opsNote: "Calling now." });
        expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
            "POST /legal/documents",
            "PATCH /legal/documents/doc_1",
            "POST /legal/documents/doc_1/activate",
            "DELETE /legal/documents/doc_2",
            "PATCH /safety/alerts/sft_1",
        ]);
        expect(calls[0]!.body).toMatchObject({ activate: true });
    });
});
