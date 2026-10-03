"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import type { AdvertiserPick } from "@/components/adx/advertiser-combobox";
import { EMPTY_CITY_FACET, cityFacetValue, type CityFacet } from "@/lib/city-facet";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { isLive } from "@/lib/api-config";
import { advertiserService } from "@/services/advertisers";
import {
    CAMPAIGN_GOAL_LABEL,
    CAMPAIGN_SORTS,
    CAMPAIGN_STATUSES,
    campaignService,
    type CampaignListQuery,
    type CampaignSort,
    type CampaignStatus,
    type CampaignsPage,
} from "@/services/campaigns";
import { CampaignsTable } from "./campaigns-table";

/**
 * The campaigns list's data — `/campaigns/directory` since 2 Oct 2026.
 *
 * Every facet is the server's and lives in the URL — `?status=`, `?q=`,
 * `?advertiserId=`, `?city=`, `?from=`/`?to=` (the flight overlaps),
 * `?waitingOn=`, and the overview's `?goal=` and `?sort=` — so its tiles, the advertiser page's "View
 * campaign queue" and a pasted link all open it already narrowed, and the
 * status counts and the pager cover the whole result rather than a page.
 *
 * No fixture fallback: the seeded `cmp_*` ids were never issued by the
 * backend.
 */

/** One page of the server's. */
export const CAMPAIGNS_PAGE_SIZE = 25;

/** The URL's facets, read. Anything unknown is no filter. */
export interface CampaignsFilters {
    status: CampaignStatus | "ALL";
    q: string;
    advertiserId: string | null;
    city: string;
    from: string;
    to: string;
    waitingOn: string | null;
    /** The overview's By goal rows; no control on the bar, cleared by Clear. */
    goal: string | null;
    /** NEWEST unless a link asked otherwise (Ending soon asks ENDING_SOON). */
    sort: CampaignSort;
    page: number;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A goal the list knows, or none — the route refuses a typo with a 400. */
const goalOf = (value: string | null): string | null => {
    const upper = (value ?? "").toUpperCase();
    return upper in CAMPAIGN_GOAL_LABEL ? upper : null;
};

export function filtersFromQuery(params: URLSearchParams): CampaignsFilters {
    const status = (params.get("status") ?? "").toUpperCase();
    const page = Number(params.get("page") ?? "1");
    const day = (key: string) => {
        const value = params.get(key) ?? "";
        return DAY.test(value) ? value : "";
    };
    return {
        status: (CAMPAIGN_STATUSES as readonly string[]).includes(status) ? (status as CampaignStatus) : "ALL",
        q: params.get("q") ?? "",
        advertiserId: params.get("advertiserId") || null,
        city: params.get("city") ?? "",
        from: day("from"),
        to: day("to"),
        waitingOn: params.get("waitingOn")?.toUpperCase() || null,
        goal: goalOf(params.get("goal")),
        sort: (CAMPAIGN_SORTS as readonly string[]).includes((params.get("sort") ?? "").toUpperCase()) ? ((params.get("sort") ?? "").toUpperCase() as CampaignSort) : "NEWEST",
        page: Number.isInteger(page) && page > 1 ? page : 1,
    };
}

/** What the read sends for these filters. */
export function listQueryOf(filters: CampaignsFilters, q: string): CampaignListQuery {
    return {
        ...(filters.status === "ALL" ? {} : { status: [filters.status] }),
        ...(q ? { q } : {}),
        ...(filters.advertiserId ? { advertiserId: filters.advertiserId } : {}),
        ...(filters.city.trim() ? { city: filters.city.trim() } : {}),
        ...(filters.from ? { from: filters.from } : {}),
        ...(filters.to ? { to: filters.to } : {}),
        ...(filters.waitingOn ? { waitingOn: [filters.waitingOn] } : {}),
        ...(filters.goal ? { goal: [filters.goal] } : {}),
        sort: filters.sort,
    };
}

export function CampaignsLoader() {
    const live = isLive("campaigns");
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const filters = filtersFromQuery(new URLSearchParams(params.toString()));

    /* The search box is typed into here and reaches the URL once it settles. */
    const [text, setText] = React.useState(filters.q);
    const settled = useDebounced(text.trim(), 350);
    /* The city as the shared field hands it back: a pick sends its catalogue slug, free text goes as typed (`cityFacetValue`). */
    const [city, setCity] = React.useState<CityFacet>({ text: filters.city, slug: filters.city || null });
    const settledCity = useDebounced(cityFacetValue(city), 350);

    const setFilters = React.useCallback(
        (patch: Partial<CampaignsFilters>) => {
            const query = new URLSearchParams(params.toString());
            const next = { ...filtersFromQuery(query), ...patch };
            // A new filter starts at the first page; only a page change keeps its own.
            if (!("page" in patch)) next.page = 1;
            const set = (key: string, value: string | null) => (value ? query.set(key, value) : query.delete(key));
            set("status", next.status === "ALL" ? null : next.status);
            set("q", next.q.trim() || null);
            set("advertiserId", next.advertiserId);
            set("city", next.city.trim() || null);
            set("from", next.from || null);
            set("to", next.to || null);
            set("waitingOn", next.waitingOn);
            set("goal", next.goal);
            set("sort", next.sort === "NEWEST" ? null : next.sort);
            set("page", next.page > 1 ? String(next.page) : null);
            const qs = query.toString();
            router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        },
        [params, pathname, router],
    );

    React.useEffect(() => {
        if (settled !== filters.q.trim()) setFilters({ q: settled });
        // Only the settled text drives this; the URL's own q is read, not watched.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settled]);
    React.useEffect(() => {
        if (settledCity !== filters.city.trim()) setFilters({ city: settledCity });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settledCity]);

    const query = { ...listQueryOf(filters, filters.q.trim()), page: filters.page, pageSize: CAMPAIGNS_PAGE_SIZE };
    const key = JSON.stringify(query);
    const resource = useApiResource<CampaignsPage>(`campaigns:list:${key}:${live}`, () => campaignService.list(query));

    /* The advertiser the URL names, as the field shows it — the business's name, read once. */
    const advertiserLabel = useApiResource<string | null>(`campaigns:advertiser-label:${filters.advertiserId ?? ""}:${live}`, async () => {
        if (!live || !filters.advertiserId) return null;
        const advertiser = await advertiserService.get(filters.advertiserId).catch(() => null);
        return advertiser ? advertiser.companyName?.trim() || advertiser.name : null;
    });
    const advertiser: AdvertiserPick | null = filters.advertiserId ? { id: filters.advertiserId, label: advertiserLabel.data ?? filters.advertiserId } : null;

    if (!live) {
        return (
            <div className="space-y-6">
                <PageHeader title="Campaigns" subtitle="Advertiser campaigns across the market." />
                <EmptyState
                    icon={PlugZap}
                    title="Campaigns read the API"
                    description="This console is running on fixtures. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend."
                />
            </div>
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(page) => (
                <CampaignsTable
                    page={page}
                    filters={filters}
                    searchText={text}
                    onSearchText={setText}
                    city={city}
                    onCity={setCity}
                    advertiser={advertiser}
                    onFilters={setFilters}
                    onClear={() => {
                        setText("");
                        setCity(EMPTY_CITY_FACET);
                        router.replace(pathname, { scroll: false });
                    }}
                    refreshing={resource.loading}
                    exportQuery={listQueryOf(filters, filters.q.trim())}
                    pageSize={CAMPAIGNS_PAGE_SIZE}
                    onChanged={resource.reload}
                />
            )}
        </ResourceBoundary>
    );
}
