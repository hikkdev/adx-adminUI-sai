"use client";

import { notFound } from "next/navigation";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { agentApplicationService, type ApplicationView } from "@/services/agent-applications";
import { employeesService, type EmployeeRow } from "@/services/employees";
import { ApplicationWorkbench } from "./application-workbench";

interface Loaded {
    view: ApplicationView | null;
    /** Active staff, for the reporting-manager pick and to name the one already set. Empty when the read failed. */
    staff: EmployeeRow[];
}

/**
 * The application and the staff list, read together: the decision panel
 * picks a reporting manager from the staff, and the engagement card names
 * the one already chosen. A failed staff read costs a name, not the page.
 */
export function ApplicationLoader({ id }: { id: string }) {
    const live = isLive("agents");
    const resource = useApiResource<Loaded>(`agents:application:${id}:${live}`, async () => {
        const [view, staff] = await Promise.all([
            agentApplicationService.get(id),
            employeesService.listAll({ active: true }).catch(() => [] as EmployeeRow[]),
        ]);
        return { view, staff };
    });

    return (
        <ResourceBoundary resource={resource}>
            {(data) => {
                if (!data.view) notFound();
                return <ApplicationWorkbench view={data.view} staff={data.staff} onChanged={resource.reload} />;
            }}
        </ResourceBoundary>
    );
}
