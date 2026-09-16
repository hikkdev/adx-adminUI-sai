"use client";

import * as React from "react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { accountLifecycleService, type ClosureCase, type ClosureDecision, type ListPage } from "@/services/users";
import { UsersOffline } from "../users-nav";
import { ClosuresView } from "./closures-view";

/**
 * The closure queue's data — Lot A (Q21).
 *
 * Both facets go to the API and both sit in the resource key, so a change
 * refetches rather than filtering the one page the console happens to hold.
 * `counts` comes back computed with the decision facet removed, which is what
 * lets every option in the Select say how many cases it would show, and
 * `total` is the real size of the queue under the search rather than however
 * much of it fitted on this page.
 *
 * No fixtures, and none were removed to get here: no seed file has ever
 * described a closure case. A case is somebody's request to leave with the
 * money they are owed; a seeded one would be an account nobody asked to close.
 */

/** One page. Generous, and the header says so when there is more behind it. */
const PAGE_SIZE = 100;

export function ClosuresLoader() {
    const live = isLive("users");
    const [decision, setDecision] = React.useState<ClosureDecision | "ALL">("PENDING");
    const [query, setQuery] = React.useState("");
    const q = useDebounced(query.trim(), 350);

    const resource = useApiResource<ListPage<ClosureCase>>(
        `users:closure-cases:${decision}:${q}:${live}`,
        () =>
            accountLifecycleService.closureCases({
                ...(decision === "ALL" ? {} : { decision }),
                ...(q ? { q } : {}),
                pageSize: PAGE_SIZE,
            }),
    );

    if (!live) {
        return (
            <UsersOffline
                title="Closure cases"
                subtitle="Accounts somebody has asked to close, and what stands in the way."
            />
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(page) => (
                <ClosuresView
                    page={page}
                    decision={decision}
                    onDecisionChange={setDecision}
                    query={query}
                    onQueryChange={setQuery}
                    onChanged={resource.reload}
                />
            )}
        </ResourceBoundary>
    );
}
