import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * FM-1: the form builder's pure half — the definition rules applied before
 * the server does, ids for new fields, the dirty check, how an answer
 * prints — and the doors each action takes.
 */

const { calls } = vi.hoisted(() => ({ calls: [] as { method: string; path: string; body?: unknown }[] }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (method: string) => async (path: string, body?: unknown) => {
        calls.push({ method, path, body });
        return {};
    };
    return {
        ...actual,
        api: { ...actual.api, get: record("GET"), post: record("POST"), patch: record("PATCH"), put: record("PUT"), delete: record("DELETE"), blob: record("GET") },
    };
});

import {
    answerText,
    badEmails,
    cleanDefinition,
    definitionProblems,
    emptyDefinition,
    fieldsBefore,
    formKeyFrom,
    formKeyProblem,
    formsService,
    isForbiddenField,
    moveItem,
    newFieldId,
    newScreenKey,
    parseEmails,
    sameDefinition,
    type FormDefinition,
    type FormField,
} from "./forms";

beforeEach(() => {
    calls.length = 0;
});

const field = (id: string, over: Partial<FormField> = {}): FormField => ({ id, kind: "text", label: id, ...over });

const definition = (fields: FormField[], over: Partial<FormDefinition> = {}): FormDefinition => ({
    ...emptyDefinition(),
    screens: [{ key: "screen-1", fields }],
    ...over,
});

describe("the key", () => {
    it("is suggested from the title and refused when taken or malformed", () => {
        expect(formKeyFrom("Event sign-up!")).toBe("event-sign-up");
        expect(formKeyProblem("event-signup")).toBeNull();
        expect(formKeyProblem("")).toMatch(/needs a key/);
        expect(formKeyProblem("Event")).toMatch(/Lowercase/);
        expect(formKeyProblem("event-signup", ["event-signup"])).toMatch(/already a form/);
    });
});

describe("the definition", () => {
    it("starts with one empty screen, a consent line and a success message", () => {
        const fresh = emptyDefinition();
        expect(fresh.screens).toHaveLength(1);
        expect(fresh.consentText.length).toBeGreaterThan(0);
        expect(definitionProblems(fresh, "PUBLIC")).toEqual({});
    });

    it("refuses Aadhaar by id or label, before the server does", () => {
        expect(isForbiddenField(field("aadhaar-number"))).toBe(true);
        expect(isForbiddenField(field("id-number", { label: "Aadhar" }))).toBe(true);
        expect(isForbiddenField(field("uid"))).toBe(true);
        expect(isForbiddenField(field("guide"))).toBe(false);
        expect(definitionProblems(definition([field("f1", { label: "Aadhaar" })]), "PUBLIC")["screens.0.fields.0.label"]).toMatch(/Aadhaar is never/);
    });

    it("wants unique ids, options on the picking kinds, a file only when signed in, and dependsOn on an earlier field", () => {
        const problems = definitionProblems(
            definition([
                field("name"),
                field("name", { label: "Again" }),
                field("choice", { kind: "select", options: [] }),
                field("dup", { kind: "multiselect", options: [{ value: "a", label: "A" }, { value: "a", label: "B" }] }),
                field("upload", { kind: "file" }),
                field("why", { dependsOn: { fieldId: "later", equals: "x" } }),
                field("later"),
                field("range", { kind: "number", min: 5, max: 1 }),
                field("", { label: "" }),
                field("weird", { kind: "slider" }),
            ]),
            "PUBLIC",
        );
        expect(problems["screens.0.fields.1.id"]).toMatch(/used twice/);
        expect(problems["screens.0.fields.2.options"]).toMatch(/at least one option/);
        expect(problems["screens.0.fields.3.options"]).toMatch(/share a value/);
        expect(problems["screens.0.fields.4.kind"]).toMatch(/signed-in form/);
        expect(problems["screens.0.fields.5.dependsOn"]).toMatch(/comes before/);
        expect(problems["screens.0.fields.7.max"]).toMatch(/below the minimum/);
        expect(problems["screens.0.fields.8.id"]).toMatch(/needs an id/);
        expect(problems["screens.0.fields.8.label"]).toMatch(/needs a label/);
        expect(problems["screens.0.fields.9.kind"]).toMatch(/not a field kind/);
        expect(definitionProblems(definition([field("upload", { kind: "file" })]), "SIGNED_IN")).toEqual({});
    });

    it("holds the consent line, the success message and the contact map", () => {
        const problems = definitionProblems(definition([field("name")], { consentText: " ", successMessage: "", contactMap: { email: "mail" } }), "PUBLIC");
        expect(problems.consentText).toMatch(/consent line/);
        expect(problems.successMessage).toMatch(/after sending/);
        expect(problems["contactMap.email"]).toMatch(/No field is called/);
        expect(definitionProblems({ ...emptyDefinition(), screens: [] }, "PUBLIC").screens).toMatch(/at least one screen/);
    });

    it("names the fields a dependsOn may point at — those before it, across screens", () => {
        const def: FormDefinition = { ...emptyDefinition(), screens: [{ key: "a", fields: [field("one"), field("two")] }, { key: "b", fields: [field("three")] }] };
        expect(fieldsBefore(def, "three").map((item) => item.id)).toEqual(["one", "two"]);
        expect(fieldsBefore(def, "one")).toEqual([]);
    });

    it("mints ids past the ones in use and moves items", () => {
        expect(newFieldId("text", [])).toBe("text-1");
        expect(newFieldId("text", ["text-1", "text-2"])).toBe("text-3");
        expect(newFieldId("text", ["text-3", "b", "c"])).toBe("text-4");
        expect(newScreenKey(["screen-1"])).toBe("screen-2");
        expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
        expect(moveItem(["a", "b", "c"], 5, 0)).toEqual(["a", "b", "c"]);
    });

    it("reads two definitions as the same whatever the key order or the empty strings", () => {
        const a = definition([field("name", { hint: "" })]);
        const b: FormDefinition = { consentText: a.consentText, successMessage: a.successMessage, submitLabel: a.submitLabel, screens: [{ fields: [{ label: "name", kind: "text", id: "name" }], key: "screen-1" }] };
        expect(sameDefinition(a, b)).toBe(true);
        expect(sameDefinition(a, definition([field("name", { required: true })]))).toBe(false);
        expect((cleanDefinition(a).screens[0]!.fields[0] as { hint?: string }).hint).toBeUndefined();
    });
});

