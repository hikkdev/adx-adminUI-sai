"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { History, MoonStar, Pencil, RotateCcw, Search, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { FilterChips } from "@/components/adx/filter-chips";
import { PageHeader } from "@/components/adx/page-header";
import { ApiError } from "@/lib/api-client";
import { formatDate, formatDateTime } from "@/lib/format";
import {
    FLAG_KIND_LABEL,
    FLAG_KINDS,
    FLAG_SOURCE_LABEL,
    FLAG_SOURCES,
    FLAG_STATE_LABEL,
    FLAG_STATES,
    FLAG_SURFACE_LABEL,
    FLAG_SURFACES,
    changeSummary,
    changedByLabel,
    flagsService,
    isDarkLaunch,
    rolloutLabel,
    rolloutRulesLabel,
    sharedVariantsOf,
    type FeatureFlag,
    type FlagChange,
} from "@/services/flags";
import { BulkConfirm, type BulkAction } from "./bulk-confirm";
import { CoverageCard } from "./coverage-card";
import { FlagDialog } from "./flag-dialog";
import { FlagHistory } from "./flag-history";
import { FlagRollback } from "./flag-rollback";
import { filterFlags, flagFacetCounts, flagFacetsKey, ownersOf, type FlagFacets } from "./flags-facets";
import type { FlagsRead } from "./flags-loader";

interface FlagsViewProps {
    read: FlagsRead;
    facets: FlagFacets;
    /** A facet moved: the loader writes it to the URL. */
    onFacets: (next: Partial<FlagFacets>) => void;
    onChanged: () => void;
}

/** The flags that have ever moved, most recent move first. */
export function recentChanges(flags: FeatureFlag[]): { flag: FeatureFlag; change: FlagChange }[] {
    return flags
        .flatMap((flag) => (flag.lastChange ? [{ flag, change: flag.lastChange }] : []))
        .sort((a, b) => b.change.at.localeCompare(a.change.at));
}

const NO_VARIANT = "__default__";
const ANY_OWNER = "__any__";

/** The table's first page. The footer's rows-per-page (the shared table's own list) walks the rest. */
export const FLAGS_PAGE_SIZE = 25;
/** The desk's rows-per-page choices (the owner asked for a real pager over 150+ flags). */
export const FLAGS_PAGE_SIZES = [10, 25, 50, 100];

/**
 * "Feature Flags · /settings/flags" on DR 10 (`5102:48239`): the banner,
 * the flag table with a rollout bar and a switch on each row, and Recent
 * changes below — rebuilt as the registry (CG5, answers 144-146), and as a
 * desk in package L-C (the owner, 14 September: pagination and bulk
 * actions on the Feature flags page).
 *
 * The frame's Environments column is drawn as Surfaces, which is what it
 * was: where the feature shows. The table is the shared `DataTable`: paged
 * in the footer, sortable by key, kind and last change over the whole list
 * the loader holds, with a selection column and a bulk bar. The filters —
 * surface, kind, source, the state row (On / Off / Dark launch), the owner
 * and the search — sit in the URL through the loader, and their counts
 * follow the chip rule (each facet tallied with its own filter removed).
 * On each row: the kill switch writes `PATCH enabled` on its own (a kill
 * switch that waits for a dialog is not one), the variant picker writes
 * `PATCH variant`, Edit opens the rollout editor, Roll back confirms `POST
 * /flags/:key/rollback` and is disabled while the flag has never moved, and
 * a registered feature that arrived off wears a Dark launch badge.
 *
 * The bulk bar (L-B): Turn on, Turn off, Set rollout %, Set variant (only
 * while every selected key shares one variant set; otherwise the button
 * says why), Roll back (the keys with a last good state, and the bar says
 * how many). Each confirms with the keys and a required note and posts ONE
 * request — `POST /flags/bulk` or `/flags/bulk/rollback`. "Select all N
 * matching" names every row the filter leaves, across pages, from the
 * loader's full list — the same rows `GET /flags?…` would answer.
 *
 * There is still no Add flag: rows come from the registry, and a key
 * nobody declared is a 404.
 */
