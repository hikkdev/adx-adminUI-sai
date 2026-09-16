"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AudienceFigures, AudiencePeriodSelect, RawVendorAnswer } from "@/components/adx/audience-panel";
import { StatusBadge } from "@/components/adx/status-badge";
import { useApiResource } from "@/lib/use-api-resource";
import { AUDIENCE_VENDORS, AUDIENCE_VENDOR_LABEL, audiencePeriods, audienceVendorsLabel, currentAudiencePeriod } from "@/services/audience";
import { listingsService, type ListingAudience } from "@/services/listings";

/**
 * G7 (Q109) / Y-C: the audience panel on a listing's page —
 * `GET /listings/:id/audience` for one of the last three months. The
 * vendors' panel for the circle around the spot, blended by the policy:
 * the daily footfall with its hour and weekday profiles, the four mixes,
 * who each section came from, and how far the two vendors agree on the
 * daily figure. "By vendor" shows each vendor's own answer beside the
 * blend, for the desk that wants to see what was averaged. A vendor in
 * force that could not answer this read is named with its reason; the
 * other's answer stands.
 *
 * The first read of a month asks every enabled vendor (a billable call
 * each); the rest come from the stored rows, and the card says so.
 */
export function ListingAudienceCard({ listingId, now = new Date(), className }: { listingId: string; now?: Date; className?: string }) {
    const periods = React.useMemo(() => audiencePeriods(now), [now]);
    const [period, setPeriod] = React.useState(() => currentAudiencePeriod(now));
    const [byVendor, setByVendor] = React.useState(false);
    const resource = useApiResource<ListingAudience>(`listing:${listingId}:audience:${period}`, () => listingsService.audience(listingId, period));

    return (
        <Card className={className ? `rounded-lg border-border p-5 shadow-none ${className}` : "rounded-lg border-border p-5 shadow-none"} data-testid="listing-audience">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-foreground">Audience</h3>
                    {resource.data && resource.data.providers.length > 0 ? (
                        <StatusBadge status={{ label: audienceVendorsLabel(resource.data.providers), tone: "info" }} />
                    ) : null}
                    {resource.data?.cached ? <span className="text-xs text-muted-foreground">stored</span> : null}
                </div>
                <div className="flex items-center gap-3">
                    {resource.data?.audience ? (
                        <div className="flex items-center gap-2">
                            <Switch id="audience-by-vendor" checked={byVendor} onCheckedChange={setByVendor} aria-label="By vendor" />
                            <Label htmlFor="audience-by-vendor" className="text-xs">
                                By vendor
                            </Label>
                        </div>
                    ) : null}
                    <AudiencePeriodSelect value={period} periods={periods} onChange={setPeriod} />
                </div>
            </div>

            {resource.loading && !resource.data ? (
                <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Asking the panels…
                </p>
            ) : resource.error ? (
                <div className="mt-4">
                    <p className="text-sm text-danger">{resource.error}</p>
                    <Button size="sm" variant="outline" className="mt-2 bg-card" onClick={resource.reload}>
                        Try again
                    </Button>
                </div>
            ) : resource.data ? (
                <ListingAudienceBody data={resource.data} byVendor={byVendor} />
            ) : null}
        </Card>
    );
}

function ListingAudienceBody({ data, byVendor }: { data: ListingAudience; byVendor: boolean }) {
    if (data.providers.length === 0) {
        return (
            <p className="mt-4 text-sm text-muted-foreground">
                No panel backs this yet: no audience vendor is configured. Switch one on under{" "}
                <Link href="/settings/integrations" className="underline underline-offset-4">
                    Integrations › Audience data
                </Link>
                .
            </p>
        );
    }

    return (
        <div className="mt-4 space-y-4">
            {data.unavailable.length > 0 ? (
                <ul className="space-y-1" data-testid="unavailable">
                    {data.unavailable.map((row) => (
                        <li key={row.vendor} className="flex items-start gap-2 text-xs text-warning">
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                            <span>
                                <span className="font-medium">{AUDIENCE_VENDOR_LABEL[row.vendor]}</span> could not answer: {row.reason}
                            </span>
                        </li>
                    ))}
                </ul>
            ) : null}

            {data.audience ? (
                <>
                    <AudienceFigures
                        footfall={data.audience.footfall}
                        demographics={data.audience.demographics}
                        provenanceByField={data.audience.provenanceByField}
                        agreement={data.audience.agreement}
                        dailyHint={`in the ${data.audience.radiusM} m catchment`}
                    />
                    {byVendor ? (
                        <div className="grid gap-3 sm:grid-cols-2" data-testid="by-vendor">
                            {AUDIENCE_VENDORS.filter((vendor) => data.providers.includes(vendor)).map((vendor) => (
                                <RawVendorAnswer key={vendor} vendor={vendor} answer={data.audience?.rawByVendor[vendor]} />
                            ))}
                        </div>
                    ) : null}
                </>
            ) : null}

            <p className={data.audience ? "text-[11px] text-muted-foreground" : "text-sm text-muted-foreground"}>
                {data.basis}.{data.audience ? " Panel figures, modelled by the vendor; nothing here was observed by ADX." : ""}
            </p>
        </div>
    );
}
