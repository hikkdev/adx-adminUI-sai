import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * K-B1 — the QR desk over `/qr`.
 *
 * Pinned: the list's facets reach the wire exactly as `qrListQuerySchema`
 * spells them (and nothing else does — an unset facet is absent, not
 * `undefined`), the scans reads take their own shapes, regenerate is a
 * bare POST on the code's own route, deactivate carries the reason in the
 * DELETE body, and the image url is built on the console's API base rather
 * than the wire's root-relative one.
 */

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return {
        ...actual,
        isLive: () => true,
        apiConfig: { ...actual.apiConfig, baseUrl: "https://api.adx.test/api/v1" },
    };
});

const { backend } = vi.hoisted(() => {
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        answer: undefined as unknown,
        reset() {
            this.calls = [];
            this.answer = undefined;
        },
    };
    return { backend };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        return backend.answer;
    };
    return {
        ...actual,
        api: {
            get: (path: string) => wrap("GET", path),
            post: (path: string, body?: unknown) => wrap("POST", path, body),
            patch: (path: string, body?: unknown) => wrap("PATCH", path, body),
            put: (path: string, body?: unknown) => wrap("PUT", path, body),
            delete: (path: string, options?: { body?: unknown }) => wrap("DELETE", path, options?.body),
            blob: (path: string) => wrap("BLOB", path),
        },
    };
});

import { buildQrListQuery, buildScansByQuery, qrImageUrl, qrService, scanOutcomeMeta } from "./qr";

beforeEach(() => backend.reset());

describe("the list's facets", () => {
    it("spells the query as the schema parses it, with the page always present", () => {
        expect(buildQrListQuery()).toBe("page=1&pageSize=20");
        expect(buildQrListQuery({ type: "SITE", active: false, q: " abc ", page: 3, pageSize: 25 })).toBe(
            "type=SITE&active=false&q=abc&page=3&pageSize=25",
        );
        expect(buildQrListQuery({ active: true, refId: "lst_1" })).toBe("active=true&refId=lst_1&page=1&pageSize=20");
    });

    it("reaches the wire on GET /qr", async () => {
        backend.answer = { items: [], total: 0, page: 2, pageSize: 25, counts: { SITE: 3 } };
        const page = await qrService.list({ type: "AGENT", page: 2, pageSize: 25 });
        expect(backend.calls).toEqual([{ method: "GET", path: "/qr?type=AGENT&page=2&pageSize=25", body: undefined }]);
        expect(page.counts).toEqual({ SITE: 3 });
    });
});

describe("scans", () => {
    it("reads one code's scans on the list contract, and a person's scans with the window", async () => {
        backend.answer = { items: [], total: 0, page: 1, pageSize: 20, counts: {} };
        await qrService.scans("qr_1", { outcome: "GRANTED" });
        expect(backend.calls[0].path).toBe("/qr/qr_1/scans?outcome=GRANTED&page=1&pageSize=20");

        backend.answer = undefined;
        expect(await qrService.scansBy({ scannedById: "u1", from: "2026-09-01T00:00:00.000Z" })).toEqual([]);
        expect(backend.calls[1].path).toBe("/qr/scans?scannedById=u1&from=2026-09-01T00%3A00%3A00.000Z");
        expect(buildScansByQuery({ scannedById: "u1", outcome: "EXPIRED", to: "2026-09-30T00:00:00.000Z" })).toBe(
            "scannedById=u1&outcome=EXPIRED&to=2026-09-30T00%3A00%3A00.000Z",
        );
    });
});

describe("the writes", () => {
    it("regenerates with a bare POST on the code's own route", async () => {
        backend.answer = { id: "qr_2", previousQrId: "qr_1", type: "SITE", refId: "lst_1", token: "t", isActive: true, expiresAt: null, createdAt: "", imagePngUrl: "", imageSvgUrl: "" };
        const next = await qrService.regenerate("qr_1");
        expect(backend.calls).toEqual([{ method: "POST", path: "/qr/qr_1/regenerate", body: undefined }]);
        expect(next.previousQrId).toBe("qr_1");
    });

    it("deactivates with the reason in the DELETE body, trimmed", async () => {
        backend.answer = { message: "QR deactivated" };
        await qrService.deactivate("qr_1", "  Poster replaced at the site.  ");
        expect(backend.calls).toEqual([{ method: "DELETE", path: "/qr/qr_1", body: { reason: "Poster replaced at the site." } }]);
    });

    it("mints with the schema's body — no metadata key when there is none", async () => {
        backend.answer = { qrId: "qr_9", token: "t", expiresAt: null };
        await qrService.generate({ type: "PUBLISHER", refId: " pub_1 ", allowedRoles: ["AGENT_PUBLISHER"] });
        expect(backend.calls).toEqual([{ method: "POST", path: "/qr", body: { type: "PUBLISHER", refId: "pub_1", allowedRoles: ["AGENT_PUBLISHER"] } }]);
    });

    it("pulls the image through the blob helper", async () => {
        backend.answer = { blob: new Blob(), filename: null, contentType: "image/svg+xml" };
        await qrService.image("qr_1", "svg");
        await qrService.image("qr_1", "png");
        expect(backend.calls.map((call) => call.path)).toEqual(["/qr/qr_1/image.svg", "/qr/qr_1/image.png?size=600"]);
    });
});

describe("the image url and the outcome badge", () => {
    it("builds the public image route on the console's own API base", () => {
        expect(qrImageUrl("qr_1", "png", 120)).toBe("https://api.adx.test/api/v1/qr/qr_1/image.png?size=120");
        expect(qrImageUrl("qr_1", "svg")).toBe("https://api.adx.test/api/v1/qr/qr_1/image.svg");
    });

    it("names the outcomes it knows and prints an unknown one as it came", () => {
        expect(scanOutcomeMeta("GRANTED")).toEqual({ label: "Granted", tone: "success" });
        expect(scanOutcomeMeta("SOMETHING_NEW")).toEqual({ label: "something new", tone: "neutral" });
    });
});
