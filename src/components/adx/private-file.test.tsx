import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PrivateFile, fetchPrivateFile, isPrivateFileUrl, kindOf } from "./private-file";
import { tokens } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";

/**
 * Lot D (Q61): a private KYC image is a `/files/:id` URL that answers only
 * with the bearer token. What is pinned: a public URL is drawn straight into
 * the image and never fetched; a private one is fetched with the token and
 * `redirect: "follow"`, drawn from the object URL the blob became — as an
 * image, a video or a PDF link by its bytes — and a refusal is shown rather
 * than an empty box.
 */

const fetchMock = vi.fn<typeof fetch>();
const files = `${apiConfig.baseUrl}/files`;

/** jsdom's Blob is not undici's, so the type travels as the header — as it does from the store. */
const bytes = (type: string) => new Response("x", { status: 200, headers: { "Content-Type": type } });

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    // jsdom has no object URLs.
    URL.createObjectURL = vi.fn(() => "blob:adx/1");
    URL.revokeObjectURL = vi.fn();
    tokens.set({ accessToken: "tok-1" });
});

afterEach(() => {
    tokens.clear();
    vi.unstubAllGlobals();
});

describe("isPrivateFileUrl", () => {
    it("recognises the /files/:id shape under any base and nothing else", () => {
        expect(isPrivateFileUrl(`${files}/0123456789abcdef0123456789abcdef`)).toBe(true);
        expect(isPrivateFileUrl("https://api.adx.in/api/v1/files/0123456789abcdef0123456789abcdef")).toBe(true);
        expect(isPrivateFileUrl("https://cdn.adx.in/uploads/kyc/pan.jpg")).toBe(false);
        expect(isPrivateFileUrl(null)).toBe(false);
    });
    it("names a blob by its type", () => {
        expect(kindOf("image/jpeg")).toBe("image");
        expect(kindOf("video/mp4")).toBe("video");
        expect(kindOf("application/pdf")).toBe("pdf");
    });
});

describe("<PrivateFile>", () => {
    it("draws a public URL directly and never fetches it", () => {
        render(<PrivateFile src="https://cdn.adx.in/uploads/kyc/pan.jpg" alt="PAN card" />);
        expect(screen.getByTestId("private-file-image")).toHaveAttribute("src", "https://cdn.adx.in/uploads/kyc/pan.jpg");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("fetches a private URL with the bearer token and draws the blob", async () => {
        fetchMock.mockResolvedValue(bytes("image/png"));
        render(<PrivateFile src={`${files}/abc123`} alt="Government ID" />);
        expect(screen.getByTestId("private-file-skeleton")).toBeInTheDocument();
        await waitFor(() => expect(screen.getByTestId("private-file-image")).toHaveAttribute("src", "blob:adx/1"));
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe(`${files}/abc123`);
        expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
        expect(init?.redirect).toBe("follow");
    });

    it("draws a PDF as a link and a video with controls", async () => {
        fetchMock.mockResolvedValueOnce(bytes("application/pdf"));
        const { unmount } = render(<PrivateFile src={`${files}/pdf1`} alt="Bank statement" />);
        await waitFor(() => expect(screen.getByTestId("private-file-link")).toBeInTheDocument());
        unmount();
        fetchMock.mockResolvedValueOnce(bytes("video/mp4"));
        render(<PrivateFile src={`${files}/vid1`} alt="Liveness video" />);
        await waitFor(() => expect(screen.getByTestId("private-file-video")).toBeInTheDocument());
    });

    it("says why when the store refuses", async () => {
        fetchMock.mockResolvedValue(new Response("", { status: 403 }));
        render(<PrivateFile src={`${files}/abc123`} alt="Selfie" />);
        await waitFor(() => expect(screen.getByTestId("private-file-error")).toBeInTheDocument());
        expect(screen.getByText(/not allowed to open this file/)).toBeInTheDocument();
    });
});

describe("fetchPrivateFile", () => {
    it("throws with the status when the response is not ok", async () => {
        const impl = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 404 }));
        await expect(fetchPrivateFile(`${files}/gone`, impl)).rejects.toMatchObject({ status: 404 });
    });
});
