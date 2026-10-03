import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * DR-1 — the reading panel under a document.
 *
 * What is pinned: a tile that is never read draws nothing; a private file
 * loads the reading kept on it and offers "Read again", a fresh one offers
 * "Read this document"; the fields show what was read with a mismatch badge
 * where the desk typed something else; a public URL reads by URL; a fresh
 * reading reaches the caller for a prefill.
 */

const { service, toast } = vi.hoisted(() => ({
    service: { get: vi.fn(), read: vi.fn(), getByUrl: vi.fn(), readByUrl: vi.fn() },
    toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast }));
vi.mock("@/services/document-reading", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/document-reading")>();
    return { ...actual, documentReadingService: service };
});

import { DocumentReadingPanel } from "./document-reading";
import type { DocumentReading } from "@/services/document-reading";

const reading = (over: Partial<DocumentReading> = {}): DocumentReading => ({
    fileId: "f_1",
    kind: "PAN",
    documentSeen: "a PAN card",
    matchesKind: true,
    fields: {
        number: { value: "ABCDE1234F", confidence: 0.97 },
        name: { value: "Anita Sharma", confidence: 0.9 },
        fatherName: { value: null, confidence: 0 },
        dateOfBirth: { value: "1988-04-12", confidence: 0.6 },
    },
    warnings: ["AADHAAR_NUMBER_PRESENT"],
    summary: "A PAN card in good light.",
    confidence: 0.82,
    provider: "google",
    model: "gemini-2.5-pro",
    readAt: "2026-09-23T10:00:00.000Z",
    readByUserId: "usr_admin",
    ...over,
});

describe("the reading panel", () => {
    it("draws nothing for a tile that is never read", () => {
        service.get.mockResolvedValue(null);
        const { container } = render(<DocumentReadingPanel url="/files/f_aad" kind={null} />);
        expect(container.innerHTML).toBe("");
        expect(service.get).not.toHaveBeenCalled();
    });

    it("loads what is kept on a private file and badges a value the desk typed differently", async () => {
        service.get.mockResolvedValueOnce(reading());
        render(<DocumentReadingPanel url="http://api.test/api/v1/files/f_1" kind="PAN" expected={{ number: "ABCDE1234G" }} />);
        await waitFor(() => expect(screen.getByTestId("document-reading-result")).toBeTruthy());
        expect(service.get).toHaveBeenCalledWith("f_1");
        expect(screen.getByTestId("document-reading-field-number").textContent).toContain("ABCDE1234F");
        expect(screen.getByTestId("document-reading-mismatch-number").textContent).toContain("Typed ABCDE1234G");
        expect(screen.queryByTestId("document-reading-mismatch-name")).toBeNull();
        expect(screen.getByTestId("document-reading-field-fatherName").textContent).toContain("Not legible");
        expect(screen.getByTestId("document-reading-warnings").textContent).toContain("Aadhaar number is on this document and was withheld");
        expect(screen.getByTestId("document-reading-run").textContent).toBe("Read again");
    });

    it("asks for a fresh reading, hands it to the caller, and says what the document turned out to be", async () => {
        service.get.mockResolvedValueOnce(null);
        service.read.mockResolvedValueOnce(reading({ matchesKind: false, documentSeen: "a voter ID" }));
        const onRead = vi.fn();
        render(<DocumentReadingPanel url="/files/f_1" kind="PAN" onRead={onRead} />);
        await waitFor(() => expect(screen.getByTestId("document-reading-run").textContent).toBe("Read this document"));
        await waitFor(() => expect((screen.getByTestId("document-reading-run") as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(screen.getByTestId("document-reading-run"));
        await waitFor(() => expect(onRead).toHaveBeenCalledTimes(1));
        expect(service.read).toHaveBeenCalledWith("f_1", "PAN");
        expect(screen.getByTestId("document-reading-kind-mismatch").textContent).toContain("Looks like a voter ID, not a pan card");
        expect(toast.success).toHaveBeenCalledWith("Read as pan card", expect.anything());
    });

    it("reads a public URL by the URL itself, and says so when a file cannot be read at all", async () => {
        service.getByUrl.mockResolvedValueOnce(null);
        render(<DocumentReadingPanel url="https://api.test/uploads/verification/noc.jpg" kind="AUTHORISATION_LETTER" />);
        await waitFor(() => expect(service.getByUrl).toHaveBeenCalledWith("https://api.test/uploads/verification/noc.jpg"));
        render(<DocumentReadingPanel url="blob:something" kind="OTHER" />);
        expect(screen.getByText("This file is not stored where it can be read.")).toBeTruthy();
    });
});
