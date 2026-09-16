"use client";

import * as React from "react";
import { ListChecks, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { StatusBadge } from "@/components/adx/status-badge";
import { useApiResource } from "@/lib/use-api-resource";
import { agentLabel, agentService, type AgentSummary } from "@/services/agents";
import { OFFER_STATE_META, milestoneService, type MilestoneView, type WireMilestoneTemplate } from "@/services/milestones";
import type { Order } from "@/types";

interface Loaded {
    steps: MilestoneView[];
    agents: AgentSummary[];
    templates: WireMilestoneTemplate[];
}

/**
 * The order's milestones — the steps its agents work through, and the offer
 * on each visit (A12).
 *
 * Ops does three things here. Dispatch a step to an agent: to the agent
 * already holding the order it is theirs at once, to anyone else it is an
 * offer with the 25-minute clock, and what came back — accepted, scheduled,
 * declined with a reason, expired — is read from the same row. Skip a step
 * that no longer applies. Add a step from a template when the plan missed
 * one. Nothing else is decided from here: the agent starts and completes
 * the work from the field app.
 */
export function OrderMilestonesCard({ order }: { order: Order }) {
    const resource = useApiResource<Loaded>(`milestones:${order.id}:${order.status}`, async () => {
        const [steps, agents, templates] = await Promise.all([
            milestoneService.forOrder(order.id),
            agentService.list(),
            milestoneService.templates(),
        ]);
        return { steps, agents, templates };
    });

    const [dispatching, setDispatching] = React.useState<{ step: MilestoneView; agentId: string } | null>(null);
    const [skipping, setSkipping] = React.useState<MilestoneView | null>(null);
    const [adding, setAdding] = React.useState<string>("");
    const [busy, setBusy] = React.useState(false);

    async function run(label: string, work: () => Promise<unknown>) {
        setBusy(true);
        try {
            await work();
            toast.success(label);
            resource.reload();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "That did not reach ADX.");
        } finally {
            setBusy(false);
        }
    }

    const data = resource.data;
    const agents = data?.agents ?? [];
    const agentName = (id: string) => {
        const found = agents.find((agent) => agent.id === id);
        return found ? agentLabel(found) : id;
    };

    return (
        <Card id="milestones" className="scroll-mt-20 rounded-lg border-border p-5 shadow-none">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-base font-semibold text-foreground">Milestones</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                        The steps the agents work through. A visit dispatched to anyone but the order&apos;s own agent is an
                        offer with a 25-minute clock; the answer shows here.
                    </p>
                </div>
                {data && data.templates.length > 0 && (
                    <div className="flex items-center gap-2">
                        <Select value={adding} onValueChange={setAdding}>
                            <SelectTrigger className="h-9 w-56">
                                <SelectValue placeholder="Add a step…" />
                            </SelectTrigger>
                            <SelectContent>
                                {data.templates.map((template) => (
                                    <SelectItem key={template.id} value={template.id}>
                                        {template.title}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-9 bg-card"
                            disabled={!adding || busy}
                            onClick={() =>
                                void run("Step added", async () => {
                                    await milestoneService.add(order.id, adding);
                                    setAdding("");
                                })
                            }
                        >
                            <Plus className="mr-1 size-4" />
                            Add
                        </Button>
                    </div>
                )}
            </div>

            {resource.error ? (
                <p className="mt-4 text-sm text-danger">{resource.error}</p>
            ) : !data ? (
                <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
            ) : data.steps.length === 0 ? (
                <div className="mt-4 flex items-center gap-3 rounded-lg border border-dashed p-4">
                    <ListChecks className="size-5 shrink-0 text-muted-foreground/60" strokeWidth={1.5} />
                    <p className="text-sm text-muted-foreground">
                        No milestones yet. They are issued from the listing&apos;s plan when the agent first opens
                        the job; add one above if the plan missed a step.
                    </p>
                </div>
            ) : (
                <ol className="mt-4 divide-y">
                    {data.steps.map((step) => {
                        const open = step.state === "unassigned" || step.state === "declined" || step.state === "expired";
                        const canSkip = step.status === "PENDING" || step.status === "DISPATCHED" || step.status === "IN_PROGRESS";
                        return (
                            <li key={step.id} className="flex flex-wrap items-center gap-3 py-3">
                                <span className="w-6 text-xs font-medium tabular-nums text-muted-foreground">{step.step}.</span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-medium text-foreground">{step.title}</p>
                                        <StatusBadge status={OFFER_STATE_META[step.state]} />
                                        {step.optional && <StatusBadge status={{ label: "Optional", tone: "neutral" }} />}
                                    </div>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {[
                                            step.agentName ? `With ${step.agentName}` : null,
                                            step.expiresAt ? `answer due ${step.expiresAt}` : null,
                                            step.declinedFor ? `came back: ${step.declinedFor}` : null,
                                            step.when ? `due ${step.when}` : null,
                                            step.evidence ? `${step.evidence} proof${step.evidence === 1 ? "" : "s"} filed` : null,
                                        ]
                                            .filter(Boolean)
                                            .join(" · ") || "Nothing recorded yet"}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {open && agents.length > 0 && (
                                        <Select
                                            value={dispatching?.step.id === step.id ? dispatching.agentId : ""}
                                            onValueChange={(agentId) => setDispatching({ step, agentId })}
                                        >
                                            <SelectTrigger className="h-8 w-52 text-xs">
                                                <SelectValue placeholder="Dispatch to…" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {agents.map((agent) => (
                                                    <SelectItem key={agent.id} value={agent.id}>
                                                        {agentLabel(agent)}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                    {canSkip && (
                                        <Button variant="ghost" size="sm" className="h-8 text-xs" disabled={busy} onClick={() => setSkipping(step)}>
                                            Skip
                                        </Button>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ol>
            )}

            <ConfirmDialog
                open={dispatching !== null}
                onOpenChange={(next) => !next && setDispatching(null)}
                title={dispatching ? `Dispatch “${dispatching.step.title}”?` : "Dispatch"}
                description={
                    dispatching
                        ? dispatching.agentId === order.agentId
                            ? `${agentName(dispatching.agentId)} already holds this order, so the step is theirs at once.`
                            : `${agentName(dispatching.agentId)} will be offered the step and has 25 minutes to accept it; if they decline or the clock runs out it comes back here.`
                        : ""
                }
                confirmLabel="Dispatch"
                busy={busy}
                onConfirm={() => {
                    if (!dispatching) return;
                    const { step, agentId } = dispatching;
                    setDispatching(null);
                    void run(`Dispatched to ${agentName(agentId)}`, () => milestoneService.dispatch(order.id, step.id, agentId));
                }}
            />

            <ConfirmDialog
                open={skipping !== null}
                onOpenChange={(next) => !next && setSkipping(null)}
                title={skipping ? `Skip “${skipping.title}”?` : "Skip"}
                description="The step is marked skipped and taken off any agent it was with. This cannot be undone from here."
                confirmLabel="Skip step"
                destructive
                busy={busy}
                onConfirm={() => {
                    if (!skipping) return;
                    const step = skipping;
                    setSkipping(null);
                    void run("Step skipped", () => milestoneService.skip(order.id, step.id));
                }}
            />
        </Card>
    );
}
