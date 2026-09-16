import { beforeEach, describe, expect, it, vi } from "vitest";

const { calls, answers } = vi.hoisted(() => ({
    calls: [] as string[],
    answers: new Map<string, unknown>(),
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        api: {
            get: async (path: string) => {
                calls.push(path);
                const answer = answers.get(path);
                if (answer instanceof Error) throw answer;
                if (answer === undefined) throw new Error(`No answer scripted for ${path}`);
                return answer;
            },
            post: async () => ({}),
            patch: async () => ({}),
            put: async () => ({}),
            delete: async () => ({}),
        },
    };
});
vi.mock("@/lib/api-config", () => ({
    isLive: () => true,
    apiConfig: { live: true, baseUrl: "" },
}));

import {
    EMPLOYEES_PAGE_SIZE,
    buildEmployeesQuery,
    buildPeopleQuery,
    buildWorkloadQuery,
    documentRows,
    employeePatch,
    employeesService,
    hrmsProviderLabel,
    holidayKindMeta,
    holidayKindOf,
    holidayRegionMeta,
    pageCountOf,
    personDetail,
    shapeEmployeeDetail,
    shapeEmployeeRow,
    shapeEmployeesPage,
    shapeWorkloadSeries,
    splitHolidays,
    weekdayOf,
    workloadBandLabel,
    workloadBucketLabel,
    type EmployeeEditDraft,
    type WireEmployee,
    type WireEmployeeDetail,
    type WireEmployeesPage,
    type WireWorkloadBucket,
} from "./employees";

/**
 * Employees — package CE3 over Lot E's `employees` and `hr` modules.
 *
 * What this file pins is the shaping and the query, not a layout:
 *
 * 1. The document mask. A caller without `hr.documents.view` gets the URLs
 *    nulled and `documentsOnFile` naming what is there; the profile must
 *    still draw "on file" against "missing" for everybody, and must never
 *    hand out a URL the server did not send.
 *
 * 2. Lot G (Q122/Q140): a row linked to a `Department` record prints the
 *    record's name and carries its id; the work fields ride the row and
 *    are null, never "", when unset.
 *
 * 3. The edit patch sends only what moved, and a blank HR-tool id,
 *    department, region, work mode or employment type is an unlink or a
 *    clear (null), not a blank string the schema would refuse.
 *
 * 4. The query goes to the API in the shape `listEmployeesQuerySchema`
 *    parses: a page is always asked for, a facet not set is not sent.
 *
 * 5. E10-1: with a page asked for, the answer is the list contract, and
 *    `total` on the payload is what says how big the result is — the
 *    directory pages through it, and the overview's read asks for
 *    exactly the pages `total` names rather than following until short.
 *
 * 6. Lot G (Q120): the workload chart draws `buckets[].share` as whole
 *    percentages that add to 100 for a bucket with anyone in it and to
 *    nothing for an empty one — an empty month is drawn empty, never as
 *    "100% low". Lot G (Q123): a holiday's Type is its `kind`, and a row
 *    from a server without one reads Public, which is what the seed wrote.
 */

const wire = (over: Partial<WireEmployee> = {}): WireEmployee => ({
    id: "cld_emp_1",
    userId: "cld_user_1",
    displayId: "EMP-1209-2601",
    externalHrmsId: null,
    department: "Operations",
    designation: "Ops Executive",
    isActive: true,
    createdAt: "2026-09-01T09:00:00.000Z",
    updatedAt: "2026-09-01T09:00:00.000Z",
    user: { id: "cld_user_1", name: "Asha Rao", mobile: "+919800000000", email: "asha@adx.co" },
    ...over,
});

describe("shapeEmployeeRow", () => {
    it("keys the row by both ids and names the person from the user slice", () => {
        const row = shapeEmployeeRow(wire());
        expect(row.id).toBe("cld_emp_1");
        expect(row.userId).toBe("cld_user_1");
        expect(row.name).toBe("Asha Rao");
        expect(row.status).toBe("active");
    });

    it("falls back to the email's local part, then the mobile, for a nameless user", () => {
        expect(shapeEmployeeRow(wire({ user: { id: "u", name: null, mobile: "+91", email: "kabir.m@adx.co" } })).name).toBe("kabir.m");
        expect(shapeEmployeeRow(wire({ user: { id: "u", name: "  ", mobile: "+919900011122", email: null } })).name).toBe("+919900011122");
        expect(shapeEmployeeRow(wire({ isActive: false })).status).toBe("inactive");
    });
});

