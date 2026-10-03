import { ApiError, api as http } from "@/lib/api-client";
import type { StatusMeta } from "@/types";

/**
 * The Digio switch — Lot D (Q129).
 *
 * The `kyc` section of the integrations config carries `kycProvider`
 * beside the Digio keys: DIGIO, DEGRADED or MANUAL. DIGIO and MANUAL are
 * ops' to set; DEGRADED is the probe's verdict — `kyc-provider-probe.job`
 * flips DIGIO → DEGRADED when Digio stops answering and back when it does,
 * and never moves MANUAL. Every Digio initiate and restart, for every party,
 * answers 503 `KYC_PROVIDER_UNAVAILABLE` while the switch is off DIGIO, with
 * `details.retryAfter` — and the desk offers the manual review instead.
 *
 * Read on the workbench's Digio card and written on /settings/integrations;
 * one file so both read the same word.
 */

export type KycProviderState = "DIGIO" | "DEGRADED" | "MANUAL";

export const KYC_PROVIDER_META: Record<KycProviderState, StatusMeta> = {
    DIGIO: { label: "Digio on", tone: "success" },
    DEGRADED: { label: "Degraded — probe", tone: "warning" },
    MANUAL: { label: "Manual only", tone: "neutral" },
};

export const KYC_PROVIDER_EXPLANATION: Record<KycProviderState, string> = {
    DIGIO: "Digio is answering. Publishers and advertisers may verify through it, and the desk may restart a check.",
    DEGRADED:
        "The probe found Digio not answering and took it off the menu. The apps offer the manual upload instead; the probe puts it back the moment Digio answers again. This state is the probe's, not ops' — it cannot be set by hand.",
    MANUAL: "Ops have switched Digio off. Every verification goes through the manual desk until this is set back to Digio.",
};

/** DR-2: who reads an identity paper at the document door. */
export type DocumentReader = "MODEL" | "DIGIO";

export const DOCUMENT_READER_EXPLANATION: Record<DocumentReader, string> = {
    MODEL: "Every document is read by the vision model, identity papers included.",
    DIGIO: "PAN cards, driving licences, passports and voter ids are read by Digio's OCR on this account; every other document, and every PDF, still goes to the vision model.",
};

/* ------------------------------------------------------------------ */
/* Phase D: the 25 Digio workflows                                     */
/* ------------------------------------------------------------------ */

/**
 * One Digio KYC workflow as `GET /integrations` lists it under
 * `kyc.workflows` — Phase D (the owner's "ADX Digio KYC Workflows", 1 Oct
 * 2026). 25 rows in the doc's order: one for agents (field and sales
 * alike), seven for publishers, eight for advertisers, four for print
 * partners, two for employees and three for spots. `templateId` is what a
 * request on that workflow sends as `template_id`: the doc's own id
 * (`DEFAULT`), or the one an admin put in its place (`OVERRIDE`).
 */
export interface DigioWorkflow {
    key: string;
    label: string;
    templateId: string;
    source: "DEFAULT" | "OVERRIDE";
}

/** A Digio workflow template id, as the server's schema takes it. */
export const DIGIO_TEMPLATE_ID = /^KTP[A-Z0-9]{10,61}$/;

/** Why a typed template id is refused before the round trip; null when it would be taken. */
export function templateIdProblem(typed: string): string | null {
    const id = typed.trim();
    if (!id) return "Type the template id, or cancel.";
    return DIGIO_TEMPLATE_ID.test(id) ? null : "A Digio template id starts with KTP, then 10 to 61 capital letters and digits.";
}

/** The card's groups, in the order of the owner's doc; a workflow's group is its key up to the first dot. */
export const DIGIO_WORKFLOW_GROUPS: { prefix: string; label: string }[] = [
    { prefix: "AGENT", label: "Agents" },
    { prefix: "PUBLISHER", label: "Publishers" },
    { prefix: "ADVERTISER", label: "Advertisers" },
    { prefix: "PRINT_PARTNER", label: "Print partners" },
    { prefix: "EMPLOYEE", label: "Employees" },
    { prefix: "SPOT", label: "Spots" },
];

/** The workflows under their group headings; a key whose prefix the card does not know lands under "Other" rather than vanishing. */
export function groupWorkflows(workflows: DigioWorkflow[]): { label: string; rows: DigioWorkflow[] }[] {
    const prefixOf = (key: string) => key.split(".")[0];
    const known = new Set(DIGIO_WORKFLOW_GROUPS.map((group) => group.prefix));
    const groups = DIGIO_WORKFLOW_GROUPS.map((group) => ({ label: group.label, rows: workflows.filter((row) => prefixOf(row.key) === group.prefix) }));
    const other = workflows.filter((row) => !known.has(prefixOf(row.key)));
    return [...groups, { label: "Other", rows: other }].filter((group) => group.rows.length > 0);
}

/** What the card says above the list: where the ids come from, and what an override does to them. */
export const DIGIO_OVERRIDE_EXPLANATION =
    "Each account type is verified on its own Digio workflow. The template ids are the ones the owner's Digio KYC Workflows doc lists; an override replaces the doc's template for that workflow until it is set back to the default.";

/** What `GET /integrations` answers under `kyc` — the keys masked, the switch as-is. */
export interface KycProviderConfig {
    clientId: string | null;
    clientSecret: string | null;
    baseUrl: string | null;
    kycProvider: KycProviderState;
    /** DR-2: MODEL unless ops chose Digio for identity papers. */
    documentReader?: DocumentReader;
    ocrPath?: string | null;
    /** Phase D: the 25 workflows, each with the template id in force. Absent on a server older than the workflow map. */
    workflows?: DigioWorkflow[];
    /** Digio's gateway — the page a person verifies on. */
    gatewayUrl?: string | null;
}