export function FlagsView({ read, facets, onFacets, onChanged }: FlagsViewProps) {
    const { flags, registry, coverage } = read;
    const [editing, setEditing] = React.useState<FeatureFlag | null>(null);
    const [rollingBack, setRollingBack] = React.useState<FeatureFlag | null>(null);
    const [history, setHistory] = React.useState<string | null>(null);
    const [busyKey, setBusyKey] = React.useState<string | null>(null);
    const [bulk, setBulk] = React.useState<{ action: BulkAction; flags: FeatureFlag[]; clear: () => void } | null>(null);

    const visible = React.useMemo(() => filterFlags(flags, facets), [flags, facets]);
    const counts = React.useMemo(() => flagFacetCounts(flags, facets), [flags, facets]);
    const owners = React.useMemo(() => ownersOf(flags, registry.features.map((entry) => entry.owner)), [flags, registry]);
    const recent = React.useMemo(() => recentChanges(flags), [flags]);
    const facetsKey = flagFacetsKey(facets);

    /* One write per row at a time: the kill switch and the variant picker
       share the lock, so a second click while the first is on the wire
       cannot land a patch against a position that has just moved. */
    const write = React.useCallback(
        async (flag: FeatureFlag, input: Parameters<typeof flagsService.set>[1], done: (next: FeatureFlag) => string) => {
            if (busyKey) return;
            setBusyKey(flag.key);
            try {
                const next = await flagsService.set(flag.key, input);
                toast.success(`${flag.key} · ${done(next)}`, {
                    description: "Takes effect within 30 seconds everywhere. Recorded with your name in the audit log.",
                });
                onChanged();
            } catch (cause) {
                toast.error(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "Could not move the flag.");
            } finally {
                setBusyKey(null);
            }
        },
        [busyKey, onChanged],
    );

    /* The Owner select's value must be one of its items: the URL's spelling is matched case-insensitively, and an owner no row names is still offered so the filter can be undone. */
    const ownerValue = facets.owner ? (owners.find((owner) => owner.toLowerCase() === facets.owner.trim().toLowerCase()) ?? facets.owner) : "";
    const ownerOptions = ownerValue && !owners.includes(ownerValue) ? [...owners, ownerValue] : owners;

    const columns = React.useMemo<ColumnDef<FeatureFlag>[]>(
        () => [
            {
                id: "key",
                accessorKey: "key",
                header: ({ column }) => <SortableHeader column={column}>Key</SortableHeader>,
                cell: ({ row }) => {
                    const flag = row.original;
                    return (
                        <div className="min-w-[220px] max-w-[360px]">
                            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{flag.key}</code>
                            {flag.description && <p className="mt-1 text-xs text-muted-foreground">{flag.description}</p>}
                            {flag.aliases?.length > 0 && (
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                    also <code>{flag.aliases.join(", ")}</code>
                                </p>
                            )}
                            <p className="mt-1 text-[11px] text-muted-foreground">
                                {flag.owner ? `Owner ${flag.owner}` : "No owner"}
                                {flag.registeredAt ? ` · registered ${formatDate(flag.registeredAt)}` : " · not registered"}
                            </p>
                        </div>
                    );
                },
            },
            {
                id: "surfaces",
                header: "Surfaces",
                enableSorting: false,
                cell: ({ row }) => (
                    <div className="flex max-w-[200px] flex-wrap gap-1">
                        {row.original.surfaces.length ? (
                            row.original.surfaces.map((item) => (
                                <span key={item} className="rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-medium text-info">
                                    {FLAG_SURFACE_LABEL[item]}
                                </span>
                            ))
                        ) : (
                            <span className="text-xs text-muted-foreground">Unclassified</span>
                        )}
                    </div>
                ),
            },
            {
                id: "kind",
                accessorFn: (flag) => FLAG_KIND_LABEL[flag.kind],
                header: ({ column }) => <SortableHeader column={column}>Kind</SortableHeader>,
                cell: ({ row }) => (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{FLAG_KIND_LABEL[row.original.kind]}</span>
                ),
            },
            {
                id: "source",
                accessorKey: "source",
                header: "Source",
                enableSorting: false,
                cell: ({ row }) => <span className="text-xs text-muted-foreground">{FLAG_SOURCE_LABEL[row.original.source]}</span>,
            },
            {
                id: "state",
                header: "State",
                enableSorting: false,
                cell: ({ row }) => {
                    const flag = row.original;
                    return (
                        <div className="flex flex-col items-start gap-1">
                            <Switch
                                checked={flag.enabled}
                                disabled={busyKey === flag.key}
                                onCheckedChange={(enabled) => void write(flag, { enabled }, (next) => rolloutLabel(next))}
                                aria-label={`Toggle ${flag.key}`}
                            />
                            {isDarkLaunch(flag) && (
                                <span
                                    className="inline-flex items-center gap-1 rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-medium text-info"
                                    title="Registered off and never switched on."
                                >
                                    <MoonStar className="size-3" aria-hidden />
                                    Dark launch
                                </span>
                            )}
                        </div>
                    );
                },
            },
            {
                id: "rollout",
                header: "Rollout",
                enableSorting: false,
                cell: ({ row }) => {
                    const flag = row.original;
                    const rules = rolloutRulesLabel(flag.rollout);
                    return (
                        <div className="flex min-w-[160px] flex-col items-start gap-1">
                            <button
                                type="button"
                                onClick={() => setEditing(flag)}
                                className="flex items-center gap-2"
                                aria-label={`Edit rollout of ${flag.key}`}
                                title={rolloutLabel(flag)}
                            >
                                <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                                    <span className="block h-full rounded-full bg-foreground" style={{ width: `${flag.rolloutPercent}%` }} />
                                </span>
                                <span className="w-9 text-right text-xs tabular-nums">{flag.rolloutPercent}%</span>
                            </button>
                            {flag.variants.length > 0 && (
                                <Select
                                    value={flag.variant ?? NO_VARIANT}
                                    disabled={busyKey === flag.key}
                                    onValueChange={(value) =>
                                        void write(flag, { variant: value === NO_VARIANT ? null : value }, (next) =>
                                            next.variant ? `variant ${next.variant}` : "default implementation",
                                        )
                                    }
                                >
                                    <SelectTrigger className="h-7 w-36 bg-card text-xs" aria-label={`Variant of ${flag.key}`}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NO_VARIANT}>Default</SelectItem>
                                        {flag.variants.map((variant) => (
                                            <SelectItem key={variant} value={variant}>
                                                {variant}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                            {rules && <span className="max-w-[200px] truncate text-[11px] text-muted-foreground">{rules}</span>}
                        </div>
                    );
                },
            },
            {
                id: "last-change",
                accessorFn: (flag) => flag.lastChange?.at ?? "",
                header: ({ column }) => <SortableHeader column={column}>Last change</SortableHeader>,
                cell: ({ row }) => {
                    const change = row.original.lastChange;
                    if (!change) return <span className="text-xs text-muted-foreground">Never moved</span>;
                    return (
                        <div className="min-w-[140px]">
                            <p className="text-xs text-foreground">{changedByLabel(change)}</p>
                            <p className="text-[11px] text-muted-foreground">{formatDateTime(change.at)}</p>
                        </div>
                    );
                },
            },
            {
                id: "actions",
                header: () => <span className="sr-only">Actions</span>,
                enableSorting: false,
                enableHiding: false,
                cell: ({ row }) => {
                    const flag = row.original;
                    const busy = busyKey === flag.key;
                    return (
                        <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" className="h-8" onClick={() => setEditing(flag)} aria-label={`Edit ${flag.key}`} title="Edit">
                                <Pencil className="size-3.5" aria-hidden />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8" onClick={() => setHistory(flag.key)} aria-label={`History of ${flag.key}`} title="History">
                                <History className="size-3.5" aria-hidden />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 bg-card"
                                disabled={!flag.lastGoodState || busy}
                                title={flag.lastGoodState ? "Back to the position before the last change." : "This flag has never moved."}
                                onClick={() => setRollingBack(flag)}
                            >
                                <RotateCcw className="size-3.5" aria-hidden />
                                Roll back
                            </Button>
                        </div>
                    );
                },
            },
        ],
        [busyKey, write],
    );

    return (
        <div className="space-y-5">
            <PageHeader title="Feature flags" subtitle="Progressive rollouts across the platform" />

            <div className="flex items-center gap-3 rounded-lg border border-warning/20 bg-warning-soft px-4 py-3">
                <TriangleAlert className="size-4 shrink-0 text-warning" />
                <p className="text-sm text-foreground">
                    Changes apply within 30 seconds to every surface the flag targets. Every toggle lands in the audit log.
                </p>
            </div>

            <CoverageCard coverage={coverage} />

            <div className="flex flex-col gap-3">
                <FilterChips<FlagFacets["surface"]>
                    value={facets.surface}
                    onChange={(surface) => onFacets({ surface })}
                    chips={[
                        { value: "ALL", label: "All surfaces", count: counts.surface.ALL },
                        ...FLAG_SURFACES.map((item) => ({ value: item, label: FLAG_SURFACE_LABEL[item], count: counts.surface[item] })),
                    ]}
                />
                <FilterChips<FlagFacets["state"]>
                    value={facets.state}
                    onChange={(state) => onFacets({ state })}
                    chips={[
                        { value: "ALL", label: "Any state", count: counts.state.ALL },
                        ...FLAG_STATES.map((item) => ({ value: item, label: FLAG_STATE_LABEL[item], count: counts.state[item] })),
                    ]}
                />
                <div className="flex flex-wrap items-center gap-3">
                    <FilterChips<FlagFacets["kind"]>
                        value={facets.kind}
                        onChange={(kind) => onFacets({ kind })}
                        chips={[
                            { value: "ALL", label: "Any kind" },
                            ...FLAG_KINDS.map((item) => ({ value: item, label: FLAG_KIND_LABEL[item], count: counts.kind[item] })),
                        ]}
                    />
                    <span className="hidden h-5 w-px bg-border sm:block" aria-hidden />
                    <FilterChips<FlagFacets["source"]>
                        value={facets.source}
                        onChange={(source) => onFacets({ source })}
                        chips={[
                            { value: "ALL", label: "Any source" },
                            ...FLAG_SOURCES.map((item) => ({ value: item, label: FLAG_SOURCE_LABEL[item], count: counts.source[item] })),
                        ]}
                    />
                    <Select value={ownerValue || ANY_OWNER} onValueChange={(value) => onFacets({ owner: value === ANY_OWNER ? "" : value })}>
                        <SelectTrigger className="h-8 w-44 bg-card text-sm" aria-label="Owner">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ANY_OWNER}>Any owner</SelectItem>
                            {ownerOptions.map((owner) => (
                                <SelectItem key={owner} value={owner}>
                                    {owner}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <div className="relative ml-auto w-full sm:w-72">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                        <Input
                            value={facets.q}
                            onChange={(event) => onFacets({ q: event.target.value })}
                            placeholder="Search key, description, owner"
                            className="h-9 bg-card pl-8"
                            aria-label="Search flags"
                        />
                    </div>
                </div>
                <p className="text-sm text-muted-foreground" data-testid="flags-count">
                    {visible.length} of {flags.length} flag{flags.length === 1 ? "" : "s"}
                </p>
            </div>

            {/* Keyed on the facets: a selection never outlives the filter it was made under, and a change of filter lands on the first page. */}
            <DataTable
                key={facetsKey}
                columns={columns}
                data={visible}
                showColumnToggle={false}
                initialPageSize={FLAGS_PAGE_SIZE}
                pageSizes={FLAGS_PAGE_SIZES}
                emptyState={
                    <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        {flags.length ? "No flag matches these filters." : "No flags. They come from the registry at boot, not from here."}
                    </p>
                }
                bulkActions={(rows, clear) => (
                    <BulkBar rows={rows} matching={visible} clear={clear} onAction={(action, targets) => setBulk({ action, flags: targets, clear })} />
                )}
            />

            <Card className="overflow-hidden rounded-lg border-border shadow-none">
                <h3 className="px-5 pb-3 pt-4 text-base font-semibold text-foreground">Recent changes</h3>
                {recent.length ? (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-y bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                <th className="px-5 py-2.5">Flag</th>
                                <th className="px-5 py-2.5">Changed by</th>
                                <th className="px-5 py-2.5">When</th>
                                <th className="px-5 py-2.5 text-right">Change</th>
                                <th className="px-5 py-2.5 text-right" aria-label="History" />
                            </tr>
                        </thead>
                        <tbody>
                            {recent.map(({ flag, change }) => (
                                <tr key={change.id} className="border-b last:border-0">
                                    <td className="px-5 py-3">
                                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{flag.key}</code>
                                    </td>
                                    <td className="px-5 py-3 text-xs text-foreground">{changedByLabel(change)}</td>
                                    <td className="px-5 py-3 text-muted-foreground">{formatDateTime(change.at)}</td>
                                    <td className="px-5 py-3 text-right font-medium tabular-nums">{changeSummary(change, null)}</td>
                                    <td className="px-5 py-3 text-right">
                                        <Button variant="outline" size="sm" className="h-8 bg-card" onClick={() => setHistory(flag.key)}>
                                            History
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p className="border-t px-5 py-8 text-center text-sm text-muted-foreground">No flag has moved yet.</p>
                )}
            </Card>

            <FlagDialog
                flag={editing}
                onOpenChange={(open) => {
                    if (!open) setEditing(null);
                }}
                onSaved={onChanged}
            />
            <FlagRollback
                flag={rollingBack}
                onOpenChange={(open) => {
                    if (!open) setRollingBack(null);
                }}
                onDone={onChanged}
            />
            <FlagHistory
                flagKey={history}
                onOpenChange={(open) => {
                    if (!open) setHistory(null);
                }}
            />
            <BulkConfirm
                action={bulk?.action ?? null}
                flags={bulk?.flags ?? []}
                onOpenChange={(open) => {
                    if (!open) setBulk(null);
                }}
                onDone={() => {
                    bulk?.clear();
                    onChanged();
                }}
            />
        </div>
    );
}

interface BulkBarProps {
    /** The rows checked on the page in hand. */
    rows: FeatureFlag[];
    /** Every row the filter leaves, across pages. */
    matching: FeatureFlag[];
    clear: () => void;
    onAction: (action: BulkAction, targets: FeatureFlag[]) => void;
}

/**
 * The bulk bar's buttons. A component of its own, mounted only while
 * something is checked, so "Select all N matching" is a state that dies
 * with the selection — unchecking everything and checking one row again
 * starts from the page's rows, not from every row the filter leaves.
 */
export function BulkBar({ rows, matching, clear, onAction }: BulkBarProps) {
    const [allMatching, setAllMatching] = React.useState(false);
    const targets = allMatching ? matching : rows;
    const variants = sharedVariantsOf(targets);
    const withGoodState = targets.filter((flag) => flag.lastGoodState);
    const count = targets.length;

    return (
        <>
            {allMatching ? (
                <span className="text-sm text-muted-foreground" data-testid="bulk-scope">
                    All {matching.length} matching selected ·{" "}
                    <button type="button" className="underline underline-offset-4 hover:text-foreground" onClick={() => setAllMatching(false)}>
                        Only the {rows.length} checked
                    </button>
                </span>
            ) : (
                matching.length > rows.length && (
                    <button
                        type="button"
                        className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                        onClick={() => setAllMatching(true)}
                        data-testid="bulk-scope"
                    >
                        Select all {matching.length} matching
                    </button>
                )
            )}
            <Button variant="outline" size="sm" className="h-8 bg-card" onClick={() => onAction({ kind: "on" }, targets)}>
                Turn on
            </Button>
            <Button variant="outline" size="sm" className="h-8 bg-card" onClick={() => onAction({ kind: "off" }, targets)}>
                Turn off
            </Button>
            <Button variant="outline" size="sm" className="h-8 bg-card" onClick={() => onAction({ kind: "percent" }, targets)}>
                Set rollout %
            </Button>
            <span title={variants.reason ?? undefined} className="inline-flex">
                <Button
                    variant="outline"
                    size="sm"
                    className="h-8 bg-card"
                    disabled={variants.variants === null}
                    aria-describedby={variants.reason ? "bulk-variant-reason" : undefined}
                    onClick={() => variants.variants && onAction({ kind: "variant", variants: variants.variants }, targets)}
                >
                    Set variant
                </Button>
            </span>
            {variants.reason && (
                <span id="bulk-variant-reason" className="text-xs text-muted-foreground">
                    {variants.reason}
                </span>
            )}
            <Button
                variant="outline"
                size="sm"
                className="h-8 bg-card"
                disabled={withGoodState.length === 0}
                title={withGoodState.length ? "Back to the position before each flag's last change." : "None of the selected flags has moved."}
                onClick={() => onAction({ kind: "rollback" }, withGoodState)}
            >
                <RotateCcw className="size-3.5" aria-hidden />
                Roll back {withGoodState.length} of {count}
            </Button>
            <Button variant="ghost" size="sm" className="h-8" onClick={clear}>
                Clear
            </Button>
        </>
    );
}
