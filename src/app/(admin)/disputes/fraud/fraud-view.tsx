"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, Paperclip, RefreshCw, Search, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FilterChips } from "@/components/adx/filter-chips";
import { KpiCard } from "@/components/adx/kpi-card";
import { PageHeader } from "@/components/adx/page-header";
import { PrivateFile, privateFileUrl } from "@/components/adx/private-file";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime, formatMoney } from "@/lib/format";
import {
    FRAUD_CASE_STATUSES,
    FRAUD_CASE_STATUS_META,
    OPEN_FRAUD_STATUSES,
    casePersonLabel,
    caseTitle,
    formatScore,
    fraudService,
    isDecided,
    CLEAN_BAND_HEIGHT,
    linkedGraphLayout,
    linkedPartiesOf,
    shapeSignals,
    subjectHref,
    type FraudCase,
    type FraudCaseFile,
    type FraudCaseStatus,
    type FraudCasesPage,
    type FraudSignal,
    type LinkedAccountsRead,
    type ScanResult,
} from "@/services/fraud";
import { PARTY_LABEL, scopeMeta } from "@/services/suspension";
import { uploadService } from "@/services/uploads";
import type { UserRow } from "@/services/users";
import { DecideCaseDialog, EscalateCaseDialog, OpenCaseDialog } from "./fraud-dialogs";
import type { FraudFacets } from "./fraud-loader";

interface FraudViewProps {
    page: FraudCasesPage;
    facets: FraudFacets;
    onFacetsChange: (facets: FraudFacets) => void;
    /** The console's ADMIN users, for the investigator and hand-to pickers, and the names on notes and evidence (which the reads do not name). */
    admins: UserRow[];
    /** `?case=` — the case a dispute linked to. */
    preselectId: string | null;
    /** `?scan=TYPE:id` — the party a party page asked to scan, and what the scan said. */
    scan: { state: "idle" | "loading" | "error"; result: ScanResult | null; error: string | null } | null;
    onChanged?: () => void;
}

/** "opened 1h ago", "opened 12d ago". */
function ago(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(ms) || ms < 0) return "";
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

const NOBODY = "__nobody__";

/**
 * The fraud desk — DR 10 "Fraud Investigation · /disputes/fraud" (5102:27407).
 *
 * The frame's queue, header, alert banner, three tiles, link graph, shared
 * signals card, timeline and case notes are all drawn, each over a route:
 *
 * - the "Fraud score 0.91" banner and the per-row score are the case's own
 *   `score` — `POST /fraud/cases/:id/score` recomputes it (the Recompute
 *   button; refused on a decided case, whose score is part of the record);
 * - SHARED SIGNALS lists every signal present on the stored `signals`, with
 *   its weight, value, detail and the accounts it names;
 * - the graph is `GET /fraud/cases/:id/linked`, drawn as SVG with no
 *   library: the subject in the centre, the linked accounts on a ring,
 *   each edge captioned with the signals that tie it. G13-B: the frame's
 *   "Clean" legend entry is drawn too — the read's `evaluated` (the
 *   parties the last scoring compared the subject against without a
 *   link) sit in a band under the ring with no edge, and a case never
 *   scored has none;
 * - the timeline's header names the decision (Q118) that nothing
 *   auto-suspends: a case's first row is its opening, and a suspension
 *   is only ever an operator's confirmation;
 * - "Accounts implicated" is the linked read's count for the selected
 *   case. "Value at risk" (G11-1) is the linked read's own `valueAtRisk` —
 *   every linked wallet's balance plus every linked open order's value —
 *   and each node on the graph carries its party's `walletBalance` and
 *   `openBookings`;
 * - the people on the case — opened by, investigator, decided by, handed
 *   to — are named by the reads themselves (G11-1); the admin list only
 *   feeds the pickers and the notes' authors;
 * - "Escalate to legal" is `POST /fraud/cases/:id/escalate` with a note and
 *   a named admin (ESCALATED, still open); the chip shows it;
 * - a party page's "Scan for signals" arrives as `?scan=`, and the scan
 *   result (`POST /fraud/scan/:type/:id`, stored nowhere) is drawn above
 *   the desk with the case it can open or the one already open.
 *
 * Everything else is as Lot D left it: Start investigating and the
 * investigator picker are `PATCH /fraud/cases/:id`; Save note is
 * `POST …/notes`; Add evidence is `POST …/evidence`; Confirm and Dismiss go
 * through `POST …/decide`.
 */
