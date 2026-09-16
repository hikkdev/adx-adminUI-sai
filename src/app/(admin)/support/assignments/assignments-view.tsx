"use client";

import * as React from "react";
import { UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { DataTable } from "@/components/adx/data-table";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { runBulk } from "@/lib/run-bulk";
import { supportService, type AgentSummary, type OpsTicket } from "@/services/support";

interface Props {
    tickets: OpsTicket[];
    agents: AgentSummary[];
    onChanged: () => void;
}

/**
 * Putting an agent on a request.
 *
 * This looks like a workflow screen and is really an authorisation one. A
 * publisher's app will only offer an access code for a request somebody is
 * already on, and the code it mints is bound to whoever that is — so the choice
 * made here is what lets an agent reach into an account that is not theirs.
 *
 * Which is why the screen says so, why unassigning is one click away, and why
 * the oldest unassigned request is at the top rather than the newest: the person
 * who has waited longest is the one being kept from getting help.
 */
export function AssignmentsView({ tickets, agents, onChanged }: Props) {
    const [busy, setBusy] = React.useState(false);

    const agentName = React.useCallback(
        (agentId: string) => {
            const agent = agents.find((candidate) => candidate.id === agentId);
            if (!agent) return "Unknown agent";
            return agent.user?.name ?? agent.user?.mobile ?? agent.id;
        },
        [agents]
    );

    async function assign(ticketId: string, agentId: string | null) {
        setBusy(true);
        try {
            await supportService.assign(ticketId, agentId);
            toast.success(agentId ? `Assigned to ${agentName(agentId)}` : "Taken off the request", {
                description: agentId
                    ? "The publisher can now grant them access to their account."
                    : "Any access code they were given stops working once it expires or is withdrawn.",
            });
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not change that");
        } finally {
            setBusy(false);
        }
    }

    const waiting = tickets.filter((ticket) => ticket.assignedAgentId === null);

    return (
        <div className="space-y-6">
            <Card className="rounded-lg border-border bg-muted/30 p-4 shadow-none">
                <p className="text-sm text-foreground">
                    <strong>An assignment is an authorisation.</strong> A publisher can only create
                    an access code for a request that already has an agent on it, and the code is
                    bound to whoever you pick here — nobody else can scan it. Taking an agent off
                    does not withdraw a code they already hold; the publisher does that, or it
                    expires on its own.
                </p>
            </Card>

            <SectionCard
                title="Waiting for someone"
                description={
                    waiting.length === 0
                        ? "Every open request has an agent on it."
                        : `${waiting.length} unanswered, oldest first.`
                }
            >
                <DataTable
                    data={tickets}
                    searchPlaceholder="Search requests…"
                    initialPageSize={15}
                    bulkActions={(rows, clear) => (
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                                runBulk(
                                    rows.filter((row) => row.assignedAgentId !== null),
                                    (row) => supportService.assign(row.id, null),
                                    "Unassigned",
                                    () => {
                                        clear();
                                        onChanged();
                                    }
                                )
                            }
                        >
                            <UserX className="mr-1.5 size-3.5" aria-hidden />
                            Take off selected
                        </Button>
                    )}
                    columns={[
                        {
                            accessorKey: "title",
                            header: "Request",
                            cell: ({ row }) => (
                                <div className="min-w-0">
                                    <p className="truncate font-medium text-foreground">
                                        {row.original.title}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {row.original.description}
                                    </p>
                                </div>
                            ),
                        },
                        {
                            id: "raised",
                            header: "Raised",
                            accessorFn: (ticket) =>
                                new Date(ticket.createdAt).toLocaleDateString("en-IN", {
                                    day: "numeric",
                                    month: "short",
                                }),
                        },
                        {
                            id: "state",
                            header: "Status",
                            cell: ({ row }) =>
                                row.original.assignedAgentId ? (
                                    <StatusBadge
                                        status={{
                                            label: agentName(row.original.assignedAgentId),
                                            tone: "success",
                                        }}
                                    />
                                ) : (
                                    <StatusBadge
                                        status={{ label: "Nobody assigned", tone: "warning" }}
                                    />
                                ),
                        },
                        {
                            id: "assign",
                            header: "",
                            cell: ({ row }) => (
                                <div className="flex items-center justify-end gap-2">
                                    <div className="w-56">
                                        <Combobox
                                            items={agents.map((agent) => ({
                                                label:
                                                    agent.user?.name ??
                                                    agent.user?.mobile ??
                                                    agent.id,
                                                value: agent.id,
                                                // Searchable: ops picks by city
                                                // as often as by name.
                                                description: agent.city ?? undefined,
                                            }))}
                                            value={row.original.assignedAgentId ?? ""}
                                            onValueChange={(value) =>
                                                value && void assign(row.original.id, value)
                                            }
                                            placeholder="Put someone on it"
                                            searchPlaceholder="Search agents by name or city…"
                                        />
                                    </div>
                                    {row.original.assignedAgentId ? (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            disabled={busy}
                                            onClick={() => void assign(row.original.id, null)}
                                        >
                                            Take off
                                        </Button>
                                    ) : (
                                        <UserCheck
                                            className="size-4 text-muted-foreground"
                                            aria-hidden
                                        />
                                    )}
                                </div>
                            ),
                        },
                    ]}
                />
            </SectionCard>
        </div>
    );
}
