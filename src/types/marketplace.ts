import type { StatusMeta } from "./common";

/* ------------------------------------------------------------------ */
/* Listings (ad spaces)                                                */
/* ------------------------------------------------------------------ */

/*
 * The fixture `Listing` — five lower-case statuses, a `monthlyRate`, a
 * `sizeFt` — is gone. The API's listing has ten statuses and is priced per
 * day; `services/listings.ts` holds that vocabulary (`WireListing`,
 * `AdminListing`, `listingStatusLabel`, `LISTING_STATUS_TONE`), and every
 * screen that draws a listing reads it from there. The last page typed to
 * the fixture indexed a status badge with "ACTIVE" against a record keyed
 * "live", and went down for it.
 */

/* ------------------------------------------------------------------ */
/* Campaigns                                                           */
/* ------------------------------------------------------------------ */

/*
 * The fixture campaign — six lower-case statuses and a row nothing served — is
 * gone. The API's campaign has its own statuses; `services/campaigns.ts` holds
 * that vocabulary (`CampaignStatus`, `CAMPAIGN_STATUS_TONE`,
 * `campaignStatusLabel`) and the campaigns screens read it from there.
 */

/* ------------------------------------------------------------------ */
/* Orders (field work routed to agents)                                */
/* ------------------------------------------------------------------ */

/**
 * Order status, exactly the backend's `OrderStatus` enum.
 *
 * This used to be seven statuses of the console's own invention — "awaiting
 * acceptance", "proof review", "failed" — which described a field-work board
 * rather than the thing the backend actually runs. An order on ADX is an
 * advertiser booking a listing, and its lifecycle has fourteen states because
 * two counterparties and an agent each get to accept, decline or counter.
 *
 * Keeping a second vocabulary would have meant translating at the boundary
 * forever, and a translation is where a state quietly becomes the wrong state.
 * The console speaks the backend's names now, and the fixtures were rewritten
 * onto them.
 */
export type OrderStatus =
    | "DRAFT"
    | "PENDING_PUBLISHER"
    | "PUBLISHER_REJECTED"
    | "PENDING_PRINT"
    | "SELF_INSTALL"
    | "PENDING_AGENT"
    | "AGENT_REJECTED"
    | "SLOT_PROPOSED"
    | "SLOT_CONFIRMED"
    | "IN_PROGRESS"
    | "PENDING_OTP"
    | "PENDING_APPROVAL"
    | "COMPLETED"
    | "CANCELLED";

/**
 * What each state is called on screen.
 *
 * Named for whoever is being waited on, because that is the question an
 * operator opens this board to answer. "Pending publisher" says nothing about
 * whose desk it is on; "Awaiting publisher" does.
 */
export const ORDER_STATUS_META: Record<OrderStatus, StatusMeta> = {
    DRAFT: { label: "Draft", tone: "neutral" },
    PENDING_PUBLISHER: { label: "Awaiting publisher", tone: "warning" },
    PUBLISHER_REJECTED: { label: "Publisher declined", tone: "danger" },
    PENDING_PRINT: { label: "Awaiting prints", tone: "warning" },
    SELF_INSTALL: { label: "Publisher installing", tone: "info" },
    PENDING_AGENT: { label: "Awaiting agent", tone: "warning" },
    AGENT_REJECTED: { label: "Agent declined", tone: "danger" },
    SLOT_PROPOSED: { label: "Slot proposed", tone: "info" },
    SLOT_CONFIRMED: { label: "Slot confirmed", tone: "info" },
    IN_PROGRESS: { label: "Install underway", tone: "info" },
    PENDING_OTP: { label: "Awaiting completion code", tone: "warning" },
    PENDING_APPROVAL: { label: "Awaiting ADX approval", tone: "warning" },
    COMPLETED: { label: "Completed", tone: "success" },
    CANCELLED: { label: "Cancelled", tone: "neutral" },
};

/**
 * Board columns for the order pipeline.
 *
 * A column is a phase, not a status: fourteen columns would be a spreadsheet.
 * Every status belongs to exactly one column, and `ORDER_STAGE_OF` below is
 * generated from this so the two cannot disagree.
 */
