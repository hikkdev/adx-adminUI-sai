import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Q-C item 8 — the employee KYC desk reads the HR roster as a page.
 *
 * Q-B made `GET /employees` answer the list contract whenever `?page` OR
 * `?pageSize` is present. The desk used to send `pageSize=100` alone and
 * `.map` the answer as an array; against the explicit contract that is
 * `.map` on an object. What is pinned: the read sends `page=1&pageSize=100`
 * (and `q` when searching), reads `.items`, and an empty page is no rows.
 */

const { calls, answers } = vi.hoisted(() => ({
    calls: [] as string[],
    answers: new Map<string, unknown>(),
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        api: {
            ...actual.api,
            get: async (path: string) => {
                calls.push(path);
                const answer = answers.get(path);
                if (answer === undefined) throw new Error(`No answer scripted for ${path}`);
                return answer;
            },
        },
    };
});
vi.mock("@/lib/api-config", () => ({
    isLive: () => true,
    apiConfig: { live: true, baseUrl: "" },
}));

import { EMPLOYEE_ROSTER_PAGE_SIZE, employeeKycService } from "./employee-kyc";

const row = {
    id: "emp_1",
    userId: "usr_1",
    displayId: "EMP-1209-2601",
    department: "Ops",
    designation: "Analyst",
    isActive: true,
    user: { id: "usr_1", name: "Asha Rao", mobile: "9800000001", email: null },
};

beforeEach(() => {
    calls.length = 0;
    answers.clear();
});

describe("employeeKycService.employees", () => {
    it("asks for page 1 of the server's largest page and reads the items off the list contract", async () => {
        answers.set(`/employees?page=1&pageSize=${EMPLOYEE_ROSTER_PAGE_SIZE}`, {
            items: [row],
            total: 1,
            page: 1,
            pageSize: EMPLOYEE_ROSTER_PAGE_SIZE,
            counts: { ACTIVE: 1, INACTIVE: 0 },
        });
        const rows = await employeeKycService.employees();
        expect(calls).toEqual([`/employees?page=1&pageSize=${EMPLOYEE_ROSTER_PAGE_SIZE}`]);
        expect(rows).toEqual([
            expect.objectContaining({ id: "emp_1", userId: "usr_1", name: "Asha Rao", mobile: "9800000001", isActive: true }),
        ]);
    });

    it("carries the search into ?q= and still reads a page", async () => {
        answers.set(`/employees?page=1&pageSize=${EMPLOYEE_ROSTER_PAGE_SIZE}&q=asha`, { items: [row], total: 1, page: 1, pageSize: 100, counts: {} });
        const rows = await employeeKycService.employees("  asha ");
        expect(calls[0]).toBe(`/employees?page=1&pageSize=${EMPLOYEE_ROSTER_PAGE_SIZE}&q=asha`);
        expect(rows).toHaveLength(1);
    });

    it("an empty page is no rows, and one employee off the roster is found by HR id", async () => {
        answers.set(`/employees?page=1&pageSize=${EMPLOYEE_ROSTER_PAGE_SIZE}`, { items: [], total: 0, page: 1, pageSize: 100, counts: {} });
        expect(await employeeKycService.employees()).toEqual([]);
        expect(await employeeKycService.employee("emp_1")).toBeNull();
    });
});