/** Phase D: what every surface says when Digio itself fails a start — the owner's copy, the same on the website and the apps. */
export const DIGIO_NOT_ANSWERING = "Digio isn't answering right now. Try again in a few minutes.";
export const DIGIO_NOT_AVAILABLE = "Online verification isn't available for this account type yet. Please contact ADX support.";

/**
 * Phase D: Digio failing a start that the switch let through — 503
 * `KYC_PROVIDER_UNAVAILABLE` with `details.reason` `PROVIDER_ERROR` (a
 * timeout, the network, a 5xx, a 429) or `NO_TEMPLATE` (no workflow for
 * the account), and 502 `KYC_PROVIDER_REFUSED` (Digio said no — an unknown
 * template, say). The sentence to show, or null when the failure is not one
 * of these.
 */
export function digioFailure(cause: unknown): string | null {
    if (!(cause instanceof ApiError)) return null;
    if (cause.code === "KYC_PROVIDER_REFUSED") return DIGIO_NOT_AVAILABLE;
    if (cause.code !== "KYC_PROVIDER_UNAVAILABLE") return null;
    const reason = (cause.details as { reason?: unknown } | null | undefined)?.reason;
    if (reason === "PROVIDER_ERROR") return DIGIO_NOT_ANSWERING;
    if (reason === "NO_TEMPLATE") return DIGIO_NOT_AVAILABLE;
    return null;
}

/**
 * The 503 every Digio initiate and restart answers while the provider is
 * off DIGIO — the switch's own refusal (`details.provider` MANUAL or
 * DEGRADED, with `retryAfter`). Phase D: the same code with a
 * `details.reason` is Digio failing while the switch is on, which is
 * `digioFailure`'s to explain, not this one's.
 */
export function providerUnavailable(cause: unknown): { provider: KycProviderState; retryAfter: number | null } | null {
    if (!(cause instanceof ApiError) || cause.code !== "KYC_PROVIDER_UNAVAILABLE") return null;
    if (digioFailure(cause) !== null) return null;
    const details = (cause.details ?? {}) as { provider?: KycProviderState; retryAfter?: number | null };
    return { provider: details.provider ?? "DEGRADED", retryAfter: details.retryAfter ?? null };
}

export const kycProviderService = {
    get: async (): Promise<KycProviderConfig> => {
        const config = await http.get<{ kyc: KycProviderConfig }>("/integrations");
        return { ...config.kyc, kycProvider: config.kyc.kycProvider ?? "DIGIO" };
    },

    /** Ops' switch: DIGIO or MANUAL. DEGRADED is the probe's word and is refused here. */
    set: async (kycProvider: "DIGIO" | "MANUAL"): Promise<KycProviderConfig> => {
        // The PUT answers `{ message, ...view }` — the same masked sections the GET sends, beside a confirmation line.
        const config = await http.put<{ message: string; kyc: KycProviderConfig }>("/integrations", { section: "digio", patch: { kycProvider } });
        return { ...config.kyc, kycProvider: config.kyc.kycProvider ?? "DIGIO" };
    },

    /** DR-2: which reader the document door uses for identity papers. */
    setDocumentReader: async (documentReader: DocumentReader): Promise<KycProviderConfig> => {
        const config = await http.put<{ message: string; kyc: KycProviderConfig }>("/integrations", { section: "digio", patch: { documentReader } });
        return { ...config.kyc, kycProvider: config.kyc.kycProvider ?? "DIGIO" };
    },

    /**
     * Phase D: one workflow's template id — an id puts an override in place
     * of the doc's template, null goes back to the default. The server
     * takes known keys only and refuses an id off `DIGIO_TEMPLATE_ID`.
     */
    setWorkflowTemplate: async (key: string, templateId: string | null): Promise<KycProviderConfig> => {
        const config = await http.put<{ message: string; kyc: KycProviderConfig }>("/integrations", {
            section: "digio",
            patch: { workflowTemplates: { [key]: templateId === null ? null : templateId.trim() } },
        });
        return { ...config.kyc, kycProvider: config.kyc.kycProvider ?? "DIGIO" };
    },
};

/* ------------------------------------------------------------------ */
/* DS-1: the eSign wire                                                */
/* ------------------------------------------------------------------ */

/** What `GET /integrations` answers under `esign` — the keys masked, the hosts and ADX's signer as they stand. */
export interface EsignWireConfig {
    clientId: string | null;
    clientSecret: string | null;
    apiUrl: string | null;
    gatewayUrl: string | null;
    adxSignerName: string | null;
    adxSignerIdentifier: string | null;
    /** Keys present (its own, or the KYC section's Digio account). */
    configured: boolean;
    /** No keys of its own: it signs with the KYC section's Digio account. */
    sharesKycCredentials: boolean;
}

export interface EsignWirePatch {
    clientId?: string;
    clientSecret?: string;
    apiUrl?: string;
    gatewayUrl?: string;
    adxSignerName?: string;
    adxSignerIdentifier?: string;
}

export const esignWireService = {
    get: async (): Promise<EsignWireConfig | null> => {
        const config = await http.get<{ esign?: EsignWireConfig }>("/integrations");
        return config.esign ?? null;
    },
    set: async (patch: EsignWirePatch): Promise<EsignWireConfig | null> => {
        const config = await http.put<{ message: string; esign?: EsignWireConfig }>("/integrations", { section: "esign", patch });
        return config.esign ?? null;
    },
};
