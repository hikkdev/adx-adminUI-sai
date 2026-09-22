"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { settingsReadApi, settingsService, type PlatformSettings } from "@/services/settings";
import { EsignView } from "./esign-view";

export function EsignLoader() {
    const live = settingsReadApi();
    const resource = useApiResource<PlatformSettings | null>(`settings:platform:esign:${live}`, () => (live ? settingsService.get() : Promise.resolve(null)));
    return <ResourceBoundary resource={resource}>{(settings) => <EsignView policy={settings?.esign ?? null} live={live} onSaved={resource.reload} />}</ResourceBoundary>;
}
