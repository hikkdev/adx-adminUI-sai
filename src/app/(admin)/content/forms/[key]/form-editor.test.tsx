import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * FM-1: the form builder. What is pinned: a draft with a field that has no
 * label does not save — the row opens and says so; an Aadhaar label is
 * refused the same way; a labelled field saves as the draft with the
 * definition the server takes; publishing needs content.approve; the
 * phone preview draws what is typed.
 */

const { backend, perms } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string; body?: unknown }[],
        reset() {
            this.calls = [];
        },
        async handle(method: string, path: string, body?: unknown) {
            this.calls.push({ method, path, body });
            if (method === "PUT" && path === "/forms/event-signup/draft") return { id: "fv_1", number: 1, status: "DRAFT", definition: (body as { definition: unknown }).definition, changeNote: null, createdAt: "2026-09-27T09:00:00.000Z", publishedAt: null };
            throw new Error(`No route ${method} ${path}`);
        },
    },
    perms: { held: new Set<string>() },
}));

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

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ can: (id: string) => perms.held.has(id), user: null }) }));

/* The answers tab reads the API on its own; it is not what this file walks. */
vi.mock("./submissions-tab", () => ({ SubmissionsTab: () => <div data-testid="submissions-stub" /> }));

import { DEFAULT_FIELD_KINDS, emptyDefinition, type FormDetail } from "@/services/forms";
import { FormEditorView } from "./form-editor";

const detail = (over: Partial<FormDetail> = {}): FormDetail => ({
    id: "frm_1",
    key: "event-signup",
    title: "Event sign-up",
    description: null,
    destination: "LEAD",
    leadSide: "ADVERTISER",
    audience: "PUBLIC",
    notifyEmails: [],
    live: null,
    draft: {
        id: "fv_1",
        number: 1,
        status: "DRAFT",
        definition: { ...emptyDefinition(), screens: [{ key: "screen-1", title: "About you", fields: [{ id: "name", kind: "text", label: "" }] }] },
        changeNote: null,
        createdAt: "2026-09-27T09:00:00.000Z",
        updatedAt: "2026-09-27T09:00:00.000Z",
        publishedAt: null,
    },
    submissionsNew: 0,
    archivedAt: null,
    updatedAt: "2026-09-27T09:00:00.000Z",
    ...over,
});

beforeEach(() => {
    backend.reset();
    perms.held = new Set(["content.view", "content.edit", "content.approve", "content.delete"]);
});

describe("saving a draft", () => {
    it("refuses a field with no label — the row opens and says so, nothing is sent", async () => {
        render(<FormEditorView detail={detail()} kinds={DEFAULT_FIELD_KINDS} onReload={vi.fn()} />);
        /* Nothing typed yet: the draft is what was loaded, so Save is idle. */
        expect(screen.getByTestId("form-save")).toBeDisabled();

        /* Open the field, give it a label, take it away again: the editor is dirty and the label missing. */
        fireEvent.click(screen.getByRole("button", { name: /Untitled field/ }));
        const label = screen.getByTestId("field-0-name-label");
        fireEvent.change(label, { target: { value: "Your name" } });
        fireEvent.change(label, { target: { value: "" } });
        fireEvent.click(screen.getByTestId("form-save"));
        await waitFor(() => expect(screen.getByText("A field needs a label.")).toBeInTheDocument());
        expect(backend.calls).toEqual([]);
    });

    it("refuses an Aadhaar label before the server does", async () => {
        render(<FormEditorView detail={detail()} kinds={DEFAULT_FIELD_KINDS} onReload={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: /Untitled field/ }));
        fireEvent.change(screen.getByTestId("field-0-name-label"), { target: { value: "Aadhaar number" } });
        fireEvent.click(screen.getByTestId("form-save"));
        await waitFor(() => expect(screen.getByText(/Aadhaar is never asked for/)).toBeInTheDocument());
        expect(backend.calls).toEqual([]);
    });

    it("saves a labelled field as the draft, with the definition the server takes", async () => {
        const onReload = vi.fn();
        render(<FormEditorView detail={detail()} kinds={DEFAULT_FIELD_KINDS} onReload={onReload} />);
        fireEvent.click(screen.getByRole("button", { name: /Untitled field/ }));
        fireEvent.change(screen.getByTestId("field-0-name-label"), { target: { value: "Your name" } });
        fireEvent.click(screen.getByTestId("field-0-name-required"));
        /* The preview draws what is typed, saved or not. */
        expect(screen.getByTestId("preview-field-name")).toHaveTextContent("Your name");

        fireEvent.click(screen.getByTestId("form-save"));
        await waitFor(() => expect(onReload).toHaveBeenCalled());
        expect(backend.calls).toHaveLength(1);
        expect(backend.calls[0]).toMatchObject({ method: "PUT", path: "/forms/event-signup/draft" });
        const sent = (backend.calls[0]!.body as { definition: { screens: { fields: unknown[] }[]; consentText: string } }).definition;
        expect(sent.screens[0]!.fields[0]).toEqual({ id: "name", kind: "text", label: "Your name", required: true });
        expect(sent.consentText.length).toBeGreaterThan(0);
    });
});

describe("the powers", () => {
    it("shuts Publish without content.approve and the editor without content.edit", () => {
        perms.held = new Set(["content.view"]);
        render(<FormEditorView detail={detail()} kinds={DEFAULT_FIELD_KINDS} onReload={vi.fn()} />);
        expect(screen.getByTestId("form-publish")).toBeDisabled();
        expect(screen.queryByTestId("form-save")).toBeNull();
        expect(screen.getByText(/editing needs content.edit/)).toBeInTheDocument();
    });
});
