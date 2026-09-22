"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, FileImage, FileText, Search, Send, ShieldAlert, Wrench } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AgentSearchPicker } from "@/components/adx/agent-search-picker";
import { FilterChips } from "@/components/adx/filter-chips";
import { KpiCard } from "@/components/adx/kpi-card";
import { PageHeader } from "@/components/adx/page-header";
import { isPrivateFileUrl, openPrivateFile } from "@/components/adx/private-file";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { AgentSummary } from "@/services/agents";
import {
    chipCount,
    disputeService,
    isOpenStatus,
    OUTCOME_LABEL,
    QUEUE_CHIP_STATUSES,
    type CaseSummary,
    type DisputeCase,
    type DisputeOutcome,
    type DisputeQueuePage,
    type MovableStatus,
} from "@/services/disputes";
import { FRAUD_CASE_STATUS_META, type FraudCaseStatus, type FraudSubjectType } from "@/services/fraud";
import { DISPUTE_STATUS_META } from "@/types";
import { OpenCaseDialog } from "./fraud/fraud-dialogs";
import type { DisputeChip, DisputeFacets } from "./disputes-loader";

interface DisputesViewProps {
    page: DisputeQueuePage;
    summary: CaseSummary;
    facets: DisputeFacets;
    onFacetsChange: (facets: DisputeFacets) => void;
    onChanged?: () => void;
}

const PARTY_LABEL: Record<DisputeCase["raisedAs"], string> = {
    PUBLISHER: "Publisher",
    ADVERTISER: "Advertiser",
    AGENT: "Agent",
    ADX: "ADX",
};

/** Which of the four parties a fraud case against the other side would name; ADX is nobody to suspend. */
const SUBJECT_OF: Record<DisputeCase["againstParty"], FraudSubjectType | null> = {
    PUBLISHER: "PUBLISHER",
    ADVERTISER: "ADVERTISER",
    AGENT: "AGENT",
    ADX: null,
};

/**
 * The disputes desk.
 *
 * Live since DR 07's third wave: the queue is `GET /disputes` on E6's list
 * contract — the chips, the search and the pager are the server's own
 * facets, and the counts on the chips are its — selecting a
 * case reads its thread and evidence by id, the composer answers as ADX
 * Ops, the status buttons move it with a note, and the verdicts decide it.
 * A verdict that credits money records the credit pending — DR 04 says
 * nothing that moves money is automatic — and Release credit is finance's
 * separate step, so the desk never shows a refund it has not made.
 *
 * Lot D: "Request evidence" moves the case to AWAITING_RESPONSE and the
 * clock stops — the badge says so instead of counting down. A REINSTALL
 * verdict raises a visit on the order, and the case links to the order's
 * milestone card while it is pending. "Open fraud case" opens one citing
 * this dispute, its subject pre-filled and locked from the read's
 * `against` record (E7-3); once one is open the case names it.
 */
