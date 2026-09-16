"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { settingsReadApi, settingsService, type InstallationCommissionMode } from "@/services/settings";

/**
 * Lot B (Q102): the platform's installation commission mode, off the
 * settings row.
 *
 * The assign and print-ready dialogs draw their agent-fee field only on
 * PER_ORDER — on FLAT the resolver ignores the figure, and a field nothing
 * reads teaches an operator something false. Null while loading, with the
 * API off, or when the row could not be read; the field stays hidden in
 * every one of those cases rather than guessing.
 */
export function useInstallationMode(): InstallationCommissionMode | null {
    const live = settingsReadApi();
    const resource = useApiResource<InstallationCommissionMode | null>(`platform:installation-mode:${live}`, async () =>
        live ? ((await settingsService.get().catch(() => null))?.installation.commissionMode ?? null) : null
    );
    return resource.data;
}
