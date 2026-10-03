"use client";

import { SectionCard } from "@/components/adx/section-card";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useAuth } from "@/lib/auth";
import { useApiResource } from "@/lib/use-api-resource";
import { settingsService, type PlatformSettings } from "@/services/settings";
import { storageReadApi, storageService, type StorageSummary } from "@/services/storage";
import { StorageView } from "./storage-view";

/**
 * Two reads: the report (`GET /storage/summary`) and the platform row the
 * removal switch lives on (`GET /settings/platform`). They load apart, so a
 * backend that serves one and not the other still shows what it has.
 */
export function StorageLoader() {
    const live = storageReadApi();
    const { can } = useAuth();
    const summary = useApiResource<StorageSummary | null>(`settings:storage:summary:${live}`, () => (live ? storageService.summary() : Promise.resolve(null)));
    const settings = useApiResource<PlatformSettings | null>(`settings:platform:storage:${live}`, () => (live ? settingsService.get() : Promise.resolve(null)));

    if (!live) {
        return (
            <SectionCard title="Storage" description="Space used by purpose, the largest files, and the files nothing on the platform refers to">
                <p className="text-sm text-muted-foreground">Not connected to the ADX backend — the file register lives on the server and cannot be shown from fixtures.</p>
            </SectionCard>
        );
    }

    return (
        <ResourceBoundary resource={summary}>
            {(data) =>
                data ? (
                    <StorageView
                        summary={data}
                        settings={settings}
                        mayRunJobs={can("system.jobs")}
                        mayEdit={can("settings.edit")}
                        onChanged={() => {
                            summary.reload();
                            settings.reload();
                        }}
                    />
                ) : null
            }
        </ResourceBoundary>
    );
}
