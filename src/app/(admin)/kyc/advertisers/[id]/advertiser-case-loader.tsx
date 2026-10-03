"use client";

import { notFound } from "next/navigation";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { Card } from "@/components/ui/card";
import { isLive } from "@/lib/api-config";
import { advertiserKycService } from "@/services/advertiser-kyc";
import type { AdvertiserKycCase } from "@/types";
import { AdvertiserWorkbench } from "./advertiser-workbench";

interface Loaded {
    kycCase: AdvertiserKycCase | null;
}

/**
 * The case from `GET /advertiser-kyc/:id` — `:id` the advertiser PROFILE
 * id the queue links with (the record's id and the user's id resolve too):
 * the row, every tile's decision, the liveness video, its own age against
 * the review SLA and the people on it by name. A profile with no record
 * has no case to open, and the read answers 404.
 */
export function AdvertiserCaseLoader({ id }: { id: string }) {
    const live = isLive("kyc");
    const resource = useApiResource<Loaded>(`advertiser-kyc:case:${id}:${live}`, async () => {
        if (!live) return { kycCase: null };
        return { kycCase: await advertiserKycService.get(id) };
    });

    if (!live) {
        return (
            <Card className="rounded-lg border-border p-5 shadow-none">
                <p className="text-sm text-muted-foreground">KYC is read from the API and has no fixtures. Turn the KYC domain on to open a case.</p>
            </Card>
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(data) => {
                if (!data.kycCase) notFound();
                return <AdvertiserWorkbench kycCase={data.kycCase} onChanged={resource.reload} />;
            }}
        </ResourceBoundary>
    );
}
