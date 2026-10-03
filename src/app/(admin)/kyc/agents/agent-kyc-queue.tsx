"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueueSearch } from "@/app/(admin)/kyc/_shared/use-queue-search";
import { ClipboardList } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { FilterChips } from "@/components/adx/filter-chips";
import { PageHeader } from "@/components/adx/page-header";
import { AGENT_KYC_SLOTS, agentKycService, type AgentKycQueueRow } from "@/services/agent-kyc";
import { kycQueueSubtitle, kycStateChips, type KycStateChip } from "@/services/kyc-state";
import { methodWord } from "@/services/verification";
import { kycQueueColumns } from "../_shared/kyc-queue-columns";
import { KycRowActions } from "../_shared/kyc-row-actions";
import { ShowInactiveSwitch } from "../_shared/show-inactive";
import type { LoadedAgentQueue } from "./agent-kyc-loader";

interface AgentKycQueueProps {
    loaded: LoadedAgentQueue;
    chip: KycStateChip;
    onChip: (chip: KycStateChip) => void;
    /** 2 Oct 2026: the "Show inactive accounts" switch, kept in the URL by the loader. */
    showInactive?: boolean;
    onShowInactive?: (next: boolean) => void;
    live: boolean;
    onChanged: () => void;
}

/**
 * The agent KYC queue (D4), on the publisher queue's layout (2 Oct 2026:
 * one layout for the five KYC tabs).
 *
 * N3-B / N3-C (the owner, 14 Sep 2026): every agent is here from the
 * moment the profile exists. The chips are the six party states with the
 * server's counts, the chip in the URL — no Escalated chip, an agent's case
 * is never escalated; a row with no record is drawn from the agent alone
 * with a state pill, and every row offers the actions its state allows:
 * the one-click Digio request (`POST /agent-kyc/:agentId/request`, behind
 * `kyc.edit`), the manual ask, Record at the desk (the agent's record
 * sheet), Open the case (the same sheet, once something is in).
 *
 * `GET /agent-kyc` carries no review clock, no assignee and no escalation
 * on a row, so the table stops at the state and the summary line at what
 * is under review; there is nothing to assign, so no header actions.
 */
export function AgentKycQueue({ loaded, chip, onChip, showInactive = false, onShowInactive, live, onChanged }: AgentKycQueueProps) {
    const router = useRouter();
    const initialSearch = useQueueSearch();
    const { everything, visible } = loaded;

    const columns = React.useMemo(
        () =>
            kycQueueColumns<AgentKycQueueRow>(
                {
                    noun: "Agent",
                    name: (row) => row.agentName,
                    line: (row) => [row.displayId, row.city, row.mobile].filter(Boolean).join(" · "),
                    method: (row) =>
                        row.kycId ? (
                            <span className="text-muted-foreground">{methodWord(row.method, row.digioStatus) ?? `${row.documents} of ${AGENT_KYC_SLOTS.length} recorded`}</span>
                        ) : (
                            <span className="text-muted-foreground">—</span>
                        ),
                    submitted: (row) => (row.submittedAt !== "—" ? row.submittedAt : null),
                    arrivedAt: (row) => row.createdAt,
                    request: (row) => row.request,
                    recorded: (row) => row.recorded,
                    hasRecord: (row) => Boolean(row.kycId),
                    state: (row) => row.state,
                    accountState: (row) => row.accountState,
                    actions: (row) => (
                        <KycRowActions
                            state={row.state}
                            party={row.agentName}
                            hasAccount
                            contact={row.mobile}
                            request={row.request}
                            caseHref={row.kycId ? `/kyc/agents/${row.agentId}` : null}
                            onDigio={() => agentKycService.requestDigio(row.agentId)}
                            onRequest={(channel, note) => agentKycService.request(row.agentId, channel, note)}
                            onRecord={() => router.push(`/kyc/agents/${row.agentId}`)}
                            onChanged={onChanged}
                            accountState={row.accountState}
                            className="justify-end"
                        />
                    ),
                },
                null
            ),
        [router, onChanged]
    );

    return (
        <div className="space-y-5">
            <PageHeader title="Agent KYC" subtitle={kycQueueSubtitle(everything.counts, null)} />

            {!live && (
                <Card className="rounded-lg border-border p-5 shadow-none">
                    <p className="text-sm text-muted-foreground">Agent KYC is read from the API and has no fixtures. Turn the KYC domain on to see who is waiting.</p>
                </Card>
            )}

            <FilterChips<KycStateChip> value={chip} onChange={onChip} chips={kycStateChips(everything.counts, everything.total, { escalated: false })} />

            <DataTable
                columns={columns}
                data={visible.rows}
                searchPlaceholder="Search agents, display id, mobile"
                initialSearch={initialSearch}
                toolbar={onShowInactive && <ShowInactiveSwitch checked={showInactive} onCheckedChange={onShowInactive} />}
                initialPageSize={10}
                onRowClick={(row) => router.push(`/kyc/agents/${row.agentId}`)}
                emptyState={
                    <EmptyState
                        icon={ClipboardList}
                        title={chip === "all" ? "Nobody on the queue" : "Nobody under this chip"}
                        description={chip === "all" ? "Every agent is here from the moment the profile exists, until their KYC is verified." : "Choose another state, or All."}
                    />
                }
            />
        </div>
    );
}
