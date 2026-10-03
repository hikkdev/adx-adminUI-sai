"use client";

import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useRosterPermission } from "@/components/adx/party-roster-row-actions";
import { useApiResource } from "@/lib/use-api-resource";
import { settingsReadApi, settingsService, type PlatformSettings } from "@/services/settings";
import { FraudSettingsView } from "./fraud-settings-view";

export function FraudSettingsLoader() {
    const live = settingsReadApi();
    const mayEdit = useRosterPermission("settings.edit");
    const resource = useApiResource<PlatformSettings | null>(`settings:platform:fraud:${live}`, () => (live ? settingsService.get() : Promise.resolve(null)));
    return (
        <ResourceBoundary resource={resource}>
            {(settings) => <FraudSettingsView settings={settings?.fraud?.orderScreening ?? null} live={live} mayEdit={mayEdit} onSaved={resource.reload} />}
        </ResourceBoundary>
    );
}
