"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { qrService, type ScanByRow } from "@/services/qr";
import { QrOffline } from "../qr-nav";
import { ScansView } from "./scans-view";

/** The facets the scans screen keeps in the URL: the person (required by the route), the outcome, the window. */
export interface ScansFacets {
    scannedById: string | null;
    outcome: string | null;
    /** `YYYY-MM-DD` as the date inputs hold them. */
    from: string | null;
    to: string | null;
}

export function scansFacetsOf(params: URLSearchParams): ScansFacets {
    return {
        scannedById: params.get("scannedById") || null,
        outcome: params.get("outcome") || null,
        from: params.get("from") || null,
        to: params.get("to") || null,
    };
}

export function scansFacetsQuery(facets: ScansFacets): string {
    const next = new URLSearchParams();
    if (facets.scannedById) next.set("scannedById", facets.scannedById);
    if (facets.outcome) next.set("outcome", facets.outcome);
    if (facets.from) next.set("from", facets.from);
    if (facets.to) next.set("to", facets.to);
    return next.toString();
}

/** A day's start and the next day's start as ISO instants, for `?from=&to=`. */
export function windowOf(facets: Pick<ScansFacets, "from" | "to">): { from?: string; to?: string } {
    const out: { from?: string; to?: string } = {};
    if (facets.from) out.from = new Date(`${facets.from}T00:00:00`).toISOString();
    if (facets.to) {
        const end = new Date(`${facets.to}T00:00:00`);
        end.setDate(end.getDate() + 1);
        out.to = end.toISOString();
    }
    return out;
}

/**
 * One person's scans — `GET /qr/scans?scannedById=` (K-B1). The route
 * needs a person, so the screen starts with a picker and the person's page
 * links here with the id in the URL; the outcome and the window narrow
 * the read on the server and sit in the key.
 */
export function ScansLoader() {
    const live = isLive("qr");
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const facets = scansFacetsOf(params);

    const setFacets = React.useCallback(
        (next: ScansFacets) => {
            const qs = scansFacetsQuery(next);
            router.replace(qs ? `${pathname}?${qs}` : pathname);
        },
        [pathname, router],
    );

    const resource = useApiResource<ScanByRow[] | null>(
        `qr:scans-by:${facets.scannedById ?? "none"}:${facets.outcome ?? "all"}:${facets.from ?? ""}:${facets.to ?? ""}:${live}`,
        () =>
            facets.scannedById
                ? qrService.scansBy({ scannedById: facets.scannedById, ...(facets.outcome ? { outcome: facets.outcome } : {}), ...windowOf(facets) })
                : Promise.resolve(null),
    );

    if (!live) return <QrOffline title="QR scans" subtitle="What one person has scanned, refusals included" />;

    /* With no person chosen the resource resolves null and the view draws the picker. */
    return (
        <ResourceBoundary resource={resource} empty={<ScansView rows={null} facets={facets} onFacetsChange={setFacets} />}>
            {(rows) => <ScansView rows={rows} facets={facets} onFacetsChange={setFacets} />}
        </ResourceBoundary>
    );
}