export const ORDER_PIPELINE_STAGES: {
    id: string;
    title: string;
    statuses: OrderStatus[];
}[] = [
    { id: "publisher", title: "With the publisher", statuses: ["DRAFT", "PENDING_PUBLISHER"] },
    {
        id: "scheduling",
        title: "Prints & scheduling",
        statuses: ["PENDING_PRINT", "PENDING_AGENT", "SLOT_PROPOSED", "SLOT_CONFIRMED"],
    },
    {
        id: "install",
        title: "Installing",
        statuses: ["SELF_INSTALL", "IN_PROGRESS", "PENDING_OTP"],
    },
    { id: "approval", title: "Awaiting ADX", statuses: ["PENDING_APPROVAL"] },
    { id: "done", title: "Completed", statuses: ["COMPLETED"] },
    {
        id: "stopped",
        title: "Not proceeding",
        statuses: ["PUBLISHER_REJECTED", "AGENT_REJECTED", "CANCELLED"],
    },
];

/** Which board column a status sits in. Derived, so a new status cannot be
 *  added to the enum and quietly vanish from the board. */
export const ORDER_STAGE_OF: Record<OrderStatus, string> = Object.fromEntries(
    ORDER_PIPELINE_STAGES.flatMap((stage) => stage.statuses.map((status) => [status, stage.id]))
) as Record<OrderStatus, string>;

export interface Order {
    id: string;
    status: OrderStatus;
    /** The listing's title, joined by the API. */
    listing: string;
    /**
     * The spot's own id, for grouping orders by site and linking to
     * `/listings/[id]`. Null on the seeded rows: their titles name spots the
     * backend never issued an id for, and a made-up one would 404.
     */
    listingId: string | null;
    city: string | null;
    /** Free text the advertiser typed, not a link to a campaign record —
     *  there is no campaign table. */
    campaignName: string | null;
    /** The assigned agent's name, when one is on it. */
    agent: string | null;
    agentId: string | null;
    /**
     * What the advertiser committed, in rupees.
     *
     * A number rather than a decimal string because the column behind it is
     * still `Float` — the one money field on the API that has not moved. Every
     * other amount the console reads is a string.
     */
    budget: number | null;
    startDate: string | null;
    endDate: string | null;
    /** The agreed install time, once both sides have settled on one. */
    slotTime: string | null;
    createdAt: string;
    /**
     * Lot B (Q102): what the accepted agent will be paid for the install, as
     * a decimal string — copied onto the offer when it was made so a rate
     * change cannot re-price the job. Null until an offer is accepted, and
     * on the list rows and the seeded orders, which never carried one.
     */
    quotedFee?: string | null;
    /** Lot B (Q3): the per-order fee ops typed, read only while the platform is on PER_ORDER. */
    agentFeeAmount?: string | null;
    /**
     * Lot D (Q51/Q90): the stamps the ops overrides are gated on. Detail read
     * only; absent on the list rows and the seeded orders. The order page
     * decides which override to offer from these and from `status`, never
     * from a guess.
     */
    /** When the publisher's 30-minute window closes; null once answered. */
    publisherTimerExpiry?: string | null;
    /** When the agent put the current slot on the table. */
    slotProposedAt?: string | null;
    /** The agent's site check-in, when there is one. */
    checkedInAt?: string | null;
    /** Three refusals; ops were alerted rather than the assigner cycling on. */
    agentEscalated?: boolean;
    cancelledAt?: string | null;
    /** Lot D (Q51): written by the cancel route on its own column, never over the brief. */
    cancellationReason?: string | null;
    /** Every offer the order has made, newest first. Detail read only. */
    offers?: OrderOffer[];
    /**
     * Lot H (Q147): what the spot is, as the listing join carries it — the
     * size the publisher typed, the measured feet, the category and sub-type
     * (the material a print shop quotes on) and the placement. Detail read
     * only; what a quote request's specs are prefilled from.
     */
    spot?: OrderSpot | null;
    /** The artwork the advertiser attached, when any — a URL on the order row. Detail read only. */
    designUrl?: string | null;
}

/** The listing's own description of the surface, for the print shop. */
export interface OrderSpot {
    size: string | null;
    /** Feet, as decimal strings. */
    widthFt: string | null;
    heightFt: string | null;
    category: string;
    subType: string | null;
    placement: string | null;
}

/** One offer the order made to an agent — an `OrderAgentAssignment`, with the agent named. */
export interface OrderOffer {
    id: string;
    agentId: string;
    agentName: string;
    /** REASSIGNED is ops moving the order on; not a refusal, no strike. */
    status: "PENDING" | "ACCEPTED" | "REJECTED" | "REASSIGNED";
    /** The coded reason, `OTHER: <note>`, or EXPIRED for silence. */
    rejectionReason: string | null;
    offeredAt: string;
    respondedAt: string | null;
    /** Decimal string, as quoted on the offer. */
    quotedFee: string | null;
}

