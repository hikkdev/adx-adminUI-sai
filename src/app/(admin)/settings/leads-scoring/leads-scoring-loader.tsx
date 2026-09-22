"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { settingsReadApi, settingsService, type PlatformSettings } from "@/services/settings";
import { leadsService, type LeadSource } from "@/services/leads";
import { LeadsScoringView } from "./leads-scoring-view";

export function LeadsScoringLoader() {
    const live = settingsReadApi();
    const resource = useApiResource<{ settings: PlatformSettings | null; sources: LeadSource[] }>(`settings:platform:leads-scoring:${live}`, async () =>
        live ? { settings: await settingsService.get(), sources: await leadsService.sources().catch(() => []) } : { settings: null, sources: [] },
    );
    return (
        <ResourceBoundary resource={resource}>
            {(data) => <LeadsScoringView policy={data.settings?.leads?.scoring ?? null} hunt={data.settings?.leads ? { claims: data.settings.leads.claims ?? null, referralCredit: data.settings.leads.referralCredit ?? null, priority: data.settings.leads.priority ?? null } : null} sources={data.sources} live={live} onSaved={resource.reload} />}
        </ResourceBoundary>
    );
}
