"use client";

import * as React from "react";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { KpiCard } from "@/components/adx/kpi-card";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { SubNav } from "@/components/adx/sub-nav";
import {
    ActiveFilters,
    FilterPanel,
    type Facet,
    type FilterSelection,
} from "@/components/adx/filter-panel";
import { formatCompactINR } from "@/lib/format";
import {
    FRAUD_CASE_STATUS_META,
    type FraudCase,
    type FraudCaseStatus,
    type FraudNodeKind,
} from "@/types";

interface FraudViewProps {
    cases: FraudCase[];
}

const nodeClasses: Record<FraudNodeKind, string> = {
    flagged: "border-danger bg-danger-soft text-danger",
    shared: "border-warning bg-warning-soft text-warning",
    clean: "border-border bg-card text-muted-foreground",
};

function LinkGraph({ fraudCase }: { fraudCase: FraudCase }) {
    const findNode = (id: string) => fraudCase.nodes.find((node) => node.id === id);

    return (
        <Card className="relative min-h-[420px] overflow-hidden rounded-lg border-border shadow-none">
            <div className="absolute left-4 top-4 z-10 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full border border-danger bg-danger-soft" />
                    Flagged
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full border border-warning bg-warning-soft" />
                    Shared attribute
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full border bg-card" />
                    Clean
                </span>
            </div>

            <svg className="absolute inset-0 size-full" aria-hidden>
                {fraudCase.edges.map(([fromId, toId]) => {
                    const from = findNode(fromId);
                    const to = findNode(toId);
                    if (!from || !to) return null;
                    return (
                        <line
                            key={`${fromId}-${toId}`}
                            x1={`${from.x}%`}
                            y1={`${from.y}%`}
                            x2={`${to.x}%`}
                            y2={`${to.y}%`}
                            stroke="hsl(240 5.9% 84%)"
                            strokeWidth="1.5"
                        />
                    );
                })}
            </svg>

            {fraudCase.nodes.map((node) => (
                <div
                    key={node.id}
                    className="absolute -translate-x-1/2 -translate-y-1/2 text-center"
                    style={{ left: `${node.x}%`, top: `${node.y}%` }}
                >
                    <button
                        type="button"
                        onClick={() => toast.info(node.sub)}
                        className={cn(
                            "mx-auto flex size-11 items-center justify-center rounded-full border-2 text-xs font-bold shadow-sm transition-transform hover:scale-105",
                            nodeClasses[node.kind]
                        )}
                    >
                        {node.label}
                    </button>
                    <p className="mt-1 max-w-[8rem] text-[10px] leading-tight text-muted-foreground">
                        {node.sub}
                    </p>
                </div>
            ))}
        </Card>
    );
}

