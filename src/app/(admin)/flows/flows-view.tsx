"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, GitBranch, Layers, Undo2, Users, Workflow } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { EmptyState } from "@/components/adx/empty-state";
import { formatDate } from "@/lib/format";
import { flowAudience, flowDescription, flowService, flowStats, isLadder, isStepLadderKey } from "@/services/flows";
import type { EditableFlow, FlowSummary } from "@/types";

interface FlowsViewProps {
    summaries: FlowSummary[];
    flows: Record<string, EditableFlow>;
    onChanged: () => void;
}

/**
 * DR 10 `5102:34069`: one card per flow, three across.
 *
 * The frame's description paragraph is drawn since Lot G (Q126): every
 * flow carries a `description` — the stored flow's own, else the code's
 * for a key not stored yet — editable in the board's header. G13-B: so is
 * the frame's audience line — `audience` on the summary (the stored
 * flow's, else the code's default: Publishers, Publishers and advertisers,
 * Agents, Employees), editable in the same header. The counts are real — screens, fields and
 * branches out of the row for a wizard; steps, capture tiles and ladders
 * for the onboarding template; steps, proofs and the steps that collect
 * one for the two step ladders (Q141). `GET /config/flows` lists all four
 * known keys, so the index is four cards whether or not the row holds
 * them all; a card not stored yet says so instead of a version.
 */
export function FlowsView({ summaries, flows, onChanged }: FlowsViewProps) {
    const [reverting, setReverting] = React.useState(false);
    const [busy, setBusy] = React.useState(false);

    async function revert() {
        setBusy(true);
        try {
            await flowService.revert();
            toast.success("Reverted the last change", {
                description: "The row is as it was before the last save. Reverting again undoes the revert.",
            });
            setReverting(false);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not revert.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Button variant="outline" className="bg-card" onClick={() => setReverting(true)}>
                    <Undo2 className="mr-1.5 size-4" />
                    Revert last change
                </Button>
            </div>

            {summaries.length === 0 ? (
                <EmptyState
                    icon={Workflow}
                    title="No flows on the row yet"
                    description="The backend listed no flows — even the four known keys. Run the backend's config seed to write the listing wizard, the onboarding ladder and the two step ladders; they appear here as soon as it has."
                />
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {summaries.map((summary) => {
                        const ladder = summary.shape === "ladder" || isLadder(summary.key);
                        const steps = summary.shape === "steps" || isStepLadderKey(summary.key);
                        const stored = summary.stored !== false;
                        const stats = flowStats(flows[summary.key]);
                        const description = flowDescription(summary, flows[summary.key]);
                        const audience = flowAudience(summary, flows[summary.key]);
                        return (
                            <Card
                                key={summary.key}
                                className="flex flex-col rounded-lg border-border p-5 shadow-none transition-shadow hover:shadow-sm"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <h2 className="truncate text-base font-semibold text-foreground">
                                            {summary.label ?? summary.key}
                                        </h2>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            {ladder ? "Onboarding ladder" : steps ? "Step ladder" : "Wizard"} · <code>{summary.key}</code>
                                            {stored ? ` · v${summary.version}` : " · not stored yet"}
                                        </p>
                                    </div>
                                    {stored && (
                                        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                                            {stats.screens} {ladder || steps ? (stats.screens === 1 ? "step" : "steps") : stats.screens === 1 ? "screen" : "screens"}
                                        </span>
                                    )}
                                </div>
                                {description && <p className="mt-3 text-sm text-muted-foreground">{description}</p>}
                                {audience && (
                                    <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <Users className="size-3.5" aria-hidden />
                                        For {audience}
                                    </p>
                                )}
                                <div className="mt-4 flex flex-1 items-end gap-4 text-xs text-muted-foreground">
                                    {stored ? (
                                        <>
                                            <span className="flex items-center gap-1.5">
                                                <Layers className="size-3.5" />
                                                {stats.fields} {ladder ? "capture tiles" : steps ? "proofs" : "fields"}
                                            </span>
                                            <span className="flex items-center gap-1.5">
                                                <GitBranch className="size-3.5" />
                                                {ladder
                                                    ? `${stats.branches} ${stats.branches === 1 ? "ladder" : "ladders"}`
                                                    : steps
                                                      ? `${stats.branches} ${stats.branches === 1 ? "step collects" : "steps collect"} a proof`
                                                      : stats.branches
                                                        ? `${stats.branches} ${stats.branches === 1 ? "branch" : "branches"}`
                                                        : "No branching"}
                                            </span>
                                        </>
                                    ) : (
                                        <span>The apps climb the code's ladder until the first save.</span>
                                    )}
                                </div>
                                <div className="mt-3 flex items-center justify-between border-t pt-3">
                                    <span className="text-xs text-muted-foreground">
                                        {summary.updatedAt ? `Updated ${formatDate(summary.updatedAt)}` : stored ? "Never edited" : "In code"}
                                    </span>
                                    <Link
                                        href={`/flows/${encodeURIComponent(summary.key)}`}
                                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                    >
                                        Open board
                                        <ArrowRight className="size-3.5" />
                                    </Link>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            <ConfirmDialog
                open={reverting}
                onOpenChange={setReverting}
                title="Revert the last change?"
                description="Puts the config row back as it was before the last save — every flow and enum group, one step. Both apps pick the reverted row up on their next config refresh. Reverting a second time undoes the revert."
                confirmLabel="Revert"
                destructive
                busy={busy}
                onConfirm={() => void revert()}
            />
        </div>
    );
}
