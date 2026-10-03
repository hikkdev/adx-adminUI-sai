import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Access grants (2 Oct 2026): the console's list layout on the open grants.
 *
 * What is pinned: the agent is shown by name with the AGT- id under it and
 * never by the raw database id; an advertiser grant names the advertiser;
 * search narrows the rows; a selection withdraws together — the single
 * revoke once per grant, then one reload — and the toast says how many went
 * and how many to try again; the single Withdraw still works.
 */

const { backend, toast } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string }[],
        refuse: new Set<string>(),
        grants: [] as unknown[],
        reset() {
            this.calls = [];
            this.refuse = new Set();
            this.grants = [];
        },
        async handle(method: string, path: string) {
            this.calls.push({ method, path });
            if (this.refuse.has(path)) throw new Error("That grant has already ended.");
            if (method === "GET" && path === "/access-grants/open") return this.grants;
            return {};
        },
    },
    toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string) => {
        try {
            return await backend.handle(method, path);
        } catch (cause) {
            throw new actual.ApiError(409, "CONFLICT", (cause as Error).message);
        }
    };
    return {
        ...actual,
        api: {
            get: (path: string) => wrap("GET", path),
            post: (path: string) => wrap("POST", path),
            patch: (path: string) => wrap("PATCH", path),
            put: (path: string) => wrap("PUT", path),
            delete: (path: string) => wrap("DELETE", path),
        },
    };
});

import type { WireGrant } from "@/services/access";
import { AccessView, withdrawSummary } from "./access-view";

const grant = (over: Partial<WireGrant> = {}): WireGrant => ({
    id: "grant_1",
    publisherId: "pub_1",
    advertiserId: null,
    assignedAgentId: "cmagent0000000000000001",
    reason: "Update my address",
    scope: "PROFILE",
    listingIds: [],
    purpose: "SUPPORT",
    status: "ACTIVE",
    durationMinutes: 60,
    qrId: null,
    createdAt: "2026-10-02T08:00:00.000Z",
    claimedAt: "2026-10-02T08:00:00.000Z",
    expiresAt: "2026-10-02T09:00:00.000Z",
    revokedAt: null,
    revokedById: null,
    publisher: { id: "pub_1", name: "Asha Rao", userId: "usr_1" },
    advertiser: null,
    assignedAgent: { id: "cmagent0000000000000001", userId: "usr_a1", displayId: "AGT-0001", user: { name: "Ravi Kumar" } },
    ...over,
});

const three = (): WireGrant[] => [
    grant(),
    grant({
        id: "grant_2",
        publisherId: null,
        advertiserId: "adv_1",
        publisher: null,
        advertiser: { id: "adv_1", name: "Chai Point", userId: "usr_2" },
        reason: "Set up my first campaign",
        assignedAgentId: "cmagent0000000000000002",
        assignedAgent: { id: "cmagent0000000000000002", userId: "usr_a2", displayId: "AGT-0002", user: { name: "Meena Iyer" } },
    }),
    grant({
        id: "grant_3",
        publisherId: "pub_3",
        publisher: { id: "pub_3", name: "Lakeview Hoardings", userId: "usr_3" },
        reason: "Fix my listing photos",
        scope: "LISTINGS",
        assignedAgentId: "cmagent0000000000000003",
        assignedAgent: { id: "cmagent0000000000000003", userId: "usr_a3", displayId: "AGT-0003", user: { name: null } },
    }),
];

const gets = () => backend.calls.filter((call) => call.method === "GET").length;
const revokes = () => backend.calls.filter((call) => call.method === "POST").map((call) => call.path);

const rowOf = (text: string) => screen.getByText(text).closest("tr") as HTMLElement;
const tick = (text: string) => fireEvent.click(within(rowOf(text)).getByRole("checkbox"));

async function shown() {
    render(<AccessView />);
    await screen.findByText("Asha Rao");
}

beforeEach(() => {
    backend.reset();
    backend.grants = three();
    for (const fn of Object.values(toast)) fn.mockReset();
});

