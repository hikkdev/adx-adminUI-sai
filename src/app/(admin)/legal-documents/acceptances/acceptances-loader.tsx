"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import {
    PARTY_TYPES,
    agreementService,
    agreementsReadApi,
    type AgreementAcceptance,
    type AgreementTemplate,
    type PartyType,
} from "@/services/agreements";
import { AgreementsShell } from "../agreements-shell";
import { AcceptancesView, type SelectedParty } from "./acceptances-view";

/** How many of the newest acceptances the log shows before a party is chosen. */
const RECENT_LIMIT = 50;

interface Loaded {
    recent: AgreementAcceptance[];
    /** Set when the URL names a template: the log is that template's acceptances. */
    template: AgreementTemplate | null;
}

const isPartyType = (value: string | null): value is PartyType =>
    PARTY_TYPES.includes(value as PartyType);

/**
 * The acceptances screen, with the chosen party kept in the URL so a link from
 * a publisher or advertiser page (`?type=publisher&id=…`) lands on their
 * record, and `?templateId=` from the versions table lands on that version's
 * acceptances.
 */
export function AcceptancesLoader() {
    const live = agreementsReadApi();
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();

    const type = params.get("type");
    const id = params.get("id");
    const templateId = params.get("templateId");
    const selected: SelectedParty | null = isPartyType(type) && id ? { type, id } : null;

    const select = React.useCallback(
        (party: SelectedParty | null) => {
            const next = new URLSearchParams();
            if (party) {
                next.set("type", party.type);
                next.set("id", party.id);
            }
            const query = next.toString();
            router.replace(query ? `${pathname}?${query}` : pathname);
        },
        [pathname, router]
    );

    const recent = useApiResource<Loaded>(`agreements:acceptances:${live}:${templateId ?? "all"}`, async () => {
        if (!live) return { recent: [], template: null };
        const [page, template] = await Promise.all([
            agreementService.acceptances(templateId ? { templateId, limit: RECENT_LIMIT } : { limit: RECENT_LIMIT }),
            templateId ? agreementService.template(templateId) : Promise.resolve(null),
        ]);
        return { recent: page.rows, template };
    });

    const party = useApiResource(
        `agreements:party:${live}:${selected ? `${selected.type}:${selected.id}` : "none"}`,
        () => (live && selected ? agreementService.party(selected.type, selected.id) : Promise.resolve(null))
    );

    return (
        <AgreementsShell>
            <ResourceBoundary resource={recent}>
                {(data) => (
                    <AcceptancesView
                        recent={data.recent}
                        template={data.template}
                        selected={selected}
                        party={party}
                        onSelect={select}
                    />
                )}
            </ResourceBoundary>
        </AgreementsShell>
    );
}
