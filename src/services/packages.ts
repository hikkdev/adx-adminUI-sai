import { api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import type { StatusMeta } from "@/types";

/**
 * Package sales — DR 06's book, wired to the backend `packages` module.
 *
 * A sale is a plan an advertiser bought — through an agent, or on their own
 * — with the platform's price on it and, when it was paid, the commission
 * the wallet recorded for the agent. The agent app works its own through
 * the same `GET /packages/sales`; an ADMIN reading it sees every sale, and
 * this file is that read. No DR 10 frame covers the desk; the page borrows
 * the console's list idiom and says so.
 *
 * No fixture fallback, and none is missing: no seed file has ever described
 * a package, a sale or a commission, so there is no id in existence to hand
 * to a live endpoint.
 *
 * Two rules the rest of this file exists to keep:
 *
 * - Money is a decimal STRING and stays one. `pricePerMonth`, `total` and
 *   `commission` are printed by `formatMoney`, never turned into a number.
 *   `commission` is a string or NULL: null is a sale nobody has recorded a
 *   PACKAGE_SOLD for, which is not zero, and it is drawn as a dash.
 *
 * - The shelf is not the status. The chips are Active / Expiring / Expired
 *   — a derived view the server cuts by date — and the status column is the
 *   lifecycle underneath (DRAFT, PENDING_PAYMENT, …). Both come off the
 *   wire; the console keeps no second opinion on either.
 */

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

export type PackageShelf = "ACTIVE" | "EXPIRING" | "EXPIRED";
export const PACKAGE_SHELVES: readonly PackageShelf[] = ["ACTIVE", "EXPIRING", "EXPIRED"];
export const PACKAGE_SHELF_LABEL: Record<PackageShelf, string> = {
    ACTIVE: "Active",
    EXPIRING: "Expiring",
    EXPIRED: "Expired",
};

export type PackageSaleStatus = "DRAFT" | "PENDING_PAYMENT" | "ACTIVE" | "EXPIRED" | "CANCELLED";

export const PACKAGE_SALE_STATUS_META: Record<PackageSaleStatus, StatusMeta> = {
    DRAFT: { label: "Draft", tone: "neutral" },
    PENDING_PAYMENT: { label: "Awaiting payment", tone: "warning" },
    ACTIVE: { label: "Active", tone: "success" },
    EXPIRED: { label: "Expired", tone: "neutral" },
    CANCELLED: { label: "Cancelled", tone: "danger" },
};

export const packageSaleStatusMeta = (status: string): StatusMeta =>
    PACKAGE_SALE_STATUS_META[status as PackageSaleStatus] ?? { label: status, tone: "neutral" };

export type PackageCycle = "MONTHLY" | "ANNUAL";
export const PACKAGE_CYCLE_LABEL: Record<PackageCycle, string> = { MONTHLY: "Monthly", ANNUAL: "Annual" };
export const cycleLabel = (cycle: string): string => PACKAGE_CYCLE_LABEL[cycle as PackageCycle] ?? cycle;

export type PackageSort = "NEWEST" | "OLDEST" | "RENEWAL" | "VALUE_DESC";
export const PACKAGE_SORTS: readonly PackageSort[] = ["NEWEST", "OLDEST", "RENEWAL", "VALUE_DESC"];
export const PACKAGE_SORT_LABEL: Record<PackageSort, string> = {
    NEWEST: "Newest first",
    OLDEST: "Oldest first",
    RENEWAL: "Next renewal first",
    VALUE_DESC: "Highest value first",
};

/* ------------------------------------------------------------------ */
/* A sale                                                              */
/* ------------------------------------------------------------------ */

/** A sale exactly as `GET /packages/sales` sends it — the fields the desk reads. */
export interface WireSale {
    id: string;
    /** The agent's recorded PACKAGE_SOLD, as money. Null when none was recorded. */
    commission: string | null;
    reference: string;
    advertiserId: string;
    advertiserName: string | null;
    /** Null when the advertiser bought for themselves. */
    agentId: string | null;
    tier: string;
    packageName: string;
    cycle: PackageCycle | string;
    months: number;
    /** Decimal strings. */
    pricePerMonth: string;
    total: string;
    status: PackageSaleStatus | string;
    paidAt: string | null;
    startsAt: string | null;
    endsAt: string | null;
    nextBillingAt: string | null;
    createdAt: string;
}

/** One row of the desk. Money stays a string; a missing field stays null. */
export interface Sale {
    id: string;
    commission: string | null;
    reference: string;
    advertiserId: string;
    advertiserName: string | null;
    agentId: string | null;
    tier: string;
    packageName: string;
    cycle: string;
    months: number;
    pricePerMonth: string;
    total: string;
    status: string;
    paidAt: string | null;
    startsAt: string | null;
    endsAt: string | null;
    nextBillingAt: string | null;
    createdAt: string;
}

export function shapeSale(wire: WireSale): Sale {
    return {
        id: wire.id,
        // A string or null and nothing else: "0.00" is a recorded commission of
        // nothing, null is no record, and the desk draws them differently.
        commission: typeof wire.commission === "string" ? wire.commission : null,
        reference: wire.reference,
        advertiserId: wire.advertiserId,
        advertiserName: wire.advertiserName ?? null,
        agentId: wire.agentId ?? null,
        tier: wire.tier,
        packageName: wire.packageName,
        cycle: wire.cycle,
        months: wire.months,
        pricePerMonth: wire.pricePerMonth,
        total: wire.total,
        status: wire.status,
        paidAt: wire.paidAt ?? null,
        startsAt: wire.startsAt ?? null,
        endsAt: wire.endsAt ?? null,
        nextBillingAt: wire.nextBillingAt ?? null,
        createdAt: wire.createdAt,
    };
}

export interface SalesPage {
    items: Sale[];
    total: number;
    page: number;
    pageSize: number;
    /** How many sales sit on each shelf, counted without the shelf in force. */
    counts: Record<PackageShelf, number>;
}

export interface SalesQuery {
    q?: string;
    shelf?: PackageShelf;
    status?: PackageSaleStatus[];
    sort?: PackageSort;
    page?: number;
    pageSize?: number;
}

/** The query string `GET /packages/sales` takes, with nothing sent that was not asked for. */
export function salesPath(query: SalesQuery = {}): string {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.shelf) params.set("shelf", query.shelf);
    if (query.status?.length) params.set("status", query.status.join(","));
    params.set("sort", query.sort ?? "NEWEST");
    if (query.page && query.page > 1) params.set("page", String(query.page));
    params.set("pageSize", String(query.pageSize ?? 100));
    return `/packages/sales?${params.toString()}`;
}

