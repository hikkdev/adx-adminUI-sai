import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Finance › Settings › Agent incentive rates (2 Oct 2026).
 *
 * What is pinned: "Set a rate" sits in the section's header and opens a
 * dialog (the old form at the foot of the card is gone); every rate in force
 * has a Change button that opens the same dialog on that row's event, tier,
 * figure (or "pays nothing") and today's date, while a past row has none;
 * the tier is a select whose values are exactly the keys the backend
 * resolves — `*`, the four tiers, and `*:ADVERTISER` / `*:PUBLISHER` for
 * the lead events only; the description is plain words; and without
 * finance.edit nothing on the card writes.
 */

const { backend, perms, toast } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string; body?: unknown }[],
        reset() {
            this.calls = [];
        },
        async handle(method: string, path: string, body?: unknown) {
            this.calls.push({ method, path, body });
            if (method === "POST" && path === "/finance/incentive-rates") return { id: "new", amount: "0.00", paysNothing: false };
            if (method === "GET") return [];
            return {};
        },
    },
    perms: { held: new Set<string>() },
    toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = (method: string) => (path: string, body?: unknown) => backend.handle(method, path, body);
    return { ...actual, api: { get: wrap("GET"), post: wrap("POST"), patch: wrap("PATCH"), put: wrap("PUT"), delete: wrap("DELETE") } };
});

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ can: (id: string) => perms.held.has(id), user: null }) }));

import type { IncentiveRate } from "@/services/finance";
import { SettingsView } from "./settings-view";

const rate = (over: Partial<IncentiveRate>): IncentiveRate => ({
    id: "r",
    event: "PUBLISHER_ONBOARDED",
    tier: "*",
    amount: "2000.00",
    paysNothing: false,
    effectiveFrom: "2026-09-01T00:00:00.000Z",
    effectiveTo: null,
    ...over,
});

const RATES: IncentiveRate[] = [
    rate({ id: "r1", event: "PUBLISHER_ONBOARDED", tier: "*", amount: "2000.00" }),
    rate({ id: "r0", event: "PUBLISHER_ONBOARDED", tier: "*", amount: "1500.00", effectiveFrom: "2026-08-01T00:00:00.000Z", effectiveTo: "2026-09-01T00:00:00.000Z" }),
    rate({ id: "r2", event: "LEAD_ACTIVATED", tier: "*:ADVERTISER", amount: "750.00" }),
    rate({ id: "r3", event: "LEAD_ACTIVATED", tier: "*:PUBLISHER", amount: "0.00", paysNothing: true }),
];

const today = () => new Date().toISOString().slice(0, 10);

function renderView(onChanged = vi.fn()) {
    render(
        <SettingsView
            limits={[]}
            taxRates={[]}
            incentiveRates={RATES}
            legalEntity={null}
            installationMode="FLAT"
            bankAccounts={[]}
            financeSettings={null}
            rails={[]}
            schedule={null}
            agentPay={null}
            onChanged={onChanged}
        />,
    );
    return onChanged;
}

/** The incentive rates card — the section whose heading names it. */
const ratesCard = () => screen.getByRole("heading", { name: "Agent incentive rates" }).closest(".rounded-lg") as HTMLElement;

/** Opens a Radix select by keyboard (jsdom has no pointer) and picks the option. */
async function pick(trigger: HTMLElement, option: string) {
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: option }));
}

async function openOptions(trigger: HTMLElement): Promise<string[]> {
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const options = await screen.findAllByRole("option");
    return options.map((option) => option.textContent ?? "");
}

beforeEach(() => {
    backend.reset();
    perms.held = new Set(["finance.view", "finance.edit", "settings.view", "settings.edit"]);
    for (const fn of Object.values(toast)) fn.mockReset();
});

