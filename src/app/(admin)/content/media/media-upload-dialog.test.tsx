import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * LM-1: the upload dialog checks the spec in the browser before the file
 * leaves — a file of the wrong shape is named and the Upload stays shut;
 * alt text is required.
 */

vi.mock("../../settings/brand/image-size", () => ({
    readImageSize: vi.fn(async (file: File) => (file.name === "wrong.jpg" ? { width: 800, height: 800 } : { width: 1600, height: 480 })),
}));

const upload = vi.fn(async () => ({ id: "m1", title: "Wide" }));
vi.mock("@/services/media", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/media")>();
    return { ...actual, mediaService: { ...actual.mediaService, upload: (...args: unknown[]) => upload(...(args as [])) } };
});

import { MediaUploadDialog } from "./media-upload-dialog";

const SPECS = [{ key: "PROMO_WIDE", label: "Promo banner — wide", width: 1600, height: 480, minWidth: 1200, minHeight: 360, maxBytes: 2 * 1024 * 1024, formats: ["image/jpeg", "image/png", "image/webp"] }];

describe("MediaUploadDialog", () => {
    it("names a file of the wrong shape and keeps Upload shut, then uploads a good one with alt text", async () => {
        const onUploaded = vi.fn();
        render(<MediaUploadDialog open specs={SPECS} onOpenChange={() => {}} onUploaded={onUploaded} />);
        const input = screen.getByTestId("media-file-input") as HTMLInputElement;

        fireEvent.change(input, { target: { files: [new File(["x"], "wrong.jpg", { type: "image/jpeg" })] } });
        await waitFor(() => expect(screen.getByTestId("media-spec-problems").textContent).toMatch(/shape of 1600 × 480/));
        expect(screen.getByTestId("media-upload-submit")).toHaveProperty("disabled", true);
    });

    it("uploads a file that meets the spec once alt text is written", async () => {
        const onUploaded = vi.fn();
        render(<MediaUploadDialog open specs={SPECS} onOpenChange={() => {}} onUploaded={onUploaded} />);
        fireEvent.change(screen.getByTestId("media-file-input"), { target: { files: [new File(["x"], "wide.jpg", { type: "image/jpeg" })] } });
        await waitFor(() => expect(screen.getByText(/Meets Promo banner — wide/)).toBeTruthy());
        expect(screen.getByTestId("media-upload-submit")).toHaveProperty("disabled", true);
        fireEvent.change(screen.getByLabelText("Alt text"), { target: { value: "Diwali sale banner" } });
        fireEvent.click(screen.getByTestId("media-upload-submit"));
        await waitFor(() => expect(onUploaded).toHaveBeenCalled());
        expect(upload).toHaveBeenCalledWith(expect.objectContaining({ spec: "PROMO_WIDE", altText: "Diwali sale banner" }));
    });
});
