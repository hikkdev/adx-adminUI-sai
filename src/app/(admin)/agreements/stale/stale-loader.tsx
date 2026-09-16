"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilterChips } from "@/components/adx/filter-chips";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { SectionCard } from "@/components/adx/section-card";
import { SimpleTable, type SimpleColumn } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { useApiResource } from "@/lib/use-api-resource";
import {
    KIND_META,
    PARTY_LABEL,
    STALE_KINDS,
    agreementService,
    agreementsReadApi,
    type StaleParty,
    type StaleReport,
} from "@/services/agreements";
import { AgreementsShell } from "../agreements-shell";

type StaleKind = (typeof STALE_KINDS)[number];

/**
 * Who holds older platform terms than the version live now (Lot D, Q55).
 *
 * Only the two platform kinds can be stale — a transaction accepts whatever
 * version is live at the time. `enforced` is the live version's own switch:
 * with it on, these parties are blocked from transacting until they click
 * again; with it off they are merely behind, and nothing asks them.
 */
export function StaleLoader() {
    const live = agreementsReadApi();
    const [kind, setKind] = React.useState<StaleKind>("PLATFORM");

    const resource = useApiResource<StaleReport | null>(`agreements:stale:${live}:${kind}`, () =>
        live ? agreementService.stale(kind) : Promise.resolve(null),
    );

    const columns: SimpleColumn<StaleParty>[] = [
        {
            key: "party",
            label: "Party",
            render: (row) => (
                <Link
                    href={`/agreements/acceptances?type=${row.type}&id=${encodeURIComponent(row.id)}`}
                    className="block hover:underline"
                >
                    <span className="block font-medium text-foreground">{row.name || row.id}</span>
                    <span className="block text-xs text-muted-foreground">{row.displayId ?? PARTY_LABEL[row.type].singular}</span>
                </Link>
            ),
        },
        {
            key: "accepted",
            label: "Holds",
            className: "w-32",
            render: (row) => <span className="tabular-nums">v{row.acceptedVersion}</span>,
        },
        {
            key: "open",
            label: "",
            className: "w-32 text-right",
            render: (row) => (
                <Button size="sm" variant="ghost" asChild>
                    <Link href={`/${row.type === "publisher" ? "publishers" : row.type === "advertiser" ? "advertisers" : "agents"}/${row.id}`}>
                        Open
                    </Link>
                </Button>
            ),
        },
    ];

    return (
        <AgreementsShell>
            <div className="space-y-4">
                <FilterChips<StaleKind>
                    value={kind}
                    onChange={setKind}
                    chips={STALE_KINDS.map((value) => ({ value, label: KIND_META[value].label }))}
                />
                <ResourceBoundary resource={resource}>
                    {(report) =>
                        report ? (
                            <>
                                <Card
                                    className={cn(
                                        "flex flex-wrap items-start gap-3 rounded-lg p-4 shadow-none",
                                        report.currentVersion === null
                                            ? "border-danger/40 bg-danger-soft"
                                            : report.parties.length === 0
                                              ? "border-success/30 bg-success-soft/40"
                                              : report.enforced
                                                ? "border-danger/40 bg-danger-soft"
                                                : "border-warning/40 bg-warning-soft",
                                    )}
                                >
                                    {report.parties.length === 0 && report.currentVersion !== null ? (
                                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                                    ) : (
                                        <AlertTriangle
                                            className={cn("mt-0.5 size-4 shrink-0", report.enforced || report.currentVersion === null ? "text-danger" : "text-warning")}
                                            aria-hidden
                                        />
                                    )}
                                    <div className="min-w-0 flex-1 text-sm">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="font-medium text-foreground">
                                                {report.currentVersion === null
                                                    ? `Nothing is live for the ${KIND_META[kind].label.toLowerCase()}`
                                                    : report.parties.length === 0
                                                      ? `Everyone is on v${report.currentVersion}`
                                                      : `${report.parties.length} ${report.parties.length === 1 ? PARTY_LABEL[KIND_META[kind].party].singular.toLowerCase() : PARTY_LABEL[KIND_META[kind].party].plural.toLowerCase()} behind v${report.currentVersion}`}
                                            </p>
                                            {report.currentVersion !== null && (
                                                <StatusBadge
                                                    status={
                                                        report.enforced
                                                            ? { label: "Re-acceptance enforced", tone: "danger" }
                                                            : { label: "Not enforced", tone: "neutral" }
                                                    }
                                                />
                                            )}
                                        </div>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            {report.currentVersion === null
                                                ? "Activate a version on the Templates tab; nobody can be behind terms that do not exist."
                                                : report.enforced
                                                  ? "The live version requires re-acceptance: these parties are blocked from transacting until they click again."
                                                  : "The live version does not require re-acceptance: these parties hold older terms and nothing asks them to click again. Activate a version with the switch on to enforce it."}
                                        </p>
                                    </div>
                                </Card>
                                <SectionCard
                                    title="Behind the live version"
                                    description="Each party's highest accepted version, below the one live now. Open the party to see their whole record."
                                    contentClassName="p-0"
                                >
                                    <SimpleTable
                                        columns={columns}
                                        rows={report.parties}
                                        rowKey={(row) => `${row.type}:${row.id}`}
                                        emptyMessage="Nobody is behind."
                                        className="rounded-none border-0"
                                    />
                                </SectionCard>
                            </>
                        ) : null
                    }
                </ResourceBoundary>
            </div>
        </AgreementsShell>
    );
}
