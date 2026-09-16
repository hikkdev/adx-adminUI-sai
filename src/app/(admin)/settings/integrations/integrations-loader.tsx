"use client";

import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { commsService, type SmsVocabulary } from "@/services/comms";
import { integrationsReadApi, integrationsService, type IntegrationsSettings } from "@/services/integrations";
import { IntegrationsView } from "./integrations-view";

export interface IntegrationsData {
    settings: IntegrationsSettings;
    /** E10-2: the DLT kinds and the rail names off `GET /comms/sms-kinds` — the routing table's rows and columns. */
    sms: SmsVocabulary;
}

/** The one `GET /integrations` read; every section's save re-reads it so the masks are the server's. */
export function IntegrationsLoader() {
    const live = integrationsReadApi();
    const resource = useApiResource<IntegrationsData>(`settings:integrations:${live}`, async () => {
        if (!live) return { settings: {}, sms: { kinds: [], rails: [] } };
        const [settings, sms] = await Promise.all([integrationsService.get(), commsService.smsKinds()]);
        return { settings, sms };
    });

    if (!live) {
        return (
            <EmptyState
                icon={PlugZap}
                title="Integrations read the API"
                description="Gateway keys and messaging credentials live on the server, masked. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend."
            />
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {({ settings, sms }) => <IntegrationsView settings={settings} sms={sms} onChanged={resource.reload} />}
        </ResourceBoundary>
    );
}