/* ------------------------------------------------------------------ */
/* The service                                                         */
/* ------------------------------------------------------------------ */

/**
 * Refuses to talk to the API while the domain is off. There is nothing to
 * fall back to; throwing before a request goes out keeps the desk honest.
 */
function live() {
    if (!isLive("packages")) throw new Error("Package sales read the API; connect the console to the ADX backend first.");
    return http;
}

export const packageService = {
    /** The desk's page: every sale for an ADMIN, with the shelf counts beside it. */
    sales: async (query: SalesQuery = {}): Promise<SalesPage> => {
        const page = await live().get<{
            items: WireSale[];
            total: number;
            page: number;
            pageSize: number;
            counts: Partial<Record<PackageShelf, number>>;
        }>(salesPath(query));
        const counts = {} as Record<PackageShelf, number>;
        for (const shelf of PACKAGE_SHELVES) counts[shelf] = page.counts?.[shelf] ?? 0;
        return { ...page, items: (page.items ?? []).map(shapeSale), counts };
    },
};

/* ------------------------------------------------------------------ */
/* The catalogue — Lot D (Q94)                                         */
/* ------------------------------------------------------------------ */

/*
 * The three plans and the add-ons, as `GET /packages/catalogue` sends them,
 * and the editor over `PATCH /packages/catalogue/plans/:tier`,
 * `POST /packages/catalogue/add-ons` and `PATCH …/add-ons/:code`.
 *
 * Two facts from the module's invariants that the page repeats out loud:
 *
 * - A SALE KEEPS ITS SNAPSHOT. `tier`, `packageName`, `pricePerMonth` and
 *   the lines on a sale are copies made at the sale, never joins, so an edit
 *   here only ever changes the next sale. Nothing already sold is re-rated,
 *   and a retired plan or add-on stays on the receipts that carried it.
 *
 * - ENTITLEMENTS ARE COPY. The JSON on a plan is what the card promises and
 *   nothing in the platform reads it — no rule, no gate. The editor is where
 *   that copy is written; it is not configuration, and the page says so
 *   rather than looking like a switch that changes nothing.
 *
 * E7-3: the console reads `GET /packages/catalogue?includeInactive=true`,
 * which for an ADMIN lists the retired plans and add-ons too, and every row
 * carries `isActive` and `sortOrder`. A retired row is drawn with an
 * inactive chip and a switch that PATCHes `isActive: true`; the agent app's
 * active-only read is unchanged. The three tiers are still always drawn, so
 * a tier with no row at all (never seeded) can be switched on.
 */

