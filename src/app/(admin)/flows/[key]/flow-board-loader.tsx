"use client";

import Link from "next/link";
import { ChevronLeft, Workflow } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { STEP_LADDER_SOURCES, flowService, isOnboardingTemplate, isStepLadder, isStepLadderKey, isWizardFlow } from "@/services/flows";
import type { EditableFlow, FlowVocabulary, StepLadder } from "@/types";
import { FlowsOffline } from "../flows-offline";
import { FlowBoard } from "./flow-board";
import { LadderBoard } from "./ladder-board";
import { StepBoard } from "./step-board";

interface Loaded {
    flow: EditableFlow | null;
    vocabulary: FlowVocabulary;
    /** Lot G: for a step-ladder key the row does not hold, the code's ladder the apps climb today; null otherwise. */
    fallback: StepLadder | null;
    /** The summary's label for the key, for the board's title before a label is stored. */
    label: string | null;
}

/**
 * One flow and the vocabulary it is edited in.
 *
 * The board is built from `GET /config/schema` rather than a list typed
 * here: the kinds it offers are exactly the ones the phones render, and a
 * kind the server adds appears on the next load without a console deploy.
 * The flow body comes off `GET /config`, the same read both apps make.
 *
 * Lot G (Q141): a step-ladder key — `agent-job`, `employee-intake` — the
 * row does not hold yet opens on the code's ladder, read off the module
 * that climbs it (`GET /orders/job-ladder`, `GET /employee-kyc/ladder`),
 * so the first save stores what the apps already do rather than a blank.
 */
export function FlowBoardLoader({ flowKey }: { flowKey: string }) {
    const live = isLive("flows");
    const resource = useApiResource<Loaded>(`flows:board:${flowKey}:${live}`, async () => {
        const [document, vocabulary, summaries] = await Promise.all([flowService.document(), flowService.schema(), flowService.list().catch(() => [])]);
        const flow = document.flows[flowKey] ?? null;
        const label = summaries.find((summary) => summary.key === flowKey)?.label ?? null;
        if (flow || !isStepLadderKey(flowKey)) return { flow, vocabulary, fallback: null, label };
        const inForce = await flowService.ladderInForce(flowKey).catch(() => null);
        if (!inForce) return { flow, vocabulary, fallback: null, label };
        const { source: _source, ...ladder } = inForce;
        void _source;
        return { flow, vocabulary, fallback: ladder, label };
    });

    if (!live) return <FlowsOffline />;

    return (
        <ResourceBoundary resource={resource}>
            {({ flow, vocabulary, fallback, label }) => {
                if (isWizardFlow(flow)) {
                    return <FlowBoard key={flow.version} flowKey={flowKey} flow={flow} vocabulary={vocabulary} onSaved={resource.reload} />;
                }
                if (isOnboardingTemplate(flow)) {
                    return (
                        <LadderBoard key={flow.version} flowKey={flowKey} template={flow} vocabulary={vocabulary} onSaved={resource.reload} />
                    );
                }
                const stepVocabulary = vocabulary.flows[flowKey as "agent-job" | "employee-intake"];
                const ladder = isStepLadder(flow) ? flow : fallback;
                if (isStepLadderKey(flowKey) && ladder && stepVocabulary) {
                    return (
                        <StepBoard
                            key={`${flowKey}:${ladder.version ?? 0}:${flow ? "stored" : "code"}`}
                            flowKey={flowKey}
                            ladder={ladder}
                            vocabulary={stepVocabulary}
                            stored={!!flow}
                            label={label ?? STEP_LADDER_SOURCES[flowKey]?.noun ?? flowKey}
                            onSaved={resource.reload}
                        />
                    );
                }
                return (
                    <div className="space-y-4">
                        <Link
                            href="/flows"
                            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <ChevronLeft className="size-4" />
                            Flow Editor
                        </Link>
                        <EmptyState
                            icon={Workflow}
                            title={`No flow named "${flowKey}"`}
                            description={
                                isStepLadderKey(flowKey)
                                    ? `The config row holds no ${STEP_LADDER_SOURCES[flowKey]?.noun ?? "ladder"} yet, and the code's could not be read — or this backend's schema does not serve its vocabulary. Reload, or check the ${STEP_LADDER_SOURCES[flowKey]?.domain ?? ""} module is reachable.`
                                    : "The config row holds no flow under this key. The listing wizard and the onboarding ladder are written by the backend's config seed; anything else is added by saving a board under a new key."
                            }
                        />
                    </div>
                );
            }}
        </ResourceBoundary>
    );
}