describe("submissions", () => {
    it("prints an answer as a person would read it", () => {
        expect(answerText("text", "hi")).toBe("hi");
        expect(answerText("text", "")).toBe("—");
        expect(answerText("checkbox", true)).toBe("Yes");
        expect(answerText("multiselect", ["a", "b"])).toBe("a, b");
        expect(answerText("location", { address: "MG Road, Bengaluru" })).toBe("MG Road, Bengaluru");
        expect(answerText("location", { latitude: 12.97, longitude: 77.59 })).toBe("12.97000, 77.59000");
        expect(answerText("file", { name: "deck.pdf" })).toBe("deck.pdf");
    });

    it("cleans the notify emails and names the bad ones", () => {
        expect(parseEmails("Ops@adx.in, ops@adx.in\nsales@adx.in;")).toEqual(["ops@adx.in", "sales@adx.in"]);
        expect(badEmails(["ops@adx.in", "nope"])).toEqual(["nope"]);
    });
});

describe("the routes", () => {
    it("takes each action to its own door", async () => {
        await formsService.list();
        await formsService.fieldKinds();
        await formsService.create({ key: "event-signup", title: "Event sign-up", destination: "LEAD", leadSide: "ADVERTISER" });
        await formsService.get("event-signup");
        await formsService.update("event-signup", { notifyEmails: ["ops@adx.in"] });
        await formsService.saveDraft("event-signup", emptyDefinition(), "first");
        await formsService.discardDraft("event-signup");
        await formsService.publish("event-signup", "go");
        await formsService.versions("event-signup");
        await formsService.restore("event-signup", 2);
        await formsService.archive("event-signup");
        await formsService.restoreForm("event-signup");
        await formsService.submissions("event-signup", { status: "NEW", cityId: "c1", page: 2, pageSize: 25 });
        await formsService.submissionsCsv("event-signup");
        await formsService.submissionsMap("event-signup", { west: 77.5, south: 12.9, east: 77.7, north: 13.1 });
        await formsService.setSubmissionStatus("event-signup", "sub_1", "READ");
        expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
            "GET /forms",
            "GET /forms/field-kinds",
            "POST /forms",
            "GET /forms/event-signup",
            "PATCH /forms/event-signup",
            "PUT /forms/event-signup/draft",
            "DELETE /forms/event-signup/draft",
            "POST /forms/event-signup/publish",
            "GET /forms/event-signup/versions",
            "POST /forms/event-signup/versions/2/restore",
            "POST /forms/event-signup/archive",
            "POST /forms/event-signup/restore-form",
            "GET /forms/event-signup/submissions?status=NEW&cityId=c1&page=2&pageSize=25",
            "GET /forms/event-signup/submissions.csv",
            "GET /forms/event-signup/submissions/map?bbox=77.500000,12.900000,77.700000,13.100000",
            "PATCH /forms/event-signup/submissions/sub_1",
        ]);
        expect(calls[5]!.body).toMatchObject({ changeNote: "first" });
        expect(calls[15]!.body).toEqual({ status: "READ" });
    });
});
