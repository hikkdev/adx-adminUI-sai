import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { coverageOf, type FeatureFlag, type RegistryRead } from "@/services/flags";
import { DEFAULT_FLAG_FACETS, type FlagFacets } from "./flags-facets";

/**
 * L-C — the Feature flags desk.
 *
 * What this pins: the table is paged (twenty-five rows on the first page of
 * thirty, "30 of 30 flags" above it); a chip click reports the facet
 * rather than filtering in place, since the loader owns the URL; checking
 * a row raises the bar with "Select all N matching", which widens the
 * targets to every row the filter leaves, across pages; Set variant is
 * disabled with the reason while the selected keys do not share a variant
 * set, and enabled once they do; the confirm lists the first ten keys and
 * "and N more", refuses to go without a 4-character note, then posts ONE
 * `POST /flags/bulk` with every key; Roll back names how many keys have a
 * last good state and posts ONE `POST /flags/bulk/rollback` with only
 * those; the toast prints the updated / skipped counts and the selection
 * clears and the read reloads.
 */

const { backend, toast } = vi.hoisted(() => {
    const toast = { success: vi.fn(), error: vi.fn() };
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        answer: { updated: [] as unknown[], skipped: [] as { key: string; reason: string }[] },
        reset() {
            this.calls = [];
            this.answer = { updated: [], skipped: [] };
        },
    };
    return { backend, toast };
});

vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        return backend.answer;
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

import { FlagsView } from "./flags-view";

const flag = (index: number, over: Partial<FeatureFlag> = {}): FeatureFlag => ({
    key: `area.feature-${String(index).padStart(2, "0")}`,
    enabled: true,
    rolloutPercent: 100,
    description: null,
    updatedById: null,
    surfaces: ["APP_USER", "BACKEND"],
    kind: "FEATURE",
    source: "REGISTERED",
    owner: index % 2 ? "demand" : "supply",
    variant: null,
    variants: [],
    rollout: null,
    lastGoodState: null,
    registeredAt: "2026-09-13T00:00:00.000Z",
    aliases: [],
    createdAt: "2026-09-13T00:00:00.000Z",
    updatedAt: "2026-09-13T00:00:00.000Z",
    lastChange: null,
    ...over,
});

/** Thirty rows: the first two declare the same variants, the third a different set; the first three have moved. */
const flags: FeatureFlag[] = Array.from({ length: 30 }, (_, index) =>
    flag(index + 1, {
        ...(index < 2 ? { variants: ["control", "treatment"] } : {}),
        ...(index === 2 ? { variants: ["a", "b"] } : {}),
        ...(index < 3 ? { lastGoodState: { enabled: true, rolloutPercent: 50, variant: null, rollout: null } } : {}),
    }),
);

const registry: RegistryRead = { generatedBy: "scripts/features-sync.ts", features: [] };

function mount(facets: FlagFacets = DEFAULT_FLAG_FACETS, rows: FeatureFlag[] = flags) {
    const onFacets = vi.fn();
    const onChanged = vi.fn();
    render(<FlagsView read={{ flags: rows, registry, coverage: coverageOf(rows, registry) }} facets={facets} onFacets={onFacets} onChanged={onChanged} />);
    return { onFacets, onChanged };
}

const rowCheckboxes = () => screen.getAllByRole("checkbox", { name: "Select row" });
const bar = () => screen.getByText(/selected$/).closest("div")!.parentElement!;

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
    toast.error.mockReset();
});

