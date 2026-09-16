"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { SectionCard } from "@/components/adx/section-card";
import { FieldList, SimpleTable, type SimpleColumn } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import type { ApiResource } from "@/lib/use-api-resource";
import { formatDate } from "@/lib/format";
import {
    KIND_META,
    PARTY_LABEL,
    acceptanceAnchor,
    agreementService,
    partyOf,
    signatureLabel,
    type AgreementAcceptance,
    type AgreementTemplate,
    type PartyAgreements,
    type PartySummary,
    type PartyType,
} from "@/services/agreements";
import type { StatusMeta } from "@/types";

export interface SelectedParty {
    type: PartyType;
    id: string;
}

interface AcceptancesViewProps {
    recent: AgreementAcceptance[];
    /** When the log is scoped to one version, that version. */
    template: AgreementTemplate | null;
    selected: SelectedParty | null;
    party: ApiResource<PartyAgreements | null>;
    onSelect: (party: SelectedParty | null) => void;
}

/** 10 Sep 2026, 2:32 PM — the year matters on a legal record, so not formatDateTime. */
const when = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
});
const formatWhen = (iso: string) => when.format(new Date(iso));

const PARTY_META: Record<PartyType, StatusMeta> = {
    publisher: { label: "Publisher", tone: "info" },
    advertiser: { label: "Advertiser", tone: "warning" },
    agent: { label: "Agent", tone: "neutral" },
};

/** Where a party's own page is — an agent's is under /agents, the other two under theirs. */
const PARTY_ROUTE: Record<PartyType, string> = {
    publisher: "/publishers",
    advertiser: "/advertisers",
    agent: "/agents",
};

/** The anchor cell: the campaign, sale, order or attempt the click was bound to, linked where the console has a page. */
function AnchorCell({ row }: { row: AgreementAcceptance }) {
    const anchor = acceptanceAnchor(row);
    return anchor.href ? (
        <Link href={anchor.href} className="block truncate text-xs text-muted-foreground underline-offset-4 hover:underline">
            {anchor.label}
        </Link>
    ) : (
        <span className="block truncate text-xs text-muted-foreground">{anchor.label}</span>
    );
}

const KYC_META: Record<string, StatusMeta> = {
    VERIFIED: { label: "KYC verified", tone: "success" },
    PENDING: { label: "KYC pending", tone: "warning" },
    REJECTED: { label: "KYC rejected", tone: "danger" },
};

const kycMeta = (status: string): StatusMeta => KYC_META[status] ?? { label: `KYC ${status.toLowerCase()}`, tone: "neutral" };

/** How long to wait after the last keystroke before asking the API. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The acceptances screen: find a party, read what they accepted and when.
 *
 * Before a party is chosen the screen is a log of the newest acceptances
 * across everyone, so ops can also watch the clicks come in after a version
 * goes live. Choosing a party — from the search or from a row of the log —
 * turns it into that party's record.
 */