describe("documentRows — the mask", () => {
    const detail = (over: Partial<WireEmployeeDetail> = {}): WireEmployeeDetail => ({
        ...wire(),
        hrmsLink: null,
        ...over,
    });

    it("draws presence from documentsOnFile when masked, and never a URL", () => {
        const rows = documentRows(
            detail({
                documentsMasked: true,
                documentsOnFile: ["ndaAgreementUrl", "salarySlipUrls"],
                ndaAgreementUrl: null,
                salarySlipUrls: [],
            }),
        );
        const nda = rows.find((row) => row.key === "ndaAgreementUrl")!;
        const slips = rows.find((row) => row.key === "salarySlipUrls")!;
        const photo = rows.find((row) => row.key === "passportPhotoUrl")!;
        expect(nda.onFile).toBe(true);
        expect(nda.urls).toEqual([]);
        expect(slips.onFile).toBe(true);
        expect(slips.urls).toEqual([]);
        expect(photo.onFile).toBe(false);
    });

    it("draws presence from the URLs themselves when the viewer may open them", () => {
        const rows = documentRows(
            detail({
                ndaAgreementUrl: "https://files.adx.co/api/v1/files/abc",
                salarySlipUrls: ["https://x/1.pdf", "https://x/2.pdf"],
            }),
        );
        expect(rows.find((row) => row.key === "ndaAgreementUrl")!.urls).toEqual(["https://files.adx.co/api/v1/files/abc"]);
        expect(rows.find((row) => row.key === "salarySlipUrls")!).toMatchObject({ onFile: true, urls: ["https://x/1.pdf", "https://x/2.pdf"] });
        expect(rows.find((row) => row.key === "esiFormUrl")!.onFile).toBe(false);
    });

    it("lists every slot the record has, eighteen in all, and keeps the deep link", () => {
        const shaped = shapeEmployeeDetail(detail({ hrmsLink: "https://people.zoho.in/adx/employees/Z1", externalHrmsId: "Z1" }));
        expect(shaped.documents).toHaveLength(18);
        expect(shaped.hrmsLink).toBe("https://people.zoho.in/adx/employees/Z1");
        expect(shaped.documentsMasked).toBe(false);
    });
});

describe("the department record and the work fields — Lot G", () => {
    it("prints the record's name and carries its id when the row is linked", () => {
        const row = shapeEmployeeRow(
            wire({ department: "ops", departmentId: "dep_1", departmentRecord: { id: "dep_1", name: "Operations", code: "OPS" }, region: "Delhi NCR", workMode: "HYBRID", employmentType: "FULL_TIME" }),
        );
        expect(row.department).toBe("Operations");
        expect(row.departmentId).toBe("dep_1");
        expect(row.region).toBe("Delhi NCR");
        expect(row.workMode).toBe("HYBRID");
        expect(row.employmentType).toBe("FULL_TIME");
    });

    it("keeps the free string and nulls the work fields for a row from a server one release behind", () => {
        const row = shapeEmployeeRow(wire({ department: "Operations" }));
        expect(row.department).toBe("Operations");
        expect(row.departmentId).toBeNull();
        expect(row.region).toBeNull();
        expect(row.workMode).toBeNull();
        expect(row.employmentType).toBeNull();
    });
});

