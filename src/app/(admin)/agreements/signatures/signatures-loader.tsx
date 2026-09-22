"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import {
    SIGNING_PARTIES,
    SIGNING_STATUSES,
    agreementService,
    agreementsReadApi,
    type SigningParty,
    type SigningRequest,
    type SigningStatus,
} from "@/services/agreements";
import { AgreementsShell } from "../agreements-shell";
import { SignaturesView, type StatusFilter } from "./signatures-view";

/** How many requests one read shows; the desk is a queue, newest first. */
const PAGE_LIMIT = 100;

const isParty = (value: string | null): value is SigningParty => SIGNING_PARTIES.includes(value as SigningParty);
const isStatus = (value: string | null): value is SigningStatus => SIGNING_STATUSES.includes(value as SigningStatus);

/**
 * DS-1: the Signatures desk — every e-signature request, newest first, with
 * the party's link, remind, void, refresh and the three files. `?partyType=
 * &partyId=` from a party page lands on that party's requests; `?status=`
 * preselects a chip.
 */
export function SignaturesLoader() {
    const live = agreementsReadApi();
    const params = useSearchParams();
    const partyType = params.get("partyType");
    const partyId = params.get("partyId");
    const initialStatus = params.get("status");

    const [status, setStatus] = React.useState<StatusFilter>(isStatus(initialStatus) ? initialStatus : "OPEN");
    const [party, setParty] = React.useState<SigningParty | "ALL">(isParty(partyType) ? partyType : "ALL");
    const [q, setQ] = React.useState("");
    const scoped = isParty(partyType) && partyId ? { partyType, partyId } : null;

    const resource = useApiResource<SigningRequest[]>(`agreements:signing:${live}:${status}:${party}:${q}:${scoped ? `${scoped.partyType}:${scoped.partyId}` : "all"}`, async () => {
        if (!live) return [];
        const page = await agreementService.signing({
            limit: PAGE_LIMIT,
            ...(status !== "OPEN" && status !== "ALL" ? { status } : {}),
            ...(party !== "ALL" ? { partyType: party } : {}),
            ...(scoped ? { partyType: scoped.partyType, partyId: scoped.partyId } : {}),
            ...(q.trim() ? { q: q.trim() } : {}),
        });
        // "Open" is two statuses; the server filters one at a time.
        return status === "OPEN" ? page.rows.filter((row) => row.status === "REQUESTED" || row.status === "PARTIALLY_SIGNED") : page.rows;
    });

    return (
        <AgreementsShell>
            <ResourceBoundary resource={resource}>
                {(rows) => (
                    <SignaturesView
                        rows={rows}
                        status={status}
                        onStatus={setStatus}
                        party={party}
                        onParty={setParty}
                        q={q}
                        onQuery={setQ}
                        scoped={scoped}
                        onChanged={resource.reload}
                    />
                )}
            </ResourceBoundary>
        </AgreementsShell>
    );
}
