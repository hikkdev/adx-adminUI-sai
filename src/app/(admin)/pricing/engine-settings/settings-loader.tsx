"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { pricingService } from "@/services/pricing";
import type { PricingSettings } from "@/types/pricing-engine";
import { EngineShell } from "../engine-shell";
import { EngineSettingsView } from "./settings-view";

export function EngineSettingsLoader() {
    const resource = useApiResource<PricingSettings>("pricing:settings", () =>
        pricingService.settings()
    );

    return (
        <EngineShell
            title="Engine settings"
            subtitle="What counts as nearby, what counts as too expensive, and when ADX data takes over from research."
        >
            <ResourceBoundary resource={resource}>
                {(settings) => (
                    // Remounts on save so the form's draft state restarts from
                    // what the server actually stored, not what was typed.
                    <EngineSettingsView
                        key={JSON.stringify(settings)}
                        settings={settings}
                        onSaved={resource.reload}
                    />
                )}
            </ResourceBoundary>
        </EngineShell>
    );
}