describe("employeePatch", () => {
    const current = { departmentId: "dep_1", designation: "Ops Executive", region: "Delhi NCR", workMode: "OFFICE" as const, employmentType: "FULL_TIME" as const, isActive: true, externalHrmsId: null };
    const typed = (over: Partial<EmployeeEditDraft> = {}): EmployeeEditDraft => ({
        departmentId: "dep_1",
        designation: "Ops Executive",
        region: "Delhi NCR",
        workMode: "OFFICE",
        employmentType: "FULL_TIME",
        isActive: true,
        externalHrmsId: "",
        ...over,
    });

    it("is null when nothing moved — the server would refuse an empty body", () => {
        expect(employeePatch(current, typed())).toBeNull();
    });

    it("sends only what moved, trimmed", () => {
        expect(employeePatch(current, typed({ departmentId: "dep_2", region: " Karnataka ", isActive: false }))).toEqual({
            departmentId: "dep_2",
            region: "Karnataka",
            isActive: false,
        });
    });

    it("links and unlinks the HR tool with a string or null, never a blank", () => {
        expect(employeePatch(current, typed({ externalHrmsId: " Z1 " }))).toEqual({ externalHrmsId: "Z1" });
        expect(employeePatch({ ...current, externalHrmsId: "Z1" }, typed({ externalHrmsId: "" }))).toEqual({ externalHrmsId: null });
    });

    it("clears a department, region, work mode or employment type with null rather than a blank", () => {
        expect(employeePatch(current, typed({ departmentId: "", region: "", workMode: "", employmentType: "" }))).toEqual({
            departmentId: null,
            region: null,
            workMode: null,
            employmentType: null,
        });
    });

    it("leaves a blanked designation alone rather than sending an empty string", () => {
        expect(employeePatch(current, typed({ designation: "" }))).toBeNull();
    });
});

describe("the queries", () => {
    it("always asks for a page and sends only the facets that were set", () => {
        expect(buildEmployeesQuery()).toBe("page=1&pageSize=100");
        expect(buildEmployeesQuery({ q: " asha ", department: "Design", active: false, page: 2, pageSize: 20 })).toBe(
            "q=asha&department=Design&active=false&page=2&pageSize=20",
        );
    });

    it("sends the registry's two facets and nothing when none is set", () => {
        expect(buildPeopleQuery()).toBe("");
        expect(buildPeopleQuery({ q: "rao", kind: "AGENT" })).toBe("q=rao&kind=AGENT");
    });

    it("asks the registry for the people who have left only when the switch is on", () => {
        expect(buildPeopleQuery({ includeInactive: true })).toBe("includeInactive=true");
        expect(buildPeopleQuery({ kind: "STAFF", includeInactive: false })).toBe("kind=STAFF");
    });
});

describe("the list contract — E10-1", () => {
    const page = (over: Partial<WireEmployeesPage> = {}): WireEmployeesPage => ({
        items: [wire()],
        total: 1,
        page: 1,
        pageSize: 100,
        counts: { ACTIVE: 1, INACTIVE: 0 },
        ...over,
    });

    beforeEach(() => {
        calls.length = 0;
        answers.clear();
    });

    it("shapes the page whole: rows, the total, the page pair and the chips' counts", () => {
        const shaped = shapeEmployeesPage(page({ total: 240, page: 3, pageSize: 25, counts: { ACTIVE: 200, INACTIVE: 40 } }));
        expect(shaped.rows.map((row) => row.name)).toEqual(["Asha Rao"]);
        expect(shaped).toMatchObject({ total: 240, page: 3, pageSize: 25, counts: { ACTIVE: 200, INACTIVE: 40 } });
    });

    it("counts the pages from the total, never fewer than one", () => {
        expect(pageCountOf(0, 25)).toBe(1);
        expect(pageCountOf(25, 25)).toBe(1);
        expect(pageCountOf(26, 25)).toBe(2);
        expect(pageCountOf(240, 25)).toBe(10);
    });

    it("reads one page with every facet on the wire and takes the total from the payload", async () => {
        answers.set("/employees?q=asha&department=Design&active=true&page=2&pageSize=25", page({ total: 41, page: 2, pageSize: 25 }));
        const result = await employeesService.page({ q: "asha", department: "Design", active: true, page: 2, pageSize: 25 });
        expect(result.total).toBe(41);
        expect(result.rows).toHaveLength(1);
        expect(calls).toEqual(["/employees?q=asha&department=Design&active=true&page=2&pageSize=25"]);
    });

    it("lists everything by asking for exactly the pages the total names, not until one comes back short", async () => {
        const rows = (from: number, count: number) =>
            Array.from({ length: count }, (_, index) => wire({ id: `emp_${from + index}`, userId: `usr_${from + index}` }));
        answers.set(`/employees?page=1&pageSize=${EMPLOYEES_PAGE_SIZE}`, page({ items: rows(0, EMPLOYEES_PAGE_SIZE), total: 230 }));
        answers.set(`/employees?page=2&pageSize=${EMPLOYEES_PAGE_SIZE}`, page({ items: rows(100, EMPLOYEES_PAGE_SIZE), total: 230 }));
        answers.set(`/employees?page=3&pageSize=${EMPLOYEES_PAGE_SIZE}`, page({ items: rows(200, 30), total: 230 }));
        const all = await employeesService.listAll();
        expect(all).toHaveLength(230);
        expect(all[0].userId).toBe("usr_0");
        expect(all[229].userId).toBe("usr_229");
        expect(calls).toEqual([
            `/employees?page=1&pageSize=${EMPLOYEES_PAGE_SIZE}`,
            `/employees?page=2&pageSize=${EMPLOYEES_PAGE_SIZE}`,
            `/employees?page=3&pageSize=${EMPLOYEES_PAGE_SIZE}`,
        ]);
    });

    it("stops after the first page when the total fits in it — a full page is not a reason to ask again", async () => {
        const full = Array.from({ length: EMPLOYEES_PAGE_SIZE }, (_, index) => wire({ id: `emp_${index}`, userId: `usr_${index}` }));
        answers.set(`/employees?page=1&pageSize=${EMPLOYEES_PAGE_SIZE}`, page({ items: full, total: EMPLOYEES_PAGE_SIZE }));
        const all = await employeesService.listAll();
        expect(all).toHaveLength(EMPLOYEES_PAGE_SIZE);
        expect(calls).toHaveLength(1);
    });
});

