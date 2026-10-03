import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Articles › bulk (28 Sep 2026). What is pinned: articles are selected in
 * the rail; "Publish latest draft" publishes the draft waiting on each (the
 * newest version, when it is a draft — never an older one behind a live
 * version) and skips an article with none; "Take down" unpublishes the live
 * version; a failure stays selected; publishing is shut without
 * content.approve.
 */

const { backend, perms, toast } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string }[],
        refuse: new Set<string>(),
        reset() {
            this.calls = [];
            this.refuse = new Set();
        },
        async handle(method: string, path: string) {
            this.calls.push({ method, path });
            if (this.refuse.has(`${method} ${path}`)) throw new Error("Only a draft may be published");
            return {};
        },
    },
    perms: { held: new Set<string>() },
    toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = (method: string) => async (path: string) => {
        try {
            return await backend.handle(method, path);
        } catch (cause) {
            throw new actual.ApiError(409, "CONFLICT", (cause as Error).message);
        }
    };
    return { ...actual, api: { get: wrap("GET"), post: wrap("POST"), patch: wrap("PATCH"), put: wrap("PUT"), delete: wrap("DELETE") } };
});
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ can: (id: string) => perms.held.has(id), user: null }) }));
vi.mock("@/lib/studio", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/studio")>()), openStudio: vi.fn() }));

import { latestDraft, type ContentPage } from "@/services/content";
import { ARTICLE_BULK_BLOCKED, ContentView } from "./content-view";

const version = (over: Partial<ContentPage>): ContentPage => ({
    id: "cnt_1",
    slug: "how-it-works",
    version: 1,
    category: "PAGE",
    title: "How it works",
    summary: null,
    body: "…",
    surfaces: ["WEBSITE"],
    tags: [],
    seoTitle: null,
    seoDescription: null,
    sortOrder: 0,
    isActive: false,
    publishedAt: null,
    retiredAt: null,
    createdByUserId: null,
    changeNote: null,
    createdAt: "2026-09-24T09:00:00.000Z",
    updatedAt: "2026-09-24T09:00:00.000Z",
    state: "DRAFT",
    ...over,
});

// How it works: v1 live, v2 a draft waiting.
const howLive = version({ id: "hiw_1", version: 1, isActive: true, publishedAt: "2026-09-24T10:00:00.000Z", state: "PUBLISHED" });
const howDraft = version({ id: "hiw_2", version: 2 });
// Careers: v1 live, nothing waiting.
const careers = version({ id: "car_1", slug: "careers", title: "Careers", isActive: true, publishedAt: "2026-09-24T10:00:00.000Z", state: "PUBLISHED" });
// Refunds: a lone draft.
const refunds = version({ id: "ref_1", slug: "refunds", title: "Refunds", category: "HELP" });

beforeEach(() => {
    backend.reset();
    perms.held = new Set(["content.view", "content.edit", "content.approve", "content.delete"]);
    for (const fn of Object.values(toast)) fn.mockReset();
});

describe("the rail's selection", () => {
    it("publishes the draft waiting on each article and skips one with none", async () => {
        const onChanged = vi.fn();
        render(<ContentView pages={[howLive, howDraft, careers, refunds]} onChanged={onChanged} />);
        fireEvent.click(screen.getByTestId("content-select-how-it-works"));
        fireEvent.click(screen.getByTestId("content-select-careers"));
        fireEvent.click(screen.getByTestId("content-select-refunds"));
        expect(within(screen.getByTestId("bulk-bar")).getByText("3 selected")).toBeInTheDocument();

        fireEvent.click(screen.getByTestId("bulk-publish"));
        const dialog = await screen.findByRole("alertdialog");
        expect(within(dialog).getByText(/^2 will be published, 1 skipped \(no draft\)\./)).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole("button", { name: "Publish 2 drafts" }));

        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
        expect(backend.calls).toEqual([
            { method: "POST", path: "/content/pages/hiw_2/publish" },
            { method: "POST", path: "/content/pages/ref_1/publish" },
        ]);
        expect(screen.queryByTestId("bulk-bar")).toBeNull();
    });

    it("keeps an article that failed selected", async () => {
        backend.refuse.add("POST /content/pages/car_1/unpublish");
        render(<ContentView pages={[howLive, howDraft, careers]} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByTestId("content-select-how-it-works"));
        fireEvent.click(screen.getByTestId("content-select-careers"));
        fireEvent.click(screen.getByTestId("bulk-take-down"));
        fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Take down 2 articles" }));

        await waitFor(() => expect(toast.warning).toHaveBeenCalledWith("1 taken down · 1 failed: Only a draft may be published", expect.objectContaining({ description: "Careers — Only a draft may be published" })));
        expect(screen.getByTestId("content-select-careers")).toHaveAttribute("data-state", "checked");
        expect(screen.getByTestId("content-select-how-it-works")).toHaveAttribute("data-state", "unchecked");
    });

    it("never takes an older draft behind a live version for the waiting one", () => {
        const olderDraft = version({ id: "x_1", version: 1 });
        const newerLive = version({ id: "x_2", version: 2, isActive: true, state: "PUBLISHED", publishedAt: "2026-09-25T00:00:00.000Z" });
        expect(latestDraft({ versions: [newerLive, olderDraft] })).toBeNull();
        expect(latestDraft({ versions: [howDraft, howLive] })).toBe(howDraft);
    });

    it("shuts publishing without content.approve", () => {
        perms.held = new Set(["content.view", "content.edit"]);
        render(<ContentView pages={[howLive, howDraft]} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByTestId("content-select-how-it-works"));
        expect(screen.getByTestId("bulk-publish")).toBeDisabled();
        expect(screen.getByTestId("bulk-publish")).toHaveAttribute("title", ARTICLE_BULK_BLOCKED.publish);
        expect(screen.getByTestId("bulk-discard")).toHaveAttribute("title", ARTICLE_BULK_BLOCKED.discard);
    });
});
