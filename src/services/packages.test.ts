import { describe, expect, it } from "vitest";
import {
    ADD_ON_CODE,
    CATALOGUE_MONEY,
    PACKAGE_SALE_STATUS_META,
    PACKAGE_SHELVES,
    cycleLabel,
    entitlementLabel,
    entitlementText,
    packageSaleStatusMeta,
    salesPath,
    shapeAddOn,
    shapeCatalogue,
    shapePlan,
    shapeSale,
    toAddOnCode,
    type WirePlan,
    type WireSale,
} from "./packages";

/**
 * The package-sales desk, as the console reads it.
 *
 * What this file pins: money stays the decimal string the API sent,
 * `commission` is a string or null and never a number or zero, the shelf
 * and the status are two different things, and the query goes on the wire
 * as the list contract spells it.
 */

const wire = (over: Partial<WireSale> = {}): WireSale => ({
    id: "sale_1",
    commission: "1250.00",
    reference: "PKG-1109-2601",
    advertiserId: "adv_1",
    advertiserName: "Zomato",
    agentId: "agt_1",
    tier: "GROWTH",
    packageName: "Growth",
    cycle: "MONTHLY",
    months: 1,
    pricePerMonth: "12500.00",
    total: "14750.00",
    status: "ACTIVE",
    paidAt: "2026-09-01T04:30:00.000Z",
    startsAt: "2026-09-01T04:30:00.000Z",
    endsAt: "2026-10-01T04:30:00.000Z",
    nextBillingAt: "2026-10-01T04:30:00.000Z",
    createdAt: "2026-09-01T04:00:00.000Z",
    ...over,
});

describe("shapeSale — money", () => {
    it("keeps the price, the total and the commission as the decimal strings the API sent", () => {
        const sale = shapeSale(wire());
        expect(sale.pricePerMonth).toBe("12500.00");
        expect(sale.total).toBe("14750.00");
        expect(sale.commission).toBe("1250.00");
        expect(typeof sale.commission).toBe("string");
    });

    it("reads a sale with no recorded commission as null, not as zero", () => {
        expect(shapeSale(wire({ commission: null })).commission).toBeNull();
        expect(shapeSale(wire({ commission: undefined as unknown as null })).commission).toBeNull();
        // A recorded commission of nothing is a different fact and stays a string.
        expect(shapeSale(wire({ commission: "0.00" })).commission).toBe("0.00");
    });

    it("keeps a self-bought sale's agent as null and the dates as sent", () => {
        const sale = shapeSale(wire({ agentId: null, endsAt: null, nextBillingAt: null }));
        expect(sale.agentId).toBeNull();
        expect(sale.endsAt).toBeNull();
        expect(sale.nextBillingAt).toBeNull();
        expect(sale.startsAt).toBe("2026-09-01T04:30:00.000Z");
    });
});

describe("vocabulary", () => {
    it("has the three shelves the API cuts, in the order the chips draw them", () => {
        expect(PACKAGE_SHELVES).toEqual(["ACTIVE", "EXPIRING", "EXPIRED"]);
    });

    it("gives every lifecycle status a label and a tone, and a status it has not heard of a neutral one", () => {
        expect(PACKAGE_SALE_STATUS_META.PENDING_PAYMENT.label).toBe("Awaiting payment");
        expect(PACKAGE_SALE_STATUS_META.CANCELLED.tone).toBe("danger");
        expect(packageSaleStatusMeta("SOMETHING_NEW")).toEqual({ label: "SOMETHING_NEW", tone: "neutral" });
    });

    it("prints a cycle", () => {
        expect(cycleLabel("MONTHLY")).toBe("Monthly");
        expect(cycleLabel("ANNUAL")).toBe("Annual");
    });
});

describe("salesPath", () => {
    it("sends only what was asked for, on the list contract", () => {
        expect(salesPath()).toBe("/packages/sales?sort=NEWEST&pageSize=100");
        expect(salesPath({ q: "zomato", shelf: "EXPIRING", sort: "RENEWAL", page: 2, pageSize: 25 })).toBe(
            "/packages/sales?q=zomato&shelf=EXPIRING&sort=RENEWAL&page=2&pageSize=25",
        );
        expect(salesPath({ status: ["PENDING_PAYMENT", "ACTIVE"] })).toContain("status=PENDING_PAYMENT%2CACTIVE");
    });
});

/* ------------------------------------------------------------------ */
/* The catalogue — Lot D (Q94)                                         */
/* ------------------------------------------------------------------ */

