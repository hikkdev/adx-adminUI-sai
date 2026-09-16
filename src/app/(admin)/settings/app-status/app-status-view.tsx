"use client";

import * as React from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/adx/page-header";
import { formatDateTime } from "@/lib/format";
import { legalService, type AppStatus, type ServiceState } from "@/services/legal";

const STATES: ServiceState[] = ["UP", "DEGRADED", "DOWN"];

const STATE_CLASS: Record<ServiceState, string> = {
    UP: "bg-success-soft text-success",
    DEGRADED: "bg-warning-soft text-warning",
    DOWN: "bg-danger-soft text-danger",
};

/**
 * What every build reads before it can run.
 *
 * This is the sharpest control in the console: raising the minimum build locks
 * every older install out of both apps until the store update lands, and the
 * maintenance switch stops them dead. Both are drawn as what they are, with
 * the consequence written next to the control rather than in a tooltip.
 */
/**
 * Every service the apps' System status screen draws, in order. A status
 * saved before Lot D has no `kyc` row; the draft gains it, up, so ops can
 * mark identity verification degraded when Digio is — the row is written
 * with the next save.
 */
export const SERVICE_ROWS: { key: string; label: string }[] = [
    { key: "orders", label: "Orders and offers" },
    { key: "payments", label: "Payments and payouts" },
    { key: "maps", label: "Maps and navigation" },
    { key: "qr", label: "QR verification" },
    { key: "notifications", label: "Notifications" },
    { key: "kyc", label: "Identity verification" },
];

export function withEveryService(status: AppStatus): AppStatus {
    const missing = SERVICE_ROWS.filter((row) => !status.services.some((service) => service.key === row.key));
    if (missing.length === 0) return status;
    return { ...status, services: [...status.services, ...missing.map((row) => ({ ...row, state: "UP" as const }))] };
}

