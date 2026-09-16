"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { aiService, type AiSettings } from "@/services/ai";
import { AiView } from "./ai-view";

/**
 * Always live, with no fixture fallback.
 *
 * Deliberate, and the same reasoning the pricing engine screens use: a settings
 * page that renders a plausible provider from seed data would tell an operator
 * the feature is configured when nothing is. With the API off this says so.
 */
export function AiLoader() {
    const resource = useApiResource<AiSettings>("settings:ai", () => aiService.get());

    return (
        <ResourceBoundary resource={resource}>
            {(settings) => <AiView initial={settings} />}
        </ResourceBoundary>
    );
}