describe("the HR tool and the registry", () => {
    it("names the provider, and nothing when it is off or unknown", () => {
        expect(hrmsProviderLabel("ZOHO_PEOPLE")).toBe("Zoho People");
        expect(hrmsProviderLabel("GREYTHR")).toBe("greytHR");
        expect(hrmsProviderLabel("NONE")).toBeNull();
        expect(hrmsProviderLabel(undefined)).toBeNull();
    });

    it("describes a person by what their kind carries", () => {
        expect(personDetail({ userId: "u", name: "A", kind: "STAFF", designation: "Ops Executive", department: "Operations", active: true })).toBe("Ops Executive · Operations");
        expect(personDetail({ userId: "u", name: "A", kind: "STAFF", designation: null, department: null, active: false })).toBeNull();
        expect(personDetail({ userId: "u", name: "A", kind: "AGENT", tier: "GOLD II", agentProfileId: "ap", active: true })).toBe("GOLD II");
    });
});

describe("holidays", () => {
    const holidays = [
        { id: "h2", date: "2026-10-02", name: "Gandhi Jayanti", region: null },
        { id: "h1", date: "2026-01-26", name: "Republic Day", region: null },
        { id: "h3", date: "2026-09-13", name: "Onam", region: "Kerala" },
    ];

    it("cuts the year at today, today included in what is to come, in date order", () => {
        const { upcoming, past } = splitHolidays(holidays, "2026-09-13");
        expect(upcoming.map((row) => row.id)).toEqual(["h3", "h2"]);
        expect(past.map((row) => row.id)).toEqual(["h1"]);
    });

    it("names the weekday from the calendar day alone and badges the region", () => {
        expect(weekdayOf("2026-01-26")).toBe("Monday");
        expect(holidayRegionMeta({ region: null })).toEqual({ label: "National", tone: "success" });
        expect(holidayRegionMeta({ region: "Kerala" })).toEqual({ label: "Kerala", tone: "neutral" });
    });

    it("prints the Type from kind, and Public for a row without one — what the seed wrote", () => {
        expect(holidayKindOf({ kind: "OPTIONAL" })).toBe("OPTIONAL");
        expect(holidayKindOf({ kind: "PUBLIC" })).toBe("PUBLIC");
        expect(holidayKindOf({})).toBe("PUBLIC");
        expect(holidayKindMeta({ kind: "OPTIONAL" })).toEqual({ label: "Optional", tone: "neutral" });
    });

    it("sends the kind on a create only when one was picked", async () => {
        const posts: unknown[] = [];
        const { api } = await import("@/lib/api-client");
        const original = api.post;
        (api as { post: unknown }).post = async (_path: string, body: unknown) => {
            posts.push(body);
            return { id: "h1", date: "2026-10-17", name: "Maha Saptami", region: null, kind: "OPTIONAL" };
        };
        try {
            await employeesService.createHoliday({ date: "2026-10-17", name: " Maha Saptami ", kind: "OPTIONAL" });
            await employeesService.createHoliday({ date: "2026-08-15", name: "Independence Day" });
        } finally {
            (api as { post: unknown }).post = original;
        }
        expect(posts).toEqual([
            { date: "2026-10-17", name: "Maha Saptami", kind: "OPTIONAL" },
            { date: "2026-08-15", name: "Independence Day" },
        ]);
    });
});

