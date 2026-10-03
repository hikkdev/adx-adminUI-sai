"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Loader2, PlugZap, Rocket } from "lucide-react";
import { DataTable } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { ROSTER_MENU_LABEL, RosterRowMenu, type RosterMenuEntry } from "@/components/adx/party-roster-columns";
import { RosterSearch, StatusSelect, type StatusSelectOption } from "@/components/adx/party-roster-filter-bar";
import { PlacedByCell, placedByView } from "@/components/adx/placed-by";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { ServerPager } from "@/components/adx/server-pager";
import { StatusBadge } from "@/components/adx/status-badge";
import { isLive } from "@/lib/api-config";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import {
    WAITING_ON_META,
    WAITING_ON_REASONS,
    campaignService,
    daysSince,
    waitingOnLabel,
    type LaunchQueuePage,
    type LaunchQueueRow,
} from "@/services/campaigns";
import { remindAdvertiser } from "../campaign-actions";
import { WaitingOnFix } from "../waiting-on-fix";

/** One page of the server's. */
export const LAUNCH_QUEUE_PAGE_SIZE = 25;

/** How long a row has waited, in whole days: the server's figure, else counted from when it was paid. */
export const waitedDays = (row: Pick<LaunchQueueRow, "waitingDays" | "waitingSince" | "paidAt">): number | null =>
    row.waitingDays ?? daysSince(row.waitingSince ?? row.paidAt ?? null);

/** "Waiting 3 days" / "Since today". */
export function waitedLabel(days: number | null): string {
    if (days === null) return "—";
    if (days === 0) return "Since today";
    return `${formatNumber(days)} ${days === 1 ? "day" : "days"}`;
}

/** The reason a row's one-click fix answers: the filter's reason when the queue is cut to one, else the row's first. */
export function primaryReason(row: Pick<LaunchQueueRow, "waitingOn">, filter: string | null): string | null {
    if (filter && row.waitingOn.includes(filter)) return filter;
    return row.waitingOn[0] ?? null;
}

/**
 * The launch queue — 2 Oct 2026. Over `GET /campaigns/launch-queue`: the
 * campaigns already paid for (or held by a paid reservation fee) that
 * cannot go live yet, oldest waiting first, each with what it waits on and
 * the one click that moves it on. The reason and the search live in the
 * URL (`?reason=KYC&q=`), so the overview's "Waiting to launch" mix opens
 * it cut to one reason.
 */