export function AcceptancesView({ recent, template, selected, party, onSelect }: AcceptancesViewProps) {
    const [query, setQuery] = React.useState("");
    /* The search remembers which query it answered, so "searching", the results
       and the error are all derived from whether the answer matches what is
       typed now — the effect only schedules the request and records the
       answer, and never sets state synchronously. */
    const [answer, setAnswer] = React.useState<{
        query: string;
        results: PartySummary[] | null;
        error: string | null;
    } | null>(null);
    const [reading, setReading] = React.useState<AgreementAcceptance | null>(null);

    const trimmed = query.trim();
    const asking = trimmed.length >= 2;
    const answered = asking && answer?.query === trimmed ? answer : null;
    const searching = asking && answered === null;
    const results = answered?.results ?? null;
    const searchError = answered?.error ?? null;

    React.useEffect(() => {
        if (!asking) return;
        let active = true;
        const timer = window.setTimeout(async () => {
            try {
                const found = await agreementService.searchParties(trimmed);
                if (active) setAnswer({ query: trimmed, results: found, error: null });
            } catch (cause) {
                if (active) {
                    setAnswer({
                        query: trimmed,
                        results: null,
                        error: cause instanceof Error ? cause.message : "Search failed.",
                    });
                }
            }
        }, SEARCH_DEBOUNCE_MS);
        return () => {
            active = false;
            window.clearTimeout(timer);
        };
    }, [asking, trimmed]);

    const choose = (next: SelectedParty | null) => {
        onSelect(next);
        setQuery("");
        setAnswer(null);
    };

    const logColumns: SimpleColumn<AgreementAcceptance>[] = [
        {
            key: "when",
            label: "Accepted",
            className: "w-48 whitespace-nowrap",
            render: (row) => <span className="tabular-nums">{formatWhen(row.acceptedAt)}</span>,
        },
        {
            key: "party",
            label: "Party",
            render: (row) => {
                const who = partyOf(row);
                if (!who) return <span className="text-muted-foreground">—</span>;
                // The lookup knows publishers and advertisers; an agent's record is their own page.
                if (who.type === "agent") {
                    return (
                        <Link href={`${PARTY_ROUTE.agent}/${who.id}`} className="block hover:underline">
                            <span className="block font-medium text-foreground">{who.name || who.id}</span>
                            <span className="block text-xs text-muted-foreground">{PARTY_LABEL.agent.singular}</span>
                        </Link>
                    );
                }
                return (
                    <button
                        type="button"
                        onClick={() => choose({ type: who.type, id: who.id })}
                        className="text-left hover:underline"
                    >
                        <span className="block font-medium text-foreground">{who.name || who.id}</span>
                        <span className="block text-xs text-muted-foreground">
                            {who.displayId ?? PARTY_LABEL[who.type].singular}
                        </span>
                    </button>
                );
            },
        },
        {
            key: "agreement",
            label: "Agreement",
            render: (row) => (
                <div className="min-w-0">
                    <span className="block truncate text-foreground">
                        {KIND_META[row.templateKind].label} · v{row.templateVersion}
                    </span>
                    <AnchorCell row={row} />
                </div>
            ),
        },
        {
            key: "by",
            label: "By",
            render: (row) => (
                <div className="min-w-0">
                    <span className="block truncate">{row.acceptedBy.name ?? "—"}</span>
                    <span className="block truncate text-xs text-muted-foreground">{row.acceptedBy.mobile}</span>
                </div>
            ),
        },
        {
            key: "signature",
            label: "Signed",
            className: "w-32",
            render: (row) => <span className="block truncate text-xs text-muted-foreground">{signatureLabel(row)}</span>,
        },
        {
            key: "from",
            label: "From",
            className: "w-40",
            render: (row) => (
                <span className="block truncate text-xs text-muted-foreground" title={row.userAgent ?? undefined}>
                    {row.ipAddress ?? "—"}
                </span>
            ),
        },
        {
            key: "text",
            label: "",
            className: "w-20 text-right",
            render: (row) =>
                row.renderedDocument ? (
                    <Button size="sm" variant="ghost" onClick={() => setReading(row)}>
                        Text
                    </Button>
                ) : null,
        },
    ];

    return (
        <div className="space-y-5">
            {/* Lookup */}
            <Card className="rounded-lg border-border p-4 shadow-none">
                <label htmlFor="party-search" className="text-sm font-medium text-foreground">
                    Find a party
                </label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    An identifier like PUB-1909-2601 or ADV-1909-2601, a name, or the digits of a mobile.
                </p>
                <div className="relative mt-3">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        id="party-search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="PUB-1909-2601"
                        className="pl-9"
                        autoComplete="off"
                    />
                    {searching && (
                        <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                    )}
                </div>
                {searchError && <p className="mt-2 text-sm text-danger">{searchError}</p>}
                {results && (
                    <ul className="mt-3 divide-y rounded-md border">
                        {results.length === 0 && (
                            <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                                Nobody matches “{query.trim()}”.
                            </li>
                        )}
                        {results.map((row) => (
                            <li key={`${row.type}:${row.id}`}>
                                <button
                                    type="button"
                                    onClick={() => choose({ type: row.type, id: row.id })}
                                    className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted/60"
                                >
                                    <span className="flex min-w-0 items-center gap-3">
                                        <StatusBadge status={PARTY_META[row.type]} />
                                        <span className="min-w-0">
                                            <span className="block truncate font-medium text-foreground">{row.name}</span>
                                            <span className="block truncate text-xs text-muted-foreground">
                                                {row.displayId ?? "No identifier yet"} · {row.mobile}
                                                {row.city ? ` · ${row.city}` : ""}
                                            </span>
                                        </span>
                                    </span>
                                    <StatusBadge status={kycMeta(row.kycStatus)} />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>

            {selected ? (
                <ResourceBoundary resource={party}>
                    {(data) => (data ? <PartyRecord data={data} onClear={() => choose(null)} onRead={setReading} /> : null)}
                </ResourceBoundary>
            ) : (
                <SectionCard
                    title={template ? `Acceptances of ${KIND_META[template.kind].label} v${template.version}` : "Recent acceptances"}
                    description={
                        template
                            ? `“${template.title}” — everyone who clicked through this version.`
                            : "The newest clicks across every party and every kind. Choose a party to see their whole record."
                    }
                    actions={
                        template ? (
                            <Button size="sm" variant="outline" asChild>
                                <Link href="/agreements/acceptances">All acceptances</Link>
                            </Button>
                        ) : undefined
                    }
                    contentClassName="p-0"
                >
                    <SimpleTable
                        columns={logColumns}
                        rows={recent}
                        rowKey={(row) => row.id}
                        emptyMessage="Nobody has accepted anything yet."
                        className="rounded-none border-0"
                    />
                </SectionCard>
            )}

            <RenderedDocumentDialog acceptance={reading} onOpenChange={(open) => !open && setReading(null)} />
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* One party's record                                                  */
/* ------------------------------------------------------------------ */

interface PartyRecordProps {
    data: PartyAgreements;
    onClear: () => void;
    onRead: (acceptance: AgreementAcceptance) => void;
}

function PartyRecord({ data, onClear, onRead }: PartyRecordProps) {
    const { party, platform, acceptances } = data;
    const label = PARTY_LABEL[party.type];
    const platformLabel = platform ? KIND_META[platform.kind].label : "Platform terms";

    const standing = (() => {
        if (!platform) {
            return {
                icon: CheckCircle2,
                tone: "success" as const,
                title: "No platform terms to accept",
                detail: "An agent accepts the job terms on each order they take; there is no platform-level gate.",
            };
        }
        if (platform.currentVersion === null && !platform.accepted) {
            return {
                icon: AlertTriangle,
                tone: "danger" as const,
                title: `Nothing to accept: no ${platformLabel.toLowerCase()} is live`,
                detail: `${label.plural} cannot get past this gate until a version is activated on the Templates tab.`,
            };
        }
        if (!platform.accepted) {
            return {
                icon: CircleDashed,
                tone: "warning" as const,
                title: `Has not accepted the ${platformLabel.toLowerCase()}`,
                detail: `v${platform.currentVersion} is live. ${party.kycStatus === "VERIFIED" ? "KYC is verified, so this is the gate they are at." : "KYC comes first; the agreement is after it."}`,
            };
        }
        const a = platform.accepted;
        const blocked = platform.outdated && platform.requiresReacceptance;
        return {
            icon: platform.outdated ? AlertTriangle : CheckCircle2,
            tone: blocked ? ("danger" as const) : platform.outdated ? ("warning" as const) : ("success" as const),
            title: `Accepted v${a.templateVersion} on ${formatWhen(a.acceptedAt)}`,
            detail: blocked
                ? `v${platform.currentVersion} is live and requires re-acceptance. They are blocked from transacting until they click again.`
                : platform.outdated
                  ? `v${platform.currentVersion} is live now. They hold the older terms; the live version does not ask them to accept again.`
                  : platform.currentVersion === null
                    ? "No version is live any more, but their acceptance stands."
                    : "That is the version live today.",
        };
    })();

    const Icon = standing.icon;

    const columns: SimpleColumn<AgreementAcceptance>[] = [
        {
            key: "agreement",
            label: "Agreement",
            render: (row) => (
                <div className="min-w-0">
                    <span className="block truncate font-medium text-foreground">
                        {KIND_META[row.templateKind].label} · v{row.templateVersion}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{row.template.title}</span>
                    <AnchorCell row={row} />
                </div>
            ),
        },
        {
            key: "signature",
            label: "Signed",
            className: "w-32",
            render: (row) => <span className="block truncate text-xs text-muted-foreground">{signatureLabel(row)}</span>,
        },
        {
            key: "when",
            label: "Accepted",
            className: "w-48 whitespace-nowrap",
            render: (row) => <span className="tabular-nums">{formatWhen(row.acceptedAt)}</span>,
        },
        {
            key: "by",
            label: "By",
            render: (row) => (
                <div className="min-w-0">
                    <span className="block truncate">{row.acceptedBy.name ?? "—"}</span>
                    <span className="block truncate text-xs text-muted-foreground">{row.acceptedBy.mobile}</span>
                </div>
            ),
        },
        {
            key: "from",
            label: "From",
            render: (row) => (
                <div className="min-w-0">
                    <span className="block truncate text-sm">{row.ipAddress ?? "—"}</span>
                    <span className="block truncate text-xs text-muted-foreground" title={row.userAgent ?? undefined}>
                        {row.userAgent ?? ""}
                    </span>
                </div>
            ),
        },
        {
            key: "text",
            label: "",
            className: "w-24 text-right",
            render: (row) =>
                row.renderedDocument ? (
                    <Button size="sm" variant="ghost" onClick={() => onRead(row)}>
                        As accepted
                    </Button>
                ) : null,
        },
    ];

    return (
        <div className="space-y-4">
            <Card className="rounded-lg border-border p-5 shadow-none">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-lg font-semibold text-foreground">{party.name}</h2>
                            <StatusBadge status={PARTY_META[party.type]} />
                            <StatusBadge status={kycMeta(party.kycStatus)} />
                            {party.activatedAt && <StatusBadge status={{ label: "Activated", tone: "success" }} />}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {party.displayId ?? "No identifier yet"} · {party.mobile}
                            {party.city ? ` · ${party.city}` : ""} · joined {formatDate(party.createdAt)}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" asChild>
                            <Link href={`${PARTY_ROUTE[party.type]}/${party.id}`}>
                                Open {label.singular.toLowerCase()}
                            </Link>
                        </Button>
                        <Button size="sm" variant="ghost" onClick={onClear} aria-label="Clear party">
                            <X className="size-4" />
                        </Button>
                    </div>
                </div>

                <div
                    className={cn(
                        "mt-4 flex items-start gap-3 rounded-md border p-4",
                        standing.tone === "success" && "border-success/30 bg-success-soft/40",
                        standing.tone === "warning" && "border-warning/40 bg-warning-soft",
                        standing.tone === "danger" && "border-danger/40 bg-danger-soft"
                    )}
                >
                    <Icon
                        className={cn(
                            "mt-0.5 size-4 shrink-0",
                            standing.tone === "success" && "text-success",
                            standing.tone === "warning" && "text-warning",
                            standing.tone === "danger" && "text-danger"
                        )}
                        aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">
                            {platformLabel}: {standing.title}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{standing.detail}</p>
                        {platform?.accepted && (
                            <FieldList
                                className="mt-3 max-w-md space-y-1.5 text-xs"
                                items={[
                                    ["Version", `v${platform.accepted.templateVersion} · ${platform.accepted.template.title}`],
                                    [
                                        "Accepted by",
                                        `${platform.accepted.acceptedBy.name ?? "—"} · ${platform.accepted.acceptedBy.mobile}`,
                                    ],
                                    ["Signed", signatureLabel(platform.accepted)],
                                    ["From", platform.accepted.ipAddress ?? "—"],
                                    ["Live now", platform.currentVersion === null ? "Nothing" : `v${platform.currentVersion}`],
                                ]}
                            />
                        )}
                    </div>
                </div>
            </Card>

            <SectionCard
                title="Everything accepted"
                description={`Every agreement this ${label.singular.toLowerCase()} has clicked through, newest first — platform terms and per-deal agreements alike.`}
                contentClassName="p-0"
            >
                <SimpleTable
                    columns={columns}
                    rows={acceptances}
                    rowKey={(row) => row.id}
                    emptyMessage={`This ${label.singular.toLowerCase()} has not accepted anything yet.`}
                    className="rounded-none border-0"
                />
            </SectionCard>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* The text as accepted                                                */
/* ------------------------------------------------------------------ */

function RenderedDocumentDialog({
    acceptance,
    onOpenChange,
}: {
    acceptance: AgreementAcceptance | null;
    onOpenChange: (open: boolean) => void;
}) {
    return (
        <Dialog open={acceptance !== null} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl">
                {acceptance && (
                    <>
                        <DialogHeader>
                            <DialogTitle>
                                {KIND_META[acceptance.templateKind].label} · v{acceptance.templateVersion}, as accepted
                            </DialogTitle>
                            <DialogDescription>
                                {acceptanceAnchor(acceptance).label} · accepted {formatWhen(acceptance.acceptedAt)} by{" "}
                                {acceptance.acceptedBy.name ?? acceptance.acceptedBy.mobile}. This is the text
                                stored with the acceptance, not the template as it reads today.
                            </DialogDescription>
                        </DialogHeader>
                        <ScrollArea className="max-h-[60vh] rounded-md border">
                            <pre className="whitespace-pre-wrap px-4 py-3 font-sans text-sm leading-6 text-foreground">
                                {acceptance.renderedDocument}
                            </pre>
                        </ScrollArea>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
