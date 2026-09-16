import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { tokens } from "@/lib/api-client";
import type { ImportFormat } from "@/services/party-imports";

/**
 * Package U — the File format panel every import screen carries.
 *
 * What is pinned: the panel reads its kind's guide from
 * `GET /party-imports/formats/:kind` and draws the column table (the
 * name, the type, what it takes, the example, the allowed values of an
 * enum, the required mark), the rules, and a Download template button
 * that fetches `/formats/:kind/template.csv` with the bearer token and
 * hands the bytes to the browser — never a plain link, which would carry
 * no Authorization header. Folded, it shows the header and the button
 * and opens on a click.
 */

const { backend } = vi.hoisted(() => ({ backend: { calls: [] as string[] } }));

const GUIDE: ImportFormat = {
    kind: "leads",
    title: "Leads",
    purpose: "A batch of prospects for the field team.",
    route: "POST /api/v1/leads/import — a JSON body { source, rows }",
    columns: [
        { name: "side", required: true, type: "enum", description: "Which side the lead is for.", example: "PUBLISHER", enumValues: ["PUBLISHER", "ADVERTISER"] },
        { name: "businessName", required: true, type: "text", description: "The business.", example: "Sunrise Gym", maxLength: 160 },
        { name: "phone", required: false, type: "text", description: "A phone number, 6–20 characters.", example: "9876543210", maxLength: 20 },
        { name: "estimatedCommission", required: false, type: "money", description: "Omit it and the platform quotes what it pays.", example: "1450" },
    ],
    rules: ["side and businessName are required; the batch carries one source.", "At most 500 rows per batch."],
    sampleRows: [
        { side: "PUBLISHER", businessName: "Sunrise Gym", phone: "9876543210", estimatedCommission: "1450" },
        { side: "ADVERTISER", businessName: "Bake House", phone: "", estimatedCommission: "" },
    ],
    templateCsvUrl: "/api/v1/party-imports/formats/leads/template.csv",
};

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true, baseUrl: "http://api.test/api/v1" }, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        api: {
            ...actual.api,
            get: async (path: string) => {
                backend.calls.push(path);
                if (path === "/party-imports/formats/leads") return GUIDE;
                throw new Error(`unexpected GET ${path}`);
            },
        },
    };
});

import { FormatGuidePanel } from "./format-guide-panel";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
    backend.calls = [];
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:template"), revokeObjectURL: vi.fn() });
    tokens.set({ accessToken: "tok-1" });
});

afterEach(() => {
    vi.unstubAllGlobals();
    tokens.clear();
});

describe("the File format panel", () => {
    it("reads the kind's guide and draws the columns, the required marks, the allowed values and the rules", async () => {
        render(<FormatGuidePanel kind="leads" />);

        await waitFor(() => expect(screen.getByText("businessName", { selector: "td" })).toBeInTheDocument());
        expect(backend.calls).toEqual(["/party-imports/formats/leads"]);

        expect(screen.getByRole("heading", { name: "File format" })).toBeInTheDocument();
        expect(screen.getByText("A batch of prospects for the field team.")).toBeInTheDocument();
        expect(screen.getByText(/4 columns/)).toBeInTheDocument();

        /* The required mark sits on the two required columns and on no other. */
        expect(screen.getByText("side", { selector: "td" })).toHaveTextContent("required");
        expect(screen.getByText("businessName", { selector: "td" })).toHaveTextContent("required");
        expect(screen.getByText("phone", { selector: "td" })).not.toHaveTextContent("required");

        /* The type word, the length cap, the enum values, the example. */
        expect(screen.getByText("One of")).toBeInTheDocument();
        expect(screen.getByText("Amount")).toBeInTheDocument();
        expect(screen.getByText("Text · ≤ 160")).toBeInTheDocument();
        const allowed = screen.getByLabelText("Allowed values for side");
        expect(allowed).toHaveTextContent("PUBLISHER");
        expect(allowed).toHaveTextContent("ADVERTISER");
        expect(screen.getByText("Sunrise Gym")).toBeInTheDocument();

        /* The rules, every one. */
        expect(screen.getByText("At most 500 rows per batch.")).toBeInTheDocument();
        expect(screen.getAllByRole("listitem")).toHaveLength(GUIDE.rules.length);
    });

    it("fetches the template with the token and hands it to the browser, never as a plain link", async () => {
        fetchMock.mockResolvedValue(new Response("side,businessName\nPUBLISHER,Sunrise Gym\n", { status: 200, headers: { "Content-Type": "text/csv" } }));
        render(<FormatGuidePanel kind="leads" />);
        await waitFor(() => expect(screen.getByText("side", { selector: "td" })).toBeInTheDocument());

        expect(screen.queryByRole("link", { name: /template/i })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Download template" }));

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        const [url, init] = fetchMock.mock.calls[0]!;
        expect(url).toBe("http://api.test/api/v1/party-imports/formats/leads/template.csv");
        expect((init?.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok-1");
        await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    });

    it("folded, shows the header and the template button and opens the columns on a click", async () => {
        render(<FormatGuidePanel kind="leads" collapsible />);
        await waitFor(() => expect(backend.calls).toEqual(["/party-imports/formats/leads"]));

        expect(screen.getByRole("button", { name: "Download template" })).toBeInTheDocument();
        expect(screen.queryByText("businessName", { selector: "td" })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /Show the columns/ }));
        await waitFor(() => expect(screen.getByText("businessName", { selector: "td" })).toBeInTheDocument());
        expect(screen.getByRole("button", { name: /Hide the columns/ })).toBeInTheDocument();
    });
});
