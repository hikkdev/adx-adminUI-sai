import type { StatusMeta } from "./common";

/* ------------------------------------------------------------------ */
/* Flow editor — the server's vocabulary (Q83, Q148)                   */
/* ------------------------------------------------------------------ */

/*
 * These are the shapes `GET /config/schema` describes and `PATCH
 * /config/flows/:key` validates, one for one. The console used to carry a
 * vocabulary of its own here — `image_upload`, `section_header`, `phone`, a
 * `slider` — and none of it was anything a phone could render: both apps'
 * `fields.tsx` switch on the twenty-three hyphenated kinds below, and a
 * branch is a Record keyed by the branching option's id rather than a list.
 * A flow saved in the old words would have been refused by the server, and
 * had it been stored, drawn as nothing.
 *
 * Three shapes live under `flows`: a wizard (`listing`, and any key the
 * console adds), the onboarding ladder (`onboarding`) and, since Lot G
 * (Q126/Q141), the step ladder — `agent-job`, the A1–A8 checklist the agent
 * app climbs, and `employee-intake`, the desk's intake ladder — one shape
 * parameterised by the proofs it may collect. The types below are the
 * wire; the vocabulary that says which props a kind may carry is read
 * from the server at runtime rather than duplicated here.
 */

/** One entry of the field-kind catalogue `GET /config/schema` serves. */
export interface FieldKindSpec {
    kind: string;
    label: string;
    /** Whether the field collects an answer. `required` is only allowed on those that do. */
    input: boolean;
    /** Properties this kind reads beyond the common ones. */
    props: string[];
    /** Properties that must be present for the renderer to draw anything. */
    requires: string[];
    note: string;
}

/** `GET /config/schema` — the vocabulary the editor is built from. */
export interface FlowVocabulary {
    flows: {
        wizard: {
            commonProps: string[];
            kinds: FieldKindSpec[];
            computedOps: string[];
            contentScopes: string[];
            rules: string[];
        };
        onboarding: {
            stepKinds: OnboardingStepKind[];
            parties: TemplateParty[];
            accountTypes: TemplateAccountType[];
            kycColumns: KycCaptureColumn[];
            requiredKycColumns: Record<TemplateAccountType, KycCaptureColumn[]>;
            govIdTypes: string[];
            addressProofTypes: string[];
            rules: string[];
        };
        /** Lot G (Q141): the two step ladders, one vocabulary each. Absent from a server one release behind. */
        "agent-job"?: StepLadderVocabulary;
        "employee-intake"?: StepLadderVocabulary;
    };
}

/** The document `GET /config/schema` serves for a step ladder: the proofs it may collect and the ones it must. */
export interface StepLadderVocabulary {
    proofs: string[];
    requiredProofs: string[];
    rules: string[];
    /** G11-1: each proof's name — 'Check in', 'Government ID front', … — in the order of the keys, so the board prints a name, not a column. Absent from a server one release behind. */
    proofOptions?: { key: string; label: string }[];
}

/** `GET /config/flows` — one row per key under `flows`; Lot G lists the four known keys even before they are stored. */
export interface FlowSummary {
    key: string;
    /** 0 for a known key the row does not hold yet. */
    version: number;
    updatedAt: string | null;
    label: string | null;
    /** Q126: the sentence the card prints under the key — a stored one wins over the code's. */
    description?: string | null;
    /** G13-B: who the flow is for ('Publishers', 'Agents', …) — the stored one wins, the code's default for a key not stored yet. */
    audience?: string | null;
    /** `wizard` is screens and branches; `ladder` is the onboarding template; `steps` a step ladder (Q141). */
    shape: "wizard" | "ladder" | "steps";
    /** False for a known key whose flow the row does not hold yet — the code's ladder is what the apps climb. */
    stored?: boolean;
}

/* ── The wizard ───────────────────────────────────────────────────── */

export interface FlowOption {
    id: string;
    title: string;
    description?: string;
}

/**
 * A field as the phone reads it. Every prop past the common seven belongs to
 * one or more kinds — `FieldKindSpec.props` says which — and the server
 * refuses a field carrying a prop its kind does not read.
 */
export interface FlowField {
    id: string;
    type: string;
    label: string;
    required?: boolean;
    placeholder?: string;
    hint?: string;
    description?: string;
    options?: FlowOption[];
    branching?: boolean;
    dependsOn?: string;
    filterByCategory?: boolean;
    groupBy?: string;
    from?: string[];
    op?: string;
    readOnly?: boolean;
    showIndicator?: boolean;
    scope?: string;
    aiAssist?: boolean;
}

