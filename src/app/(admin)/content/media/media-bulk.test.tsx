import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Media library › bulk (28 Sep 2026). What is pinned: pictures are selected
 * on their cards; archive runs per picture and a refusal (still on a
 * published layout) is named with the server's reason and stays selected;
 * tags are added through the ordinary PATCH, skipping a picture that has
 * them already; everything is shut without content.edit.
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
            return {};
        },
    },
    perms: { held: new Set<string>() },
    toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = (method: string) => async (path: string, body?: unknown) => {
        try {
            return await backend.handle(method, path, body);
        } catch (cause) {
            throw new actual.ApiError(409, "CONFLICT", (cause as Error).message);
        }
    };
    return { ...actual, api: { get: wrap("GET"), post: wrap("POST"), patch: wrap("PATCH"), put: wrap("PUT"), delete: wrap("DELETE") } };
});
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ can: (id: string) => perms.held.has(id), user: null }) }));

import { tagsAdded, tagsRemoved, type MediaAsset } from "@/services/media";
import { MEDIA_BULK_BLOCKED, MediaView } from "./media-view";

const asset = (over: Partial<MediaAsset>): MediaAsset => ({
    id: "med_1",
    fileId: null,
    url: "https://cdn.adx.in/a.jpg",
    mime: "image/jpeg",
    width: 1600,
    height: 480,
    bytes: 200_000,
    altText: "A banner",
    title: "Diwali banner",
    tags: ["festive"],
    spec: null,
    ownerAdvertiserId: null,
    createdByUserId: null,
    archivedAt: null,
    createdAt: "2026-09-27T00:00:00.000Z",
    updatedAt: "2026-09-27T00:00:00.000Z",
    ...over,
});

const banner = asset({});
const tile = asset({ id: "med_2", title: "Holi tile", tags: [] });

function view(assets: MediaAsset[]) {
    return render(<MediaView specs={[]} assets={assets} loading={false} error={null} filters={{ q: "", tag: "", spec: "", archived: false }} onFilters={vi.fn()} onChanged={vi.fn()} />);
}

beforeEach(() => {
    backend.reset();
    perms.held = new Set(["content.view", "content.edit"]);
    for (const fn of Object.values(toast)) fn.mockReset();
});

describe("the cards' selection", () => {
    it("archives per picture and keeps one a published layout still draws selected, with the reason", async () => {
        backend.refuse.set("POST /media/med_1/archive", "Still drawn by Website — Home v4");
        view([banner, tile]);
        fireEvent.click(screen.getByTestId("media-select-med_1"));
        fireEvent.click(screen.getByTestId("media-select-med_2"));
        fireEvent.click(screen.getByTestId("bulk-archive"));
        fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Archive 2 pictures" }));

        await waitFor(() => expect(toast.warning).toHaveBeenCalledWith("1 archived · 1 failed: Still drawn by Website — Home v4", expect.objectContaining({ description: "Diwali banner — Still drawn by Website — Home v4" })));
        expect(screen.getByTestId("media-select-med_1")).toHaveAttribute("data-state", "checked");
        expect(screen.getByTestId("media-select-med_2")).toHaveAttribute("data-state", "unchecked");
    });

    it("adds tags through the PATCH, skipping a picture that has them", async () => {
        view([banner, tile]);
        fireEvent.click(screen.getByTestId("media-select-med_1"));
        fireEvent.click(screen.getByTestId("media-select-med_2"));
        fireEvent.click(screen.getByTestId("bulk-tag-add"));
        const dialog = await screen.findByRole("alertdialog");
        fireEvent.change(within(dialog).getByTestId("media-bulk-tags"), { target: { value: "Festive" } });
        expect(within(dialog).getByText(/^1 will be tagged, 1 skipped \(already tagged\)\./)).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole("button", { name: "Tag 1 picture" }));
        await waitFor(() => expect(backend.calls).toEqual([{ method: "PATCH", path: "/media/med_2", body: { tags: ["festive"] } }]));
    });

    it("is shut without content.edit", () => {
        perms.held = new Set(["content.view"]);
        view([banner]);
        fireEvent.click(screen.getByTestId("media-select-med_1"));
        for (const key of ["archive", "restore", "tag-add", "tag-remove"]) expect(screen.getByTestId(`bulk-${key}`)).toHaveAttribute("title", MEDIA_BULK_BLOCKED);
    });

    it("works the tags out — never past twelve, never a silent no-op", () => {
        expect(tagsAdded(["a"], ["a"])).toEqual({ skip: "already tagged" });
        expect(tagsAdded(["a"], ["b"])).toEqual({ tags: ["a", "b"] });
        expect(tagsAdded(Array.from({ length: 12 }, (_, i) => `t${i}`), ["new"])).toEqual({ skip: "would pass 12 tags" });
        expect(tagsRemoved(["a", "b"], ["b"])).toEqual({ tags: ["a"] });
        expect(tagsRemoved(["a"], ["z"])).toEqual({ skip: "not tagged" });
    });
});
