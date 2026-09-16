import { api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { formatDateTime } from "@/lib/format";
import {
    FULFILMENT_REQUIREMENT_KINDS,
    type FulfilmentPlan,
    type FulfilmentRequirement,
    type FulfilmentRequirementKind,
    type FulfilmentTemplate,
    type MilestoneType,
    type StatusMeta,
} from "@/types";

/**
 * An order's milestones, as ops sees them — the per-order checklist the
 * agents work through, and since A12 the offer on each visit.
 *
 * Wired to `/orders/:orderId/milestones` and `/milestone-templates`. There
 * was no console view of this at all: a visit reached an advertiser-side
 * agent only by a PATCH nobody could send from a screen. This is the view,
 * and the two things ops does with it — dispatch a step to an agent, and skip
 * one — plus adding a step from a template.
 *
 * Since D9 it is also the templates and plans themselves: `/flows/templates`
 * reads `GET /milestone-templates` and `GET /milestone-plans` and writes back
 * through the same module, instead of drawing six seeded templates no order
 * could ever be issued.
 */

export type MilestoneStatus = "PENDING" | "DISPATCHED" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";

export interface WireMilestone {
    id: string;
    orderId: string;
    templateId: string;
    assignedAgentId: string | null;
    status: MilestoneStatus;
    order: number;
    isOptional: boolean;
    dueDate: string | null;
    notes: string | null;
    startedAt: string | null;
    completedAt: string | null;
    offeredAt?: string | null;
    offerExpiresAt?: string | null;
    acceptedAt?: string | null;
    rejectionReason?: string | null;
    scheduledStart?: string | null;
    scheduledEnd?: string | null;
    template: { id: string; title: string; type: string; estimatedDurationMins?: number | null };
    assignedAgent?: { id: string; displayId?: string | null; user?: { name: string | null; mobile: string } | null } | null;
    evidence?: { id: string; kind: string; label: string | null; value: string }[];
}

/**
 * A template as the API sends it. `requirements` is a loose JSON column and
 * arrives as whatever was stored; `parseRequirements` reads it. The last
 * three are optional on the wire only so a row embedded in a milestone's
 * `template` join — which selects fewer columns — still types.
 */
export interface WireMilestoneTemplate {
    id: string;
    title: string;
    type: string;
    description: string | null;
    isActive: boolean;
    requirements?: unknown;
    estimatedDurationMins?: number | null;
    createdAt?: string;
    updatedAt?: string;
}

export interface WireMilestonePlanItem {
    id?: string;
    planId?: string;
    templateId: string;
    order: number;
    isOptional: boolean;
    /** Joined on every read; absent on the row `POST /milestone-plans` answers with. */
    template?: WireMilestoneTemplate | null;
}

export interface WireMilestonePlan {
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
    createdAt?: string;
    updatedAt?: string;
    /** Absent straight off POST, which creates the plan with no items yet. */
    items?: WireMilestonePlanItem[];
}

/* ------------------------------------------------------------------ */
/* Templates and plans, as the screen draws them                       */
/* ------------------------------------------------------------------ */

const REQUIREMENT_KINDS = new Set<string>(FULFILMENT_REQUIREMENT_KINDS);

/**
 * The JSON column, read the way the backend reads it.
 *
 * Rows that do not parse are dropped rather than thrown on — the backend's
 * `parseRequirements` does the same so an unreadable requirement cannot make
 * an existing milestone impossible to complete, and a card here that crashed
 * on one bad row would hide every other template with it. A blank label is
 * one of those rows: the agent app drops it too, so nothing would ever ask
 * for it.
 */
export function parseRequirements(raw: unknown): FulfilmentRequirement[] {
    if (!Array.isArray(raw)) return [];
    const parsed: FulfilmentRequirement[] = [];
    for (const row of raw) {
        if (typeof row !== "object" || row === null) continue;
        const { kind, label, optional } = row as { kind?: unknown; label?: unknown; optional?: unknown };
        if (typeof kind !== "string" || !REQUIREMENT_KINDS.has(kind)) continue;
        if (kind === "photo" || kind === "checklist_item") {
            if (typeof label !== "string" || label.trim().length === 0) continue;
            parsed.push(optional === true ? { kind, label, optional: true } : { kind, label });
            continue;
        }
        parsed.push({ kind: kind as Exclude<FulfilmentRequirementKind, "photo" | "checklist_item"> });
    }
    return parsed;
}

export function shapeTemplate(wire: WireMilestoneTemplate): FulfilmentTemplate {
    return {
        id: wire.id,
        title: wire.title,
        description: wire.description ?? null,
        // A Prisma enum: nothing outside the six can come off the wire.
        type: wire.type as MilestoneType,
        requirements: parseRequirements(wire.requirements),
        estimatedDurationMins: wire.estimatedDurationMins ?? null,
        isActive: wire.isActive,
        updatedAt: wire.updatedAt ?? null,
    };
}

export function shapePlan(wire: WireMilestonePlan): FulfilmentPlan {
    const items = [...(wire.items ?? [])]
        .sort((a, b) => a.order - b.order)
        .map((item) => ({
            templateId: item.templateId,
            order: item.order,
            optional: item.isOptional,
            title: item.template?.title ?? null,
            templateActive: item.template ? item.template.isActive : null,
        }));
    return {
        id: wire.id,
        name: wire.name,
        description: wire.description ?? null,
        isActive: wire.isActive,
        items,
    };
}

/** What `POST /milestone-templates` takes. `type` is fixed once created. */
export interface CreateTemplateInput {
    title: string;
    description?: string;
    type: MilestoneType;
    /** At least one — the schema refuses an empty list. */
    requirements: FulfilmentRequirement[];
    estimatedDurationMins?: number;
}

/** What `PATCH /milestone-templates/:id` allows: everything but the type. */
export interface TemplatePatch {
    title?: string;
    description?: string;
    requirements?: FulfilmentRequirement[];
    estimatedDurationMins?: number;
    isActive?: boolean;
}

export interface CreatePlanInput {
    name: string;
    description?: string;
}

export interface PlanPatch {
    name?: string;
    description?: string;
    isActive?: boolean;
}

/** A step as the editor holds it: which template, and whether it may be skipped. */
export interface PlanStepInput {
    templateId: string;
    optional: boolean;
}

/**
 * The body `PUT /milestone-plans/:id/items` takes.
 *
 * Numbered from one in the order given: the server refuses duplicate orders
 * and the plan's unique index is on (planId, order), so the editor's list
 * order is the only source of the number and nothing else is asked to keep
 * it consistent.
 */
export function planItemsBody(steps: PlanStepInput[]): {
    items: { templateId: string; order: number; isOptional: boolean }[];
} {
    return {
        items: steps.map((step, index) => ({
            templateId: step.templateId,
            order: index + 1,
            isOptional: step.optional,
        })),
    };
}

/** Where the step is, folding the status and the offer into one word. */
export type OfferState =
    | "unassigned"
    | "offered"
    | "expired"
    | "declined"
    | "accepted"
    | "scheduled"
    | "working"
    | "done"
    | "skipped";

export const OFFER_STATE_META: Record<OfferState, StatusMeta> = {
    unassigned: { label: "Needs an agent", tone: "warning" },
    offered: { label: "Offered", tone: "info" },
    expired: { label: "Offer expired", tone: "danger" },
    declined: { label: "Declined", tone: "danger" },
    accepted: { label: "Accepted", tone: "success" },
    scheduled: { label: "Scheduled", tone: "success" },
    working: { label: "In progress", tone: "info" },
    done: { label: "Done", tone: "success" },
    skipped: { label: "Skipped", tone: "neutral" },
};

export interface MilestoneView {
    id: string;
    step: number;
    title: string;
    type: string;
    status: MilestoneStatus;
    optional: boolean;
    agentId: string | null;
    agentName: string | null;
    state: OfferState;
    /** When the open offer runs out, formatted; null unless offered. */
    expiresAt: string | null;
    /** The coded reason a visit came back, or EXPIRED. */
    declinedFor: string | null;
    /** The confirmed band, formatted, or the due date. */
    when: string | null;
    evidence: number;
}

export function offerStateOf(row: WireMilestone, now: Date = new Date()): OfferState {
    switch (row.status) {
        case "SKIPPED":
            return "skipped";
        case "COMPLETED":
            return "done";
        case "IN_PROGRESS":
            return "working";
        case "PENDING":
            return row.rejectionReason ? (row.rejectionReason === "EXPIRED" ? "expired" : "declined") : "unassigned";
        default: {
            if (row.acceptedAt) return row.scheduledStart ? "scheduled" : "accepted";
            if (!row.offerExpiresAt) return "accepted";
            return new Date(row.offerExpiresAt).getTime() < now.getTime() ? "expired" : "offered";
        }
    }
}

export function shapeMilestone(row: WireMilestone, now: Date = new Date()): MilestoneView {
    const state = offerStateOf(row, now);
    const agent = row.assignedAgent ?? null;
    const when = row.scheduledStart ?? row.dueDate;
    return {
        id: row.id,
        step: row.order,
        title: row.template.title,
        type: row.template.type,
        status: row.status,
        optional: row.isOptional,
        agentId: row.assignedAgentId,
        agentName: agent ? (agent.user?.name ?? agent.displayId ?? agent.user?.mobile ?? null) : null,
        state,
        expiresAt: state === "offered" && row.offerExpiresAt ? formatDateTime(row.offerExpiresAt) : null,
        declinedFor: row.status === "PENDING" ? (row.rejectionReason ?? null) : null,
        when: when ? formatDateTime(when) : null,
        evidence: row.evidence?.length ?? 0,
    };
}

/**
 * Refuses to talk to the API while orders are off.
 *
 * Templates and plans belong to the orders domain — a template is only ever
 * a step on an order — so they read the same flag. The reads that sit inside
 * the order page (`forOrder`, `templates`) answer empty instead, because that
 * page still renders with fixtures around them; the templates screen has no
 * fixtures and says so.
 */
function live() {
    if (!isLive("orders")) throw new Error("Orders still read fixtures; wire the domain before writing.");
    return http;
}

export const milestoneService = {
    forOrder: async (orderId: string): Promise<MilestoneView[]> => {
        if (!isLive("orders")) return [];
        const rows = await http.get<WireMilestone[]>(`/orders/${orderId}/milestones`);
        return rows.map((row) => shapeMilestone(row));
    },

    /** The active templates only — what an order may have added to it. */
    templates: async (): Promise<WireMilestoneTemplate[]> =>
        isLive("orders") ? http.get<WireMilestoneTemplate[]>("/milestone-templates?isActive=true") : [],

    /* ── D9: the templates screen ─────────────────────────────────── */

    /** Every template, inactive ones included: the screen shows and flips them. */
    allTemplates: async (): Promise<FulfilmentTemplate[]> =>
        (await live().get<WireMilestoneTemplate[]>("/milestone-templates")).map(shapeTemplate),

    createTemplate: async (input: CreateTemplateInput): Promise<FulfilmentTemplate> =>
        shapeTemplate(await live().post<WireMilestoneTemplate>("/milestone-templates", input)),

    patchTemplate: async (templateId: string, patch: TemplatePatch): Promise<FulfilmentTemplate> =>
        shapeTemplate(await live().patch<WireMilestoneTemplate>(`/milestone-templates/${templateId}`, patch)),

    plans: async (): Promise<FulfilmentPlan[]> =>
        (await live().get<WireMilestonePlan[]>("/milestone-plans")).map(shapePlan),

    plan: async (planId: string): Promise<FulfilmentPlan> =>
        shapePlan(await live().get<WireMilestonePlan>(`/milestone-plans/${planId}`)),

    /** A plan with no steps yet; `setPlanItems` gives it some. */
    createPlan: async (input: CreatePlanInput): Promise<FulfilmentPlan> =>
        shapePlan(await live().post<WireMilestonePlan>("/milestone-plans", input)),

    patchPlan: async (planId: string, patch: PlanPatch): Promise<FulfilmentPlan> =>
        shapePlan(await live().patch<WireMilestonePlan>(`/milestone-plans/${planId}`, patch)),

    /**
     * Replaces the chain wholesale. The server checks every step — unknown
     * or inactive templates, duplicate orders — before writing anything, then
     * rebuilds in one transaction, and answers with the plan re-read.
     */
    setPlanItems: async (planId: string, steps: PlanStepInput[]): Promise<FulfilmentPlan> =>
        shapePlan(await live().put<WireMilestonePlan>(`/milestone-plans/${planId}/items`, planItemsBody(steps))),

    add: (orderId: string, templateId: string) =>
        live().post<WireMilestone>(`/orders/${orderId}/milestones`, { templateId }),

    /**
     * To the agent already holding the order this is theirs at once; to anyone
     * else it is an offer with the 25-minute clock (A12).
     */
    dispatch: (orderId: string, milestoneId: string, agentId: string) =>
        live().patch<WireMilestone>(`/orders/${orderId}/milestones/${milestoneId}`, { assignedAgentId: agentId }),

    skip: (orderId: string, milestoneId: string) =>
        live().patch<WireMilestone>(`/orders/${orderId}/milestones/${milestoneId}`, { status: "SKIPPED" }),
};
