"use client";

import * as React from "react";
import { PlugZap } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { fraudService, parseScanParam, type FraudCaseStatus, type FraudCasesPage, type ScanResult } from "@/services/fraud";
import { usersService, type UserRow } from "@/services/users";
import { FraudView } from "./fraud-view";

/** The queue's facets: the status chips and the search. */
export interface FraudFacets {
    status: FraudCaseStatus | "ALL";
    q: string;
}

/**
 * The fraud desk's data: the queue under the facets in force, the
 * console's own ADMIN users for the "assigned to" and "hand to" pickers
 * (`GET /users?role=ADMIN` — the pickers' options only; G11-1: the people
 * on a case are named by the rows themselves, `openedBy` / `assignedTo` /
 * `decidedBy` / `escalatedTo`), and — when a party page sent the desk a
 * `?scan=TYPE:id` — the scan over that party (`POST /fraud/scan/:type/:id`,
 * run once on arrival, stored nowhere). Both facets sit in the resource
 * key, so a change refetches rather than filtering the page the console
 * happens to hold; `counts` comes back computed without the status facet,
 * which is how the chips say how many each would show.
 */
export function FraudLoader() {
    const live = isLive("fraud");
    const params = useSearchParams();
    const preselect = params.get("case");
    const scanTarget = parseScanParam(params.get("scan"));
    const [facets, setFacets] = React.useState<FraudFacets>({ status: "ALL", q: "" });
    const q = useDebounced(facets.q.trim(), 300);

    const resource = useApiResource<FraudCasesPage>(`fraud:cases:${live}:${facets.status}:${q}`, () =>
        fraudService.list({
            ...(q ? { q } : {}),
            ...(facets.status === "ALL" ? {} : { status: [facets.status] }),
            sort: "NEWEST",
            pageSize: 100,
        })
    );
    const admins = useApiResource<UserRow[]>(`fraud:admins:${live}`, async () =>
        live ? usersService.list({ closed: false, role: "ADMIN" }) : []
    );
    const scan = useApiResource<ScanResult | null>(
        `fraud:scan:${live}:${scanTarget ? `${scanTarget.subjectType}:${scanTarget.subjectId}` : ""}`,
        async () => (live && scanTarget ? fraudService.scan(scanTarget.subjectType, scanTarget.subjectId) : null)
    );

    if (!live) {
        return (
            <div className="space-y-5">
                <PageHeader title="Fraud investigation" subtitle="Linked accounts flagged by the fraud engine" />
                <EmptyState
                    icon={PlugZap}
                    title="Fraud cases read the API"
                    description="There are no fraud fixtures — a confirmed case suspends somebody's account and freezes their money. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend to work the desk."
                />
            </div>
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(page) => (
                <FraudView
                    page={page}
                    facets={facets}
                    onFacetsChange={setFacets}
                    admins={admins.data ?? []}
                    preselectId={preselect}
                    scan={
                        scanTarget
                            ? { state: scan.loading ? "loading" : scan.error ? "error" : "idle", result: scan.data, error: scan.error }
                            : null
                    }
                    onChanged={resource.reload}
                />
            )}
        </ResourceBoundary>
    );
}
