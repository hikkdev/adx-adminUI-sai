"use client";

import * as React from "react";
import { PlugZap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { isLive } from "@/lib/api-config";
import { AUDIT_PAGE_SIZE, auditService, type AuditPage, type AuditQuery, type AuditSort } from "@/services/audit";
import { AuditView } from "./audit-view";

/**
 * The audit log's data.
 *
 * Every facet — the text search, the module chip, the target the drawer
 * pinned, the date window, the sort and the page — goes to the API and sits
 * in the resource key, so a change refetches rather than filtering the one
 * page the console happens to be holding. `counts` comes back computed with
 * the module facet removed, which is the only way each chip can say how many
 * rows it would show.
 *
 * No fixtures. The ten seeded `aud_*` rows this page used to draw named
 * actors, modules and targets the backend never issued; with the API off the
 * page says so rather than showing a trail nobody left.
 */

export interface AuditFilter {
    q: string;
    module: string | null;
    target: { type: string; id: string } | null;
    from: string;
    to: string;
    sort: AuditSort;
}

const INITIAL: AuditFilter = { q: "", module: null, target: null, from: "", to: "", sort: "newest" };

/** The wire query for a filter — pure, so the key and the fetch cannot disagree. */
export function toQuery(filter: AuditFilter, page: number): AuditQuery {
    return {
        ...(filter.q.trim() ? { q: filter.q.trim() } : {}),
        ...(filter.module ? { module: filter.module } : {}),
        ...(filter.target ? { targetType: filter.target.type, targetId: filter.target.id } : {}),
        ...(filter.from ? { from: filter.from } : {}),
        /* A bare `to` date is the start of that day; the window should include the day. */
        ...(filter.to ? { to: `${filter.to}T23:59:59.999Z` } : {}),
        sort: filter.sort,
        page,
        pageSize: AUDIT_PAGE_SIZE,
    };
}

export function AuditLoader() {
    const live = isLive("audit");
    const [filter, setFilter] = React.useState<AuditFilter>(INITIAL);
    const [page, setPage] = React.useState(1);
    const settledQ = useDebounced(filter.q.trim());

    const query = toQuery({ ...filter, q: settledQ }, page);
    const key = `audit:list:${JSON.stringify(query)}:${live}`;
    const resource = useApiResource<AuditPage | null>(key, () => (live ? auditService.list(query) : Promise.resolve(null)));

    /* A new facet starts from the first page: page 4 of a narrower result
       is usually empty, and "no activity" would be a lie. */
    const changeFilter = (patch: Partial<AuditFilter>) => {
        setFilter((current) => ({ ...current, ...patch }));
        setPage(1);
    };

    if (!live) {
        return (
            <Card className="rounded-lg border-border p-8 text-center shadow-none">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                    <PlugZap className="size-6 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">Not connected to the ADX backend</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                    The audit log is the record of who did what. There is no seeded stand-in, because a fixture trail would be a
                    claim about actions nobody took. Set{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_USE_API=true</code> and point the console at
                    a running backend.
                </p>
            </Card>
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(data) =>
                data ? (
                    <AuditView
                        page={data}
                        filter={filter}
                        onFilterChange={changeFilter}
                        pageNumber={page}
                        onPageChange={setPage}
                        exportQuery={query}
                    />
                ) : null
            }
        </ResourceBoundary>
    );
}
