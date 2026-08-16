import type { StatusMeta } from "./common";

/* ------------------------------------------------------------------ */
/* Rate cards                                                          */
/* ------------------------------------------------------------------ */

export type RateCardStatus = "active" | "scheduled" | "draft" | "archived";

export const RATE_CARD_STATUS_META: Record<RateCardStatus, StatusMeta> = {
    active: { label: "Active", tone: "success" },
    scheduled: { label: "Scheduled", tone: "info" },
    draft: { label: "Draft", tone: "neutral" },
    archived: { label: "Archived", tone: "neutral" },
};

export interface RateCard {
    id: string;
    name: string;
    mediaType: string;
    version: number;
    coverage: string;
    effectiveFrom: string;
    effectiveTo: string;
    sitesPriced: number;
    status: RateCardStatus;
}

/** Weekly base rate per media type × locality grade. `null` = not sold. */
export interface RateMatrixRow {
    mediaType: string;
    premium: number | null;
    gradeA: number | null;
    gradeB: number | null;
    gradeC: number | null;
}

export interface RateCardSettings {
    label: string;
    helper: string;
    value: string;
    toggle?: boolean;
}

/* ------------------------------------------------------------------ */
/* Dimensions & size bands                                             */
/* ------------------------------------------------------------------ */

export interface SizeBand {
    band: string;
    dimensions: string;
    areaRange: string;
    rateBasis: string;
    multiplier: string;
}

export interface FactorRow {
    factor: string;
    multiplier: string;
}

/* ------------------------------------------------------------------ */
/* Category rules                                                      */
/* ------------------------------------------------------------------ */

export type CategoryCell = number | "blocked" | "legal";

export interface CategoryRuleRow {
    category: string;
    static: CategoryCell;
    digital: CategoryCell;
    transit: CategoryCell;
    mall: CategoryCell;
}

/* ------------------------------------------------------------------ */
/* Seasonality & surge                                                 */
/* ------------------------------------------------------------------ */

export type SurgeKind = "uplift" | "soft" | "blocked";

export interface SurgeWindow {
    id: string;
    programme: string;
    cities: string;
    label: string;
    multiplier: string;
    kind: SurgeKind;
    /** 1-based week span within the 12-week strip. */
    fromWeek: number;
    toWeek: number;
}

/* ------------------------------------------------------------------ */
/* Approvals                                                           */
/* ------------------------------------------------------------------ */

export type PriceApprovalStatus = "pending" | "overdue" | "approved" | "rejected";

export const PRICE_APPROVAL_STATUS_META: Record<PriceApprovalStatus, StatusMeta> = {
    pending: { label: "Pending", tone: "warning" },
    overdue: { label: "Overdue", tone: "danger" },
    approved: { label: "Approved", tone: "success" },
    rejected: { label: "Rejected", tone: "danger" },
};

export interface PriceApproval {
    id: string;
    advertiser: string;
    requestedDiscount: string;
    marginImpact: string;
    age: string;
    status: PriceApprovalStatus;
    facts: [string, string][];
    metrics: [string, string][];
    ruleTrace: { rule: string; effect: string; running: string }[];
    checks: { name: string; detail: string; ok: boolean }[];
    similarDeals: { advertiser: string; discount: string; closed: string; margin: string }[];
}

/* ------------------------------------------------------------------ */
/* Rule builder                                                        */
/* ------------------------------------------------------------------ */

export interface RuleCondition {
    id: string;
    field: string;
    operator: string;
    value: string;
}

/* ------------------------------------------------------------------ */
/* Overview widgets                                                    */
/* ------------------------------------------------------------------ */

export interface WeekRealisation {
    week: string;
    cardRate: number;
    realisedRate: number;
}

export interface NamedStatRow {
    name: string;
    detail: string;
    value: string;
    tone?: "positive" | "negative" | "neutral";
}
