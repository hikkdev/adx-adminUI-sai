"use client";

import { notFound } from "next/navigation";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { Card } from "@/components/ui/card";
import { isLive } from "@/lib/api-config";
import { onboardingService, type WireIntakeSubmission } from "@/services/onboarding";
import { IntakeRecord } from "./intake-record";

/** One submission from `GET /onboarding/submissions/:id`. */
export function IntakeRecordLoader({ id }: { id: string }) {
    const live = isLive("kyc");
    const resource = useApiResource<WireIntakeSubmission | null>(`intake:${id}:${live}`, () => onboardingService.get(id));

    if (!live) {
        return (
            <Card className="rounded-lg border-border p-5 shadow-none">
                <p className="text-sm text-muted-foreground">The intake is read from the API and has no fixtures. Turn the KYC domain on to open a record.</p>
            </Card>
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(submission) => {
                if (!submission) notFound();
                return <IntakeRecord submission={submission} onChanged={resource.reload} />;
            }}
        </ResourceBoundary>
    );
}
