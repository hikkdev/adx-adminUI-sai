"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/adx/page-header";
import type { ApiResource } from "@/lib/use-api-resource";
import { geoCityLabel, type CityReadiness, type GeoCityDetail } from "@/services/geo";
import { CityPanel } from "../city-panel";
import { CityAudienceCard } from "./city-audience-card";
import { CityProjectsCard } from "./city-projects-card";

interface CityViewProps {
    detail: GeoCityDetail;
    readiness: Pick<ApiResource<CityReadiness | null>, "data" | "loading" | "error">;
    onChanged: () => void;
    mayEdit: boolean;
}

/** `/settings/geographies/[slug]` — the panel under the page header, the Y-C audience card after it, then the city's region projects (Lot AA). */
export function CityView({ detail, readiness, onChanged, mayEdit }: CityViewProps) {
    return (
        <div className="space-y-5">
            <div>
                <Link href="/settings/geographies?tab=cities" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
                    <ChevronLeft className="size-4" />
                    Geographies
                </Link>
                <PageHeader
                    className="mt-2"
                    title={geoCityLabel(detail)}
                    subtitle={`${detail.counts.listingsLive} live listing${detail.counts.listingsLive === 1 ? "" : "s"} · ${detail.counts.publishers} publisher${detail.counts.publishers === 1 ? "" : "s"} · ${detail.counts.agents} agent${detail.counts.agents === 1 ? "" : "s"}`}
                />
            </div>
            <div className="max-w-3xl space-y-4">
                <CityPanel detail={detail} readiness={readiness} onChanged={onChanged} mayEdit={mayEdit} />
                <CityAudienceCard slug={detail.slug} cityName={detail.name} />
                <CityProjectsCard cityId={detail.id} cityName={detail.name} mayCreate={mayEdit} />
            </div>
        </div>
    );
}
