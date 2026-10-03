import { describe, expect, it } from "vitest";
import { answersInPlay, collectedDocuments, computedValue, dependantsOf, earlierFieldIds, isNumbered, missingFields, screensInPlay, withAnswer, CONTENT_RULES_FIELD } from "./flow-model";
import { LISTING_FLOW_FIXTURE as flow } from "./test-fixtures";

/**
 * FL-2/FL-3: the wizard walked on the web the way the apps walk it — the
 * screens in play follow the branch, an answer that changes clears what
 * depended on it, and only the answers the screens in play asked for are
 * kept for the API.
 */

const outdoor = () => screensInPlay(flow, { category: "outdoor" });

describe("screensInPlay", () => {
    it("is the root alone before the branching field is answered, then the root and the branch", () => {
        expect(screensInPlay(flow, {}).map((screen) => screen.key)).toEqual(["select-category"]);
        expect(outdoor().map((screen) => screen.key)).toEqual(["select-category", "venue", "spot-type", "spot-details", "more-info", "audience", "content-rules", "terms", "pricing", "rate-card", "documents", "review"]);
        /* An option that names no branch opens nothing. */
        expect(screensInPlay(flow, { category: "space" }).map((screen) => screen.key)).toEqual(["select-category"]);
    });

    it("numbers the ten steps and leaves the documents and the review unnumbered", () => {
        const numbered = outdoor().filter(isNumbered).map((screen) => screen.key);
        expect(numbered).toEqual(["select-category", "venue", "spot-type", "spot-details", "more-info", "audience", "content-rules", "terms", "pricing", "rate-card"]);
    });
});

describe("withAnswer", () => {
    it("clears what depends on the answer that changed — the venue clears the spot type, the material and the placement", () => {
        const answers = { category: "indoor", venue_type_id: "vt_mall", media_type_id: "mt_atrium", material_id: "mat_led", placement: "Atrium", title: "Kept" };
        const next = withAnswer(flow, answers, "venue_type_id", "vt_gym");
        expect(next).toEqual({ category: "indoor", venue_type_id: "vt_gym", title: "Kept" });
        /* The spot type clears the material only. */
        expect(withAnswer(flow, answers, "media_type_id", "mt_standee")).toEqual({ category: "indoor", venue_type_id: "vt_mall", media_type_id: "mt_standee", placement: "Atrium", title: "Kept" });
    });

    it("clears the taxonomy answers when the branch moves, and keeps the rest for a way back", () => {
        const answers = { category: "indoor", venue_type_id: "vt_mall", media_type_id: "mt_atrium", material_id: "mat_led", placement: "Atrium", address: "MG Road", illumination: "Back-lit" };
        expect(withAnswer(flow, answers, "category", "outdoor")).toEqual({ category: "outdoor", address: "MG Road", illumination: "Back-lit" });
    });

    it("removes the key on undefined and changes nothing else when the value is the same", () => {
        expect(withAnswer(flow, { category: "outdoor", title: "X" }, "title", undefined)).toEqual({ category: "outdoor" });
        const same = { category: "indoor", venue_type_id: "vt_mall", media_type_id: "mt_atrium" };
        expect(withAnswer(flow, same, "venue_type_id", "vt_mall")).toEqual(same);
    });

    it("names the dependants transitively", () => {
        expect(dependantsOf(outdoor(), "venue_type_id").sort()).toEqual(["material_id", "media_type_id", "placement"]);
    });
});

describe("missingFields", () => {
    const review = outdoor().find((screen) => screen.key === "review")!;
    const pricing = outdoor().find((screen) => screen.key === "pricing")!;

    it("counts a required checkbox as answered only by a tick, and a blank string as missing", () => {
        expect(missingFields(review, { main_photo: "https://x/y.jpg", terms: false })).toEqual(["Terms agreement"]);
        expect(missingFields(review, { main_photo: "  ", terms: true })).toEqual(["Main photo (front)"]);
        expect(missingFields(review, { main_photo: "https://x/y.jpg", terms: true })).toEqual([]);
        expect(missingFields(pricing, { pricing_unit: "PER_DAY" })).toEqual(["Base price (Rs)"]);
    });
});

describe("answersInPlay", () => {
    it("drops the answers of a branch walked away from, keeps content_rules while a content field is in play, and filters document rows by the kinds offered", () => {
        const answers = {
            category: "media",
            title: "Prime time",
            illumination: "Back-lit",
            [CONTENT_RULES_FIELD]: [{ contentCategoryId: "cc_alcohol", stance: "ALLOWED" }],
            documents: [
                { kind: "MUNICIPAL_PERMIT", url: "https://x/permit.pdf" },
                { kind: "DISPLAY_AGREEMENT", url: "https://x/agreement.pdf" },
            ],
            never_asked: "gone",
        };
        const kept = answersInPlay(answers, screensInPlay(flow, answers));
        expect(kept).toEqual({
            category: "media",
            title: "Prime time",
            [CONTENT_RULES_FIELD]: [{ contentCategoryId: "cc_alcohol", stance: "ALLOWED" }],
            documents: [{ kind: "DISPLAY_AGREEMENT", url: "https://x/agreement.pdf" }],
        });
        /* Before a branch, the content rules are not asked and go too. */
        expect(answersInPlay({ [CONTENT_RULES_FIELD]: [], category: "x" }, screensInPlay(flow, {}))).toEqual({ category: "x" });
    });
});

describe("computedValue and the documents", () => {
    const area = outdoor().find((screen) => screen.key === "spot-details")!.fields.find((field) => field.id === "area_sq_ft")!;

    it("multiplies the width and height the way the server rounds the area, and sums for add", () => {
        expect(computedValue(area, { width_ft: "40", height_ft: "20" })).toBe("800.00");
        expect(computedValue(area, { width_ft: "3.33", height_ft: "3.33" })).toBe("11.09");
        expect(computedValue(area, { width_ft: "40" })).toBeNull();
        expect(computedValue({ id: "sum", type: "computed", label: "Sum", from: ["a", "b"], op: "add" }, { a: "2", b: "3.5" })).toBe("5.5");
        expect(computedValue({ id: "sum", type: "computed", label: "Sum", from: ["a", "b"], op: "add" }, { a: "2", b: "" })).toBeNull();
    });

    it("keeps only the rows with a kind and a URL", () => {
        expect(collectedDocuments({ documents: [{ kind: "OWNER_NOC", url: " " }, { kind: "ADDRESS_PROOF", url: "https://x/a.pdf" }, { kind: 1 }] })).toEqual([{ kind: "ADDRESS_PROOF", url: "https://x/a.pdf" }]);
        expect(collectedDocuments({})).toEqual([]);
    });

    it("names the fields asked before one", () => {
        expect(earlierFieldIds(outdoor(), "material_id")).toEqual(["category", "venue_type_id", "media_type_id"]);
    });
});
