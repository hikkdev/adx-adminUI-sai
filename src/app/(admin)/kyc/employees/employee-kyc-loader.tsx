"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { employeeKycService, type EmployeeKycQueue as EmployeeKycQueueData } from "@/services/employee-kyc";
import { kycStateFilter } from "@/services/kyc-state";
import { useStateChip } from "../_shared/use-state-chip";
import { EmployeeKycQueue } from "./employee-kyc-queue";

export interface LoadedEmployeeQueue {
    /** The chip in force, from the server. */
    visible: EmployeeKycQueueData;
    /** Every employee, for the header's counts. */
    everything: EmployeeKycQueueData;
}

/**
 * Every employee, from `GET /employee-kyc` — N3-B: the queue lists parties,
 * each in one of six states, and `meta.counts` is the chips; N3-C: the
 * chip in force is sent as `?state=` and kept in the URL. The Escalated
 * chip is not a facet this desk answers (employees are not escalated), so
 * it reads the whole queue and the view narrows to none. There is no
 * fixture for employee KYC — the domain was born live — so when the KYC
 * domain is off the queue is simply empty and says so.
 */
export function EmployeeKycLoader() {
    const live = isLive("kyc");
    const [chip, setChip] = useStateChip();
    const resource = useApiResource<LoadedEmployeeQueue>(`employee-kyc:${live}:${chip}`, async () => {
        const filter = kycStateFilter(chip);
        const [everything, visible] = await Promise.all([
            employeeKycService.queue(),
            filter.state ? employeeKycService.queue({ state: filter.state }) : Promise.resolve(null),
        ]);
        return { everything, visible: visible ?? (chip === "ESCALATED" ? { ...everything, rows: [], total: 0 } : everything) };
    });

    return (
        <ResourceBoundary resource={resource}>
            {(data) => <EmployeeKycQueue loaded={data} chip={chip} onChip={setChip} live={live} onChanged={resource.reload} />}
        </ResourceBoundary>
    );
}
