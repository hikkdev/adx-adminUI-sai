import { describe, expect, it } from "vitest";
import { orderLabel, shapeOrder } from "./orders";
import { ORDER_PIPELINE_STAGES, ORDER_STAGE_OF, ORDER_STATUS_META } from "@/types";
import type { OrderStatus } from "@/types";

/**
 * The join-flattening the console does to an order, and the board that sorts it.
 *
 * Orders came off fixtures by adopting the backend's vocabulary rather than
 * translating into the console's own. These pin the two places that can still
 * go quietly wrong: a relation the wire left out, and a status that belongs to
 * no column.
 */

const wire = (over: Record<string, unknown> = {}) => ({
    id: "cmzOrder001",
    status: "SLOT_CONFIRMED" as OrderStatus,
    campaignName: "Diwali brand push",
    budget: 240000,
    startDate: "2026-05-01",
    endDate: "2026-05-31",
    slotTime: "2026-04-25T14:00:00+05:30",
    createdAt: "2026-04-24T10:00:00+05:30",
    agentId: "cmzAgent001",
    listing: { title: "MG Road Billboard", city: "Bengaluru" },
    agent: { user: { name: "Ravi Kumar" } },
    ...over,
});

describe("flattening an order", () => {
    it("lifts the names off the joins the console renders", () => {
        const order = shapeOrder(wire());
        expect(order.listing).toBe("MG Road Billboard");
        expect(order.city).toBe("Bengaluru");
        expect(order.agent).toBe("Ravi Kumar");
    });

    /**
     * An order whose listing was deleted would otherwise render the string
     * "undefined" in a table cell. The id is a poor title and a far better bug
     * report than a blank.
     */
    it("falls back to the id rather than rendering nothing for a missing listing", () => {
        expect(shapeOrder(wire({ listing: null })).listing).toBe("cmzOrder001");
    });

    it("reports an unassigned order as unassigned rather than as empty text", () => {
        const order = shapeOrder(wire({ agent: null, agentId: null }));
        expect(order.agent).toBeNull();
        expect(order.agentId).toBeNull();
    });

    /** Absent and zero are different budgets. */
    it("keeps a missing budget null instead of collapsing it to zero", () => {
        expect(shapeOrder(wire({ budget: null })).budget).toBeNull();
        expect(shapeOrder(wire({ budget: 0 })).budget).toBe(0);
    });

    /** Lot H (Q147): the surface the print shop quotes on rides on the detail read's listing join; the list rows carry no category and get no spot. */
    it("keeps the spot off the listing join for the quote desk, feet as strings, and none where the category is not joined", () => {
        const detail = shapeOrder(
            wire({
                listing: { title: "MG Road Billboard", city: "Bengaluru", size: "10x20 ft", widthFt: 10, heightFt: "20.00", category: "OUTDOOR", subType: "Hoarding", placement: null },
                designUrl: "https://cdn.adx.in/art.pdf",
            })
        );
        expect(detail.spot).toEqual({ size: "10x20 ft", widthFt: "10", heightFt: "20.00", category: "OUTDOOR", subType: "Hoarding", placement: null });
        expect(detail.designUrl).toBe("https://cdn.adx.in/art.pdf");
        const row = shapeOrder(wire());
        expect(row.spot).toBeNull();
        expect(row.designUrl).toBeNull();
    });

    /** BK-1: the booking id once minted; the short id — the cuid's tail — until the backfill runs. */
    it("names an order by its booking id, and by the short id while it has none", () => {
        expect(shapeOrder(wire({ displayId: "BKG-2609-2601" })).displayId).toBe("BKG-2609-2601");
        expect(orderLabel(shapeOrder(wire({ displayId: "BKG-2609-2601" })))).toBe("BKG-2609-2601");
        const unminted = shapeOrder(wire());
        expect(unminted.displayId).toBeNull();
        expect(orderLabel(unminted)).toBe("ORDER001");
    });

    /** SI-N: the publisher's own proof rides on the detail read; nothing sent is null, not an empty card. */
    it("folds the self-install photos and note, and leaves them null while the publisher sent nothing", () => {
        expect(shapeOrder(wire()).selfInstall).toBeNull();
        expect(shapeOrder(wire({ selfInstallConditionPhotoUrls: [], selfInstallNotes: "  " })).selfInstall).toBeNull();
        const proof = shapeOrder(
            wire({
                selfInstallConditionPhotoUrls: ["/api/v1/files/f1", "/api/v1/files/f2"],
                selfInstallInstallPhotoUrl: "/api/v1/files/f3",
                selfInstallNotes: " Left pole was rusted; cleaned before pasting. ",
                selfInstallCheckedInAt: "2026-09-25T04:00:00.000Z",
            })
        ).selfInstall;
        expect(proof).toEqual({
            conditionPhotoUrls: ["/api/v1/files/f1", "/api/v1/files/f2"],
            installPhotoUrl: "/api/v1/files/f3",
            collectPhotoUrl: null,
            notes: "Left pole was rusted; cleaned before pasting.",
            checkedInAt: "2026-09-25T04:00:00.000Z",
        });
    });
});

describe("the board", () => {
    const ALL = Object.keys(ORDER_STATUS_META) as OrderStatus[];

    /**
     * The invariant that keeps a status from vanishing. `ORDER_STAGE_OF` is
     * generated from the columns, so a status added to the enum and forgotten
     * in `ORDER_PIPELINE_STAGES` would silently stop appearing on the board —
     * an order nobody can see is an order nobody works.
     */
    it("gives every status exactly one column", () => {
        for (const status of ALL) {
            expect(ORDER_STAGE_OF[status], `${status} is in no column`).toBeDefined();
        }
        const listed = ORDER_PIPELINE_STAGES.flatMap((stage) => stage.statuses);
        expect(new Set(listed).size).toBe(listed.length);
        expect(new Set(listed)).toEqual(new Set(ALL));
    });

    it("keeps the two ways an order stops out of the finished column", () => {
        expect(ORDER_STAGE_OF.PUBLISHER_REJECTED).toBe("stopped");
        expect(ORDER_STAGE_OF.AGENT_REJECTED).toBe("stopped");
        expect(ORDER_STAGE_OF.CANCELLED).toBe("stopped");
        expect(ORDER_STAGE_OF.COMPLETED).toBe("done");
    });
});
