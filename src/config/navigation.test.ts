import { describe, expect, it } from "vitest";
import { activeRailHref, navigation, railItems } from "./navigation";

/**
 * What the sidebar highlights.
 *
 * The rail is a flat list of modules and exactly one row should be lit at a
 * time. Some rail hrefs are ancestors of others — `/listings` owns the
 * inventory, `/listings/review` is a review desk of its own — and a plain
 * prefix test lit both, telling the operator they were in two places at once.
 * `activeRailHref` picks the longest match, which is the rule the feature
 * registry already uses for route prefixes.
 *
 * Nesting is therefore allowed. What is not allowed is ambiguity.
 */

/** Every path the rail or its children can put an operator on. */
const everyPath = [
    ...new Set(
        navigation.flatMap((section) =>
            section.items.flatMap((item) => [item.href, ...(item.children ?? []).map((child) => child.href)]),
        ),
    ),
];

describe("the sidebar rail", () => {
    it("lights exactly one row on every path it owns", () => {
        const wrong: string[] = [];
        for (const path of everyPath) {
            const active = activeRailHref(path);
            if (active === null) {
                wrong.push(`${path} lights nothing`);
                continue;
            }
            const lit = railItems.filter((row) => activeRailHref(path) === row.href);
            if (lit.length !== 1) wrong.push(`${path} lights ${lit.length} rows`);
        }
        expect(wrong).toEqual([]);
    });

    /* The owner merged the review desks back into Listings on 25 September, so
       every `/listings/*` path lights the one section that owns them. The
       longest-match rule is what keeps that true if a desk is ever promoted
       to a section of its own again. */
    it("lights Listings across every desk that belongs to it", () => {
        for (const path of [
            "/listings",
            "/listings/review",
            "/listings/review/lst_1",
            "/listings/verification",
            "/listings/renewals",
            "/listings/claims",
            "/listings/directory",
            "/listings/drafts/drf_1",
            "/listings/lst_1",
        ]) {
            expect(activeRailHref(path), path).toBe("/listings");
        }
    });

    /* A row whose declared paths are not beneath it — "Plans & subscriptions"
       points at the catalogue while its siblings sit elsewhere under
       /packages. It used to light nothing at all. */
    it("lights a row on the paths it declares, not only on its own href", () => {
        expect(activeRailHref("/packages/subscriptions")).toBe("/packages/catalogue");
        expect(activeRailHref("/packages/sales")).toBe("/packages/catalogue");
    });

    /* AS-1: the ads ADX sells are a section of their own, not a Growth tab. */
    it("lights Ads & sponsored across its tabs, and Growth no longer owns an ads path", () => {
        for (const path of ["/ads", "/ads/review", "/ads/display", "/ads/sponsored", "/ads/slots"]) {
            expect(activeRailHref(path), path).toBe("/ads");
        }
        const growth = railItems.find((row) => row.href === "/growth");
        expect(growth?.children?.map((child) => child.href)).toEqual(["/growth", "/growth/ladder", "/growth/promo-codes"]);
        const marketplace = navigation.find((section) => section.id === "marketplace");
        expect(marketplace?.items.map((row) => row.href)).toContain("/ads");
    });

    it("lights nothing on a path the rail does not own", () => {
        expect(activeRailHref("/somewhere-else")).toBeNull();
    });

    it("uses each rail href once", () => {
        const hrefs = railItems.map((row) => row.href);
        expect(new Set(hrefs).size).toBe(hrefs.length);
    });
});
