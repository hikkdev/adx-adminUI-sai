import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * ST-4 — Settings › Storage, end to end against a mocked backend: the
 * totals and every folder with who can open it, the largest files, the
 * unreferenced list paged and filtered with the day each file becomes
 * removable (never, for a purpose with its own retention), "Check now"
 * behind `system.jobs`, and the removal switch behind `settings.edit` —
 * saved as the one leaf that moved, the grace period held to 7–365, the
 * owner's warning always under it, and a backend without the section
 * answered in words rather than a switch.
 */

const { backend, toast, perms } = vi.hoisted(() => {
    const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        /** What `GET /settings/platform` answers with; the switch lives on `storage`. */
        settings: {} as Record<string, unknown>,
        reset() {
            this.calls = [];
            this.settings = { storage: { removeUnreferenced: false, graceDays: 30 } };
        },
    };
    return { backend, toast, perms: new Set<string>() };
});

vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, isLive: () => true, apiConfig: { ...actual.apiConfig, live: true } };
});

vi.mock("@/lib/auth", () => ({
    useAuth: () => ({ user: { id: "usr_admin", name: "Priya", roles: ["ADMIN"] }, loading: false, can: (id: string) => perms.has(id) }),
}));

const SUMMARY = {
    generatedAt: "2026-09-28T06:30:00.000Z",
    totals: { files: 194, bytes: 630_200_000 },
    byPurpose: [
        { purpose: "KYC", folder: "private/kyc", visibility: "PRIVATE", files: 40, bytes: 90_000_000, unreferencedFiles: 2, unreferencedBytes: 1_000_000 },
        { purpose: "LISTING_PHOTO", folder: "listings", visibility: "PUBLIC", files: 120, bytes: 480_000_000, unreferencedFiles: 6, unreferencedBytes: 12_000_000 },
        { purpose: "VERIFICATION", folder: "private/verification", visibility: "PRIVATE", files: 30, bytes: 60_000_000, unreferencedFiles: 0, unreferencedBytes: 0 },
        { purpose: "BRANDING", folder: "brand", visibility: "PUBLIC", files: 4, bytes: 200_000, unreferencedFiles: 0, unreferencedBytes: 0 },
    ],
    largest: [{ id: "f_big", filename: "diwali-hoarding-master.pdf", purpose: "CAMPAIGN_CREATIVE", mimeType: "application/pdf", sizeBytes: 9_800_000, createdAt: "2026-09-01T12:00:00.000Z", uploadedBy: { id: "usr_1", name: "Ravi Kumar" } }],
    sweep: { lastRunAt: "2026-09-27T21:30:00.000Z", lastMarked: 12, lastRemoved: 0, removeEnabled: false, graceDays: 30, protectedPurposes: ["KYC", "INVOICE"] },
};

const UNREFERENCED = [
    {
        id: "f_front",
        filename: "old-front.jpg",
        purpose: "LISTING_PHOTO",
        mimeType: "image/jpeg",
        sizeBytes: 2_000_000,
        createdAt: "2026-08-01T12:00:00.000Z",
        unreferencedSince: "2026-09-27T12:00:00.000Z",
        removableAt: "2026-10-27T12:00:00.000Z",
        url: "https://cdn.adx.in/uploads/listings/old-front.jpg",
    },
    {
        id: "f_pan",
        filename: "pan.jpg",
        purpose: "KYC",
        mimeType: "image/jpeg",
        sizeBytes: 300_000,
        createdAt: "2026-07-01T12:00:00.000Z",
        unreferencedSince: "2026-09-27T12:00:00.000Z",
        removableAt: null,
        url: "http://localhost:3000/api/v1/files/f_pan",
    },
];

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        /* A check re-stamps the report, the way the server counts afresh on every read. */
        if (method === "GET" && path === "/storage/summary") return backend.calls.some((call) => call.path === "/storage/sweep") ? { ...SUMMARY, generatedAt: "2026-09-28T07:00:00.000Z" } : SUMMARY;
        if (method === "GET" && path.startsWith("/storage/unreferenced")) {
            const query = new URL(path, "http://adx.in").searchParams;
            const purpose = query.get("purpose");
            const items = purpose ? UNREFERENCED.filter((item) => item.purpose === purpose) : UNREFERENCED;
            return { items, total: purpose ? items.length : 30, page: Number(query.get("page")), pageSize: Number(query.get("pageSize")) };
        }
        if (method === "POST" && path === "/storage/sweep") return { checked: 1204, marked: 5, cleared: 1 };
        if (method === "GET" && path === "/settings/platform") return backend.settings;
        return {};
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

