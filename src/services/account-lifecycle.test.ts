import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lot A — closing an account and erasing the person behind it.
 *
 * No Figma frame draws these screens, so what this file pins is the contract
 * and the shaping, not a layout — the three things the desk gets wrong if
 * nobody is watching:
 *
 * 1. The blockers are the server's. Which line refuses a closure and which is
 *    merely reported arrives as `blocking` on each; the console draws that and
 *    keeps no list of its own. The same goes for a 409 CLOSURE_BLOCKED: its
 *    blockers come off `details`, not off a message parsed by regex.
 *
 * 2. Money is a string the whole way. A wallet balance on a case is what the
 *    ledger held when it was raised; it becomes a number nowhere.
 *
 * 3. The bodies are exactly the schemas'. An empty loss note is not sent as
 *    `""` — the server's floor is three characters and it would refuse — and
 *    a ticket id is only sent when there is one.
 */

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, isLive: () => true };
});

const { backend } = vi.hoisted(() => {
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        answer: undefined as unknown,
        fail: null as null | { status: number; code: string; message: string; details?: unknown },
        reset() {
            this.calls = [];
            this.answer = undefined;
            this.fail = null;
        },
    };
    return { backend };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        if (backend.fail) {
            const { status, code, message, details } = backend.fail;
            throw new actual.ApiError(status, code, message, details);
        }
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

import { ApiError } from "@/lib/api-client";
import {
    CLOSURE_DECISIONS,
    CLOSURE_DECISION_META,
    ERASURE_STATUSES,
    ERASURE_STATUS_META,
    blockerDetailLines,
    blockingOf,
    closureBlockedBlockers,
    daysUntil,
    dueLabel,
    dueTone,
    personLabel,
    userHistoryOf,
    accountLifecycleService,
    type ClosureBlocker,
} from "./users";

beforeEach(() => backend.reset());

const blocker = (over: Partial<ClosureBlocker> = {}): ClosureBlocker => ({
    kind: "OPEN_ORDERS",
    label: "Orders still running",
    count: 2,
    blocking: true,
    detail: ["ord_1", "ord_2"],
    ...over,
});

describe("the review's blockers", () => {
    it("takes the blocking flag from the server rather than deciding by kind", () => {
        const lines = [
            blocker({ kind: "WITHDRAWALS_IN_FLIGHT", blocking: true, count: 1 }),
            blocker({ kind: "OPEN_AGENT_WORK", blocking: false, count: 3 }),
            blocker({ kind: "WALLET_BALANCE", blocking: false, count: 1 }),
        ];
        expect(blockingOf(lines).map((line) => line.kind)).toEqual(["WITHDRAWALS_IN_FLIGHT"]);
        // A kind the console has never heard of still counts if the server says so.
        expect(blockingOf([blocker({ kind: "SOMETHING_NEW", blocking: true })])).toHaveLength(1);
    });

    it("prints a withdrawal by its reference and status", () => {
        const lines = blockerDetailLines(
            blocker({
                kind: "WITHDRAWALS_IN_FLIGHT",
                detail: [
                    { id: "wd_1", reference: "WDR-2026-0042", status: "APPROVED" },
                    { id: "wd_2", reference: null, status: "REQUESTED" },
                ],
            })
        );
        expect(lines).toEqual(["WDR-2026-0042 · APPROVED", "wd_2 · REQUESTED"]);
    });

    it("prints order ids as they came", () => {
        expect(blockerDetailLines(blocker())).toEqual(["ord_1", "ord_2"]);
    });

    it("folds agent work into one line and says the closure hands it back", () => {
        const lines = blockerDetailLines(
            blocker({ kind: "OPEN_AGENT_WORK", blocking: false, detail: { offers: 1, visits: 2, milestones: 0 } })
        );
        expect(lines).toEqual(["1 offer, 2 visits — handed back by the closure"]);
    });

    it("keeps a wallet balance as the string it arrived as", () => {
        const lines = blockerDetailLines(
            blocker({
                kind: "WALLET_BALANCE",
                blocking: false,
                detail: {
                    balance: "12500.37",
                    wallets: [
                        { kind: "PUBLISHER", partyId: "p", walletId: "w1", balance: "12500.37", withdrawable: "12500.37", frozenAt: null },
                        { kind: "AGENT", partyId: "a", walletId: "w2", balance: "0.00", withdrawable: "0.00", frozenAt: null },
                    ],
                },
            })
        );
        // The empty wallet is not listed; the paise on the full one survive.
        expect(lines).toEqual(["Publisher wallet · 12500.37"]);
    });

    it("prints nothing for a shape it does not know, never [object Object]", () => {
        expect(blockerDetailLines(blocker({ kind: "OPEN_AGREEMENTS", detail: undefined }))).toEqual([]);
        expect(blockerDetailLines(blocker({ kind: "OPEN_TICKETS", detail: { weird: true } }))).toEqual([]);
        expect(blockerDetailLines(blocker({ kind: "OPEN_ORDERS", detail: "not a list" }))).toEqual([]);
    });
});

describe("reading a refusal", () => {
    it("takes the blockers a 409 CLOSURE_BLOCKED carries in its details", () => {
        const refused = new ApiError(409, "CLOSURE_BLOCKED", "This account still has 1 orders still running.", {
            userId: "u1",
            blockers: [blocker({ count: 1, detail: ["ord_9"] })],
        });
        expect(closureBlockedBlockers(refused)).toEqual([blocker({ count: 1, detail: ["ord_9"] })]);
    });

    it("answers nothing for any other error", () => {
        expect(closureBlockedBlockers(new ApiError(409, "CONFLICT", "Already decided."))).toEqual([]);
        expect(closureBlockedBlockers(new Error("network"))).toEqual([]);
        expect(closureBlockedBlockers(new ApiError(409, "CLOSURE_BLOCKED", "no details"))).toEqual([]);
    });

    it("takes what a 409 USER_HAS_HISTORY says the account has behind it", () => {
        const refused = new ApiError(409, "USER_HAS_HISTORY", "Close it instead.", {
            userId: "u1",
            has: [
                { kind: "orders", label: "orders", count: 3 },
                { kind: "kyc", label: "KYC record", count: 1 },
            ],
            closeWith: "account closure",
        });
        expect(userHistoryOf(refused).map((line) => `${line.count} ${line.label}`)).toEqual(["3 orders", "1 KYC record"]);
        expect(userHistoryOf(new ApiError(404, "NOT_FOUND", "gone"))).toEqual([]);
    });
});

describe("the wire", () => {
    it("raises a case with the reason, and the ticket only when there is one", async () => {
        backend.answer = { case: { id: "cc_1" }, summary: {}, blockers: [] };
        await accountLifecycleService.createClosureCase("u1", { reason: "Owner asked by phone" });
        await accountLifecycleService.createClosureCase("u1", { reason: "From the thread", ticketId: "tk_7" });

        expect(backend.calls[0]).toEqual({
            method: "POST",
            path: "/users/u1/closure-cases",
            body: { reason: "Owner asked by phone" },
        });
        expect(backend.calls[1].body).toEqual({ reason: "From the thread", ticketId: "tk_7" });
    });

    it("decides without sending an empty loss note the server would refuse", async () => {
        backend.answer = { case: { id: "cc_1" }, outcome: null };
        await accountLifecycleService.decideClosure("cc_1", { decision: "REFUSED", lossNote: "   " });
        await accountLifecycleService.decideClosure("cc_1", { decision: "CLOSED", lossNote: " Written off: ₹40 " });

        expect(backend.calls[0]).toEqual({
            method: "POST",
            path: "/users/closure-cases/cc_1/decide",
            body: { decision: "REFUSED" },
        });
        expect(backend.calls[1].body).toEqual({ decision: "CLOSED", lossNote: "Written off: ₹40" });
    });

    it("sends the decision facet and the search to the API rather than filtering a page", async () => {
        backend.answer = { items: [], total: 0, page: 1, pageSize: 50, counts: {} };
        await accountLifecycleService.closureCases({ decision: "PENDING", q: " sharma ", pageSize: 50 });
        expect(backend.calls[0].path).toBe("/users/closure-cases?q=sharma&page=1&pageSize=50&decision=PENDING");

        await accountLifecycleService.erasureRequests({ status: "APPROVED", page: 2 });
        expect(backend.calls[1].path).toBe("/users/erasure?page=2&pageSize=20&status=APPROVED");
    });

    it("raises an erasure at the desk by default, and only says why when told", async () => {
        backend.answer = { id: "er_1" };
        await accountLifecycleService.raiseErasure("u1");
        await accountLifecycleService.raiseErasure("u1", { reason: "Asked by email", requestedVia: "EMAIL" });

        expect(backend.calls[0].body).toEqual({ requestedVia: "OPS" });
        expect(backend.calls[1].body).toEqual({ requestedVia: "EMAIL", reason: "Asked by email" });
    });

    it("signs, refuses and executes on the request's own routes", async () => {
        backend.answer = { id: "er_1" };
        await accountLifecycleService.approveErasure("er_1", " Priya Nair ");
        await accountLifecycleService.refuseErasure("er_1", "Not the account holder");
        await accountLifecycleService.executeErasure("er_1");

        expect(backend.calls).toEqual([
            { method: "POST", path: "/users/erasure/er_1/approve", body: { dpoName: "Priya Nair" } },
            { method: "POST", path: "/users/erasure/er_1/refuse", body: { reason: "Not the account holder" } },
            { method: "POST", path: "/users/erasure/er_1/execute", body: undefined },
        ]);
    });

    it("keeps only the closure columns off the admin read", async () => {
        backend.answer = {
            id: "u1",
            name: "Sharma Hoardings",
            mobile: "+919845012345",
            email: "x@y.in",
            closedAt: "2026-09-01T10:00:00.000Z",
            closeReason: "Owner retired",
            roles: ["PUBLISHER"],
            roleConfig: null,
        };
        const state = await accountLifecycleService.closedState("u1");
        expect(state).toEqual({
            id: "u1",
            name: "Sharma Hoardings",
            mobile: "+919845012345",
            closedAt: "2026-09-01T10:00:00.000Z",
            closeReason: "Owner retired",
        });
        expect(backend.calls[0].path).toBe("/users/u1");
    });
});

describe("the erasure clock", () => {
    const now = new Date("2026-09-12T09:00:00.000Z");

    it("counts whole days to the deadline, negative once it has passed", () => {
        expect(daysUntil("2026-09-24T09:00:00.000Z", now)).toBe(12);
        expect(daysUntil("2026-09-12T20:00:00.000Z", now)).toBe(0);
        expect(daysUntil("2026-09-09T09:00:00.000Z", now)).toBe(-3);
    });

    it("paints an open request by how close the day is, and a settled one neutral", () => {
        expect(dueTone({ status: "PENDING", dueAt: "2026-10-01T00:00:00.000Z" }, now)).toBe("success");
        expect(dueTone({ status: "PENDING", dueAt: "2026-09-15T00:00:00.000Z" }, now)).toBe("warning");
        expect(dueTone({ status: "APPROVED", dueAt: "2026-09-01T00:00:00.000Z" }, now)).toBe("danger");
        expect(dueTone({ status: "DONE", dueAt: "2026-09-01T00:00:00.000Z" }, now)).toBe("neutral");
        expect(dueTone({ status: "REFUSED", dueAt: "2026-09-01T00:00:00.000Z" }, now)).toBe("neutral");
    });

    it("says it in words", () => {
        expect(dueLabel({ status: "PENDING", dueAt: "2026-09-24T09:00:00.000Z" }, now)).toBe("Due in 12 days");
        expect(dueLabel({ status: "PENDING", dueAt: "2026-09-13T08:00:00.000Z" }, now)).toBe("Due today");
        expect(dueLabel({ status: "PENDING", dueAt: "2026-09-11T09:00:00.000Z" }, now)).toBe("Overdue by 1 day");
        expect(dueLabel({ status: "DONE", dueAt: "2026-09-11T09:00:00.000Z" }, now)).toBe("Done");
    });
});

describe("labels", () => {
    it("has a badge for every decision and every erasure status", () => {
        expect(CLOSURE_DECISIONS).toHaveLength(3);
        for (const decision of CLOSURE_DECISIONS) expect(CLOSURE_DECISION_META[decision].label).toMatch(/\S/);
        expect(ERASURE_STATUSES).toHaveLength(4);
        for (const status of ERASURE_STATUSES) expect(ERASURE_STATUS_META[status].label).toMatch(/\S/);
    });

    it("names a person by name, then number, then id — never blank", () => {
        expect(personLabel({ id: "u1", name: "Asha", mobile: "+919800000000", closedAt: null })).toBe("Asha");
        expect(personLabel({ id: "u1", name: "  ", mobile: "+919800000000", closedAt: null })).toBe("+919800000000");
        expect(personLabel(null, "u1")).toBe("u1");
        expect(personLabel(null)).toBe("—");
    });
});
