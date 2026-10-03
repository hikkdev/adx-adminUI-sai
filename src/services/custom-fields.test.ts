import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CF-1: the custom fields desk's pure half — the key a label suggests, what
 * a definition and an answer are refused for, how an answer prints — and
 * the doors each action takes.
 */

const { calls } = vi.hoisted(() => ({ calls: [] as { method: string; path: string; body?: unknown }[] }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (method: string) => async (path: string, body?: unknown) => {
        calls.push({ method, path, body });
        return {};
    };
    return { ...actual, api: { ...actual.api, get: record("GET"), post: record("POST"), patch: record("PATCH"), put: record("PUT"), delete: record("DELETE") } };
});

import { customFieldsService, defProblems, fieldKeyFrom, formatValue, isEmptyValue, optionsText, parseOptions, sortDefs, valueProblem, type CustomFieldDef } from "./custom-fields";

beforeEach(() => {
    calls.length = 0;
});

const def = (over: Partial<CustomFieldDef> = {}): CustomFieldDef => ({
    id: "cf_1",
    entity: "PUBLISHER",
    key: "preferred_contact_time",
    label: "Preferred contact time",
    kind: "text",
    options: null,
    hint: null,
    required: false,
    showOnDesk: true,
    showInApps: false,
    showOnWebsite: false,
    editableByOwner: false,
    sortOrder: 0,
    archivedAt: null,
    ...over,
});

describe("a definition", () => {
    it("takes its key from the label and refuses a bad or taken one", () => {
        expect(fieldKeyFrom("Preferred contact time")).toBe("preferred_contact_time");
        expect(fieldKeyFrom("2nd phone")).toBe("nd_phone");
        expect(defProblems({ key: "preferred_contact_time", label: "Preferred contact time", kind: "text", options: [] })).toEqual({});
        expect(defProblems({ key: "", label: "", kind: "text", options: [] })).toMatchObject({ key: expect.stringMatching(/needs a key/), label: expect.stringMatching(/needs a label/) });
        expect(defProblems({ key: "Bad-Key", label: "x", kind: "text", options: [] }).key).toMatch(/Lowercase/);
        expect(defProblems({ key: "x", label: "x", kind: "text", options: [] }, ["x"]).key).toMatch(/already a field/);
        expect(defProblems({ key: "x", label: "Aadhaar number", kind: "text", options: [] }).label).toMatch(/Aadhaar is never/);
        expect(defProblems({ key: "x", label: "x", kind: "colour", options: [] }).kind).toMatch(/Pick a kind/);
    });

    it("wants options on the picking kinds, each with a value and a label, no two alike", () => {
        expect(defProblems({ key: "x", label: "x", kind: "select", options: [] }).options).toMatch(/at least one/);
        expect(defProblems({ key: "x", label: "x", kind: "select", options: [{ value: "", label: "A" }] }).options).toMatch(/value and a label/);
        expect(defProblems({ key: "x", label: "x", kind: "multiselect", options: [{ value: "a", label: "A" }, { value: "a", label: "B" }] }).options).toMatch(/share a value/);
        expect(defProblems({ key: "x", label: "x", kind: "select", options: [{ value: "a", label: "A" }] })).toEqual({});
    });

    it("reads options one per line and writes them back", () => {
        expect(parseOptions("Morning\nevening_slot | Evening\n\n")).toEqual([
            { value: "morning", label: "Morning" },
            { value: "evening_slot", label: "Evening" },
        ]);
        expect(optionsText([{ value: "morning", label: "Morning" }, { value: "evening_slot", label: "Evening" }])).toBe("Morning\nevening_slot | Evening");
    });

    it("orders by sortOrder then label", () => {
        expect(sortDefs([def({ id: "b", label: "Beta", sortOrder: 1 }), def({ id: "a", label: "Alpha", sortOrder: 1 }), def({ id: "z", label: "Zero", sortOrder: 0 })]).map((item) => item.id)).toEqual(["z", "a", "b"]);
    });
});

