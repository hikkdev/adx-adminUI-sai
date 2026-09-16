import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Package U — the Listings section's Import tab: a publisher's listings
 * or rate card on the party import kit.
 *
 * What is pinned: without a kind the page offers the two; with a kind and
 * no publisher the upload is gated on the picker (the roster search over
 * `GET /publishers?q=`), and picking one renames the URL; with a
 * publisher the header names them (`GET /publishers/:id`), the history is
 * read under `?publisherId=` and the upload opens; a committed listings
 * report draws the map-pin and duplicate counts and "Send the agreement"
 * over `POST /supply/attempts/:id/request-acceptance`; a rate-card report
 * draws the rate before → after and the below-floor flag.
 */

const { backend, router } = vi.hoisted(() => ({
    backend: { gets: [] as string[], posts: [] as string[] },
    router: { push: vi.fn(), pathname: "/listings/import" },
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

vi.mock("@/lib/use-debounced", () => ({ useDebounced: <T,>(value: T) => value }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const publisher = { id: "pub_1", displayId: "ADX-PUB-0001", name: "Metro Spaces", mobile: "9876543210", city: "Pune", type: "BUSINESS", kycStatus: "PENDING", agentId: null, createdAt: "2026-09-01T00:00:00.000Z", listings: [] };
    const record = (party: string, id: string, extra: Record<string, unknown> = {}) => ({
        id,
        party,
        fileName: `${party}.csv`,
        note: null,
        uploadedById: "usr_admin",
        status: "VALIDATED",
        rowCount: 3,
        createdCount: 2,
        mergedCount: 0,
        skippedCount: 0,
        warningCount: 1,
        invalidCount: 1,
        createdAt: "2026-09-15T09:00:00.000Z",
        committedAt: null,
        publisherId: "pub_1",
        attemptId: null,
        ...extra,
    });
    const listingRows = [
        { id: "row_1", rowNumber: 2, data: { title: "FC Road Hoarding", category: "OUTDOOR", address: "44, FC Road", city: "Pune", ratePerDayResolved: "1200.00", latitude: "18.5", longitude: "73.8", plan: { action: "CREATE", warnings: [] } }, outcome: "CREATED", targetId: "lst_1", targetUserId: null, message: "Will create under the batch's agreement" },
        { id: "row_2", rowNumber: 3, data: { title: "Station Screen", category: "TRANSIT", address: "1, Station Road", city: "Pune", ratePerDayResolved: "3000.00", plan: { action: "CREATE", warnings: ["No coordinates — place it on the map before publishing", "Possible duplicate of ADX-LST-0009 — another publisher's spot 12 m away"] } }, outcome: "WARNING", targetId: "lst_2", targetUserId: null, message: "Will create under the batch's agreement; No coordinates — place it on the map before publishing. Possible duplicate of ADX-LST-0009 — another publisher's spot 12 m away" },
        { id: "row_3", rowNumber: 4, data: { title: "", category: "OUTDOOR", address: "x", plan: null }, outcome: "INVALID", targetId: null, targetUserId: null, message: "title: Required" },
    ];
    const rateRows = [
        { id: "row_1", rowNumber: 2, data: { listing: "ADX-LST-00042", ratePerDay: "1800", plan: { action: "SET", targetId: "lst_1", ratePerDay: "1800.00", from: "1200.00", warnings: [] } }, outcome: "MERGED", targetId: "lst_1", targetUserId: null, message: "Will set ADX-LST-00042: 1200.00 → 1800.00/day" },
        { id: "row_2", rowNumber: 3, data: { listing: "MS-0042", ratePerDay: "400", plan: { action: "SET", targetId: "lst_2", ratePerDay: "400.00", from: null, warnings: ["Rate 400.00/day is below the ADX floor 900.00/day; the publish gate will hold it until ADX signs the price off"] } }, outcome: "WARNING", targetId: "lst_2", targetUserId: null, message: "Will set MS-0042: unpriced → 400.00/day. Rate 400.00/day is below the ADX floor 900.00/day; the publish gate will hold it until ADX signs the price off" },
    ];
    const guide = (kind: string) => ({ kind, title: kind, purpose: "", route: "", columns: [{ name: "title", required: true, type: "text", description: "", example: "" }], rules: [], sampleRows: [], templateCsvUrl: "" });
    return {
        ...actual,
        api: {
            ...actual.api,
            get: async (path: string) => {
                backend.gets.push(path);
                if (path.startsWith("/party-imports/formats/")) return guide(path.split("/").pop()!);
                if (path.startsWith("/publishers?q=")) return { items: [publisher], total: 1, page: 1, pageSize: 8, counts: {} };
                if (path === "/publishers/pub_1") return publisher;
                if (path.startsWith("/party-imports/listings?")) return { items: [record("LISTING", "imp_l")], total: 1, page: 1, pageSize: 100, counts: {} };
                if (path.startsWith("/party-imports/rate-card?")) return { items: [record("RATE_CARD", "imp_r")], total: 1, page: 1, pageSize: 100, counts: {} };
                if (path === "/party-imports/listings/imp_l") return record("LISTING", "imp_l", { status: "COMMITTED", committedAt: "2026-09-15T10:00:00.000Z", attemptId: "att_1", rows: listingRows });
                if (path === "/party-imports/rate-card/imp_r") return record("RATE_CARD", "imp_r", { createdCount: 0, mergedCount: 2, invalidCount: 0, rowCount: 2, rows: rateRows });
                throw new Error(`unexpected GET ${path}`);
            },
            post: async (path: string) => {
                backend.posts.push(path);
                if (path === "/supply/attempts/att_1/request-acceptance") return { ok: true };
                throw new Error(`unexpected POST ${path}`);
            },
        },
    };
});

import ImportListingsPage from "./page";

const params = (query: Record<string, string>) => ({ searchParams: Promise.resolve(query) });

beforeEach(() => {
    backend.gets = [];
    backend.posts = [];
    router.push.mockClear();
});

describe("the Listings section's Import tab", () => {
    it("offers the two kinds when none is chosen, under the section's tabs", async () => {
        render(await ImportListingsPage(params({})));
        expect(screen.getByRole("link", { name: "Import", current: "page" })).toHaveAttribute("href", "/listings/import");
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Import for a publisher");
        expect(screen.getByRole("link", { name: /^Listings A publisher/ })).toHaveAttribute("href", "/listings/import?kind=listings");
        expect(screen.getByRole("link", { name: /^Rate card/ })).toHaveAttribute("href", "/listings/import?kind=rate-card");
        expect(backend.gets).toEqual([]);
    });

    it("gates the upload on the publisher picker, and picking one renames the URL", async () => {
        render(await ImportListingsPage(params({ kind: "listings" })));
        await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Import listings"));

        /* No publisher: the history is read for every publisher, the upload is closed, the guide still stands. */
        await waitFor(() => expect(screen.getByTestId("upload-gated")).toBeInTheDocument());
        expect(screen.queryByRole("button", { name: "Validate the file" })).not.toBeInTheDocument();
        expect(backend.gets).toContain("/party-imports/listings?page=1&pageSize=100");
        expect(backend.gets).toContain("/party-imports/formats/listings");
        expect(backend.gets.some((path) => path.startsWith("/publishers/"))).toBe(false);

        /* The roster search, and the pick. */
        fireEvent.change(screen.getByLabelText("Publisher"), { target: { value: "Metro" } });
        await waitFor(() => expect(screen.getByRole("option", { name: /Metro Spaces/ })).toBeInTheDocument());
        expect(backend.gets.some((path) => path.startsWith("/publishers?q=Metro"))).toBe(true);
        fireEvent.click(screen.getByRole("option", { name: /Metro Spaces/ }));
        expect(router.push).toHaveBeenCalledWith("/listings/import?kind=listings&publisherId=pub_1");
    });

    it("with a publisher, names them in the header, reads the history under them and opens the upload", async () => {
        render(await ImportListingsPage(params({ kind: "rate-card", publisherId: "pub_1" })));
        await waitFor(() => expect(screen.getByRole("button", { name: "Validate the file" })).toBeDisabled());

        expect(backend.gets).toContain("/party-imports/rate-card?publisherId=pub_1&page=1&pageSize=100");
        expect(backend.gets).toContain("/publishers/pub_1");
        expect(screen.getByText(/for Metro Spaces · ADX-PUB-0001/)).toBeInTheDocument();
        expect(screen.queryByTestId("upload-gated")).not.toBeInTheDocument();
        /* The chip carries the pick with a way back to the picker. */
        expect(screen.getByRole("button", { name: "Change the publisher" })).toBeInTheDocument();
    });

    it("a committed listings report: the map pins, the possible duplicates, and Send the agreement over the attempt", async () => {
        render(await ImportListingsPage(params({ kind: "listings", publisherId: "pub_1", id: "imp_l" })));
        await waitFor(() => expect(screen.getByText("Rows found")).toBeInTheDocument());
        expect(backend.gets).toContain("/party-imports/listings/imp_l");

        /* Two creates, one with a pin and one to place by hand; one within 25 m of another publisher's spot. */
        expect(screen.getByText("Map pins")).toBeInTheDocument();
        expect(screen.getByText("1 / 2")).toBeInTheDocument();
        expect(screen.getByText(/1 to place on the map before publishing/)).toBeInTheDocument();
        expect(screen.getByText("Possible duplicates")).toBeInTheDocument();

        /* The agreement over the attempt the commit opened. */
        const card = screen.getByTestId("agreement-card");
        expect(card).toHaveTextContent("Open the attempt");
        expect(screen.getByRole("link", { name: "Open the attempt" })).toHaveAttribute("href", "/listings/attempts/att_1");
        fireEvent.click(screen.getByRole("button", { name: "Send the agreement" }));
        await waitFor(() => expect(backend.posts).toEqual(["/supply/attempts/att_1/request-acceptance"]));
        await waitFor(() => expect(screen.getByRole("button", { name: "Agreement sent" })).toBeDisabled());

        /* The grid's own cells: the pin column, every row in view. */
        fireEvent.click(screen.getByRole("tab", { name: /^All/ }));
        expect(screen.getByText("Place by hand")).toBeInTheDocument();
        expect(screen.getByText("Given")).toBeInTheDocument();
        expect(screen.getByText("₹1,200.00")).toBeInTheDocument();
    });

    it("a rate-card report: the rate before → after per row and the below-floor flag", async () => {
        render(await ImportListingsPage(params({ kind: "rate-card", publisherId: "pub_1", id: "imp_r" })));
        await waitFor(() => expect(screen.getByText("Rows found")).toBeInTheDocument());

        expect(screen.getByText("Rates to set")).toBeInTheDocument();
        expect(screen.getByText("Below the ADX floor")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Import 2 valid rows/ })).toBeInTheDocument();

        const cells = screen.getAllByText("₹1,800.00");
        expect(cells.length).toBeGreaterThan(0);
        expect(screen.getByText("₹1,200.00")).toBeInTheDocument();
        expect(screen.getByText("unpriced")).toBeInTheDocument();
        expect(screen.getByText("₹400.00")).toBeInTheDocument();
        expect(screen.getByText("Below floor")).toBeInTheDocument();
        expect(screen.getByText("ADX-LST-00042")).toBeInTheDocument();
    });
});
