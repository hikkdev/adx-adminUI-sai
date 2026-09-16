"use client";

import * as React from "react";
import { Plus, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { DataTable } from "@/components/adx/data-table";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { runBulk } from "@/lib/run-bulk";
import { pricingService } from "@/services/pricing";
import type { ScraperSource, ScraperSourceKind } from "@/types/pricing-engine";

interface Props {
    sources: ScraperSource[];
    onChanged: () => void;
}

const KINDS: { value: ScraperSourceKind; label: string; hint: string }[] = [
    { value: "HTML", label: "Web page", hint: "Read with CSS selectors" },
    { value: "FEED", label: "RSS / Atom feed", hint: "Standard feed fields" },
    { value: "JSON", label: "JSON API", hint: "Read with dotted paths" },
    { value: "MANUAL", label: "Manual", hint: "Rows the research team hands over" },
];

/** Field map keys the scraper understands, per source kind. */
const FIELD_KEYS = ["name", "startsAt", "endsAt", "venue", "city", "uplift"] as const;

const runMeta = {
    OK: { label: "OK", tone: "success" as const },
    NO_MATCHES: { label: "No matches", tone: "warning" as const },
    FETCH_FAILED: { label: "Fetch failed", tone: "danger" as const },
    PARSE_FAILED: { label: "Parse failed", tone: "danger" as const },
};

/**
 * Where the surge calendar comes from.
 *
 * The scraper itself runs headless — nobody wants a cron job with a settings
 * screen. What ops needs is the part that changes: which sites are watched, how
 * a page maps onto a window, and the ability to stop a source that has started
 * inventing events without waiting for a deploy.
 *
 * `NO_MATCHES` in the run history is the status worth watching. It usually means
 * a site redesign moved the elements the field map points at, and the symptom is
 * a source that keeps succeeding while quietly finding nothing.
 */
export function ScraperView({ sources, onChanged }: Props) {
    const [target, setTarget] = React.useState<ScraperSource | null>(null);
    const [note, setNote] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    async function toggle() {
        if (!target) return;
        setBusy(true);
        const enabling = !target.isEnabled;
        try {
            await pricingService.setScraperSourceEnabled(
                target.id,
                enabling,
                enabling ? null : note.trim() || null
            );
            toast.success(enabling ? `${target.name} is running again` : `${target.name} stopped`, {
                description: enabling
                    ? "It will publish windows on its next run."
                    : "Windows it already created stay as they are — switch those off individually.",
            });
            setTarget(null);
            setNote("");
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not change that source");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-6">
            <NewSource onCreated={onChanged} />

            <SectionCard
                title="Sources"
                description={`${sources.filter((s) => s.isEnabled).length} running of ${sources.length}`}
            >
                <DataTable
                    data={sources}
                    searchPlaceholder="Search sources…"
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
                                            pricingService.setScraperSourceEnabled(
                                                row.id,
                                                false,
                                                "Stopped in bulk"
                                            ),
                                        "Stopped",
                                        () => {
                                            clear();
                                            onChanged();
                                        }
                                    )
                                }
                            >
                                Stop selected
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                    runBulk(
                                        rows.filter((row) => !row.isEnabled),
                                        (row) =>
                                            pricingService.setScraperSourceEnabled(row.id, true, null),
                                        "Started",
                                        () => {
                                            clear();
                                            onChanged();
                                        }
                                    )
                                }
                            >
                                Start selected
                            </Button>
                        </>
                    )}
                    emptyState={
                        <p className="py-10 text-center text-sm text-muted-foreground">
                            No sources configured, so the surge calendar has nothing feeding it.
                        </p>
                    }
                    columns={[
                        {
                            accessorKey: "name",
                            header: "Source",
                            cell: ({ row }) => (
                                <div className="min-w-0">
                                    <p className="truncate font-medium text-foreground">
                                        {row.original.name}
                                    </p>
                                    <p className="truncate font-mono text-xs text-muted-foreground">
                                        {row.original.url}
                                    </p>
                                </div>
                            ),
                        },
                        { accessorKey: "kind", header: "Kind" },
                        {
                            id: "covers",
                            header: "Covers",
                            accessorFn: (source) =>
                                source.citySlugs.length === 0
                                    ? "National"
                                    : source.citySlugs.join(", "),
                        },
                        {
                            id: "every",
                            header: "Runs every",
                            accessorFn: (source) =>
                                source.intervalMinutes >= 60
                                    ? `${Math.round(source.intervalMinutes / 60)} h`
                                    : `${source.intervalMinutes} min`,
                        },
                        {
                            id: "lastRun",
                            header: "Last run",
                            cell: ({ row }) => {
                                const source = row.original;
                                if (!source.lastRunAt) {
                                    return (
                                        <span className="text-xs text-muted-foreground">
                                            Never run
                                        </span>
                                    );
                                }
                                return (
                                    <div className="space-y-1">
                                        {source.lastRunStatus && (
                                            <StatusBadge status={runMeta[source.lastRunStatus]} />
                                        )}
                                        <p className="text-xs text-muted-foreground">
                                            {source.lastRunFound ?? 0} found ·{" "}
                                            {new Date(source.lastRunAt).toLocaleDateString("en-IN", {
                                                day: "numeric",
                                                month: "short",
                                            })}
                                        </p>
                                    </div>
                                );
                            },
                        },
                        {
                            id: "auto",
                            header: "New windows",
                            accessorFn: (source) =>
                                source.autoEnableWindows ? "Go live" : "Proposed, off",
                        },
                        {
                            id: "actions",
                            header: "",
                            cell: ({ row }) => (
                                <div className="flex items-center justify-end gap-2">
                                    {!row.original.isEnabled && (
                                        <StatusBadge status={{ label: "Stopped", tone: "danger" }} />
                                    )}
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
                                                Stop
                                            </>
                                        ) : (
                                            <>
                                                <Power className="mr-1.5 size-3.5" aria-hidden />
                                                Start
                                            </>
                                        )}
                                    </Button>
                                </div>
                            ),
                        },
                    ]}
                />
                {sources.some((s) => !s.isEnabled && s.disabledNote) && (
                    <div className="mt-4 space-y-1">
                        {sources
                            .filter((s) => !s.isEnabled && s.disabledNote)
                            .map((s) => (
                                <p key={s.id} className="text-xs text-muted-foreground">
                                    <strong>{s.name}</strong> — {s.disabledNote}
                                </p>
                            ))}
                    </div>
                )}
            </SectionCard>

            <ConfirmDialog
                open={target !== null}
                onOpenChange={(open) => {
                    if (!open) setTarget(null);
                }}
                title={target?.isEnabled ? `Stop "${target.name}"?` : `Start "${target?.name}"?`}
                description={
                    target?.isEnabled
                        ? "It stops fetching immediately. Windows it already published stay live — switch those off individually on the surge calendar."
                        : "It will fetch on its next scheduled run."
                }
                confirmLabel={target?.isEnabled ? "Stop it" : "Start it"}
                destructive={target?.isEnabled}
                busy={busy}
                onConfirm={toggle}
            >
                {target?.isEnabled && (
                    <div className="space-y-2">
                        <Label htmlFor="stop-note">Why (optional)</Label>
                        <Textarea
                            id="stop-note"
                            rows={2}
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            placeholder="Site redesigned — field map no longer matches anything."
                        />
                    </div>
                )}
            </ConfirmDialog>
        </div>
    );
}

