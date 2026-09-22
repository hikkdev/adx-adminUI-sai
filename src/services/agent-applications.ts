import { ApiError, api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import type { StatusMeta } from "@/types";

/**
 * AG-3: the agent application desk, wired to the backend `agents` module's
 * application doors (AG-1).
 *
 * Every applicant — a delivery rider applying from the field app, or a
 * walk-in the desk signs up — climbs the same ladder: the profile, the
 * papers, a payout account, the ADX terms, screening, training, and the
 * desk's decision. The desk can do any step on the applicant's behalf, and
 * only the desk can decide. The wire is `ApplicationView` exactly as the
 * API sends it; nothing is renamed, since the app reads the same shape.
 */

export type AgentSide = "PUBLISHER" | "ADVERTISER";
export type AgentStage =
    | "APPLIED"
    | "PROFILE"
    | "DOCUMENTS"
    | "BANK"
    | "AGREEMENT"
    | "SCREENING"
    | "TRAINING"
    | "UNDER_REVIEW"
    | "ACTIVE"
    | "ON_HOLD"
    | "REJECTED"
    | "WITHDRAWN"
    | "EXITED";
export type AgentGrade = "G1" | "G2" | "G3" | "G4";
export type AgentEngagementType = "GIG" | "CONTRACT";
export type AgentVehicleType = "NONE" | "BICYCLE" | "SCOOTER" | "MOTORBIKE" | "EV" | "CAR";
export type AgentEducationLevel = "BELOW_10TH" | "CLASS_10" | "CLASS_12" | "DIPLOMA" | "GRADUATE" | "POST_GRADUATE";
export type AgentSourceKind = "SELF" | "FLEET" | "REFERRAL" | "WALK_IN" | "JOB_PORTAL" | "DESK" | "IMPORT";
export type AgentExitReason = "RESIGNED" | "CONTRACT_ENDED" | "NON_PERFORMANCE" | "MISCONDUCT" | "FRAUD" | "OTHER";
export type AgentDocumentKind =
    | "AADHAAR_FRONT"
    | "AADHAAR_BACK"
    | "PASSPORT"
    | "PAN"
    | "SELFIE"
    | "DRIVING_LICENCE_FRONT"
    | "DRIVING_LICENCE_BACK"
    | "VEHICLE_RC"
    | "VEHICLE_INSURANCE"
    | "ADDRESS_PROOF"
    | "BANK_PROOF"
    | "POLICE_VERIFICATION"
    | "EDUCATION_CERTIFICATE"
    | "RESUME"
    | "EMPLOYER_PROOF"
    | "PHOTO"
    | "OTHER";
export type AgentDocumentStatus = "MISSING" | "SUBMITTED" | "APPROVED" | "FLAGGED" | "REUPLOAD_REQUESTED" | "EXPIRED";
/** AG-4: what a paper's verification stamp carries. */
export interface ApplicationDocumentVerification {
    via: "MANUAL" | "CASHFREE_VRS" | "CASHFREE_BANK" | string;
    at: string | null;
    payload: Record<string, unknown> | null;
}
export type AgentDocumentDecision = "APPROVED" | "FLAGGED" | "REUPLOAD_REQUESTED";
export type AgentPlatform = "ZOMATO" | "SWIGGY" | "RAPIDO" | "UBER" | "OLA" | "DUNZO" | "AMAZON_FLEX" | "DELHIVERY" | "PORTER" | "OTHER";
export type StepKey = "PROFILE" | "DOCUMENTS" | "BANK" | "AGREEMENT" | "SCREENING" | "TRAINING" | "REVIEW";
export type StepState = "DONE" | "PENDING" | "ACTION_NEEDED" | "WAITING";

/* ── The wire ────────────────────────────────────────────────────────────── */

/** One row of `GET /agents/applications`. */
export interface ApplicationRow {
    id: string;
    displayId: string | null;
    stage: AgentStage;
    grade: AgentGrade | null;
    sourceKind: AgentSourceKind;
    side: AgentSide;
    city: string | null;
    createdAt: string;
    applicationSubmittedAt: string | null;
    activatedAt: string | null;
    user: { name: string | null; mobile: string | null; email: string | null };
    documents: { filed: number; flagged: number };
}

export interface ApplicationsPage {
    rows: ApplicationRow[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    /** How many applications sit at each stage, under the side and search filters — the tabs' counts. */
    counts: Partial<Record<AgentStage, number>>;
}

export interface ApplicationDocument {
    kind: AgentDocumentKind;
    label: string;
    required: boolean;
    status: AgentDocumentStatus;
    /** A `/files/:id` URL, opened with the token. */
    url: string | null;
    numberMasked: string | null;
    expiresAt: string | null;
    reviewNote: string | null;
    uploadedVia: string | null;
    updatedAt: string | null;
    /** AG-4: Cashfree's check on the paper, when the desk ran it. Absent on an older server. */
    verification?: ApplicationDocumentVerification | null;
}

export interface LadderStep {
    key: StepKey;
    state: StepState;
    /** What the step still needs, in the applicant's words. */
    missing: string[];
}

export interface ApplicationEducation {
    id?: string;
    level: AgentEducationLevel;
    degree: string | null;
    institution: string | null;
    year: number | null;
}
export interface ApplicationEmployment {
    id?: string;
    employer: string;
    role: string | null;
    industry: string | null;
    fromMonth: string | null;
    toMonth: string | null;
    current: boolean;
    reasonForLeaving: string | null;
}
export interface ApplicationReference {
    id?: string;
    name: string;
    relation: string | null;
    phone: string;
}
export interface ApplicationPlatformExperience {
    id?: string;
    platform: AgentPlatform;
    partnerId: string | null;
    years: number | null;
    active: boolean;
    ratingNote: string | null;
}

/** `GET /agents/:id/application` — and what every write hands back. */
export interface ApplicationView {
    agent: {
        id: string;
        /** The applicant's user id — the owner named on a paper the desk uploads for them. */
        userId: string;
        displayId: string | null;
        stage: AgentStage;
        side: AgentSide;
        grade: AgentGrade | null;
        gradeLabel: string | null;
        sourceKind: AgentSourceKind | string;
        applicationSubmittedAt: string | null;
        activatedAt: string | null;
        holdReason: string | null;
        rejectionReason: string | null;
        reviewNote: string | null;
        engagement: {
            type: AgentEngagementType | string | null;
            startAt: string | null;
            endAt: string | null;
            probationEndsAt: string | null;
            reportingManagerId: string | null;
            weeklyHours: number | null;
        };
        exit: {
            at: string | null;
            reason: AgentExitReason | string | null;
            note: string | null;
            rehireEligible: boolean;
            blacklisted: boolean;
        };
    };
    person: {
        name: string | null;
        mobile: string | null;
        email: string | null;
        dateOfBirth: string | null;
        gender: string | null;
    };
    profile: {
        city: string | null;
        state: string | null;
        languages: string[];
        vehicleType: AgentVehicleType | null;
        vehicleNumber: string | null;
        currentAddress: string | null;
        currentLatitude: number | null;
        currentLongitude: number | null;
        permanentAddress: string | null;
        emergencyContactName: string | null;
        emergencyContactRelation: string | null;
        emergencyContactPhone: string | null;
        highestEducation: AgentEducationLevel | null;
        salesExperienceYears: number | null;
        industries: string[];
        noticePeriodDays: number | null;
        territory: string | null;
        homeZone: string | null;
    };
    educations: ApplicationEducation[];
    employments: ApplicationEmployment[];
    references: ApplicationReference[];
    platformExperiences: ApplicationPlatformExperience[];
    documents: ApplicationDocument[];
    identity: { verified: boolean; kycStatus: string | null };
    bank: { onFile: boolean };
    agreement: { kind: string; accepted: boolean; currentVersion: number | null };
    /** DS-1: the engagement terms e-signed through Digio at activation — the agent works once `satisfied`. Absent on an older server. */
    signing?: { required: boolean; satisfied: boolean; status: string | null; requestId: string | null; signingUrl: string | null; mock: boolean; expiresAt: string | null };
    training: { state: "CERTIFIED" | "LOCKED" | "REVOKED"; available?: boolean };
    /** AG-4: the screen — the assessment (the applicant's), the interviews (the desk's), the desk's tick. Absent on an older server. */
    screening?: ApplicationScreening;
    ladder: {
        stage: AgentStage;
        steps: LadderStep[];
        canSubmit: boolean;
        nextStep: StepKey | null;
    };
}

export type AgentInterviewMode = "IN_PERSON" | "PHONE" | "VIDEO";
export type AgentInterviewOutcome = "SCHEDULED" | "PASSED" | "FAILED" | "NO_SHOW" | "CANCELLED";

export interface ApplicationInterview {
    id: string;
    round: number;
    scheduledAt: string;
    mode: AgentInterviewMode;
    location: string | null;
    interviewerId: string | null;
    outcome: AgentInterviewOutcome;
    marks: number | null;
    notes: string | null;
    decidedAt: string | null;
}

export interface ApplicationScreening {
    done: boolean;
    owedBy: "APPLICANT" | "DESK" | null;
    missing: string[];
    assessment: { required: boolean; passed: boolean; bestPercent: number | null; passPercent: number | null };
    assessmentModules: { id: string; title: string; passPercent: number; timeLimitMins: number | null; best: { score: number; total: number; passed: boolean; percent: number } | null }[];
    interviews: ApplicationInterview[];
    interviewPassed: boolean;
    secondRoundPassed: boolean;
    nextInterview: { round: number; scheduledAt: string; outcome: string } | null;
    screenedAt: string | null;
    screeningNote: string | null;
}

export interface InterviewInput {
    round: 1 | 2;
    /** ISO date-time with offset. */
    scheduledAt: string;
    mode: AgentInterviewMode;
    location?: string;
    interviewerId?: string;
    notes?: string;
}

export interface InterviewOutcomeInput {
    outcome: Exclude<AgentInterviewOutcome, "SCHEDULED">;
    marks?: number;
    notes?: string;
}

export const INTERVIEW_MODE_LABEL: Record<AgentInterviewMode, string> = { IN_PERSON: "In person", PHONE: "By phone", VIDEO: "By video call" };
export const INTERVIEW_OUTCOME_META: Record<AgentInterviewOutcome, StatusMeta> = {
    SCHEDULED: { label: "Scheduled", tone: "info" },
    PASSED: { label: "Passed", tone: "success" },
    FAILED: { label: "Failed", tone: "danger" },
    NO_SHOW: { label: "No show", tone: "warning" },
    CANCELLED: { label: "Cancelled", tone: "neutral" },
};

/* ── What the desk sends ─────────────────────────────────────────────────── */

export type ApplicationStageGroup = "IN_PROGRESS" | "WITH_DESK" | "CLOSED";

export interface ApplicationsQuery {
    stage?: AgentStage;
    /** A named group of stages; ignored when `stage` is given. */
    group?: ApplicationStageGroup;
    side?: AgentSide;
    q?: string;
    page?: number;
    pageSize?: number;
}

/**
 * `PATCH /agents/:id/application/profile` — a key left out is left alone; the
 * row arrays replace what was there. The desk's copy also carries the
 * person's own three fields, which the app writes through `/users/me`.
 */
export interface ApplicationProfilePatch {
    name?: string;
    /** YYYY-MM-DD */
    dateOfBirth?: string;
    gender?: "MALE" | "FEMALE" | "OTHER" | "PREFER_NOT_TO_SAY";
    city?: string;
    state?: string;
    languages?: string[];
    vehicleType?: AgentVehicleType | null;
    vehicleNumber?: string | null;
    currentAddress?: string | null;
    currentLatitude?: number | null;
    currentLongitude?: number | null;
    permanentAddress?: string | null;
    emergencyContactName?: string | null;
    emergencyContactRelation?: string | null;
    emergencyContactPhone?: string | null;
    highestEducation?: AgentEducationLevel | null;
    salesExperienceYears?: number | null;
    industries?: string[];
    noticePeriodDays?: number | null;
    educations?: {
        level: AgentEducationLevel;
        degree?: string;
        institution?: string;
        year?: number;
    }[];
    employments?: {
        employer: string;
        role?: string;
        industry?: string;
        fromMonth?: string;
        toMonth?: string;
        current?: boolean;
        reasonForLeaving?: string;
    }[];
    references?: { name: string; relation?: string; phone: string }[];
    platformExperiences?: {
        platform: AgentPlatform;
        partnerId?: string;
        years?: number;
        active?: boolean;
        ratingNote?: string;
    }[];
}

export interface FileDocumentInput {
    url: string;
    number?: string;
    /** YYYY-MM-DD */
    expiresAt?: string;
}

export interface ReviewDocumentInput {
    decision: AgentDocumentDecision;
    /** Required unless approving — the applicant reads it. */
    note?: string;
}

export interface DecisionInput {
    decision: "ACTIVATE" | "REJECT" | "HOLD" | "RESUME";
    note?: string;
    grade?: AgentGrade;
    gradeNote?: string;
    engagementType?: AgentEngagementType;
    engagementStartAt?: string;
    engagementEndAt?: string;
    probationEndsAt?: string;
    reportingManagerId?: string;
    weeklyHours?: number;
    territory?: string;
    homeZone?: string;
    /** The desk saw the originals: vouches for the identity papers without a separate KYC decision. */
    identityCheckedInPerson?: boolean;
    /** AG-4: activate without the screen done / the training certified — say why in the note. */
    waiveScreening?: boolean;
    waiveTraining?: boolean;
}

export interface GradeInput {
    grade: AgentGrade;
    note?: string;
}

export interface ExitInput {
    reason: AgentExitReason;
    note?: string;
    rehireEligible: boolean;
    blacklist: boolean;
}

/* ── The vocabulary ──────────────────────────────────────────────────────── */

export const AGENT_STAGES: AgentStage[] = [
    "APPLIED",
    "PROFILE",
    "DOCUMENTS",
    "BANK",
    "AGREEMENT",
    "SCREENING",
    "TRAINING",
    "UNDER_REVIEW",
    "ACTIVE",
    "ON_HOLD",
    "REJECTED",
    "WITHDRAWN",
    "EXITED",
];

export const STAGE_META: Record<AgentStage, StatusMeta> = {
    APPLIED: { label: "Applied", tone: "neutral" },
    PROFILE: { label: "Filling in details", tone: "neutral" },
    DOCUMENTS: { label: "Filing papers", tone: "neutral" },
    BANK: { label: "Bank pending", tone: "neutral" },
    AGREEMENT: { label: "Terms pending", tone: "neutral" },
    SCREENING: { label: "Screening", tone: "info" },
    TRAINING: { label: "Training", tone: "info" },
    UNDER_REVIEW: { label: "Under review", tone: "warning" },
    ACTIVE: { label: "Active", tone: "success" },
    ON_HOLD: { label: "On hold", tone: "warning" },
    REJECTED: { label: "Rejected", tone: "danger" },
    WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
    EXITED: { label: "Exited", tone: "neutral" },
};

/** The stages the applicant is still working through — one tab on the queue, "In progress". */
export const IN_PROGRESS_STAGES: AgentStage[] = ["APPLIED", "PROFILE", "DOCUMENTS", "BANK", "AGREEMENT"];
/** The stages where the desk is the one who owes an action. */
export const WITH_DESK_STAGES: AgentStage[] = ["UNDER_REVIEW", "SCREENING", "TRAINING"];
/** Nothing more happens to these. */
export const CLOSED_STAGES: AgentStage[] = ["REJECTED", "WITHDRAWN", "EXITED"];

export const GRADE_META: Record<AgentGrade, { label: string; handles: string }> = {
    G1: { label: "Field", handles: "Everyday spots and small businesses" },
    G2: {
        label: "Senior field",
        handles: "Established publishers and repeat advertisers",
    },
    G3: {
        label: "Key accounts",
        handles: "Media owners with large inventories, mid-size advertisers",
    },
    G4: {
        label: "Enterprise",
        handles: "Brands, agencies and airport or mall estates",
    },
};
export const AGENT_GRADES: AgentGrade[] = ["G1", "G2", "G3", "G4"];

/** "G2 · Senior field", or "—" before activation. */
export function gradeLabel(grade: AgentGrade | null | undefined): string {
    return grade ? `${grade} · ${GRADE_META[grade].label}` : "—";
}

export const SIDE_LABEL: Record<AgentSide, string> = {
    PUBLISHER: "Publisher side",
    ADVERTISER: "Advertiser side",
};
export const SIDE_ROLE_LABEL: Record<AgentSide, string> = {
    PUBLISHER: "Field agent",
    ADVERTISER: "Sales agent",
};

export const SOURCE_LABEL: Record<AgentSourceKind, string> = {
    SELF: "Applied in the app",
    FLEET: "Fleet partner",
    REFERRAL: "Referred by an agent",
    WALK_IN: "Walk-in",
    JOB_PORTAL: "Job portal",
    DESK: "Added at the desk",
    IMPORT: "Imported",
};

export const DOCUMENT_STATUS_META: Record<AgentDocumentStatus, StatusMeta> = {
    MISSING: { label: "Not filed", tone: "neutral" },
    SUBMITTED: { label: "To review", tone: "warning" },
    APPROVED: { label: "Approved", tone: "success" },
    FLAGGED: { label: "Flagged", tone: "danger" },
    REUPLOAD_REQUESTED: { label: "Asked again", tone: "danger" },
    EXPIRED: { label: "Expired", tone: "danger" },
};

export const ENGAGEMENT_LABEL: Record<AgentEngagementType, string> = {
    GIG: "Gig — paid per job",
    CONTRACT: "Contract — fixed term",
};

export const VEHICLE_LABEL: Record<AgentVehicleType, string> = {
    NONE: "No vehicle",
    BICYCLE: "Bicycle",
    SCOOTER: "Scooter",
    MOTORBIKE: "Motorbike",
    EV: "Electric two-wheeler",
    CAR: "Car",
};
export const AGENT_VEHICLE_TYPES: AgentVehicleType[] = ["NONE", "BICYCLE", "SCOOTER", "MOTORBIKE", "EV", "CAR"];

export const EDUCATION_LABEL: Record<AgentEducationLevel, string> = {
    BELOW_10TH: "Below class 10",
    CLASS_10: "Class 10",
    CLASS_12: "Class 12",
    DIPLOMA: "Diploma",
    GRADUATE: "Graduate",
    POST_GRADUATE: "Post-graduate",
};
export const AGENT_EDUCATION_LEVELS: AgentEducationLevel[] = ["BELOW_10TH", "CLASS_10", "CLASS_12", "DIPLOMA", "GRADUATE", "POST_GRADUATE"];

export const PLATFORM_LABEL: Record<AgentPlatform, string> = {
    ZOMATO: "Zomato",
    SWIGGY: "Swiggy",
    RAPIDO: "Rapido",
    UBER: "Uber",
    OLA: "Ola",
    DUNZO: "Dunzo",
    AMAZON_FLEX: "Amazon Flex",
    DELHIVERY: "Delhivery",
    PORTER: "Porter",
    OTHER: "Other",
};
export const AGENT_PLATFORMS: AgentPlatform[] = ["ZOMATO", "SWIGGY", "RAPIDO", "UBER", "OLA", "DUNZO", "AMAZON_FLEX", "DELHIVERY", "PORTER", "OTHER"];

export const EXIT_REASON_LABEL: Record<AgentExitReason, string> = {
    RESIGNED: "Resigned",
    CONTRACT_ENDED: "Contract ended",
    NON_PERFORMANCE: "Non-performance",
    MISCONDUCT: "Misconduct",
    FRAUD: "Fraud",
    OTHER: "Other",
};
export const AGENT_EXIT_REASONS: AgentExitReason[] = ["RESIGNED", "CONTRACT_ENDED", "NON_PERFORMANCE", "MISCONDUCT", "FRAUD", "OTHER"];

export const STEP_LABEL: Record<StepKey, string> = {
    PROFILE: "Details",
    DOCUMENTS: "Papers",
    BANK: "Payout account",
    AGREEMENT: "ADX terms",
    SCREENING: "Screening",
    TRAINING: "Training",
    REVIEW: "ADX review",
};

export const STEP_STATE_META: Record<StepState, StatusMeta> = {
    DONE: { label: "Done", tone: "success" },
    PENDING: { label: "To do", tone: "neutral" },
    ACTION_NEEDED: { label: "Needs the applicant", tone: "danger" },
    WAITING: { label: "With ADX", tone: "info" },
};

/** Papers that carry a number the desk types beside the file. */
export const NUMBERED_KINDS: AgentDocumentKind[] = ["AADHAAR_FRONT", "PASSPORT", "PAN", "DRIVING_LICENCE_FRONT", "VEHICLE_RC"];
/** Papers that run out. */
export const EXPIRING_KINDS: AgentDocumentKind[] = ["PASSPORT", "DRIVING_LICENCE_FRONT", "VEHICLE_INSURANCE", "POLICE_VERIFICATION"];

/** Whoever the row names: the name, else the identifier, else the number. */
export function applicantName(row: { user: { name: string | null; mobile: string | null }; displayId: string | null }): string {
    return row.user.name?.trim() || row.displayId || row.user.mobile || "Unnamed applicant";
}

/** Which decisions the stage allows — mirrors `decisionAllowed` in the backend rules. */
export function decisionsFor(stage: AgentStage): DecisionInput["decision"][] {
    const settled = stage === "ACTIVE" || CLOSED_STAGES.includes(stage);
    if (settled) return [];
    if (stage === "ON_HOLD") return ["RESUME", "ACTIVATE", "REJECT"];
    if (WITH_DESK_STAGES.includes(stage)) return ["ACTIVATE", "HOLD", "REJECT"];
    return ["HOLD", "REJECT"];
}

/* ── The wire query ──────────────────────────────────────────────────────── */

export function buildApplicationsQuery(query: ApplicationsQuery): string {
    const params = new URLSearchParams();
    if (query.stage) params.set("stage", query.stage);
    else if (query.group) params.set("group", query.group);
    if (query.side) params.set("side", query.side);
    if (query.q?.trim()) params.set("q", query.q.trim());
    params.set("page", String(query.page ?? 1));
    params.set("pageSize", String(query.pageSize ?? 25));
    return params.toString();
}

function live() {
    if (!isLive("agents")) throw new Error("Agent applications read the API; connect the console to the ADX backend first.");
    return http;
}

/** A blank string is not sent; the schema refuses empty text. */
function compact<T extends object>(input: T): T {
    return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && !(typeof value === "string" && value.trim() === ""))) as T;
}

