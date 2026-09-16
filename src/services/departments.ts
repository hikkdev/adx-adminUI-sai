import { ApiError, api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import type { EmploymentType, WorkMode } from "@/services/employees";

/**
 * Departments — package CG3 over Lot G's `hr` departments (Q122/Q140).
 *
 * Q122 chose a full `Department` record over the free string on the
 * Employee row: a name and a unique code, an optional head (an Employee
 * row), a parent (a tree), the regions it covers and the number of open
 * roles — a figure ops keep by hand, because hiring stays in the HR tool
 * (Q98). The row is `hr`'s; the people in it are `employees`', read
 * through that module and joined on every read as `memberCount` and, on
 * the detail, `members` with their work fields.
 *
 * The routes sit under `/hr/departments` and the domain key is `employees`,
 * as the holidays' is: a department is only ever shown beside the records
 * it groups. No fixture fallback — with the API off the screens say so.
 */

/* ------------------------------------------------------------------ */
/* The wire                                                            */
/* ------------------------------------------------------------------ */

/** The head's card: an Employee row, keyed both ways like every record. */
export interface DepartmentHead {
    id: string;
    userId: string;
    name: string | null;
    designation: string | null;
}

/** One row of `GET /hr/departments`, and the base of the single read. */
export interface DepartmentView {
    id: string;
    name: string;
    /** `OPS`, `FIELD-SOUTH` — derived from the name when none was typed. */
    code: string;
    description: string | null;
    headId: string | null;
    head: DepartmentHead | null;
    parentId: string | null;
    parent: { id: string; name: string; code: string } | null;
    regions: string[];
    openRoles: number;
    isActive: boolean;
    memberCount: number;
    createdAt: string;
    updatedAt: string;
}

/** One member of a department on the detail read: the record with its work fields. */
export interface DepartmentMember {
    id: string;
    userId: string;
    displayId: string | null;
    name: string | null;
    email: string | null;
    designation: string | null;
    region: string | null;
    workMode: WorkMode | null;
    employmentType: EmploymentType | null;
    active: boolean;
    /** G11-1: the Employee row's `createdAt` — "on record since", not the joining date, which the HR tool holds (Q98). Absent on a backend older than the field. */
    joinedAt?: string;
}

/** `GET /hr/departments/:id` — the row, its children with their counts, and the members. */
export interface DepartmentDetail extends DepartmentView {
    children: { id: string; name: string; code: string; isActive: boolean; memberCount: number }[];
    members: DepartmentMember[];
}

/** The list contract: `{ items, total, page, pageSize, counts }`, the chips by the active flag. */
export interface DepartmentsPage {
    items: DepartmentView[];
    total: number;
    page: number;
    pageSize: number;
    counts: Record<string, number>;
}

export type DepartmentStatus = "ACTIVE" | "INACTIVE";
export type DepartmentSort = "name" | "newest" | "members";

export interface DepartmentsQuery {
    q?: string;
    status?: DepartmentStatus;
    sort?: DepartmentSort;
    page?: number;
    pageSize?: number;
}

/** The API's ceiling on a page. */
export const DEPARTMENTS_PAGE_SIZE = 100;

/** `?q=&status=&sort=&page=&pageSize=` exactly as `departmentsQuerySchema` parses it. */
export function buildDepartmentsQuery(query: DepartmentsQuery = {}): string {
    const params = new URLSearchParams();
    if (query.q?.trim()) params.set("q", query.q.trim());
    if (query.status) params.set("status", query.status);
    if (query.sort) params.set("sort", query.sort);
    params.set("page", String(query.page ?? 1));
    params.set("pageSize", String(query.pageSize ?? DEPARTMENTS_PAGE_SIZE));
    return params.toString();
}

/* ------------------------------------------------------------------ */
/* Bodies                                                              */
/* ------------------------------------------------------------------ */

/** `POST /hr/departments`. A code left off is derived from the name server-side. */
export interface CreateDepartmentInput {
    name: string;
    code?: string;
    description?: string | null;
    headId?: string | null;
    parentId?: string | null;
    regions?: string[];
    openRoles?: number;
    isActive?: boolean;
}

/** `PATCH /hr/departments/:id` — any of the create fields; an empty patch is 400. */
export type UpdateDepartmentInput = Partial<CreateDepartmentInput>;

/** What the dialog holds while somebody types — every field text, the regions one per line. */
export interface DepartmentDraft {
    name: string;
    code: string;
    description: string;
    headId: string;
    parentId: string;
    /** Comma- or newline-separated; split and trimmed on the way out. */
    regions: string;
    openRoles: string;
    isActive: boolean;
}

export function toDepartmentDraft(department: DepartmentView | null): DepartmentDraft {
    return {
        name: department?.name ?? "",
        code: department?.code ?? "",
        description: department?.description ?? "",
        headId: department?.headId ?? "",
        parentId: department?.parentId ?? "",
        regions: department?.regions.join(", ") ?? "",
        openRoles: String(department?.openRoles ?? 0),
        isActive: department?.isActive ?? true,
    };
}

/** "Delhi NCR, Karnataka" or one per line → the distinct trimmed names, in order. */
export function splitRegions(text: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const part of text.split(/[,\n]/)) {
        const region = part.trim();
        if (region && !seen.has(region.toLowerCase())) {
            seen.add(region.toLowerCase());
            out.push(region);
        }
    }
    return out;
}

