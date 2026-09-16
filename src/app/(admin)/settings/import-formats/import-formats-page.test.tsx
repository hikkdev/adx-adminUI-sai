import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { FORMAT_KINDS, type ImportFormat } from "@/services/party-imports";

/**
 * Package U — Settings › Import formats: every import kind's guide in one
 * place. What is pinned: the page reads `GET /party-imports/formats`
 * once, draws one card per kind the server answers — all ten — each with
 * its columns, its Download template button and a link to the screen
 * where that file is uploaded; and the Settings tab is current.
 */

const { backend } = vi.hoisted(() => ({ backend: { calls: [] as string[] } }));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/settings/import-formats",
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true, baseUrl: "" }, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const format = (kind: string): ImportFormat => ({
        kind: kind as ImportFormat["kind"],
        title: `Title of ${kind}`,
        purpose: `What ${kind} is for.`,
        route: `POST /api/v1/${kind}`,
        columns: [
            { name: `${kind}Key`, required: true, type: "text", description: "The key.", example: "x" },
            { name: `${kind}Extra`, required: false, type: "number", description: "Extra.", example: "1" },
        ],
        rules: [`Rule of ${kind}.`],
        sampleRows: [{}, {}],
        templateCsvUrl: `/api/v1/party-imports/formats/${kind}/template.csv`,
    });
    return {
        ...actual,
        api: {
            ...actual.api,
            get: async (path: string) => {
                backend.calls.push(path);
                if (path === "/party-imports/formats") return FORMAT_KINDS.map(format);
                throw new Error(`unexpected GET ${path}`);
            },
        },
    };
});

import ImportFormatsPage from "./page";

beforeEach(() => {
    backend.calls = [];
});

describe("Settings › Import formats", () => {
    it("lists every kind's guide from one read, each with its columns, template and import screen", async () => {
        render(<ImportFormatsPage />);
        await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Import formats"));
        await waitFor(() => expect(screen.getByTestId("format-finance-reconciliation")).toBeInTheDocument());
        expect(backend.calls).toEqual(["/party-imports/formats"]);

        expect(screen.getByRole("link", { name: "Import formats", current: "page" })).toHaveAttribute("href", "/settings/import-formats");
        expect(screen.getByText(/10 kinds/)).toBeInTheDocument();

        for (const kind of FORMAT_KINDS) {
            const card = screen.getByTestId(`format-${kind}`);
            expect(card).toHaveTextContent(`Title of ${kind}`);
            expect(card).toHaveTextContent(`${kind}Key`);
            expect(card).toHaveTextContent(`Rule of ${kind}.`);
        }
        expect(screen.getAllByRole("button", { name: "Download template" })).toHaveLength(FORMAT_KINDS.length);

        /* The jump list and the way to each import screen. */
        expect(screen.getByRole("navigation", { name: "Import kinds" }).querySelectorAll("a")).toHaveLength(FORMAT_KINDS.length);
        expect(screen.getByRole("link", { name: /Listings \/ Import \/ Rate card/ })).toHaveAttribute("href", "/listings/import?kind=rate-card");
        expect(screen.getByRole("link", { name: /Finance \/ Reconciliation/ })).toHaveAttribute("href", "/finance/reconciliation");
    });
});
