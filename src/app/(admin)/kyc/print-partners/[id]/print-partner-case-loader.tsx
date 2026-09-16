"use client";

import { notFound } from "next/navigation";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { Card } from "@/components/ui/card";
import { isLive } from "@/lib/api-config";
import { printPartnerKycService, type PrintPartnerKycCase } from "@/services/print-partner-kyc";
import { PrintPartnerWorkbench } from "./print-partner-workbench";

interface Loaded {
    kycCase: PrintPartnerKycCase | null;
}

/**
 * The case from `GET /print-partner-kyc/:id` — `:id` the record's id or
 * the partner's own, as the advertiser desk resolves its route: the row,
 * every tile's decision, the liveness state (video or attestation), its
 * own age against the review SLA and the people on it by name.
 */
export function PrintPartnerCaseLoader({ id }: { id: string }) {
    const live = isLive("kyc");
    const resource = useApiResource<Loaded>(`print-partner-kyc:case:${id}:${live}`, async () => {
        if (!live) return { kycCase: null };
        return { kycCase: await printPartnerKycService.get(id) };
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
                return <PrintPartnerWorkbench kycCase={data.kycCase} onChanged={resource.reload} />;
            }}
        </ResourceBoundary>
    );
}