import { StorageLoader } from "./storage-loader";
import { REMOVAL_WARNING } from "./storage-view";

const calls = (method: string, prefix: string) => backend.calls.filter((call) => call.method === method && call.path.startsWith(prefix));

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
    toast.error.mockReset();
    perms.clear();
    perms.add("settings.view");
    perms.add("settings.edit");
    perms.add("system.jobs");
});

async function draw() {
    render(<StorageLoader />);
    await screen.findByText("By purpose");
}

describe("Settings › Storage — the report", () => {
    it("draws the totals, every folder with who can open it, the largest files and the last sweep", async () => {
        await draw();
        const totals = screen.getByTestId("storage-totals");
        expect(within(totals).getByText("601.0 MB")).toBeInTheDocument();
        expect(within(totals).getByText("194 files")).toBeInTheDocument();
        expect(within(totals).getByText("8 files nothing refers to")).toBeInTheDocument();

        /* The heaviest folder first, each with its badge and its folder. */
        const photos = screen.getByText("listings").closest("tr")!;
        expect(within(photos).getByText("Listing photos")).toBeInTheDocument();
        expect(within(photos).getByText("Public")).toBeInTheDocument();
        expect(within(photos).getByText("6 · 11.4 MB")).toBeInTheDocument();
        const papers = screen.getByText("private/verification").closest("tr")!;
        expect(within(papers).getByText("Private")).toBeInTheDocument();
        expect(within(papers).getByText("—")).toBeInTheDocument();
        /* A purpose with its own retention says so. */
        expect(screen.getByTestId("storage-purpose-unreferenced-KYC|PRIVATE")).toHaveTextContent("Kept by its own retention rule");
        expect(screen.getByTestId("storage-purpose-unreferenced-LISTING_PHOTO|PUBLIC")).not.toHaveTextContent("retention");

        expect(screen.getByText("diwali-hoarding-master.pdf")).toBeInTheDocument();
        expect(screen.getByText("Ravi Kumar")).toBeInTheDocument();

        expect(screen.getByTestId("storage-last-sweep")).toHaveTextContent(/^Last checked .* · 12 files marked · none removed$/);
        expect(screen.getByTestId("storage-removal-state")).toHaveTextContent("Removal is off: the sweep marks files and removes nothing.");
    });

    it("lists the unreferenced files paged, with the day each becomes removable, and filters by purpose", async () => {
        await draw();
        await screen.findByText("old-front.jpg");
        expect(calls("GET", "/storage/unreferenced").map((call) => call.path)).toEqual(["/storage/unreferenced?page=1&pageSize=25"]);
        expect(screen.getByTestId("storage-removable-f_front")).toHaveTextContent("Removable on 27 Oct 2026");
        expect(screen.getByTestId("storage-removable-f_pan")).toHaveTextContent("Never — kept by its own retention rule");
        /* The file opens through the private-file door: a public one stays a plain link. */
        expect(screen.getByRole("link", { name: "old-front.jpg" })).toHaveAttribute("href", "https://cdn.adx.in/uploads/listings/old-front.jpg");

        expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Next" }));
        await waitFor(() => expect(calls("GET", "/storage/unreferenced").at(-1)?.path).toBe("/storage/unreferenced?page=2&pageSize=25"));

        /* The chips are the folders with something marked that the sweep may remove; picking one starts at its first page. */
        expect(screen.getByRole("tab", { name: /All/ })).toHaveTextContent("All6");
        expect(screen.queryByRole("tab", { name: /Brand files/ })).not.toBeInTheDocument();
        expect(screen.queryByRole("tab", { name: /Publisher KYC/ })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("tab", { name: /Listing photos/ }));
        await waitFor(() => expect(calls("GET", "/storage/unreferenced").at(-1)?.path).toBe("/storage/unreferenced?purpose=LISTING_PHOTO&page=1&pageSize=25"));
        await waitFor(() => expect(screen.queryByText("pan.jpg")).not.toBeInTheDocument());
    });
});

