"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { settingsReadApi, settingsService, type PlatformSettings } from "@/services/settings";
import { TrackingView } from "./tracking-view";

export function TrackingLoader() {
    const live = settingsReadApi();
    const resource = useApiResource<PlatformSettings | null>(`settings:platform:tracking:${live}`, () => (live ? settingsService.get() : Promise.resolve(null)));
    return <ResourceBoundary resource={resource}>{(settings) => <TrackingView settings={settings?.tracking ?? null} live={live} onSaved={resource.reload} />}</ResourceBoundary>;
}
