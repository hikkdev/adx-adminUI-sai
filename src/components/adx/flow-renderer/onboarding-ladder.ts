import type { OnboardingStep, OnboardingTemplate, TemplateAccountType, TemplateParty } from "@/types";

/**
 * FL-3 (27 Sep 2026): the desk's onboarding forms, drawn from the ladder.
 *
 * `flows.onboarding` is a library of steps and six orderings over it. A
 * `form` step carries a key, a title and a subtitle — never fields: the
 * phone's `form-step.tsx` keys its field list on the step's key (`details`,
 * `business`, `contact`) and the account type, and so does the desk. What
 * the ladder decides is which of those sections a party is asked, in what
 * order, under what words; what each section collects is the desk's
 * (QR-13/QR-15), the same columns the phone writes.
 *
 * `CODE_FORM_STEPS` mirrors the backend's `CODE_ONBOARDING_TEMPLATE` — the
 * ladder the manifest falls back to when the row has no `onboarding` key —
 * so a console that cannot read the row still draws the ladder the phone
 * climbs.
 */

/** The ladder's account type back out of each side's legal-form column — the backend's `PUBLISHER_ACCOUNT_TYPE` / `ADVERTISER_ACCOUNT_TYPE`. */
export const LADDER_ACCOUNT_TYPE: Record<TemplateParty, Record<string, TemplateAccountType>> = {
    PUBLISHER: { INDIVIDUAL: "INDIVIDUAL", BUSINESS: "BUSINESS", NGO: "ORGANISATION", POLITICAL: "ORGANISATION" },
    ADVERTISER: { INDIVIDUAL: "INDIVIDUAL", COMMERCIAL: "BUSINESS", AGENCY: "BUSINESS", NGO: "ORGANISATION" },
};

export const ladderAccountType = (party: TemplateParty, type: string | null | undefined): TemplateAccountType => LADDER_ACCOUNT_TYPE[party][type ?? ""] ?? "INDIVIDUAL";

/** One section of a desk form: a `form` step of the ladder, in ladder order. */
export interface FormStepDef {
    /** The step's id in the library. */
    id: string;
    /** `details`, `business` or `contact` — what the section collects. */
    key: string;
    title: string;
    subtitle: string;
}

type CodeStep = Extract<OnboardingStep, { kind: "form" }> | Extract<OnboardingStep, { kind: "account-type" }>;

/** The code ladder's account-type and form steps, exactly as `users/onboarding-manifest.ts` writes them. */
export const CODE_FORM_STEPS: Record<string, CodeStep> = {
    "account-type": { key: "account-type", kind: "account-type", title: "Account type" },
    "publisher-details": { key: "details", kind: "form", title: "Publisher details", subtitle: "Who you are and how to reach you" },
    "advertiser-details": { key: "details", kind: "form", title: "Advertiser details", subtitle: "Who you are and how to reach you" },
    business: { key: "business", kind: "form", title: "Business information", subtitle: "Registered name, GSTIN and where it is" },
    organisation: { key: "business", kind: "form", title: "Organisation information", subtitle: "Registered name, GSTIN and where it is" },
    contact: { key: "contact", kind: "form", title: "Contact person", subtitle: "Who ADX should reach about this account" },
};

const CODE_LADDERS: Record<TemplateParty, Record<TemplateAccountType, string[]>> = {
    PUBLISHER: {
        INDIVIDUAL: ["account-type", "publisher-details"],
        BUSINESS: ["account-type", "publisher-details", "business", "contact"],
        ORGANISATION: ["account-type", "publisher-details", "organisation", "contact"],
    },
    ADVERTISER: {
        INDIVIDUAL: ["account-type", "advertiser-details"],
        BUSINESS: ["account-type", "advertiser-details", "business", "contact"],
        ORGANISATION: ["account-type", "advertiser-details", "organisation", "contact"],
    },
};

/** The account-type step's title for a ladder, and the form steps after it, in order. */
export interface DeskLadder {
    accountTypeTitle: string;
    steps: FormStepDef[];
    /** Where the steps came from — the stored template or the code ladder. */
    source: "config" | "code";
}