type WireMeta = {
    meta?: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
        counts: Partial<Record<AgentStage, number>>;
    };
};

export const agentApplicationService = {
    /** The queue, one page at a time, with the per-stage counts beside it. */
    list: async (query: ApplicationsQuery = {}): Promise<ApplicationsPage> => {
        const reply = await live().getEnvelope<ApplicationRow[], WireMeta>(`/agents/applications?${buildApplicationsQuery(query)}`);
        const meta = reply.meta;
        return {
            rows: reply.data ?? [],
            page: meta?.page ?? query.page ?? 1,
            pageSize: meta?.pageSize ?? query.pageSize ?? 25,
            total: meta?.total ?? reply.data?.length ?? 0,
            totalPages: meta?.totalPages ?? 1,
            counts: meta?.counts ?? {},
        };
    },

    /** One application, whole. Null when the id names nobody. */
    get: async (agentId: string): Promise<ApplicationView | null> => {
        try {
            return await live().get<ApplicationView>(`/agents/${encodeURIComponent(agentId)}/application`);
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 404) return null;
            throw cause;
        }
    },

    /** The desk writes the applicant's details for them. */
    updateProfile: (agentId: string, patch: ApplicationProfilePatch): Promise<ApplicationView> =>
        live().patch<ApplicationView>(`/agents/${encodeURIComponent(agentId)}/application/profile`, patch),

    /** A paper the desk uploaded on their behalf (an upload under purpose KYC with the applicant as owner). */
    fileDocument: (agentId: string, kind: AgentDocumentKind, input: FileDocumentInput): Promise<ApplicationView> =>
        live().put<ApplicationView>(`/agents/${encodeURIComponent(agentId)}/application/documents/${kind}`, compact(input)),

    /** Approve, flag, or ask for the paper again — the note reaches the applicant. */
    reviewDocument: (agentId: string, kind: AgentDocumentKind, input: ReviewDocumentInput): Promise<ApplicationView> =>
        live().patch<ApplicationView>(`/agents/${encodeURIComponent(agentId)}/application/documents/${kind}/review`, compact(input)),

    /** The terms were shown at the desk and accepted there; the acceptance names the admin. */
    recordAgreement: (agentId: string): Promise<ApplicationView> =>
        live().post<ApplicationView>(`/agents/${encodeURIComponent(agentId)}/application/agreement`),

    /** Puts the application under review on the applicant's behalf. 409 APPLICATION_INCOMPLETE with what is missing. */
    submit: (agentId: string): Promise<ApplicationView> => live().post<ApplicationView>(`/agents/${encodeURIComponent(agentId)}/application/submit`),

    /** Activate (with the grade and the engagement), reject, hold, or resume. */
    decide: (agentId: string, input: DecisionInput): Promise<ApplicationView> =>
        live().post<ApplicationView>(`/agents/${encodeURIComponent(agentId)}/application/decision`, compact(input)),

    /** The grade may move at renewal without a fresh decision. */
    setGrade: (agentId: string, input: GradeInput): Promise<ApplicationView> =>
        live().patch<ApplicationView>(`/agents/${encodeURIComponent(agentId)}/grade`, compact(input)),

    /** Ends the engagement. The profile stays for the record; work stops at once. */
    exit: (agentId: string, input: ExitInput): Promise<ApplicationView> =>
        live().post<ApplicationView>(`/agents/${encodeURIComponent(agentId)}/exit`, compact(input)),

    /* ── AG-4: screening and verification ── */

    /** The desk books an interview; the applicant is told the slot. */
    scheduleInterview: (agentId: string, input: InterviewInput): Promise<ApplicationView> =>
        live().post<ApplicationView>(`/agents/${encodeURIComponent(agentId)}/application/interviews`, compact(input)),

    /** The outcome, with marks out of five when it was held. */
    recordInterview: (agentId: string, interviewId: string, input: InterviewOutcomeInput): Promise<ApplicationView> =>
        live().patch<ApplicationView>(`/agents/${encodeURIComponent(agentId)}/application/interviews/${encodeURIComponent(interviewId)}`, compact(input)),

    /** The desk's tick: screened, with a note; `clear` takes it back. */
    screen: (agentId: string, input: { note?: string; clear?: boolean }): Promise<ApplicationView> =>
        live().post<ApplicationView>(`/agents/${encodeURIComponent(agentId)}/application/screen`, compact(input)),

    /** Cashfree's vehicle-RC lookup on the filed VEHICLE_RC, stamped on the paper with the owner-name match. 409 VERIFICATION_UNAVAILABLE when it could not run. */
    verifyVehicleRc: (agentId: string): Promise<ApplicationView & { verification: { via: string; nameMatch: number | null; facts: Record<string, unknown> } }> =>
        live().post(`/agents/${encodeURIComponent(agentId)}/application/documents/VEHICLE_RC/verify`),

    /** The paper-expiry sweep, run by hand. */
    runExpirySweep: (): Promise<{ considered: number; reminded: number; expired: number; held: number }> =>
        live().post(`/agents/applications/expiry-sweep`),
};

