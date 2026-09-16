import { ApiError, api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import type { StatusMeta } from "@/types";

/**
 * The back-office intake — `/onboarding/submissions` (Lot D, Q131).
 *
 * Not the QR-claim flow an agent runs on site: this is the admin-driven
 * intake form over `OnboardingSubmission`, and since Lot D it takes AGENT
 * and EMPLOYEE beside the three parties. The difference is what APPROVED
 * does: an agent intake is handed to `agents.createAgent` (one door for an
 * agent coming into being), an employee intake to `employees.createEmployee`
 * plus the optional console invitation. Provisioning runs before the status
 * moves and only on the first approval. Their KYC is recorded afterwards
 * on the twins (`/agent-kyc`, `/employee-kyc`).
 *
 * Read on the client under the `kyc` flag — the intake is the desk's
 * front door — and there are no fixtures for it.
 */

export type IntakeUserType = "PUBLISHER" | "ADVERTISER" | "PARTNER" | "AGENT" | "EMPLOYEE";
export type IntakeStatus = "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "CANCELLED";

export const INTAKE_STATUSES: IntakeStatus[] = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "CANCELLED"];

export const INTAKE_STATUS_META: Record<IntakeStatus, StatusMeta> = {
    DRAFT: { label: "Draft", tone: "neutral" },
    SUBMITTED: { label: "Submitted", tone: "info" },
    UNDER_REVIEW: { label: "Under review", tone: "warning" },
    APPROVED: { label: "Approved", tone: "success" },
    REJECTED: { label: "Rejected", tone: "danger" },
    CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const INTAKE_USER_TYPE_LABEL: Record<IntakeUserType, string> = {
    PUBLISHER: "Publisher",
    ADVERTISER: "Advertiser",
    PARTNER: "Partner",
    AGENT: "Agent",
    EMPLOYEE: "Employee",
};

export interface WireIntakeSubmission {
    id: string;
    flowTemplateId: string | null;
    userId: string | null;
    userType: IntakeUserType;
    accountType: string | null;
    status: IntakeStatus;
    data: Record<string, unknown>;
    submittedById: string | null;
    reviewedById: string | null;
    reviewedAt: string | null;
    rejectionReason: string | null;
    createdAt: string;
    updatedAt: string;
    flowTemplate?: { id: string; key: string; name: string; userType: string; version: number } | null;
    user?: { id: string; name: string | null; mobile: string; email: string | null; roles?: { role: string }[] } | null;
    /** On the approval that created the profile. */
    provisioned?: { agentId?: string; userId?: string; employeeId?: string; inviteId?: string | null; inviteSkipped?: string } | null;
}

export interface IntakeFilter {
    userType?: IntakeUserType;
    status?: IntakeStatus;
    /** E7-3: the intake's name or mobile, or the linked user's. */
    q?: string;
    page?: number;
    pageSize?: number;
}

/** The page size the desk reads; the server clamps larger asks at 100. */
export const INTAKE_PAGE_SIZE = 25;

/** `?q=&status=&userType=&page=&pageSize=` — sending a page is what switches the answer to the list contract. */
export function buildIntakeQuery(filter: IntakeFilter = {}): string {
    const params = new URLSearchParams();
    if (filter.q?.trim()) params.set("q", filter.q.trim());
    if (filter.userType) params.set("userType", filter.userType);
    if (filter.status) params.set("status", filter.status);
    params.set("page", String(filter.page && filter.page > 1 ? filter.page : 1));
    params.set("pageSize", String(filter.pageSize ?? INTAKE_PAGE_SIZE));
    return params.toString();
}

/** E7-3: `GET /onboarding/submissions` with a page — `{ items, total, page, pageSize, counts }`. */
export interface IntakePage {
    items: WireIntakeSubmission[];
    total: number;
    page: number;
    pageSize: number;
    /** Rows per status, counted with the status facet removed. */
    counts: Record<string, number>;
}

/** What the desk types for a new intake; the user is provisioned inline with it. */
export interface NewIntakeInput {
    userType: "AGENT" | "EMPLOYEE";
    name: string;
    mobile: string;
    email?: string;
    /** AGENT: which side the agent works. Required — an approval with no side is 400. */
    side?: "PUBLISHER" | "ADVERTISER";
    city?: string;
    state?: string;
    /** EMPLOYEE: the HR row's two fields. */
    department?: string;
    designation?: string;
    /** EMPLOYEE: send the console invitation on approval. */
    inviteToConsole?: boolean;
}

/** `submissionSchema` — the user inline, the intake's own fields under `data`. */
export function newIntakeBody(input: NewIntakeInput): Record<string, unknown> {
    const name = input.name.trim();
    const mobile = input.mobile.trim();
    const email = input.email?.trim() || undefined;
    const data: Record<string, unknown> = { name, mobile, ...(email ? { email } : {}) };
    if (input.userType === "AGENT") {
        if (!input.side) throw new Error("Say which side the agent works — publishers or advertisers.");
        data.side = input.side;
        if (input.city?.trim()) data.city = input.city.trim();
        if (input.state?.trim()) data.state = input.state.trim();
    } else {
        if (input.department?.trim()) data.department = input.department.trim();
        if (input.designation?.trim()) data.designation = input.designation.trim();
        if (input.inviteToConsole) data.inviteToConsole = { method: "PASSWORD" };
    }
    return {
        userType: input.userType,
        data,
        user: { mobile, name, ...(email ? { email } : {}) },
    };
}

/** What the party's own name is, off the record or the linked user. */
export function intakeName(submission: WireIntakeSubmission): string {
    const typed = submission.data["name"];
    if (typeof typed === "string" && typed.trim()) return typed.trim();
    return submission.user?.name ?? submission.user?.mobile ?? submission.id;
}

function live() {
    if (!isLive("kyc")) throw new Error("The intake is read from the API; connect the console to the ADX backend first.");
    return http;
}

export const onboardingService = {
    /** The intake on the list contract: the search, the type and status facets and the page all the server's. */
    page: async (filter: IntakeFilter = {}): Promise<IntakePage> => {
        if (!isLive("kyc")) return { items: [], total: 0, page: 1, pageSize: filter.pageSize ?? INTAKE_PAGE_SIZE, counts: {} };
        const page = await http.get<IntakePage>(`/onboarding/submissions?${buildIntakeQuery(filter)}`);
        return {
            items: page.items ?? [],
            total: page.total ?? 0,
            page: page.page ?? 1,
            pageSize: page.pageSize ?? filter.pageSize ?? INTAKE_PAGE_SIZE,
            counts: page.counts ?? {},
        };
    },

    /** The rows only, for the screens that need no paging. */
    list: async (filter: IntakeFilter = {}): Promise<WireIntakeSubmission[]> => (await onboardingService.page(filter)).items,

    get: async (id: string): Promise<WireIntakeSubmission | null> => {
        if (!isLive("kyc")) return null;
        try {
            return await http.get<WireIntakeSubmission>(`/onboarding/submissions/${id}`);
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 404) return null;
            throw cause;
        }
    },

    /** 201; the user is provisioned in the same transaction. 409 on a mobile or email already held. */
    create: (input: NewIntakeInput): Promise<WireIntakeSubmission> =>
        live().post<WireIntakeSubmission>("/onboarding/submissions", newIntakeBody(input)),

    /** The status move: APPROVED provisions the profile the first time; a rejection carries its reason. */
    setStatus: (id: string, status: IntakeStatus, rejectionReason?: string): Promise<WireIntakeSubmission> =>
        live().patch<WireIntakeSubmission>(`/onboarding/submissions/${id}/status`, {
            status,
            ...(rejectionReason?.trim() ? { rejectionReason: rejectionReason.trim() } : {}),
        }),
};
