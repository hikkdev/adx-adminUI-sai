import { ApiError, api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";

/**
 * The entity type — Phase D (the owner, 1 Oct 2026).
 *
 * KYC is never a sign-up gate; what an account IS decides which of the 25
 * Digio workflows it is verified on. A publisher, an advertiser and a
 * print partner each carry `entityType` (the effective value: the stored
 * column, else what the legacy account type says, else null — "ask") and
 * `entityTypeStored` on their reads. Every Digio start for the three
 * accepts `{ entityType }`; with none on the account and none sent it
 * answers 409 `ENTITY_TYPE_REQUIRED` with the party's allowed options, and
 * nothing is stored or sent. A VERIFIED account's type moves only from
 * Individual to a business form — the upgrade, which fires a fresh Digio
 * request and puts the KYC back to PENDING — and any other change on one
 * is 409 `KYC_LOCKED`. Agents and employees have no entity type: agents
 * share one workflow, employees are chosen by employment type.
 *
 * The labels are the server's (`GET /kyc/entity-types`); the record here
 * is the same eight, word for word, for when that read fails.
 */

export const KYC_ENTITY_TYPES = [
    "INDIVIDUAL",
    "SOLE_PROPRIETOR",
    "COMPANY",
    "LLP_PARTNERSHIP",
    "NON_PROFIT",
    "GOVERNMENT_EDUCATION",
    "OTHER_ENTITY",
    "POLITICAL",
] as const;
export type KycEntityType = (typeof KYC_ENTITY_TYPES)[number];

export const KYC_ENTITY_TYPE_LABEL: Record<KycEntityType, string> = {
    INDIVIDUAL: "Individual",
    SOLE_PROPRIETOR: "Sole proprietor",
    COMPANY: "Company",
    LLP_PARTNERSHIP: "LLP or partnership",
    NON_PROFIT: "Non-profit (NGO, trust, society, Section 8)",
    GOVERNMENT_EDUCATION: "Government or education",
    OTHER_ENTITY: "Other entity (HUF, co-operative, AOP, …)",
    POLITICAL: "Political party or candidate",
};

/** The three parties that carry an entity type. */
export type KycEntityParty = "PUBLISHER" | "ADVERTISER" | "PRINT_PARTNER";

export interface KycEntityTypeOption {
    value: KycEntityType;
    label: string;
}

/** `GET /kyc/entity-types` — each party's allowed values, labelled, in the enum's order. */
export type KycEntityTypeLists = Record<KycEntityParty, KycEntityTypeOption[]>;

const optionsOf = (values: readonly KycEntityType[]): KycEntityTypeOption[] => values.map((value) => ({ value, label: KYC_ENTITY_TYPE_LABEL[value] }));

/** What the read answers, kept here for when it fails: all eight for a publisher and an advertiser, the first four for a print partner. */
export const KYC_ENTITY_TYPE_FALLBACK: KycEntityTypeLists = {
    PUBLISHER: optionsOf(KYC_ENTITY_TYPES),
    ADVERTISER: optionsOf(KYC_ENTITY_TYPES),
    PRINT_PARTNER: optionsOf(["INDIVIDUAL", "SOLE_PROPRIETOR", "COMPANY", "LLP_PARTNERSHIP"]),
};

const isEntityType = (value: unknown): value is KycEntityType => typeof value === "string" && (KYC_ENTITY_TYPES as readonly string[]).includes(value);

/** A list off the wire with anything that is not `{ value, label }` over a known value dropped; null when nothing usable is left. */
function usable(list: unknown): KycEntityTypeOption[] | null {
    if (!Array.isArray(list)) return null;
    const options = list
        .filter((item): item is { value: KycEntityType; label?: unknown } => isEntityType((item as { value?: unknown } | null)?.value))
        .map((item) => ({ value: item.value, label: typeof item.label === "string" && item.label.trim() ? item.label : KYC_ENTITY_TYPE_LABEL[item.value] }));
    return options.length > 0 ? options : null;
}

/** The label a detail page prints: the server's word for the value, "Not chosen yet" while the account has none. */
export function entityTypeLabel(value: string | null | undefined, options: KycEntityTypeOption[] = []): string {
    if (!value) return "Not chosen yet";
    return options.find((option) => option.value === value)?.label ?? (KYC_ENTITY_TYPE_LABEL as Partial<Record<string, string>>)[value] ?? value;
}

/* ------------------------------------------------------------------ */
/* The answers a Digio start and an Edit-details save give             */
/* ------------------------------------------------------------------ */

/** The picker, in the words every surface uses — worded for the desk, which picks on the account's behalf. */
export const ENTITY_PICKER_HEADING = "Who is this account for?";
export const ENTITY_PICKER_HELPER = "This decides which documents the check asks for. Pick the one their PAN is registered as.";
export const ENTITY_PICKER_BUTTON = "Continue to verification";

/** Said before an Individual → business change on a VERIFIED account is saved: it fires a fresh Digio request. */
export const ENTITY_UPGRADE_LINE = "This account goes back to 'verification pending' until the business is verified.";

/** 409 `KYC_LOCKED`, explained. The rest of the patch is not written either. */
export const KYC_LOCKED_EXPLANATION =
    "This account is verified, so its entity type can only move from Individual to a business form, and that restarts verification. Nothing in this save was written.";

/** The one line under the account-type row on a create, where the entity type is optional. */
export const ENTITY_CREATE_GUIDANCE = "The kind of business or organisation picks its verification workflow; if it isn't chosen now, it's asked when verification starts.";

/** The one line under the row on a verified account's Edit details, so the rule is read before the save. */
export const ENTITY_VERIFIED_RULE = "This account is verified: its entity type can only move from Individual to a business form, and that restarts verification.";

/**
 * 409 `ENTITY_TYPE_REQUIRED` — the account's type is unknown and none was
 * sent. Nothing was stored or sent to Digio; `details.options` is what the
 * picker offers (the party's static list when the answer carries none).
 */
export function entityTypeRequired(cause: unknown): { party: KycEntityParty | null; options: KycEntityTypeOption[] } | null {
    if (!(cause instanceof ApiError) || cause.status !== 409 || cause.code !== "ENTITY_TYPE_REQUIRED") return null;
    const details = (cause.details ?? {}) as { party?: unknown; options?: unknown };
    const party = details.party === "PUBLISHER" || details.party === "ADVERTISER" || details.party === "PRINT_PARTNER" ? details.party : null;
    return { party, options: usable(details.options) ?? KYC_ENTITY_TYPE_FALLBACK[party ?? "PUBLISHER"] };
}

/** 409 `KYC_LOCKED` — a change on a VERIFIED account that is not the upgrade. */
export const isKycLocked = (cause: unknown): cause is ApiError => cause instanceof ApiError && cause.status === 409 && cause.code === "KYC_LOCKED";

/** The upgrade: a VERIFIED Individual becoming a business form. The one change a verified account takes, and it restarts verification. */
export function isEntityUpgrade(verified: boolean, from: string | null | undefined, to: string | null | undefined): boolean {
    return verified && from === "INDIVIDUAL" && Boolean(to) && to !== "INDIVIDUAL";
}

export const kycEntityTypeService = {
    /** Each party's allowed entity types, labelled by the server; the static lists when the read fails or the KYC domain is off. */
    lists: async (): Promise<KycEntityTypeLists> => {
        if (!isLive("kyc")) return KYC_ENTITY_TYPE_FALLBACK;
        try {
            const data = await http.get<Partial<Record<KycEntityParty, unknown>>>("/kyc/entity-types");
            return {
                PUBLISHER: usable(data?.PUBLISHER) ?? KYC_ENTITY_TYPE_FALLBACK.PUBLISHER,
                ADVERTISER: usable(data?.ADVERTISER) ?? KYC_ENTITY_TYPE_FALLBACK.ADVERTISER,
                PRINT_PARTNER: usable(data?.PRINT_PARTNER) ?? KYC_ENTITY_TYPE_FALLBACK.PRINT_PARTNER,
            };
        } catch {
            return KYC_ENTITY_TYPE_FALLBACK;
        }
    },
};

/* ------------------------------------------------------------------ */
/* DR 08's three account types, and the entity types under each        */
/* ------------------------------------------------------------------ */

/** The three the apps and the website ask (DR 08); the legal form is the entity type, chosen beside it. */
export type AccountType = "INDIVIDUAL" | "BUSINESS" | "ORGANISATION";

export const ACCOUNT_TYPES: readonly AccountType[] = ["INDIVIDUAL", "BUSINESS", "ORGANISATION"];

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = { INDIVIDUAL: "Individual", BUSINESS: "Business", ORGANISATION: "Organisation" };

/**
 * The entity types a business or an organisation may be, in the order the
 * desk offers them. An individual is always `INDIVIDUAL`; "Other entity"
 * sits under both (a HUF, a co-operative, an AOP); "Government or
 * education" covers schools, colleges and government bodies.
 */
export const ENTITY_TYPES_BY_ACCOUNT_TYPE: Record<AccountType, readonly KycEntityType[]> = {
    INDIVIDUAL: ["INDIVIDUAL"],
    BUSINESS: ["SOLE_PROPRIETOR", "COMPANY", "LLP_PARTNERSHIP", "OTHER_ENTITY"],
    ORGANISATION: ["NON_PROFIT", "GOVERNMENT_EDUCATION", "POLITICAL", "OTHER_ENTITY"],
};

/** Whether an entity type is one of the account type's. */
export const entityFitsAccountType = (accountType: AccountType, value: string | null | undefined): value is KycEntityType =>
    Boolean(value) && (ENTITY_TYPES_BY_ACCOUNT_TYPE[accountType] as readonly string[]).includes(value as string);

/** The account type's entity types, in its order, labelled by the server's list (the record's words for one the list lacks). */
export function entityOptionsFor(accountType: AccountType, options: KycEntityTypeOption[]): KycEntityTypeOption[] {
    return ENTITY_TYPES_BY_ACCOUNT_TYPE[accountType].map((value) => options.find((option) => option.value === value) ?? { value, label: KYC_ENTITY_TYPE_LABEL[value] });
}

/** What a person reads for an account: the entity type's label beside the account type when one is known — "Organisation · Government or education". */
export function accountTypeLine(accountType: AccountType, entityType: string | null | undefined, options: KycEntityTypeOption[] = []): string {
    const base = ACCOUNT_TYPE_LABEL[accountType];
    if (!entityType || accountType === "INDIVIDUAL") return base;
    return `${base} · ${entityTypeLabel(entityType, options)}`;
}
