import { api as http } from "@/lib/api-client";

/**
 * The AI settings, read and written through the integrations config.
 *
 * One section of one endpoint rather than a service of its own, because that is
 * where the backend keeps it: provider, key, model and both quota numbers live
 * beside the SMS and storage credentials, and switching model vendors is meant
 * to be a form change rather than a deployment.
 *
 * This is live in every mode. There are no AI fixtures, on purpose — a settings
 * screen that cheerfully reports a provider nobody configured is how an
 * operator concludes the feature is broken when it was simply never switched on.
 */

export type AiProviderKind = "anthropic" | "openai" | "google" | "azure-openai" | "custom";

export interface AiSettings {
    provider: AiProviderKind;
    /** Masked by the server — `••••` and the last four. Never the real key. */
    apiKey: string | null;
    model: string | null;
    baseUrl: string | null;
    enabled: boolean;
    freeQuota: number;
    paidQuota: number;
    translateOnRead: boolean;
}

/** What an operator may change. A blank key means "leave the stored one alone". */
export interface AiSettingsPatch {
    provider?: AiProviderKind;
    apiKey?: string;
    model?: string;
    baseUrl?: string | null;
    enabled?: boolean;
    freeQuota?: number;
    paidQuota?: number;
    translateOnRead?: boolean;
}

interface IntegrationsResponse {
    ai: AiSettings;
}

/** `PUT /integrations` answers a confirmation line with the same masked view beside it — no re-read needed. */
interface IntegrationsWriteResponse extends IntegrationsResponse {
    message: string;
}

export const aiService = {
    get: async (): Promise<AiSettings> => {
        const config = await http.get<IntegrationsResponse>("/integrations");
        return config.ai;
    },

    save: async (patch: AiSettingsPatch): Promise<AiSettings> => {
        const config = await http.put<IntegrationsWriteResponse>("/integrations", {
            section: "ai",
            patch,
        });
        return config.ai;
    },
};