describe("Settings › Storage — Check now", () => {
    it("runs the mark phase, says what it found, and re-reads the report and the list", async () => {
        await draw();
        await screen.findByText("old-front.jpg");
        fireEvent.click(screen.getByTestId("storage-check-now"));
        await waitFor(() => expect(calls("POST", "/storage/sweep")).toHaveLength(1));
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Storage checked", { description: "1,204 files checked · 5 newly unreferenced · 1 referred to again" }));
        await waitFor(() => expect(calls("GET", "/storage/summary")).toHaveLength(2));
        await waitFor(() => expect(calls("GET", "/storage/unreferenced")).toHaveLength(2));
    });

    it("is not offered to a role without system.jobs", async () => {
        perms.delete("system.jobs");
        await draw();
        expect(screen.getByTestId("storage-check-now")).toBeDisabled();
        expect(screen.getByText(/cannot run jobs by hand/)).toBeInTheDocument();
    });
});

describe("Settings › Storage — the removal switch", () => {
    it("saves the switch as the one leaf that moved, holds the grace period to 7–365, and always shows the warning", async () => {
        await draw();
        const toggle = await screen.findByRole("switch", { name: "Remove unreferenced files" });
        expect(screen.getByTestId("storage-warning")).toHaveTextContent(REMOVAL_WARNING);
        expect(REMOVAL_WARNING).toBe("Files nothing on the platform refers to are removed after the grace period. Check the list first.");
        const save = screen.getByRole("button", { name: "Save" });
        expect(save).toBeDisabled();

        const grace = screen.getByLabelText(/Grace period/);
        fireEvent.change(grace, { target: { value: "5" } });
        expect(grace).toHaveAttribute("aria-invalid", "true");
        fireEvent.change(grace, { target: { value: "30" } });

        fireEvent.click(toggle);
        expect(save).toBeEnabled();
        fireEvent.click(save);
        await waitFor(() => expect(calls("PUT", "/settings/platform")).toHaveLength(1));
        expect(calls("PUT", "/settings/platform")[0]!.body).toEqual({ storage: { removeUnreferenced: true } });
        await waitFor(() => expect(toast.success).toHaveBeenCalled());
    });

    it("sends a new grace period alone, and refuses one outside the bounds", async () => {
        await draw();
        await screen.findByRole("switch", { name: "Remove unreferenced files" });
        const grace = screen.getByLabelText(/Grace period/);
        fireEvent.change(grace, { target: { value: "400" } });
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
        fireEvent.change(grace, { target: { value: "45" } });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(calls("PUT", "/settings/platform")[0]?.body).toEqual({ storage: { graceDays: 45 } }));
    });

    it("is read-only to a role without settings.edit", async () => {
        perms.delete("settings.edit");
        await draw();
        expect(await screen.findByRole("switch", { name: "Remove unreferenced files" })).toBeDisabled();
        expect(screen.getByLabelText(/Grace period/)).toBeDisabled();
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
        expect(screen.getByText(/that needs Edit settings/)).toBeInTheDocument();
    });

    it("says so when the backend does not serve the storage section, and draws no switch", async () => {
        backend.settings = {};
        await draw();
        expect(await screen.findByText(/does not serve the/)).toBeInTheDocument();
        expect(screen.queryByRole("switch")).not.toBeInTheDocument();
        /* The protected purposes are named either way. */
        expect(screen.getByText(/Never removed by the sweep/)).toHaveTextContent("Publisher KYC, Invoices");
    });
});