describe("the workload measure — Lot G (Q120)", () => {
    const bucket = (over: Partial<WireWorkloadBucket> = {}): WireWorkloadBucket => ({
        start: "2026-04-01",
        end: "2026-05-01",
        days: 30,
        staff: 3,
        counts: { LOW: 1, MEDIUM: 1, HIGH: 1 },
        share: { LOW: 0.333, MEDIUM: 0.333, HIGH: 0.333 },
        ...over,
    });

    it("sends only the facets that were set — the defaults are the server's", () => {
        expect(buildWorkloadQuery()).toBe("");
        expect(buildWorkloadQuery({ granularity: "month" })).toBe("granularity=month");
        expect(buildWorkloadQuery({ from: "2026-01-01", to: "2026-06-30", granularity: "week" })).toBe("from=2026-01-01&to=2026-06-30&granularity=week");
    });

    it("draws the shares as whole percentages that add to 100 for a bucket with anyone in it", () => {
        const [point] = shapeWorkloadSeries({ granularity: "month", buckets: [bucket()] });
        expect(point.low + point.medium + point.high).toBe(100);
        expect(point.label).toBe("Apr");
        expect(point.staff).toBe(3);
        expect(point.counts).toEqual({ LOW: 1, MEDIUM: 1, HIGH: 1 });
    });

    it("draws an empty bucket empty, never as 100% low", () => {
        const [point] = shapeWorkloadSeries({ granularity: "month", buckets: [bucket({ staff: 0, counts: { LOW: 0, MEDIUM: 0, HIGH: 0 }, share: { LOW: 0, MEDIUM: 0, HIGH: 0 } })] });
        expect(point).toMatchObject({ low: 0, medium: 0, high: 0, staff: 0 });
    });

    it("labels a week by its Monday and a month by its name, from the calendar day alone", () => {
        expect(workloadBucketLabel("2026-07-06", "week")).toBe("6 Jul");
        expect(workloadBucketLabel("2026-01-01", "month")).toBe("Jan");
    });

    it("reads the legend off the thresholds the settings row holds", () => {
        const thresholds = { medium: 10, high: 25 };
        expect(workloadBandLabel("LOW", thresholds)).toBe("below 10 items a week");
        expect(workloadBandLabel("MEDIUM", thresholds)).toBe("10 to 25");
        expect(workloadBandLabel("HIGH", thresholds)).toBe("25 and above");
    });

    it("asks the API for the measure by month when the overview does", async () => {
        calls.length = 0;
        answers.set("/employees/workload?granularity=month", { from: "2026-04-01", to: "2026-09-13", granularity: "month", thresholds: { medium: 10, high: 25 }, weights: {}, buckets: [], employees: [] });
        const report = await employeesService.workload({ granularity: "month" });
        expect(calls).toEqual(["/employees/workload?granularity=month"]);
        expect(report.thresholds).toEqual({ medium: 10, high: 25 });
    });

    it("G13-B: reads the overview's headcount and open positions from /employees/overview, and sends REGION as a sort", async () => {
        calls.length = 0;
        answers.set("/employees/overview", { headcount: { total: 26, active: 24, inactive: 2 }, openPositions: 7 });
        const overview = await employeesService.overview();
        expect(calls).toEqual(["/employees/overview"]);
        expect(overview.openPositions).toBe(7);
        expect(buildEmployeesQuery({ sort: "REGION", dir: "asc", pageSize: 25 })).toBe("sort=REGION&dir=asc&page=1&pageSize=25");
    });
});
