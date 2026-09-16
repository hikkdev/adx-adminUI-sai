"use client";

import * as React from "react";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FilterChips } from "@/components/adx/filter-chips";
import { MiniMap } from "@/components/adx/mini-map";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime } from "@/lib/format";
import { directionsLink } from "@/lib/maps-links";
import { useMapsConfig } from "@/lib/use-maps-config";
import { legalService, SAFETY_KIND_LABEL, SAFETY_STATUS_META, type SafetyAlert, type SafetyAlertStatus } from "@/services/legal";

type ChipValue = "open" | "all";

/**
 * The safety queue.
 *
 * D4's point: an unsafe-site report already blocks the job and tells every
 * admin, so the alert has somewhere to land and somebody to own it. Open
 * first, oldest first — an open alert is somebody standing somewhere they do
 * not want to be — and the row says whether the job came off them, because
 * that is the fact ops need before they call.
 */
export function SafetyView({ alerts, onChanged }: { alerts: SafetyAlert[]; onChanged: () => void }) {
    const [chip, setChip] = React.useState<ChipValue>("open");
    const [note, setNote] = React.useState<Record<string, string>>({});
    const [busy, setBusy] = React.useState<string | null>(null);
    /* AD-C: the "get there" link follows the provider ops chose, not always Google. */
    const { config: mapsConfig } = useMapsConfig();
    const provider = mapsConfig?.provider ?? null;

    const visible = alerts.filter((alert) => (chip === "open" ? alert.status !== "CLOSED" : true));
    const openCount = alerts.filter((alert) => alert.status !== "CLOSED").length;

    async function move(alert: SafetyAlert, status: SafetyAlertStatus) {
        setBusy(alert.id);
        try {
            const opsNote = note[alert.id]?.trim();
            await legalService.updateAlert(alert.id, { status, ...(opsNote ? { opsNote } : {}) });
            toast.success(status === "CLOSED" ? `${alert.displayId} closed` : `${alert.displayId}: you are on it`, {
                description: "The person who raised it has been told.",
            });
            setNote((current) => ({ ...current, [alert.id]: "" }));
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not update the alert.");
        } finally {
            setBusy(null);
        }
    }

    return (
        <div className="space-y-5">
            <PageHeader
                title="Safety"
                subtitle="What agents reported from the field. An unsafe-site report has already taken the job off them."
            />

            <FilterChips<ChipValue>
                value={chip}
                onChange={setChip}
                chips={[
                    { value: "open", label: "Open", count: openCount },
                    { value: "all", label: "All", count: alerts.length },
                ]}
            />

            {visible.length === 0 ? (
                <Card className="rounded-lg border-border p-8 text-center shadow-none">
                    <p className="text-sm text-muted-foreground">Nothing reported. That is the number this queue wants.</p>
                </Card>
            ) : (
                <div className="space-y-3">
                    {visible.map((alert) => (
                        <Card key={alert.id} className={cn("rounded-lg border-border p-5 shadow-none", alert.status === "OPEN" && "border-danger/40")} data-testid={`safety-${alert.id}`}>
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2.5">
                                        {alert.status === "OPEN" && <TriangleAlert className="size-4 text-danger" aria-hidden />}
                                        <span className="font-mono text-xs text-muted-foreground">{alert.displayId}</span>
                                        <h2 className="text-base font-semibold text-foreground">{SAFETY_KIND_LABEL[alert.kind]}</h2>
                                        <StatusBadge status={SAFETY_STATUS_META[alert.status]} />
                                        {alert.blockedOrder && (
                                            <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger">Job taken off them</span>
                                        )}
                                    </div>
                                    <p className="mt-1.5 text-sm text-muted-foreground">
                                        {alert.raisedBy.name ?? "An agent"} · {alert.raisedBy.mobile} · {formatDateTime(alert.createdAt)}
                                    </p>
                                    {alert.order?.listing && (
                                        <p className="mt-1 text-sm text-foreground">
                                            {alert.order.listing.title} — {alert.order.listing.address}
                                            {alert.order.listing.city ? `, ${alert.order.listing.city}` : ""}
                                        </p>
                                    )}
                                    {alert.note && <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm text-foreground">{alert.note}</p>}
                                    {alert.latitude !== null && alert.longitude !== null && (
                                        <div className="mt-3 max-w-sm space-y-1.5">
                                            <MiniMap latitude={alert.latitude} longitude={alert.longitude} title="Where they were" tone="danger" />
                                            <a
                                                className="inline-block text-sm text-primary underline-offset-2 hover:underline"
                                                href={directionsLink({ lat: alert.latitude, lng: alert.longitude, label: alert.displayId }, provider)}
                                                target="_blank"
                                                rel="noreferrer"
                                                data-testid={`safety-directions-${alert.id}`}
                                            >
                                                Directions to where they were
                                            </a>
                                        </div>
                                    )}
                                    {alert.opsNote && <p className="mt-2 text-sm text-muted-foreground">Ops: {alert.opsNote}</p>}
                                </div>
                                <a className="shrink-0 text-sm text-primary underline-offset-2 hover:underline" href={`tel:${alert.raisedBy.mobile}`}>
                                    Call them
                                </a>
                            </div>

                            {alert.status !== "CLOSED" && (
                                <div className="mt-4 flex flex-wrap items-center gap-2">
                                    <Input
                                        value={note[alert.id] ?? ""}
                                        onChange={(event) => setNote((current) => ({ ...current, [alert.id]: event.target.value }))}
                                        placeholder="What you did — the agent sees this"
                                        className="h-9 min-w-56 flex-1"
                                    />
                                    {alert.status === "OPEN" && (
                                        <Button variant="outline" className="bg-card" disabled={busy === alert.id} onClick={() => move(alert, "ACKNOWLEDGED")}>
                                            I am on it
                                        </Button>
                                    )}
                                    <Button disabled={busy === alert.id} onClick={() => move(alert, "CLOSED")}>
                                        Close
                                    </Button>
                                </div>
                            )}
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
