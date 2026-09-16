"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { identifierService } from "@/services/identifiers";
import type { IdentifierFormat } from "@/types";
import { IdentifiersView } from "./identifiers-view";

export function IdentifiersLoader() {
    // Every party the server mints for — the list plus the server's own
    // default for any it has not materialised yet (Q-C item 4).
    const resource = useApiResource<IdentifierFormat[]>("identifiers:formats", () =>
        identifierService.formatsForEveryParty()
    );

    return (
        <ResourceBoundary resource={resource}>
            {(formats) => <IdentifiersView formats={formats} onSaved={resource.reload} />}
        </ResourceBoundary>
    );
}
