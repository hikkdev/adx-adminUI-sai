import { ApiError, api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import type { Order, OrderOffer, OrderSpot, OrderStatus } from "@/types";

/**
 * Orders, wired to the backend `orders` module.
 *
 * Same pattern as `supplyService`: one function per endpoint, HTTP only.
 * The `ord_*` fixtures are gone (CE4); with the API off the reads refuse
 * with a message rather than improvising.
 *
 * The console used to describe orders in a vocabulary of its own — seven
 * statuses about field work, an order "number", a priority, a due date. None of
 * those existed on the backend. Rather than translate at this boundary forever,
 * the types moved onto the backend's enum and the fixtures were rewritten; this
 * service now only joins names onto ids, which is the one thing the wire really
 * does leave out.
 */

/** The order as the API sends it: the row, plus the relations it joins. */
interface WireOrder {
    id: string;
    status: OrderStatus;
    campaignName: string | null;
    budget: number | null;
    startDate: string | null;
    endDate: string | null;
    slotTime: string | null;
    createdAt: string;
    agentId: string | null;
    /** The spot's id. Always sent; typed optional for the same reason `listing` is. */
    listingId?: string | null;
    listing?: {
        title?: string | null;
        city?: string | null;
        /* Lot H (Q147): the surface, for a quote request's specs. Detail read only. */
        size?: string | null;
        widthFt?: string | number | null;
        heightFt?: string | number | null;
        category?: string | null;
        subType?: string | null;
        placement?: string | null;
    } | null;
    /** The artwork the advertiser attached. Detail read only. */
    designUrl?: string | null;
    agent?: { user?: { name?: string | null } | null } | null;
    /** Lot B (Q102): the installation figure the agent accepted the job at. Detail read only. */
    quotedFee?: string | null;
    /** Lot B (Q3): the per-order fee ops typed at assign or print-ready. Detail read only. */
    agentFeeAmount?: string | null;
    /* Lot D (Q51/Q90): the stamps the ops overrides are gated on, the
       cancellation columns and the offer history. Detail read only. */
    publisherTimerExpiry?: string | null;
    slotProposedAt?: string | null;
    checkIn?: { checkedInAt: string } | null;
    agentEscalated?: boolean;
    cancelledAt?: string | null;
    cancelledByUserId?: string | null;
    cancellationReason?: string | null;
    agentAssignments?: WireAssignment[];
}

/** One offer on the order, newest first — `OrderAgentAssignment` with the agent's name joined. */
export interface WireAssignment {
    id: string;
    agentId: string;
    status: "PENDING" | "ACCEPTED" | "REJECTED" | "REASSIGNED";
    rejectionReason: string | null;
    assignedAt: string;
    respondedAt: string | null;
    quotedFee: string | null;
    agent?: { user?: { name?: string | null; mobile?: string | null } | null } | null;
}

export function shapeOffer(raw: WireAssignment): OrderOffer {
    return {
        id: raw.id,
        agentId: raw.agentId,
        agentName: raw.agent?.user?.name ?? raw.agent?.user?.mobile ?? raw.agentId,
        status: raw.status,
        rejectionReason: raw.rejectionReason ?? null,
        offeredAt: raw.assignedAt,
        respondedAt: raw.respondedAt ?? null,
        quotedFee: raw.quotedFee === null || raw.quotedFee === undefined ? null : String(raw.quotedFee),
    };
}

/**
 * Flattens the joins the console actually renders.
 *
 * A listing is always joined by both endpoints, but it is typed optional here
 * because an order whose listing was deleted would otherwise render the string
 * "undefined" in a table cell. The id is a poor title and a much better bug
 * report than a blank.
 */
export function shapeOrder(raw: WireOrder): Order {
    return {
        id: raw.id,
        status: raw.status,
        listing: raw.listing?.title ?? raw.id,
        listingId: raw.listingId ?? null,
        city: raw.listing?.city ?? null,
        campaignName: raw.campaignName ?? null,
        agent: raw.agent?.user?.name ?? null,
        agentId: raw.agentId ?? null,
        budget: raw.budget ?? null,
        startDate: raw.startDate ?? null,
        endDate: raw.endDate ?? null,
        slotTime: raw.slotTime ?? null,
        createdAt: raw.createdAt,
        quotedFee: raw.quotedFee ?? null,
        agentFeeAmount: raw.agentFeeAmount ?? null,
        publisherTimerExpiry: raw.publisherTimerExpiry ?? null,
        slotProposedAt: raw.slotProposedAt ?? null,
        checkedInAt: raw.checkIn?.checkedInAt ?? null,
        agentEscalated: raw.agentEscalated ?? false,
        cancelledAt: raw.cancelledAt ?? null,
        cancellationReason: raw.cancellationReason ?? null,
        offers: raw.agentAssignments ? raw.agentAssignments.map(shapeOffer) : undefined,
        spot: raw.listing?.category ? shapeSpot(raw.listing) : null,
        designUrl: raw.designUrl ?? null,
    };
}

/** Lot H: the surface as the listing join carries it — only on the detail read, where the category is joined. */
function shapeSpot(listing: NonNullable<WireOrder["listing"]>): OrderSpot {
    const feet = (value: string | number | null | undefined) => (value === null || value === undefined ? null : String(value));
    return {
        size: listing.size ?? null,
        widthFt: feet(listing.widthFt),
        heightFt: feet(listing.heightFt),
        category: listing.category ?? "",
        subType: listing.subType ?? null,
        placement: listing.placement ?? null,
    };
}

/* ------------------------------------------------------------------ */
/* Lot D (Q51/Q90): the ops moves                                      */
/* ------------------------------------------------------------------ */

/** The states `POST /orders/:id/reassign-agent` accepts — anything before the proof. */
export const REASSIGNABLE_STATUSES: readonly OrderStatus[] = [
    "PENDING_AGENT",
    "AGENT_REJECTED",
    "SLOT_PROPOSED",
    "SLOT_CONFIRMED",
    "IN_PROGRESS",
];

/** How long a publisher has to answer a proposed slot before ops may confirm it. Mirrors the backend. */
export const SLOT_ANSWER_WINDOW_HOURS = 24;

export type OpsOverride = "ACCEPT_PUBLISHER" | "CONFIRM_SLOT" | "COLLECT_PRINTS";

/** The audit action every override is written under, with `metadata.step` naming which. */
export const OPS_OVERRIDE_AUDIT_ACTION = "ORDER_OPS_OVERRIDE";

/**
 * Which ops moves the order page may offer right now.
 *
 * Each override exists for a party who is not answering, never for one who
 * has not yet had the chance — so the button appears only once the window
 * the backend gates on has closed, and never before. A button that 409s is
 * a worse answer than a button that is not there. The rules are the
 * backend's (`ops.service.ts`), pinned here so the page cannot drift:
 *
 * - accept-publisher: PENDING_PUBLISHER and the 30-minute
 *   `publisherTimerExpiry` has passed;
 * - confirm-slot: SLOT_PROPOSED with a slot on the table and
 *   `slotProposedAt` more than 24 h ago;
 * - collect-prints: an agent on the order who has checked in at the site,
 *   and the prints not yet collected (IN_PROGRESS is the no-op state).
 */
export function opsOverridesFor(
    order: Pick<Order, "status" | "agentId" | "publisherTimerExpiry" | "slotProposedAt" | "slotTime" | "checkedInAt">,
    now: Date = new Date()
): { reassign: boolean; acceptPublisher: boolean; confirmSlot: boolean; collectPrints: boolean } {
    const at = (iso: string | null | undefined) => (iso ? Date.parse(iso) : Number.NaN);
    const acceptPublisher =
        order.status === "PENDING_PUBLISHER" &&
        Number.isFinite(at(order.publisherTimerExpiry)) &&
        at(order.publisherTimerExpiry) <= now.getTime();
    const confirmSlot =
        order.status === "SLOT_PROPOSED" &&
        !!order.slotTime &&
        Number.isFinite(at(order.slotProposedAt)) &&
        now.getTime() - at(order.slotProposedAt) >= SLOT_ANSWER_WINDOW_HOURS * 3_600_000;
    const collectPrints =
        !!order.agentId &&
        !!order.checkedInAt &&
        (order.status === "SLOT_PROPOSED" || order.status === "SLOT_CONFIRMED");
    return {
        reassign: REASSIGNABLE_STATUSES.includes(order.status),
        acceptPublisher,
        confirmSlot,
        collectPrints,
    };
}

/**
 * Refuses to talk to the API while the domain is off. There is nothing to
 * fall back to, so a request stops here with a message rather than going
 * out to nowhere.
 */
function live() {
    if (!isLive("orders")) {
        throw new Error("Orders read the API; connect the console to the ADX backend first.");
    }
    return http;
}

const mutable = live;

/** The fourteen states an order moves through, as the API words them. */
export const ORDER_STATUS_WIRE = [
    "DRAFT",
    "PENDING_PUBLISHER",
    "PUBLISHER_REJECTED",
    "PENDING_PRINT",
    "SELF_INSTALL",
    "PENDING_AGENT",
    "AGENT_REJECTED",
    "SLOT_PROPOSED",
    "SLOT_CONFIRMED",
    "IN_PROGRESS",
    "PENDING_OTP",
    "PENDING_APPROVAL",
    "COMPLETED",
    "CANCELLED",
] as const;
export type OrderStatusWire = (typeof ORDER_STATUS_WIRE)[number];

/**
 * The three orders `GET /orders` can be asked for. `DUE` is the confirmed
 * slot, soonest first, with orders that have no slot yet sorting last.
 */
export const ORDER_SORTS = ["NEWEST", "OLDEST", "DUE"] as const;
export type OrderSort = (typeof ORDER_SORTS)[number];
export const ORDER_SORT_LABEL: Record<OrderSort, string> = {
    NEWEST: "Newest first",
    OLDEST: "Oldest first",
    DUE: "Install slot, soonest first",
};

/** `?q=&status=&sort=&page=&pageSize=&agentId=&listingId=&city=&advertiserId=&from=&to=` — the list contract. */
export interface OrdersQuery {
    q?: string;
    status?: OrderStatusWire[];
    sort?: OrderSort;
    page?: number;
    pageSize?: number;
    agentId?: string;
    listingId?: string;
    city?: string;
    /** E7-2: the advertiser account, reached through the campaign the order was raised from. */
    advertiserId?: string;
    /**
     * E7-2: a window, as ISO instants. An order is in it when its slot falls
     * inside or its flight overlaps it; either bound alone is open-ended.
     */
    from?: string;
    to?: string;
}

/** One page of the board, as the console reads it. */
export interface OrdersPage {
    items: Order[];
    total: number;
    page: number;
    pageSize: number;
    counts: Record<string, number>;
}

/** A page of orders, as `/orders` sends it. */
interface WireOrderPage {
    items: WireOrder[];
    total: number;
    page: number;
    pageSize: number;
    counts: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/* The booking calendar — Lot G (Q114), `GET /orders/calendar`         */
/* ------------------------------------------------------------------ */

export type CalendarCategory = "INDOOR" | "OUTDOOR" | "TRANSIT" | "MEDIA";
export const CALENDAR_CATEGORIES: readonly CalendarCategory[] = ["INDOOR", "OUTDOOR", "TRANSIT", "MEDIA"];
export const CALENDAR_CATEGORY_LABEL: Record<CalendarCategory, string> = {
    INDOOR: "Indoor",
    OUTDOOR: "Outdoor",
    TRANSIT: "Transit",
    MEDIA: "Media",
};

/** One order on a calendar row: the flight, or the confirmed installation appointment when no flight is set. */
export interface CalendarOrder {
    id: string;
    /** The campaign the order was raised from; a direct booking has only the name typed on the order. */
    campaign: { id: string | null; reference: string | null; name: string | null };
    status: OrderStatus;
    from: string | null;
    to: string | null;
    slot: string | null;
}

/**
 * One row of the calendar: an ACTIVE listing in the filter, with the orders
 * that hold a slot on it over the window. A site with nothing booked is a
 * row with an empty list — which is exactly what a calendar is for.
 */
export interface CalendarSite {
    listing: { id: string; displayId: string | null; title: string; city: string | null; category: string; slotsTotal: number };
    orders: CalendarOrder[];
}

/** The list contract over listings; `counts` is by listing category, counted with the category facet removed. */
export interface CalendarPage {
    items: CalendarSite[];
    total: number;
    page: number;
    pageSize: number;
    counts: Record<string, number>;
}

export interface CalendarQuery {
    /** ISO instants; the server defaults to today for thirty days, at most 366. */
    from?: string;
    to?: string;
    city?: string;
    category?: CalendarCategory;
    /** Searches the spot — title, address, city, display id — not the orders. */
    q?: string;
    page?: number;
    pageSize?: number;
}

/** The server's ceiling on one page of sites. */
export const CALENDAR_MAX_PAGE_SIZE = 100;

/** `?from&to&city&category&q&page&pageSize` — nothing sent that was not asked for. */
export function calendarPath(query: CalendarQuery = {}): string {
    const params = new URLSearchParams();
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    if (query.city?.trim()) params.set("city", query.city.trim());
    if (query.category) params.set("category", query.category);
    if (query.q?.trim()) params.set("q", query.q.trim());
    params.set("page", String(query.page ?? 1));
    params.set("pageSize", String(Math.min(query.pageSize ?? 25, CALENDAR_MAX_PAGE_SIZE)));
    return `/orders/calendar?${params.toString()}`;
}

/**
 * The list contract applied to the seeded rows, so a screen reads the same
 * shape offline as on: the search over the fields the server searches, the
 * status facet, the three sorts, and the chip counts computed WITHOUT the
 * status in force — the property the chip row depends on.
 */
export function pageOrders(rows: Order[], query: OrdersQuery = {}): OrdersPage {
    const q = query.q?.trim().toLowerCase();
    const base = rows.filter((order) => {
        if (query.listingId && order.listingId !== query.listingId) return false;
        if (query.agentId && order.agentId !== query.agentId) return false;
        // The seeded rows carry no advertiser account and no window: offline
        // a per-advertiser or windowed read answers nothing rather than
        // somebody else's orders.
        if (query.advertiserId) return false;
        if (query.from || query.to) return false;
        if (query.city && !(order.city ?? "").toLowerCase().includes(query.city.toLowerCase())) return false;
        if (!q) return true;
        return [order.campaignName, order.listing, order.city, order.agent]
            .some((field) => (field ?? "").toLowerCase().includes(q));
    });
    const counts: Record<string, number> = {};
    for (const status of ORDER_STATUS_WIRE) counts[status] = 0;
    for (const order of base) counts[order.status] = (counts[order.status] ?? 0) + 1;

    const filtered = query.status?.length ? base.filter((order) => query.status!.includes(order.status)) : base;
    const at = (iso: string | null) => (iso ? Date.parse(iso) : Number.POSITIVE_INFINITY);
    const sorted = [...filtered].sort((a, b) => {
        switch (query.sort ?? "NEWEST") {
            case "OLDEST":
                return at(a.createdAt) - at(b.createdAt);
            case "DUE":
                return at(a.slotTime) - at(b.slotTime);
            default:
                return at(b.createdAt) - at(a.createdAt);
        }
    });
    const pageSize = query.pageSize ?? 100;
    const page = query.page ?? 1;
    return {
        items: sorted.slice((page - 1) * pageSize, page * pageSize),
        total: sorted.length,
        page,
        pageSize,
        counts,
    };
}

/** The query string `GET /orders` takes, with nothing sent that was not asked for. */
export function ordersPath(query: OrdersQuery = {}): string {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.status?.length) params.set("status", query.status.join(","));
    params.set("sort", query.sort ?? "NEWEST");
    if (query.page && query.page > 1) params.set("page", String(query.page));
    params.set("pageSize", String(query.pageSize ?? 100));
    if (query.agentId) params.set("agentId", query.agentId);
    if (query.listingId) params.set("listingId", query.listingId);
    if (query.city) params.set("city", query.city);
    if (query.advertiserId) params.set("advertiserId", query.advertiserId);
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    return `/orders?${params.toString()}`;
}

export const orderService = {
    /**
     * The admin board. Capped rather than paginated: the endpoint takes
     * `limit`/`offset` and no console screen pages yet, so this asks for more
     * than a board shows and leaves paging to whoever needs it.
     */
    /**
     * The board's rows.
     *
     * `/orders` answers with a page now — `{ items, total, counts }` — after it
     * grew the search, status and sort surface the DR 10 table draws. The board
     * and the pipeline both fold their own columns over the whole set, so this
     * asks for one large page and `page()` below hands back the counts for
     * callers that want them.
     */
    list: async (): Promise<Order[]> => {
        const page = await live().get<WireOrderPage>("/orders?pageSize=100&sort=NEWEST");
        return (page.items ?? []).map(shapeOrder);
    },

    /**
     * The board's page, with a count per status chip.
     *
     * The counts come back computed over the whole filter *without* the chip in
     * force, which is not something a client holding one page could work out —
     * so the dropdown can say how many rows each status would show.
     */
    page: async (query: OrdersQuery = {}): Promise<OrdersPage> => {
        const page = await live().get<WireOrderPage>(ordersPath(query));
        return { ...page, items: (page.items ?? []).map(shapeOrder) };
    },

    /**
     * Lot G (Q114): the booking calendar, listings first — one page of ACTIVE
     * sites in the filter, each carrying the orders that hold a slot over the
     * window. The rail's "x of N sites" is `total`; "Load more sites" is the
     * next page.
     */
    calendar: async (query: CalendarQuery = {}): Promise<CalendarPage> => {
        const page = await live().get<Partial<CalendarPage>>(calendarPath(query));
        return {
            items: (page.items ?? []).map((site) => ({
                listing: site.listing,
                orders: (site.orders ?? []).map((order) => ({ ...order, status: order.status as OrderStatus })),
            })),
            total: page.total ?? 0,
            page: page.page ?? query.page ?? 1,
            pageSize: page.pageSize ?? query.pageSize ?? 25,
            counts: page.counts ?? {},
        };
    },

    /** Every order on one spot — the listing page's Bookings tab. */
    forListing: async (listingId: string): Promise<Order[]> => {
        const page = await live().get<WireOrderPage>(
            `/orders?listingId=${encodeURIComponent(listingId)}&pageSize=100&sort=NEWEST`
        );
        return (page.items ?? []).map(shapeOrder);
    },

    get: async (id: string): Promise<Order | null> => {
        try {
            return shapeOrder(await live().get<WireOrder>(`/orders/${id}`));
        } catch (cause) {
            // A 404 is "no such order", which the page renders as its own
            // not-found rather than as a failed request.
            if (cause instanceof ApiError && cause.status === 404) return null;
            throw cause;
        }
    },

    /* ---------------- Mutations ---------------- */
    /* The four an ADMIN may make. Everything else in the order lifecycle
       belongs to the publisher, the advertiser or the agent, and is theirs to
       do from their own app — the console has no endpoint for it because it
       should not have one. */

    /** Signs off a finished install. `PENDING_APPROVAL` to `COMPLETED`. */
    approve: (id: string) => mutable().post<unknown>(`/orders/${id}/approve`),

    /** Lot D (Q51): the reason is required and written on the order beside who and when. */
    cancel: (id: string, reason: string) =>
        mutable().post<unknown>(`/orders/${id}/cancel`, { reason }),

    /* ---- Lot D (Q51/Q90): the ops moves --------------------------------- */

    /** The order to another agent; the current offer closes as REASSIGNED (no strike). `ORDER_AGENT_REASSIGNED`. */
    reassignAgent: (id: string, agentId: string, reason: string) =>
        mutable().post<unknown>(`/orders/${id}/reassign-agent`, { agentId, reason }),

    /** Accepted for a publisher who said yes out of band after the 30-minute window. The consent note rides on the audit row. */
    opsAcceptPublisher: (id: string, input: { reason: string; consentNote: string }) =>
        mutable().post<unknown>(`/orders/${id}/ops/accept-publisher`, input),

    /** Confirmed for a publisher who has said nothing about a proposed slot for a day. */
    opsConfirmSlot: (id: string, reason: string) =>
        mutable().post<unknown>(`/orders/${id}/ops/confirm-slot`, { reason }),

    /** Recorded for an agent whose check-in says they are at the site and whose tap did not land. */
    opsCollectPrints: (id: string, reason: string) =>
        mutable().post<unknown>(`/orders/${id}/ops/collect-prints`, { reason }),

    /**
     * Confirms the prints are ready to collect. `agentFee` is Lot B's
     * per-order installation figure — read by the resolver only while the
     * platform is on PER_ORDER, so the console only asks for it then.
     */
    printReady: (id: string, agentFee?: string) =>
        mutable().post<unknown>(`/orders/${id}/print-ready`, agentFee ? { agentFee } : {}),

    /**
     * The package's pickup code (A9): minted when the prints are marked ready,
     * scanned by the agent at collection. Null before then, and once used.
     */
    pickupCode: (id: string) => http.get<{ qrId: string } | null>(`/orders/${id}/pickup-code`),

    assignAgent: (id: string, agentId: string, agentFee?: string) =>
        mutable().post<unknown>(`/orders/${id}/assign-agent`, { agentId, ...(agentFee ? { agentFee } : {}) }),
};
