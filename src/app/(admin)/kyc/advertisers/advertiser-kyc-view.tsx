"use client";

import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { KpiCard } from "@/components/adx/kpi-card";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import {
    ActiveFilters,
    FilterPanel,
    type Facet,
    type FilterSelection,
} from "@/components/adx/filter-panel";
import { cn } from "@/lib/utils";
import { formatCompactINR, formatDateTime } from "@/lib/format";
import {
    ADVERTISER_KYC_REQUIREMENTS,
    ADVERTISER_KYC_STATUS_META,
    ADVERTISER_KYC_TYPE_META,
    type AdvertiserKycCase,
    type AdvertiserKycStatus,
} from "@/types";

interface AdvertiserKycViewProps {
    cases: AdvertiserKycCase[];
}

export function AdvertiserKycView({ cases: seed }: AdvertiserKycViewProps) {
    const [cases, setCases] = React.useState(seed);
    const [selection, setSelection] = React.useState<FilterSelection>({
        status: ["PENDING"],
    });
    const [query, setQuery] = React.useState("");
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [note, setNote] = React.useState("");

    const facets: Facet[] = React.useMemo(
        () => [
            {
                id: "status",
                label: "Review status",
                options: (["PENDING", "VERIFIED", "REJECTED"] as AdvertiserKycStatus[]).map(
                    (value) => ({
                        value,
                        label: ADVERTISER_KYC_STATUS_META[value].label,
                        count: cases.filter((item) => item.status === value).length,
                    })
                ),
            },
            {
                id: "type",
                label: "Advertiser type",
                options: (
                    Object.keys(ADVERTISER_KYC_TYPE_META) as (keyof typeof ADVERTISER_KYC_TYPE_META)[]
                ).map((value) => ({
                    value,
                    label: ADVERTISER_KYC_TYPE_META[value],
                    count: cases.filter((item) => item.kycType === value).length,
                })),
            },
            {
                id: "sla",
                label: "SLA",
                options: [
                    {
                        value: "breached",
                        label: "Past SLA",
                        count: cases.filter(
                            (item) => item.status === "PENDING" && item.slaHoursLeft < 0
                        ).length,
                    },
                ],
            },
        ],
        [cases]
    );

    const visible = React.useMemo(() => {
        const needle = query.trim().toLowerCase();
        const statuses = selection.status ?? [];
        const types = selection.type ?? [];
        const sla = selection.sla ?? [];
        return cases
            .filter((item) => (statuses.length ? statuses.includes(item.status) : true))
            .filter((item) => (types.length ? types.includes(item.kycType) : true))
            .filter((item) =>
                sla.includes("breached")
                    ? item.status === "PENDING" && item.slaHoursLeft < 0
                    : true
            )
            .filter((item) =>
                needle
                    ? [item.advertiser, item.contact, item.email, item.city]
                          .join(" ")
                          .toLowerCase()
                          .includes(needle)
                    : true
            )
            .sort((a, b) => a.slaHoursLeft - b.slaHoursLeft);
    }, [cases, selection, query]);

    const selected =
        cases.find((item) => item.id === selectedId && visible.some((v) => v.id === item.id)) ??
        visible[0] ??
        null;

    const pending = cases.filter((item) => item.status === "PENDING");
    const breached = pending.filter((item) => item.slaHoursLeft < 0);
    const spendAtStake = pending.reduce((sum, item) => sum + item.monthlySpend, 0);

    const decide = (id: string, status: AdvertiserKycStatus) => {
        if (status === "REJECTED" && !note.trim()) {
            toast.error("Add a reason before rejecting.");
            return;
        }
        setCases((current) =>
            current.map((item) =>
                item.id === id
                    ? {
                          ...item,
                          status,
                          reviewedAt: "2026-08-10T11:00:00+05:30",
                          reviewedBy: "Priya Rao",
                          rejectionReason: status === "REJECTED" ? note.trim() : null,
                      }
                    : item
            )
        );
        setNote("");
        toast.success(
            status === "VERIFIED" ? "Advertiser verified" : "Submission rejected",
            { description: cases.find((item) => item.id === id)?.advertiser }
        );
    };

    const required = selected ? ADVERTISER_KYC_REQUIREMENTS[selected.kycType] : [];
    const missing = selected
        ? required.filter(
              (requirement) =>
                  !selected.documents.find(
                      (document) => document.field === requirement.field && document.fileName
                  )
          )
        : [];

    return (
        <div className="space-y-5">
            <PageHeader
                title="Advertiser KYC"
                subtitle="Verification for the businesses booking campaigns"
            />

            <div className="grid gap-4 md:grid-cols-3">
                <KpiCard
                    stat={{
                        id: "pending",
                        label: "Awaiting review",
                        value: String(pending.length),
                        hint: breached.length
                            ? `${breached.length} past SLA`
                            : "All within SLA",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "breached",
                        label: "SLA breached",
                        value: String(breached.length),
                        delta: breached.length ? "Review first" : undefined,
                        deltaTone: breached.length ? "negative" : "neutral",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "spend",
                        label: "Monthly spend blocked",
                        value: formatCompactINR(spendAtStake),
                        hint: "Cannot book until verified",
                    }}
                />
            </div>

            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)]">
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
                                placeholder: "Advertiser, contact or city",
                            }}
                            className="w-full justify-center"
                        />
                        <ActiveFilters
                            facets={facets}
                            selection={selection}
                            onChange={setSelection}
                            resultCount={visible.length}
                        />
                    </div>

                    {visible.length ? (
                        <ul className="max-h-[560px] divide-y overflow-y-auto">
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
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="truncate text-sm font-medium text-foreground">
                                                {item.advertiser}
                                            </p>
                                            <StatusBadge
                                                status={ADVERTISER_KYC_STATUS_META[item.status]}
                                            />
                                        </div>
                                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                            {ADVERTISER_KYC_TYPE_META[item.kycType]} · {item.city}
                                        </p>
                                        {item.status === "PENDING" && (
                                            <p
                                                className={cn(
                                                    "mt-1.5 text-xs tabular-nums",
                                                    item.slaHoursLeft < 0
                                                        ? "font-medium text-danger"
                                                        : "text-muted-foreground"
                                                )}
                                            >
                                                {item.slaHoursLeft < 0
                                                    ? `${Math.abs(item.slaHoursLeft)}h past SLA`
                                                    : `${item.slaHoursLeft}h left on SLA`}
                                            </p>
                                        )}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                            Nothing matches these filters.
                        </p>
                    )}
                </Card>

                {selected ? (
                    <Card className="rounded-lg border-border shadow-none">
                        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="text-base font-semibold text-foreground">
                                        {selected.advertiser}
                                    </h2>
                                    <StatusBadge
                                        status={ADVERTISER_KYC_STATUS_META[selected.status]}
                                    />
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {selected.contact} · {selected.email}
                                </p>
                            </div>
                            {selected.status === "PENDING" && (
                                <div className="flex shrink-0 items-center gap-2">
                                    <Button
                                        variant="outline"
                                        className="bg-card"
                                        onClick={() => decide(selected.id, "REJECTED")}
                                    >
                                        Reject
                                    </Button>
                                    <Button
                                        onClick={() => decide(selected.id, "VERIFIED")}
                                        disabled={missing.length > 0}
                                    >
                                        Verify advertiser
                                    </Button>
                                </div>
                            )}
                        </div>

                        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 border-b px-5 py-4 sm:grid-cols-4">
                            {[
                                ["Type", ADVERTISER_KYC_TYPE_META[selected.kycType]],
                                ["City", selected.city],
                                ["Monthly spend", formatCompactINR(selected.monthlySpend)],
                                ["Submitted", formatDateTime(selected.submittedAt)],
                            ].map(([label, value]) => (
                                <div key={label}>
                                    <dt className="text-xs text-muted-foreground">{label}</dt>
                                    <dd className="mt-1 text-sm font-medium text-foreground">
                                        {value}
                                    </dd>
                                </div>
                            ))}
                        </dl>

                        {selected.riskFlags.length > 0 && (
                            <ul className="space-y-1.5 border-b bg-warning-soft/40 px-5 py-3">
                                {selected.riskFlags.map((flag) => (
                                    <li
                                        key={flag}
                                        className="flex items-center gap-2 text-sm text-foreground"
                                    >
                                        <AlertTriangle className="size-4 shrink-0 text-warning" />
                                        {flag}
                                    </li>
                                ))}
                            </ul>
                        )}

                        <div className="border-b px-5 py-4">
                            <h3 className="text-sm font-semibold text-foreground">
                                Documents for {ADVERTISER_KYC_TYPE_META[selected.kycType].toLowerCase()} advertisers
                            </h3>
                            <ul className="mt-3 divide-y rounded-lg border">
                                {required.map((requirement) => {
                                    const document = selected.documents.find(
                                        (item) => item.field === requirement.field
                                    );
                                    const present = Boolean(document?.fileName);
                                    return (
                                        <li
                                            key={requirement.field}
                                            className="flex flex-wrap items-center gap-3 px-4 py-3"
                                        >
                                            <FileText
                                                className={cn(
                                                    "size-4 shrink-0",
                                                    present
                                                        ? "text-muted-foreground"
                                                        : "text-danger"
                                                )}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium text-foreground">
                                                    {requirement.label}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {present
                                                        ? document?.fileName
                                                        : "Not uploaded"}
                                                </p>
                                            </div>
                                            {present ? (
                                                <Button variant="ghost" size="sm">
                                                    View
                                                </Button>
                                            ) : (
                                                <StatusBadge
                                                    status={{ label: "Missing", tone: "danger" }}
                                                />
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>

                        {selected.status === "PENDING" ? (
                            <div className="px-5 py-4">
                                <Label htmlFor="review-note">Reviewer note</Label>
                                <Textarea
                                    id="review-note"
                                    value={note}
                                    onChange={(event) => setNote(event.target.value)}
                                    rows={3}
                                    className="mt-1.5"
                                    placeholder="Required when rejecting"
                                />
                                {missing.length > 0 && (
                                    <p className="mt-2 text-xs text-danger">
                                        {missing.length} required document
                                        {missing.length === 1 ? "" : "s"} missing, so this cannot be
                                        verified yet
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div className="px-5 py-4">
                                <p className="text-xs text-muted-foreground">
                                    Reviewed by {selected.reviewedBy} on{" "}
                                    {selected.reviewedAt
                                        ? formatDateTime(selected.reviewedAt)
                                        : "unknown date"}
                                </p>
                                {selected.rejectionReason && (
                                    <p className="mt-2 max-w-prose text-sm leading-6 text-foreground">
                                        {selected.rejectionReason}
                                    </p>
                                )}
                            </div>
                        )}
                    </Card>
                ) : (
                    <Card className="rounded-lg border-border p-10 text-center shadow-none">
                        <p className="text-sm font-medium text-foreground">Nothing to review</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Adjust the filters to see reviewed submissions.
                        </p>
                    </Card>
                )}
            </div>
        </div>
    );
}