/*
 * What these pin: a plan's price stays the decimal string the API sent; the
 * three tiers are always drawn, in order, with a tier the active-only read
 * left out marked inactive rather than dropped; the PATCH answer's
 * `isActive` is believed over the read's implication; entitlements are
 * printed as copy, `null` meaning the seed's "unlimited"; and an add-on
 * code is shaped the way the API's regex wants it.
 */

const plan = (over: Partial<WirePlan> = {}): WirePlan => ({
    id: "pkg_growth",
    tier: "GROWTH",
    name: "Growth",
    pricePerMonth: "24999.00",
    description: "For a brand running campaigns every month.",
    isPopular: true,
    entitlements: { campaignsPerMonth: 8, creativeRefreshes: 3, support: "PRIORITY" },
    ...over,
});

describe("shapeCatalogue", () => {
    it("keeps the price as the decimal string the API sent and the entitlements as sent", () => {
        const catalogue = shapeCatalogue({ packages: [plan()], addOns: [] });
        const growth = catalogue.plans.find((row) => row.tier === "GROWTH");
        expect(growth?.pricePerMonth).toBe("24999.00");
        expect(typeof growth?.pricePerMonth).toBe("string");
        expect(growth?.entitlements).toEqual({ campaignsPerMonth: 8, creativeRefreshes: 3, support: "PRIORITY" });
        expect(growth?.active).toBe(true);
        expect(growth?.id).toBe("pkg_growth");
    });

    it("draws all three tiers in order, and a tier the active-only read left out as inactive", () => {
        const catalogue = shapeCatalogue({ packages: [plan()], addOns: [] });
        expect(catalogue.plans.map((row) => row.tier)).toEqual(["STARTER", "GROWTH", "PRO"]);
        const starter = catalogue.plans[0];
        expect(starter).toMatchObject({ tier: "STARTER", id: null, name: "Starter", active: false, entitlements: {} });
    });

    it("shapes the add-ons and treats a row the read carried as active", () => {
        const catalogue = shapeCatalogue({
            packages: [],
            addOns: [{ id: "ao_1", code: "PREMIUM_ANALYTICS", name: "Premium analytics", pricePerMonth: "2500.00", description: null }],
        });
        expect(catalogue.addOns).toEqual([
            { id: "ao_1", code: "PREMIUM_ANALYTICS", name: "Premium analytics", pricePerMonth: "2500.00", description: null, active: true, sortOrder: null },
        ]);
    });
});

describe("shapePlan / shapeAddOn — the PATCH answer", () => {
    it("believes the row's isActive when the API sends one", () => {
        expect(shapePlan(plan({ isActive: false })).active).toBe(false);
        expect(shapePlan(plan({ isActive: true })).active).toBe(true);
        expect(shapeAddOn({ id: "ao_1", code: "X_Y", name: "X", pricePerMonth: "1.00", description: null, isActive: false }).active).toBe(false);
    });

    it("reads missing entitlements and description as empty, not as an error", () => {
        const shaped = shapePlan(plan({ entitlements: null, description: null }));
        expect(shaped.entitlements).toEqual({});
        expect(shaped.description).toBeNull();
    });
});

describe("entitlements are copy", () => {
    it("prints null as Unlimited, booleans as Yes/No and everything else as it is", () => {
        expect(entitlementText(null)).toBe("Unlimited");
        expect(entitlementText(true)).toBe("Yes");
        expect(entitlementText(false)).toBe("No");
        expect(entitlementText(8)).toBe("8");
        expect(entitlementText("PRIORITY")).toBe("PRIORITY");
    });

    it("labels a camelCase or snake_case key for the card without touching the key itself", () => {
        expect(entitlementLabel("campaignsPerMonth")).toBe("Campaigns per month");
        expect(entitlementLabel("creative_refreshes")).toBe("Creative refreshes");
        expect(entitlementLabel("support")).toBe("Support");
    });
});

describe("the add-on code", () => {
    it("shapes free text into what the API's regex accepts", () => {
        expect(toAddOnCode("extra creative refresh")).toBe("EXTRA_CREATIVE_REFRESH");
        expect(toAddOnCode("  Premium-Analytics! ")).toBe("PREMIUM_ANALYTICS");
        expect(toAddOnCode("2nd screen")).toBe("ND_SCREEN");
        expect(ADD_ON_CODE.test(toAddOnCode("extra creative refresh"))).toBe(true);
    });

    it("accepts an amount only as rupees with at most two decimals", () => {
        expect(CATALOGUE_MONEY.test("24999")).toBe(true);
        expect(CATALOGUE_MONEY.test("24999.50")).toBe(true);
        expect(CATALOGUE_MONEY.test("24,999")).toBe(false);
        expect(CATALOGUE_MONEY.test("24999.505")).toBe(false);
        expect(CATALOGUE_MONEY.test("")).toBe(false);
    });
});
