import type { StatusMeta } from "./common";

/* ------------------------------------------------------------------ */
/* Flow editor: onboarding form flows and fulfilment templates        */
/* (ported from the ADX-AdminUI flow editor module)                   */
/* ------------------------------------------------------------------ */

export type FlowFieldType =
    | "text"
    | "textarea"
    | "phone"
    | "select"
    | "radio"
    | "checkbox"
    | "switch"
    | "slider"
    | "image_upload"
    | "selectable_cards"
    | "info"
    | "section_header";

export const FLOW_FIELD_TYPE_LABELS: Record<FlowFieldType, string> = {
    text: "Text",
    textarea: "Text area",
    phone: "Phone",
    select: "Select",
    radio: "Radio",
    checkbox: "Checkbox",
    switch: "Toggle",
    slider: "Slider",
    image_upload: "Image upload",
    selectable_cards: "Selectable cards",
    info: "Info block",
    section_header: "Section header",
};

export interface FlowField {
    id: string;
    type: FlowFieldType;
    label: string;
    required: boolean;
    placeholder?: string;
    options?: string[];
    /** Selectable-cards field that routes the user into a branch. */
    branching?: boolean;
    helper?: string;
}

export interface FlowScreen {
    key: string;
    title: string;
    subtitle: string;
    ctaLabel: string;
    fields: FlowField[];
}

export interface FlowBranch {
    key: string;
    title: string;
    description: string;
    screens: FlowScreen[];
}

export interface OnboardingFlow {
    key: string;
    label: string;
    audience: string;
    description: string;
    updated: string;
    screens: FlowScreen[];
    branches: FlowBranch[];
}

/* --------------------- Fulfilment templates ----------------------- */

export type FulfilmentStepType =
    | "survey"
    | "creative_collection"
    | "installation"
    | "verification"
    | "health_check"
    | "custom";

export const FULFILMENT_STEP_TYPE_META: Record<FulfilmentStepType, StatusMeta> = {
    survey: { label: "Survey", tone: "info" },
    creative_collection: { label: "Creative collection", tone: "neutral" },
    installation: { label: "Installation", tone: "warning" },
    verification: { label: "Verification", tone: "success" },
    health_check: { label: "Health check", tone: "danger" },
    custom: { label: "Custom", tone: "neutral" },
};

export type FulfilmentRequirementKind =
    | "photo"
    | "checklist_item"
    | "qr_scan"
    | "location_checkin"
    | "contact_details_visible";

export const FULFILMENT_REQUIREMENT_LABELS: Record<FulfilmentRequirementKind, string> = {
    photo: "Photo",
    checklist_item: "Checklist item",
    qr_scan: "QR scan",
    location_checkin: "Location check-in",
    contact_details_visible: "Contact details visible",
};

export interface FulfilmentRequirement {
    kind: FulfilmentRequirementKind;
    label?: string;
}

export interface FulfilmentTemplate {
    id: string;
    title: string;
    description: string;
    type: FulfilmentStepType;
    requirements: FulfilmentRequirement[];
    estimatedMins: number;
    active: boolean;
    updated: string;
}

export interface FulfilmentPlanItem {
    templateId: string;
    order: number;
    optional: boolean;
}

export interface FulfilmentPlan {
    id: string;
    name: string;
    description: string;
    active: boolean;
    items: FulfilmentPlanItem[];
}
