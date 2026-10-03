"use client";

import { PlugZap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { CUSTOM_FIELD_ENTITIES, customFieldsReadApi, customFieldsService, type CustomFieldDef, type CustomFieldEntity } from "@/services/custom-fields";
import { CustomFieldsView } from "./custom-fields-view";

export type DefsByEntity = Record<CustomFieldEntity, CustomFieldDef[]>;

/** CF-1: every record type's definitions in one read, archived ones included — the view filters. */
export function CustomFieldsLoader() {
    const live = customFieldsReadApi();
    const resource = useApiResource<DefsByEntity>(`custom-fields:all:${live}`, async () => {
        const out = { PUBLISHER: [], ADVERTISER: [], LISTING: [], LEAD: [] } as DefsByEntity;
        if (!live) return out;
        const lists = await Promise.all(CUSTOM_FIELD_ENTITIES.map((entity) => customFieldsService.list(entity, { includeArchived: true })));
        CUSTOM_FIELD_ENTITIES.forEach((entity, index) => {
            out[entity] = lists[index] ?? [];
        });
        return out;
    });

    if (!live) {
        return (
            <Card className="rounded-lg border-border p-8 text-center shadow-none">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                    <PlugZap className="size-6 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">Not connected to the ADX backend</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                    Custom fields are the extra questions the desks, the apps and the website ask. There is no seeded stand-in. Set{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_USE_API=true</code> and point the console at a running backend.
                </p>
            </Card>
        );
    }

    return <ResourceBoundary resource={resource}>{(defs) => <CustomFieldsView defs={defs} onChanged={resource.reload} />}</ResourceBoundary>;
}