export type PackageTier = "STARTER" | "GROWTH" | "PRO";
/** In the order the cards are drawn; the only three tiers `PackageTier` has. */
export const PACKAGE_TIERS: readonly PackageTier[] = ["STARTER", "GROWTH", "PRO"];

/** A promise on a plan card. Bounded by the API: a short key, a short value. */
export type EntitlementValue = string | number | boolean | null;
export type Entitlements = Record<string, EntitlementValue>;

/** A plan as `GET /packages/catalogue` sends it; E7-3: every row carries `isActive` and `sortOrder`. */
export interface WirePlan {
    id: string;
    tier: PackageTier | string;
    name: string;
    /** Decimal string. */
    pricePerMonth: string;
    description: string | null;
    isPopular: boolean;
    entitlements: Entitlements | null;
    isActive?: boolean;
    sortOrder?: number;
}

/** An add-on as the read sends it; with `includeInactive` the retired ones too. */
export interface WireAddOn {
    id: string;
    code: string;
    name: string;
    pricePerMonth: string;
    description: string | null;
    isActive?: boolean;
    sortOrder?: number;
}

export interface WireCatalogue {
    packages: WirePlan[];
    addOns: WireAddOn[];
}

/** A plan card. `active` is the row's `isActive`. */
export interface Plan {
    tier: PackageTier;
    /** Null when the read has no row for the tier at all. */
    id: string | null;
    name: string;
    pricePerMonth: string;
    description: string | null;
    isPopular: boolean;
    entitlements: Entitlements;
    active: boolean;
    /** E7-3: the order the apps draw the plans in; null on a row from before the column. */
    sortOrder: number | null;
}

export interface AddOn {
    id: string;
    code: string;
    name: string;
    pricePerMonth: string;
    description: string | null;
    active: boolean;
    sortOrder: number | null;
}

export interface Catalogue {
    plans: Plan[];
    addOns: AddOn[];
}

/** The tier's name when the catalogue has no row to say — what the seed calls it. */
export const TIER_LABEL: Record<PackageTier, string> = { STARTER: "Starter", GROWTH: "Growth", PRO: "Pro" };

/**
 * The one entitlement key the platform actually reads — Lot I.
 *
 * Every other key on a plan is copy: the card lists it and no rule consults
 * it. `liveChat` is the exception. `liveChatEntitlement()` reads it on the
 * advertiser's side, and `false` is what excludes a plan from the live desk;
 * anything else, the key absent included, is entitled. So the catalogue editor
 * draws it as a switch rather than leaving it in the free-text rows, and says
 * out loud that this one changes behaviour.
 */
export const LIVE_CHAT_ENTITLEMENT = "liveChat";

/** Whether a plan's sales carry live chat. Absent means yes — only an explicit `false` excludes. */
export function planHasLiveChat(entitlements: Entitlements): boolean {
    return entitlements[LIVE_CHAT_ENTITLEMENT] !== false;
}

/** What a plan card shows for one entitlement's value; `null` is the seed's "unlimited". */
export function entitlementText(value: EntitlementValue): string {
    if (value === null) return "Unlimited";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
}

