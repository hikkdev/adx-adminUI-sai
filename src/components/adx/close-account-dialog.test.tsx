import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Lot A — closing an account from a person's page.
 *
 * No Figma frame draws this dialog, so what is pinned is the behaviour the
 * desk depends on: the review is drawn line by line with the server's own
 * verdict on each, the case goes up with exactly the body the schema takes,
 * and a 409 CLOSURE_BLOCKED at the decision is shown as blockers the operator
 * can act on rather than swallowed into a toast.
 */

const { backend, toast } = vi.hoisted(() => {
    const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        review: null as unknown,
        decideFails: null as null | { status: number; code: string; message: string; details?: unknown },
        reset() {
            this.calls = [];
            this.review = null;
            this.decideFails = null;
        },
    };
    return { backend, toast };
});

vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        if (method === "GET" && path === "/users/u1/closure-review") return backend.review;
        if (method === "POST" && path === "/users/u1/closure-cases") {
            return { case: pendingCase, summary: (backend.review as { summary: unknown }).summary, blockers: [] };
        }
        if (method === "POST" && path === "/users/closure-cases/cc_1/decide") {
            if (backend.decideFails) {
                const { status, code, message, details } = backend.decideFails;
                throw new actual.ApiError(status, code, message, details);
            }
            return { case: { ...pendingCase, decision: "CLOSED" }, outcome: null };
        }
        throw new actual.ApiError(404, "NOT_FOUND", `No route ${method} ${path}`);
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

import { BlockerList, CloseAccountDialog } from "./close-account-dialog";
import type { ClosureBlocker, ClosureCase, ClosureReview } from "@/services/users";

const pendingCase: ClosureCase = {
    id: "cc_1",
    userId: "u1",
    ticketId: null,
    reason: "Owner asked by phone",
    requestedById: "adm_1",
    requestedAt: "2026-09-12T09:00:00.000Z",
    walletBalance: "12500.37",
    withdrawalsInFlight: 0,
    openOrders: 0,
    openWork: 1,
    lossNote: null,
    decision: "PENDING",
    decidedById: null,
    decidedAt: null,
    user: { id: "u1", name: "Sharma Hoardings", mobile: "+919845012345", closedAt: null },
};

const review = (blockers: ClosureBlocker[]): ClosureReview => ({
    userId: "u1",
    name: "Sharma Hoardings",
    mobile: "+919845012345",
    closedAt: null,
    parties: { publisherId: "pub_1", advertiserId: null, agentProfileId: null },
    wallets: [
        { kind: "PUBLISHER", partyId: "pub_1", walletId: "w1", balance: "12500.37", withdrawable: "12000.00", frozenAt: null },
    ],
    summary: {
        walletBalance: "12500.37",
        withdrawalsInFlight: blockers.some((b) => b.kind === "WITHDRAWALS_IN_FLIGHT") ? 1 : 0,
        openOrders: 0,
        openWork: 1,
        openCampaigns: 0,
        openAgreements: 2,
        openTickets: 0,
        canClose: blockers.every((b) => !b.blocking),
    },
    blockers,
});

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
});

describe("the blockers, drawn", () => {
    it("says which lines refuse the closure and which are only reported, off the server's flag", () => {
        render(
            <BlockerList
                blockers={[
                    {
                        kind: "WITHDRAWALS_IN_FLIGHT",
                        label: "Withdrawals ADX has already promised",
                        count: 1,
                        blocking: true,
                        detail: [{ id: "wd_1", reference: "WDR-2026-0042", status: "APPROVED" }],
                    },
                    {
                        kind: "OPEN_AGENT_WORK",
                        label: "Agent work in hand",
                        count: 3,
                        blocking: false,
                        detail: { offers: 1, visits: 2, milestones: 0 },
                    },
                ]}
            />,
        );
        const items = screen.getAllByRole("listitem").filter((li) => li.querySelector("span"));
        const withdrawal = items.find((li) => li.textContent?.includes("Withdrawals ADX has already promised"))!;
        expect(within(withdrawal).getByText("Blocks closure")).toBeInTheDocument();
        expect(within(withdrawal).getByText("WDR-2026-0042 · APPROVED")).toBeInTheDocument();

        const work = items.find((li) => li.textContent?.includes("Agent work in hand"))!;
        expect(within(work).getByText("Reported")).toBeInTheDocument();
        expect(within(work).getByText("1 offer, 2 visits — handed back by the closure")).toBeInTheDocument();
    });

    it("says so when nothing stands in the way", () => {
        render(<BlockerList blockers={[]} />);
        expect(screen.getByText(/nothing stands in the way/i)).toBeInTheDocument();
    });
});

