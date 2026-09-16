import { describe, expect, it, vi } from "vitest";

/**
 * The flow editor's service — what a save sends and how a refusal is read.
 *
 * The board saves the whole flow, and the server validates it against the
 * apps' vocabulary rather than trusting the console. What is pinned here is
 * the seam between the two: the body carries the version the editor loaded
 * (so a stale board is refused, not merged), never the server's own
 * `updatedAt`; a 400 comes back as lines a person can act on rather than a
 * toast that says "Invalid request"; and the ladder's coverage rule is read
 * the same way the server reads it, so the board can refuse before the
 * server does.
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
        api: { get: record("GET"), post: record("POST"), patch: record("PATCH"), put: record("PUT"), delete: record("DELETE") },
    };
});

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, isLive: () => true };
});

import { ApiError } from "@/lib/api-client";
import type { FieldKindSpec, OnboardingTemplate, WizardFlow } from "@/types";
import { flowAudience, flowBody, flowIssues, flowService, flowStats, ladderCoverage, pointerOf, resolveLadderIssue, resolveWizardIssue, retypeField, unknownKinds } from "./flows";

const wizard = (): WizardFlow => ({
    label: "Listing",
    version: 3,
    updatedAt: "2026-09-12T10:00:00.000Z",
    screens: [
        {
            key: "select-category",
            title: "Ad space category",
            step: 1,
            totalSteps: 7,
            ctaLabel: "Continue",
            fields: [
                {
                    id: "category",
                    type: "selectable-cards",
                    label: "Category",
                    required: true,
                    branching: true,
                    options: [{ id: "outdoor", title: "Outdoor" }],
                },
            ],
        },
    ],
    branches: {
        outdoor: {
            id: "outdoor",
            title: "Outdoor",
            description: "Hoardings",
            screens: [
                { key: "venue", title: "Venue", step: 2, totalSteps: 7, ctaLabel: "Continue", fields: [{ id: "venue", type: "venue-type", label: "Venue" }] },
                { key: "pricing", title: "Pricing", step: 3, totalSteps: 7, ctaLabel: "Continue", fields: [{ id: "price", type: "base-price", label: "Rate", showIndicator: true }] },
            ],
        },
    },
});

describe("what a save sends", () => {
    it("PATCHes the flow whole, with the version it loaded and without the server's updatedAt", async () => {
        calls.length = 0;
        await flowService.save("listing", wizard());
        expect(calls).toHaveLength(1);
        expect(calls[0].method).toBe("PATCH");
        expect(calls[0].path).toBe("/config/flows/listing");
        const body = calls[0].body as WizardFlow;
        expect(body.version).toBe(3);
        expect("updatedAt" in body).toBe(false);
        expect(Object.keys(body.branches)).toEqual(["outdoor"]);
    });

    it("keeps the body's other keys exactly — the server strict-parses it", () => {
        const body = flowBody(wizard());
        expect(Object.keys(body).sort()).toEqual(["branches", "label", "screens", "version"]);
    });

    it("G13-B: sends a trimmed audience and drops a blank one; the card reads the stored one over the code's", () => {
        expect(flowBody({ ...wizard(), audience: "  Publishers " }).audience).toBe("Publishers");
        expect("audience" in flowBody({ ...wizard(), audience: "   " })).toBe(false);
        expect(flowAudience({ audience: "Publishers" }, undefined)).toBe("Publishers");
        expect(flowAudience({ audience: "Publishers" }, { ...wizard(), audience: "Field agents" })).toBe("Field agents");
        expect(flowAudience({ audience: null }, wizard())).toBeNull();
    });

    it("reads the whole row through GET /config and the summaries through GET /config/flows", async () => {
        calls.length = 0;
        await flowService.document();
        await flowService.list();
        await flowService.schema();
        expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual(["GET /config", "GET /config/flows", "GET /config/schema"]);
    });
});

describe("what the server refused", () => {
    it("turns the 400's Zod flatten into one line per message, keyed by the top-level key", () => {
        const error = new ApiError(400, "VALIDATION_ERROR", "The flow does not fit the vocabulary", {
            formErrors: [],
            fieldErrors: {
                screens: ["Screen key `venue` is used twice", "`options` is not a property of a switch field"],
                branches: ["Branch `indoor` is not the target of any option"],
            },
        });
        expect(flowIssues(error)).toEqual([
            { where: "screens", message: "Screen key `venue` is used twice" },
            { where: "screens", message: "`options` is not a property of a switch field" },
            { where: "branches", message: "Branch `indoor` is not the target of any option" },
        ]);
    });

    it("surfaces the ladder's refusal — a required KYC column never captured", () => {
        const error = new ApiError(400, "VALIDATION_ERROR", "The flow does not fit the vocabulary", {
            formErrors: [],
            fieldErrors: { ladders: ["The PUBLISHER INDIVIDUAL ladder never captures selfVideoUrl"] },
        });
        expect(flowIssues(error)).toEqual([{ where: "ladders", message: "The PUBLISHER INDIVIDUAL ladder never captures selfVideoUrl" }]);
    });

    it("reads E10-2's issues with their full path, and prefers them to the flatten beside them", () => {
        const error = new ApiError(400, "VALIDATION_ERROR", "The flow does not fit the vocabulary", {
            formErrors: [],
            fieldErrors: { branches: ["`options` is not a property of a switch field"], screens: ["Screen key `venue` is used twice"] },
            issues: [
                { path: ["branches", "outdoor", "screens", "1", "fields", "0", "options"], pointer: "branches.outdoor.screens[1].fields[0].options", message: "`options` is not a property of a switch field", code: "custom" },
                { path: ["screens", "0", "key"], message: "Screen key `venue` is used twice", code: "custom" },
                { path: [], message: "The flow needs at least one screen", code: "too_small" },
            ],
        });
        expect(flowIssues(error)).toEqual([
            {
                where: "branches",
                message: "`options` is not a property of a switch field",
                path: ["branches", "outdoor", "screens", "1", "fields", "0", "options"],
                pointer: "branches.outdoor.screens[1].fields[0].options",
            },
            // A pointer the server did not send is built the way the server builds it.
            { where: "screens", message: "Screen key `venue` is used twice", path: ["screens", "0", "key"], pointer: "screens[0].key" },
            { where: "flow", message: "The flow needs at least one screen", path: [], pointer: "" },
        ]);
        expect(pointerOf(["ladders", "PUBLISHER", "INDIVIDUAL", "2"])).toBe("ladders.PUBLISHER.INDIVIDUAL[2]");
    });

    it("falls back to the flatten when issues is absent or empty — a server one release behind", () => {
        const error = new ApiError(400, "VALIDATION_ERROR", "Refused", { formErrors: [], fieldErrors: { screens: ["Bad"] }, issues: [] });
        expect(flowIssues(error)).toEqual([{ where: "screens", message: "Bad" }]);
    });

    it("reads a stale editor's 409 as one line naming the live version", () => {
        const error = new ApiError(409, "CONFLICT", "The flow is at version 4; the editor was on 3", { currentVersion: 4 });
        const issues = flowIssues(error);
        expect(issues).toHaveLength(1);
        expect(issues[0].where).toBe("version");
        expect(issues[0].message).toContain("version 4");
    });

    it("falls back to the error's own sentence when there is no flatten", () => {
        expect(flowIssues(new ApiError(403, "FORBIDDEN", "Admins only"))).toEqual([{ where: "flow", message: "Admins only" }]);
        expect(flowIssues(new Error("offline"))).toEqual([{ where: "request", message: "offline" }]);
    });
});

describe("where a refusal lands on the wizard board", () => {
    it("resolves a path to the lane, the screen by key, the field by id and the prop", () => {
        const flow = wizard();
        expect(resolveWizardIssue(flow, ["screens", "0", "fields", "0", "options"])).toEqual({ lane: null, screenKey: "select-category", fieldId: "category", prop: "options" });
        expect(resolveWizardIssue(flow, ["branches", "outdoor", "screens", "1", "fields", "0", "showIndicator"])).toEqual({
            lane: "outdoor",
            screenKey: "pricing",
            fieldId: "price",
            prop: "showIndicator",
        });
        expect(resolveWizardIssue(flow, ["branches", "outdoor", "screens", "0", "fields", "0"])).toEqual({ lane: "outdoor", screenKey: "venue", fieldId: "venue", prop: null });
    });

    it("stops at the screen, the lane or the flow when the path goes no deeper", () => {
        const flow = wizard();
        expect(resolveWizardIssue(flow, ["screens", "0", "key"])).toEqual({ lane: null, screenKey: "select-category", fieldId: null, prop: "key" });
        expect(resolveWizardIssue(flow, ["screens", "0"])).toEqual({ lane: null, screenKey: "select-category", fieldId: null, prop: null });
        expect(resolveWizardIssue(flow, ["screens"])).toEqual({ lane: null, screenKey: null, fieldId: null, prop: null });
        expect(resolveWizardIssue(flow, ["branches", "outdoor"])).toEqual({ lane: "outdoor", screenKey: null, fieldId: null, prop: null });
        expect(resolveWizardIssue(flow, ["branches", "outdoor", "id"])).toEqual({ lane: "outdoor", screenKey: null, fieldId: null, prop: "id" });
        // A field index past the end still lands on the screen's field list.
        expect(resolveWizardIssue(flow, ["screens", "0", "fields", "9"])).toEqual({ lane: null, screenKey: "select-category", fieldId: null, prop: "fields" });
    });

    it("is null for a path that names nothing on the board", () => {
        const flow = wizard();
        expect(resolveWizardIssue(flow, ["label"])).toBeNull();
        expect(resolveWizardIssue(flow, ["branches", "indoor", "screens", "0"])).toBeNull();
        expect(resolveWizardIssue(flow, ["screens", "7", "key"])).toBeNull();
        expect(resolveWizardIssue(flow, [])).toBeNull();
        expect(resolveWizardIssue(flow, undefined)).toBeNull();
    });
});

describe("the vocabulary, read", () => {
    const switchKind: FieldKindSpec = { kind: "switch", label: "Switch", input: true, props: [], requires: [], note: "" };
    const selectKind: FieldKindSpec = { kind: "select", label: "Select", input: true, props: ["options"], requires: ["options"], note: "" };
    const sectionKind: FieldKindSpec = { kind: "section", label: "Section", input: false, props: ["from"], requires: [], note: "" };
    const common = ["id", "type", "label", "required", "placeholder", "hint", "description"];

    it("drops the props the new kind does not read, since the server refuses a field carrying one", () => {
        const field = retypeField({ id: "f", type: "select", label: "Pick", required: true, options: [{ id: "a", title: "A" }] }, switchKind, common);
        expect(field).toEqual({ id: "f", type: "switch", label: "Pick", required: true });
    });

    it("gives a kind what it requires so the board never saves a select with no options", () => {
        const field = retypeField({ id: "f", type: "text", label: "Pick" }, selectKind, common);
        expect(field.options).toEqual([{ id: "option-1", title: "Option 1" }]);
    });

    it("clears required on a kind that collects nothing", () => {
        const field = retypeField({ id: "f", type: "text", label: "Heading", required: true }, sectionKind, common);
        expect("required" in field).toBe(false);
    });

    it("counts a wizard's screens, fields and branches across the root and every branch", () => {
        expect(flowStats(wizard())).toEqual({ screens: 3, fields: 3, branches: 1 });
    });

    it("names every field whose kind the vocabulary lacks, root and branch alike, so the board refuses before the PATCH", () => {
        const flow = {
            label: "Listing",
            screens: [{ key: "basics", title: "Basics", step: 1, totalSteps: 2, ctaLabel: "Next", fields: [{ id: "title", type: "text", label: "Title" }, { id: "old", type: "rich-text", label: "Notes" }] }],
            branches: {
                outdoor: { id: "outdoor", title: "Outdoor", description: "", screens: [{ key: "size", title: "Size", step: 2, totalSteps: 2, ctaLabel: "Done", fields: [{ id: "dims", type: "dimension-picker", label: "Size" }] }] },
            },
        };
        const issues = unknownKinds(flow, [switchKind, selectKind, sectionKind, { kind: "text", label: "Text", input: true, props: [], requires: [], note: "" }]);
        expect(issues).toEqual([
            { where: "screens", message: 'Field "old" on screen "basics" has an unknown kind "rich-text".' },
            { where: "branches", message: 'Field "dims" on screen "size" has an unknown kind "dimension-picker".' },
        ]);
        expect(unknownKinds({ ...flow, screens: [], branches: {} }, [])).toEqual([]);
    });
});

describe("the ladder's coverage rule", () => {
    const required = {
        INDIVIDUAL: ["govIdFrontUrl", "panFrontUrl", "selfieUrl"],
        BUSINESS: ["govIdFrontUrl", "panFrontUrl", "selfieUrl"],
        ORGANISATION: ["govIdFrontUrl", "panFrontUrl", "selfieUrl"],
    } as const;

    const template = (): OnboardingTemplate => ({
        steps: {
            "gov-id": {
                key: "gov-id",
                kind: "capture",
                title: "Government id",
                subtitle: "",
                cta: "Continue",
                documents: [{ key: "front", label: "Front", hint: "", field: "govIdFrontUrl", source: "camera" }],
            },
            pan: {
                key: "pan",
                kind: "capture",
                title: "PAN",
                subtitle: "",
                cta: "Continue",
                documents: [{ key: "pan", label: "PAN", hint: "", field: "panFrontUrl", source: "library" }],
            },
            selfie: {
                key: "selfie",
                kind: "capture",
                title: "Selfie",
                subtitle: "",
                cta: "Continue",
                documents: [{ key: "selfie", label: "Selfie", hint: "", field: "selfieUrl", source: "camera", inert: true }],
            },
        },
        ladders: {
            PUBLISHER: { INDIVIDUAL: ["gov-id", "pan", "selfie"], BUSINESS: ["gov-id", "pan"], ORGANISATION: ["gov-id", "missing-step"] },
            ADVERTISER: { INDIVIDUAL: [], BUSINESS: [], ORGANISATION: [] },
        },
    });

    it("does not count an inert tile as capturing its column", () => {
        const coverage = ladderCoverage(template(), "PUBLISHER", "INDIVIDUAL", { ...required } as never);
        expect(coverage.covered).toEqual(["govIdFrontUrl", "panFrontUrl"]);
        expect(coverage.missing).toEqual(["selfieUrl"]);
    });

    it("names a ladder entry the library does not hold", () => {
        const coverage = ladderCoverage(template(), "PUBLISHER", "ORGANISATION", { ...required } as never);
        expect(coverage.unknownSteps).toEqual(["missing-step"]);
        expect(coverage.missing).toEqual(["panFrontUrl", "selfieUrl"]);
    });
});

describe("where a refusal lands on the ladder board", () => {
    const template = (): OnboardingTemplate => ({
        steps: {
            "gov-id": { key: "gov-id", kind: "capture", title: "Government id", subtitle: "", cta: "Continue", documents: [] },
            welcome: { key: "welcome", kind: "info", title: "Welcome", subtitle: "", cta: "Start", body: "" },
        } as unknown as OnboardingTemplate["steps"],
        ladders: { PUBLISHER: { INDIVIDUAL: ["welcome", "gov-id"] } } as unknown as OnboardingTemplate["ladders"],
    });

    it("names the ladder and the rung's step, or the library step", () => {
        expect(resolveLadderIssue(template(), ["ladders", "PUBLISHER", "INDIVIDUAL", "1"])).toEqual({ party: "PUBLISHER", accountType: "INDIVIDUAL", stepKey: "gov-id", prop: null });
        expect(resolveLadderIssue(template(), ["ladders", "PUBLISHER", "INDIVIDUAL"])).toEqual({ party: "PUBLISHER", accountType: "INDIVIDUAL", stepKey: null, prop: null });
        expect(resolveLadderIssue(template(), ["steps", "gov-id", "documents"])).toEqual({ party: null, accountType: null, stepKey: "gov-id", prop: "documents" });
    });

    it("is null for a library step that is not there, or a path naming neither", () => {
        expect(resolveLadderIssue(template(), ["steps", "gone"])).toBeNull();
        expect(resolveLadderIssue(template(), ["label"])).toBeNull();
        expect(resolveLadderIssue(template(), undefined)).toBeNull();
    });
});
