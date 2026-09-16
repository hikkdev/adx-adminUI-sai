"use client";

import * as React from "react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { accountLifecycleService, type ErasureRequest, type ErasureStatus, type ListPage } from "@/services/users";
import { UsersOffline } from "../users-nav";
import { ErasureView } from "./erasure-view";

/**
 * The erasure queue's data — Lot A (Q60).
 *
 * The status facet and the search both go to the API and both sit in the
 * resource key. `counts` comes back computed with the status removed, so
 * every option in the Select can say how many requests it would show.
 *
 * No fixtures, and none were removed to get here: no seed file has ever
 * described an erasure request. A request is a legal obligation with a
 * thirty-day clock on it; a seeded one would be a deadline nobody is under.
 */

const PAGE_SIZE = 100;

export function ErasureLoader() {
    const live = isLive("users");
    const [status, setStatus] = React.useState<ErasureStatus | "ALL">("ALL");
    const [query, setQuery] = React.useState("");
    const q = useDebounced(query.trim(), 350);

    const resource = useApiResource<ListPage<ErasureRequest>>(
        `users:erasure:${status}:${q}:${live}`,
        () =>
            accountLifecycleService.erasureRequests({
                ...(status === "ALL" ? {} : { status }),
                ...(q ? { q } : {}),
                pageSize: PAGE_SIZE,
            }),
    );

    if (!live) {
        return (
            <UsersOffline
                title="Erasure requests"
                subtitle="People who asked to be forgotten, and where each request has got to."
            />
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(page) => (
                <ErasureView
                    page={page}
                    status={status}
                    onStatusChange={setStatus}
                    query={query}
                    onQueryChange={setQuery}
                    onChanged={resource.reload}
                />
            )}
        </ResourceBoundary>
    );
}
