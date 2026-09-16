import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, apiFetchBlob, attachmentFilename, onSessionEnded, tokens } from "./api-client";

/**
 * The api client's blob mode and the explicit-bearer rule.
 *
 * What this file pins: a download goes through the same 401 → refresh →
 * replay path as a page read, so an expired access token no longer fails a
 * download; a failed download reads the backend's envelope like any other
 * failure; and a 401 under an impersonation bearer is that token's expiry,
 * never the admin's session — no refresh, no sign-out.
 */

const envelope = (data: unknown, init: ResponseInit = {}) =>
    new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: { "content-type": "application/json" },
        ...init,
    });

const failure = (status: number, code: string, message: string) =>
    new Response(JSON.stringify({ success: false, error: { code, message } }), {
        status,
        headers: { "content-type": "application/json" },
    });

const csv = (body: string, filename: string) =>
    new Response(body, {
        status: 200,
        headers: {
            "content-type": "text/csv",
            "content-disposition": `attachment; filename="${filename}"`,
        },
    });

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    tokens.clear();
    tokens.set({ accessToken: "stale-access", refreshToken: "refresh-1" });
});

afterEach(() => {
    vi.unstubAllGlobals();
    tokens.clear();
});

const authorizationOf = (call: [RequestInfo | URL, RequestInit?] | undefined): string | null =>
    call ? new Headers(call[1]?.headers).get("authorization") : null;

describe("blob mode", () => {
    it("returns the bytes, the attachment filename and the content type", async () => {
        fetchMock.mockResolvedValueOnce(csv("a,b\n1,2\n", "audit-2026-09-12.csv"));

        const result = await api.blob("/audit/export.csv");

        expect(await result.blob.text()).toBe("a,b\n1,2\n");
        expect(result.filename).toBe("audit-2026-09-12.csv");
        expect(result.contentType).toBe("text/csv");
        expect(authorizationOf(fetchMock.mock.calls[0])).toBe("Bearer stale-access");
    });

    it("refreshes an expired access token and replays the download", async () => {
        fetchMock
            .mockResolvedValueOnce(failure(401, "UNAUTHENTICATED", "Token expired"))
            .mockResolvedValueOnce(envelope({ accessToken: "fresh-access", refreshToken: "refresh-2" }))
            .mockResolvedValueOnce(csv("bytes", "BATCH-2026-3.csv"));

        const result = await apiFetchBlob("/finance/payout-batches/b1/export");

        expect(await result.blob.text()).toBe("bytes");
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(String(fetchMock.mock.calls[1]?.[0])).toMatch(/\/auth\/refresh$/);
        expect(authorizationOf(fetchMock.mock.calls[2])).toBe("Bearer fresh-access");
        expect(tokens.access).toBe("fresh-access");
    });

    it("ends the session when the refresh fails too", async () => {
        const ended = vi.fn();
        const off = onSessionEnded(ended);
        fetchMock
            .mockResolvedValueOnce(failure(401, "UNAUTHENTICATED", "Token expired"))
            .mockResolvedValueOnce(failure(401, "UNAUTHENTICATED", "Refresh expired"));

        await expect(api.blob("/finance/invoices/i1/pdf")).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
        expect(ended).toHaveBeenCalledTimes(1);
        expect(tokens.access).toBeNull();
        off();
    });

    it("reads the backend's failure envelope on a refused download", async () => {
        fetchMock.mockResolvedValueOnce(failure(403, "FORBIDDEN", "Not your file."));

        await expect(api.blob("/files/f1")).rejects.toMatchObject({
            status: 403,
            code: "FORBIDDEN",
            message: "Not your file.",
        });
    });

    it("falls back to the status when a failed download is not JSON", async () => {
        fetchMock.mockResolvedValueOnce(new Response("<html>gone</html>", { status: 502 }));

        const error = await api.blob("/files/f1").catch((cause: unknown) => cause);
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(502);
        expect((error as ApiError).code).toBe("REQUEST_FAILED");
    });
});

describe("an explicit bearer", () => {
    it("is sent instead of the session's token", async () => {
        fetchMock.mockResolvedValueOnce(envelope({ id: "pub_1" }));

        await api.get("/publishers/me", { bearer: "view-as-token" });

        expect(authorizationOf(fetchMock.mock.calls[0])).toBe("Bearer view-as-token");
    });

    it("treats a 401 as its own expiry: no refresh, no sign-out", async () => {
        const ended = vi.fn();
        const off = onSessionEnded(ended);
        fetchMock.mockResolvedValueOnce(failure(401, "UNAUTHENTICATED", "Token expired"));

        await expect(api.get("/payouts/wallet", { bearer: "view-as-token" })).rejects.toMatchObject({
            status: 401,
            code: "IMPERSONATION_EXPIRED",
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(ended).not.toHaveBeenCalled();
        expect(tokens.access).toBe("stale-access");
        off();
    });
});

describe("attachmentFilename", () => {
    it("reads a quoted, a bare and an RFC 5987 filename, and nothing from no header", () => {
        expect(attachmentFilename('attachment; filename="BATCH-2026-3.csv"')).toBe("BATCH-2026-3.csv");
        expect(attachmentFilename("attachment; filename=export.csv")).toBe("export.csv");
        expect(attachmentFilename("attachment; filename*=UTF-8''audit%202026.csv")).toBe("audit 2026.csv");
        expect(attachmentFilename(null)).toBeNull();
    });
});
