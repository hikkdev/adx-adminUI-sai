import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Order screening (the owner, 2 Oct 2026) — what the console makes of the
 * score, and what it sends.
 *
 * 1. The screening is gathered off the flat admin row; a read without the
 *    fields is "not served" (null), not "not scored".
 * 2. Signals are said in plain words, strongest first, and the Why cell is
 *    the top two and "+N more".
 * 3. Which move applies to which order is one rule (`reviewSkip`) for the
 *    row menu, the bulk plan and the order page.
 * 4. The bodies and paths are the contract's; a bulk answer is per order,
 *    and an order it leaves out is a failure.
 * 5. Settings › Fraud types the thresholds as the 0–100 score and keeps an
 *    untouched stored value exactly.
 */

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, isLive: () => true };
});

const { backend } = vi.hoisted(() => {
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        answer: undefined as unknown,
        fail: null as null | { status: number; code: string; message: string },
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
        if (backend.fail) throw new actual.ApiError(backend.fail.status, backend.fail.code, backend.fail.message);
        return typeof backend.answer === "function" ? (backend.answer as (body: unknown) => unknown)(body) : backend.answer;
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

import { shapeOrder } from "./orders";
import {
    ORDER_SCREENING_DEFAULTS,
    ORDER_SIGNAL_WORDS,
    REVIEW_FILTER_OPTIONS,
    REVIEW_STATE_META,
    caseIdOf,
    clearedKey,
    fraudCaseHref,
    fromScreeningDraft,
    orderScreeningService,
    outcomeOf,
    reviewPath,
    reviewSkip,
    reviewStateOf,
    riskPercent,
    runReview,
    screeningDraftProblems,
    screeningSignals,
    shapeReviewPage,
    sideOf,
    signalWords,
    sumImpacts,
    toScreeningDraft,
    whyLine,
} from "./order-screening";
import type { Order, OrderScreening } from "@/types";

beforeEach(() => backend.reset());

const wire = {
    id: "ord_1",
    status: "PENDING_PUBLISHER" as const,
    campaignName: null,
    budget: 250000,
    startDate: null,
    endDate: null,
    slotTime: null,
    createdAt: "2026-10-02T10:00:00+05:30",
    agentId: null,
    listing: { title: "MG Road Billboard", city: "Bengaluru" },
};

const screening = (over: Partial<OrderScreening> = {}): OrderScreening => ({
    score: 0.72,
    band: "REVIEW",
    signals: [],
    scoredAt: "2026-10-02T10:01:00+05:30",
    reviewStatus: "FLAGGED",
    reviewedById: null,
    reviewedByName: null,
    reviewedAt: null,
    reviewNote: null,
    clearedSignalKeys: [],
    heldAt: null,
    heldById: null,
    heldByName: null,
    holdReason: null,
    fraudCaseId: null,
    ...over,
});

const order = (over: Partial<Order> = {}): Order => ({ ...shapeOrder(wire), screening: screening(), ...over });

describe("the screening off the admin row", () => {
    it("is null when the read carries none of the fields — a backend older than the screening", () => {
        expect(shapeOrder(wire).screening).toBeNull();
    });

    it("reads the Decimal score as a string or a number, and the signals with their side", () => {
        const shaped = shapeOrder({
            ...wire,
            riskScore: "0.912",
            riskBand: "HOLD",
            riskSignals: [{ key: "ORDER_VELOCITY", weight: "0.3", value: 1, detail: "6 orders in 40 minutes", side: "ORDER" }],
            riskReviewStatus: "FLAGGED",
            heldAt: "2026-10-02T11:00:00+05:30",
            heldById: null,
            holdReason: "Automatic",
            riskClearedSignalKeys: ["ADVERTISER:SHARED_DEVICE"],
        }).screening!;
        expect(shaped.score).toBe(0.912);
        expect(shaped.band).toBe("HOLD");
        expect(shaped.signals).toEqual([{ key: "ORDER_VELOCITY", weight: 0.3, value: 1, detail: "6 orders in 40 minutes", side: "ORDER" }]);
        expect(shaped.heldAt).toBe("2026-10-02T11:00:00+05:30");
        expect(shaped.clearedSignalKeys).toEqual(["ADVERTISER:SHARED_DEVICE"]);
        expect(shapeOrder({ ...wire, riskScore: 0.4 }).screening!.score).toBe(0.4);
    });

    it("is an object with a null score when the fields come but the order is not scored yet", () => {
        const shaped = shapeOrder({ ...wire, riskScore: null, riskReviewStatus: null }).screening!;
        expect(shaped.score).toBeNull();
        expect(riskPercent(shaped.score)).toBeNull();
    });
});

describe("where a row stands", () => {
    it("says confirmed over held, and held over flagged", () => {
        expect(reviewStateOf(screening({ reviewStatus: "CONFIRMED_FRAUD", heldAt: "x" }))).toBe("CONFIRMED_FRAUD");
        expect(reviewStateOf(screening({ reviewStatus: "FLAGGED", heldAt: "x" }))).toBe("HELD");
        expect(reviewStateOf(screening())).toBe("FLAGGED");
        expect(reviewStateOf(screening({ reviewStatus: "CLEARED" }))).toBe("CLEARED");
        expect(reviewStateOf(screening({ reviewStatus: null }))).toBe("NONE");
        expect(reviewStateOf(null)).toBe("NONE");
        expect(REVIEW_STATE_META.HELD.label).toBe("Held");
    });

    it("prints the score 0–100, whole, clamped", () => {
        expect(riskPercent(0.724)).toBe(72);
        expect(riskPercent(1.2)).toBe(100);
        expect(riskPercent(-1)).toBe(0);
    });

    it("offers the five filters with Flagged first and Everyone last", () => {
        expect(REVIEW_FILTER_OPTIONS.map((option) => option.label)).toEqual(["Flagged", "Held", "Cleared", "Confirmed fraud", "Everyone"]);
    });
});

describe("signals in plain words", () => {
    it("names the six order signals as the owner worded them", () => {
        expect(signalWords("NEW_ACCOUNT_BIG_ORDER")).toBe("New account, large order");
        expect(signalWords("ORDER_VELOCITY")).toBe("Many orders in a short time");
        expect(signalWords("DUPLICATE_ORDER")).toBe("Same spot and dates ordered twice");
        expect(signalWords("PAYMENT_TROUBLE")).toBe("Payment trouble");
        expect(signalWords("LINKED_PARTIES")).toBe("Advertiser and publisher look linked");
        expect(signalWords("PRIOR_CONFIRMED_FRAUD")).toBe("Previously confirmed fraud");
    });

    it("says every party signal in words, and makes an unknown key readable", () => {
        for (const key of ["SHARED_PAN", "SHARED_BANK", "SHARED_IP_SUBNET", "SHARED_PHONE_ACROSS_ROLES", "SHARED_DEVICE", "BANK_NAME_MISMATCH", "DUPLICATE_LISTING_PHOTOS", "PROOF_FAR_FROM_SITE", "SELF_DEALING", "COMMISSION_FARMING", "REFUND_DISPUTE_RATE", "WITHDRAW_AFTER_CREDIT", "LISTING_VELOCITY"]) {
            expect(ORDER_SIGNAL_WORDS[key]).toBeTruthy();
            expect(signalWords(key)).not.toMatch(/_/);
        }
        expect(signalWords("SOMETHING_NEW")).toBe("Something new");
    });

    it("reads the side in any case, and anything else as the order's own", () => {
        expect(sideOf({ side: "ADVERTISER" })).toBe("advertiser");
        expect(sideOf({ side: "publisher" })).toBe("publisher");
        expect(sideOf({ side: "ORDER" })).toBe("order");
        expect(sideOf({ side: null })).toBe("order");
    });

    it("lists what was found strongest first, leaves out a zero, marks the cleared ones by side and key", () => {
        const rows = screeningSignals(
            screening({
                signals: [
                    { key: "SHARED_DEVICE", weight: 0.2, value: 1, detail: "Same phone", side: "ADVERTISER" },
                    { key: "ORDER_VELOCITY", weight: 0.3, value: 1, detail: "6 in 40 min", side: "ORDER" },
                    { key: "SHARED_PAN", weight: 0.35, value: 0, detail: "none", side: "PUBLISHER" },
                    { key: "PAYMENT_TROUBLE", weight: 0.2, value: null, detail: "Not recorded", side: "ORDER" },
                    { key: "SHARED_DEVICE", weight: 0.1, value: 1, detail: "Same phone", side: "PUBLISHER" },
                ],
                clearedSignalKeys: ["ADVERTISER:SHARED_DEVICE", "ORDER:ORDER_VELOCITY"],
            }),
        );
        expect(rows.map((row) => `${row.side}:${row.key}`)).toEqual(["order:ORDER_VELOCITY", "advertiser:SHARED_DEVICE", "publisher:SHARED_DEVICE", "order:PAYMENT_TROUBLE"]);
        expect(rows.map((row) => row.cleared)).toEqual([true, true, false, false]);
        expect(rows[3]!.contribution).toBe(0);
    });

    it("remembers a cleared signal as SIDE:KEY, the wire's upper case", () => {
        expect(clearedKey({ key: "SHARED_PAN", side: "advertiser" })).toBe("ADVERTISER:SHARED_PAN");
        expect(clearedKey({ key: "ORDER_VELOCITY", side: "ORDER" })).toBe("ORDER:ORDER_VELOCITY");
        expect(clearedKey({ key: "PAYMENT_TROUBLE", side: null })).toBe("ORDER:PAYMENT_TROUBLE");
    });

    it("draws the Why cell as the top two and how many more", () => {
        const many = screening({
            signals: ["ORDER_VELOCITY", "DUPLICATE_ORDER", "LINKED_PARTIES", "PAYMENT_TROUBLE"].map((key, index) => ({ key, weight: 0.4 - index * 0.05, value: 1, detail: "", side: "ORDER" })),
        });
        expect(whyLine(many)).toEqual({ words: ["Many orders in a short time", "Same spot and dates ordered twice"], more: 2 });
        expect(whyLine(screening())).toEqual({ words: [], more: 0 });
    });
});

describe("which move applies to which order", () => {
    it("holds an open, unheld order — never a held, finished or confirmed one", () => {
        expect(reviewSkip("HOLD", order())).toBeNull();
        expect(reviewSkip("HOLD", order({ screening: screening({ heldAt: "x" }) }))).toBe("already held");
        expect(reviewSkip("HOLD", order({ status: "COMPLETED" }))).toBe("completed");
        expect(reviewSkip("HOLD", order({ screening: screening({ reviewStatus: "CONFIRMED_FRAUD" }) }))).toBe("confirmed fraud");
    });

    it("releases only a held order", () => {
        expect(reviewSkip("RELEASE", order())).toBe("not held");
        expect(reviewSkip("RELEASE", order({ screening: screening({ heldAt: "x" }) }))).toBeNull();
    });

    it("clears a flagged or held order, not a cleared, confirmed or unflagged one", () => {
        expect(reviewSkip("CLEAR", order())).toBeNull();
        expect(reviewSkip("CLEAR", order({ screening: screening({ heldAt: "x" }) }))).toBeNull();
        expect(reviewSkip("CLEAR", order({ screening: screening({ reviewStatus: "CLEARED" }) }))).toBe("already cleared");
        expect(reviewSkip("CLEAR", order({ screening: null }))).toBe("not flagged");
    });

    it("offers cancel as fraud on anything not cancelled — a live order is the server's to refuse, with its sentence", () => {
        expect(reviewSkip("CONFIRM_FRAUD", order())).toBeNull();
        expect(reviewSkip("CONFIRM_FRAUD", order({ status: "PENDING_OTP" }))).toBeNull();
        expect(reviewSkip("CONFIRM_FRAUD", order({ status: "COMPLETED" }))).toBeNull();
        expect(reviewSkip("CONFIRM_FRAUD", order({ status: "CANCELLED" }))).toBe("already cancelled");
        expect(reviewSkip("CONFIRM_FRAUD", order({ screening: screening({ reviewStatus: "CONFIRMED_FRAUD" }) }))).toBe("already confirmed");
    });
});

describe("the cancel impact", () => {
    it("sums the money as strings, counts the agents, says each effect and destination once, and counts the unread", () => {
        const live = "The advertisement on this order is already up. Cancelling now would not undo what has run — raise a dispute on the order instead.";
        const total = sumImpacts([
            {
                cancellable: true,
                blockedReason: null,
                refund: { amount: "1000.50", to: "ADVERTISER_WALLET", note: "Unused days" },
                publisherReversal: { amount: "0.00", accruedToDate: "800.00", note: "Stays" },
                agentsReleased: 1,
                campaignEffects: ["Campaign CMP-1: this spot is cancelled; the rest of the campaign runs on."],
            },
            {
                cancellable: true,
                refund: { amount: "0.00", to: "NONE", note: "A direct booking" },
                publisherReversal: { amount: "0.00", accruedToDate: "1600.00", note: "Stays" },
                agentsReleased: 0,
                campaignEffects: ["Campaign CMP-1: this spot is cancelled; the rest of the campaign runs on."],
            },
            { cancellable: false, blockedReason: live, refund: { amount: "0.00", to: "NONE" }, publisherReversal: { amount: "0.00", accruedToDate: "500.00" }, agentsReleased: 0, campaignEffects: [] },
            null,
        ]);
        expect(total).toEqual({
            orders: 3,
            unread: 1,
            refund: "1000.50",
            refundTo: ["the advertiser's wallet"],
            publisherReversal: "0.00",
            publisherAccrued: "2900.00",
            agentsReleased: 1,
            campaignEffects: ["Campaign CMP-1: this spot is cancelled; the rest of the campaign runs on."],
            blocked: 1,
            blockedReasons: [live],
        });
    });
});

describe("the queue on the wire", () => {
    it("asks for flagged, highest risk first by default, and caps the page at the bulk limit", () => {
        expect(reviewPath()).toBe("/orders/fraud-review?status=FLAGGED&sort=score&pageSize=25");
        expect(reviewPath({ status: "HELD", q: " rao ", sort: "newest", page: 3, pageSize: 500 })).toBe("/orders/fraud-review?status=HELD&q=rao&sort=newest&page=3&pageSize=100");
    });

    it("shapes the rows as orders and keeps only the counts it knows", () => {
        const page = shapeReviewPage({ items: [{ ...wire, riskScore: "0.6", riskReviewStatus: "FLAGGED" }], total: 1, counts: { FLAGGED: 1, HELD: 0, ALL: 9, OTHER: 4 } });
        expect(page.items[0]!.screening!.score).toBe(0.6);
        expect(page.counts).toEqual({ FLAGGED: 1, HELD: 0, ALL: 9 });
        expect(page.page).toBe(1);
    });

    it("lists through the route", async () => {
        backend.answer = { items: [], total: 0, page: 1, pageSize: 25, counts: {} };
        await orderScreeningService.list({ status: "CLEARED" });
        expect(backend.calls).toEqual([{ method: "GET", path: "/orders/fraud-review?status=CLEARED&sort=score&pageSize=25", body: undefined }]);
    });
});

describe("the moves on the wire", () => {
    it("sends the reason to hold and to confirm, and a note only when one was typed", async () => {
        await orderScreeningService.hold("ord_1", "Big first order");
        await orderScreeningService.release("ord_1", "  ");
        await orderScreeningService.clear("ord_1", " Known agency ");
        await orderScreeningService.confirmFraud("ord_1", "Stolen card");
        await orderScreeningService.rescore("ord_1");
        await orderScreeningService.cancelImpact("ord_1");
        expect(backend.calls).toEqual([
            { method: "POST", path: "/orders/ord_1/hold", body: { reason: "Big first order" } },
            { method: "POST", path: "/orders/ord_1/release", body: {} },
            { method: "POST", path: "/orders/ord_1/clear", body: { note: "Known agency" } },
            { method: "POST", path: "/orders/ord_1/confirm-fraud", body: { reason: "Stolen card" } },
            { method: "POST", path: "/orders/ord_1/rescore", body: {} },
            { method: "GET", path: "/orders/ord_1/cancel-impact", body: undefined },
        ]);
    });

    it("runs one order through its own route, and several through the bulk route", async () => {
        const one = order();
        expect(await runReview("HOLD", [one], "Checking")).toEqual({ done: [one], failed: [] });
        expect(backend.calls.at(-1)).toEqual({ method: "POST", path: "/orders/ord_1/hold", body: { reason: "Checking" } });

        const two = order({ id: "ord_2" });
        backend.answer = { results: [{ id: "ord_1", ok: true }, { id: "ord_2", ok: false, code: "ORDER_ON_HOLD", message: "Already held." }] };
        const outcome = await runReview("HOLD", [one, two], "Checking");
        expect(backend.calls.at(-1)).toEqual({ method: "POST", path: "/orders/fraud-review/bulk", body: { action: "HOLD", orderIds: ["ord_1", "ord_2"], reason: "Checking" } });
        expect(outcome.done).toEqual([one]);
        expect(outcome.failed).toEqual([{ row: two, message: "Already held." }]);
    });

    it("never throws: a refused single call is that order's failure, with the server's sentence", async () => {
        backend.fail = { status: 409, code: "ORDER_COMPLETED", message: "This order is complete — raise a dispute instead." };
        const one = order();
        expect(await runReview("CONFIRM_FRAUD", [one], "Stolen card")).toEqual({ done: [], failed: [{ row: one, message: "This order is complete — raise a dispute instead." }] });
    });

    it("splits a bulk run into calls of at most a hundred", async () => {
        backend.answer = (body: unknown) => ({ results: (body as { orderIds: string[] }).orderIds.map((id) => ({ id, ok: true })) });
        const ids = Array.from({ length: 130 }, (_, index) => `ord_${index}`);
        const results = await orderScreeningService.bulk("CLEAR", ids);
        expect(backend.calls.map((call) => (call.body as { orderIds: string[] }).orderIds.length)).toEqual([100, 30]);
        expect(results).toHaveLength(130);
        expect(backend.calls[0]!.body).not.toHaveProperty("reason");
    });

    it("counts an order the bulk answer leaves out as failed", () => {
        const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
        const outcome = outcomeOf(rows, [{ id: "a", ok: true }, { id: "b", ok: false, code: "ORDER_ON_HOLD" }]);
        expect(outcome.done).toEqual([{ id: "a" }]);
        expect(outcome.failed).toEqual([
            { row: { id: "b" }, message: "ORDER_ON_HOLD" },
            { row: { id: "c" }, message: "No answer came back for this order." },
        ]);
    });

    it("finds the case id whichever shape the answer came in, and opens it on the desk", () => {
        expect(caseIdOf({ fraudCaseId: "fc_1", fraudCase: { id: "fc_1", displayId: "FC-0210-2601", status: "OPEN" }, opened: true, attached: false })).toBe("fc_1");
        expect(caseIdOf({ fraudCase: { id: "fc_2" } })).toBe("fc_2");
        expect(caseIdOf(null)).toBeNull();
        expect(fraudCaseHref("fc_1")).toBe("/disputes/fraud?case=fc_1");
    });
});

describe("Settings › Fraud", () => {
    it("ships in watch mode: screening on, automatic holds off", () => {
        expect(ORDER_SCREENING_DEFAULTS).toMatchObject({ enabled: true, autoHold: false, reviewThreshold: 0.5, holdThreshold: 0.8 });
    });

    it("types the thresholds as the 0–100 score and sends them 0–1", () => {
        const draft = toScreeningDraft(ORDER_SCREENING_DEFAULTS);
        expect(draft.reviewAt).toBe("50");
        expect(draft.holdAt).toBe("80");
        expect(fromScreeningDraft({ ...draft, reviewAt: "62.5" }, ORDER_SCREENING_DEFAULTS)!.reviewThreshold).toBe(0.625);
    });

    it("keeps an untouched stored threshold exactly", () => {
        const stored = { ...ORDER_SCREENING_DEFAULTS, reviewThreshold: 0.555 };
        const draft = toScreeningDraft(stored);
        expect(draft.reviewAt).toBe("55.5");
        expect(fromScreeningDraft(draft, stored)!.reviewThreshold).toBe(0.555);
    });

    it("refuses what the server would: out of range, a hold line under the review line, a fraction of a day", () => {
        const draft = toScreeningDraft(ORDER_SCREENING_DEFAULTS);
        expect(screeningDraftProblems(draft)).toEqual([]);
        expect(screeningDraftProblems({ ...draft, reviewAt: "101" })).toContain("reviewAt");
        expect(screeningDraftProblems({ ...draft, reviewAt: "90", holdAt: "80" })).toEqual(["order"]);
        expect(screeningDraftProblems({ ...draft, newAccountDays: "1.5" })).toEqual(["newAccountDays"]);
        expect(screeningDraftProblems({ ...draft, newAccountDays: "366" })).toEqual(["newAccountDays"]);
        expect(screeningDraftProblems({ ...draft, bigOrderAmount: "150000.50" })).toEqual([]);
        expect(screeningDraftProblems({ ...draft, bigOrderAmount: "100000001" })).toEqual(["bigOrderAmount"]);
        expect(screeningDraftProblems({ ...draft, velocityCount: "1001" })).toEqual(["velocityCount"]);
        expect(screeningDraftProblems({ ...draft, velocityMinutes: "10080" })).toEqual([]);
        expect(screeningDraftProblems({ ...draft, velocityMinutes: "10081" })).toEqual(["velocityMinutes"]);
        expect(screeningDraftProblems({ ...draft, reviewAt: "80", holdAt: "80" })).toEqual([]);
        expect(screeningDraftProblems({ ...draft, velocityMinutes: "0" })).toEqual(["velocityMinutes"]);
        expect(fromScreeningDraft({ ...draft, bigOrderAmount: "" }, ORDER_SCREENING_DEFAULTS)).toBeNull();
    });
});