/** `campaignsPerMonth` → `Campaigns per month`, for the card; the key itself stays what the API keyed. */
export function entitlementLabel(key: string): string {
    const spaced = key.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
    return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export function shapePlan(wire: WirePlan): Plan {
    return {
        tier: wire.tier as PackageTier,
        id: wire.id,
        name: wire.name,
        pricePerMonth: wire.pricePerMonth,
        description: wire.description ?? null,
        isPopular: Boolean(wire.isPopular),
        entitlements: wire.entitlements ?? {},
        // A row from before E7-3 carries no flag; the read then listed active rows only.
        active: wire.isActive ?? true,
        sortOrder: typeof wire.sortOrder === "number" ? wire.sortOrder : null,
    };
}

export function shapeAddOn(wire: WireAddOn): AddOn {
    return {
        id: wire.id,
        code: wire.code,
        name: wire.name,
        pricePerMonth: wire.pricePerMonth,
        description: wire.description ?? null,
        active: wire.isActive ?? true,
        sortOrder: typeof wire.sortOrder === "number" ? wire.sortOrder : null,
    };
}

/** By `sortOrder` where the rows carry one, keeping the API's order among equals and rows without one. */
export function bySortOrder<T extends { sortOrder: number | null }>(rows: T[]): T[] {
    return rows
        .map((row, index) => ({ row, index }))
        .sort((a, b) => (a.row.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.row.sortOrder ?? Number.MAX_SAFE_INTEGER) || a.index - b.index)
        .map((entry) => entry.row);
}

/**
 * The three tiers, each drawn from its row when the read carried one —
 * retired rows included since E7-3 — and as an inactive placeholder when
 * there is no row at all, so a tier can always be switched on. A tier the
 * console has never heard of (none exist today) is kept, so nothing the API
 * sent is dropped. Plans and add-ons are in their `sortOrder`.
 */
export function shapeCatalogue(wire: WireCatalogue): Catalogue {
    const byTier = new Map((wire.packages ?? []).map((plan) => [plan.tier, plan] as const));
    const plans: Plan[] = PACKAGE_TIERS.map((tier) => {
        const row = byTier.get(tier);
        return row
            ? shapePlan(row)
            : {
                  tier,
                  id: null,
                  name: TIER_LABEL[tier],
                  pricePerMonth: "0.00",
                  description: null,
                  isPopular: false,
                  entitlements: {},
                  active: false,
                  sortOrder: null,
              };
    });
    for (const [tier, row] of byTier) {
        if (!PACKAGE_TIERS.includes(tier as PackageTier)) plans.push(shapePlan(row));
    }
    return { plans: bySortOrder(plans), addOns: bySortOrder((wire.addOns ?? []).map(shapeAddOn)) };
}

/** The bounds `sortOrder` takes on the wire. */
export const SORT_ORDER_MIN = 0;
export const SORT_ORDER_MAX = 100;

/** A typed sort order as an integer in bounds, or null when it is not one. */
export function parseSortOrder(raw: string): number | null {
    if (!/^\d{1,3}$/.test(raw.trim())) return null;
    const value = Number(raw.trim());
    return value >= SORT_ORDER_MIN && value <= SORT_ORDER_MAX ? value : null;
}

/** `PATCH /packages/catalogue/plans/:tier` — every field optional; at least one must be sent. */
export interface PlanPatch {
    name?: string;
    pricePerMonth?: string;
    description?: string | null;
    isPopular?: boolean;
    entitlements?: Entitlements;
    isActive?: boolean;
    sortOrder?: number;
}

/** `POST /packages/catalogue/add-ons`. The code is UPPER_SNAKE_CASE and is the key from then on. */
export interface NewAddOn {
    code: string;
    name: string;
    pricePerMonth: string;
    description?: string | null;
    sortOrder?: number;
}

/** `PATCH /packages/catalogue/add-ons/:code`. Retire with `isActive: false`. */
export interface AddOnPatch {
    name?: string;
    pricePerMonth?: string;
    description?: string | null;
    isActive?: boolean;
    sortOrder?: number;
}

/** What the API accepts as an amount: rupees with at most two decimals. */
export const CATALOGUE_MONEY = /^\d{1,12}(\.\d{1,2})?$/;
/** An add-on's key on the wire and on every receipt that will ever carry it. */
export const ADD_ON_CODE = /^[A-Z][A-Z0-9_]*$/;

/** `extra creative refresh` → `EXTRA_CREATIVE_REFRESH`, what the code field needs. */
export function toAddOnCode(input: string): string {
    return input
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/^[0-9]+/, "");
}

export const catalogueService = {
    /** The plans and the add-ons, retired rows included (E7-3: `includeInactive` is honoured for ADMIN only). */
    catalogue: async (): Promise<Catalogue> => shapeCatalogue(await live().get<WireCatalogue>("/packages/catalogue?includeInactive=true")),

    /** The editor; audited `PACKAGE_PLAN_UPDATED` with the diff. Sales keep their snapshot. */
    updatePlan: async (tier: PackageTier, patch: PlanPatch): Promise<Plan> =>
        shapePlan(await live().patch<WirePlan>(`/packages/catalogue/plans/${tier}`, patch)),

    /** A new add-on (201); 409 on a code that exists. */
    createAddOn: async (input: NewAddOn): Promise<AddOn> =>
        shapeAddOn(await live().post<WireAddOn>("/packages/catalogue/add-ons", input)),

    /** Edit or retire. A retired add-on leaves the catalogue read; the receipts that carried it keep it. */
    updateAddOn: async (code: string, patch: AddOnPatch): Promise<AddOn> =>
        shapeAddOn(await live().patch<WireAddOn>(`/packages/catalogue/add-ons/${encodeURIComponent(code)}`, patch)),
};