function NewSource({ onCreated }: { onCreated: () => void }) {
    const [name, setName] = React.useState("");
    const [url, setUrl] = React.useState("");
    const [kind, setKind] = React.useState<ScraperSourceKind>("HTML");
    const [cities, setCities] = React.useState("");
    const [uplift, setUplift] = React.useState("10");
    const [hours, setHours] = React.useState("6");
    const [autoEnable, setAutoEnable] = React.useState(false);
    const [fieldMap, setFieldMap] = React.useState<Record<string, string>>({});
    const [busy, setBusy] = React.useState(false);

    const selectedKind = KINDS.find((option) => option.value === kind);
    const valid = name.trim().length >= 2 && /^https?:\/\//.test(url.trim());

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBusy(true);
        try {
            await pricingService.createScraperSource({
                name: name.trim(),
                url: url.trim(),
                kind,
                citySlugs: cities
                    .split(",")
                    .map((value) => value.trim().toLowerCase().replace(/\s+/g, "-"))
                    .filter(Boolean),
                fieldMap: Object.fromEntries(
                    Object.entries(fieldMap).filter(([, value]) => value.trim())
                ),
                defaultUpliftPct: (Number(uplift) / 100).toFixed(4),
                intervalMinutes: Math.round(Number(hours) * 60),
                autoEnableWindows: autoEnable,
            });
            toast.success(`Added ${name.trim()}`, {
                description: autoEnable
                    ? "Windows it finds will go live immediately."
                    : "Windows it finds arrive switched off for review.",
            });
            setName("");
            setUrl("");
            setCities("");
            setFieldMap({});
            onCreated();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not add that source");
        } finally {
            setBusy(false);
        }
    }

    return (
        <SectionCard
            title="Add a source"
            description="What the scraper watches, and how a record on it becomes a surge window."
        >
            <form onSubmit={submit} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="src-name">Name</Label>
                        <Input
                            id="src-name"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="BookMyShow — Mumbai concerts"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="src-kind">Kind</Label>
                        <Select
                            value={kind}
                            onValueChange={(value) => setKind(value as ScraperSourceKind)}
                        >
                            <SelectTrigger id="src-kind">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {KINDS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">{selectedKind?.hint}</p>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="src-url">URL</Label>
                    <Input
                        id="src-url"
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        placeholder="https://example.com/events/mumbai"
                        className="font-mono text-xs"
                    />
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                        <Label htmlFor="src-cities">Cities covered</Label>
                        <Input
                            id="src-cities"
                            value={cities}
                            onChange={(event) => setCities(event.target.value)}
                            placeholder="mumbai, pune"
                        />
                        <p className="text-xs text-muted-foreground">
                            Comma separated. Blank means national.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="src-uplift">Default uplift (%)</Label>
                        <Input
                            id="src-uplift"
                            inputMode="decimal"
                            value={uplift}
                            onChange={(event) => setUplift(event.target.value)}
                            className="tabular-nums"
                        />
                        <p className="text-xs text-muted-foreground">
                            Used when a record carries none of its own.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="src-interval">Run every (hours)</Label>
                        <Input
                            id="src-interval"
                            inputMode="decimal"
                            value={hours}
                            onChange={(event) => setHours(event.target.value)}
                            className="tabular-nums"
                        />
                    </div>
                </div>

                {kind !== "MANUAL" && (
                    <div>
                        <h4 className="text-sm font-semibold text-foreground">Field map</h4>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {kind === "JSON"
                                ? "Dotted paths into each record, e.g. event.title"
                                : "CSS selectors, e.g. .event-card h3"}
                            . Leave a field blank to ignore it.
                        </p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {FIELD_KEYS.map((key) => (
                                <div key={key} className="space-y-1.5">
                                    <Label htmlFor={`fm-${key}`} className="text-xs">
                                        {key}
                                    </Label>
                                    <Input
                                        id={`fm-${key}`}
                                        value={fieldMap[key] ?? ""}
                                        onChange={(event) =>
                                            setFieldMap((current) => ({
                                                ...current,
                                                [key]: event.target.value,
                                            }))
                                        }
                                        className="font-mono text-xs"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <Card className="rounded-lg border-border bg-muted/30 p-4 shadow-none">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <Label htmlFor="src-auto" className="text-sm">
                                Publish windows live
                            </Label>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Off means a window this source finds arrives switched off, waiting
                                for someone to look at it. Leave it off for a new source: a field
                                map that matches the wrong element produces confident nonsense, and
                                a surge window nobody reviewed lifts real prices.
                            </p>
                        </div>
                        <Switch id="src-auto" checked={autoEnable} onCheckedChange={setAutoEnable} />
                    </div>
                </Card>

                <Button type="submit" disabled={busy || !valid}>
                    <Plus className="mr-1.5 size-3.5" aria-hidden />
                    {busy ? "Adding…" : "Add source"}
                </Button>
            </form>
        </SectionCard>
    );
}
