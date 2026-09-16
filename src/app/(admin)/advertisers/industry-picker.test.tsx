import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * The industry picker — Lot G (Q119).
 *
 * What this pins: the options are exactly what `GET /advertisers/industries`
 * serves, never a list typed here; a value already on the row that the list
 * no longer names stays selectable so an edit that does not touch it does
 * not drop it; and the edit dialog PATCHes `{ industry }` with the pick, or
 * `null` to clear, and nothing at all when nothing moved.
 */

const backend = vi.hoisted(() => ({
    gets: [] as string[],
    patches: [] as { path: string; body: unknown }[],
    reset() {
        this.gets = [];
        this.patches = [];
    },
    async get(path: string) {
        this.gets.push(path);
        if (path === "/advertisers/industries") return ["Retail", "Food & beverage", "Real estate"];
        throw new Error(`No answer scripted for ${path}`);
    },
    async patch(path: string, body: unknown) {
        this.patches.push({ path, body });
        return { id: "adv_1", name: "Zomato", contact: "9876543210", type: "COMMERCIAL", kycStatus: "VERIFIED", activatedAt: null, createdAt: "2026-01-08T00:00:00.000Z", industry: (body as { industry: string | null }).industry };
    },
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        api: { ...actual.api, get: (path: string) => backend.get(path), patch: (path: string, body: unknown) => backend.patch(path, body) },
    };
});

import { EditIndustryDialog, IndustryPicker } from "./industry-picker";

beforeEach(() => backend.reset());

/** Radix opens the panel on the keyboard in jsdom, where there is no pointer to press. */
const open = (trigger: HTMLElement) => fireEvent.keyDown(trigger, { key: "ArrowDown" });
const choose = (option: HTMLElement) => fireEvent.keyDown(option, { key: "Enter" });

describe("IndustryPicker", () => {
    it("offers exactly what the API serves, with Not set first", async () => {
        const onChange = vi.fn();
        render(<IndustryPicker id="industry" value="" onChange={onChange} />);
        const trigger = await screen.findByRole("combobox", { name: "Industry" });
        await waitFor(() => expect(trigger).not.toBeDisabled());
        expect(backend.gets).toEqual(["/advertisers/industries"]);

        open(trigger);
        const options = await screen.findAllByRole("option");
        expect(options.map((option) => option.textContent)).toEqual(["Not set", "Retail", "Food & beverage", "Real estate"]);

        choose(screen.getByRole("option", { name: "Real estate" }));
        expect(onChange).toHaveBeenCalledWith("Real estate");
    });

    it("keeps a value the list no longer names selectable rather than dropping it", async () => {
        render(<IndustryPicker id="industry" value="Aviation" onChange={() => {}} />);
        const trigger = await screen.findByRole("combobox", { name: "Industry" });
        await waitFor(() => expect(trigger).not.toBeDisabled());
        expect(trigger).toHaveTextContent("Aviation");
        open(trigger);
        expect((await screen.findAllByRole("option")).map((option) => option.textContent)).toEqual(["Not set", "Aviation", "Retail", "Food & beverage", "Real estate"]);
    });
});

describe("EditIndustryDialog", () => {
    it("PATCHes the pick and reloads", async () => {
        const onSaved = vi.fn();
        render(<EditIndustryDialog advertiserId="adv_1" advertiserName="Zomato" current={null} open onOpenChange={() => {}} onSaved={onSaved} />);
        const trigger = await screen.findByRole("combobox", { name: "Industry" });
        await waitFor(() => expect(trigger).not.toBeDisabled());
        open(trigger);
        choose(await screen.findByRole("option", { name: "Retail" }));
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(backend.patches).toEqual([{ path: "/advertisers/adv_1", body: { industry: "Retail" } }]);
    });

    it("clears with null, and sends nothing when nothing moved", async () => {
        const onOpenChange = vi.fn();
        const onSaved = vi.fn();
        const { unmount } = render(<EditIndustryDialog advertiserId="adv_1" advertiserName="Zomato" current="Retail" open onOpenChange={onOpenChange} onSaved={onSaved} />);
        const trigger = await screen.findByRole("combobox", { name: "Industry" });
        await waitFor(() => expect(trigger).not.toBeDisabled());
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
        expect(backend.patches).toEqual([]);
        expect(onSaved).not.toHaveBeenCalled();
        unmount();

        render(<EditIndustryDialog advertiserId="adv_1" advertiserName="Zomato" current="Retail" open onOpenChange={() => {}} onSaved={onSaved} />);
        const again = await screen.findByRole("combobox", { name: "Industry" });
        await waitFor(() => expect(again).not.toBeDisabled());
        open(again);
        choose(await screen.findByRole("option", { name: "Not set" }));
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(backend.patches).toEqual([{ path: "/advertisers/adv_1", body: { industry: null } }]);
    });
});