export function FraudView({ cases: seed }: FraudViewProps) {
    const [cases, setCases] = React.useState(seed);
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [query, setQuery] = React.useState("");
    const [selection, setSelection] = React.useState<FilterSelection>({});
    const [note, setNote] = React.useState("");

    const facets: Facet[] = React.useMemo(
        () => [
            {
                id: "status",
                label: "Status",
                options: (Object.keys(FRAUD_CASE_STATUS_META) as FraudCaseStatus[]).map(
                    (value) => ({
                        value,
                        label: FRAUD_CASE_STATUS_META[value].label,
                        count: cases.filter((item) => item.status === value).length,
                    })
                ),
            },
            {
                id: "score",
                label: "Fraud score",
                options: [
                    {
                        value: "high",
                        label: "0.80 and above",
                        count: cases.filter((item) => item.score >= 0.8).length,
                    },
                    {
                        value: "medium",
                        label: "0.60 to 0.79",
                        count: cases.filter((item) => item.score >= 0.6 && item.score < 0.8).length,
                    },
                ],
            },
        ],
        [cases]
    );

    const visible = React.useMemo(() => {
        const needle = query.trim().toLowerCase();
        const statuses = selection.status ?? [];
        const scores = selection.score ?? [];
        return cases
            .filter((item) => (statuses.length ? statuses.includes(item.status) : true))
            .filter((item) => {
                if (!scores.length) return true;
                if (scores.includes("high") && item.score >= 0.8) return true;
                if (scores.includes("medium") && item.score >= 0.6 && item.score < 0.8) return true;
                return false;
            })
            .filter((item) =>
                needle
                    ? [item.id, item.title, item.summary].join(" ").toLowerCase().includes(needle)
                    : true
            )
            .sort((a, b) => b.score - a.score);
    }, [cases, selection, query]);

    const selected =
        cases.find((item) => item.id === selectedId && visible.some((v) => v.id === item.id)) ??
        visible[0] ??
        null;

    const open = cases.filter((item) => item.status === "open");
    const atRisk = cases
        .filter((item) => item.status === "open" || item.status === "escalated")
        .reduce((sum, item) => sum + item.valueAtRisk, 0);

    const decide = (id: string, status: FraudCaseStatus, message: string) => {
        setCases((current) =>
            current.map((item) => (item.id === id ? { ...item, status } : item))
        );
        setNote("");
        toast.success(message);
    };

    return (
        <div className="space-y-5">
            <SubNav
                items={[
                    { label: "Disputes", href: "/disputes", exact: true },
                    { label: "Fraud investigation", href: "/disputes/fraud" },
                ]}
            />

            <PageHeader
                title="Fraud investigation"
                subtitle="Linked accounts flagged by the fraud engine"
            />

            <div className="grid gap-4 md:grid-cols-3">
                <KpiCard
                    stat={{
                        id: "open",
                        label: "Open cases",
                        value: String(open.length),
                        hint: `${cases.length} total`,
                    }}
                />
                <KpiCard
                    stat={{
                        id: "accounts",
                        label: "Accounts implicated",
                        value: String(
                            cases
                                .filter((item) => item.status !== "dismissed")
                                .reduce((sum, item) => sum + item.accountCount, 0)
                        ),
                    }}
                />
                <KpiCard
                    stat={{
                        id: "risk",
                        label: "Value at risk",
                        value: formatCompactINR(atRisk),
                        hint: "Open and escalated cases",
                    }}
                />
            </div>

            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
                {/* Case queue --------------------------------------------- */}
                <Card className="rounded-lg border-border shadow-none">
                    <div className="space-y-2.5 border-b px-4 py-3">
                        <FilterPanel
                            facets={facets}
                            selection={selection}
                            onChange={setSelection}
                            resultCount={visible.length}
                            search={{
                                value: query,
                                onChange: setQuery,
                                placeholder: "Case ID or description",
                            }}
                        />
                        <ActiveFilters
                            facets={facets}
                            selection={selection}
                            onChange={setSelection}
                            resultCount={visible.length}
                        />
                    </div>

                    {visible.length ? (
                        <ul className="divide-y">
                            {visible.map((item) => (
                                <li key={item.id}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedId(item.id)}
                                        aria-current={selected?.id === item.id ? "true" : undefined}
                                        className={cn(
                                            "w-full px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                                            selected?.id === item.id
                                                ? "bg-muted/60"
                                                : "hover:bg-muted/40"
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-xs font-medium tabular-nums text-muted-foreground">
                                                {item.id}
                                            </span>
                                            <StatusBadge
                                                status={FRAUD_CASE_STATUS_META[item.status]}
                                            />
                                        </div>
                                        <p className="mt-1 text-sm font-medium leading-5 text-foreground">
                                            {item.title}
                                        </p>
                                        <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                                            <span
                                                className={cn(
                                                    "font-medium tabular-nums",
                                                    item.score >= 0.8
                                                        ? "text-danger"
                                                        : "text-muted-foreground"
                                                )}
                                            >
                                                Score {item.score.toFixed(2)}
                                            </span>
                                            <span className="text-muted-foreground">
                                                {item.accountCount} accounts
                                            </span>
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                            No cases match these filters.
                        </p>
                    )}
                </Card>

                {/* Case detail -------------------------------------------- */}
                {selected ? (
                    <div className="min-w-0 space-y-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2.5">
                                    <h2 className="text-lg font-semibold text-foreground">
                                        Case {selected.id}
                                    </h2>
                                    <StatusBadge status={FRAUD_CASE_STATUS_META[selected.status]} />
                                </div>
                                <p className="mt-0.5 text-sm text-muted-foreground">
                                    {selected.title} · opened {selected.openedAgo}
                                </p>
                            </div>
                            {(selected.status === "open" || selected.status === "escalated") && (
                                <div className="flex shrink-0 items-center gap-2">
                                    <Button
                                        variant="outline"
                                        className="bg-card"
                                        onClick={() =>
                                            decide(
                                                selected.id,
                                                "dismissed",
                                                "Case dismissed and accounts restored"
                                            )
                                        }
                                    >
                                        Dismiss case
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        onClick={() =>
                                            decide(
                                                selected.id,
                                                "suspended",
                                                `${selected.accountCount} accounts suspended`
                                            )
                                        }
                                    >
                                        Suspend {selected.accountCount} accounts
                                    </Button>
                                </div>
                            )}
                        </div>

                        <div
                            className={cn(
                                "flex items-center gap-3 rounded-lg border px-4 py-3",
                                selected.score >= 0.8
                                    ? "border-danger/20 bg-danger-soft"
                                    : "border-warning/20 bg-warning-soft"
                            )}
                        >
                            <TriangleAlert
                                className={cn(
                                    "size-4 shrink-0",
                                    selected.score >= 0.8 ? "text-danger" : "text-warning"
                                )}
                            />
                            <p className="text-sm text-foreground">
                                <span
                                    className={cn(
                                        "font-semibold",
                                        selected.score >= 0.8 ? "text-danger" : "text-warning"
                                    )}
                                >
                                    Fraud score {selected.score.toFixed(2)}.
                                </span>{" "}
                                {selected.summary}
                            </p>
                        </div>

                        <div className="grid gap-4 xl:grid-cols-3">
                            <div className="xl:col-span-2">
                                <LinkGraph fraudCase={selected} />
                            </div>

                            <div className="space-y-4">
                                <Card className="rounded-lg border-border p-5 shadow-none">
                                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        Shared signals
                                    </h3>
                                    <dl className="mt-3 space-y-2">
                                        {selected.sharedSignals.map(([label, value]) => (
                                            <div
                                                key={label}
                                                className="flex items-center justify-between gap-4 text-sm"
                                            >
                                                <dt className="text-muted-foreground">{label}</dt>
                                                <dd className="font-medium text-danger">{value}</dd>
                                            </div>
                                        ))}
                                    </dl>
                                </Card>

                                <Card className="rounded-lg border-border p-5 shadow-none">
                                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        Timeline
                                    </h3>
                                    <ol className="mt-3 space-y-3">
                                        {selected.timeline.map((entry) => (
                                            <li key={entry.label} className="flex gap-2.5">
                                                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                                                <div className="min-w-0">
                                                    <p className="text-sm text-foreground">
                                                        {entry.label}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {entry.ago}
                                                    </p>
                                                </div>
                                            </li>
                                        ))}
                                    </ol>
                                </Card>

                                <Card className="rounded-lg border-border p-5 shadow-none">
                                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        Case notes
                                    </h3>
                                    <Textarea
                                        value={note}
                                        onChange={(event) => setNote(event.target.value)}
                                        placeholder="Add investigation note"
                                        rows={3}
                                        className="mt-3"
                                    />
                                    <div className="mt-3 flex items-center justify-between gap-3">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="bg-card"
                                            disabled={!note.trim()}
                                            onClick={() => {
                                                setNote("");
                                                toast.success("Note saved to the case record");
                                            }}
                                        >
                                            Save note
                                        </Button>
                                        {selected.status !== "escalated" &&
                                            selected.status !== "dismissed" && (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        decide(
                                                            selected.id,
                                                            "escalated",
                                                            "Case escalated to legal"
                                                        )
                                                    }
                                                    className="text-sm font-medium text-danger underline-offset-4 hover:underline"
                                                >
                                                    Escalate to legal
                                                </button>
                                            )}
                                    </div>
                                </Card>
                            </div>
                        </div>
                    </div>
                ) : (
                    <Card className="rounded-lg border-border p-10 text-center shadow-none">
                        <p className="text-sm font-medium text-foreground">No case selected</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Adjust the filters to see other cases.
                        </p>
                    </Card>
                )}
            </div>
        </div>
    );
}
