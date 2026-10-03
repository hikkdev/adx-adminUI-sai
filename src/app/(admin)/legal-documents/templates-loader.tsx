"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { agreementService, agreementsReadApi, type AgreementTemplate } from "@/services/agreements";
import { AgreementsShell } from "./agreements-shell";
import { TemplatesView } from "./templates-view";

/** Every version of every kind, in one read — four kinds is not a list worth paging. */
export function TemplatesLoader() {
    const live = agreementsReadApi();

    const resource = useApiResource<AgreementTemplate[]>(`agreements:templates:${live}`, () =>
        live ? agreementService.templates() : Promise.resolve([])
    );

    return (
        <AgreementsShell>
            <ResourceBoundary resource={resource}>
                {(templates) => <TemplatesView templates={templates} onChanged={resource.reload} />}
            </ResourceBoundary>
        </AgreementsShell>
    );
}