describe("opening a case", () => {
    it("reads the review, prints the snapshot, and sends the reason with the ticket only when given", async () => {
        backend.review = review([]);
        const onChanged = vi.fn();
        render(<CloseAccountDialog userId="u1" name="Sharma Hoardings" open onOpenChange={vi.fn()} onChanged={onChanged} />);
        const dialog = within(await screen.findByRole("dialog"));

        expect(await dialog.findByText("Wallet balance")).toBeInTheDocument();
        // Once in the summary and once on the wallet line, both in paise.
        expect(dialog.getAllByText("₹12,500.37").length).toBeGreaterThanOrEqual(2);
        expect(dialog.getByText("Agreements signed")).toBeInTheDocument();

        const submit = dialog.getByRole("button", { name: "Open closure case" });
        expect(submit).toBeDisabled();
        fireEvent.change(dialog.getByLabelText("Reason"), { target: { value: "Owner asked by phone" } });
        fireEvent.change(dialog.getByLabelText("Support ticket"), { target: { value: "  " } });
        fireEvent.click(submit);

        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.calls).toContainEqual({
            method: "POST",
            path: "/users/u1/closure-cases",
            body: { reason: "Owner asked by phone" },
        });
        // The decision is offered straight after, on the case that came back.
        expect(await dialog.findByText("Closure case opened")).toBeInTheDocument();
        expect(dialog.getByRole("button", { name: "Record decision" })).toBeInTheDocument();
    });

    it("does not offer to open a case on an account that is already closed", async () => {
        backend.review = { ...review([]), closedAt: "2026-09-01T10:00:00.000Z" };
        render(<CloseAccountDialog userId="u1" name="Sharma Hoardings" open onOpenChange={vi.fn()} />);
        const dialog = within(await screen.findByRole("dialog"));
        expect(await dialog.findByText(/already closed on/i)).toBeInTheDocument();
        expect(dialog.queryByRole("button", { name: "Open closure case" })).not.toBeInTheDocument();
    });
});

describe("deciding", () => {
    it("shows the blockers a 409 CLOSURE_BLOCKED carries and leaves the case pending", async () => {
        backend.review = review([]);
        backend.decideFails = {
            status: 409,
            code: "CLOSURE_BLOCKED",
            message: "This account still has 1 orders still running. Settle those before closing it.",
            details: {
                userId: "u1",
                blockers: [
                    { kind: "OPEN_ORDERS", label: "Orders still running", count: 1, blocking: true, detail: ["ord_9"] },
                ],
            },
        };
        const onOpenChange = vi.fn();
        render(<CloseAccountDialog userId="u1" name="Sharma Hoardings" open onOpenChange={onOpenChange} />);
        const dialog = within(await screen.findByRole("dialog"));

        fireEvent.change(await dialog.findByLabelText("Reason"), { target: { value: "Owner asked by phone" } });
        fireEvent.click(dialog.getByRole("button", { name: "Open closure case" }));
        const decide = await dialog.findByRole("button", { name: "Record decision" });
        fireEvent.click(decide);

        expect(await dialog.findByText(/the closure was refused/i)).toBeInTheDocument();
        expect(dialog.getByText(/Orders still running/)).toBeInTheDocument();
        expect(dialog.getByText("ord_9")).toBeInTheDocument();
        expect(backend.calls).toContainEqual({
            method: "POST",
            path: "/users/closure-cases/cc_1/decide",
            body: { decision: "CLOSED" },
        });
        // Still open: the operator has something to go and settle.
        expect(onOpenChange).not.toHaveBeenCalledWith(false);
        expect(toast.success).not.toHaveBeenCalledWith("Account closed", expect.anything());
    });
});
