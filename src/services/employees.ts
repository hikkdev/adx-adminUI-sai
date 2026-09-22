import { api as http } from "@/lib/api-client";
import type { SigningSlice } from "@/services/print-partners";
import { isLive } from "@/lib/api-config";
import { shapeKycSummary } from "./kyc-state";
import type { KycSummary, WireKycSummary } from "@/types";
import type { HrmsProvider } from "@/services/integrations";
import { usersService, type UserRow } from "@/services/users";
import type { StatusMeta } from "@/types";

/**
 * Employees — package CE3 over Lot E's `employees` and `hr` modules.
 *
 * An employee record hangs off a `User`: department, designation, the
 * active flag, the EMP identifier minted at create, the id in the HR tool,
 * and the document URLs collected during employment onboarding. Everything
 * else about a person — leave, payroll, attendance, hiring — lives in the
 * HR tool (Q98: Zoho People by default), which the console opens by portal
 * link and never syncs. Holidays are the one HR record kept in-house,
 * because the staff diary shades them and the diary is ours.
 *
 * No fixture fallback. The 26 seeded `emp_*` records are gone rather than
 * kept: their ids were never issued by the backend, and two of the fields
 * they carried — a joining date, a CTC — have no column on `Employee`.
 * With the API off the screens say so.
 *
 * Three rules this file keeps:
 *
 * - A record is keyed by `userId` on the wire (`/employees/:userId`), and
 *   the console follows that: the directory links by user id, and the
 *   profile is `/employees/directory/[userId]`. The row's own `id` is what
 *   the KYC desk keys on (`/kyc/employees/[employeeId]`), so both are kept.
 *
 * - The document URLs are masked for a caller without `hr.documents.view`.
 *   The response says so (`documentsMasked`, `documentsOnFile`), and the
 *   shaping here draws "on file" against "missing" from either form; a URL
 *   is only ever present when the server chose to send it.
 *
 * - `hrmsLink` is the server's, built from the integrations template and
 *   the record's `externalHrmsId`. The console never assembles it.
 *
 * Lot G (Q120/Q122/Q123/Q140 — package CG3): a record now points at a
 * `Department` row (`departmentId`, joined as `departmentRecord`; the free
 * string is printed one release more as `department`) and says where and
 * how the person works (`region`, `workMode`, `employmentType`); a holiday
 * carries a `kind`; and `GET /employees/workload` is the measure the
 * overview's chart draws. The department records themselves are
 * `services/departments.ts`.
 */

/* ------------------------------------------------------------------ */
/* Where and how a person works — Lot G (Q122/Q140)                   */
/* ------------------------------------------------------------------ */

