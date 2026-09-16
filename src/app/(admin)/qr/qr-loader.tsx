"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { QR_TYPES, qrService, type QrDeskRow, type QrPage, type QrType } from "@/services/qr";
import { QrOffline } from "./qr-nav";
import { QrView } from "./qr-view";

/** One page of codes. The pager below the table walks the rest. */
export const QR_PAGE_SIZE = 25;

/** The facets the desk keeps in the URL, so a filtered view is a link. */
export interface QrFacets {
    type: QrType | null;
    /** null is both; true live only; false deactivated only. */
    active: boolean | null;
    page: number;
}

const isType = (value: string | null): value is QrType => QR_TYPES.includes(value as QrType);

export function qrFacetsOf(params: URLSearchParams): QrFacets {
    const type = params.get("type");
    const active = params.get("active");
    const page = Number(params.get("page") ?? "1");
    return {
        type: isType(type) ? type : null,
        active: active === "true" ? true : active === "false" ? false : null,
        page: Number.isInteger(page) && page > 0 ? page : 1,
    };
}

export function qrFacetsQuery(facets: QrFacets): string {
    const next = new URLSearchParams();
    if (facets.type) next.set("type", facets.type);
    if (facets.active !== null) next.set("active", String(facets.active));
    if (facets.page > 1) next.set("page", String(facets.page));
    return next.toString();
}

/**
 * The desk's data — `GET /qr` (K-B1), the list contract: the type facet,
 * the active facet, the search and the page all go to the API and sit in
 * the resource key, and `counts` comes back per type with the type facet
 * removed, which is what lets every chip say how many it would show.
 */
export function QrLoader() {
    const live = isLive("qr");
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const facets = qrFacetsOf(params);

    const [query, setQuery] = React.useState("");
    const q = useDebounced(query.trim(), 300);

    const setFacets = React.useCallback(
        (next: QrFacets) => {
            const qs = qrFacetsQuery(next);
            router.replace(qs ? `${pathname}?${qs}` : pathname);
        },
        [pathname, router],
    );

    const resource = useApiResource<QrPage<QrDeskRow>>(
        `qr:list:${facets.type ?? "all"}:${facets.active ?? "both"}:${q}:${facets.page}:${live}`,
        () =>
            qrService.list({
                ...(facets.type ? { type: facets.type } : {}),
                ...(facets.active === null ? {} : { active: facets.active }),
                ...(q ? { q } : {}),
                page: facets.page,
                pageSize: QR_PAGE_SIZE,
            }),
    );

    if (!live) return <QrOffline title="QR codes" subtitle="Every signed code on the platform, what it names, and who has scanned it" />;

    return (
        <ResourceBoundary resource={resource}>
            {(page) => (
                <QrView page={page} facets={facets} onFacetsChange={setFacets} query={query} onQueryChange={setQuery} onChanged={resource.reload} />
            )}
        </ResourceBoundary>
    );
}
