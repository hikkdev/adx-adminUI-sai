import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Package S — the Import tab on every user section, mounting the kit
 * with its party.
 *
 * What is pinned: each page draws its section's tabs with "Import"
 * current, reads the party's own history route (`GET /party-imports/:party`
 * for the four, `GET /publishers/imports` for the publisher) and nothing
 * else at the upload step, names the party in the header, draws the
 * server's format guide for the party (`GET /party-imports/formats/:party`,
 * package U) with the required columns marked, and — with `?id=` — reads
 * that one import under the party and draws its report with the party's
 * grid.
 */

const { backend, router, GUIDE_COLUMNS } = vi.hoisted(() => ({
    backend: { calls: [] as string[] },
    router: { push: vi.fn(), pathname: "/" },
    GUIDE_COLUMNS: {
        publishers: ["name", "mobile", "email", "type", "gstin", "address", "city", "state", "contactName", "contactMobile", "contactEmail", "panNumber"],
        advertisers: ["name", "mobile", "email", "type", "companyName", "industry", "gstin", "panNumber", "address", "city", "state", "contactName"],
        agents: ["name", "mobile", "email", "side", "city", "state"],
        "print-partners": ["name", "mobile", "legalName", "gstin", "panNumber", "contactName", "email", "address", "city", "capabilities", "maxWidthFt", "turnaroundDays"],
        employees: ["name", "mobile", "email", "department", "designation", "region", "workMode", "employmentType"],
    } as Record<string, string[]>,
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: router.push, replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => router.pathname,
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true, baseUrl: "" }, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (party: string, id: string, rows?: unknown[]) => ({
        id,
        party,
        fileName: `${party}-book.csv`,
        note: null,
        uploadedById: "usr_admin",
        status: "VALIDATED",
        rowCount: 2,
        createdCount: 1,
        mergedCount: 0,
        skippedCount: 0,
        warningCount: 0,
        invalidCount: 1,
        createdAt: "2026-09-15T09:00:00.000Z",
        committedAt: null,
        ...(rows ? { rows } : {}),
    });
    /* The guide, as the server derives it from the party's validator — one column per key the kit lists, mobile required. */
    const guide = (kind: string) => ({
        kind,
        title: kind,
        purpose: `A book of ${kind}.`,
        route: `POST /api/v1/party-imports/${kind}`,
        columns: GUIDE_COLUMNS[kind].map((name) => ({ name, required: name === "mobile", type: name === "mobile" ? "mobile" : "text", description: `The ${name}.`, example: "" })),
        rules: ["Nothing refuses the batch."],
        sampleRows: [],
        templateCsvUrl: `/api/v1/party-imports/formats/${kind}/template.csv`,
    });
    const rows = (party: string) => [
        { id: "row_1", rowNumber: 2, data: { name: `First ${party}`, mobile: "9876543210", email: "one@example.in", city: "Bengaluru", side: "PUBLISHER", companyName: "Menon Retail", department: "Ops", panNumber: "ABCDE1234F" }, outcome: "CREATED", targetId: null, targetUserId: null, message: "Will create" },
        { id: "row_2", rowNumber: 3, data: { name: `Second ${party}`, mobile: "" }, outcome: "INVALID", targetId: null, targetUserId: null, message: "mobile is required" },
    ];
    return {
        ...actual,
        api: {
            ...actual.api,
            get: async (path: string) => {
                backend.calls.push(path);
                const format = /^\/party-imports\/formats\/([a-z-]+)$/.exec(path);
                if (format) return guide(format[1]);
                const party = /^\/party-imports\/([a-z-]+)(\?|\/|$)/.exec(path);
                if (party && path.includes("?")) return { items: [record(party[1], `imp_${party[1]}`)], total: 1, page: 1, pageSize: 100, counts: {} };
                if (party) return record(party[1], `imp_${party[1]}`, rows(party[1]));
                if (path === "/publishers/imports") return [{ ...record("publishers", "imp_pub"), party: undefined }];
                if (path === "/publishers/imports/imp_pub") return { ...record("publishers", "imp_pub"), party: undefined, rows: rows("publishers").map(({ targetId, targetUserId: _u, ...row }) => ({ ...row, publisherId: targetId })) };
                throw new Error(`unexpected GET ${path}`);
            },
        },
    };
});

