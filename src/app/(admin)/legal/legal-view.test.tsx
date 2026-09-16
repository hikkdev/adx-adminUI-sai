import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * The legal desk.
 *
 * What is walked is what ops do when Legal finally sends the text: see how
 * many kinds are still placeholders, write the real version, read it over,
 * make it live. The rule that a live version's text cannot change is the
 * server's, and the screen offers Edit only on a draft.
 */

const { backend } = vi.hoisted(() => {
    const backend = {
        documents: [] as Record<string, unknown>[],
        calls: [] as { method: string; path: string; body?: unknown }[],
        reset() {
            this.calls = [];
            this.documents = [
                {
                    id: "doc_1",
                    kind: "PRIVACY_POLICY",
                    version: 1,
                    title: "Privacy policy (placeholder)",
                    summary: "How we collect and use your data",
                    body: "# Privacy policy\n\n_Placeholder — the final text is supplied by ADX Legal._",
                    meta: null,
                    isActive: true,
                    effectiveFrom: "2026-09-11T00:00:00.000Z",
                    activatedAt: "2026-09-11T00:00:00.000Z",
                    retiredAt: null,
                    createdByUserId: null,
                    changeNote: "Placeholder — the final text is supplied by ADX Legal.",
                    createdAt: "2026-09-11T00:00:00.000Z",
                    updatedAt: "2026-09-11T00:00:00.000Z",
                    state: "ACTIVE",
                },
            ];
        },
        async handle(method: string, path: string, body?: unknown) {
            this.calls.push({ method, path, body });
            if (method === "GET" && path.startsWith("/legal/documents")) return this.documents;
            if (method === "POST" && path === "/legal/documents") {
                const input = body as Record<string, unknown>;
                const created = {
                    ...this.documents[0],
                    id: "doc_2",
                    version: 2,
                    title: input.title,
                    body: input.body,
                    changeNote: input.changeNote ?? null,
                    isActive: Boolean(input.activate),
                    activatedAt: input.activate ? "2026-09-11T06:00:00.000Z" : null,
                    state: input.activate ? "ACTIVE" : "DRAFT",
                };
                if (input.activate) this.documents[0] = { ...this.documents[0], isActive: false, state: "SUPERSEDED", retiredAt: "2026-09-11T06:00:00.000Z" };
                this.documents.push(created);
                return created;
            }
            if (method === "POST" && /\/legal\/documents\/.+\/activate/.test(path)) return this.documents[this.documents.length - 1];
            throw new Error(`No route ${method} ${path}`);
        },
    };
    return { backend };
});

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true } };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        try {
            return await backend.handle(method, path, body);
        } catch (cause) {
            throw new actual.ApiError(500, "INTERNAL", (cause as Error).message);
        }
    };
    return {
        ...actual,
        api: {
            get: (path: string) => wrap("GET", path),
            post: (path: string, body?: unknown) => wrap("POST", path, body),
            patch: (path: string, body?: unknown) => wrap("PATCH", path, body),
            put: (path: string, body?: unknown) => wrap("PUT", path, body),
            delete: (path: string) => wrap("DELETE", path),
        },
    };
});

import { legalService, type LegalDocument } from "@/services/legal";
import { LegalView } from "./legal-view";

beforeEach(() => backend.reset());

async function mount() {
    const documents = (await legalService.documents()) as LegalDocument[];
    const onChanged = vi.fn();
    render(<LegalView documents={documents} onChanged={onChanged} />);
    return { onChanged };
}

describe("the legal desk", () => {
    it("says how many kinds are still the placeholder, and marks the one on screen", async () => {
        await mount();
        expect(screen.getByTestId("legal-placeholder-banner").textContent).toContain("1 of 13 documents are still the seeded placeholder");
        expect(screen.getByTestId("legal-kind-placeholder")).toBeTruthy();
        expect(screen.getByTestId("legal-kind-PRIVACY_POLICY").textContent).toContain("placeholder");
        expect(screen.getByTestId("legal-kind-TERMS_OF_SERVICE").textContent).toContain("nothing live");
    });

    it("writes the real version and makes it live in one step", async () => {
        const { onChanged } = await mount();
        fireEvent.click(screen.getByRole("button", { name: /new version/i }));
        fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Privacy policy" } });
        fireEvent.change(screen.getByLabelText("Document text"), { target: { value: "# 1. What we collect\n\nKYC documents." } });
        fireEvent.click(screen.getByLabelText("Make it live now"));
        fireEvent.click(screen.getByRole("button", { name: /save and make v2 live/i }));

        await waitFor(() => expect(backend.calls.some((call) => call.method === "POST" && call.path === "/legal/documents")).toBe(true));
        const created = backend.calls.find((call) => call.method === "POST" && call.path === "/legal/documents");
        expect(created?.body).toMatchObject({ kind: "PRIVACY_POLICY", title: "Privacy policy", activate: true });
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
    });

    it("refuses to save a version with no text, and offers Edit only on a draft", async () => {
        await mount();
        fireEvent.click(screen.getByRole("button", { name: /new version/i }));
        fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Privacy policy" } });
        fireEvent.click(screen.getByRole("button", { name: /save v2 as a draft/i }));
        expect(await screen.findByText("The document needs a body.")).toBeTruthy();
        expect(backend.calls.some((call) => call.method === "POST")).toBe(false);

        fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
        // The live version has been live: no Edit, and Restore is not offered either.
        await waitFor(() => expect(screen.queryByRole("button", { name: /^edit$/i })).toBeNull());
    });

    it("gives the structured kinds a payload field and validates it", async () => {
        await mount();
        fireEvent.click(screen.getByTestId("legal-kind-FAQ"));
        fireEvent.click(screen.getByRole("button", { name: /new version/i }));
        fireEvent.change(screen.getByLabelText("Title"), { target: { value: "FAQs" } });
        fireEvent.change(screen.getByLabelText("Document text"), { target: { value: "# FAQs" } });
        fireEvent.change(screen.getByLabelText("Structured payload"), { target: { value: "{ not json" } });
        fireEvent.click(screen.getByRole("button", { name: /save v1 as a draft/i }));
        expect(await screen.findByText(/has to be a JSON object/)).toBeTruthy();
        expect(backend.calls.some((call) => call.method === "POST")).toBe(false);
    });
});
