"use client";

import { notFound } from "next/navigation";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { Card } from "@/components/ui/card";
import { isLive } from "@/lib/api-config";
import { kycService } from "@/services/kyc";
import type { KycCase } from "@/types";
import { KycWorkbench } from "./kyc-workbench";

interface Loaded {
    kycCase: KycCase | null;
}

/**
 * The case from `GET /publishers/kyc-queue/:publisherId` — the row, every
 * tile's decision, the liveness video, and since E7-3 its own age against
 * the review SLA and the people on it by name (G11-1: the escalation's two
 * people included, so nothing is read beside it). The token lives in the
 * browser, so this reads on the client like every other wired screen.
 */
export function KycCaseLoader({ publisherId }: { publisherId: string }) {
    const live = isLive("kyc");
    const resource = useApiResource<Loaded>(`kyc:case:${publisherId}:${live}`, async () => {
        if (!live) return { kycCase: null };
        return { kycCase: await kycService.get(publisherId) };
    });

    if (!live) {
        return (
            <Card className="rounded-lg border-border p-5 shadow-none">
                <p className="text-sm text-muted-foreground">
                    KYC is read from the API and has no fixtures. Turn the KYC domain on to open a case.
                </p>
            </Card>
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(data) => {
                if (!data.kycCase) notFound();
                return <KycWorkbench kycCase={data.kycCase} onChanged={resource.reload} />;
            }}
        </ResourceBoundary>
    );
}