export function AppStatusView({ status, onChanged }: { status: AppStatus; onChanged: () => void }) {
    const [draft, setDraft] = React.useState<AppStatus>(() => withEveryService(status));
    const [busy, setBusy] = React.useState(false);

    const set = <K extends keyof AppStatus>(key: K, value: AppStatus[K]) => setDraft((current) => ({ ...current, [key]: value }));
    const dirty = JSON.stringify(draft) !== JSON.stringify(withEveryService(status));

    async function save() {
        setBusy(true);
        try {
            const { updatedAt: _updatedAt, ...body } = draft;
            await legalService.saveAppStatus(body);
            toast.success("App status saved", {
                description: draft.maintenance.active
                    ? "Both apps now show Back soon until this is switched off."
                    : "Both apps read it on their next open.",
            });
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not save the app status.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-5">
            <PageHeader
                title="App status"
                subtitle="What both apps read before they do anything else — the supported build, the maintenance window, and how each service is faring."
                actions={
                    <Button onClick={save} disabled={busy || !dirty} data-testid="app-status-save">
                        {busy ? "Saving…" : "Save"}
                    </Button>
                }
            />

            <Card className="rounded-lg border-border p-5 shadow-none">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Supported builds</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                    A build below the minimum cannot get past Update required. Raise it only once the store build is actually available.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {(["android", "ios"] as const).map((platform) => (
                        <React.Fragment key={platform}>
                            <div className="space-y-1.5">
                                <Label htmlFor={`min-${platform}`}>Minimum · {platform}</Label>
                                <Input
                                    id={`min-${platform}`}
                                    type="number"
                                    min={0}
                                    value={draft.minimumBuild[platform]}
                                    onChange={(event) => set("minimumBuild", { ...draft.minimumBuild, [platform]: Number(event.target.value) })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor={`latest-${platform}`}>Latest · {platform}</Label>
                                <Input
                                    id={`latest-${platform}`}
                                    type="number"
                                    min={0}
                                    value={draft.latestBuild[platform]}
                                    onChange={(event) => set("latestBuild", { ...draft.latestBuild, [platform]: Number(event.target.value) })}
                                />
                            </div>
                        </React.Fragment>
                    ))}
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {(["android", "ios"] as const).map((platform) => (
                        <div key={platform} className="space-y-1.5">
                            <Label htmlFor={`store-${platform}`}>Store URL · {platform}</Label>
                            <Input
                                id={`store-${platform}`}
                                value={draft.storeUrl[platform]}
                                onChange={(event) => set("storeUrl", { ...draft.storeUrl, [platform]: event.target.value })}
                            />
                        </div>
                    ))}
                </div>
            </Card>

            <Card className="rounded-lg border-border p-5 shadow-none">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Maintenance</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                            While this is on, both apps stop at Back soon. Field work already saved on a device stays there.
                        </p>
                    </div>
                    <Switch
                        checked={draft.maintenance.active}
                        onCheckedChange={(active) => set("maintenance", { ...draft.maintenance, active })}
                        aria-label="Maintenance mode"
                        data-testid="app-status-maintenance"
                    />
                </div>
                {draft.maintenance.active && (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="maintenance-message">What the apps say</Label>
                            <Input
                                id="maintenance-message"
                                value={draft.maintenance.message ?? ""}
                                onChange={(event) => set("maintenance", { ...draft.maintenance, message: event.target.value })}
                                placeholder="Scheduled maintenance until 2:00 AM IST."
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="maintenance-until">Until</Label>
                            <Input
                                id="maintenance-until"
                                type="datetime-local"
                                value={draft.maintenance.until ? draft.maintenance.until.slice(0, 16) : ""}
                                onChange={(event) =>
                                    set("maintenance", {
                                        ...draft.maintenance,
                                        until: event.target.value ? new Date(event.target.value).toISOString() : undefined,
                                    })
                                }
                            />
                        </div>
                    </div>
                )}
            </Card>

            <Card className="rounded-lg border-border p-5 shadow-none">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Incident</h3>
                        <p className="mt-1 text-sm text-muted-foreground">The banner above the services list on both apps&apos; System status screen.</p>
                    </div>
                    <Switch
                        checked={Boolean(draft.incident)}
                        onCheckedChange={(on) =>
                            set("incident", on ? { title: "", message: "", severity: "WARNING", since: new Date().toISOString() } : null)
                        }
                        aria-label="Incident"
                        data-testid="app-status-incident"
                    />
                </div>
                {draft.incident && (
                    <div className="mt-4 space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="incident-title">Title</Label>
                            <Input
                                id="incident-title"
                                value={draft.incident.title}
                                onChange={(event) => set("incident", { ...draft.incident!, title: event.target.value })}
                                placeholder="Payout delays"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="incident-message">What is happening</Label>
                            <Textarea
                                id="incident-message"
                                value={draft.incident.message}
                                onChange={(event) => set("incident", { ...draft.incident!, message: event.target.value })}
                                rows={3}
                                placeholder="Bank partner issue. Wallet balances are unaffected."
                            />
                        </div>
                    </div>
                )}
            </Card>

            <Card className="rounded-lg border-border p-5 shadow-none">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Services</h3>
                <p className="mt-1 text-sm text-muted-foreground">One row per service on both apps&apos; System status screen.</p>
                <ul className="mt-4 divide-y">
                    {draft.services.map((service, index) => (
                        <li key={service.key} className="flex flex-wrap items-center gap-3 py-3" data-testid={`app-status-service-${service.key}`}>
                            <span className="min-w-40 flex-1 text-sm font-medium text-foreground">{service.label}</span>
                            <Input
                                value={service.note ?? ""}
                                onChange={(event) => {
                                    const services = [...draft.services];
                                    services[index] = { ...service, note: event.target.value };
                                    set("services", services);
                                }}
                                placeholder="What people should know"
                                className="h-9 max-w-xs flex-1"
                            />
                            <div className="flex gap-1.5">
                                {STATES.map((state) => (
                                    <button
                                        key={state}
                                        type="button"
                                        onClick={() => {
                                            const services = [...draft.services];
                                            services[index] = { ...service, state };
                                            set("services", services);
                                        }}
                                        className={cn(
                                            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                                            service.state === state ? STATE_CLASS[state] : "bg-muted text-muted-foreground hover:bg-muted/70"
                                        )}
                                    >
                                        {state === "UP" ? "Operational" : state === "DEGRADED" ? "Degraded" : "Down"}
                                    </button>
                                ))}
                            </div>
                        </li>
                    ))}
                </ul>
                <p className="mt-4 text-xs text-muted-foreground">Last saved {formatDateTime(status.updatedAt)}.</p>
            </Card>
        </div>
    );
}