describe("the table", () => {
    it("draws twenty-five rows of the thirty on the first page, with the count line above", () => {
        mount();
        expect(screen.getByTestId("flags-count")).toHaveTextContent("30 of 30 flags");
        expect(rowCheckboxes()).toHaveLength(25);
        expect(screen.getByText("1-25 of 30")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Next" }));
        expect(rowCheckboxes()).toHaveLength(5);
        expect(screen.getByText("area.feature-30")).toBeInTheDocument();
    });

    it("reports a chip click to the loader rather than filtering in place, and counts the filtered rows", () => {
        const { onFacets } = mount();
        fireEvent.click(screen.getByRole("tab", { name: /^Off/ }));
        expect(onFacets).toHaveBeenCalledWith({ state: "OFF" });
        fireEvent.change(screen.getByLabelText("Search flags"), { target: { value: "feature-0" } });
        expect(onFacets).toHaveBeenCalledWith({ q: "feature-0" });
    });

    it("draws the rows a facet leaves, and says so", () => {
        mount({ ...DEFAULT_FLAG_FACETS, q: "feature-0" });
        expect(screen.getByTestId("flags-count")).toHaveTextContent("9 of 30 flags");
        expect(rowCheckboxes()).toHaveLength(9);
    });
});

describe("the bulk bar", () => {
    it("widens the targets to every matching row across pages, and says how many can roll back", () => {
        mount({ ...DEFAULT_FLAG_FACETS, owner: "demand" });
        expect(screen.getByTestId("flags-count")).toHaveTextContent("15 of 30 flags");
        fireEvent.click(rowCheckboxes()[3]!);
        expect(screen.getByText("1 selected")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Roll back 0 of 1" })).toBeDisabled();

        fireEvent.click(screen.getByRole("button", { name: "Select all 15 matching" }));
        expect(screen.getByTestId("bulk-scope")).toHaveTextContent("All 15 matching selected");
        // Two of the fifteen odd-numbered rows (1 and 3) have a last good state.
        expect(screen.getByRole("button", { name: "Roll back 2 of 15" })).toBeEnabled();

        fireEvent.click(screen.getByRole("button", { name: "Only the 1 checked" }));
        expect(screen.getByRole("button", { name: "Roll back 0 of 1" })).toBeDisabled();
    });

    it("never posts a key the filter hides: Select all N matching under a facet names only the rows it leaves, across pages", async () => {
        backend.answer = { updated: [], skipped: [] };
        mount({ ...DEFAULT_FLAG_FACETS, owner: "demand" });
        fireEvent.click(rowCheckboxes()[0]!);
        fireEvent.click(screen.getByRole("button", { name: "Select all 15 matching" }));
        fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
        expect(screen.getByText("Turn on 15 flags?")).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("Why"), { target: { value: "re-enabling demand's flags" } });
        fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Turn on" }));
        await waitFor(() => expect(backend.calls).toHaveLength(1));
        const body = backend.calls[0]!.body as { keys: string[] };
        // The odd-numbered rows are demand's; the fifteen include rows off the first page (rows 21-29 sit on page 2).
        expect(body.keys).toEqual(Array.from({ length: 15 }, (_, index) => `area.feature-${String(index * 2 + 1).padStart(2, "0")}`));
    });

    it("enables Set variant only while every selected key shares the variant set, and explains otherwise", () => {
        mount();
        const boxes = rowCheckboxes();
        fireEvent.click(boxes[0]!);
        fireEvent.click(boxes[2]!);
        const setVariant = () => screen.getByRole("button", { name: "Set variant" });
        expect(setVariant()).toBeDisabled();
        expect(within(bar()).getByText(/do not share one variant set — area.feature-01 and area.feature-03 differ/)).toBeInTheDocument();

        fireEvent.click(boxes[2]!);
        fireEvent.click(boxes[1]!);
        expect(setVariant()).toBeEnabled();

        fireEvent.click(boxes[3]!);
        expect(setVariant()).toBeDisabled();
        expect(within(bar()).getByText(/1 of the selected flags declares no variant \(area.feature-04\)/)).toBeInTheDocument();
    });

    it("confirms with the first ten keys, demands the note, then posts ONE bulk write with every matching key", async () => {
        backend.answer = { updated: flags.slice(0, 29), skipped: [{ key: "area.feature-30", reason: "already at that position" }] };
        const { onChanged } = mount();
        fireEvent.click(rowCheckboxes()[0]!);
        fireEvent.click(screen.getByRole("button", { name: "Select all 30 matching" }));
        fireEvent.click(screen.getByRole("button", { name: "Turn off" }));

        expect(screen.getByText("Turn off 30 flags?")).toBeInTheDocument();
        const keys = within(screen.getByTestId("bulk-keys"));
        expect(keys.getAllByRole("listitem")).toHaveLength(10);
        expect(keys.getByText("and 20 more")).toBeInTheDocument();

        const confirm = () => within(screen.getByRole("alertdialog")).getByRole("button", { name: "Turn off" });
        expect(confirm()).toBeDisabled();
        fireEvent.change(screen.getByLabelText("Why"), { target: { value: "abc" } });
        expect(confirm()).toBeDisabled();
        expect(screen.getByText(/At least 4 characters/)).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("Why"), { target: { value: "  incident 4231  " } });
        expect(confirm()).toBeEnabled();
        expect(backend.calls).toHaveLength(0);

        fireEvent.click(confirm());
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.calls).toHaveLength(1);
        expect(backend.calls[0]).toMatchObject({ method: "POST", path: "/flags/bulk" });
        const body = backend.calls[0]!.body as { keys: string[]; patch: unknown; note: string };
        expect(body.keys).toHaveLength(30);
        expect(body.keys[0]).toBe("area.feature-01");
        expect(body.keys[29]).toBe("area.feature-30");
        expect(body.patch).toEqual({ enabled: false });
        expect(body.note).toBe("incident 4231");
        expect(toast.success).toHaveBeenCalledWith("29 flags turned off · 1 skipped", expect.anything());
        // The selection cleared with the confirm.
        await waitFor(() => expect(screen.queryByText(/selected$/)).not.toBeInTheDocument());
    });

    it("posts the percentage from the small dialog", async () => {
        mount();
        fireEvent.click(rowCheckboxes()[4]!);
        fireEvent.click(screen.getByRole("button", { name: "Set rollout %" }));
        const apply = () => screen.getByRole("button", { name: "Apply" });
        fireEvent.change(screen.getByLabelText("Why"), { target: { value: "widening to the pilot" } });
        expect(apply()).toBeDisabled();
        fireEvent.change(screen.getByLabelText("Rollout"), { target: { value: "101" } });
        expect(apply()).toBeDisabled();
        fireEvent.change(screen.getByLabelText("Rollout"), { target: { value: "40" } });
        fireEvent.click(apply());
        await waitFor(() => expect(backend.calls).toHaveLength(1));
        expect(backend.calls[0]).toEqual({
            method: "POST",
            path: "/flags/bulk",
            body: { keys: ["area.feature-05"], patch: { rolloutPercent: 40 }, note: "widening to the pilot" },
        });
    }, 15_000);

    it("rolls back only the keys with a last good state, in ONE request", async () => {
        backend.answer = { updated: flags.slice(0, 2), skipped: [] };
        const { onChanged } = mount();
        const boxes = rowCheckboxes();
        fireEvent.click(boxes[0]!);
        fireEvent.click(boxes[1]!);
        fireEvent.click(boxes[5]!);
        fireEvent.click(screen.getByRole("button", { name: "Roll back 2 of 3" }));
        expect(screen.getByText("Roll back 2 flags?")).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("Why"), { target: { value: "the 50% step broke checkout" } });
        fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Roll back" }));
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.calls).toEqual([
            { method: "POST", path: "/flags/bulk/rollback", body: { keys: ["area.feature-01", "area.feature-02"], note: "the 50% step broke checkout" } },
        ]);
        expect(toast.success).toHaveBeenCalledWith("2 flags rolled back", expect.anything());
    });
});
