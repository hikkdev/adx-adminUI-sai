"use client";

import * as React from "react";
import { CalendarClock, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/adx/section-card";
import { DataTable } from "@/components/adx/data-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { EmptyState } from "@/components/adx/empty-state";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { pricingService } from "@/services/pricing";
import { ApiError } from "@/lib/api-client";
import { runBulk } from "@/lib/run-bulk";
import { useNow } from "@/lib/use-now";
import type { SurgeEventWindow } from "@/types/pricing-engine";

interface Props {
    windows: SurgeEventWindow[];
    onChanged: () => void;
}

const dateRange = (from: string, to: string) => {
    const fmt = (value: string) =>
        new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    return `${fmt(from)} – ${fmt(to)}`;
};

const scopeMeta = {
    CITY: { label: "City", tone: "neutral" as const },
    NATIONAL: { label: "National", tone: "info" as const },
    INTERNATIONAL: { label: "International", tone: "info" as const },
};

/**
 * The surge calendar, and the only thing ops can do to it.
 *
 * Windows are written by a scraper, not by hand — this is a read view with one
 * switch. That switch is the point of the screen: a scraper that invents an
 * event, or applies one to the wrong city, has to be stoppable without a
 * deploy. A window switched off here stays off when the same event is scraped
 * again, because the upsert deliberately never touches `isEnabled`.
 *
 * Worth remembering while reading a row: surge moves the *indicator*, never a
 * price. It lifts the ceiling a publisher can reach without being flagged. It
 * does not change what anyone is charged, and it never enters the comparable
 * pool.
 */
export function SurgeView({ windows, onChanged }: Props) {
    const [target, setTarget] = React.useState<SurgeEventWindow | null>(null);
    const [note, setNote] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    // Null until mounted. "How many are live" is a question about *now*, and
    // answering it during render would both be impure and disagree with the
    // server's clock.
    const now = useNow();
    const live =
        now === null
            ? null
            : windows.filter(
                  (w) =>
                      w.isEnabled &&
                      new Date(w.startsAt).getTime() <= now &&
                      new Date(w.endsAt).getTime() >= now
              );
    const disabled = windows.filter((w) => !w.isEnabled);

    async function toggle() {
        if (!target) return;
        setBusy(true);
        const enabling = !target.isEnabled;
        try {
            await pricingService.setSurgeEnabled(
                target.id,
                enabling,
                enabling ? null : note.trim() || null
            );
            toast.success(enabling ? `${target.name} is live again` : `${target.name} switched off`, {
                description: enabling
                    ? "It will lift the ceiling again for spots it covers."
                    : "It stays off even if the scraper sees this event again.",
            });
            setTarget(null);
            setNote("");
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not change this window");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
                <Stat label="Lifting the ceiling now" value={live?.length ?? null} />
                <Stat label="Windows on the calendar" value={windows.length} />
                <Stat label="Switched off by ops" value={disabled.length} />
            </div>

            <SectionCard
                title="Windows"
                description="Written by the event scraper. Ops can only switch one off — and that off stays off."
            >
                {windows.length === 0 ? (
                    <EmptyState
                        icon={CalendarClock}
                        title="No windows on the calendar"
                        description="The event scraper has not published anything yet. Nothing here is lifting any ceiling."
                    />
                ) : (
                    <DataTable
                        data={windows}
                        searchPlaceholder="Search events..."
                        initialPageSize={15}
                        bulkActions={(rows, clear) => (
                            <>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                        runBulk(
                                            rows.filter((row) => row.isEnabled),
                                            (row) =>
                                                pricingService.setSurgeEnabled(
                                                    row.id,
                                                    false,
                                                    "Switched off in bulk"
                                                ),
                                            "Switched off",
                                            () => {
                                                clear();
                                                onChanged();
                                            }
                                        )
                                    }
                                >
                                    Switch off selected
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() =>
                                        runBulk(
                                            rows.filter((row) => !row.isEnabled),
                                            (row) => pricingService.setSurgeEnabled(row.id, true, null),
                                            "Switched on",
                                            () => {
                                                clear();
                                                onChanged();
                                            }
                                        )
                                    }
                                >
                                    Switch on selected
                                </Button>
                            </>
                        )}
                        columns={[
                            {
                                accessorKey: "name",
                                header: "Event",
                                cell: ({ row }) => (
                                    <div className="min-w-0">
                                        <p className="truncate font-medium text-foreground">
                                            {row.original.name}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {row.original.city ??
                                                (row.original.radiusMeters
                                                    ? "within " + row.original.radiusMeters + " m of a point"
                                                    : "everywhere")}
                                            {" - "}
                                            {row.original.source === "SCRAPER"
                                                ? "scraped"
                                                : row.original.source.toLowerCase()}
                                        </p>
                                    </div>
                                ),
                            },
                            {
                                accessorKey: "scope",
                                header: "Scope",
                                cell: ({ row }) => <StatusBadge status={scopeMeta[row.original.scope]} />,
                            },
                            {
                                id: "runs",
                                header: "Runs",
                                accessorFn: (w) => dateRange(w.startsAt, w.endsAt),
                            },
                            {
                                id: "uplift",
                                header: "Ceiling lift",
                                accessorFn: (w) => "+" + (Number(w.upliftPct) * 100).toFixed(0) + "%",
                            },
                            {
                                id: "state",
                                header: "State",
                                cell: ({ row }) =>
                                    row.original.isEnabled ? (
                                        <StatusBadge status={{ label: "Live", tone: "success" }} />
                                    ) : (
                                        <div>
                                            <StatusBadge status={{ label: "Off", tone: "danger" }} />
                                            {row.original.disabledNote && (
                                                <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">
                                                    {row.original.disabledNote}
                                                </p>
                                            )}
                                        </div>
                                    ),
                            },
                            {
                                id: "actions",
                                header: "",
                                cell: ({ row }) => (
                                    <div className="text-right">
                                        <Button
                                            size="sm"
                                            variant={row.original.isEnabled ? "outline" : "ghost"}
                                            onClick={() => {
                                                setTarget(row.original);
                                                setNote("");
                                            }}
                                        >
                                            {row.original.isEnabled ? (
                                                <>
                                                    <PowerOff className="mr-1.5 size-3.5" aria-hidden />
                                                    Switch off
                                                </>
                                            ) : (
                                                <>
                                                    <Power className="mr-1.5 size-3.5" aria-hidden />
                                                    Switch on
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                ),
                            },
                        ]}
                    />
                )}
            </SectionCard>

            <ConfirmDialog
                open={target !== null}
                onOpenChange={(open) => {
                    if (!open) setTarget(null);
                }}
                title={
                    target?.isEnabled
                        ? `Switch off "${target.name}"?`
                        : `Switch "${target?.name}" back on?`
                }
                description={
                    target?.isEnabled
                        ? "Publishers in its area stop getting the raised ceiling immediately. It stays off even if the scraper publishes this event again."
                        : "It will lift the ceiling again for every spot it covers, for as long as it runs."
                }
                confirmLabel={target?.isEnabled ? "Switch off" : "Switch on"}
                destructive={target?.isEnabled}
                busy={busy}
                onConfirm={toggle}
            >
                {target?.isEnabled && (
                    <div className="space-y-2">
                        <Label htmlFor="surge-note">Why (optional)</Label>
                        <Textarea
                            id="surge-note"
                            rows={2}
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            placeholder="Scraper picked up a fixture that was cancelled."
                        />
                    </div>
                )}
            </ConfirmDialog>
        </div>
    );
}

function Stat({ label, value }: { label: string; value: number | null }) {
    return (
        <Card className="rounded-lg border-border p-4 shadow-none">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {value ?? "—"}
            </p>
        </Card>
    );
}
