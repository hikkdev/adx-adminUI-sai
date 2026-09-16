import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Lot A — the Suspend and Reinstate dialogs.
 *
 * What this pins: the checkboxes are filtered per party (a listing never sees
 * a wallet, an advertiser never sees accrual), each carries its consequence
 * sentence, STOP_OPEN_WORK prints the count of running orders when the page
 * has it, nothing goes on the wire without a reason of at least three
 * characters, a scope already in force is shown locked and never re-sent, and
 * a reinstate that lifts everything sends no scope list.
 */

const { backend, toast } = vi.hoisted(() => {
    const toast = { success: vi.fn(), error: vi.fn() };
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        reset() {
            this.calls = [];
        },
        async handle(method: string, path: string, body?: unknown) {
            this.calls.push({ method, path, body });
            if (path.endsWith("/suspend")) {
                const sent = body as { scopes: string[] };
                return {
                    scopes: sent.scopes,
                    effects: {
                        cascadedListingIds: [],
                        cancelledOrderIds: sent.scopes.includes("STOP_OPEN_WORK") ? ["o1", "o2"] : [],
                        cancelledCampaignIds: [],
                        releasedOrderIds: [],
                        cancelledVisitIds: [],
                        releasedMilestoneIds: [],
                        refunds: [],
                        walletFrozen: sent.scopes.includes("FREEZE_WALLET"),
                        signinBlocked: false,
                    },
                };
            }
            if (path.endsWith("/reinstate")) {
                const sent = body as { scopes?: string[] };
                return { scopes: [], lifted: sent.scopes ?? ["everything"] };
            }
            throw new Error(`No route ${method} ${path}`);
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
        try {
            return await backend.handle(method, path, body);
        } catch (cause) {
            throw new actual.ApiError(404, "NOT_FOUND", (cause as Error).message);
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

import { ReinstateDialog, SuspendDialog, SuspensionActions } from "./suspend-dialog";

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
    toast.error.mockReset();
});

const scopeBoxes = (dialog: ReturnType<typeof within>) =>
    dialog.getAllByRole("checkbox").map((box: HTMLElement) => box.getAttribute("aria-label"));

describe("which checkboxes each party gets", () => {
    it("a listing sees the three spot scopes and no wallet or sign-in", async () => {
        render(
            <SuspendDialog partyType="LISTING" partyId="l1" partyName="MG Road" current={[]} open onOpenChange={vi.fn()} onDone={vi.fn()} />,
        );
        const dialog = within(await screen.findByRole("dialog"));
        expect(scopeBoxes(dialog)).toEqual(["Block new", "Stop open work", "Stop accrual"]);
    });

    it("a publisher sees all five", async () => {
        render(
            <SuspendDialog partyType="PUBLISHER" partyId="p1" partyName="Sharma Hoardings" current={[]} open onOpenChange={vi.fn()} onDone={vi.fn()} />,
        );
        const dialog = within(await screen.findByRole("dialog"));
        expect(scopeBoxes(dialog)).toEqual(["Block new", "Stop open work", "Stop accrual", "Freeze wallet", "Block sign-in"]);
    });

    it("an advertiser and an agent see no accrual", async () => {
        const { unmount } = render(
            <SuspendDialog partyType="ADVERTISER" partyId="a1" partyName="Nykaa" current={[]} open onOpenChange={vi.fn()} onDone={vi.fn()} />,
        );
        expect(scopeBoxes(within(await screen.findByRole("dialog")))).toEqual(["Block new", "Stop open work", "Freeze wallet", "Block sign-in"]);
        unmount();
        render(
            <SuspendDialog partyType="AGENT" partyId="g1" partyName="Rahul Kumar" current={[]} open onOpenChange={vi.fn()} onDone={vi.fn()} />,
        );
        expect(scopeBoxes(within(await screen.findByRole("dialog")))).toEqual(["Block new", "Stop open work", "Freeze wallet", "Block sign-in"]);
    });

    it("prints each scope's consequence beside it", async () => {
        render(
            <SuspendDialog partyType="PUBLISHER" partyId="p1" partyName="Sharma Hoardings" current={[]} open onOpenChange={vi.fn()} onDone={vi.fn()} />,
        );
        const dialog = within(await screen.findByRole("dialog"));
        expect(dialog.getByText(/^New bookings stop/)).toBeInTheDocument();
        expect(dialog.getByText(/^Running orders are cancelled and their advertisers refunded through the refund desk/)).toBeInTheDocument();
        expect(dialog.getByText(/^Daily earnings stop/)).toBeInTheDocument();
        expect(dialog.getByText(/^Withdrawals stop/)).toBeInTheDocument();
        expect(dialog.getByText("Sign-in stops and sessions end")).toBeInTheDocument();
    });
});

describe("suspending", () => {
    it("sends the picked scopes and the reason to the party's path, and says what the server did", async () => {
        const onDone = vi.fn();
        render(
            <SuspendDialog
                partyType="LISTING"
                partyId="l1"
                partyName="MG Road"
                current={[]}
                runningOrders={2}
                open
                onOpenChange={vi.fn()}
                onDone={onDone}
            />,
        );
        const dialog = within(await screen.findByRole("dialog"));
        const submit = dialog.getByRole("button", { name: "Suspend" });
        expect(submit).toBeDisabled();

        fireEvent.click(dialog.getByRole("checkbox", { name: "Stop open work" }));
        /* The confirm line, with the count the page carried. */
        expect(dialog.getByTestId("stop-work-confirm")).toHaveTextContent("This cancels 2 running orders now.");
        expect(dialog.getByText("2 running orders are cancelled and their advertisers refunded through the refund desk")).toBeInTheDocument();
        expect(submit).toBeDisabled();

        fireEvent.change(dialog.getByLabelText("Reason"), { target: { value: "Site unsafe after the storm" } });
        expect(submit).toBeEnabled();
        fireEvent.click(submit);

        await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
        expect(backend.calls).toEqual([
            { method: "POST", path: "/listings/l1/suspend", body: { scopes: ["STOP_OPEN_WORK"], reason: "Site unsafe after the storm" } },
        ]);
        expect(toast.success).toHaveBeenCalledTimes(1);
        expect(toast.success.mock.calls[0][1]).toMatchObject({ description: "2 orders cancelled." });
    });

    it("will not send with a reason under three characters", async () => {
        render(
            <SuspendDialog partyType="AGENT" partyId="g1" partyName="Rahul" current={[]} open onOpenChange={vi.fn()} onDone={vi.fn()} />,
        );
        const dialog = within(await screen.findByRole("dialog"));
        fireEvent.click(dialog.getByRole("checkbox", { name: "Block new" }));
        fireEvent.change(dialog.getByLabelText("Reason"), { target: { value: "ok" } });
        expect(dialog.getByRole("button", { name: "Suspend" })).toBeDisabled();
        expect(backend.calls).toHaveLength(0);
    });

    it("shows a scope already in force as ticked and locked, and never re-sends it", async () => {
        const onDone = vi.fn();
        render(
            <SuspendDialog
                partyType="PUBLISHER"
                partyId="p1"
                partyName="Sharma"
                current={["BLOCK_NEW"]}
                open
                onOpenChange={vi.fn()}
                onDone={onDone}
            />,
        );
        const dialog = within(await screen.findByRole("dialog"));
        const blockNew = dialog.getByRole("checkbox", { name: "Block new" });
        expect(blockNew).toBeDisabled();
        expect(blockNew).toHaveAttribute("data-state", "checked");
        expect(dialog.getByText("already in force")).toBeInTheDocument();

        fireEvent.change(dialog.getByLabelText("Reason"), { target: { value: "Chargebacks" } });
        /* Nothing new picked: the ticked-and-locked scope alone is not a request. */
        expect(dialog.getByRole("button", { name: "Suspend" })).toBeDisabled();

        fireEvent.click(dialog.getByRole("checkbox", { name: "Freeze wallet" }));
        fireEvent.click(dialog.getByRole("button", { name: "Suspend" }));
        await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
        expect(backend.calls[0].body).toEqual({ scopes: ["FREEZE_WALLET"], reason: "Chargebacks" });
    });
});

describe("reinstating", () => {
    it("offers only what is in force, all ticked, and lifting all sends no scope list", async () => {
        const onDone = vi.fn();
        render(
            <ReinstateDialog
                partyType="PUBLISHER"
                partyId="p1"
                partyName="Sharma"
                current={["BLOCK_NEW", "FREEZE_WALLET"]}
                open
                onOpenChange={vi.fn()}
                onDone={onDone}
            />,
        );
        const dialog = within(await screen.findByRole("dialog"));
        expect(scopeBoxes(dialog)).toEqual(["Block new", "Freeze wallet"]);
        for (const box of dialog.getAllByRole("checkbox")) expect(box).toHaveAttribute("data-state", "checked");

        fireEvent.change(dialog.getByLabelText("Reason"), { target: { value: "Investigation closed" } });
        fireEvent.click(dialog.getByRole("button", { name: "Reinstate all" }));
        await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
        expect(backend.calls).toEqual([{ method: "POST", path: "/publishers/p1/reinstate", body: { reason: "Investigation closed" } }]);
    });

    it("lifting some names them", async () => {
        const onDone = vi.fn();
        render(
            <ReinstateDialog
                partyType="AGENT"
                partyId="g1"
                partyName="Rahul"
                current={["BLOCK_NEW", "FREEZE_WALLET"]}
                open
                onOpenChange={vi.fn()}
                onDone={onDone}
            />,
        );
        const dialog = within(await screen.findByRole("dialog"));
        fireEvent.click(dialog.getByRole("checkbox", { name: "Block new" }));
        fireEvent.change(dialog.getByLabelText("Reason"), { target: { value: "Wallet cleared by finance" } });
        fireEvent.click(dialog.getByRole("button", { name: "Reinstate 1 of 2" }));
        await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
        expect(backend.calls[0]).toEqual({
            method: "POST",
            path: "/agents/g1/reinstate",
            body: { scopes: ["FREEZE_WALLET"], reason: "Wallet cleared by finance" },
        });
    });
});

describe("the button pair", () => {
    it("shows Reinstate only once something is in force", () => {
        const { rerender } = render(
            <SuspensionActions partyType="LISTING" partyId="l1" partyName="MG Road" current={[]} onDone={vi.fn()} />,
        );
        expect(screen.getByRole("button", { name: "Suspend" })).toBeEnabled();
        expect(screen.queryByRole("button", { name: "Reinstate" })).toBeNull();

        rerender(
            <SuspensionActions partyType="LISTING" partyId="l1" partyName="MG Road" current={["STOP_ACCRUAL"]} onDone={vi.fn()} />,
        );
        expect(screen.getByRole("button", { name: "Reinstate" })).toBeEnabled();
    });

    it("disables Suspend once every section the party admits is already stopped", () => {
        render(
            <SuspensionActions
                partyType="LISTING"
                partyId="l1"
                partyName="MG Road"
                current={["BLOCK_NEW", "STOP_OPEN_WORK", "STOP_ACCRUAL"]}
                onDone={vi.fn()}
            />,
        );
        expect(screen.getByRole("button", { name: "Suspend" })).toBeDisabled();
    });
});