import AdvertisersImportPage from "@/app/(admin)/advertisers/import/page";
import AgentsImportPage from "@/app/(admin)/agents/import/page";
import PrintPartnersImportPage from "@/app/(admin)/print-partners/import/page";
import EmployeesImportPage from "@/app/(admin)/employees/import/page";
import PublishersImportPage from "@/app/(admin)/publishers/import/page";

const PAGES = [
    { party: "advertisers", plural: "advertisers", Page: AdvertisersImportPage, list: "/party-imports/advertisers?page=1&pageSize=100", one: "/party-imports/advertisers/imp_advertisers", column: "companyName", cell: "Menon Retail" },
    { party: "agents", plural: "agents", Page: AgentsImportPage, list: "/party-imports/agents?page=1&pageSize=100", one: "/party-imports/agents/imp_agents", column: "side", cell: "PUBLISHER" },
    { party: "print-partners", plural: "print partners", Page: PrintPartnersImportPage, list: "/party-imports/print-partners?page=1&pageSize=100", one: "/party-imports/print-partners/imp_print-partners", column: "turnaroundDays", cell: "ABCDE1234F" },
    { party: "employees", plural: "employees", Page: EmployeesImportPage, list: "/party-imports/employees?page=1&pageSize=100", one: "/party-imports/employees/imp_employees", column: "employmentType", cell: "Ops" },
    { party: "publishers", plural: "publishers", Page: PublishersImportPage, list: "/publishers/imports", one: "/publishers/imports/imp_pub", column: "contactMobile", cell: "ABCDE1234F" },
] as const;

beforeEach(() => {
    backend.calls = [];
    router.push.mockClear();
});

describe("the Import tab", () => {
    it.each(PAGES)("$party: mounts the kit with its party at the upload step — the tabs, the history read, the guide", async ({ party, plural, Page, list, column }) => {
        router.pathname = `/${party}/import`;
        render(await Page({ searchParams: Promise.resolve({}) }));

        await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(`Import ${plural}`));
        expect(screen.getByRole("link", { name: "Import", current: "page" })).toHaveAttribute("href", `/${party}/import`);

        /* The format guide is the party's own, with the template beside it and mobile marked required. */
        await waitFor(() => expect(screen.getByText(column, { selector: "td" })).toBeInTheDocument());
        expect(backend.calls.sort()).toEqual([list, `/party-imports/formats/${party}`].sort());
        expect(screen.getByText("mobile", { selector: "td" })).toHaveTextContent("required");
        expect(screen.getByRole("button", { name: /Download template/ })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Validate the file" })).toBeDisabled();

        /* The history, from the party's own route. */
        expect(screen.getByText(`${party}-book.csv`)).toBeInTheDocument();
    });

    it.each(PAGES)("$party: with ?id= reads that import under the party and draws its report on the party's grid", async ({ party, Page, list, one, cell }) => {
        router.pathname = `/${party}/import`;
        const id = one.split("/").pop()!;
        render(await Page({ searchParams: Promise.resolve({ id }) }));

        await waitFor(() => expect(screen.getByText("Rows found")).toBeInTheDocument());
        expect(backend.calls.sort()).toEqual([list, one].sort());
        expect(screen.getByRole("button", { name: /Import 1 valid row/ })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Cancel import" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Download report/ })).toBeInTheDocument();

        /* The one invalid row is what opens first, its bad column named; the
           party's own cell shows once every row is in view. */
        expect(screen.getByText("mobile is required")).toBeInTheDocument();
        expect(screen.getByText("Missing")).toBeInTheDocument();
        expect(screen.queryByText(cell)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("tab", { name: /^All/ }));
        expect(screen.getByText(cell)).toBeInTheDocument();
        expect(screen.getByText(`First ${party}`)).toBeInTheDocument();
    });
});