export const WORK_MODES = ["OFFICE", "REMOTE", "HYBRID", "FIELD"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const WORK_MODE_META: Record<WorkMode, StatusMeta> = {
    OFFICE: { label: "Office", tone: "info" },
    REMOTE: { label: "Remote", tone: "neutral" },
    HYBRID: { label: "Hybrid", tone: "warning" },
    FIELD: { label: "Field", tone: "success" },
};

export const EMPLOYMENT_TYPE_META: Record<EmploymentType, StatusMeta> = {
    FULL_TIME: { label: "Full time", tone: "success" },
    PART_TIME: { label: "Part time", tone: "info" },
    CONTRACT: { label: "Contract", tone: "warning" },
    INTERN: { label: "Intern", tone: "neutral" },
};

/* ------------------------------------------------------------------ */
/* The wire                                                            */
/* ------------------------------------------------------------------ */

/** The slice of the user record every employee read joins. */
export interface WireEmployeeUser {
    id: string;
    name: string | null;
    mobile: string | null;
    email: string | null;
}

/** The single-URL document columns, in the order the sheet lists them. */
export const EMPLOYEE_DOCUMENT_SLOTS = [
    { key: "passportPhotoUrl", label: "Passport photo" },
    { key: "referenceLetterUrl", label: "Reference letter" },
    { key: "ndaAgreementUrl", label: "NDA" },
    { key: "nonCompeteAgreementUrl", label: "Non-compete agreement" },
    { key: "class10MarksheetUrl", label: "Class 10 marksheet" },
    { key: "class12MarksheetUrl", label: "Class 12 marksheet" },
    { key: "graduationMarksheetUrl", label: "Graduation marksheet" },
    { key: "postGraduationMarksheetUrl", label: "Post-graduation marksheet" },
    { key: "form2NominationUrl", label: "Form 2 (nomination)" },
    { key: "form6aUrl", label: "Form 6A" },
    { key: "esiFormUrl", label: "ESI form" },
    { key: "form2FamilyDeclarationUrl", label: "Form 2 (family declaration)" },
    { key: "form6EmployeeRegistrationUrl", label: "Form 6 (employee registration)" },
    { key: "salaryAccountLetterUrl", label: "Salary account letter" },
] as const;

/** The multi-URL document columns. */
export const EMPLOYEE_DOCUMENT_LIST_SLOTS = [
    { key: "salarySlipUrls", label: "Salary slips" },
    { key: "complianceFormUrls", label: "Compliance forms" },
    { key: "epfFormUrls", label: "EPF forms" },
    { key: "gratuityFormUrls", label: "Gratuity forms" },
] as const;

export type EmployeeDocumentKey = (typeof EMPLOYEE_DOCUMENT_SLOTS)[number]["key"];
export type EmployeeDocumentListKey = (typeof EMPLOYEE_DOCUMENT_LIST_SLOTS)[number]["key"];

/** One row of `GET /employees`, and the base of the single read. */
export type WireEmployee = {
    id: string;
    userId: string;
    /** EMP-1209-2601; null on a row older than the identifier migration. */
    displayId: string | null;
    /** Lot E (Q98): the person's id in the HR tool, or null. */
    externalHrmsId: string | null;
    /** The record's name when linked, the free string otherwise — one release of both. */
    department: string | null;
    /** Lot G (Q122): the `Department` row, when linked. Absent from a server one release behind. */
    departmentId?: string | null;
    departmentRecord?: { id: string; name: string; code: string } | null;
    designation: string | null;
    /** Lot G (Q140): where and how the person works. Absent from a server one release behind. */
    region?: string | null;
    workMode?: WorkMode | null;
    employmentType?: EmploymentType | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    user: WireEmployeeUser;
} & Partial<Record<EmployeeDocumentKey, string | null>> &
    Partial<Record<EmployeeDocumentListKey, string[]>>;

/**
 * `GET /employees?page=` — E10-1: the list contract. `counts` is `ACTIVE` /
 * `INACTIVE` over the filter with the `active` facet removed, so the chips
 * can say how many each would show whichever is in force.
 */
export interface WireEmployeesPage {
    items: WireEmployee[];
    total: number;
    page: number;
    pageSize: number;
    counts: Record<string, number>;
}

/** `GET /employees/:userId`: the row plus the deep link and, when masked, the presence list. */
export interface WireEmployeeDetail extends WireEmployee {
    /** N3-B: the party's KYC state and the record's facts; absent on a server one release behind. */
    kyc?: WireKycSummary | null;
    hrmsLink: string | null;
    documentsMasked?: boolean;
    documentsOnFile?: string[];
    /** DS-2: the appointment letter's standing, when the server has the rail. */
    appointment?: (SigningSlice & { inviteDeferred: boolean }) | null;
}

/* ------------------------------------------------------------------ */
/* How the screens read a record                                       */
/* ------------------------------------------------------------------ */

export type EmployeeStatus = "active" | "inactive";

export const EMPLOYEE_STATUS_META: Record<EmployeeStatus, StatusMeta> = {
    active: { label: "Active", tone: "success" },
    inactive: { label: "Inactive", tone: "neutral" },
};

/**
 * The backend's `User.name` is nullable — an invited account has none until
 * it is filled in — so the local part of the email, then the mobile, stand in.
 */
export function employeeNameOf(user: WireEmployeeUser): string {
    const name = user.name?.trim();
    if (name) return name;
    const local = user.email?.split("@")[0]?.trim();
    if (local) return local;
    return user.mobile ?? "ADX employee";
}

export interface EmployeeRow {
    /** The HR record's own id — what `/kyc/employees/[employeeId]` keys on. */
    id: string;
    /** The user id — what `/employees/:userId` and `/users/[id]` key on. */
    userId: string;
    displayId: string | null;
    externalHrmsId: string | null;
    name: string;
    mobile: string | null;
    email: string | null;
    department: string | null;
    /** Lot G (Q122): the department record's id, or null while the row is unlinked. */
    departmentId: string | null;
    designation: string | null;
    region: string | null;
    workMode: WorkMode | null;
    employmentType: EmploymentType | null;
    isActive: boolean;
    status: EmployeeStatus;
    createdAt: string;
}

/** One page of the directory, shaped. `total` is the size of the whole result under the facets, not the page. */
export interface EmployeesPage {
    rows: EmployeeRow[];
    total: number;
    page: number;
    pageSize: number;
    /** `ACTIVE` and `INACTIVE`, counted with the active facet removed. */
    counts: Record<string, number>;
}

export function shapeEmployeesPage(wire: WireEmployeesPage): EmployeesPage {
    return {
        rows: (wire.items ?? []).map(shapeEmployeeRow),
        total: wire.total,
        page: wire.page,
        pageSize: wire.pageSize,
        counts: wire.counts ?? {},
    };
}

/** How many pages a result of `total` rows cuts into at `pageSize`; never fewer than one. */
export function pageCountOf(total: number, pageSize: number): number {
    return Math.max(1, Math.ceil(total / pageSize));
}

export function shapeEmployeeRow(wire: WireEmployee): EmployeeRow {
    return {
        id: wire.id,
        userId: wire.userId,
        displayId: wire.displayId,
        externalHrmsId: wire.externalHrmsId,
        name: employeeNameOf(wire.user),
        mobile: wire.user.mobile,
        email: wire.user.email,
        department: wire.departmentRecord?.name ?? wire.department,
        departmentId: wire.departmentRecord?.id ?? wire.departmentId ?? null,
        designation: wire.designation,
        region: wire.region ?? null,
        workMode: wire.workMode ?? null,
        employmentType: wire.employmentType ?? null,
        isActive: wire.isActive,
        status: wire.isActive ? "active" : "inactive",
        createdAt: wire.createdAt,
    };
}

export interface EmployeeDetail extends EmployeeRow {
    /** N3-B: the party's KYC state as `GET /employees/:userId` derives it — the queue row's word. */
    kyc: KycSummary;
    hrmsLink: string | null;
    /** DS-2: the appointment letter e-signed through Digio; `inviteDeferred` while a console invitation waits on it. Null on a backend older than the rail. */
    appointment: (SigningSlice & { inviteDeferred: boolean }) | null;
    /** True when the server nulled the URLs because the viewer lacks `hr.documents.view`. */
    documentsMasked: boolean;
    documents: EmployeeDocumentRow[];
}

/** One line of the Documents tab: what it is, whether it is there, and the URLs when the viewer may open them. */
export interface EmployeeDocumentRow {
    key: EmployeeDocumentKey | EmployeeDocumentListKey;
    label: string;
    onFile: boolean;
    /** Empty when nothing is on file, and empty when the server masked it. */
    urls: string[];
}

/**
 * The eighteen document slots, "on file" or "missing".
 *
 * Under the mask the URLs are null and `documentsOnFile` names the fields
 * that do hold one; without it the URLs are present and presence follows
 * them. Either way a row's `urls` is only ever what the server sent.
 */
export function documentRows(detail: WireEmployeeDetail): EmployeeDocumentRow[] {
    const masked = detail.documentsMasked === true;
    const onFileSet = new Set(detail.documentsOnFile ?? []);
    const rows: EmployeeDocumentRow[] = [];
    for (const slot of EMPLOYEE_DOCUMENT_SLOTS) {
        const url = detail[slot.key] ?? null;
        rows.push({
            key: slot.key,
            label: slot.label,
            onFile: masked ? onFileSet.has(slot.key) : Boolean(url),
            urls: url ? [url] : [],
        });
    }
    for (const slot of EMPLOYEE_DOCUMENT_LIST_SLOTS) {
        const urls = detail[slot.key] ?? [];
        rows.push({
            key: slot.key,
            label: slot.label,
            onFile: masked ? onFileSet.has(slot.key) : urls.length > 0,
            urls: [...urls],
        });
    }
    return rows;
}

export function shapeEmployeeDetail(wire: WireEmployeeDetail): EmployeeDetail {
    return {
        ...shapeEmployeeRow(wire),
        // N3-B: employees keep no mirror column; with no `kyc` on the read the employee is awaiting documents.
        kyc: shapeKycSummary(wire.kyc),
        hrmsLink: wire.hrmsLink ?? null,
        appointment: wire.appointment ?? null,
        documentsMasked: wire.documentsMasked === true,
        documents: documentRows(wire),
    };
}

/* ------------------------------------------------------------------ */
/* The workload measure — `GET /employees/workload` (Lot G, Q120/Q139) */
/* ------------------------------------------------------------------ */

export const WORKLOAD_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type WorkloadLevel = (typeof WORKLOAD_LEVELS)[number];

export const WORKLOAD_LEVEL_LABEL: Record<WorkloadLevel, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" };

export type WorkloadGranularity = "week" | "month";

/** One bucket of time on the wire: the share of staff in each band, `counts / staff`, 0–1. */
export interface WireWorkloadBucket {
    /** YYYY-MM-DD, inclusive. */
    start: string;
    /** YYYY-MM-DD, exclusive. */
    end: string;
    days: number;
    staff: number;
    counts: Record<WorkloadLevel, number>;
    share: Record<WorkloadLevel, number>;
}

export interface WireWorkloadEmployee {
    userId: string;
    employeeId: string;
    name: string | null;
    designation: string | null;
    department: string | null;
    open: { kyc: number; tickets: number; fraud: number; total: number };
    buckets: { start: string; actions: Record<string, number> & { total: number }; schedule: number; open: number; load: number; level: WorkloadLevel }[];
}

/** `GET /employees/workload?from&to&granularity` — `buckets[].share` is what the chart draws. */
export interface WorkloadReport {
    from: string;
    to: string;
    granularity: WorkloadGranularity;
    thresholds: { medium: number; high: number };
    weights: { open: { kyc: number; tickets: number; fraud: number }; schedule: number; actions: Record<string, number> };
    buckets: WireWorkloadBucket[];
    employees: WireWorkloadEmployee[];
}

export interface WorkloadQuery {
    from?: string;
    to?: string;
    granularity?: WorkloadGranularity;
}

/** `?from=&to=&granularity=` exactly as `workloadQuerySchema` parses it; the defaults are the server's. */
export function buildWorkloadQuery(query: WorkloadQuery = {}): string {
    const params = new URLSearchParams();
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    if (query.granularity) params.set("granularity", query.granularity);
    return params.toString();
}

/** One bar of the "Workload distribution" chart: the bucket's label and the three shares as whole percentages. */
export interface WorkloadPoint {
    /** The bucket's start, YYYY-MM-DD — what the tooltip names. */
    start: string;
    /** "Jan" for a month, "6 Jul" for a week. */
    label: string;
    staff: number;
    low: number;
    medium: number;
    high: number;
    counts: Record<WorkloadLevel, number>;
}

/** "Jan" / "6 Jul" from the calendar day alone — no zone can move it. */
export function workloadBucketLabel(start: string, granularity: WorkloadGranularity): string {
    const [year, month, day] = start.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return new Intl.DateTimeFormat("en-GB", granularity === "month" ? { month: "short", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

/**
 * The chart's points from the report: one per bucket, the shares as whole
 * percentages that add to 100 for a bucket with anyone in it (the largest
 * band takes the rounding remainder) and to 0 for one with nobody — an
 * empty bucket is drawn empty, never as "100% low".
 */
export function shapeWorkloadSeries(report: Pick<WorkloadReport, "buckets" | "granularity">): WorkloadPoint[] {
    return report.buckets.map((bucket) => {
        const raw = { low: bucket.share.LOW * 100, medium: bucket.share.MEDIUM * 100, high: bucket.share.HIGH * 100 };
        const rounded = { low: Math.round(raw.low), medium: Math.round(raw.medium), high: Math.round(raw.high) };
        if (bucket.staff > 0) {
            const drift = 100 - (rounded.low + rounded.medium + rounded.high);
            if (drift !== 0) {
                const largest = (Object.keys(raw) as (keyof typeof raw)[]).sort((a, b) => raw[b] - raw[a])[0];
                rounded[largest] += drift;
            }
        }
        return { start: bucket.start, label: workloadBucketLabel(bucket.start, report.granularity), staff: bucket.staff, ...rounded, counts: bucket.counts };
    });
}

/** "below 10 items a week", "10 to 25", "25 and above" — the legend's reading of the thresholds. */
export function workloadBandLabel(level: WorkloadLevel, thresholds: WorkloadReport["thresholds"]): string {
    if (level === "LOW") return `below ${thresholds.medium} items a week`;
    if (level === "MEDIUM") return `${thresholds.medium} to ${thresholds.high}`;
    return `${thresholds.high} and above`;
}

/* ------------------------------------------------------------------ */
/* The HR tool                                                         */
/* ------------------------------------------------------------------ */

export const HRMS_PROVIDER_LABEL: Record<HrmsProvider, string | null> = {
    NONE: null,
    ZOHO_PEOPLE: "Zoho People",
    KEKA: "Keka",
    GREYTHR: "greytHR",
};

/** "Zoho People", or null when the tool is switched off or unknown. */
export function hrmsProviderLabel(provider: string | null | undefined): string | null {
    if (!provider) return null;
    return HRMS_PROVIDER_LABEL[provider as HrmsProvider] ?? null;
}

/* ------------------------------------------------------------------ */
/* The people registry — `GET /hr/people`                              */
/* ------------------------------------------------------------------ */

export type PersonKind = "STAFF" | "AGENT";

export const PERSON_KIND_META: Record<PersonKind, StatusMeta> = {
    STAFF: { label: "Staff", tone: "info" },
    AGENT: { label: "Agent", tone: "warning" },
};

export interface StaffPerson {
    userId: string;
    name: string | null;
    kind: "STAFF";
    /** G11-1: the Employee row's id beside the login — what a department's `headId` takes. Absent on a backend older than the field. */
    employeeId?: string;
    designation: string | null;
    department: string | null;
    /** E10-1: false for a record that has left; only listed under `includeInactive`. */
    active: boolean;
}

export interface AgentPerson {
    userId: string;
    name: string | null;
    kind: "AGENT";
    tier: string;
    agentProfileId: string;
    /** E10-1: false for an agent no longer ACTIVE, or whose account cannot sign in. */
    active: boolean;
}

/** One row of the registry: everyone the diary can put a thing against. */
export type Person = StaffPerson | AgentPerson;

export function personLabel(person: Pick<Person, "name" | "userId">): string {
    return person.name?.trim() || person.userId;
}

/** "UI designer · Design" for staff, "Gold II" for an agent, or nothing. */
export function personDetail(person: Person): string | null {
    if (person.kind === "STAFF") {
        const parts = [person.designation, person.department].filter((part): part is string => Boolean(part?.trim()));
        return parts.length ? parts.join(" · ") : null;
    }
    return person.tier || null;
}

export interface PeopleQuery {
    q?: string;
    kind?: PersonKind;
    /** E10-1: the people who have left too, each flagged `active: false`. Off by default. */
    includeInactive?: boolean;
}

export function buildPeopleQuery(query: PeopleQuery = {}): string {
    const params = new URLSearchParams();
    if (query.q?.trim()) params.set("q", query.q.trim());
    if (query.kind) params.set("kind", query.kind);
    if (query.includeInactive) params.set("includeInactive", "true");
    return params.toString();
}

/* ------------------------------------------------------------------ */
/* Holidays — `/hr/holidays`                                           */
/* ------------------------------------------------------------------ */

/** Lot G (Q123): a gazetted day everyone has off, or a restricted one a person may choose. */
export const HOLIDAY_KINDS = ["PUBLIC", "OPTIONAL"] as const;
export type HolidayKind = (typeof HOLIDAY_KINDS)[number];

export const HOLIDAY_KIND_META: Record<HolidayKind, StatusMeta> = {
    PUBLIC: { label: "Public", tone: "success" },
    OPTIONAL: { label: "Optional", tone: "neutral" },
};

export interface Holiday {
    id: string;
    /** YYYY-MM-DD. */
    date: string;
    name: string;
    /** Null is a national day. */
    region: string | null;
    /** Lot G (Q123). Absent from a server one release behind, which the badge reads as Public — what the seed wrote. */
    kind?: HolidayKind;
}

export interface HolidayInput {
    date: string;
    name: string;
    /** Blank or left off is a national day. */
    region?: string;
    /** Defaults to PUBLIC server-side. */
    kind?: HolidayKind;
}

/** `{ date?, name?, region?, kind? }` — `region: null` makes it national. */
export interface HolidayPatch {
    date?: string;
    name?: string;
    region?: string | null;
    kind?: HolidayKind;
}

/** The Type column: Public or Optional, from `kind`; a row without one is what the seed wrote, Public. */
export function holidayKindOf(holiday: Pick<Holiday, "kind">): HolidayKind {
    return holiday.kind === "OPTIONAL" ? "OPTIONAL" : "PUBLIC";
}

export const holidayKindMeta = (holiday: Pick<Holiday, "kind">): StatusMeta => HOLIDAY_KIND_META[holidayKindOf(holiday)];

/** "Wednesday", from the calendar day alone — no zone can move it. */
export function weekdayOf(isoDate: string): string {
    const [year, month, day] = isoDate.split("-").map(Number);
    return new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(
        new Date(Date.UTC(year, month - 1, day)),
    );
}

/** The year's list cut at today: still to come (today included), and already past. */
export function splitHolidays(holidays: Holiday[], todayIso: string): { upcoming: Holiday[]; past: Holiday[] } {
    const sorted = [...holidays].sort((a, b) => a.date.localeCompare(b.date) || (a.region ?? "").localeCompare(b.region ?? ""));
    return {
        upcoming: sorted.filter((holiday) => holiday.date >= todayIso),
        past: sorted.filter((holiday) => holiday.date < todayIso),
    };
}

/** The badge a holiday row draws: national, or the region it belongs to. */
export function holidayRegionMeta(holiday: Pick<Holiday, "region">): StatusMeta {
    return holiday.region ? { label: holiday.region, tone: "neutral" } : { label: "National", tone: "success" };
}

/** Today, in the calendar the server cuts the day by; `en-CA` prints YYYY-MM-DD. */
export function istDateOf(ms: number): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date(ms));
}

/* ------------------------------------------------------------------ */
/* Queries and bodies                                                  */
/* ------------------------------------------------------------------ */

export interface EmployeesQuery {
    q?: string;
    department?: string;
    active?: boolean;
    /** Lot G (Q113): NAME on the person, ROLE on the designation (nulls last), JOINED on `createdAt`. G13-B: REGION too (A to Z, blanks last). */
    sort?: "NAME" | "ROLE" | "JOINED" | "REGION";
    /** Defaults `asc` for the two words and `desc` for the date server-side; sent only when named. */
    dir?: "asc" | "desc";
    page?: number;
    pageSize?: number;
}

/** The API's ceiling on a page. */
export const EMPLOYEES_PAGE_SIZE = 100;

/** `?q=&department=&active=&sort=&dir=&page=&pageSize=` exactly as `listEmployeesQuerySchema` parses it. */
export function buildEmployeesQuery(query: EmployeesQuery = {}): string {
    const params = new URLSearchParams();
    if (query.q?.trim()) params.set("q", query.q.trim());
    if (query.department?.trim()) params.set("department", query.department.trim());
    if (query.active !== undefined) params.set("active", String(query.active));
    if (query.sort) params.set("sort", query.sort);
    if (query.sort && query.dir) params.set("dir", query.dir);
    params.set("page", String(query.page ?? 1));
    params.set("pageSize", String(query.pageSize ?? EMPLOYEES_PAGE_SIZE));
    return params.toString();
}

/** G13-B: `GET /employees/overview` — the headcount and the open positions (Σ `Department.openRoles` over the active departments). */
export interface EmployeesOverview {
    headcount: { total: number; active: number; inactive: number };
    openPositions: number;
}

export type InviteMethod = "PASSWORD" | "GOOGLE";

/** `POST /employees`. The documents go to the HR tool now (Q98), so none are taken here. */
export interface CreateEmployeeInput {
    userId: string;
    /** Lot G (Q122): the `Department` row — 404 when it does not exist. The free string is only for a server one release behind. */
    departmentId?: string;
    department?: string;
    designation?: string;
    region?: string;
    workMode?: WorkMode;
    employmentType?: EmploymentType;
    /** Lot A's console invitation, sent to the address on the user record after the row exists. */
    inviteToConsole?: { roleConfigId?: string; method: InviteMethod };
}

/** `PUT /employees/:userId`. `externalHrmsId: null` unlinks the HR tool; `departmentId: null` unlinks the department. */
export interface UpdateEmployeeInput {
    departmentId?: string | null;
    designation?: string;
    region?: string | null;
    workMode?: WorkMode | null;
    employmentType?: EmploymentType | null;
    isActive?: boolean;
    externalHrmsId?: string | null;
}

/** What the edit dialog holds: the pickers' values, "" for none. */
export interface EmployeeEditDraft {
    departmentId: string;
    designation: string;
    region: string;
    workMode: WorkMode | "";
    employmentType: EmploymentType | "";
    isActive: boolean;
    externalHrmsId: string;
}

/**
 * The patch an edit form sends: only what moved, with a blank HR-tool id,
 * region, work mode, employment type or department sent as null (each
 * unlinks or clears) and a blank designation left alone — the API takes
 * that as an optional string and would refuse an empty one.
 */
export function employeePatch(
    current: Pick<EmployeeRow, "departmentId" | "designation" | "region" | "workMode" | "employmentType" | "isActive" | "externalHrmsId">,
    typed: EmployeeEditDraft,
): UpdateEmployeeInput | null {
    const patch: UpdateEmployeeInput = {};
    if ((typed.departmentId || null) !== (current.departmentId ?? null)) patch.departmentId = typed.departmentId || null;
    const designation = typed.designation.trim();
    if (designation && designation !== (current.designation ?? "")) patch.designation = designation;
    const region = typed.region.trim();
    if ((region || null) !== (current.region ?? null)) patch.region = region || null;
    if ((typed.workMode || null) !== (current.workMode ?? null)) patch.workMode = typed.workMode || null;
    if ((typed.employmentType || null) !== (current.employmentType ?? null)) patch.employmentType = typed.employmentType || null;
    if (typed.isActive !== current.isActive) patch.isActive = typed.isActive;
    const hrmsId = typed.externalHrmsId.trim();
    if ((hrmsId || null) !== (current.externalHrmsId ?? null)) patch.externalHrmsId = hrmsId || null;
    return Object.keys(patch).length ? patch : null;
}

/** The invitation that rode along with a create, when one was asked for. */
export interface CreatedEmployee extends WireEmployee {
    invite?: { id: string; email: string; expiresAt: string };
}

/* ------------------------------------------------------------------ */
/* The service                                                         */
/* ------------------------------------------------------------------ */

/**
 * Refuses to talk to the API while the domain is off. There is nothing to
 * fall back to — the `emp_*` seeds are gone — so a request that would have
 * gone out with a seeded id stops here instead.
 */
function live() {
    if (!isLive("employees")) throw new Error("Employees read the API; connect the console to the ADX backend first.");
    return http;
}

export const employeesService = {
    /**
     * One page on the list contract (E10-1): the query always names a page,
     * so `data` is `{ items, total, page, pageSize, counts }`. The `meta`
     * sibling on the wire is not read; `total` on the payload is the size
     * of the result.
     */
    page: async (query: EmployeesQuery = {}): Promise<EmployeesPage> =>
        shapeEmployeesPage(await live().get<WireEmployeesPage>(`/employees?${buildEmployeesQuery(query)}`)),

    /**
     * Every record, for the departments (grouped over the rows) and the
     * overview's headcount. The first page says how big the result is and
     * the rest are asked for together — nothing is followed until it comes
     * back short. The directory itself pages instead.
     */
    listAll: async (query: Omit<EmployeesQuery, "page" | "pageSize"> = {}): Promise<EmployeeRow[]> => {
        const first = await employeesService.page({ ...query, page: 1, pageSize: EMPLOYEES_PAGE_SIZE });
        const pages = pageCountOf(first.total, EMPLOYEES_PAGE_SIZE);
        if (pages === 1) return first.rows;
        const rest = await Promise.all(
            Array.from({ length: pages - 1 }, (_, index) =>
                employeesService.page({ ...query, page: index + 2, pageSize: EMPLOYEES_PAGE_SIZE }),
            ),
        );
        return [...first.rows, ...rest.flatMap((page) => page.rows)];
    },

    /** G13-B: the overview's tiles — headcount and the open positions across the active departments. */
    overview: (): Promise<EmployeesOverview> => live().get<EmployeesOverview>("/employees/overview"),

    /** One record by user id, with the deep link and the documents as the viewer may see them. */
    get: async (userId: string): Promise<EmployeeDetail> =>
        shapeEmployeeDetail(await live().get<WireEmployeeDetail>(`/employees/${encodeURIComponent(userId)}`)),

    /** 201. 404 for an unknown user, 409 when the user already has a record or has no email to invite. */
    create: (input: CreateEmployeeInput): Promise<CreatedEmployee> => live().post<CreatedEmployee>("/employees", input),

    /** 409 when another record already carries the HR-tool id. */
    update: async (userId: string, patch: UpdateEmployeeInput): Promise<EmployeeRow> =>
        shapeEmployeeRow(await live().put<WireEmployee>(`/employees/${encodeURIComponent(userId)}`, patch)),

    /** Removes the HR record; the user account stays. */
    remove: (userId: string): Promise<{ message: string }> =>
        live().delete<{ message: string }>(`/employees/${encodeURIComponent(userId)}`),

    /** The accounts the create screen can put a record on — `GET /users?q=`. */
    searchUsers: (q: string): Promise<UserRow[]> => usersService.list({ q }),

    /**
     * Lot G (Q120): the workload measure — the share of active staff at
     * low, medium and high load per bucket of time, banded by the
     * thresholds under Settings › People. The defaults are the server's:
     * the last twelve weeks by week, or six months by month.
     */
    workload: (query: WorkloadQuery = {}): Promise<WorkloadReport> => {
        const qs = buildWorkloadQuery(query);
        return live().get<WorkloadReport>(`/employees/workload${qs ? `?${qs}` : ""}`);
    },

    /* ---- the registry ------------------------------------------- */

    /** Active staff and ACTIVE agents, by name; a person who is both appears once, as staff. `includeInactive` (E10-1) lists the people who have left too. */
    people: async (query: PeopleQuery = {}): Promise<Person[]> => {
        const qs = buildPeopleQuery(query);
        return (await live().get<Person[]>(`/hr/people${qs ? `?${qs}` : ""}`)) ?? [];
    },

    /* ---- holidays ---------------------------------------------- */

    holidays: async (year: number): Promise<Holiday[]> =>
        (await live().get<Holiday[]>(`/hr/holidays?year=${year}`)) ?? [],

    /** 201; 409 when that date already has a holiday for that region. */
    createHoliday: (input: HolidayInput): Promise<Holiday> =>
        live().post<Holiday>("/hr/holidays", {
            date: input.date,
            name: input.name.trim(),
            ...(input.region?.trim() ? { region: input.region.trim() } : {}),
            ...(input.kind ? { kind: input.kind } : {}),
        }),

    /** An empty patch is 400; moving onto an existing day is 409. */
    updateHoliday: (id: string, patch: HolidayPatch): Promise<Holiday> =>
        live().patch<Holiday>(`/hr/holidays/${encodeURIComponent(id)}`, patch),

    deleteHoliday: (id: string): Promise<{ message: string }> =>
        live().delete<{ message: string }>(`/hr/holidays/${encodeURIComponent(id)}`),
};
