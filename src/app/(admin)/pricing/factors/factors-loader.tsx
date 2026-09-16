"use client";

import * as React from "react";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { pricingService } from "@/services/pricing";
import type { MediaType, PricingFactor } from "@/types/pricing-engine";
import { EngineShell } from "../engine-shell";
import { FactorsView } from "./factors-view";

export function FactorsLoader() {
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [nonce, setNonce] = React.useState(0);

    // Keyed on the selection so switching media type refetches that type's
    // factors, and on a nonce so adding one reloads the list it was added to.
    const resource = useApiResource<{ mediaTypes: MediaType[]; factors: PricingFactor[] }>(
        `pricing:factors:${selectedId ?? "none"}:${nonce}`,
        async () => {
            const mediaTypes = await pricingService.mediaTypes();
            const active = selectedId ?? mediaTypes[0]?.id ?? null;
            const factors = active ? await pricingService.factors(active) : [];
            return { mediaTypes, factors };
        }
    );

    return (
        <EngineShell
            title="Pricing factors"
            subtitle="Per media type. The engine proposes the ones a listing matches; a person decides which apply."
        >
            <ResourceBoundary resource={resource}>
                {({ mediaTypes, factors }) => (
                    <FactorsView
                        mediaTypes={mediaTypes}
                        factors={factors}
                        selectedId={selectedId ?? mediaTypes[0]?.id ?? null}
                        onSelect={setSelectedId}
                        onChanged={() => setNonce((n) => n + 1)}
                    />
                )}
            </ResourceBoundary>
        </EngineShell>
    );
}