/* ── AG-5: routing by grade, fleet partners ─────────────────────────────── */

export type PartyBand = "INDIVIDUAL" | "SMALL_AGENCY" | "LARGE_AGENCY";
export type LeadBand = "STANDARD" | "KEY" | "ENTERPRISE";

export interface RoutingSettings {
    bands: Record<PartyBand, AgentGrade>;
    leadBands: Record<LeadBand, AgentGrade>;
    /** Off: the band is advice — dispatch prefers the grade but offers to anyone. */
    enforce: boolean;
}

export const PARTY_BAND_LABEL: Record<PartyBand, string> = { INDIVIDUAL: "Individual / small publisher", SMALL_AGENCY: "Smaller agency", LARGE_AGENCY: "Large agency / media owner" };
export const LEAD_BAND_LABEL: Record<LeadBand, string> = { STANDARD: "Standard lead", KEY: "Key lead", ENTERPRISE: "Enterprise lead" };
export const PARTY_BANDS: PartyBand[] = ["INDIVIDUAL", "SMALL_AGENCY", "LARGE_AGENCY"];
export const LEAD_BANDS: LeadBand[] = ["STANDARD", "KEY", "ENTERPRISE"];

export type FleetPlatform = AgentPlatform;

export interface FleetPartner {
    id: string;
    name: string;
    platform: FleetPlatform | string;
    contactName: string | null;
    phone: string | null;
    email: string | null;
    city: string | null;
    notes: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    /** Absent on the create and the patch answers; the list and the detail carry it. */
    invites?: { sent: number; applied: number; activated: number };
}

