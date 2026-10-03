import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Raising a quote request from the Print partners desk.
 *
 * The owner, 24 September 2026: "there's no way to send quote request to
 * anyone." There was one — the Printing card on an order — and nothing in
 * this section pointed at it. What is walked here is the operator's way in
 * from the desk: press the button, find the order, send the request, and
 * land on the same `POST /orders/:id/print-quote-request` the card posts to.
 *
 * Two rules of the picker are worth a test of their own, because both are
 * the reason it is a picker and not a free-text box. An order the publisher
 * has not accepted cannot be printed, so it is never offered; an order that
 * already has a request out would be refused by the backend, so it is not
 * offered either.
 */

const { backend } = vi.hoisted(() => {
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        reset() {
            this.calls = [];
        },
        async handle(method: string, path: string, body?: unknown) {
            this.calls.push({ method, path, body });

            if (method === "GET" && path.startsWith("/orders?")) {
                /* The board honours the status facet, so only printable orders
                   come back — the picker does not filter them itself. */
                const asked = new URLSearchParams(path.slice(path.indexOf("?") + 1)).get("status")?.split(",") ?? [];
                const all = [
                    {
                        id: "ord_ready",
                        status: "PENDING_PRINT",
                        campaignName: "Monsoon sale",
                        budget: null,
                        startDate: "2026-10-01T00:00:00.000Z",
                        endDate: null,
                        slotTime: null,
                        createdAt: "2026-09-20T00:00:00.000Z",
                        agentId: null,
                        listingId: "lst_1",
                        listing: { title: "MG Road hoarding", city: "Bengaluru" },
                    },
                    {
                        id: "ord_out",
                        status: "SLOT_CONFIRMED",
                        campaignName: "Diwali",
                        budget: null,
                        startDate: null,
                        endDate: null,
                        slotTime: null,
                        createdAt: "2026-09-19T00:00:00.000Z",
                        agentId: null,
                        listingId: "lst_2",
                        listing: { title: "Brigade Road panel", city: "Bengaluru" },
                    },
                    {
                        id: "ord_waiting",
                        status: "PENDING_PUBLISHER",
                        campaignName: "Not accepted yet",
                        budget: null,
                        startDate: null,
                        endDate: null,
                        slotTime: null,
                        createdAt: "2026-09-21T00:00:00.000Z",
                        agentId: null,
                        listingId: "lst_3",
                        listing: { title: "Indiranagar wall", city: "Bengaluru" },
                    },
                ];
                const items = all.filter((order) => asked.includes(order.status));
                return { items, total: items.length, page: 1, pageSize: 100, counts: {} };
            }

            if (method === "GET" && /^\/orders\/[^/?]+$/.test(path)) {
                /* The detail read — the only one that joins the spot and the
                   artwork the dialog prefills its specs from. */
                return {
                    id: "ord_ready",
                    status: "PENDING_PRINT",
                    campaignName: "Monsoon sale",
                    budget: null,
                    startDate: "2026-10-01T00:00:00.000Z",
                    endDate: null,
                    slotTime: null,
                    createdAt: "2026-09-20T00:00:00.000Z",
                    agentId: null,
                    listingId: "lst_1",
                    listing: { title: "MG Road hoarding", city: "Bengaluru", size: "20 x 10 ft", category: "HOARDING" },
                    designUrl: "https://cdn.example/art.pdf",
                };
            }

            if (method === "GET" && path.startsWith("/print-partners")) {
                return { items: [], total: 0, page: 1, pageSize: 100, counts: {} };
            }

            if (method === "POST" && /\/orders\/[^/]+\/print-quote-request$/.test(path)) {
                return {
                    id: "pqr_new",
                    orderId: "ord_ready",
                    status: "OPEN",
                    deadlineAt: "2026-09-26T00:00:00.000Z",
                    invited: [{ id: "pp_1", name: "Sharma Printers" }],
                    quotes: [],
                };
            }

            throw new Error(`No route ${method} ${path}`);
        },
    };
    return { backend };
});

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    /* `isLive` closes over the module's own `apiConfig`, so overriding the
       config alone leaves both services refusing to call out. */
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        try {
            return await backend.handle(method, path, body);
        } catch (cause) {
            throw new actual.ApiError(500, "INTERNAL", (cause as Error).message);
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

import { RaiseQuoteRequest } from "./raise-quote-request";

beforeEach(() => backend.reset());

function mount(openRequestOrderIds: string[] = []) {
    const onRaised = vi.fn();
    render(<RaiseQuoteRequest openRequestOrderIds={openRequestOrderIds} onRaised={onRaised} />);
    return { onRaised };
}

/** Open the picker and wait for the orders to land. */
async function openPicker(openRequestOrderIds: string[] = []) {
    const handles = mount(openRequestOrderIds);
    fireEvent.click(screen.getByTestId("raise-quote-request"));
    await screen.findByTestId("quote-order-list");
    await waitFor(() => expect(backend.calls.some((call) => call.path.startsWith("/orders?"))).toBe(true));
    return handles;
}

describe("raising a quote request from the desk", () => {
    it("asks which order, then sends the request against it", async () => {
        const { onRaised } = await openPicker();

        const list = await screen.findByTestId("quote-order-list");
        await within(list).findByText("MG Road hoarding");

        fireEvent.click(within(list).getByText("MG Road hoarding"));

        /* The detail read stands between the pick and the dialog, because the
           list row carries no spot and no artwork. */
        await waitFor(() => expect(backend.calls.some((call) => call.path === "/orders/ord_ready")).toBe(true));
        await screen.findByText("Request quotes", { selector: "h2, [data-slot='dialog-title']" });

        fireEvent.click(screen.getByRole("button", { name: "Send the request" }));

        await waitFor(() => {
            const raised = backend.calls.find((call) => call.method === "POST" && call.path.endsWith("/print-quote-request"));
            expect(raised?.path).toBe("/orders/ord_ready/print-quote-request");
        });
        await waitFor(() => expect(onRaised).toHaveBeenCalled());
    });

    it("prefills the specs from the spot, so the shops are quoting the right thing", async () => {
        await openPicker();
        const list = await screen.findByTestId("quote-order-list");
        fireEvent.click(await within(list).findByText("MG Road hoarding"));
        await screen.findByRole("button", { name: "Send the request" });

        fireEvent.click(screen.getByRole("button", { name: "Send the request" }));

        await waitFor(() => {
            const raised = backend.calls.find((call) => call.method === "POST" && call.path.endsWith("/print-quote-request"));
            expect(raised).toBeTruthy();
            const specs = (raised!.body as { specs: Record<string, string> }).specs;
            expect(Object.keys(specs).length).toBeGreaterThan(0);
        });
    });

    it("never offers an order the publisher has not accepted", async () => {
        await openPicker();
        const list = await screen.findByTestId("quote-order-list");
        await within(list).findByText("MG Road hoarding");

        /* PENDING_PUBLISHER is not in the printable set, so the board is never
           asked for it and the picker cannot show it. */
        expect(within(list).queryByText("Indiranagar wall")).not.toBeInTheDocument();
        const asked = backend.calls.find((call) => call.path.startsWith("/orders?"));
        expect(asked?.path).not.toContain("PENDING_PUBLISHER");
    });

    it("leaves out an order that already has a request out", async () => {
        await openPicker(["ord_out"]);
        const list = await screen.findByTestId("quote-order-list");
        await within(list).findByText("MG Road hoarding");

        expect(within(list).queryByText("Brigade Road panel")).not.toBeInTheDocument();
    });

    it("says so when every printable order is already out for quotes", async () => {
        await openPicker(["ord_ready", "ord_out"]);

        expect(await screen.findByText("Every order already has a request")).toBeInTheDocument();
    });

    it("narrows the list by campaign, city or spot", async () => {
        await openPicker();
        const list = await screen.findByTestId("quote-order-list");
        await within(list).findByText("MG Road hoarding");

        fireEvent.change(screen.getByTestId("quote-order-search"), { target: { value: "diwali" } });

        expect(within(list).queryByText("MG Road hoarding")).not.toBeInTheDocument();
        expect(within(list).getByText("Brigade Road panel")).toBeInTheDocument();
    });
});
