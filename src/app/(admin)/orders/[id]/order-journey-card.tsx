"use client";

import Link from "next/link";
import { Check, Navigation } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { FeatureGate } from "@/lib/use-feature";
import { AGENT_STATE_META, ALERT_META, ageLabel, agentLocationsService, etaLabel, type OrderTimeline } from "@/services/agent-locations";
import type { Order } from "@/types";

/**
 * LT-1: the order's journey — print ready, the leg to the print partner,
 * the pickup, the leg to the site, the arrival read off the geofence, the
 * installation — folded from the order row, the print job, the trails and
 * the milestones, with the agent's live line under it. Drawn only while
 * `ops.live-map` is on for the operator, as the route it reads is.
 */
export function OrderJourneyCard({ order }: { order: Order }) {
    return (
        <FeatureGate feature="ops.live-map">
            <JourneyCard order={order} />
        </FeatureGate>
    );
}

/** "12.4 km" / "850 m" for a trail's length. */
export function distanceLabel(distanceM: number): string {
    return distanceM >= 1000 ? `${(distanceM / 1000).toFixed(1)} km` : `${Math.round(distanceM)} m`;
}

function JourneyCard({ order }: { order: Order }) {
    const resource = useApiResource<OrderTimeline>(`agent-locations:timeline:${order.id}:${order.status}`, () => agentLocationsService.orderTimeline(order.id));
    const data = resource.data;
    const live = data?.live ?? null;

    return (
        <Card id="journey" className="scroll-mt-20 rounded-lg border-border p-5 shadow-none" data-testid="order-journey">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-base font-semibold text-foreground">Journey</h3>
                    <p className="mt-1 text-sm text-muted-foreground">From the prints being ready to the spot being installed, as the agent app reported the legs.</p>
                </div>
                <Link href="/live-map" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                    <Navigation className="size-4" strokeWidth={1.5} /> Live map
                </Link>
            </div>

            {resource.error ? (
                <p className="mt-4 text-sm text-muted-foreground">{resource.error}</p>
            ) : !data ? (
                <p className="mt-4 text-sm text-muted-foreground">Reading the journey…</p>
            ) : (
                <>
                    <ol className="mt-4 space-y-3">
                        {data.steps.map((step, index) => (
                            <li key={step.key} className="flex items-start gap-3" data-testid={`journey-${step.key}`}>
                                <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium tabular-nums", step.done ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>
                                    {step.done ? <Check className="size-3" strokeWidth={2.5} /> : index + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className={cn("text-sm", step.done ? "font-medium text-foreground" : "text-muted-foreground")}>{step.label}</div>
                                    <div className="text-xs text-muted-foreground">{step.at ? formatDateTime(step.at) : step.done ? "Done" : "Not yet"}</div>
                                </div>
                            </li>
                        ))}
                    </ol>

                    {data.trails.length > 0 && (
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                            {data.trails.map((trail) => (
                                <div key={trail.id} className="rounded-md border border-border p-3 text-sm">
                                    <div className="font-medium text-foreground">{trail.label ?? "Leg"}</div>
                                    <div className="text-xs text-muted-foreground tabular-nums">
                                        {distanceLabel(trail.distanceM)} over {trail.pointCount} fixes · {trail.arrivedAt ? `arrived ${formatDateTime(trail.arrivedAt)}` : trail.endedAt ? "ended without arriving" : "under way"}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4 text-sm" data-testid="journey-live">
                        {live ? (
                            <>
                                <StatusBadge status={AGENT_STATE_META[live.state]} />
                                <span className="text-foreground">{live.agent.name}</span>
                                {live.fix && <span className="text-muted-foreground">· seen {ageLabel(live.fix.ageSec)}</span>}
                                {live.trip?.eta && <span className="text-muted-foreground">· {etaLabel(live.trip.eta)}</span>}
                                {live.alerts.map((alert) => (
                                    <StatusBadge key={alert.kind} status={ALERT_META[alert.kind]} />
                                ))}
                            </>
                        ) : (
                            <span className="text-muted-foreground">{data.order.agentId ? "The agent has not reported a position today." : "No agent holds this order yet."}</span>
                        )}
                    </div>
                </>
            )}
        </Card>
    );
}