export function DisputesView({ page, summary, facets, onFacetsChange, onChanged }: DisputesViewProps) {
    const cases = page.items;
    const [selectedId, setSelectedId] = React.useState(cases[0]?.id);
    const [note, setNote] = React.useState("");
    const [creditAmount, setCreditAmount] = React.useState("");
    const [reinstallAgent, setReinstallAgent] = React.useState<AgentSummary | null>(null);
    const [reply, setReply] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [openingFraud, setOpeningFraud] = React.useState(false);
    const [detail, setDetail] = React.useState<{ id: string; value: DisputeCase | null } | null>(null);
    const [reload, setReload] = React.useState(0);

    const row = cases.find((dispute) => dispute.id === selectedId) ?? cases[0];
    const rowId = row?.id;
    const pageCount = Math.max(1, Math.ceil(page.total / Math.max(1, page.pageSize)));
    const setChip = (chip: DisputeChip) => onFacetsChange({ ...facets, chip, page: 1 });

    // The queue row has no thread; the by-id read does. Keyed on the case so a
    // late answer never lands under another case.
    React.useEffect(() => {
        if (!rowId) return;
        let cancelled = false;
        disputeService
            .get(rowId)
            .then((value) => {
                if (!cancelled) setDetail({ id: rowId, value });
            })
            .catch(() => {
                if (!cancelled) setDetail({ id: rowId, value: null });
            });
        return () => {
            cancelled = true;
        };
    }, [rowId, reload]);

    /* The read is the selection's only while the ids match. An empty page has
       no `rowId` and no read, and `undefined === undefined` is true — so the
       read is checked for being there before its id is compared, not via `?.`. */
    const selected: DisputeCase | undefined = detail !== null && detail.id === rowId && detail.value ? detail.value : row;
    const threadState = !rowId ? "idle" : detail?.id !== rowId ? "loading" : detail.value ? "idle" : "error";

    const refresh = () => {
        setReload((n) => n + 1);
        onChanged?.();
    };

    async function act(label: string, work: () => Promise<unknown>, success: string) {
        setBusy(true);
        try {
            await work();
            toast.success(success);
            refresh();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : `Could not ${label}.`);
        } finally {
            setBusy(false);
        }
    }

    const needNote = () => {
        if (note.trim()) return false;
        toast.error("Add a note first, it goes on the case record.");
        return true;
    };

    const moveTo = (status: MovableStatus, label: string) => {
        if (!selected || needNote()) return;
        void act("move the case", () => disputeService.setStatus(selected.id, status, note.trim()), `${selected.displayId}: ${label}`).then(() => setNote(""));
    };

    const decide = (outcome: DisputeOutcome) => {
        if (!selected || needNote()) return;
        if (outcome === "PARTIAL_CREDIT" && !/^\d+(\.\d{1,2})?$/.test(creditAmount.trim())) {
            toast.error("Enter the partial credit as a plain amount, like 450 or 450.50.");
            return;
        }
        if (outcome === "REINSTALL" && !selected.orderId) {
            toast.error("A re-install needs an order to re-install; this case has none.");
            return;
        }
        const input = {
            outcome,
            note: note.trim(),
            ...(outcome === "PARTIAL_CREDIT" ? { creditAmount: creditAmount.trim() } : {}),
            ...(outcome === "REINSTALL" && reinstallAgent ? { agentId: reinstallAgent.id } : {}),
        };
        const success =
            outcome === "NO_FAULT"
                ? `${selected.displayId}: rejected — both parties told`
                : outcome === "REINSTALL"
                  ? `${selected.displayId}: reinstall approved — a visit is offered to ${reinstallAgent?.user?.name ?? "the agent who did the work"}`
                  : `${selected.displayId}: credit approved, pending finance`;
        void act("decide the case", () => disputeService.resolve(selected.id, input), success).then(() => {
            setNote("");
            setCreditAmount("");
            setReinstallAgent(null);
        });
    };

    const release = () => {
        if (!selected) return;
        void act("release the credit", () => disputeService.releaseCredit(selected.id), `${selected.displayId}: ${formatMoney(selected.creditedAmount)} released to the wallet`);
    };

    const sendReply = () => {
        if (!selected || !reply.trim()) return;
        void act("send the reply", () => disputeService.message(selected.id, reply.trim()), "Reply sent as ADX Ops").then(() => setReply(""));
    };

    const open = selected ? isOpenStatus(selected.status) : false;
    /* The fraud case's subject: the record the read named, else only the party type the enum gives. */
    const subject = selected?.against ?? null;
    const subjectType: FraudSubjectType | null = subject?.type ?? (selected ? SUBJECT_OF[selected.againstParty] : null);

    return (
        <div className="space-y-5">
            <PageHeader title="Disputes & refunds" />

            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                <KpiCard stat={{ id: "open", label: "Open disputes", value: String(summary.open) }} />
                <KpiCard stat={{ id: "risk", label: "Value at risk", value: formatMoney(summary.valueAtRisk) }} />
                <KpiCard stat={{ id: "sla", label: "SLA breaches", value: String(summary.slaBreaches), deltaTone: "negative" }} />
                <KpiCard stat={{ id: "avg", label: "Avg resolution", value: `${summary.avgResolutionDays} days` }} />
                <KpiCard stat={{ id: "credited", label: "Credited this month", value: formatMoney(summary.creditedThisMonth) }} />
                <KpiCard stat={{ id: "rejected", label: "Rejected this month", value: String(summary.rejectedThisMonth) }} />
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
                {/* Queue */}
                <Card className="flex flex-col overflow-hidden rounded-lg border-border shadow-none">
                    <div className="space-y-3 border-b p-4">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={facets.q}
                                onChange={(event) => onFacetsChange({ ...facets, q: event.target.value, page: 1 })}
                                placeholder="Search by number, detail or campaign"
                                className="h-9 pl-8"
                            />
                        </div>
                        <FilterChips<DisputeChip>
                            value={facets.chip}
                            onChange={setChip}
                            chips={[
                                { value: "open", label: "Open", count: chipCount(page.counts, QUEUE_CHIP_STATUSES.open) },
                                { value: "escalated", label: "Escalated", count: chipCount(page.counts, QUEUE_CHIP_STATUSES.escalated) },
                                { value: "resolved", label: "Resolved", count: chipCount(page.counts, QUEUE_CHIP_STATUSES.resolved) },
                            ]}
                        />
                    </div>
                    <ul className="flex-1 divide-y overflow-y-auto">
                        {cases.map((dispute) => {
                            const active = dispute.id === rowId;
                            return (
                                <li key={dispute.id}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedId(dispute.id)}
                                        className={cn("w-full px-4 py-3 text-left transition-colors", active ? "bg-primary/[0.04]" : "hover:bg-muted/50")}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm font-semibold text-foreground">{dispute.displayId}</span>
                                            <StatusBadge status={DISPUTE_STATUS_META[dispute.badge]} />
                                        </div>
                                        <div className="mt-1 flex items-center justify-between gap-2">
                                            <span className="truncate text-xs text-muted-foreground">
                                                {dispute.raisedByName ?? PARTY_LABEL[dispute.raisedAs]} · {dispute.reason}
                                            </span>
                                            <span className="shrink-0 text-xs text-muted-foreground">{dispute.ageDays}d old</span>
                                        </div>
                                        <p className="mt-0.5 text-xs font-medium text-foreground">
                                            {dispute.amountClaimed ? formatMoney(dispute.amountClaimed) : "No amount claimed"}
                                        </p>
                                    </button>
                                </li>
                            );
                        })}
                        {cases.length === 0 && <li className="px-4 py-10 text-center text-sm text-muted-foreground">No disputes match.</li>}
                    </ul>
                    {page.total > page.pageSize && (
                        <div className="flex items-center justify-between gap-2 border-t px-4 py-2 text-xs text-muted-foreground" data-testid="dispute-pager">
                            <span>
                                Page {page.page} of {pageCount} · {page.total} case{page.total === 1 ? "" : "s"}
                            </span>
                            <span className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7"
                                    aria-label="Previous page"
                                    disabled={page.page <= 1}
                                    onClick={() => onFacetsChange({ ...facets, page: Math.max(1, page.page - 1) })}
                                >
                                    <ChevronLeft className="size-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7"
                                    aria-label="Next page"
                                    disabled={page.page >= pageCount}
                                    onClick={() => onFacetsChange({ ...facets, page: page.page + 1 })}
                                >
                                    <ChevronRight className="size-4" />
                                </Button>
                            </span>
                        </div>
                    )}
                </Card>

                {/* Detail */}
                {selected && (
                    <div className="space-y-4 xl:col-span-2">
                        <Card className="rounded-lg border-border p-5 shadow-none">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-2.5">
                                        <h2 className="text-lg font-semibold text-foreground">{selected.displayId}</h2>
                                        <StatusBadge status={DISPUTE_STATUS_META[selected.badge]} />
                                        {selected.slaNote && (
                                            <span
                                                className={cn(
                                                    "rounded-full px-2 py-0.5 text-[11px] font-medium",
                                                    selected.slaPaused ? "bg-info-soft text-info" : "bg-danger-soft text-danger"
                                                )}
                                                data-testid="dispute-sla"
                                            >
                                                {selected.slaNote}
                                            </span>
                                        )}
                                    </div>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {selected.orderId ? (
                                            <Link href={`/orders/${selected.orderId}`} className="underline-offset-4 hover:underline">
                                                {selected.orderRef}
                                            </Link>
                                        ) : (
                                            selected.orderRef
                                        )}{" "}
                                        · {selected.site} · Filed {formatDateTime(selected.filedAt)}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground" data-testid="dispute-parties">
                                        Raised by {selected.raisedByName ?? PARTY_LABEL[selected.raisedAs].toLowerCase()} ({PARTY_LABEL[selected.raisedAs].toLowerCase()}) against{" "}
                                        {selected.against?.name ? `${selected.against.name} (${PARTY_LABEL[selected.againstParty].toLowerCase()})` : PARTY_LABEL[selected.againstParty].toLowerCase()}
                                        {selected.against?.displayId ? ` · ${selected.against.displayId}` : ""}
                                    </p>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <div className="text-right">
                                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Amount claimed</p>
                                        <p className="text-metric text-foreground">{selected.amountClaimed ? formatMoney(selected.amountClaimed) : "—"}</p>
                                    </div>
                                    {selected.openFraudCase ? (
                                        <Link
                                            href={`/disputes/fraud?case=${encodeURIComponent(selected.openFraudCase.id)}`}
                                            className="inline-flex items-center gap-1.5 text-xs font-medium text-danger underline-offset-4 hover:underline"
                                            data-testid="dispute-fraud-case"
                                        >
                                            <ShieldAlert className="size-3.5" aria-hidden />
                                            Fraud case {selected.openFraudCase.displayId ?? selected.openFraudCase.id} ·{" "}
                                            {FRAUD_CASE_STATUS_META[selected.openFraudCase.status as FraudCaseStatus]?.label ?? selected.openFraudCase.status}
                                        </Link>
                                    ) : subjectType ? (
                                        <Button variant="outline" size="sm" className="h-8 bg-card" disabled={busy} onClick={() => setOpeningFraud(true)}>
                                            <ShieldAlert className="mr-1.5 size-3.5" aria-hidden />
                                            Open fraud case
                                        </Button>
                                    ) : null}
                                </div>
                            </div>

                            {(selected.reinstallPending || selected.reinstallMilestoneId) && selected.orderId && (
                                <Link
                                    href={`/orders/${selected.orderId}#milestones`}
                                    className="mt-4 flex items-center gap-3 rounded-lg border border-info/30 bg-info-soft px-4 py-3 text-sm text-foreground transition-colors hover:bg-info-soft/80"
                                    data-testid="dispute-reinstall"
                                >
                                    <Wrench className="size-4 shrink-0 text-info" aria-hidden />
                                    <span className="min-w-0 flex-1">
                                        <span className="font-medium">
                                            {selected.reinstallPending ? "Re-install dispatched — pending" : "Re-install done"}
                                        </span>
                                        <span className="block text-xs text-muted-foreground">
                                            {selected.reinstallStatus
                                                ? `The visit on the order is ${selected.reinstallStatus.toLowerCase().replace(/_/g, " ")}. `
                                                : ""}
                                            Open the order&apos;s milestone card to follow it.
                                        </span>
                                    </span>
                                </Link>
                            )}

                            <div className="mt-5 grid gap-5 lg:grid-cols-2">
                                <div>
                                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reason</h3>
                                    <p className="mt-2 text-sm font-medium text-foreground">{selected.reason}</p>
                                    <p className="mt-1.5 text-sm text-muted-foreground">{selected.detail}</p>
                                    {selected.expectedResolution && (
                                        <p className="mt-1.5 text-xs text-muted-foreground">Expected resolution: {selected.expectedResolution}</p>
                                    )}

                                    {selected.outcome && (
                                        <div className="mt-5 rounded-lg bg-muted/60 p-3" data-testid="dispute-decision">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Decision</p>
                                            <p className="mt-1 text-sm font-medium text-foreground">{OUTCOME_LABEL[selected.outcome]}</p>
                                            {selected.resolutionNote && <p className="mt-1 text-sm text-muted-foreground">{selected.resolutionNote}</p>}
                                            {selected.creditedAmount && (
                                                <p className="mt-2 text-sm text-foreground">
                                                    {formatMoney(selected.creditedAmount)}{" "}
                                                    {selected.creditStatus === "RELEASED" ? "released to the wallet" : "credit approved — pending finance release"}
                                                </p>
                                            )}
                                            {selected.creditStatus === "PENDING" && (
                                                <Button size="sm" className="mt-3" disabled={busy} onClick={release}>
                                                    Release credit
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evidence</h3>
                                    {threadState === "loading" && <p className="mt-2 text-sm text-muted-foreground">Loading…</p>}
                                    {threadState === "error" && (
                                        <p className="mt-2 text-sm text-muted-foreground">
                                            Could not load this case.{" "}
                                            <button type="button" className="underline" onClick={() => setReload((n) => n + 1)}>
                                                Try again
                                            </button>
                                        </p>
                                    )}
                                    {threadState === "idle" && selected.evidence.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Nothing attached.</p>}
                                    <ul className="mt-2 space-y-2">
                                        {selected.evidence.map((item) => {
                                            const icon = (
                                                <span className="flex size-9 items-center justify-center rounded-md bg-muted">
                                                    {item.kind === "PDF" ? <FileText className="size-4 text-muted-foreground" /> : <FileImage className="size-4 text-muted-foreground" />}
                                                </span>
                                            );
                                            const rowClass = "flex w-full items-center gap-3 rounded-lg border p-2.5 text-left";
                                            /* A row with no url has no file behind it — the Lot G verifier: it is
                                               disabled and says so, rather than toasting about a viewer that does
                                               not exist. */
                                            if (!item.url) {
                                                return (
                                                    <li key={item.id}>
                                                        <div className={cn(rowClass, "opacity-60")} aria-disabled="true" data-testid="evidence-no-file">
                                                            {icon}
                                                            <span className="min-w-0">
                                                                <span className="block truncate text-sm font-medium text-foreground">{item.fileName}</span>
                                                                <span className="block text-xs text-muted-foreground">No file on this evidence</span>
                                                            </span>
                                                        </div>
                                                    </li>
                                                );
                                            }
                                            const url = item.url;
                                            return (
                                                <li key={item.id}>
                                                    <a
                                                        href={url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        onClick={(event) => {
                                                            // DISPUTE_EVIDENCE is a private purpose: `/files/:id` refuses a
                                                            // plain new-tab open because the browser sends no bearer with it.
                                                            if (isPrivateFileUrl(url)) {
                                                                event.preventDefault();
                                                                void openPrivateFile(url).catch((error: unknown) => {
                                                                    toast.error(error instanceof Error ? error.message : "The file could not be opened.");
                                                                });
                                                            }
                                                        }}
                                                        className={cn(rowClass, "transition-colors hover:bg-muted/50")}
                                                    >
                                                        {icon}
                                                        <span className="min-w-0">
                                                            <span className="block truncate text-sm font-medium text-foreground">{item.fileName}</span>
                                                            <span className="block text-xs text-muted-foreground">{formatDateTime(item.uploadedAt)}</span>
                                                        </span>
                                                    </a>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            </div>
                        </Card>

                        {/* The thread */}
                        <Card className="rounded-lg border-border p-5 shadow-none">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conversation</h3>
                            <div className="mt-3 space-y-3">
                                {threadState === "idle" && selected.messages.length === 0 && <p className="text-sm text-muted-foreground">No replies yet.</p>}
                                {selected.messages.map((message) => (
                                    <div key={message.id} className={cn("flex", message.fromOps && "justify-end")}>
                                        <div className={cn("max-w-[80%] rounded-lg px-3.5 py-2.5", message.fromOps ? "bg-primary text-primary-foreground" : "bg-muted")}>
                                            <p className="text-sm">{message.body}</p>
                                            <p className={cn("mt-1.5 text-[10px]", message.fromOps ? "text-primary-foreground/70" : "text-muted-foreground")}>
                                                {message.author} · {formatDateTime(message.at)}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 flex items-center gap-2">
                                <Input
                                    value={reply}
                                    onChange={(event) => setReply(event.target.value)}
                                    onKeyDown={(event) => event.key === "Enter" && sendReply()}
                                    placeholder="Reply as ADX Ops…"
                                    className="h-10"
                                    disabled={busy}
                                />
                                <Button onClick={sendReply} className="h-10 shrink-0" disabled={busy || !reply.trim()}>
                                    <Send className="mr-1.5 size-4" />
                                    Send
                                </Button>
                            </div>
                        </Card>

                        {/* The decision */}
                        <Card className="rounded-lg border-border p-5 shadow-none">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{open ? "Resolution" : "Decided"}</h3>
                            {open ? (
                                <>
                                    <Textarea
                                        value={note}
                                        onChange={(event) => setNote(event.target.value)}
                                        placeholder="Add a note for the case record — it goes to both parties…"
                                        className="mt-3 min-h-20 resize-none"
                                    />
                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                        <span className="text-xs text-muted-foreground">Move:</span>
                                        <Button variant="outline" size="sm" className="bg-card" disabled={busy} onClick={() => moveTo("UNDER_REVIEW", "under review")}>
                                            Under review
                                        </Button>
                                        <Button variant="outline" size="sm" className="bg-card" disabled={busy} onClick={() => moveTo("AWAITING_RESPONSE", "evidence requested")}>
                                            Request evidence
                                        </Button>
                                        <Button variant="outline" size="sm" className="bg-card" disabled={busy} onClick={() => moveTo("ESCALATED", "escalated")}>
                                            Escalate
                                        </Button>
                                    </div>
                                    {selected.orderId && (
                                        <div className="mt-4 max-w-md">
                                            <AgentSearchPicker
                                                id="reinstall-agent"
                                                label={
                                                    <>
                                                        Re-install by <span className="font-normal text-muted-foreground">(optional — the agent who did the work, if blank)</span>
                                                    </>
                                                }
                                                value={reinstallAgent}
                                                onChange={setReinstallAgent}
                                            />
                                        </div>
                                    )}
                                    <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                                        <Input
                                            value={creditAmount}
                                            onChange={(event) => setCreditAmount(event.target.value)}
                                            placeholder="Partial amount, e.g. 450"
                                            className="h-9 w-44"
                                            aria-label="Partial credit amount"
                                        />
                                        <Button variant="outline" className="bg-card text-danger hover:text-danger" disabled={busy} onClick={() => decide("NO_FAULT")}>
                                            Reject dispute
                                        </Button>
                                        <Button variant="outline" className="bg-card" disabled={busy} onClick={() => decide("REINSTALL")}>
                                            Reinstall approved
                                        </Button>
                                        <Button variant="outline" className="bg-card" disabled={busy} onClick={() => decide("PARTIAL_CREDIT")}>
                                            Partial credit
                                        </Button>
                                        <Button disabled={busy} onClick={() => decide("FULL_CREDIT")}>
                                            Credit in full
                                        </Button>
                                    </div>
                                    <p className="mt-3 text-xs text-muted-foreground">
                                        A credit is recorded pending and released by finance in a second step — nothing that moves money is automatic.
                                    </p>
                                </>
                            ) : (
                                <p className="mt-2 text-sm text-muted-foreground">
                                    {selected.outcome ? OUTCOME_LABEL[selected.outcome] : "Closed"}. The raiser may reopen the case within seven days of the decision.
                                </p>
                            )}
                        </Card>
                    </div>
                )}
            </div>

            {selected && subjectType && (
                <OpenCaseDialog
                    open={openingFraud}
                    onOpenChange={setOpeningFraud}
                    subjectType={subjectType}
                    subjectId={subject?.id}
                    subjectName={subject?.name ?? null}
                    disputeId={selected.id}
                    onOpened={() => refresh()}
                />
            )}
        </div>
    );
}
