"use client";

import * as React from "react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { integrityService, type LeadFlagsPage, type QaSample } from "@/services/leads";
import { LeadsOffline } from "../leads-offline";
import { IntegrityView, type IntegrityFilter } from "./integrity-view";

/**
 * LH10: the integrity desk's two reads — the flags under the filter, and the
 * latest sampled field work. The samples are a side read on their own key,
 * so a filter change on the flags does not re-fetch them.
 */
export function IntegrityLoader() {
    const live = isLive("leads");
    const [filter, setFilter] = React.useState<IntegrityFilter>({ status: "OPEN", kind: "ALL" });
    const [nonce, setNonce] = React.useState(0);

    const flags = useApiResource<LeadFlagsPage>(`leads:flags:${live}:${filter.status}:${filter.kind}:${nonce}`, () =>
        integrityService.flags({
            ...(filter.status === "ALL" ? {} : { status: filter.status }),
            ...(filter.kind === "ALL" ? {} : { kind: filter.kind }),
            limit: 100,
        })
    );
    const samples = useApiResource<{ items: QaSample[]; total: number }>(`leads:qa:${live}:${nonce}`, () => integrityService.qa({ limit: 50 }));

    if (!live) return <LeadsOffline />;
    return (
        <ResourceBoundary resource={flags}>
            {(data) => (
                <IntegrityView
                    flags={data}
                    samples={samples.data ?? { items: [], total: 0 }}
                    filter={filter}
                    onFilter={setFilter}
                    onChanged={() => setNonce((value) => value + 1)}
                />
            )}
        </ResourceBoundary>
    );
}
