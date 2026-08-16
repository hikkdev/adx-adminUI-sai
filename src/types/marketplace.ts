import type { StatusMeta } from "./common";

/* ------------------------------------------------------------------ */
/* Listings (ad spaces)                                                */
/* ------------------------------------------------------------------ */

export type ListingStatus =
    | "pending_review"
    | "live"
    | "paused"
    | "rejected"
    | "draft";

export const LISTING_STATUS_META: Record<ListingStatus, StatusMeta> = {
    pending_review: { label: "Pending review", tone: "warning" },
    live: { label: "Live", tone: "success" },
    paused: { label: "Paused", tone: "neutral" },
    rejected: { label: "Rejected", tone: "danger" },
    draft: { label: "Draft", tone: "neutral" },
};

export type ListingType =
    | "Hoarding"
    | "Digital screen"
    | "Transit"
    | "Wall wrap"
    | "Gantry"
    | "Mall media";

export interface Listing {
    id: string;
    title: string;
    publisher: string;
    publisherId: string;
    type: ListingType;
    city: string;
    location: string;
    sizeFt: string;
    monthlyRate: number;
    status: ListingStatus;
    submittedAt: string;
    photos: number;
    facing?: string;
    litType?: "Front-lit" | "Back-lit" | "Digital" | "Non-lit";
}

/* ------------------------------------------------------------------ */
/* Campaigns                                                           */
/* ------------------------------------------------------------------ */

export type CampaignStatus =
    | "awaiting_approval"
    | "live"
    | "scheduled"
    | "paused"
    | "completed"
    | "rejected";

export const CAMPAIGN_STATUS_META: Record<CampaignStatus, StatusMeta> = {
    awaiting_approval: { label: "Awaiting approval", tone: "warning" },
    live: { label: "Live", tone: "success" },
    scheduled: { label: "Scheduled", tone: "info" },
    paused: { label: "Paused", tone: "neutral" },
    completed: { label: "Completed", tone: "neutral" },
    rejected: { label: "Rejected", tone: "danger" },
};

export interface Campaign {
    id: string;
    name: string;
    advertiser: string;
    advertiserId: string;
    objective: string;
    budget: number;
    spent: number;
    listings: number;
    cities: string[];
    startDate: string;
    endDate: string;
    status: CampaignStatus;
    submittedAt: string;
}

/* ------------------------------------------------------------------ */
/* Orders (field work routed to agents)                                */
/* ------------------------------------------------------------------ */

export type OrderStatus =
    | "awaiting_acceptance"
    | "accepted"
    | "scheduled"
    | "in_progress"
    | "proof_review"
    | "completed"
    | "failed";

export const ORDER_STATUS_META: Record<OrderStatus, StatusMeta> = {
    awaiting_acceptance: { label: "Awaiting agent acceptance", tone: "warning" },
    accepted: { label: "Accepted", tone: "info" },
    scheduled: { label: "Scheduled", tone: "info" },
    in_progress: { label: "In progress", tone: "info" },
    proof_review: { label: "Proof review", tone: "warning" },
    completed: { label: "Completed", tone: "success" },
    failed: { label: "Failed", tone: "danger" },
};

/** Kanban stages for the order pipeline board, in column order. */
export const ORDER_PIPELINE_STAGES: { id: OrderStatus; title: string }[] = [
    { id: "awaiting_acceptance", title: "Awaiting acceptance" },
    { id: "accepted", title: "Accepted" },
    { id: "in_progress", title: "In progress" },
    { id: "proof_review", title: "Proof review" },
    { id: "completed", title: "Done" },
];

export type OrderPriority = "low" | "normal" | "high" | "urgent";

export const ORDER_PRIORITY_META: Record<OrderPriority, StatusMeta> = {
    low: { label: "Low", tone: "neutral" },
    normal: { label: "Normal", tone: "neutral" },
    high: { label: "High", tone: "warning" },
    urgent: { label: "Urgent", tone: "danger" },
};

export type OrderType =
    | "Print pickup"
    | "Install"
    | "Site survey"
    | "Maintenance"
    | "Takedown"
    | "Proof audit";

export interface Order {
    id: string;
    number: number;
    type: OrderType;
    listing: string;
    city: string;
    campaign?: string;
    agent?: string;
    agentId?: string;
    priority: OrderPriority;
    due: string;
    status: OrderStatus;
    payout: number;
    createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Bookings (a campaign occupying a listing for a period)              */
/* ------------------------------------------------------------------ */

export type BookingStatus =
    | "confirmed"
    | "pending_payment"
    | "active"
    | "completed"
    | "cancelled";

export const BOOKING_STATUS_META: Record<BookingStatus, StatusMeta> = {
    confirmed: { label: "Confirmed", tone: "info" },
    pending_payment: { label: "Pending payment", tone: "warning" },
    active: { label: "Active", tone: "success" },
    completed: { label: "Completed", tone: "neutral" },
    cancelled: { label: "Cancelled", tone: "danger" },
};

export interface Booking {
    id: string;
    campaign: string;
    advertiser: string;
    listing: string;
    publisher: string;
    city: string;
    startDate: string;
    endDate: string;
    value: number;
    status: BookingStatus;
    bookedAt: string;
}
