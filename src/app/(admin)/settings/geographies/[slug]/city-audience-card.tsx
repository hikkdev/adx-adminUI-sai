"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AudienceFigures, AudiencePeriodSelect, ProvenanceTag } from "@/components/adx/audience-panel";
import { StatusBadge } from "@/components/adx/status-badge";
import { useApiResource } from "@/lib/use-api-resource";
import { AUDIENCE_GROUPS, AUDIENCE_GROUP_LABEL, audiencePeriods, audiencePolicyPreview, audienceVendorsLabel, currentAudiencePeriod } from "@/services/audience";
import { coverageSentence, geoService, type CityAudienceProfile } from "@/services/geo";

/**
 * Y-C: the Audience card on a city's page — `GET /geo/cities/:slug/audience`
 * for one of the last three months. The blend over the city's live spots'
 * stored panels: the MEAN daily footfall per catchment (a city's spots
 * overlap; a sum would count the same street twice), the mixes weighted
 * by footfall, "N of M spots have data", the vendors in force with who
 * each group came from, and how far the two vendors agree. It calls no
 * vendor — unless ops turned the sample grid on in the platform settings,
 * in which case the card says what the grid gave.
 *
 * With no vendor configured it says "No panel backs this yet" and points
 * at the integrations card, rather than draw an empty chart.
 */
export function CityAudienceCard({ slug, cityName, now = new Date() }: { slug: string; cityName: string; now?: Date }) {
    const periods = React.useMemo(() => audiencePeriods(now), [now]);
    const [period, setPeriod] = React.useState(() => currentAudiencePeriod(now));
    const resource = useApiResource<CityAudienceProfile>(`geo:city-audience:${slug}:${period}`, () => geoService.cityAudience(slug, period));

    return (
        <Card className="rounded-lg border-border p-4 shadow-none" data-testid="city-audience">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Audience</h3>
                    {resource.data && resource.data.vendors.length > 0 ? (
                        <StatusBadge status={{ label: audienceVendorsLabel(resource.data.vendors), tone: "info" }} />
                    ) : null}
                </div>
                <AudiencePeriodSelect value={period} periods={periods} onChange={setPeriod} />
            </div>

            {resource.loading && !resource.data ? (
                <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden /> Reading the stored panels…
                </p>
            ) : resource.error ? (
                <div className="mt-3">
                    <p className="text-xs text-danger">{resource.error}</p>
                    <Button size="sm" variant="outline" className="mt-2 bg-card" onClick={resource.reload}>
                        Try again
                    </Button>
                </div>
            ) : resource.data ? (
                <CityAudienceBody profile={resource.data} cityName={cityName} />
            ) : null}
        </Card>
    );
}

function CityAudienceBody({ profile, cityName }: { profile: CityAudienceProfile; cityName: string }) {
    if (profile.vendors.length === 0) {
        return (
            <div className="mt-3 flex items-start gap-3 rounded-md border border-dashed p-3">
                <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">No panel backs this yet</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        No audience vendor is configured, so nothing here is a figure. Switch GeoIQ or Azira on under{" "}
                        <Link href="/settings/integrations" className="underline underline-offset-4">
                            Integrations › Audience data
                        </Link>{" "}
                        and the spots in {cityName} fill in as they are read.
                    </p>
                </div>
            </div>
        );
    }

    const covered = profile.coverage.withSnapshot + (profile.samplePoints?.withSnapshot ?? 0);
    return (
        <div className="mt-3 space-y-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span data-testid="coverage">{coverageSentence(profile.coverage)}</span>
                {profile.samplePoints ? (
                    <span data-testid="sample-points">
                        Sample grid: {profile.samplePoints.withSnapshot} of {profile.samplePoints.asked} points answered ({profile.samplePoints.configured} configured)
                    </span>
                ) : null}
            </div>

            {covered === 0 ? (
                <p className="text-sm text-muted-foreground">
                    {audienceVendorsLabel(profile.vendors)} {profile.vendors.length > 1 ? "have" : "has"} no stored panel for any live spot in {cityName} this month. A spot&apos;s
                    panel is fetched when its page is read; the city fills in from those.
                </p>
            ) : (
                <AudienceFigures
                    footfall={profile.footfall}
                    demographics={profile.demographics}
                    provenanceByField={profile.provenanceByField}
                    agreement={profile.agreement}
                    dailyHint="mean per catchment"
                />
            )}

            <div className="rounded-md bg-muted/40 p-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="font-medium text-foreground">In force: {audienceVendorsLabel(profile.vendors)}</span>
                    {AUDIENCE_GROUPS.map((group) => (
                        <span key={group} className="inline-flex items-center gap-1 text-muted-foreground">
                            {AUDIENCE_GROUP_LABEL[group]} <ProvenanceTag source={profile.provenanceByField[group]} />
                        </span>
                    ))}
                </div>
                {profile.policy ? <p className="mt-1.5 text-[11px] text-muted-foreground">{audiencePolicyPreview(profile.policy, profile.vendors)}</p> : null}
                <p className="mt-1.5 text-[11px] text-muted-foreground">{profile.basis}. Panel figures, modelled by the vendor; nothing here was observed by ADX.</p>
            </div>
        </div>
    );
}