export interface FlowScreen {
    key: string;
    title: string;
    subtitle?: string;
    /** The step counter; past `totalSteps` for an unnumbered screen. */
    step: number;
    totalSteps: number;
    /** Printed instead of the counter on an unnumbered screen. */
    badge?: string;
    ctaLabel: string;
    fields: FlowField[];
}

export interface FlowBranch {
    /** Equals its key under `branches`. */
    id: string;
    title: string;
    description: string;
    screens: FlowScreen[];
}

/** A wizard flow as the row holds it. `version` and `updatedAt` are the server's. */
export interface WizardFlow {
    label: string;
    /** Q126: printed under the key on the flow list. */
    description?: string;
    /** G13-B: the card's audience line, 1–80 characters. */
    audience?: string;
    screens: FlowScreen[];
    branches: Record<string, FlowBranch>;
    version?: number;
    updatedAt?: string;
}

/* ── The onboarding ladder ────────────────────────────────────────── */

export type TemplateParty = "PUBLISHER" | "ADVERTISER";
export type TemplateAccountType = "INDIVIDUAL" | "BUSINESS" | "ORGANISATION";

export type KycCaptureColumn =
    | "govIdFrontUrl"
    | "govIdBackUrl"
    | "panFrontUrl"
    | "panSignatureUrl"
    | "addressProofUrl"
    | "selfieUrl"
    | "selfVideoUrl";

export type OnboardingStepKind =
    | "account-type"
    | "form"
    | "kyc-intro"
    | "capture"
    | "checklist"
    | "review"
    | "agreement";

/** `{ field, value }` — which-kind answers a tile sets or is shown for. */
export interface TileCondition {
    field: "govIdType" | "addressProofType";
    value: string;
}

export interface OnboardingTile {
    key: string;
    label: string;
    hint: string;
    /** Where the upload goes. */
    field: KycCaptureColumn;
    source: "library" | "camera";
    front?: boolean;
    pdf?: boolean;
    sets?: TileCondition;
    /** Drawn, not tappable — and not counted as capturing its column. */
    inert?: boolean;
    onlyWhen?: { field: "govIdType"; value: string };
    video?: boolean;
}

interface StepBase {
    key: string;
    title: string;
}

export type OnboardingStep =
    | (StepBase & { kind: "account-type" })
    | (StepBase & { kind: "form"; subtitle: string })
    | (StepBase & { kind: "kyc-intro"; subtitle: string; bands: { label: string; value: string }[]; cta: string })
    | (StepBase & {
          kind: "capture";
          subtitle: string;
          text?: { field: "panNumber"; label: string; hint: string; pattern: string; maxLength: number };
          guidance?: { label: string; hint: string }[];
          documents: OnboardingTile[];
          skippableWhen?: { field: "govIdType"; value: string };
          cta: string;
      })
    | (StepBase & { kind: "checklist"; subtitle: string; cta: string })
    | (StepBase & { kind: "review"; subtitle: string; cta: string })
    | (StepBase & { kind: "agreement"; subtitle: string; cta: string; agreementKey?: string });

export type Ladders = Record<TemplateParty, Record<TemplateAccountType, string[]>>;

/** The ladder as the row holds it: a library of steps and six orderings over it. */
export interface OnboardingTemplate {
    label?: string;
    /** Q126: printed under the key on the flow list. */
    description?: string;
    /** G13-B: the card's audience line, 1–80 characters. */
    audience?: string;
    version?: number;
    updatedAt?: string;
    steps: Record<string, OnboardingStep>;
    ladders: Ladders;
}

/* ── The step ladders (Lot G, Q126/Q141) ──────────────────────────── */

/** One proof a step collects: a key from the ladder's vocabulary and the line the gate prints while it is missing. */
export interface LadderProof {
    key: string;
    label: string;
}

/** One step of a step ladder: the counter in the header, the copy, and the proofs it collects. */
export interface LadderStep {
    /** Unique on the ladder. */
    key: string;
    /** "Step 5 of 8" — two screens may share one. */
    number: number;
    title: string;
    subtitle?: string;
    hint?: string;
    cta?: string;
    /** Empty for a step that only explains. */
    proofs: LadderProof[];
}

/**
 * A step ladder as the row holds it — `agent-job` or `employee-intake`.
 * The server's rules: step keys unique, a proof collected by at most one
 * step, every required proof collected by some step.
 */
