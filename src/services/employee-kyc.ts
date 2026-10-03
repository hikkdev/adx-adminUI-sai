import { onlineProviderOf } from "./verification";
import { ApiError, api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { formatDateTime } from "@/lib/format";
import type { EmploymentType } from "./employees";
import { accountStateOf, type AccountState } from "./account-state";
import { recordedOf, requestOf } from "./kyc";
import { kycStateOf, shapeKycStateCounts, type KycQueueState, type KycStateCounts } from "./kyc-state";
import type { KycRecorded, KycRequest, StatusMeta } from "@/types";

/**
 * An employee's KYC, recorded at ADX's desk — Lot D (Q131), the agent
 * record's twin.
 *
 * Employees are onboarded through the intake form and only ever sign in,
 * so their documents are recorded ON THEIR BEHALF by whoever met them, and
 * the row remembers who. `PUT /employee-kyc/:employeeId` is an upsert — HR
 * records what they have and comes back for the rest — and
 * `PATCH /employee-kyc/:employeeId/review` is the decision, a rejection
 * saying why. Files go up with purpose `EMPLOYEE_KYC`, which is private.
 * There are no fixtures, on purpose; the screens say so when the API is off.
 *
 * N3-B / N3-C (the owner, 14 Sep 2026): `GET /employee-kyc` lists EVERY
 * employee (no mirror column — everyone), each row with a server-derived
 * `state` (AWAITING_DOCUMENTS from the moment the row exists), `kycId`
 * (null with no record; every record column null then), `employeeId` and
 * the employee slice; `?state=` is the facet, `?q=` the search box,
 * `meta.counts` the chips. The one click is
 * `POST /employee-kyc/:employeeId/request` with no body, behind `kyc.edit`.
 *
 * Phase D (the owner, 1 Oct 2026): an employee has no entity type — the
 * Digio workflow is chosen by their employment type, and the desk is told
 * which (`employeeWorkflowLabel`). The KYC reads' employee slice does not
 * carry the employment type, so it is read off the HR roster
 * (`GET /employees`) and joined by the HR id.
 */

export type EmployeeKycStatus = "PENDING" | "VERIFIED" | "REJECTED";

/**
 * Phase D: the Digio workflow an employee is verified on, by the name the
 * owner's Digio KYC Workflows doc gives it — full time, part time or no
 * employment type set use "Employee: Full Time" (part time is treated as
 * full time until the owner says otherwise); contract and intern use
 * "Employee: Intern and Contract". The server makes the same choice when
 * the request goes out (`EMPLOYEE.FULL_TIME` / `EMPLOYEE.INTERN_CONTRACT`).
 */
export function employeeWorkflowLabel(employmentType: EmploymentType | null): string {
    return employmentType === "CONTRACT" || employmentType === "INTERN" ? "Employee: Intern and Contract" : "Employee: Full Time";
}

export interface WireEmployeeKyc {
    id: string;
    employeeId: string;
    govIdType: string | null;
    govIdFrontUrl: string | null;
    govIdBackUrl: string | null;
    panNumber: string | null;
    panFrontUrl: string | null;
    panSignatureUrl: string | null;
    addressProofType: string | null;
    addressProofUrl: string | null;
    selfieUrl: string | null;
    bankProofUrl: string | null;
    status: EmployeeKycStatus;
    rejectionReason: string | null;
    recordedById: string | null;
    submittedAt: string | null;
    reviewedAt: string | null;
    reviewedById: string | null;
    /** N3-B: the desk's ask and the recorder, the Digio columns — on the employee record since the one click. */
    requestedAt?: string | null;
    requestedById?: string | null;
    requestedChannel?: string | null;
    recordedVia?: string | null;
    method?: string | null;
    digioStatus?: string | null;
    requestedBy?: { id: string; name: string | null } | null;
    employee: {
        id: string;
        userId?: string;
        displayId: string | null;
        department: string | null;
        designation: string | null;
        createdAt?: string | null;
        /** Phase D: read when the server sends it; today the slice does not, and the roster stands in. */
        employmentType?: EmploymentType | null;
        user: { name: string | null; mobile: string; email: string | null };
    };
    /** E7-3: on the case read — the age against the review SLA and the people on it by name. */
    ageHours?: number | null;
    slaBreached?: boolean;
    slaHours?: number;
    reviewedBy?: { id: string; name: string | null } | null;
    recordedBy?: { id: string; name: string | null } | null;
}

/**
 * N3-B: a queue row is a PARTY — every employee — with its `state`, and the
 * record's columns spread over it when it has one (every column null
 * otherwise, `kycId` null). `id` is the record's id when there is one, else
 * the employee's; `employeeId` is always the employee's.
 */
export type WireEmployeeKycQueueRow = { [K in keyof Omit<WireEmployeeKyc, "id" | "employeeId" | "employee">]: WireEmployeeKyc[K] | null } & {
    id: string;
    employeeId: string;
    kycId: string | null;
    state?: string | null;
    /** 2 Oct 2026: where the account stands — ACTIVE, SUSPENDED, DEACTIVATED, CLOSED (agents: EXITED). Absent from a server one release behind. */
    accountState?: string | null;
    employee: WireEmployeeKyc["employee"];
};

/** `GET /employee-kyc` — `data: rows[]`, `meta { page, pageSize, total, totalPages, counts }`. */
export interface WireEmployeeKycMeta {
    page?: number;
    pageSize?: number;
    total?: number;
    totalPages?: number;
    counts?: Record<string, number | undefined>;
}

/** A queue row as the tab draws it — the employee, their state, and what the record holds when there is one. */
export interface EmployeeKycQueueRow {
    /** The record's id, else the employee's. */
    id: string;
    /** 2 Oct 2026: where the account stands; null on a read one release behind (read as working). */
    accountState?: AccountState | null;

    employeeId: string;
    kycId: string | null;
    state: KycQueueState;
    employeeName: string;
    displayId: string | null;
    department: string | null;
    designation: string | null;
    mobile: string;
    email: string | null;
    /** The employee's sign-in account — every employee has one. Null on a read older than N3-B. */
    userId: string | null;
    createdAt: string | null;
    /** The record's status; null while there is no record. */
    status: EmployeeKycStatus | null;
    /** Formatted, "—" with nothing submitted. */
    submittedAt: string;
    /** Cashfree Phase 2: CASHFREE when the backup ran the online check. */
    method: "MANUAL" | "DIGIO" | "CASHFREE" | null;
    /** The raw provider status — PROVIDER_FAILED when Digio could not be asked (printed as words, never raw). */
    digioStatus: string | null;
    documents: number;
    request: KycRequest | null;
    recorded: KycRecorded | null;
    /** Phase D: what picks the employee's Digio workflow — null when none is set, undefined when no read said. */
    employmentType?: EmploymentType | null;
}

export interface EmployeeKycQueue {
    rows: EmployeeKycQueueRow[];
    total: number;
    counts: KycStateCounts;
}

export interface EmployeeKycFilter {
    state?: KycQueueState;
    /** The legacy facet — an alias of `state`. */
    status?: EmployeeKycStatus;
    /** The employee's name, display id or mobile. */
    q?: string;
    /** 2 Oct 2026 (the account lifecycle): true sends `include=inactive` — the suspended, deactivated and closed come back too. */
    includeInactive?: boolean;
}

export function buildEmployeeKycQuery(filter: EmployeeKycFilter = {}): string {
    const params = new URLSearchParams({ pageSize: "100" });
    if (filter.state) params.set("state", filter.state);
    if (filter.status) params.set("status", filter.status);
    if (filter.q?.trim()) params.set("q", filter.q.trim());
    if (filter.includeInactive) params.set("include", "inactive");
    return params.toString();
}

/** `GET /employees`, one row — the HR record with its user slice. */
export interface WireEmployee {
    id: string;
    userId: string;
    displayId: string | null;
    department: string | null;
    designation: string | null;
    /** Lot G (Q140): how the person is employed; Phase D: what picks their Digio workflow. Absent from a server one release behind. */
    employmentType?: EmploymentType | null;
    isActive: boolean;
    user: { id: string; name: string | null; mobile: string; email: string | null };
}

/** `GET /employees?page=` — the list contract the roster reads (E10-1). */
export interface WireEmployeesPage {
    items: WireEmployee[];
    total: number;
    page: number;
    pageSize: number;
    counts: Record<string, number>;
}

/** The server's largest page — one read covers a roster of ADX's size. */
export const EMPLOYEE_ROSTER_PAGE_SIZE = 100;

/** The document slots the desk records, in the order the sheet asks for them. */
export const EMPLOYEE_KYC_SLOTS = [
    { key: "govIdFrontUrl", label: "Government ID · front" },
    { key: "govIdBackUrl", label: "Government ID · back" },
    { key: "panFrontUrl", label: "PAN card" },
    { key: "panSignatureUrl", label: "PAN signature" },
    { key: "addressProofUrl", label: "Address proof" },
    { key: "selfieUrl", label: "Live selfie" },
    { key: "bankProofUrl", label: "Bank proof (cancelled cheque or passbook)" },
] as const;

export type EmployeeKycSlot = (typeof EMPLOYEE_KYC_SLOTS)[number]["key"];

export interface EmployeeKycDocuments {
    govIdType?: "AADHAAR" | "PASSPORT" | "DRIVING_LICENCE";
    govIdFrontUrl?: string;
    govIdBackUrl?: string;
    panNumber?: string;
    panFrontUrl?: string;
    panSignatureUrl?: string;
    addressProofType?: "UTILITY_BILL" | "RENT_AGREEMENT" | "BANK_STATEMENT";
    addressProofUrl?: string;
    selfieUrl?: string;
    bankProofUrl?: string;
}

export interface EmployeeKycCase {
    employeeId: string;
    employeeName: string;
    displayId: string | null;
    department: string | null;
    designation: string | null;
    mobile: string;
    status: EmployeeKycStatus;
    submittedAt: string;
    reviewedAt: string | null;
    rejectionReason: string | null;
    recordedById: string | null;
    reviewedById: string | null;
    /** E7-3: the same two people by name; null where nobody has. */
    recordedBy: { id: string; name: string | null } | null;
    reviewedBy: { id: string; name: string | null } | null;
    /** E7-3: hours waiting while PENDING, against the review SLA; null once decided or on a list row. */
    ageHours: number | null;
    slaBreached: boolean;
    slaHours: number | null;
    /** How many of the seven slots hold a document. */
    documents: number;
    /** Cashfree Phase 2: the online provider on the record (Digio, or Cashfree on the backup), null for documents; absent on an older read. */
    provider?: "DIGIO" | "CASHFREE" | null;
    /** Cashfree Phase 2: the raw provider status — PROVIDER_FAILED when Digio could not be asked. */
    digioStatus?: string | null;
    /** Everything recorded, for the form to start from. */
    recorded: EmployeeKycDocuments;
    /** Phase D: what picks the employee's Digio workflow — null when none is set, undefined when the read did not say. */
    employmentType?: EmploymentType | null;
}

export interface EmployeeSummary {
    id: string;
    userId: string;
    name: string;
    displayId: string | null;
    department: string | null;
    designation: string | null;
    mobile: string;
    email: string | null;
    isActive: boolean;
    /** Phase D: what picks the employee's Digio workflow — null when none is set, undefined when the read did not say. */
    employmentType?: EmploymentType | null;
}

export const EMPLOYEE_KYC_STATUS_META: Record<EmployeeKycStatus, StatusMeta> = {
    PENDING: { label: "Awaiting review", tone: "warning" },
    VERIFIED: { label: "Verified", tone: "success" },
    REJECTED: { label: "Rejected", tone: "danger" },
};

const orUndefined = <T>(value: T | null): T | undefined => (value === null ? undefined : value);

export function shapeEmployeeKyc(row: WireEmployeeKyc): EmployeeKycCase {
    const recorded: EmployeeKycDocuments = {
        govIdType: orUndefined(row.govIdType) as EmployeeKycDocuments["govIdType"],
        govIdFrontUrl: orUndefined(row.govIdFrontUrl),
        govIdBackUrl: orUndefined(row.govIdBackUrl),
        panNumber: orUndefined(row.panNumber),
        panFrontUrl: orUndefined(row.panFrontUrl),
        panSignatureUrl: orUndefined(row.panSignatureUrl),
        addressProofType: orUndefined(row.addressProofType) as EmployeeKycDocuments["addressProofType"],
        addressProofUrl: orUndefined(row.addressProofUrl),
        selfieUrl: orUndefined(row.selfieUrl),
        bankProofUrl: orUndefined(row.bankProofUrl),
    };
    return {
        employeeId: row.employeeId,
        employeeName: row.employee.user.name ?? row.employee.user.mobile,
        displayId: row.employee.displayId,
        department: row.employee.department,
        designation: row.employee.designation,
        mobile: row.employee.user.mobile,
        status: row.status,
        submittedAt: row.submittedAt ? formatDateTime(row.submittedAt) : "—",
        reviewedAt: row.reviewedAt ? formatDateTime(row.reviewedAt) : null,
        rejectionReason: row.rejectionReason,
        recordedById: row.recordedById,
        reviewedById: row.reviewedById,
        recordedBy: row.recordedBy ?? (row.recordedById ? { id: row.recordedById, name: null } : null),
        reviewedBy: row.reviewedBy ?? (row.reviewedById ? { id: row.reviewedById, name: null } : null),
        ageHours: row.ageHours ?? null,
        slaBreached: row.slaBreached ?? false,
        slaHours: row.slaHours ?? null,
        documents: EMPLOYEE_KYC_SLOTS.filter((slot) => Boolean(row[slot.key])).length,
        recorded,
        provider: onlineProviderOf(row.method),
        digioStatus: row.digioStatus ?? null,
        employmentType: row.employee.employmentType,
    };
}

export function shapeEmployeeKycQueueRow(row: WireEmployeeKycQueueRow): EmployeeKycQueueRow {
    const hasRecord = Boolean(row.kycId ?? row.status);
    const record = hasRecord && row.status ? { status: row.status, submittedAt: row.submittedAt, requestedAt: row.requestedAt ?? null } : null;
    return {
        id: row.id,
        employeeId: row.employeeId,
        kycId: row.kycId ?? (hasRecord ? row.id : null),
        state: kycStateOf(row, record),
        employeeName: row.employee.user.name ?? row.employee.user.mobile,
        displayId: row.employee.displayId,
        department: row.employee.department,
        designation: row.employee.designation,
        mobile: row.employee.user.mobile,
        email: row.employee.user.email,
        userId: row.employee.userId ?? null,
        createdAt: row.employee.createdAt ?? null,
        status: row.status,
        submittedAt: row.submittedAt ? formatDateTime(row.submittedAt) : "—",
        method: onlineProviderOf(row.method) ?? (row.method === "MANUAL" ? "MANUAL" : null),
        digioStatus: row.digioStatus ?? null,
        documents: EMPLOYEE_KYC_SLOTS.filter((slot) => Boolean(row[slot.key])).length,
        request: requestOf(row, row),
        recorded: recordedOf(row, row),
        employmentType: row.employee.employmentType,
        accountState: accountStateOf(row.accountState),
    };
}

/**
 * Phase D: the queue rows with the employment type the HR roster holds for
 * each — a row the KYC read already answered for keeps its own; one the
 * roster does not know stays unsaid, and the column prints "—" rather than
 * a workflow nobody checked.
 */
export function withEmploymentTypes(rows: EmployeeKycQueueRow[], roster: Map<string, EmploymentType | null>): EmployeeKycQueueRow[] {
    return rows.map((row) => (row.employmentType !== undefined || !roster.has(row.employeeId) ? row : { ...row, employmentType: roster.get(row.employeeId) ?? null }));
}

export function shapeEmployee(row: WireEmployee): EmployeeSummary {
    return {
        id: row.id,
        userId: row.userId,
        name: row.user.name ?? row.user.mobile,
        displayId: row.displayId,
        department: row.department,
        designation: row.designation,
        mobile: row.user.mobile,
        email: row.user.email,
        isActive: row.isActive,
        employmentType: row.employmentType,
    };
}

/** Only the fields that hold a value go on the wire; the API takes each as optional. */
export function documentsBody(docs: EmployeeKycDocuments): EmployeeKycDocuments {
    return Object.fromEntries(
        Object.entries(docs).filter(([, value]) => value !== undefined && value !== null && value !== "")
    ) as EmployeeKycDocuments;
}

function live() {
    if (!isLive("kyc")) throw new Error("KYC is read from the API; connect the console to the ADX backend first.");
    return http;
}

export const employeeKycService = {
    /** N3-B: every employee, in one of six states — `data` the rows, `meta.counts` the chips (counted with the state facet removed). */
    queue: async (filter: EmployeeKycFilter = {}): Promise<EmployeeKycQueue> => {
        if (!isLive("kyc")) return { rows: [], total: 0, counts: shapeKycStateCounts(null) };
        const page = await http.getEnvelope<WireEmployeeKycQueueRow[], { meta?: WireEmployeeKycMeta }>(`/employee-kyc?${buildEmployeeKycQuery(filter)}`);
        const rows = (page.data ?? []).map(shapeEmployeeKycQueueRow);
        return { rows, total: page.meta?.total ?? rows.length, counts: shapeKycStateCounts(page.meta?.counts) };
    },

    /** The rows alone, for the screens that only need them. */
    list: async (status?: EmployeeKycStatus): Promise<EmployeeKycQueueRow[]> => (await employeeKycService.queue(status ? { status } : {})).rows,

    /** The employee's record, or null when nothing has been recorded yet. */
    get: async (employeeId: string): Promise<EmployeeKycCase | null> => {
        if (!isLive("kyc")) return null;
        try {
            return shapeEmployeeKyc(await http.get<WireEmployeeKyc>(`/employee-kyc/${employeeId}`));
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 404) return null;
            throw cause;
        }
    },

    /** On behalf: what the desk was shown. An upsert; the record goes (back) to PENDING. */
    record: async (employeeId: string, docs: EmployeeKycDocuments): Promise<EmployeeKycCase> =>
        shapeEmployeeKyc(await live().put<WireEmployeeKyc>(`/employee-kyc/${employeeId}`, documentsBody(docs))),

    review: async (employeeId: string, status: "VERIFIED" | "REJECTED", rejectionReason?: string): Promise<EmployeeKycCase> =>
        shapeEmployeeKyc(
            await live().patch<WireEmployeeKyc>(`/employee-kyc/${employeeId}/review`, {
                status,
                ...(rejectionReason ? { rejectionReason } : {}),
            })
        ),

    /** N3-C: the one click — `POST /employee-kyc/:employeeId/request` with no body; the server opens a Digio session in the employee's name. Behind `kyc.edit`. 409 `KYC_ALREADY_VERIFIED`. */
    requestDigio: (employeeId: string) =>
        live().post<{ kyc: WireEmployeeKyc; digio: { kycId: string; validTill: string } | null; notified: boolean }>(`/employee-kyc/${employeeId}/request`),

    /** N3-C: the ask by hand — `{ channel, note? }`. */
    request: (employeeId: string, channel: "DIGIO" | "MANUAL", note?: string) => {
        const trimmed = note?.trim();
        return live().post<{ kyc: WireEmployeeKyc; digio: { kycId: string; validTill: string } | null; notified: boolean }>(
            `/employee-kyc/${employeeId}/request`,
            trimmed ? { channel, note: trimmed } : { channel }
        );
    },

    /**
     * The HR roster, for picking whom to record for — `GET /employees?q=`,
     * the server's search over name, email, mobile, designation and
     * displayId. Read as a page the way the roster reads it: `?page=` or
     * `?pageSize=` makes the route answer the list contract
     * `{ items, total, page, pageSize, counts }` (Q-B made that explicit —
     * either alone is enough), so the rows are `.items`, never the bare
     * array the route sends with neither.
     */
    employees: async (q = ""): Promise<EmployeeSummary[]> => {
        if (!isLive("kyc")) return [];
        const params = new URLSearchParams({ page: "1", pageSize: String(EMPLOYEE_ROSTER_PAGE_SIZE) });
        if (q.trim()) params.set("q", q.trim());
        const page = await http.get<WireEmployeesPage>(`/employees?${params.toString()}`);
        return (page?.items ?? []).map(shapeEmployee);
    },

    /** One employee off the roster by their HR id, or null. */
    employee: async (employeeId: string): Promise<EmployeeSummary | null> =>
        (await employeeKycService.employees()).find((row) => row.id === employeeId) ?? null,

    /**
     * Phase D: every roster employee's employment type by HR id — what the
     * queue and the record are joined with to say which Digio workflow an
     * employee uses. An employee the roster read does not name, or a
     * server that does not send the column, is simply not in the map; a
     * failed read is an empty map, never a failed queue.
     */
    employmentTypes: async (): Promise<Map<string, EmploymentType | null>> => {
        try {
            const roster = await employeeKycService.employees();
            return new Map(roster.filter((row) => row.employmentType !== undefined).map((row) => [row.id, row.employmentType ?? null]));
        } catch {
            return new Map();
        }
    },
};
