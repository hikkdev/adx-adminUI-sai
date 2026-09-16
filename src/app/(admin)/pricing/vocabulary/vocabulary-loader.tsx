"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { pricingService } from "@/services/pricing";
import type { VocabularyProposal } from "@/types/pricing-engine";
import { EngineShell } from "../engine-shell";
import { VocabularyView } from "./vocabulary-view";

export function VocabularyLoader() {
    const resource = useApiResource<VocabularyProposal[]>("pricing:vocabulary", () =>
        pricingService.proposals(false)
    );

    return (
        <EngineShell
            title="Vocabulary queue"
            subtitle="Values that matched nothing in the controlled lists. Logged rather than created, so the taxonomy cannot drift on its own."
        >
            <ResourceBoundary resource={resource}>
                {(proposals) => (
                    <VocabularyView proposals={proposals} onChanged={resource.reload} />
                )}
            </ResourceBoundary>
        </EngineShell>
    );
}