describe("the incentive rates card", () => {
    it("puts Set a rate in the section header and no longer carries a form at its foot", () => {
        renderView();
        const card = ratesCard();
        const header = card.firstElementChild as HTMLElement;
        expect(within(header).getByRole("button", { name: "Set a rate" })).toBeInTheDocument();
        expect(screen.queryByLabelText("Amount (₹)")).toBeNull();
        expect(screen.queryByText(/This key pays nothing/)).toBeNull();
    });

    it("describes the rates in plain words, without keys or lot names", () => {
        renderView();
        const description = within(ratesCard()).getByText(/What an agent earns for each kind of work/);
        expect(description.textContent).toContain("Publisher-side lead rewards are switched off");
        expect(description.textContent).not.toMatch(/\*|ADVERTISER|LH8|CP-4/);
    });

    it("offers Change on every rate in force and none on a past one", () => {
        renderView();
        const rows = within(ratesCard()).getAllByTestId("incentive-rate-row");
        expect(rows).toHaveLength(4);
        const withChange = rows.filter((row) => within(row).queryByRole("button", { name: /^Change/ }));
        expect(withChange).toHaveLength(3);
        const past = rows.find((row) => row.textContent?.includes("₹1,500.00")) as HTMLElement;
        expect(within(past).queryByRole("button", { name: /^Change/ })).toBeNull();
    });

    it("sets a new rate from the header dialog", async () => {
        const onChanged = renderView();
        fireEvent.click(screen.getByRole("button", { name: "Set a rate" }));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByRole("heading", { name: "Set a rate" })).toBeInTheDocument();
        expect(within(dialog).getByText(/Saving closes the current rate on the day before and starts this one\. Incentives already earned keep the rate they were earned at\./)).toBeInTheDocument();
        expect(within(dialog).getByLabelText("Starts on")).toHaveValue(today());

        await pick(within(dialog).getByLabelText("Tier"), "Gold");
        fireEvent.change(within(dialog).getByLabelText("Amount (₹)"), { target: { value: "2500" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Save rate" }));

        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        const post = backend.calls.find((call) => call.method === "POST");
        expect(post?.path).toBe("/finance/incentive-rates");
        expect(post?.body).toEqual({
            event: "PUBLISHER_ONBOARDED",
            tier: "GOLD",
            amount: "2500",
            effectiveFrom: new Date(today()).toISOString(),
        });
        expect(toast.success).toHaveBeenCalledWith("Publisher onboarded set to ₹2,500.00", expect.anything());
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("changes a row from its own dialog, pre-filled with the row's event, tier, figure and today", async () => {
        renderView();
        fireEvent.click(screen.getByRole("button", { name: "Change Lead activated for every tier · advertiser side" }));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByRole("heading", { name: "Change a rate" })).toBeInTheDocument();
        expect(within(dialog).getByLabelText("Event")).toHaveTextContent("Lead activated");
        expect(within(dialog).getByLabelText("Tier")).toHaveTextContent("Every tier · advertiser side");
        expect(within(dialog).getByLabelText("Amount (₹)")).toHaveValue("750.00");
        expect(within(dialog).getByRole("switch")).not.toBeChecked();
        expect(within(dialog).getByLabelText("Starts on")).toHaveValue(today());

        fireEvent.change(within(dialog).getByLabelText("Amount (₹)"), { target: { value: "800" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Save rate" }));
        await waitFor(() => expect(backend.calls.some((call) => call.method === "POST")).toBe(true));
        expect(backend.calls.find((call) => call.method === "POST")?.body).toMatchObject({ event: "LEAD_ACTIVATED", tier: "*:ADVERTISER", amount: "800" });
    });

    it("opens a pays-nothing row with the switch on, and saves it as pays nothing", async () => {
        renderView();
        fireEvent.click(screen.getByRole("button", { name: "Change Lead activated for every tier · publisher side" }));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByRole("switch")).toBeChecked();
        expect(within(dialog).getByLabelText("Amount (₹)")).toBeDisabled();
        fireEvent.click(within(dialog).getByRole("button", { name: "Save rate" }));
        await waitFor(() => expect(backend.calls.some((call) => call.method === "POST")).toBe(true));
        expect(backend.calls.find((call) => call.method === "POST")?.body).toMatchObject({
            event: "LEAD_ACTIVATED",
            tier: "*:PUBLISHER",
            amount: "0.00",
            paysNothing: true,
        });
        expect(toast.success).toHaveBeenCalledWith("Lead activated now pays nothing", expect.anything());
    });

    it("offers the tiers, and the two sides only for a lead event", async () => {
        renderView();
        fireEvent.click(screen.getByRole("button", { name: "Set a rate" }));
        const dialog = await screen.findByRole("dialog");
        expect(await openOptions(within(dialog).getByLabelText("Tier"))).toEqual(["Every tier", "Bronze", "Silver", "Gold", "Platinum"]);
        fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

        await pick(within(dialog).getByLabelText("Event"), "Lead converted");
        expect(await openOptions(within(dialog).getByLabelText("Tier"))).toEqual([
            "Every tier",
            "Bronze",
            "Silver",
            "Gold",
            "Platinum",
            "Every tier · advertiser side",
            "Every tier · publisher side",
        ]);
        fireEvent.click(screen.getByRole("option", { name: "Every tier · advertiser side" }));
        fireEvent.change(within(dialog).getByLabelText("Amount (₹)"), { target: { value: "100" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Save rate" }));
        await waitFor(() => expect(backend.calls.some((call) => call.method === "POST")).toBe(true));
        expect(backend.calls.find((call) => call.method === "POST")?.body).toMatchObject({ event: "LEAD_CONVERTED", tier: "*:ADVERTISER" });
    });

    it("refuses an amount that is not a rupee figure, sending nothing", async () => {
        renderView();
        fireEvent.click(screen.getByRole("button", { name: "Set a rate" }));
        const dialog = await screen.findByRole("dialog");
        fireEvent.change(within(dialog).getByLabelText("Amount (₹)"), { target: { value: "12.345" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Save rate" }));
        await waitFor(() => expect(toast.error).toHaveBeenCalled());
        expect(backend.calls.some((call) => call.method === "POST")).toBe(false);
    });

    it("writes nothing without finance.edit", () => {
        perms.held = new Set(["finance.view"]);
        renderView();
        expect(screen.queryByRole("button", { name: "Set a rate" })).toBeNull();
        expect(screen.queryAllByRole("button", { name: /^Change/ })).toHaveLength(0);
    });
});