export interface StepLadder {
    label?: string;
    description?: string;
    /** G13-B: the card's audience line, 1–80 characters. */
    audience?: string;
    version?: number;
    updatedAt?: string;
    steps: LadderStep[];
}

export type EditableFlow = WizardFlow | OnboardingTemplate | StepLadder;

/* --------------------- Fulfilment templates ----------------------- */

/*
 * The steps field agents complete on an order, as the backend's
 * `order-milestones` module defines them. These used to be fixture-shaped —
 * lower-case types, a numeric `estimatedMins`, an `active` flag — and the
 * screen drew six seeded templates that no order could ever be issued. They
 * are now the wire vocabulary: `OrderMilestoneType` and the requirement kinds
 * of `order-milestones.types.ts`, one for one, nothing the backend does not
 * have.
 */

/** `OrderMilestoneType` — the six kinds of step. Fixed once a template exists. */
export type MilestoneType =
    | "SURVEY"
    | "CREATIVE_COLLECTION"
    | "INSTALLATION"
    | "VERIFICATION"
    | "HEALTH_CHECK"
    | "CUSTOM";

export const MILESTONE_TYPES: readonly MilestoneType[] = [
    "SURVEY",
    "CREATIVE_COLLECTION",
    "INSTALLATION",
    "VERIFICATION",
    "HEALTH_CHECK",
    "CUSTOM",
];

export const FULFILMENT_STEP_TYPE_META: Record<MilestoneType, StatusMeta> = {
    SURVEY: { label: "Survey", tone: "info" },
    CREATIVE_COLLECTION: { label: "Creative collection", tone: "neutral" },
    INSTALLATION: { label: "Installation", tone: "warning" },
    VERIFICATION: { label: "Verification", tone: "success" },
    HEALTH_CHECK: { label: "Health check", tone: "danger" },
    CUSTOM: { label: "Custom", tone: "neutral" },
};

/** The five kinds of proof a template can ask for. */
export type FulfilmentRequirementKind =
    | "photo"
    | "checklist_item"
    | "qr_scan"
    | "location_checkin"
    | "contact_details_visible";

export const FULFILMENT_REQUIREMENT_KINDS: readonly FulfilmentRequirementKind[] = [
    "photo",
    "checklist_item",
    "qr_scan",
    "location_checkin",
    "contact_details_visible",
];

export const FULFILMENT_REQUIREMENT_LABELS: Record<FulfilmentRequirementKind, string> = {
    photo: "Photo",
    checklist_item: "Checklist item",
    qr_scan: "QR scan",
    location_checkin: "Location check-in",
    contact_details_visible: "Contact details visible",
};

/**
 * One requirement, exactly as the backend's `MilestoneRequirement` union.
 *
 * Only the two labelled kinds carry `optional`: a check-in or a QR scan is
 * either the proof the visit rests on or not in the template at all. Absent
 * means mandatory — the agent app's Mandatory/Optional marker reads this flag
 * and nothing else.
 */
export type FulfilmentRequirement =
    | { kind: "photo"; label: string; optional?: boolean }
    | { kind: "checklist_item"; label: string; optional?: boolean }
    | { kind: "qr_scan" }
    | { kind: "location_checkin" }
    | { kind: "contact_details_visible" };

/** Whether a requirement names what it wants — the kinds that carry a label. */
export const requirementHasLabel = (
    requirement: FulfilmentRequirement,
): requirement is Extract<FulfilmentRequirement, { label: string }> =>
    requirement.kind === "photo" || requirement.kind === "checklist_item";

/** A template as `GET /milestone-templates` sends it, with the JSON column parsed. */
export interface FulfilmentTemplate {
    id: string;
    title: string;
    description: string | null;
    type: MilestoneType;
    requirements: FulfilmentRequirement[];
    /** Null is unestimated, which is not zero minutes. */
    estimatedDurationMins: number | null;
    isActive: boolean;
    updatedAt: string | null;
}

export interface FulfilmentPlanItem {
    templateId: string;
    order: number;
    optional: boolean;
    /** The joined template's title, or null when the join did not come. */
    title: string | null;
    /** Whether the step's template is still active — a plan cannot be saved with one that is not. */
    templateActive: boolean | null;
}

/** A plan as `GET /milestone-plans` sends it: the ordered chain, templates joined. */
export interface FulfilmentPlan {
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
    items: FulfilmentPlanItem[];
}