export type FleetInviteStatus = "SENT" | "APPLIED" | "ACTIVATED";

export interface FleetInvite {
    id: string;
    mobile: string;
    name: string | null;
    status: FleetInviteStatus;
    sentAt: string;
    appliedAt: string | null;
    agent: { id: string; displayId: string | null; stage: string; user: { name: string | null } } | null;
}

export const FLEET_INVITE_META: Record<FleetInviteStatus, StatusMeta> = {
    SENT: { label: "Invited", tone: "neutral" },
    APPLIED: { label: "Applied", tone: "info" },
    ACTIVATED: { label: "Activated", tone: "success" },
};

export interface FleetPartnerInput {
    name: string;
    platform: FleetPlatform;
    contactName?: string;
    phone?: string;
    email?: string;
    city?: string;
    notes?: string;
}

export interface FleetInviteResult {
    invited: number;
    duplicates: number;
    rejected: { mobile: string; reason: string }[];
    sent: number;
    invites: FleetInvite[];
}

/** "9000000001, Ravi" per line, or just the number — as ops pastes it from the partner's sheet. */
export function parseInviteRows(text: string): { mobile: string; name?: string }[] {
    return text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const [mobile, ...rest] = line.split(/[,\t;]/).map((part) => part.trim());
            const name = rest.filter(Boolean).join(" ");
            return name ? { mobile: mobile ?? "", name } : { mobile: mobile ?? "" };
        })
        .filter((row) => row.mobile.length > 0);
}

export const agentRoutingService = {
    get: (): Promise<RoutingSettings> => live().get<RoutingSettings>("/agents/routing-settings"),
    save: (input: RoutingSettings): Promise<RoutingSettings> => live().put<RoutingSettings>("/agents/routing-settings", input),
};

export const fleetService = {
    list: (): Promise<FleetPartner[]> => live().get<FleetPartner[]>("/agents/fleet-partners"),
    get: (partnerId: string): Promise<{ partner: FleetPartner; invites: FleetInvite[] }> =>
        live().get(`/agents/fleet-partners/${encodeURIComponent(partnerId)}`),
    create: (input: FleetPartnerInput): Promise<FleetPartner> => live().post<FleetPartner>("/agents/fleet-partners", compact(input)),
    update: (partnerId: string, input: Partial<FleetPartnerInput> & { isActive?: boolean }): Promise<FleetPartner> =>
        live().patch<FleetPartner>(`/agents/fleet-partners/${encodeURIComponent(partnerId)}`, compact(input)),
    invite: (partnerId: string, rows: { mobile: string; name?: string }[]): Promise<FleetInviteResult> =>
        live().post<FleetInviteResult>(`/agents/fleet-partners/${encodeURIComponent(partnerId)}/invites`, { rows }),
};
