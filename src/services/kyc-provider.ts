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

/** What `GET /integrations` answers under `kyc` — the keys masked, the switch as-is. */
export interface KycProviderConfig {
    clientId: string | null;
    clientSecret: string | null;
    baseUrl: string | null;
    kycProvider: KycProviderState;
}

/** The 503 every Digio initiate and restart answers while the provider is off DIGIO. */
export function providerUnavailable(cause: unknown): { provider: KycProviderState; retryAfter: number | null } | null {
    if (!(cause instanceof ApiError) || cause.code !== "KYC_PROVIDER_UNAVAILABLE") return null;
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