describe("an answer", () => {
    it("knows when it says nothing, and what is required", () => {
        expect(isEmptyValue("text", "  ")).toBe(true);
        expect(isEmptyValue("multiselect", [])).toBe(true);
        expect(isEmptyValue("checkbox", false)).toBe(false);
        expect(isEmptyValue("location", { latitude: 1 })).toBe(true);
        expect(valueProblem(def({ required: true }), "")).toBe("Required.");
        expect(valueProblem(def(), "")).toBeNull();
    });

    it("is checked per kind", () => {
        expect(valueProblem(def({ kind: "number" }), 3)).toBeNull();
        expect(valueProblem(def({ kind: "number" }), "3")).toMatch(/A number/);
        expect(valueProblem(def({ kind: "email" }), "ops@adx.in")).toBeNull();
        expect(valueProblem(def({ kind: "email" }), "nope")).toMatch(/email/);
        expect(valueProblem(def({ kind: "phone" }), "+91 98765 43210")).toBeNull();
        expect(valueProblem(def({ kind: "url" }), "https://adx.in")).toBeNull();
        expect(valueProblem(def({ kind: "url" }), "adx.in")).toMatch(/https/);
        expect(valueProblem(def({ kind: "date" }), "2026-10-01")).toBeNull();
        expect(valueProblem(def({ kind: "select", options: [{ value: "a", label: "A" }] }), "b")).toMatch(/Pick one/);
        expect(valueProblem(def({ kind: "multiselect", options: [{ value: "a", label: "A" }] }), ["a"])).toBeNull();
        expect(valueProblem(def({ kind: "location" }), { latitude: 12.97, longitude: 77.59 })).toBeNull();
        expect(valueProblem(def({ kind: "location" }), { latitude: 120, longitude: 77.59 })).toMatch(/point on the map/);
        expect(valueProblem(def({ kind: "checkbox" }), true)).toBeNull();
    });

    it("prints as a person would read it", () => {
        expect(formatValue(def(), "")).toBe("—");
        expect(formatValue(def({ kind: "checkbox" }), true)).toBe("Yes");
        expect(formatValue(def({ kind: "select", options: [{ value: "am", label: "Morning" }] }), "am")).toBe("Morning");
        expect(formatValue(def({ kind: "multiselect", options: [{ value: "am", label: "Morning" }, { value: "pm", label: "Evening" }] }), ["am", "pm"])).toBe("Morning, Evening");
        expect(formatValue(def({ kind: "location" }), { latitude: 12.97, longitude: 77.59, address: "MG Road" })).toBe("MG Road");
        expect(formatValue(def({ kind: "location" }), { latitude: 12.97, longitude: 77.59 })).toBe("12.97000, 77.59000");
    });
});

describe("the routes", () => {
    it("takes each action to its own door", async () => {
        await customFieldsService.list("LISTING");
        await customFieldsService.list("LISTING", { includeArchived: true });
        await customFieldsService.create({ entity: "LISTING", key: "facing", label: "Facing", kind: "select", options: [{ value: "n", label: "North" }] });
        await customFieldsService.update("cf_1", { label: "Facing direction" });
        await customFieldsService.archive("cf_1");
        await customFieldsService.restore("cf_1");
        await customFieldsService.values("LISTING", "lst_1");
        await customFieldsService.saveValues("LISTING", "lst_1", { facing: "n" });
        expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
            "GET /custom-fields?entity=LISTING",
            "GET /custom-fields?entity=LISTING&includeArchived=true",
            "POST /custom-fields",
            "PATCH /custom-fields/cf_1",
            "POST /custom-fields/cf_1/archive",
            "POST /custom-fields/cf_1/restore",
            "GET /custom-fields/values/LISTING/lst_1",
            "PUT /custom-fields/values/LISTING/lst_1",
        ]);
        expect(calls[7]!.body).toEqual({ values: { facing: "n" } });
    });
});