/** A whole number of open roles, or null for text the schema would refuse. */
export function parseOpenRoles(text: string): number | null {
    if (!/^\d+$/.test(text.trim())) return null;
    const value = Number(text.trim());
    return value <= 10_000 ? value : null;
}

/**
 * The create body from a draft: the name and what was filled. The code is
 * left off when blank so the server derives it; a blank head or parent is
 * simply absent. Null when the draft is not a department yet, with the
 * reason.
 */
export function departmentCreateBody(draft: DepartmentDraft): { body: CreateDepartmentInput; problem: null } | { body: null; problem: string } {
    const name = draft.name.trim();
    if (name.length < 2) return { body: null, problem: "Name the department (at least two characters)." };
    const openRoles = parseOpenRoles(draft.openRoles);
    if (openRoles === null) return { body: null, problem: "Open roles is a whole number." };
    const code = draft.code.trim().toUpperCase();
    if (code && !/^[A-Z0-9][A-Z0-9-]{0,15}$/.test(code)) {
        return { body: null, problem: "A code is 1–16 upper-case letters, digits or hyphens." };
    }
    const description = draft.description.trim();
    return {
        body: {
            name,
            ...(code ? { code } : {}),
            ...(description ? { description } : {}),
            ...(draft.headId ? { headId: draft.headId } : {}),
            ...(draft.parentId ? { parentId: draft.parentId } : {}),
            regions: splitRegions(draft.regions),
            openRoles,
            isActive: draft.isActive,
        },
        problem: null,
    };
}

/**
 * The patch an edit sends: only what moved against the record, a cleared
 * description, head or parent sent as null. Null when nothing moved (the
 * server refuses an empty patch), a string when the draft cannot be sent.
 */
export function departmentPatch(current: DepartmentView, draft: DepartmentDraft): UpdateDepartmentInput | null | string {
    const parsed = departmentCreateBody(draft);
    if (!parsed.body) return parsed.problem;
    const body = parsed.body;
    const patch: UpdateDepartmentInput = {};
    if (body.name !== current.name) patch.name = body.name;
    const code = draft.code.trim().toUpperCase();
    if (code && code !== current.code) patch.code = code;
    const description = body.description ?? null;
    if (description !== current.description) patch.description = description;
    const headId = body.headId ?? null;
    if (headId !== current.headId) patch.headId = headId;
    const parentId = body.parentId ?? null;
    if (parentId !== current.parentId) patch.parentId = parentId;
    const regions = body.regions ?? [];
    if (regions.length !== current.regions.length || regions.some((region, index) => region !== current.regions[index])) {
        patch.regions = regions;
    }
    if (body.openRoles !== current.openRoles) patch.openRoles = body.openRoles;
    if (body.isActive !== current.isActive) patch.isActive = body.isActive;
    return Object.keys(patch).length ? patch : null;
}

/* ------------------------------------------------------------------ */
/* How the screens read a record                                       */
/* ------------------------------------------------------------------ */

/** "Head: Darlene Robertson", or nothing when the seat is empty. */
export function headLabel(department: Pick<DepartmentView, "head">): string | null {
    if (!department.head) return null;
    return department.head.name?.trim() || department.head.designation?.trim() || department.head.userId;
}

/** The frame's footer line: "1 open role", "2 open roles", "No open roles". */
export function openRolesLabel(openRoles: number): string {
    if (openRoles === 0) return "No open roles";
    return `${openRoles} open ${openRoles === 1 ? "role" : "roles"}`;
}

