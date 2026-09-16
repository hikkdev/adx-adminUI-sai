import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

/**
 * The publisher page's subscription card — Lot J leftover (b) and Lot J2.
 *
 * What this pins: the four reads degrade on their own — the orders read
 * answering 503 FEATURE_OFF leaves the subscriptions drawn and says
 * self-service is off, any other failure says the orders could not be
 * read, a failed plans read only disables Grant; the running term shows
 * its auto-renew flag; an ended term inside the policy's grace says so;
 * a trial order is marked as one.
 */

const { subscriptions, subscriptionOrders, plans, settingsGet, roster } = vi.hoisted(() => ({
    subscriptions: vi.fn(),
    subscriptionOrders: vi.fn(),
    plans: vi.fn(),
    settingsGet: vi.fn(),
    roster: vi.fn(),
}));

vi.mock("@/services/revenue", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/revenue")>();
    return { ...actual, revenueService: { ...actual.revenueService, subscriptions, subscriptionOrders, plans } };
});

vi.mock("@/services/settings", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/settings")>();
    return { ...actual, settingsReadApi: () => true, settingsService: { ...actual.settingsService, get: settingsGet } };
});

vi.mock("@/services/supply", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/supply")>();
    return { ...actual, supplyService: { ...actual.supplyService, roster } };
});

import { ApiError } from "@/lib/api-client";
import type { SubscriptionOrder } from "@/services/revenue";
import type { PublisherSubscription } from "@/types/revenue";
import { SubscriptionCard, readPublisherSubscriptionFacts, splitSubscriptions } from "./subscription-card";

const now = new Date();
const daysFromNow = (days: number) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

const row = (over: Partial<PublisherSubscription> = {}): PublisherSubscription => ({
    id: "sub_1",
    publisherId: "pub_1",
    tier: "PLUS",
    ratePct: "0.1250",
    pricePerMonth: "2499.00",
    startsAt: daysFromNow(-20),
    endsAt: daysFromNow(10),
    source: "SELF_SERVICE",
    planName: "Plus",
    createdAt: null,
    publisherName: "Metro Hoardings",
    publisherDisplayId: "PUB-0001",
    autoRenew: true,
    state: "RUNNING",
    ...over,
});

const order = (over: Partial<SubscriptionOrder> = {}): SubscriptionOrder => ({
    id: "ord_1",
    reference: "SUB-2026-0001",
    publisherId: "pub_1",
    publisherName: "Metro Hoardings",
    tier: "PLUS",
    planName: "Plus",
    cycle: "MONTHLY",
    months: 0,
    pricePerMonth: "2499.00",
    ratePct: "0.1250",
    subtotal: "0.00",
    discountPct: "0",
    discountAmount: "0.00",
    gstPct: "0.18",
    gstAmount: "0.00",
    total: "0.00",
    status: "PAID",
    startsAt: daysFromNow(-20),
    paidAt: daysFromNow(-20),
    paidMethod: "TRIAL",
    paidReference: null,
    cancelledAt: null,
    subscriptionId: "sub_1",
    createdAt: daysFromNow(-20),
    ...over,
});

const settings = { subscriptions: { publisher: { graceDays: 7 } } };

beforeEach(() => {
    subscriptions.mockReset().mockResolvedValue([row()]);
    subscriptionOrders.mockReset().mockResolvedValue({ items: [order()], total: 1, page: 1, pageSize: 5, counts: {} });
    plans.mockReset().mockResolvedValue([]);
    settingsGet.mockReset().mockResolvedValue(settings);
    roster.mockReset().mockResolvedValue([]);
});

describe("readPublisherSubscriptionFacts", () => {
    it("keeps the subscriptions when the orders read answers FEATURE_OFF", async () => {
        subscriptionOrders.mockRejectedValue(new ApiError(503, "FEATURE_OFF", "Publisher plans are switched off"));
        const facts = await readPublisherSubscriptionFacts("pub_1");
        expect(facts.subscriptions).toHaveLength(1);
        expect(facts.orders).toEqual({ kind: "OFF" });
        expect(facts.graceDays).toBe(7);
    });

    it("marks any other orders failure as unread, a failed plans read as no plans, a failed settings read as no grace", async () => {
        subscriptionOrders.mockRejectedValue(new Error("boom"));
        plans.mockRejectedValue(new Error("boom"));
        settingsGet.mockRejectedValue(new Error("boom"));
        const facts = await readPublisherSubscriptionFacts("pub_1");
        expect(facts.orders).toEqual({ kind: "FAILED" });
        expect(facts.plans).toEqual([]);
        expect(facts.graceDays).toBe(0);
        expect(facts.subscriptions).toHaveLength(1);
    });

    it("leaves the subscriptions null on their own failure and still reads the rest", async () => {
        subscriptions.mockRejectedValue(new Error("boom"));
        const facts = await readPublisherSubscriptionFacts("pub_1");
        expect(facts.subscriptions).toBeNull();
        expect(facts.orders).toEqual({ kind: "READ", items: [expect.objectContaining({ id: "ord_1" })] });
    });
});

describe("what the card draws", () => {
    const publisher = { id: "pub_1", name: "Metro Hoardings" };

    it("shows the running term with its auto-renew flag while saying self-service is off", () => {
        render(
            <SubscriptionCard
                publisher={publisher}
                facts={{ subscriptions: [row()], orders: { kind: "OFF" }, plans: [], graceDays: 7 }}
                onChanged={vi.fn()}
            />,
        );
        expect(screen.getByText("Plus")).toBeInTheDocument();
        expect(screen.getByTestId("auto-renew-on")).toBeInTheDocument();
        expect(screen.getByTestId("orders-off")).toHaveTextContent("Self-service purchase is switched off");
        expect(screen.queryByTestId("subscriptions-unread")).not.toBeInTheDocument();
    });

    it("says the orders could not be read without losing the subscriptions, and the reverse", () => {
        const { unmount } = render(
            <SubscriptionCard
                publisher={publisher}
                facts={{ subscriptions: [row()], orders: { kind: "FAILED" }, plans: [], graceDays: 0 }}
                onChanged={vi.fn()}
            />,
        );
        expect(screen.getByText("Plus")).toBeInTheDocument();
        expect(screen.getByTestId("orders-unread")).toBeInTheDocument();
        unmount();

        render(
            <SubscriptionCard
                publisher={publisher}
                facts={{ subscriptions: null, orders: { kind: "READ", items: [order()] }, plans: [], graceDays: 0 }}
                onChanged={vi.fn()}
            />,
        );
        expect(screen.getByTestId("subscriptions-unread")).toBeInTheDocument();
        expect(screen.getByText("SUB-2026-0001")).toBeInTheDocument();
    });

    it("marks an ended term inside the grace, and a trial order as one", () => {
        const ended = row({ startsAt: daysFromNow(-40), endsAt: daysFromNow(-3), autoRenew: false, state: "ENDED" });
        expect(splitSubscriptions([ended], 7, now).inGrace?.id).toBe("sub_1");
        expect(splitSubscriptions([ended], 0, now).inGrace).toBeNull();
        render(
            <SubscriptionCard
                publisher={publisher}
                facts={{ subscriptions: [ended], orders: { kind: "READ", items: [order()] }, plans: [], graceDays: 7 }}
                onChanged={vi.fn()}
            />,
        );
        expect(within(screen.getByTestId("in-grace")).getByText("In grace")).toBeInTheDocument();
        expect(screen.getByTestId("trial-ord_1")).toHaveTextContent("Trial");
        expect(screen.getByText(/Plus · free ·/)).toBeInTheDocument();
    });
});
