import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * PB-1: the Studio index. What is pinned: "Only admins can change the
 * addresses" — the Change address door is shut with the reason for a role
 * without `content.addresses`, and for the home page whatever the role;
 * with the power, the dialog previews the move, refuses a bad address, and
 * writes the path with a permanent redirect promised; a row opens in
 * Studio; New page suggests the key and the address from the title and
 * opens Studio on the page it made.
 */

const { backend, perms, studio } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string; body?: unknown }[],
        reset() {
            this.calls = [];
        },
        async handle(method: string, path: string, body?: unknown) {
            this.calls.push({ method, path, body });
            if (method === "PATCH" && path.startsWith("/site/pages/")) return { key: path.split("/")[3], path: (body as { path: string }).path };
            if (method === "POST" && path === "/site/pages") return { ...(body as Record<string, unknown>), id: "pg_new" };
            throw new Error(`No route ${method} ${path}`);
        },
    },
    perms: { held: new Set<string>() },
    studio: { opened: [] as unknown[] },
}));

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

vi.mock("@/lib/studio", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/studio")>();
    return { ...actual, openStudio: (target: unknown) => studio.opened.push(target) };
});

import type { SitePageRow } from "@/services/site-pages";
import { ADDRESS_LOCKED_SENTENCE, ADDRESS_PERMISSION_SENTENCE, PagesView } from "./pages-view";

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
    draft: null,
    updatedAt: "2026-09-27T09:00:00.000Z",
    redirectCount: 1,
    ...over,
});

const home = row({ id: "pg_home", key: "home", kind: "SYSTEM", title: "Home", path: "/", internalPath: "/", surface: "WEB_HOME", addressLocked: true, redirectCount: 0 });

beforeEach(() => {
    backend.reset();
    perms.held = new Set(["content.view", "content.edit", "content.approve", "content.delete"]);
    studio.opened = [];
});

/** Radix opens a menu on Enter at the trigger — the one key jsdom can press without pointer capture. */
function openMenu(key: string) {
    fireEvent.keyDown(screen.getByTestId(`page-more-${key}`), { key: "Enter" });
}

describe("changing an address", () => {
    it("is shut, with the reason, for a role without content.addresses", async () => {
        render(<PagesView pages={[row()]} redirects={[]} onChanged={vi.fn()} />);
        openMenu("diwali-2026");
        const item = await screen.findByTestId("page-address-diwali-2026");
        expect(item).toHaveAttribute("aria-disabled", "true");
        expect(item).toHaveTextContent(ADDRESS_PERMISSION_SENTENCE);
    });

    it("is shut for the home page whatever the role", async () => {
        perms.held.add("content.addresses");
        render(<PagesView pages={[home]} redirects={[]} onChanged={vi.fn()} />);
        openMenu("home");
        const item = await screen.findByTestId("page-address-home");
        expect(item).toHaveAttribute("aria-disabled", "true");
        expect(item).toHaveTextContent(ADDRESS_LOCKED_SENTENCE);
    });

    it("previews the move, refuses a bad address, and writes the path with the redirect promised", async () => {
        perms.held.add("content.addresses");
        const onChanged = vi.fn();
        render(<PagesView pages={[row(), home]} redirects={[{ id: "rd_1", fromPath: "/old-diwali", toPath: "/diwali-offers", permanent: true, reason: "ADDRESS_CHANGE", page: null, createdAt: "2026-09-27T00:00:00.000Z" }]} onChanged={onChanged} />);
        openMenu("diwali-2026");
        fireEvent.click(await screen.findByTestId("page-address-diwali-2026"));
        const input = await screen.findByTestId("change-address-path");
        expect(input).toHaveValue("/diwali-offers");
        expect(screen.getByTestId("change-address-submit")).toBeDisabled();

        fireEvent.change(input, { target: { value: "/api/diwali" } });
        expect(screen.getByTestId("change-address-line")).toHaveTextContent("kept by the website");
        fireEvent.change(input, { target: { value: "/old-diwali" } });
        expect(screen.getByTestId("change-address-line")).toHaveTextContent("already answers this address");
        fireEvent.change(input, { target: { value: "/diwali" } });
        expect(screen.getByTestId("change-address-line")).toHaveTextContent("/diwali-offers → /diwali — a permanent redirect will be kept.");

        fireEvent.click(screen.getByTestId("change-address-submit"));
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.calls).toEqual([{ method: "PATCH", path: "/site/pages/diwali-2026", body: { path: "/diwali" } }]);
    });
});

describe("Studio", () => {
    it("opens a row in Studio by its key", () => {
        render(<PagesView pages={[row()]} redirects={[]} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByTestId("page-studio-diwali-2026"));
        expect(studio.opened).toEqual([{ kind: "page", key: "diwali-2026" }]);
    });

    it("makes a page from a title — key and address suggested — and opens Studio on it", async () => {
        const onChanged = vi.fn();
        render(<PagesView pages={[home]} redirects={[]} onChanged={onChanged} />);
        fireEvent.click(screen.getByTestId("pages-new"));
        fireEvent.change(await screen.findByTestId("new-page-title"), { target: { value: "Holi Colours 2027" } });
        expect(screen.getByTestId("new-page-key")).toHaveValue("holi-colours-2027");
        expect(screen.getByTestId("new-page-path")).toHaveValue("/holi-colours-2027");

        fireEvent.change(screen.getByTestId("new-page-key"), { target: { value: "home" } });
        expect(screen.getByTestId("new-page-key-hint")).toHaveTextContent("already a page");
        fireEvent.change(screen.getByTestId("new-page-key"), { target: { value: "holi-2027" } });
        expect(screen.getByTestId("new-page-path")).toHaveValue("/holi-2027");

        fireEvent.click(screen.getByTestId("new-page-submit"));
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.calls).toEqual([{ method: "POST", path: "/site/pages", body: { key: "holi-2027", title: "Holi Colours 2027", path: "/holi-2027", channels: ["WEBSITE"], template: "blank" } }]);
        expect(studio.opened).toEqual([{ kind: "page", key: "holi-2027" }]);
    });

    it("offers New page only to content.edit", () => {
        perms.held = new Set(["content.view"]);
        render(<PagesView pages={[row()]} redirects={[]} onChanged={vi.fn()} />);
        expect(screen.queryByTestId("pages-new")).toBeNull();
    });
});