export function FraudView({ page, facets, onFacetsChange, admins, preselectId, scan, onChanged }: FraudViewProps) {
    const cases = page.items;
    const [selectedId, setSelectedId] = React.useState<string | undefined>(preselectId ?? cases[0]?.id);
    const [file, setFile] = React.useState<{ id: string; value: FraudCaseFile | null } | null>(null);
    const [linked, setLinked] = React.useState<{ id: string; value: LinkedAccountsRead | null; error: string | null } | null>(null);
    const [reload, setReload] = React.useState(0);
    const [note, setNote] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [opening, setOpening] = React.useState<{ preset?: { subjectType: FraudCase["subjectType"]; subjectId: string; subjectName: string | null; kind: string; summary: string } } | null>(null);
    const [escalating, setEscalating] = React.useState(false);
    const [deciding, setDeciding] = React.useState<"CONFIRMED" | "DISMISSED" | null>(null);

    /* The selection, or the first row. A `?case=` that is not on this page
       (a filter hides it, say) still reads by id and draws from the file. */
    const rowId = selectedId ?? cases[0]?.id;
    const row = cases.find((item) => item.id === rowId);

    // The queue row has no notes or evidence; the by-id read does. Keyed on
    // the case so a late answer never lands under another one.
    React.useEffect(() => {
        if (!rowId) return;
        let cancelled = false;
        fraudService
            .get(rowId)
            .then((value) => {
                if (!cancelled) setFile({ id: rowId, value });
            })
            .catch(() => {
                if (!cancelled) setFile({ id: rowId, value: null });
            });
        return () => {
            cancelled = true;
        };
    }, [rowId, reload]);

    // The linked accounts are computed now, on their own read — kept apart
    // from the file so a slow link evaluation never holds the case back.
    React.useEffect(() => {
        if (!rowId) return;
        let cancelled = false;
        fraudService
            .linked(rowId)
            .then((value) => {
                if (!cancelled) setLinked({ id: rowId, value, error: null });
            })
            .catch((cause: unknown) => {
                if (!cancelled) setLinked({ id: rowId, value: null, error: cause instanceof Error ? cause.message : "Could not compute the linked accounts." });
            });
        return () => {
            cancelled = true;
        };
    }, [rowId, reload]);

    /* Both reads are keyed on the case; a read is the selection's only while
       the ids match. An empty page has no `rowId` and no read, and
       `undefined === undefined` is true — so each is checked for being there
       before its id is compared, rather than through `?.`. */
    const selected: FraudCaseFile | null = file !== null && file.id === rowId ? file.value : null;
    const header: FraudCase | undefined = selected ?? row;
    const fileState = !rowId ? "idle" : file?.id !== rowId ? "loading" : file.value ? "idle" : "error";
    const links: LinkedAccountsRead | null = linked !== null && linked.id === rowId ? linked.value : null;
    const linksState = !rowId ? "idle" : linked?.id !== rowId ? "loading" : linked.value ? "idle" : "error";

    const refresh = () => {
        setReload((n) => n + 1);
        onChanged?.();
    };

    async function act(work: () => Promise<unknown>, success: string, description?: string) {
        setBusy(true);
        try {
            await work();
            toast.success(success, description ? { description } : undefined);
            refresh();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "That did not reach ADX.");
        } finally {
            setBusy(false);
        }
    }

    /** Notes and evidence carry an id only; the pickers' list names it when it can. */
    const adminName = (userId: string | null): string => {
        if (!userId) return "Nobody yet";
        return admins.find((user) => user.id === userId)?.displayName ?? userId;
    };

    const openCount = OPEN_FRAUD_STATUSES.reduce((sum, status) => sum + (page.counts[status] ?? 0), 0);
    const total = Object.values(page.counts).reduce((sum, n) => sum + n, 0);
    const implicated = links ? links.linked.length : null;
    const score = formatScore(header?.score);

    return (
        <div className="space-y-5">
            <PageHeader
                title="Fraud investigation"
                subtitle="Linked accounts flagged by the fraud engine"
                actions={
                    <Button onClick={() => setOpening({})}>Open case</Button>
                }
            />

            {scan && (
                <ScanResultCard
                    scan={scan}
                    onOpenCase={(preset) => setOpening({ preset })}
                    onShowCase={(caseId) => setSelectedId(caseId)}
                />
            )}

            <div className="grid gap-4 md:grid-cols-3">
                <KpiCard stat={{ id: "open", label: "Open cases", value: String(openCount), hint: `${total} total` }} />
                <KpiCard
                    stat={{
                        id: "implicated",
                        label: "Accounts implicated",
                        value: implicated === null ? "—" : String(implicated),
                        hint: header
                            ? linksState === "loading"
                                ? "Computing the links on the selected case…"
                                : linksState === "error"
                                  ? "The linked read failed for the selected case"
                                  : `Tied to ${header.displayId ?? header.id} by the shared signals, computed now`
                            : "Select a case",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "value-at-risk",
                        label: "Value at risk",
                        value: links ? formatMoney(links.valueAtRisk) : "—",
                        hint: links
                            ? `Linked wallets plus open bookings across the ${implicated} account${implicated === 1 ? "" : "s"} implicated`
                            : header
                              ? linksState === "loading"
                                  ? "Computing the exposure on the selected case…"
                                  : linksState === "error"
                                    ? "The linked read failed for the selected case"
                                    : "Select a case"
                              : "Select a case",
                    }}
                />
            </div>

            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
                {/* Case queue --------------------------------------------- */}
                <Card className="rounded-lg border-border shadow-none">
                    <div className="space-y-2.5 border-b px-4 py-3">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={facets.q}
                                onChange={(event) => onFacetsChange({ ...facets, q: event.target.value })}
                                placeholder="Case number, subject or description"
                                className="h-9 pl-8"
                            />
                        </div>
                        <FilterChips<FraudCaseStatus | "ALL">
                            value={facets.status}
                            onChange={(status) => onFacetsChange({ ...facets, status })}
                            chips={[
                                { value: "ALL", label: "All", count: total },
                                ...FRAUD_CASE_STATUSES.map((status) => ({
                                    value: status,
                                    label: FRAUD_CASE_STATUS_META[status].label.split(" — ")[0],
                                    count: page.counts[status] ?? 0,
                                })),
                            ]}
                        />
                    </div>

                    {cases.length ? (
                        <ul className="divide-y">
                            {cases.map((item) => {
                                const rowScore = formatScore(item.score);
                                const accounts = linkedPartiesOf(item.signals).length;
                                return (
                                    <li key={item.id}>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedId(item.id)}
                                            aria-current={rowId === item.id ? "true" : undefined}
                                            className={cn(
                                                "w-full px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                                                rowId === item.id ? "bg-muted/60" : "hover:bg-muted/40"
                                            )}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-xs font-medium tabular-nums text-muted-foreground">
                                                    {item.displayId ?? item.id}
                                                </span>
                                                <StatusBadge status={FRAUD_CASE_STATUS_META[item.status]} />
                                            </div>
                                            <p className="mt-1 text-sm font-medium leading-5 text-foreground">{caseTitle(item)}</p>
                                            <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                                                <span className={cn("shrink-0 font-medium tabular-nums", rowScore ? "text-danger" : "text-muted-foreground")}>
                                                    {rowScore ? `Score ${rowScore}` : "Not scored"}
                                                </span>
                                                <span className="truncate text-muted-foreground">
                                                    {item.signals ? `${accounts} account${accounts === 1 ? "" : "s"}` : item.kind}
                                                    {" · "}
                                                    {PARTY_LABEL[item.subjectType]} · {ago(item.createdAt)}
                                                </span>
                                            </div>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <p className="px-4 py-10 text-center text-sm text-muted-foreground">No cases match these filters.</p>
                    )}
                    {page.total > cases.length && (
                        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
                            Showing the first {cases.length} of {page.total}. Narrow the view to see the rest.
                        </p>
                    )}
                </Card>

                {/* Case detail -------------------------------------------- */}
                {header ? (
                    <div className="min-w-0 space-y-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2.5">
                                    <h2 className="text-lg font-semibold text-foreground">Case {header.displayId ?? header.id}</h2>
                                    <StatusBadge status={FRAUD_CASE_STATUS_META[header.status]} />
                                </div>
                                <p className="mt-0.5 text-sm text-muted-foreground">
                                    {header.kind} · {PARTY_LABEL[header.subjectType].toLowerCase()} · opened {ago(header.createdAt)}
                                    {header.disputeId ? (
                                        <>
                                            {" · cites a "}
                                            <Link href="/disputes" className="underline underline-offset-2 hover:text-foreground">
                                                dispute
                                            </Link>
                                        </>
                                    ) : null}
                                </p>
                            </div>
                            {!isDecided(header.status) && (
                                <div className="flex shrink-0 flex-wrap items-center gap-2">
                                    {header.status === "OPEN" && (
                                        <Button
                                            variant="outline"
                                            className="bg-card"
                                            disabled={busy}
                                            onClick={() =>
                                                void act(
                                                    () => fraudService.patch(header.id, { status: "INVESTIGATING" }),
                                                    `${header.displayId ?? header.id} under investigation`,
                                                    "Recorded as FRAUD_CASE_UPDATED."
                                                )
                                            }
                                        >
                                            Start investigating
                                        </Button>
                                    )}
                                    <Button variant="outline" className="bg-card" disabled={busy || !selected} onClick={() => setDeciding("DISMISSED")}>
                                        Dismiss case
                                    </Button>
                                    <Button variant="destructive" disabled={busy || !selected} onClick={() => setDeciding("CONFIRMED")}>
                                        Confirm and suspend
                                    </Button>
                                </div>
                            )}
                            {header.status === "CONFIRMED" && (
                                <Button variant="outline" className="bg-card" disabled={busy || !selected} onClick={() => setDeciding("DISMISSED")}>
                                    Overturn
                                </Button>
                            )}
                        </div>

                        {/* The banner: the score the case holds, and the summary. */}
                        <div
                            className={cn(
                                "flex flex-wrap items-start gap-3 rounded-lg border px-4 py-3",
                                header.status === "CONFIRMED" ? "border-danger/20 bg-danger-soft" : "border-warning/20 bg-warning-soft"
                            )}
                            data-testid="fraud-score-banner"
                        >
                            <TriangleAlert
                                className={cn("mt-0.5 size-4 shrink-0", header.status === "CONFIRMED" ? "text-danger" : "text-warning")}
                            />
                            <p className="min-w-0 flex-1 text-sm text-foreground">
                                <span className={cn("font-semibold", header.status === "CONFIRMED" ? "text-danger" : "text-warning")}>
                                    {score ? `Fraud score ${score}.` : "Not scored yet."}
                                </span>{" "}
                                {header.summary}
                                {header.scoredAt && (
                                    <span className="text-xs text-muted-foreground"> · scored {formatDateTime(header.scoredAt)}</span>
                                )}
                            </p>
                            {!isDecided(header.status) && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 shrink-0 bg-card"
                                    disabled={busy}
                                    onClick={() =>
                                        void act(
                                            () => fraudService.score(header.id),
                                            score ? "Score recomputed" : "Case scored",
                                            "The signals were evaluated over the party now and stored on the case. Recorded as FRAUD_CASE_SCORED."
                                        )
                                    }
                                >
                                    <RefreshCw className="mr-1.5 size-3.5" aria-hidden />
                                    {score ? "Recompute score" : "Score this case"}
                                </Button>
                            )}
                        </div>

                        {header.decision && (
                            <Card className="rounded-lg border-border p-4 shadow-none" data-testid="fraud-decision">
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Decision</h3>
                                <p className="mt-2 text-sm text-foreground">{header.decision}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {casePersonLabel(header.decidedBy, header.decidedByUserId)}
                                    {header.decidedAt ? ` · ${formatDateTime(header.decidedAt)}` : ""}
                                </p>
                            </Card>
                        )}

                        {header.escalatedAt && (
                            <Card className="rounded-lg border-danger/20 bg-danger-soft/40 p-4 shadow-none" data-testid="fraud-escalation">
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-danger">Escalated to legal</h3>
                                <p className="mt-2 text-sm text-foreground">{header.escalationNote}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {formatDateTime(header.escalatedAt)} · handed to{" "}
                                    {casePersonLabel(header.escalatedTo, header.escalatedToUserId, "nobody in particular")}
                                </p>
                            </Card>
                        )}

                        {fileState === "error" && (
                            <p className="text-sm text-muted-foreground">
                                Could not load the case file.{" "}
                                <button type="button" className="underline" onClick={() => setReload((n) => n + 1)}>
                                    Try again
                                </button>
                            </p>
                        )}

                        <div className="grid gap-4 xl:grid-cols-3">
                            <div className="space-y-4 xl:col-span-2">
                                {/* The link graph: the subject and the accounts the shared signals tie it to. */}
                                <Card className="rounded-lg border-border p-5 shadow-none" data-testid="fraud-linked-graph">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <ul className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                                            <li className="flex items-center gap-1.5">
                                                <span className="size-2.5 rounded-full border-2 border-danger" aria-hidden /> Flagged
                                            </li>
                                            <li className="flex items-center gap-1.5">
                                                <span className="size-2.5 rounded-full border-2 border-warning" aria-hidden /> Shared attribute
                                            </li>
                                            <li className="flex items-center gap-1.5">
                                                <span className="size-2.5 rounded-full border-2 border-dashed border-muted-foreground/60" aria-hidden /> Clean
                                            </li>
                                        </ul>
                                        {links && (
                                            <span className="text-xs text-muted-foreground">Computed {formatDateTime(links.computedAt)}</span>
                                        )}
                                    </div>
                                    {linksState === "loading" && <p className="mt-6 text-center text-sm text-muted-foreground">Evaluating the linking signals…</p>}
                                    {linksState === "error" && (
                                        <p className="mt-6 text-center text-sm text-muted-foreground">
                                            {linked?.error ?? "Could not compute the linked accounts."}{" "}
                                            <button type="button" className="underline" onClick={() => setReload((n) => n + 1)}>
                                                Try again
                                            </button>
                                        </p>
                                    )}
                                    {links && links.linked.length === 0 && (
                                        <p className="mt-6 text-center text-sm text-muted-foreground">
                                            No other account shares a PAN, payout account, device, sign-in subnet, mobile or listing photo with{" "}
                                            {links.subject.name ?? links.subject.id} right now.
                                            {(links.evaluated?.length ?? 0) > 0 && ` ${links.evaluated!.length} compared and found clean.`}
                                        </p>
                                    )}
                                    {links && (links.linked.length > 0 || (links.evaluated?.length ?? 0) > 0) && <LinkedGraph read={links} />}
                                </Card>

                                {/* The subject, and where it stands today. */}
                                <Card className="rounded-lg border-border p-5 shadow-none">
                                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Subject</h3>
                                    <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <Link
                                                href={subjectHref(header.subjectType, header.subjectId)}
                                                className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-4 hover:underline"
                                            >
                                                {selected?.suspension?.name ?? header.subjectId}
                                                <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden />
                                            </Link>
                                            <p className="mt-0.5 text-xs text-muted-foreground">
                                                {PARTY_LABEL[header.subjectType]} · <span className="font-mono">{header.subjectId}</span>
                                            </p>
                                        </div>
                                        {selected && (
                                            <div className="text-right">
                                                {selected.suspension === null ? (
                                                    <p className="text-xs text-muted-foreground">No longer resolves</p>
                                                ) : selected.suspension.scopes.length === 0 ? (
                                                    <StatusBadge status={{ label: "No restrictions in force", tone: "success" }} />
                                                ) : (
                                                    <div className="flex flex-wrap justify-end gap-1.5">
                                                        {selected.suspension.scopes.map((scope) => (
                                                            <StatusBadge key={scope} status={scopeMeta(scope)} />
                                                        ))}
                                                    </div>
                                                )}
                                                {selected.suspension?.suspendedAt && (
                                                    <p className="mt-1 text-xs text-muted-foreground">
                                                        Since {formatDateTime(selected.suspension.suspendedAt)}
                                                        {selected.suspension.suspensionReason ? ` · ${selected.suspension.suspensionReason}` : ""}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </Card>

                                {/* Evidence */}
                                <Card className="rounded-lg border-border p-5 shadow-none">
                                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evidence</h3>
                                    {fileState === "loading" && <p className="mt-2 text-sm text-muted-foreground">Loading…</p>}
                                    {selected && selected.evidence.length === 0 && (
                                        <p className="mt-2 text-sm text-muted-foreground">Nothing attached yet.</p>
                                    )}
                                    {selected && selected.evidence.length > 0 && (
                                        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                                            {selected.evidence.map((item) => (
                                                <li key={item.id} className="rounded-lg border p-3">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-sm font-medium text-foreground">{item.kind}</span>
                                                        <span className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</span>
                                                    </div>
                                                    {item.fileId && (
                                                        <PrivateFile
                                                            src={privateFileUrl(item.fileId)}
                                                            alt={`${item.kind} evidence`}
                                                            className="mt-2 max-h-56 w-full rounded-md object-contain"
                                                            frameClassName="mt-2 h-32 w-full rounded-md"
                                                        />
                                                    )}
                                                    {item.url && (
                                                        <a
                                                            href={item.url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="mt-2 inline-flex items-center gap-1.5 text-xs text-foreground underline-offset-2 hover:underline"
                                                        >
                                                            <Paperclip className="size-3.5" aria-hidden />
                                                            {item.url}
                                                        </a>
                                                    )}
                                                    {item.note && <p className="mt-2 text-sm text-muted-foreground">{item.note}</p>}
                                                    <p className="mt-1.5 text-[11px] text-muted-foreground">Added by {adminName(item.addedByUserId)}</p>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {selected && !isDecided(selected.status) && (
                                        <EvidenceComposer key={selected.id} caseId={selected.id} disabled={busy} onAdded={refresh} />
                                    )}
                                </Card>
                            </div>

                            <div className="space-y-4">
                                {/* Shared signals: what the score is made of. */}
                                <Card className="rounded-lg border-border p-5 shadow-none" data-testid="fraud-shared-signals">
                                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shared signals</h3>
                                    {header.signals ? (
                                        <SignalsList signals={header.signals} />
                                    ) : (
                                        <p className="mt-2 text-sm text-muted-foreground">
                                            Not scored yet. Score the case to evaluate the thirteen signals over {selected?.suspension?.name ?? "the party"}.
                                        </p>
                                    )}
                                </Card>

                                {/* Who is on it */}
                                <Card className="rounded-lg border-border p-5 shadow-none">
                                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Investigator</h3>
                                    <p className="mt-2 text-sm text-foreground">{casePersonLabel(header.assignedTo, header.assignedToUserId)}</p>
                                    {!isDecided(header.status) && (
                                        <Select
                                            value={header.assignedToUserId ?? NOBODY}
                                            onValueChange={(value) =>
                                                void act(
                                                    () => fraudService.patch(header.id, { assignedToUserId: value === NOBODY ? null : value }),
                                                    value === NOBODY ? "Investigator taken off" : "Investigator set",
                                                    value === NOBODY ? undefined : "They have been told."
                                                )
                                            }
                                            disabled={busy}
                                        >
                                            <SelectTrigger className="mt-3 h-9" aria-label="Investigator">
                                                <SelectValue placeholder="Put somebody on it" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={NOBODY}>Nobody</SelectItem>
                                                {admins.map((user) => (
                                                    <SelectItem key={user.id} value={user.id}>
                                                        {user.displayName}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                    <p className="mt-2 text-xs text-muted-foreground">Opened by {casePersonLabel(header.openedBy, header.openedByUserId)}</p>
                                </Card>

                                {/* Timeline: the notes, oldest first, between opened and decided. */}
                                <Card className="rounded-lg border-border p-5 shadow-none">
                                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Timeline</h3>
                                    {/* Q118: no auto-suspension exists — the first row is the case's opening, and a suspension is an operator's confirmation. */}
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Nothing suspends automatically (Q118): a case starts with its opening, and a suspension is only ever an operator confirming it.
                                    </p>
                                    <ol className="mt-3 space-y-3">
                                        <TimelineEntry label="Case opened" by={casePersonLabel(header.openedBy, header.openedByUserId)} at={header.createdAt} />
                                        {(selected?.notes ?? []).map((entry) => (
                                            <TimelineEntry key={entry.id} label={entry.body} by={adminName(entry.byUserId)} at={entry.createdAt} />
                                        ))}
                                        {header.escalatedAt && (
                                            <TimelineEntry
                                                label={`Escalated to legal${header.escalatedToUserId ? ` — handed to ${casePersonLabel(header.escalatedTo, header.escalatedToUserId)}` : ""}`}
                                                by={header.escalationNote ?? ""}
                                                at={header.escalatedAt}
                                            />
                                        )}
                                        {header.decidedAt && (
                                            <TimelineEntry
                                                label={header.status === "CONFIRMED" ? "Confirmed — subject suspended" : "Dismissed"}
                                                by={casePersonLabel(header.decidedBy, header.decidedByUserId)}
                                                at={header.decidedAt}
                                            />
                                        )}
                                    </ol>
                                </Card>

                                {/* Case notes, and the frame's "Escalate to legal" beside Save note. */}
                                {!isDecided(header.status) && (
                                    <Card className="rounded-lg border-border p-5 shadow-none">
                                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Case notes</h3>
                                        <Textarea
                                            value={note}
                                            onChange={(event) => setNote(event.target.value)}
                                            placeholder="Add investigation note"
                                            rows={3}
                                            className="mt-3"
                                            maxLength={4000}
                                        />
                                        <div className="mt-3 flex items-center justify-between gap-3">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="bg-card"
                                                disabled={!note.trim() || busy}
                                                onClick={() =>
                                                    void act(() => fraudService.addNote(header.id, note.trim()), "Note saved to the case record").then(() =>
                                                        setNote("")
                                                    )
                                                }
                                            >
                                                Save note
                                            </Button>
                                            {header.status === "ESCALATED" ? (
                                                <span className="text-xs text-muted-foreground">Already escalated</span>
                                            ) : (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-danger hover:text-danger"
                                                    disabled={busy || !selected}
                                                    onClick={() => setEscalating(true)}
                                                >
                                                    Escalate to legal
                                                </Button>
                                            )}
                                        </div>
                                    </Card>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <Card className="rounded-lg border-border p-10 text-center shadow-none">
                        <p className="text-sm font-medium text-foreground">No case selected</p>
                        <p className="mt-1 text-sm text-muted-foreground">Adjust the filters, or open a case against a party.</p>
                    </Card>
                )}
            </div>

            <OpenCaseDialog
                open={opening !== null}
                onOpenChange={(open) => !open && setOpening(null)}
                subjectType={opening?.preset?.subjectType}
                subjectId={opening?.preset?.subjectId}
                subjectName={opening?.preset?.subjectName}
                kind={opening?.preset?.kind}
                summary={opening?.preset?.summary}
                onOpened={(created) => {
                    setSelectedId(created.id);
                    onChanged?.();
                }}
            />
            {selected && deciding && (
                <DecideCaseDialog
                    fraudCase={selected}
                    verdict={deciding}
                    current={selected.suspension?.scopes ?? []}
                    subjectName={selected.suspension?.name ?? null}
                    open
                    onOpenChange={(open) => !open && setDeciding(null)}
                    onDecided={refresh}
                />
            )}
            {selected && escalating && (
                <EscalateCaseDialog
                    fraudCase={selected}
                    admins={admins}
                    open
                    onOpenChange={(open) => !open && setEscalating(false)}
                    onEscalated={refresh}
                />
            )}
        </div>
    );
}

function TimelineEntry({ label, by, at }: { label: string; by: string; at: string }) {
    return (
        <li className="flex gap-2.5">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
            <div className="min-w-0">
                <p className="text-sm text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">
                    {by ? `${by} · ` : ""}
                    {formatDateTime(at)}
                </p>
            </div>
        </li>
    );
}

/**
 * The SHARED SIGNALS list: every signal present, strongest first — its
 * label, how much of the pattern was seen against its weight, the line of
 * detail the signal wrote, and how many accounts it names. Shared by the
 * case's rail and the scan result.
 */
export function SignalsList({ signals }: { signals: FraudSignal[] }) {
    const rows = shapeSignals(signals);
    if (rows.length === 0) {
        return <p className="mt-2 text-sm text-muted-foreground">Nothing shared: every signal read zero.</p>;
    }
    return (
        <ul className="mt-3 divide-y">
            {rows.map((signal) => (
                <li key={signal.key} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{signal.label}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{signal.detail}</p>
                        </div>
                        <div className="shrink-0 text-right">
                            <p className={cn("text-sm font-medium tabular-nums", signal.value === null ? "text-muted-foreground" : "text-danger")}>
                                {signal.links.length > 0
                                    ? `${signal.links.length} account${signal.links.length === 1 ? "" : "s"}`
                                    : signal.value === null
                                      ? "Not computed"
                                      : `${Math.round(signal.value * 100)}%`}
                            </p>
                            <p className="text-[11px] tabular-nums text-muted-foreground">
                                weight {signal.weight.toFixed(2)}
                                {signal.value !== null ? ` · +${signal.contribution.toFixed(2)}` : ""}
                            </p>
                        </div>
                    </div>
                </li>
            ))}
        </ul>
    );
}

const NODE_RADIUS = 20;

/**
 * The link graph as SVG, no library: `linkedGraphLayout` places the
 * subject at the centre and the linked accounts on a ring; each circle is
 * a link to the party's page, each edge is captioned with the signals that
 * tie the two. G11-1: every linked node carries a card beneath the graph
 * with its wallet balance and open bookings, the figures the value at risk
 * is summed from.
 */
function LinkedGraph({ read }: { read: LinkedAccountsRead }) {
    const layout = linkedGraphLayout(read);
    const linkedNodes = layout.nodes.filter((node) => !node.subject && !node.clean);
    const cleanNodes = layout.nodes.filter((node) => node.clean);
    return (
        <>
        <svg
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            className="mt-3 h-auto w-full"
            role="img"
            aria-label={`${read.subject.name ?? read.subject.id} and ${read.linked.length} linked account${read.linked.length === 1 ? "" : "s"}${cleanNodes.length ? `, ${cleanNodes.length} evaluated and clean` : ""}`}
        >
            {cleanNodes.length > 0 && (
                <g data-testid="fraud-clean-band">
                    <line x1={12} y1={layout.height - CLEAN_BAND_HEIGHT} x2={layout.width - 12} y2={layout.height - CLEAN_BAND_HEIGHT} className="stroke-border" strokeDasharray="3 3" />
                    <text x={12} y={layout.height - CLEAN_BAND_HEIGHT + 12} className="fill-muted-foreground" fontSize={9}>
                        Evaluated, not linked
                    </text>
                </g>
            )}
            {layout.edges.map((edge) => {
                const from = layout.nodes.find((node) => node.key === edge.from)!;
                const to = layout.nodes.find((node) => node.key === edge.to)!;
                return (
                    <g key={`${edge.from}->${edge.to}`}>
                        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="stroke-border" strokeWidth={1.5} />
                        <text x={edge.x} y={edge.y - 4} textAnchor="middle" className="fill-muted-foreground" fontSize={10}>
                            {edge.label}
                        </text>
                    </g>
                );
            })}
            {layout.nodes.map((node) => (
                <Link key={node.key} href={subjectHref(node.type, node.id)}>
                    <g className="cursor-pointer">
                        <circle
                            cx={node.x}
                            cy={node.y}
                            r={NODE_RADIUS}
                            className={cn("fill-card", node.subject ? "stroke-danger" : node.clean ? "stroke-muted-foreground/60" : "stroke-warning")}
                            strokeWidth={2}
                            strokeDasharray={node.clean ? "4 3" : undefined}
                        />
                        <text
                            x={node.x}
                            y={node.y + 4}
                            textAnchor="middle"
                            className={cn("font-semibold", node.subject ? "fill-danger" : node.clean ? "fill-muted-foreground" : "fill-warning")}
                            fontSize={11}
                        >
                            {node.initials}
                        </text>
                        <text x={node.x} y={node.y + NODE_RADIUS + 14} textAnchor="middle" className="fill-muted-foreground" fontSize={10}>
                            {node.name ?? node.id}
                        </text>
                        {!node.subject && !node.clean && (
                            <text x={node.x} y={node.y + NODE_RADIUS + 26} textAnchor="middle" className="fill-muted-foreground" fontSize={9}>
                                {nodeExposure(node)}
                            </text>
                        )}
                    </g>
                </Link>
            ))}
        </svg>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2" data-testid="fraud-linked-cards">
            {linkedNodes.map((node) => (
                <li key={node.key} className="rounded-md border border-border px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                        <Link href={subjectHref(node.type, node.id)} className="truncate text-sm font-medium text-foreground underline-offset-4 hover:underline">
                            {node.name ?? node.id}
                        </Link>
                        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{PARTY_LABEL[node.type] ?? node.type}</span>
                    </div>
                    <dl className="mt-1.5 grid grid-cols-2 gap-x-3 text-xs">
                        <div>
                            <dt className="text-muted-foreground">Wallet balance</dt>
                            <dd className="font-medium tabular-nums text-foreground">{node.walletBalance === null ? "No wallet" : formatMoney(node.walletBalance)}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Open bookings</dt>
                            <dd className="font-medium tabular-nums text-foreground">{node.openBookings ?? 0}</dd>
                        </div>
                    </dl>
                </li>
            ))}
        </ul>
        </>
    );
}

/** The second caption line under a linked node: "₹12,500.00 · 3 open". */
function nodeExposure(node: { walletBalance: string | null; openBookings: number | null }): string {
    const wallet = node.walletBalance === null ? "no wallet" : formatMoney(node.walletBalance);
    const open = node.openBookings ?? 0;
    return `${wallet} · ${open} open`;
}

/**
 * What a party page's "Scan for signals" came back with: the party, its
 * score now, the signals, and either the case already open against it or
 * the button that opens one with the hot signals in the summary. Nothing
 * was stored; the scan was audited against the party.
 */
function ScanResultCard({
    scan,
    onOpenCase,
    onShowCase,
}: {
    scan: NonNullable<FraudViewProps["scan"]>;
    onOpenCase: (preset: { subjectType: FraudCase["subjectType"]; subjectId: string; subjectName: string | null; kind: string; summary: string }) => void;
    onShowCase: (caseId: string) => void;
}) {
    if (scan.state === "loading") {
        return (
            <Card className="rounded-lg border-border p-5 shadow-none">
                <p className="text-sm text-muted-foreground">Scanning the party for signals…</p>
            </Card>
        );
    }
    if (scan.state === "error" || !scan.result) {
        return (
            <Card className="rounded-lg border-danger/20 p-5 shadow-none">
                <p className="text-sm text-danger">{scan.error ?? "The scan did not reach ADX."}</p>
            </Card>
        );
    }
    const result = scan.result;
    const score = formatScore(result.score);
    const hot = shapeSignals(result.signals).filter((signal) => signal.value !== null);
    const subjectName = result.subject.name ?? result.subject.id;
    const subjectType = result.subject.listingId ? "LISTING" : result.subject.type;
    const subjectId = result.subject.listingId ?? result.subject.id;
    return (
        <Card className="rounded-lg border-border p-5 shadow-none" data-testid="fraud-scan-result">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scan result</h3>
                    <p className="mt-1 text-sm text-foreground">
                        <Link href={subjectHref(subjectType, subjectId)} className="font-medium underline-offset-4 hover:underline">
                            {subjectName}
                        </Link>{" "}
                        <span className="text-muted-foreground">
                            · {PARTY_LABEL[result.subject.type].toLowerCase()}
                            {result.subject.kycStatus ? ` · KYC ${result.subject.kycStatus.toLowerCase()}` : ""} · scanned {formatDateTime(result.scoredAt)}
                        </span>
                    </p>
                    <p className={cn("mt-1 text-lg font-semibold tabular-nums", Number(result.score) > 0 ? "text-danger" : "text-foreground")}>
                        Score {score ?? result.score}
                    </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {result.openCase ? (
                        <Button variant="outline" className="bg-card" onClick={() => onShowCase(result.openCase!.id)}>
                            Open case {result.openCase.displayId ?? result.openCase.id} · {FRAUD_CASE_STATUS_META[result.openCase.status].label.split(" — ")[0]}
                        </Button>
                    ) : (
                        <Button
                            onClick={() =>
                                onOpenCase({
                                    subjectType,
                                    subjectId,
                                    subjectName: result.subject.name,
                                    kind: hot.length ? "Signal scan" : "",
                                    summary: hot.length
                                        ? `Scan on ${formatDateTime(result.scoredAt)} scored ${score ?? result.score}: ${hot.map((signal) => `${signal.label} — ${signal.detail}`).join("; ")}`
                                        : "",
                                })
                            }
                        >
                            Open a case from this scan
                        </Button>
                    )}
                </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Stored nowhere; the scan was recorded against the party as FRAUD_SUBJECT_SCANNED.</p>
            <SignalsList signals={result.signals} />
        </Card>
    );
}

/**
 * `POST /fraud/cases/:id/evidence` — a kind and at least one of a private
 * upload (stored through `POST /upload` first, its id sent as `fileId`), a
 * link, or a note.
 */
function EvidenceComposer({ caseId, disabled, onAdded }: { caseId: string; disabled: boolean; onAdded: () => void }) {
    const [kind, setKind] = React.useState("");
    const [url, setUrl] = React.useState("");
    const [evidenceNote, setEvidenceNote] = React.useState("");
    const [picked, setPicked] = React.useState<File | null>(null);
    const [busy, setBusy] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const ready = kind.trim().length > 0 && (picked !== null || url.trim().length > 0 || evidenceNote.trim().length > 0);

    async function submit() {
        if (!ready || busy) return;
        setBusy(true);
        try {
            const uploaded = picked ? await uploadService.upload(picked, "OTHER") : null;
            await fraudService.addEvidence(caseId, {
                kind: kind.trim(),
                ...(uploaded ? { fileId: uploaded.id } : {}),
                ...(url.trim() ? { url: url.trim() } : {}),
                ...(evidenceNote.trim() ? { note: evidenceNote.trim() } : {}),
            });
            toast.success("Evidence added", { description: "Recorded as FRAUD_CASE_EVIDENCE_ADDED." });
            setKind("");
            setUrl("");
            setEvidenceNote("");
            setPicked(null);
            if (inputRef.current) inputRef.current.value = "";
            onAdded();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not add the evidence.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mt-4 space-y-2 rounded-lg border border-dashed p-3">
            <p className="text-xs font-medium text-foreground">Add evidence</p>
            <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-1">
                    <Label htmlFor="evidence-kind" className="text-xs text-muted-foreground">
                        Kind
                    </Label>
                    <Input
                        id="evidence-kind"
                        value={kind}
                        onChange={(event) => setKind(event.target.value)}
                        placeholder="Screenshot, bank statement, call recording…"
                        className="h-9"
                        maxLength={40}
                    />
                </div>
                <div className="grid gap-1">
                    <Label htmlFor="evidence-file" className="text-xs text-muted-foreground">
                        File (stored privately)
                    </Label>
                    <input
                        id="evidence-file"
                        ref={inputRef}
                        type="file"
                        accept="image/*,video/*,application/pdf"
                        onChange={(event) => setPicked(event.target.files?.[0] ?? null)}
                        className="h-9 text-xs file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1.5 file:text-xs"
                    />
                </div>
                <div className="grid gap-1">
                    <Label htmlFor="evidence-url" className="text-xs text-muted-foreground">
                        Link
                    </Label>
                    <Input
                        id="evidence-url"
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        placeholder="https://…"
                        className="h-9"
                        inputMode="url"
                    />
                </div>
                <div className="grid gap-1">
                    <Label htmlFor="evidence-note" className="text-xs text-muted-foreground">
                        Note
                    </Label>
                    <Input
                        id="evidence-note"
                        value={evidenceNote}
                        onChange={(event) => setEvidenceNote(event.target.value)}
                        placeholder="What it shows"
                        className="h-9"
                        maxLength={2000}
                    />
                </div>
            </div>
            <div className="flex justify-end">
                <Button size="sm" variant="outline" className="bg-card" disabled={!ready || busy || disabled} onClick={() => void submit()}>
                    {busy ? "Adding…" : "Add evidence"}
                </Button>
            </div>
        </div>
    );
}