/** "4 members", "1 member". */
export function memberCountLabel(count: number): string {
    return `${count} ${count === 1 ? "member" : "members"}`;
}

/**
 * Why a delete was refused: the members still in it or the departments
 * still under it, from the 409's `details.reason`. Null for any other
 * error, so the caller prints the message it carried.
 */
export type DeleteRefusal =
    | { reason: "DEPARTMENT_HAS_MEMBERS"; members: number }
    | { reason: "DEPARTMENT_HAS_CHILDREN"; children: string[] };

export function deleteRefusalOf(error: unknown): DeleteRefusal | null {
    if (!(error instanceof ApiError) || error.status !== 409) return null;
    const details = error.details as { reason?: unknown; members?: unknown; children?: unknown } | undefined;
    if (details?.reason === "DEPARTMENT_HAS_MEMBERS") {
        return { reason: "DEPARTMENT_HAS_MEMBERS", members: typeof details.members === "number" ? details.members : 0 };
    }
    if (details?.reason === "DEPARTMENT_HAS_CHILDREN") {
        return { reason: "DEPARTMENT_HAS_CHILDREN", children: Array.isArray(details.children) ? (details.children as string[]) : [] };
    }
    return null;
}

/** The sentence the delete dialog prints for a refusal. */
export function deleteRefusalMessage(refusal: DeleteRefusal, department: Pick<DepartmentView, "name">): string {
    if (refusal.reason === "DEPARTMENT_HAS_MEMBERS") {
        return `${refusal.members} ${refusal.members === 1 ? "person is" : "people are"} still in ${department.name}. Move them to another department first.`;
    }
    return `${refusal.children.length} ${refusal.children.length === 1 ? "department sits" : "departments sit"} under ${department.name}. Move or delete them first.`;
}

/** How many pages a result of `total` rows cuts into at `pageSize`; never fewer than one. */
const pageCountOf = (total: number, pageSize: number): number => Math.max(1, Math.ceil(total / pageSize));

/* ------------------------------------------------------------------ */
/* The service                                                         */
/* ------------------------------------------------------------------ */

function live() {
    if (!isLive("employees")) throw new Error("Departments read the API; connect the console to the ADX backend first.");
    return http;
}

export const departmentsService = {
    /** One page on the list contract, member counts and the head on every row. */
    page: (query: DepartmentsQuery = {}): Promise<DepartmentsPage> =>
        live().get<DepartmentsPage>(`/hr/departments?${buildDepartmentsQuery(query)}`),

    /**
     * Every department, for the grid and the pickers: the first page says
     * how big the result is and the rest are asked for together.
     */
    listAll: async (query: Omit<DepartmentsQuery, "page" | "pageSize"> = {}): Promise<DepartmentView[]> => {
        const first = await departmentsService.page({ ...query, page: 1, pageSize: DEPARTMENTS_PAGE_SIZE });
        const pages = pageCountOf(first.total, DEPARTMENTS_PAGE_SIZE);
        if (pages === 1) return first.items;
        const rest = await Promise.all(
            Array.from({ length: pages - 1 }, (_, index) =>
                departmentsService.page({ ...query, page: index + 2, pageSize: DEPARTMENTS_PAGE_SIZE }),
            ),
        );
        return [...first.items, ...rest.flatMap((page) => page.items)];
    },

    /** One department with its head, parent, children and members. 404 for an unknown id. */
    get: (id: string): Promise<DepartmentDetail> => live().get<DepartmentDetail>(`/hr/departments/${encodeURIComponent(id)}`),

    /** 201; 409 when the name or code is taken, 404 for a head that is not an Employee row or a parent that does not exist. */
    create: (input: CreateDepartmentInput): Promise<DepartmentView> => live().post<DepartmentView>("/hr/departments", input),

    /** An empty patch is 400; a parent that is the department itself or anything under it is 400. */
    update: (id: string, patch: UpdateDepartmentInput): Promise<DepartmentView> =>
        live().patch<DepartmentView>(`/hr/departments/${encodeURIComponent(id)}`, patch),

    /** 409 with `details.reason` while people or departments are still in it — `deleteRefusalOf` reads it. */
    remove: (id: string): Promise<{ message: string }> =>
        live().delete<{ message: string }>(`/hr/departments/${encodeURIComponent(id)}`),
};
