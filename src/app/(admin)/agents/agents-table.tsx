"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SortableHeader } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { hiddenExtras, partyRosterColumns, type PartyRosterSpec, type RosterRowAction } from "@/components/adx/party-roster-columns";
import { PartyRosterFilterBar, type PartyRosterFilterSpec, type PartyRosterFilterState } from "@/components/adx/party-roster-filter-bar";
import { kycReviewHref, useRosterSuspension, type SuspensionRowFacts } from "@/components/adx/party-roster-row-actions";
import { PartyRosterTable, type PartyRosterView } from "@/components/adx/party-roster-table";
import { formatIndianMobile } from "@/lib/format";
import { SIDE_LABEL, SOURCE_LABEL, type AgentSide, type AgentSourceKind } from "@/services/agent-applications";
import { hoursLabel, tierLabel, workingDaysLabel } from "@/services/agents";
import { accountStatusOptions, isInactive } from "@/services/account-state";
import { rosterFiltersActive } from "@/services/party-roster";
import { AGENT_STATUS_META, type Agent } from "@/types";
import { CreateAgentDialog } from "./create-agent-dialog";

interface AgentsTableProps {
    view: PartyRosterView<Agent>;
    filters: PartyRosterFilterState;
    /** Refetch the roster, so a created (or suspended) agent shows as it now stands without a reload. */
    onCreated: () => void;
}

/**
 * The bar's agent half. An agent's door is where the profile came from —
 * the app, a fleet partner, a referral, a walk-in, a job portal, the desk,
 * an import (`sourceKind`) — not the QR-14 doors a publisher or an
 * advertiser comes through, so the options are the agent's own; the type is
 * the side the agent works.
 */
export const AGENT_FILTER_SPEC: PartyRosterFilterSpec = {
    searchPlaceholder: "Search name, ID, phone, email, city",
    doors: (Object.keys(SOURCE_LABEL) as AgentSourceKind[]).map((source) => ({ value: source, label: SOURCE_LABEL[source] })),
    types: (Object.keys(SIDE_LABEL) as AgentSide[]).map((side) => ({ value: side, label: SIDE_LABEL[side] })),
    idPrefix: "agents",
    /* An agent can also have left ADX — the Left option is the agents' own. */
    statuses: accountStatusOptions(true),
};

/**
 * What this desk showed beyond the shared layout — D5's zone and working
 * pattern and DR 05's tier — kept, hidden until the table's "Columns" menu
 * turns them on.
 */