/**
 * The form steps a party × account type is asked, in ladder order. The
 * stored template when it holds a ladder for the pair; the code ladder
 * otherwise. A step the ladder names but the library lacks is skipped,
 * as the manifest skips it.
 */
export function formStepsFor(template: OnboardingTemplate | null | undefined, party: TemplateParty, accountType: TemplateAccountType): DeskLadder {
    const ids = template?.ladders?.[party]?.[accountType];
    if (template && Array.isArray(ids) && ids.length > 0) {
        const steps: FormStepDef[] = [];
        let accountTypeTitle = CODE_FORM_STEPS["account-type"]!.title;
        for (const id of ids) {
            const step = template.steps?.[id];
            if (!step) continue;
            if (step.kind === "account-type") accountTypeTitle = step.title;
            if (step.kind === "form") steps.push({ id, key: step.key, title: step.title, subtitle: step.subtitle });
        }
        if (steps.length > 0) return { accountTypeTitle, steps, source: "config" };
    }
    const codeIds = CODE_LADDERS[party][accountType];
    return {
        accountTypeTitle: CODE_FORM_STEPS["account-type"]!.title,
        steps: codeIds.flatMap((id) => {
            const step = CODE_FORM_STEPS[id];
            return step && step.kind === "form" ? [{ id, key: step.key, title: step.title, subtitle: step.subtitle }] : [];
        }),
        source: "code",
    };
}

/** How a desk field is drawn — the phone's `FieldSpec.kind`, plus the desk's own. */
export type DeskFieldKind = "text" | "email" | "tel" | "date" | "gender" | "address" | "city" | "gstin" | "pin";

export interface DeskField {
    key: string;
    kind: DeskFieldKind;
    label: string;
    placeholder?: string;
    /** Whether the section takes the whole row for it. */
    wide?: boolean;
    optional?: boolean;
}

/**
 * What each `form` step collects at the desk (QR-13): the phone's field
 * list per step key, with the person split into first and last name as the
 * desk stores it. The address goes where the phone puts it — with the
 * person's details for an individual, with the business otherwise —
 * the line, City | State, and the PIN code alone on its row (the owner,
 * 1 Oct 2026: one address bar over plain boxes, no map).
 */
export function deskFieldsFor(stepKey: string, accountType: TemplateAccountType, mode: "create" | "edit"): DeskField[] {
    const individual = accountType === "INDIVIDUAL";
    const address: DeskField[] = [
        { key: "address", kind: "address", label: individual ? "Address" : "Registered address", placeholder: "Building, street, area", wide: true },
        { key: "city", kind: "city", label: "City", placeholder: "e.g. Bengaluru" },
        { key: "state", kind: "text", label: "State", placeholder: "e.g. Karnataka" },
        { key: "postalCode", kind: "pin", label: "PIN code", placeholder: "Six digits — 560001", optional: true },
    ];
    switch (stepKey) {
        case "details":
            return [
                { key: "firstName", kind: "text", label: "First name" },
                { key: "lastName", kind: "text", label: "Last name" },
                { key: "mobile", kind: "tel", label: "Mobile", placeholder: mode === "edit" ? "The identity; it does not change here" : "The number they sign in with" },
                { key: "email", kind: "email", label: "Email", placeholder: "owner@business.in" },
                // AGE-1 (29 Sep 2026): offered, never required — 18 or over is asked only when an order is placed.
                { key: "dateOfBirth", kind: "date", label: "Date of birth", optional: true },
                { key: "gender", kind: "gender", label: "Gender", optional: true },
                ...(individual ? address : []),
            ];
        case "business":
            return [
                { key: "name", kind: "text", label: "Registered name", placeholder: "As on the documents" },
                { key: "gstin", kind: "gstin", label: "GSTIN", placeholder: "22AAAAA0000A1Z5", optional: accountType !== "BUSINESS" },
                ...address,
            ];
        case "contact":
            return [
                { key: "contactName", kind: "text", label: "Contact person" },
                { key: "contactMobile", kind: "tel", label: "Their mobile", placeholder: "98765 43210" },
                { key: "contactEmail", kind: "email", label: "Their email", optional: true, wide: true },
            ];
        default:
            return [];
    }
}