describe("the agent and the account", () => {
    it("shows the agent's name with the AGT id under it, never the raw id, linked to their record", async () => {
        await shown();
        const link = screen.getByTestId("grant-agent-grant_1");
        expect(link).toHaveTextContent("Ravi Kumar");
        expect(link.getAttribute("href")).toBe("/agents/cmagent0000000000000001");
        expect(within(rowOf("Asha Rao")).getByText("AGT-0001")).toBeInTheDocument();
        expect(screen.queryByText(/cmagent/)).not.toBeInTheDocument();
    });

    it("falls back to the AGT id when the agent has no name", async () => {
        await shown();
        expect(screen.getByTestId("grant-agent-grant_3")).toHaveTextContent("AGT-0003");
    });

    it("names the advertiser on an advertiser grant", async () => {
        await shown();
        expect(screen.getByText("Chai Point")).toBeInTheDocument();
        expect(screen.queryByText(/Advertiser adv_1/)).not.toBeInTheDocument();
    });

    it("keeps the empty message when nobody holds access", async () => {
        backend.grants = [];
        render(<AccessView />);
        expect(await screen.findByText("Nobody holds access to anyone's account right now.")).toBeInTheDocument();
    });
});

describe("search", () => {
    it("narrows the rows by account, agent and what was asked", async () => {
        await shown();
        const search = screen.getByPlaceholderText("Search account, agent or what was asked");

        fireEvent.change(search, { target: { value: "meena" } });
        expect(screen.getByText("Chai Point")).toBeInTheDocument();
        expect(screen.queryByText("Asha Rao")).not.toBeInTheDocument();

        fireEvent.change(search, { target: { value: "AGT-0003" } });
        expect(screen.getByText("Lakeview Hoardings")).toBeInTheDocument();
        expect(screen.queryByText("Chai Point")).not.toBeInTheDocument();

        fireEvent.change(search, { target: { value: "address" } });
        expect(screen.getByText("Asha Rao")).toBeInTheDocument();
        expect(screen.queryByText("Lakeview Hoardings")).not.toBeInTheDocument();
    });
});

describe("withdrawing", () => {
    it("withdraws two selected grants — one revoke each — then reloads once", async () => {
        await shown();
        tick("Asha Rao");
        tick("Chai Point");
        fireEvent.click(screen.getByTestId("grant-withdraw-selected"));
        expect(screen.getByTestId("grant-withdraw-selected")).toHaveTextContent("Withdraw selected (2)");

        const dialog = await screen.findByRole("alertdialog");
        expect(within(dialog).getByText("Withdraw access from 2 accounts?")).toBeInTheDocument();
        expect(
            within(dialog).getByText(
                "The agents lose access now and the codes that opened it stop resolving. Each account's owner sees the withdrawal in their record."
            )
        ).toBeInTheDocument();
        const before = gets();
        fireEvent.click(within(dialog).getByRole("button", { name: "Withdraw access" }));

        await waitFor(() => expect(toast.success).toHaveBeenCalledWith("2 withdrawn"));
        expect(revokes().sort()).toEqual(["/access-grants/grant_1/revoke", "/access-grants/grant_2/revoke"]);
        await waitFor(() => expect(gets()).toBe(before + 1));
    });

    it("says how many failed and keeps them to try again", async () => {
        await shown();
        backend.refuse.add("/access-grants/grant_2/revoke");
        tick("Asha Rao");
        tick("Chai Point");
        fireEvent.click(screen.getByTestId("grant-withdraw-selected"));
        const dialog = await screen.findByRole("alertdialog");
        fireEvent.click(within(dialog).getByRole("button", { name: "Withdraw access" }));

        await waitFor(() => expect(toast.warning).toHaveBeenCalled());
        expect(toast.warning.mock.calls[0]![0]).toBe("1 withdrawn, 1 failed — try those again");
        expect(toast.success).not.toHaveBeenCalled();
        await waitFor(() => expect(screen.getByTestId("grant-withdraw-selected")).toHaveTextContent("Withdraw selected (1)"));
    });

    it("words the summary for every outcome", () => {
        expect(withdrawSummary(3, 0)).toBe("3 withdrawn");
        expect(withdrawSummary(2, 1)).toBe("2 withdrawn, 1 failed — try those again");
    });

    it("still withdraws a single grant from its row", async () => {
        await shown();
        fireEvent.click(screen.getByTestId("grant-withdraw-grant_3"));
        const dialog = await screen.findByRole("alertdialog");
        expect(within(dialog).getByText("Withdraw this access?")).toBeInTheDocument();
        const before = gets();
        fireEvent.click(within(dialog).getByRole("button", { name: "Withdraw access" }));

        await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Access withdrawn from Lakeview Hoardings", expect.anything()));
        expect(revokes()).toEqual(["/access-grants/grant_3/revoke"]);
        await waitFor(() => expect(gets()).toBe(before + 1));
    });
});
