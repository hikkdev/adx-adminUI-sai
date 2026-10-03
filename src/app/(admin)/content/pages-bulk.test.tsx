import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Pages › bulk (28 Sep 2026). What is pinned: each page publishes through
 * the door its versions live behind (a site page through its layout
 * surface, a Studio page through its key) with the one change note; rows an
 * action does not apply to are skipped and counted up front, not failed; a
 * partial failure names the page and the API's message, keeps that page
 * selected and lets the rest go, and the desk reloads once; an action the
 * role lacks is shut with the power it needs.
 */

const { backend, perms, toast } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string; body?: unknown }[],
        refuse: new Map<string, string>(),
        reset() {
            this.calls = [];
            this.refuse = new Map();
        },
        async handle(method: string, path: string, body?: unknown) {
            this.calls.push({ method, path, body });
            const refusal = this.refuse.get(`${method} ${path}`);
            if (refusal) throw new Error(refusal);
            return { number: 3 };
        },
    },
    perms: { held: new Set<string>() },
    toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true, siteUrl: "https://adx.in" } };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        try {
            return await backend.handle(method, path, body);
        } catch (cause) {
            throw new actual.ApiError(409, "CONFLICT", (cause as Error).message);
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
vi.mock("@/lib/studio", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/studio")>()), openStudio: vi.fn() }));

import type { SitePageRow } from "@/services/site-pages";
import { PAGE_BULK_BLOCKED, pageSkip } from "./pages-bulk";
import { PagesView } from "./pages-view";

const row = (over: Partial<SitePageRow> = {}): SitePageRow => ({
    id: "pg_1",
    key: "diwali-2026",
    kind: "CUSTOM",
    title: "Diwali offers",
    path: "/diwali-offers",
    internalPath: null,
    surface: null,
    channels: ["WEBSITE"],
    addressLocked: false,
    archivedAt: null,
    live: { number: 2, publishedAt: "2026-09-27T09:00:00.000Z" },
    draft: { number: 3, updatedAt: "2026-09-28T09:00:00.000Z" },
    updatedAt: "2026-09-28T09:00:00.000Z",
    redirectCount: 0,
    ...over,
});

const home = row({ id: "pg_home", key: "home", kind: "SYSTEM", title: "Home", path: "/", internalPath: "/", surface: "WEB_HOME", addressLocked: true });
const diwali = row();
const holi = row({ id: "pg_2", key: "holi-2027", title: "Holi colours", path: "/holi", draft: null });

beforeEach(() => {
    backend.reset();
    perms.held = new Set(["content.view", "content.edit", "content.approve", "content.delete"]);
    for (const fn of Object.values(toast)) fn.mockReset();
});

const checkboxOf = (key: string) => within(screen.getByTestId(`page-open-${key}`).closest("tr")!).getByRole("checkbox");

function selectAll() {
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all rows" }));
}

describe("publishing drafts", () => {
    it("publishes a site page through its surface and a Studio page through its key, with the one note, skipping a page with no draft", async () => {
        const onChanged = vi.fn();
        render(<PagesView pages={[home, diwali, holi]} redirects={[]} onChanged={onChanged} />);
        selectAll();
        expect(screen.getByText("3 selected")).toBeInTheDocument();

        fireEvent.click(screen.getByTestId("bulk-publish"));
        const dialog = await screen.findByRole("alertdialog");
        expect(within(dialog).getByText("Publish 2 drafts?")).toBeInTheDocument();
        expect(within(dialog).getByText(/^2 will be published, 1 skipped \(no draft\)\./)).toBeInTheDocument();
        fireEvent.change(within(dialog).getByTestId("bulk-publish-note"), { target: { value: "Festive banners" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Publish 2 drafts" }));

        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
        expect(backend.calls).toEqual([
            { method: "POST", path: "/layouts/WEB_HOME/publish", body: { changeNote: "Festive banners" } },
            { method: "POST", path: "/site/pages/diwali-2026/publish", body: { changeNote: "Festive banners" } },
        ]);
        expect(toast.success).toHaveBeenCalledWith("2 published", undefined);
        // Everything went through: the selection is let go.
        expect(screen.queryByText(/selected$/)).toBeNull();
    });

    it("keeps a page that failed selected, names it with the API's message, and lets the rest go", async () => {
        backend.refuse.set("POST /site/pages/diwali-2026/publish", "“diwali-2026” is archived — restore it first");
        const onChanged = vi.fn();
        render(<PagesView pages={[home, diwali]} redirects={[]} onChanged={onChanged} />);
        selectAll();
        fireEvent.click(screen.getByTestId("bulk-publish"));
        fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Publish 2 drafts" }));

        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
        expect(toast.warning).toHaveBeenCalledWith(
            "1 published · 1 failed: “diwali-2026” is archived — restore it first",
            expect.objectContaining({ description: "Diwali offers — “diwali-2026” is archived — restore it first" }),
        );
        expect(checkboxOf("diwali-2026")).toHaveAttribute("data-state", "checked");
        expect(checkboxOf("home")).toHaveAttribute("data-state", "unchecked");
        expect(screen.getByText("1 selected")).toBeInTheDocument();
    });

    it("discards through the same two doors", async () => {
        render(<PagesView pages={[home, diwali]} redirects={[]} onChanged={vi.fn()} />);
        selectAll();
        fireEvent.click(screen.getByTestId("bulk-discard"));
        fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Discard 2 drafts" }));
        await waitFor(() => expect(backend.calls).toHaveLength(2));
        expect(backend.calls.map((call) => `${call.method} ${call.path}`)).toEqual(["DELETE /layouts/WEB_HOME/draft", "DELETE /site/pages/diwali-2026/draft"]);
    });
});

describe("Studio-page-only actions", () => {
    it("archives the Studio pages and skips the site's own, saying so up front", async () => {
        render(<PagesView pages={[home, diwali]} redirects={[]} onChanged={vi.fn()} />);
        selectAll();
        fireEvent.click(screen.getByTestId("bulk-archive"));
        const dialog = await screen.findByRole("alertdialog");
        expect(within(dialog).getByText(/^1 will be archived, 1 skipped \(a site page\)\./)).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole("button", { name: "Archive 1 page" }));
        await waitFor(() => expect(backend.calls).toEqual([{ method: "POST", path: "/site/pages/diwali-2026/archive", body: {} }]));
    });

    it("moves where Studio pages are read, leaving the site's pages and the ones already there", async () => {
        const both = row({ id: "pg_3", key: "careers", title: "Careers", channels: ["APPS", "WEBSITE"] });
        render(<PagesView pages={[home, diwali, both]} redirects={[]} onChanged={vi.fn()} />);
        selectAll();
        fireEvent.keyDown(screen.getByTestId("bulk-menu-read-on"), { key: "Enter" });
        fireEvent.click(await screen.findByTestId("bulk-channels-both"));
        const dialog = await screen.findByRole("alertdialog");
        expect(within(dialog).getByText(/^1 will be put on Website \+ apps, 1 skipped \(a site page — always the website\), 1 skipped \(already there\)\./)).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole("button", { name: "Put 1 page on Website + apps" }));
        await waitFor(() => expect(backend.calls).toEqual([{ method: "PATCH", path: "/site/pages/diwali-2026", body: { channels: ["WEBSITE", "APPS"] } }]));
    });

    it("offers no address change in bulk", () => {
        render(<PagesView pages={[diwali]} redirects={[]} onChanged={vi.fn()} />);
        selectAll();
        expect(screen.queryByText(/address/i, { selector: "[data-testid^='bulk-']" })).toBeNull();
    });
});

describe("permissions", () => {
    it("shuts each action the role lacks, naming the power", () => {
        perms.held = new Set(["content.view", "content.edit"]);
        render(<PagesView pages={[home, diwali]} redirects={[]} onChanged={vi.fn()} />);
        selectAll();
        expect(screen.getByTestId("bulk-publish")).toBeDisabled();
        expect(screen.getByTestId("bulk-publish")).toHaveAttribute("title", PAGE_BULK_BLOCKED.publish);
        expect(screen.getByTestId("bulk-discard")).toHaveAttribute("title", PAGE_BULK_BLOCKED.discard);
        expect(screen.getByTestId("bulk-archive")).toBeDisabled();
        expect(screen.getByTestId("bulk-restore")).toBeEnabled();
    });

    it("skips rather than fails — the rules, row by row", () => {
        expect(pageSkip.publish(home)).toBeNull();
        expect(pageSkip.publish(holi)).toBe("no draft");
        expect(pageSkip.publish(row({ archivedAt: "2026-09-01T00:00:00.000Z" }))).toBe("archived");
        expect(pageSkip.archive(home)).toBe("a site page");
        expect(pageSkip.restore(diwali)).toBe("not archived");
        expect(pageSkip.channels(["WEBSITE"])(diwali)).toBe("already there");
        expect(pageSkip.channels(["APPS"])(diwali)).toBeNull();
    });
});
