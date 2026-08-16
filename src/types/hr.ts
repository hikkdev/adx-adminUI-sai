import type { StatusMeta } from "./common";

/* ----------------------------------------------------------------- */
/* Employees HR module (ported from the ADX-AdminUI employees pages)  */
/* ----------------------------------------------------------------- */

export type EmployeeType = "office" | "remote" | "field";

export const EMPLOYEE_TYPE_META: Record<EmployeeType, StatusMeta> = {
    office: { label: "Office", tone: "info" },
    remote: { label: "Remote", tone: "neutral" },
    field: { label: "Field", tone: "warning" },
};

export type EmploymentStatus = "permanent" | "contract" | "part_time" | "probation";

export const EMPLOYMENT_STATUS_META: Record<EmploymentStatus, StatusMeta> = {
    permanent: { label: "Permanent", tone: "success" },
    contract: { label: "Contract", tone: "info" },
    part_time: { label: "Part time", tone: "neutral" },
    probation: { label: "Probation", tone: "warning" },
};

export interface Employee {
    id: string;
    name: string;
    employeeCode: string;
    email: string;
    officialEmail: string;
    mobile: string;
    department: string;
    designation: string;
    type: EmployeeType;
    employment: EmploymentStatus;
    dob: string;
    joiningDate: string;
    location: string;
    region: string;
    workingDays: number;
    gender: string;
    maritalStatus: string;
    nationality: string;
    address: string;
    documents: { label: string; file: string; uploaded: string }[];
    accounts: { label: string; value: string }[];
}

export interface Department {
    slug: string;
    name: string;
    head: string;
    headcount: number;
    openRoles: number;
    description: string;
}

export type AttendanceStatus = "on_time" | "late" | "absent" | "half_day" | "wfh";

export const ATTENDANCE_STATUS_META: Record<AttendanceStatus, StatusMeta> = {
    on_time: { label: "On time", tone: "success" },
    late: { label: "Late", tone: "warning" },
    absent: { label: "Absent", tone: "danger" },
    half_day: { label: "Half day", tone: "info" },
    wfh: { label: "Work from home", tone: "neutral" },
};

export interface AttendanceRecord {
    id: string;
    employee: string;
    designation: string;
    department: string;
    date: string;
    checkIn: string;
    checkOut: string;
    workHours: string;
    status: AttendanceStatus;
}

export type LeaveStatus = "pending" | "approved" | "rejected";

export const LEAVE_STATUS_META: Record<LeaveStatus, StatusMeta> = {
    pending: { label: "Pending", tone: "warning" },
    approved: { label: "Approved", tone: "success" },
    rejected: { label: "Rejected", tone: "danger" },
};

export interface LeaveRequest {
    id: string;
    employee: string;
    department: string;
    leaveType: string;
    from: string;
    to: string;
    days: number;
    reason: string;
    status: LeaveStatus;
    approver: string;
}

export interface Holiday {
    date: string;
    day: string;
    name: string;
    kind: "public" | "optional";
}

export type PayrollStatus = "paid" | "pending" | "on_hold";

export const PAYROLL_STATUS_META: Record<PayrollStatus, StatusMeta> = {
    paid: { label: "Paid", tone: "success" },
    pending: { label: "Pending", tone: "warning" },
    on_hold: { label: "On hold", tone: "danger" },
};

export interface PayrollRow {
    id: string;
    employee: string;
    designation: string;
    department: string;
    ctc: number;
    gross: number;
    deductions: number;
    netPay: number;
    payDate: string;
    status: PayrollStatus;
}

export type JobStatus = "open" | "on_hold" | "closed";

export const JOB_STATUS_META: Record<JobStatus, StatusMeta> = {
    open: { label: "Open", tone: "success" },
    on_hold: { label: "On hold", tone: "warning" },
    closed: { label: "Closed", tone: "neutral" },
};

export interface JobOpening {
    id: string;
    title: string;
    department: string;
    location: string;
    workType: string;
    openings: number;
    applicants: number;
    postedOn: string;
    salaryBand: string;
    status: JobStatus;
    tags: string[];
}

export type CandidateStage =
    | "applied"
    | "screening"
    | "interview"
    | "offer"
    | "hired"
    | "rejected";

export const CANDIDATE_STAGE_META: Record<CandidateStage, StatusMeta> = {
    applied: { label: "Applied", tone: "neutral" },
    screening: { label: "Screening", tone: "info" },
    interview: { label: "Interview", tone: "warning" },
    offer: { label: "Offer", tone: "info" },
    hired: { label: "Hired", tone: "success" },
    rejected: { label: "Rejected", tone: "danger" },
};

export interface Candidate {
    id: string;
    name: string;
    role: string;
    department: string;
    stage: CandidateStage;
    appliedOn: string;
    email: string;
    mobile: string;
    experience: string;
}

export interface HrOverview {
    attendanceSplit: { label: string; value: number }[];
    /** Stacked workload distribution, ported from the template performance chart. */
    performanceTrend: { label: string; low: number; medium: number; high: number }[];
}
