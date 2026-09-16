import { beforeEach, describe, expect, it, vi } from "vitest";

const { calls, answers } = vi.hoisted(() => ({
    calls: [] as { method: string; path: string; body?: unknown }[],
    answers: new Map<string, unknown>(),
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (method: string) => async (path: string, body?: unknown) => {
        calls.push({ method, path, body });
        const answer = answers.get(`${method} ${path}`);
        if (answer instanceof Error) throw answer;
        if (answer === undefined) throw new Error(`No answer scripted for ${method} ${path}`);
        return answer;
    };
    return {
        ...actual,
        api: { get: record("GET"), post: record("POST"), patch: record("PATCH"), put: record("PUT"), delete: record("DELETE") },
    };
});
vi.mock("@/lib/api-config", () => ({
    isLive: () => true,
    apiConfig: { live: true, baseUrl: "" },
}));

import { ApiError } from "@/lib/api-client";
import {
    DEPARTMENTS_PAGE_SIZE,
    buildDepartmentsQuery,
    deleteRefusalMessage,
    deleteRefusalOf,
    departmentCreateBody,
    departmentPatch,
    departmentsService,
    headLabel,
    openRolesLabel,
    parseOpenRoles,
    splitRegions,
    toDepartmentDraft,
    type DepartmentView,
} from "./departments";

/**
 * Departments — package CG3 over Lot G's `hr` departments (Q122/Q140).
 *
 * What this file pins:
 *
 * 1. The query goes to the API in the shape `departmentsQuerySchema`
 *    parses — a page is always asked for, a facet not set is not sent —
 *    and the grid's read asks for exactly the pages `total` names.
 *
 * 2. The create body: the code left off when blank so the server derives
 *    it, a blank head or parent absent rather than "", the regions split
 *    and deduplicated, and the draft refused before the wire when the
 *    schema would refuse it.
 *
 * 3. The edit patch sends only what moved, a cleared description, head or
 *    parent as null, and nothing at all when nothing moved — the server
 *    refuses an empty patch.
 *
 * 4. A delete refused for members or children is read off the 409's
 *    `details.reason` and printed as the sentence the dialog shows; any
 *    other error is left to its own message.
 */

const view = (over: Partial<DepartmentView> = {}): DepartmentView => ({
    id: "dep_1",
    name: "Design",
    code: "DESIGN",
    description: "Owns the ADX brand, product design and creative review tooling.",
    headId: "emp_1",
    head: { id: "emp_1", userId: "usr_1", name: "Darlene Robertson", designation: "Design Lead" },
    parentId: null,
    parent: null,
    regions: ["Delhi NCR", "Tamil Nadu", "Rajasthan"],
    openRoles: 1,
    isActive: true,
    memberCount: 4,
    createdAt: "2026-09-01T09:00:00.000Z",
    updatedAt: "2026-09-01T09:00:00.000Z",
    ...over,
});

beforeEach(() => {
    calls.length = 0;
    answers.clear();
});

describe("the query and the reads", () => {
    it("always asks for a page and sends only the facets that were set", () => {
        expect(buildDepartmentsQuery()).toBe(`page=1&pageSize=${DEPARTMENTS_PAGE_SIZE}`);
        expect(buildDepartmentsQuery({ q: " ops ", status: "INACTIVE", sort: "members", page: 2, pageSize: 20 })).toBe(
            "q=ops&status=INACTIVE&sort=members&page=2&pageSize=20",
        );
    });

    it("reads every row by asking for exactly the pages total names", async () => {
        const page = (page: number, items: DepartmentView[]) => ({ items, total: 150, page, pageSize: DEPARTMENTS_PAGE_SIZE, counts: { ACTIVE: 150, INACTIVE: 0 } });
        answers.set(`GET /hr/departments?page=1&pageSize=${DEPARTMENTS_PAGE_SIZE}`, page(1, [view({ id: "a" })]));
        answers.set(`GET /hr/departments?page=2&pageSize=${DEPARTMENTS_PAGE_SIZE}`, page(2, [view({ id: "b" })]));
        const rows = await departmentsService.listAll();
        expect(rows.map((row) => row.id)).toEqual(["a", "b"]);
        expect(calls.map((call) => call.path)).toEqual([
            `/hr/departments?page=1&pageSize=${DEPARTMENTS_PAGE_SIZE}`,
            `/hr/departments?page=2&pageSize=${DEPARTMENTS_PAGE_SIZE}`,
        ]);
    });

    it("reads one department by id and encodes the segment", async () => {
        answers.set("GET /hr/departments/dep%201", { ...view({ id: "dep 1" }), children: [], members: [] });
        const detail = await departmentsService.get("dep 1");
        expect(detail.members).toEqual([]);
        expect(calls[0].path).toBe("/hr/departments/dep%201");
    });
});

describe("the create body", () => {
    it("leaves the code off when blank so the server derives it, and a blank head or parent absent", () => {
        const parsed = departmentCreateBody({ ...toDepartmentDraft(null), name: " Field operations ", regions: "Delhi NCR, delhi ncr,\nKarnataka", openRoles: "2" });
        expect(parsed.body).toEqual({ name: "Field operations", regions: ["Delhi NCR", "Karnataka"], openRoles: 2, isActive: true });
    });

    it("upper-cases a typed code and refuses one the schema would", () => {
        expect(departmentCreateBody({ ...toDepartmentDraft(null), name: "Ops", code: "field-ops" }).body).toMatchObject({ code: "FIELD-OPS" });
        expect(departmentCreateBody({ ...toDepartmentDraft(null), name: "Ops", code: "field ops" }).problem).toMatch(/upper-case/);
        expect(departmentCreateBody({ ...toDepartmentDraft(null), name: "O" }).problem).toMatch(/two characters/);
        expect(departmentCreateBody({ ...toDepartmentDraft(null), name: "Ops", openRoles: "-1" }).problem).toMatch(/whole number/);
    });

    it("splits regions on commas and newlines, trimmed and deduplicated case-insensitively", () => {
        expect(splitRegions(" Delhi NCR ,\n Karnataka,, karnataka ")).toEqual(["Delhi NCR", "Karnataka"]);
        expect(parseOpenRoles(" 12 ")).toBe(12);
        expect(parseOpenRoles("12.5")).toBeNull();
        expect(parseOpenRoles("")).toBeNull();
    });

    it("posts the body to /hr/departments", async () => {
        answers.set("POST /hr/departments", view());
        await departmentsService.create({ name: "Design", regions: [], openRoles: 0, isActive: true });
        expect(calls[0]).toEqual({ method: "POST", path: "/hr/departments", body: { name: "Design", regions: [], openRoles: 0, isActive: true } });
    });
});

describe("the edit patch", () => {
    it("is null when nothing moved — the server refuses an empty patch", () => {
        expect(departmentPatch(view(), toDepartmentDraft(view()))).toBeNull();
    });

    it("sends only what moved, and clears a description, head or parent with null", () => {
        const draft = { ...toDepartmentDraft(view()), description: "", headId: "", openRoles: "3", regions: "Delhi NCR" };
        expect(departmentPatch(view(), draft)).toEqual({ description: null, headId: null, regions: ["Delhi NCR"], openRoles: 3 });
    });

    it("hands back the problem rather than a patch when the draft cannot be sent", () => {
        expect(departmentPatch(view(), { ...toDepartmentDraft(view()), name: "" })).toMatch(/Name the department/);
    });

    it("patches by id", async () => {
        answers.set("PATCH /hr/departments/dep_1", view({ openRoles: 3 }));
        await departmentsService.update("dep_1", { openRoles: 3 });
        expect(calls[0]).toEqual({ method: "PATCH", path: "/hr/departments/dep_1", body: { openRoles: 3 } });
    });
});

describe("a refused delete", () => {
    it("reads the members or the children off the 409's details", () => {
        const members = deleteRefusalOf(new ApiError(409, "CONFLICT", "4 people are still in this department; move them first", { reason: "DEPARTMENT_HAS_MEMBERS", members: 4 }));
        expect(members).toEqual({ reason: "DEPARTMENT_HAS_MEMBERS", members: 4 });
        expect(deleteRefusalMessage(members!, { name: "Design" })).toBe("4 people are still in Design. Move them to another department first.");

        const children = deleteRefusalOf(new ApiError(409, "CONFLICT", "Departments still sit under this one", { reason: "DEPARTMENT_HAS_CHILDREN", children: ["dep_2"] }));
        expect(children).toEqual({ reason: "DEPARTMENT_HAS_CHILDREN", children: ["dep_2"] });
        expect(deleteRefusalMessage(children!, { name: "Design" })).toBe("1 department sits under Design. Move or delete them first.");
    });

    it("is null for any other error, so the caller prints its own message", () => {
        expect(deleteRefusalOf(new ApiError(404, "NOT_FOUND", "Department not found"))).toBeNull();
        expect(deleteRefusalOf(new ApiError(409, "CONFLICT", "A department with that name already exists"))).toBeNull();
        expect(deleteRefusalOf(new Error("offline"))).toBeNull();
    });

    it("deletes by id", async () => {
        answers.set("DELETE /hr/departments/dep_1", { message: "Department deleted" });
        await departmentsService.remove("dep_1");
        expect(calls[0]).toMatchObject({ method: "DELETE", path: "/hr/departments/dep_1" });
    });
});

describe("what the cards print", () => {
    it("names the head, then falls back to their designation, then nothing", () => {
        expect(headLabel(view())).toBe("Darlene Robertson");
        expect(headLabel(view({ head: { id: "e", userId: "u", name: null, designation: "Design Lead" } }))).toBe("Design Lead");
        expect(headLabel(view({ head: null }))).toBeNull();
    });

    it("prints the open-roles line the frame drew", () => {
        expect(openRolesLabel(0)).toBe("No open roles");
        expect(openRolesLabel(1)).toBe("1 open role");
        expect(openRolesLabel(2)).toBe("2 open roles");
    });
});
