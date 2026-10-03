import { describe, expect, it } from "vitest";
import { fromLocalInput, narrowSpec, toLocalInput } from "./block-editor";

/** LM-1: the block editor's pure helpers — the schedule's local ↔ ISO round trip and the banner's picture spec. */
describe("the schedule inputs", () => {
    it("round-trips an instant through the datetime-local value", () => {
        const iso = "2026-10-01T06:30:00.000Z";
        expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
        expect(toLocalInput(undefined)).toBe("");
        expect(toLocalInput("not a date")).toBe("");
        expect(fromLocalInput("")).toBeUndefined();
        expect(fromLocalInput("garbage")).toBeUndefined();
    });
});

describe("the banner's picture spec", () => {
    const field = { key: "mediaId", label: "Picture", input: "media", required: true, spec: "PROMO_WIDE,PROMO_SQUARE" } as const;
    it("narrows to the chosen shape, and leaves every other field alone", () => {
        expect(narrowSpec("promo_banner", { ...field }, { aspect: "WIDE" }).spec).toBe("PROMO_WIDE");
        expect(narrowSpec("promo_banner", { ...field }, { aspect: "SQUARE" }).spec).toBe("PROMO_SQUARE");
        expect(narrowSpec("promo_banner", { ...field }, {}).spec).toBe("PROMO_WIDE,PROMO_SQUARE");
        expect(narrowSpec("tile_grid", { ...field }, { aspect: "WIDE" }).spec).toBe("PROMO_WIDE,PROMO_SQUARE");
    });
});