export const AGENT_EXTRA_COLUMNS: ColumnDef<Agent>[] = [
    {
        id: "zone",
        accessorFn: (agent) => agent.homeZone ?? agent.territory ?? "",
        header: ({ column }) => <SortableHeader column={column}>Zone</SortableHeader>,
        cell: ({ row }) => (
            <div>
                <p className="text-foreground">{row.original.homeZone ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{row.original.territory ?? "—"}</p>
            </div>
        ),
    },
    {
        id: "works",
        header: "Works",
        cell: ({ row }) => (
            <div>
                <p className="text-foreground">{workingDaysLabel(row.original.workingDays)}</p>
                <p className="text-xs text-muted-foreground">{hoursLabel(row.original.hoursFrom, row.original.hoursTo)}</p>
            </div>
        ),
    },
    {
        id: "tier",
        accessorKey: "tier",
        header: ({ column }) => <SortableHeader column={column}>Tier</SortableHeader>,
        cell: ({ row }) => tierLabel(row.original.tier, row.original.tierLevel),
    },
];

/**
 * The agent roster — 29 Sep 2026, on the shared party layout
 * (`party-roster-columns`): Name · Contact · Type (the side) · City · KYC
 * status (with the work status when the agent is not active) · Activity
 * (the publishers and advertisers brought in) · Joined · Onboarded (where
 * the profile came from), and the shared filter bar.
 *
 * What differs, and why: an agent is a person ops engages, not an account
 * that signs itself up, so its door vocabulary is the ladder's source (a
 * fleet partner, a referral, a walk-in…) rather than QR-14's, its type is
 * the side it works rather than individual or business, and its work
 * status (on leave, suspended, deactivated) rides beside the KYC pill —
 * publishers and advertisers have no such switch. The row menu is the
 * shared one: View details, Review KYC, then Suspend… or Reinstate (the
 * "View orders" item it used to carry is on the agent's page).
 */
export function agentRosterSpec(
    open: (row: Agent) => void,
    reviewKyc: (row: Agent) => void,
    statusActions?: (row: Agent) => RosterRowAction[],
): PartyRosterSpec<Agent> {
    return {
        idOwner: "AGENT",
        // A profile opened from a bare number has no name — the number stands in, printed the roster way.
        name: (row) => row.name ?? (formatIndianMobile(row.mobile) || row.mobile),
        displayId: (row) => row.displayId,
        mobile: (row) => row.mobile,
        email: (row) => row.email,
        type: (row) => (row.side ? SIDE_LABEL[row.side] : null),
        city: (row) => row.city,
        kycState: (row) => row.kyc.state,
        /* Lot A: only BLOCK_NEW moves the profile status, and the status chip says "Suspended" then; a frozen
           wallet or a blocked sign-in on an agent still offered work shows as the suspension chip — never both. */
        suspensionScopes: (row) => (row.status === "suspended" ? undefined : row.suspensionScopes),
        /* 2 Oct 2026: once the row's account state says suspended, deactivated, closed or left, that pill speaks — only "On leave" is the work status's own. */
        statusChip: (row) =>
            row.status === "active" || (isInactive(row.accountState) && row.status !== "on_leave") ? null : <StatusBadge status={AGENT_STATUS_META[row.status]} />,
        accountState: (row) => row.accountState,
        activity: {
            count: (row) => row.onboardedCount ?? null,
            noun: ["account", "accounts"],
            title: "Publishers and advertisers this agent onboarded",
        },
        joinedAt: (row) => row.joinedAt,
        onboarded: (row) => (row.sourceKind ? ((SOURCE_LABEL as Partial<Record<string, string>>)[row.sourceKind] ?? row.sourceKind) : "Not recorded"),
        open,
        reviewKyc,
        statusActions,
        extraColumns: AGENT_EXTRA_COLUMNS,
    };
}

/** The agent row as the suspension items read it — the sections as the row carries them, whatever the work status says. */
export const agentSuspensionFacts = (row: Agent): SuspensionRowFacts => ({
    id: row.id,
    name: row.name ?? (formatIndianMobile(row.mobile) || row.mobile),
    scopes: row.suspensionScopes,
    accountState: row.accountState,
});

/** "Review KYC" for an agent row: the record (`/kyc/agents/<agentId>`) when there is one, else the queue searched for it. */
export const agentKycHref = (row: Agent): string =>
    kycReviewHref("AGENT", { id: row.id, kycId: row.kyc.kycId, search: row.displayId ?? row.name ?? row.mobile });

export function AgentsTable({ view, filters, onCreated }: AgentsTableProps) {
    const router = useRouter();
    const [creating, setCreating] = React.useState(false);
    const suspension = useRosterSuspension("AGENT", "AGENT", onCreated);
    const { statusActions } = suspension;

    const columns = React.useMemo(
        () =>
            partyRosterColumns(
                agentRosterSpec(
                    (row) => router.push(`/agents/${row.id}`),
                    (row) => router.push(agentKycHref(row)),
                    (row) => statusActions(agentSuspensionFacts(row)),
                ),
            ),
        [router, statusActions],
    );

    const filtered = rosterFiltersActive(filters.filters);

    return (
        <div className="space-y-5">
            <PageHeader
                title="Agents"
                subtitle={view.total === null ? undefined : filtered ? `${view.total} match these filters` : `${view.total} on the rota`}
                actions={
                    // 2 Oct 2026: one way to add an agent — the back-office intake ("Onboard") is retired.
                    <Button onClick={() => setCreating(true)}>
                        <Plus className="mr-1.5 size-4" />
                        Add agent
                    </Button>
                }
            />
            <PartyRosterTable
                columns={columns}
                view={view}
                noun="agent"
                filterBar={<PartyRosterFilterBar spec={AGENT_FILTER_SPEC} state={filters} refreshing={view.refreshing} statusCounts={view.statusCounts} />}
                onRowClick={(agent) => router.push(`/agents/${agent.id}`)}
                getRowId={(agent) => agent.id}
                initialColumnVisibility={hiddenExtras({ extraColumns: AGENT_EXTRA_COLUMNS })}
                emptyState={
                    filtered ? (
                        <EmptyState icon={UserRound} title="No agent matches" description="Nobody on the roster matches these filters." action={<Button variant="outline" className="bg-card" onClick={filters.clear}>Clear filters</Button>} />
                    ) : (
                        <EmptyState
                            icon={UserRound}
                            title="No agents yet"
                            description="Agents appear here once the desk adds one or an application is approved."
                            action={
                                <Button onClick={() => setCreating(true)}>
                                    <Plus className="mr-1.5 size-4" />
                                    Add agent
                                </Button>
                            }
                        />
                    )
                }
            />
            <CreateAgentDialog open={creating} onOpenChange={setCreating} onCreated={onCreated} />
            {suspension.dialogs}
        </div>
    );
}
