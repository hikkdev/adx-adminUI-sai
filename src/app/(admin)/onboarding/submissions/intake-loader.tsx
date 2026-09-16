"use client";

import * as React from "react";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { Card } from "@/components/ui/card";
import { isLive } from "@/lib/api-config";
import { INTAKE_STATUSES, onboardingService, type IntakeFilter, type IntakeStatus, type IntakeUserType } from "@/services/onboarding";
import { IntakeView } from "./intake-view";

const USER_TYPES: IntakeUserType[] = ["AGENT", "EMPLOYEE", "PUBLISHER", "ADVERTISER", "PARTNER"];

const parseUserType = (value: string | undefined): IntakeUserType | undefined => {
    const upper = value?.toUpperCase();
    return USER_TYPES.find((type) => type === upper);
};
const parseStatus = (value: string | undefined): IntakeStatus | undefined => {
    const upper = value?.toUpperCase();
    return INTAKE_STATUSES.find((status) => status === upper);
};

/**
 * The intake list from `GET /onboarding/submissions` on E7-3's list
 * contract: `userType`, `status`, the search and the page are all the
 * server's own facets, and `counts` comes back without the status facet so
 * the status picker can say how many each would show. The Onboard buttons
 * on /agents and /employees land here with the type preset.
 */
export function IntakeLoader({ initialUserType, initialStatus }: { initialUserType?: string; initialStatus?: string }) {
    const live = isLive("kyc");
    const [filter, setFilter] = React.useState<IntakeFilter>({
        userType: parseUserType(initialUserType) ?? "AGENT",
        status: parseStatus(initialStatus),
        q: "",
        page: 1,
    });
    const q = useDebounced(filter.q?.trim() ?? "", 300);
    const effective = { ...filter, q };

    const resource = useApiResource(`intake:${filter.userType ?? "all"}:${filter.status ?? "all"}:${filter.page ?? 1}:${q}:${live}`, () =>
        onboardingService.page(effective)
    );

    if (!live) {
        return (
            <Card className="rounded-lg border-border p-5 shadow-none">
                <p className="text-sm text-muted-foreground">
                    The intake is read from the API and has no fixtures. Turn the KYC domain on to see what has been submitted.
                </p>
            </Card>
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(page) => <IntakeView page={page} filter={filter} onFilter={setFilter} onChanged={resource.reload} />}
        </ResourceBoundary>
    );
}
