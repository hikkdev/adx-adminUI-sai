"use client";

import { PlugZap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { legalReadsApi, legalService, type LegalDocument } from "@/services/legal";
import { LegalView } from "./legal-view";

/**
 * Every version of every kind in one read — thirteen kinds is not a list worth
 * paging — and no fixtures at all, for the same reason agreements have none: a
 * seeded privacy policy would look exactly like a published one.
 */
export function LegalLoader() {
    const live = legalReadsApi();
    const resource = useApiResource<LegalDocument[]>(`legal:documents:${live}`, () =>
        live ? legalService.documents() : Promise.resolve([])
    );

    if (!live) {
        return (
            <Card className="rounded-lg border-border p-8 text-center shadow-none">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                    <PlugZap className="size-6 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">Not connected to the ADX backend</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                    These are the policies both apps show. There is no seeded stand-in, because a fixture privacy policy would look exactly
                    like a published one. Set <code className="rounded bg-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_USE_API=true</code> and point
                    the console at a running backend.
                </p>
            </Card>
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(documents) => <LegalView documents={documents} onChanged={resource.reload} />}
        </ResourceBoundary>
    );
}