export function LaunchQueueLoader() {
    const live = isLive("campaigns");
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const reason = params.get("reason")?.toUpperCase() || null;
    const q = params.get("q") ?? "";
    const pageNumber = Math.max(1, Number(params.get("page") ?? "1") || 1);

    const [text, setText] = React.useState(q);
    const settled = useDebounced(text.trim(), 350);

    const setQuery = React.useCallback(
        (patch: { reason?: string | null; q?: string; page?: number }) => {
            const query = new URLSearchParams(params.toString());
            const set = (key: string, value: string | null) => (value ? query.set(key, value) : query.delete(key));
            if (patch.reason !== undefined) set("reason", patch.reason);
            if (patch.q !== undefined) set("q", patch.q.trim() || null);
            set("page", patch.page && patch.page > 1 ? String(patch.page) : null);
            const qs = query.toString();
            router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        },
        [params, pathname, router],
    );

    React.useEffect(() => {
        if (settled !== q.trim()) setQuery({ q: settled });
        // Only the settled text drives this.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settled]);

    const resource = useApiResource<LaunchQueuePage>(`campaigns:launch-queue:${reason ?? ""}:${q}:${pageNumber}:${live}`, () =>
        campaignService.launchQueue({ ...(reason ? { reason } : {}), ...(q.trim() ? { q: q.trim() } : {}), page: pageNumber, pageSize: LAUNCH_QUEUE_PAGE_SIZE }),
    );

    if (!live) {
        return (
            <div className="space-y-6">
                <PageHeader title="Launch queue" subtitle="Paid campaigns that cannot go live yet." />
                <EmptyState icon={PlugZap} title="The launch queue reads the API" description="Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend." />
            </div>
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(page) => (
                <LaunchQueueView
                    page={page}
                    reason={reason}
                    searchText={text}
                    onSearchText={setText}
                    onReason={(next) => setQuery({ reason: next })}
                    pageNumber={pageNumber}
                    onPage={(next) => setQuery({ page: next })}
                    refreshing={resource.loading}
                    onChanged={resource.reload}
                />
            )}
        </ResourceBoundary>
    );
}

interface LaunchQueueViewProps {
    page: LaunchQueuePage;
    reason: string | null;
    searchText: string;
    onSearchText: (text: string) => void;
    onReason: (reason: string | null) => void;
    pageNumber: number;
    onPage: (page: number) => void;
    refreshing: boolean;
    onChanged: () => void;
}

export function LaunchQueueView({ page, reason, searchText, onSearchText, onReason, pageNumber, onPage, refreshing, onChanged }: LaunchQueueViewProps) {
    const router = useRouter();

    const columns = React.useMemo<ColumnDef<LaunchQueueRow>[]>(
        () => [
            {
                id: "campaign",
                accessorFn: (row) => `${row.name} ${row.reference}`,
                header: "Campaign",
                cell: ({ row }) => (
                    <div className="min-w-0 max-w-[240px]">
                        <p className="truncate font-medium text-foreground" title={row.original.name}>
                            {row.original.name}
                        </p>
                        <p className="font-mono text-[11px] tabular-nums text-muted-foreground">{row.original.reference}</p>
                    </div>
                ),
            },
            {
                id: "advertiser",
                accessorFn: (row) => placedByView(row.advertiser)?.title ?? "",
                header: "Advertiser",
                cell: ({ row }) => <PlacedByCell placedBy={row.original.advertiser} testId="queue-advertiser" />,
            },
            {
                id: "waiting-on",
                accessorFn: (row) => row.waitingOn.join(" "),
                header: "Waiting on",
                cell: ({ row }) => (
                    <div className="flex max-w-[260px] flex-wrap gap-1">
                        {row.original.waitingOn.map((item) => (
                            <StatusBadge key={item} status={{ label: waitingOnLabel(item), tone: "warning" }} />
                        ))}
                    </div>
                ),
            },
            {
                id: "paid",
                accessorFn: (row) => row.paidAt ?? "",
                header: "Paid",
                cell: ({ row }) => (
                    <div className="whitespace-nowrap tabular-nums">
                        <p className="font-medium text-foreground">{row.original.paidAmount ? formatMoney(row.original.paidAmount) : "—"}</p>
                        <p className="text-[11px] text-muted-foreground">{row.original.paidAt ? formatDate(row.original.paidAt) : "Not paid in full"}</p>
                    </div>
                ),
            },
            {
                id: "waiting",
                accessorFn: (row) => waitedDays(row) ?? -1,
                header: "Waiting",
                cell: ({ row }) => (
                    <span className="whitespace-nowrap tabular-nums text-muted-foreground" data-testid="waited">
                        {waitedLabel(waitedDays(row.original))}
                    </span>
                ),
            },
            {
                id: "fix",
                enableHiding: false,
                header: "Next step",
                cell: ({ row }) => {
                    const item = row.original;
                    const first = primaryReason(item, reason);
                    if (!first) return null;
                    return (
                        <WaitingOnFix
                            reason={first}
                            target={{ campaign: item, advertiser: item.advertiser ?? null, facts: item.waitingFacts }}
                            onDone={onChanged}
                        />
                    );
                },
            },
            {
                id: "actions",
                enableHiding: false,
                size: 48,
                cell: ({ row }) => {
                    const item = row.original;
                    const advertiserHref = placedByView(item.advertiser)?.href ?? null;
                    const entries: RosterMenuEntry[] = [
                        { kind: "label", label: ROSTER_MENU_LABEL },
                        { kind: "item", label: "Open campaign", onSelect: () => router.push(`/campaigns/${item.id}`) },
                        ...(advertiserHref ? ([{ kind: "item", label: "Open advertiser", onSelect: () => router.push(advertiserHref) }] as RosterMenuEntry[]) : []),
                        ...(item.waitingOn.includes("PAYMENT") || item.waitingOn.includes("RESERVATION_FEE")
                            ? ([{ kind: "item", label: "Remind advertiser", onSelect: () => void remindAdvertiser(item).then((sent) => sent && onChanged()) }] as RosterMenuEntry[])
                            : []),
                    ];
                    return <RosterRowMenu entries={entries} />;
                },
            },
        ],
        [router, reason, onChanged],
    );

    const reasonOptions: StatusSelectOption[] = [
        { value: "ALL", label: "Every reason", description: "Everything paid that cannot go live yet." },
        ...WAITING_ON_REASONS.map((key) => ({ value: key, label: WAITING_ON_META[key].label, description: WAITING_ON_META[key].description })),
        /* A reason the server names that this console has not heard of is still offered, in its own word. */
        ...Object.keys(page.counts)
            .filter((key) => !(WAITING_ON_REASONS as readonly string[]).includes(key) && key !== "ALL")
            .map((key) => ({ value: key, label: waitingOnLabel(key), description: "Named by the server." })),
    ];
    /* `ALL` is every campaign in the queue, counted without the reason in force; a row waiting on two reasons counts under both. */
    const counts: Record<string, number> = { ...page.counts, ALL: page.counts.ALL ?? (reason ? undefined : page.total) } as Record<string, number>;

    return (
        <div className="space-y-5">
            <PageHeader
                title="Launch queue"
                subtitle={`${formatNumber(page.total)} paid ${page.total === 1 ? "campaign" : "campaigns"} ${reason ? `waiting on ${waitingOnLabel(reason).toLowerCase()}` : "that cannot go live yet"} — oldest waiting first. Each row's next step is one click.`}
            />
            <DataTable
                columns={columns}
                data={page.items}
                showPagination={false}
                getRowId={(row) => row.id}
                onRowClick={(row) => router.push(`/campaigns/${row.id}`)}
                toolbar={
                    <div className="flex flex-1 flex-wrap items-center gap-2" data-testid="launch-queue-filters">
                        <RosterSearch value={searchText} onChange={onSearchText} placeholder="Search campaign, reference, advertiser" />
                        <StatusSelect options={reasonOptions} value={reason ?? "ALL"} counts={counts} onChange={(value) => onReason(value === "ALL" ? null : value)} label="Waiting on" />
                        {refreshing && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Updating" />}
                    </div>
                }
                emptyState={
                    <EmptyState
                        icon={Rocket}
                        title={reason || searchText.trim() ? "Nothing matches" : "Nothing is waiting"}
                        description={reason || searchText.trim() ? "Pick another reason or clear the search." : "Every paid campaign is live or scheduled to start on its own."}
                    />
                }
            />
            <ServerPager total={page.total} pageNumber={pageNumber} pageSize={LAUNCH_QUEUE_PAGE_SIZE} onPageChange={onPage} />
        </div>
    );
}
