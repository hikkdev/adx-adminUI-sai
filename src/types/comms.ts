import type { StatusMeta } from "./common";

/* ------------------------------------------------------------------ */
/* Notification templates                                              */
/* ------------------------------------------------------------------ */

export type TemplateChannel = "email" | "sms" | "push";

export const TEMPLATE_CHANNEL_META: Record<TemplateChannel, { label: string; limit?: number }> = {
    email: { label: "Email" },
    sms: { label: "SMS", limit: 160 },
    push: { label: "Push", limit: 120 },
};

export type TemplateStatus = "live" | "draft" | "archived";

export const TEMPLATE_STATUS_META: Record<TemplateStatus, StatusMeta> = {
    live: { label: "Live", tone: "success" },
    draft: { label: "Draft", tone: "warning" },
    archived: { label: "Archived", tone: "neutral" },
};

export type TemplateCategory = "Payouts" | "KYC" | "Orders" | "Disputes" | "Account";

export type TemplateAudience = "publishers" | "advertisers" | "agents" | "employees";

export const TEMPLATE_AUDIENCE_META: Record<TemplateAudience, string> = {
    publishers: "Publishers",
    advertisers: "Advertisers",
    agents: "Field agents",
    employees: "Employees",
};

/** Platform events a template can subscribe to. */
export const TEMPLATE_EVENTS = [
    "payout.scheduled",
    "payout.failed",
    "payout.settled",
    "kyc.approved",
    "kyc.rejected",
    "kyc.reupload_requested",
    "order.assigned",
    "order.proof_uploaded",
    "order.overdue",
    "dispute.raised",
    "dispute.resolved",
    "account.suspended",
] as const;

export type TemplateEvent = (typeof TEMPLATE_EVENTS)[number];

export const CONDITION_FIELDS = [
    "Amount",
    "City",
    "Publisher tier",
    "Order priority",
    "Days overdue",
    "Dispute severity",
    "KYC attempt",
] as const;

export const CONDITION_OPERATORS = [
    "is",
    "is not",
    "is greater than",
    "is less than",
    "is one of",
] as const;

export interface TemplateCondition {
    id: string;
    field: (typeof CONDITION_FIELDS)[number];
    operator: (typeof CONDITION_OPERATORS)[number];
    value: string;
}

export type TemplateDelay = "immediate" | "15m" | "1h" | "24h";

export const TEMPLATE_DELAY_META: Record<TemplateDelay, string> = {
    immediate: "Immediately",
    "15m": "After 15 minutes",
    "1h": "After 1 hour",
    "24h": "After 24 hours",
};

export interface TemplateSending {
    event: TemplateEvent;
    audience: TemplateAudience;
    /** All conditions must hold for the message to go out. */
    conditions: TemplateCondition[];
    delay: TemplateDelay;
    /** Hold sends between 9pm and 8am in the recipient's city. */
    respectQuietHours: boolean;
    /** Maximum sends of this template to one recipient per week. 0 = uncapped. */
    weeklyCap: number;
}

export interface TemplateContent {
    /** Email only. */
    subject?: string;
    /** Push only. */
    title?: string;
    body: string;
}

export interface NotificationTemplate {
    id: string;
    name: string;
    /** When this message fires, in one line. */
    trigger: string;
    category: TemplateCategory;
    status: TemplateStatus;
    updatedAt: string;
    updatedBy: string;
    /** Sends in the last 30 days, across every channel. */
    sent30d: number;
    /** Delivery rate as a percentage, or null when it has never sent. */
    deliveryRate: number | null;
    sending: TemplateSending;
    content: Partial<Record<TemplateChannel, TemplateContent>>;
}

export interface MergeVariable {
    token: string;
    helper: string;
    sample: string;
}
