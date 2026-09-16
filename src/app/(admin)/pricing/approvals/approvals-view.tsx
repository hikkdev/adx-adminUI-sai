"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FilterChips } from "@/components/adx/filter-chips";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate, formatINR } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import {
    APPROVAL_SOURCE_LABEL,
    rateCardService,
    type ApprovalsPage,
    type PriceApproval,
    type PriceApprovalSource,
    type PriceApprovalStatus,
} from "@/services/rate-cards";
import type { PriceModelSettings } from "@/services/price-model";
import type { StatusMeta } from "@/types";
import type { ApprovalFilters } from "./approvals-loader";

interface ApprovalsViewProps {
    page: ApprovalsPage;
    settings: PriceModelSettings;
    filters: ApprovalFilters;
    onFiltersChange: (next: Partial<ApprovalFilters>) => void;
    onChanged: () => void;
}

/** Pending past this is overdue. */
const OVERDUE_MS = 48 * 60 * 60 * 1000;

const STATUS_CHIPS: { value: PriceApprovalStatus | "ALL"; label: string }[] = [
    { value: "PENDING", label: "Pending" },
    { value: "APPROVED", label: "Approved" },
    { value: "REJECTED", label: "Rejected" },
    { value: "ALL", label: "All" },
];

const SOURCES: PriceApprovalSource[] = ["PUBLISH_REQUEST", "CARD_REVISION"];

const STATUS_META: Record<"pending" | "overdue" | "approved" | "rejected", StatusMeta> = {
    pending: { label: "Pending", tone: "warning" },
    overdue: { label: "Overdue", tone: "danger" },
    approved: { label: "Approved", tone: "success" },
    rejected: { label: "Rejected", tone: "danger" },
};

const money = (value: string | null) => (value ? formatINR(Number(value)) : "—");

function stateOf(approval: PriceApproval, now: number) {
    if (approval.status === "APPROVED") return "approved" as const;
    if (approval.status === "REJECTED") return "rejected" as const;
    return now - new Date(approval.createdAt).getTime() > OVERDUE_MS ? ("overdue" as const) : ("pending" as const);
}

function discountPct(approval: PriceApproval): number | null {
    if (!approval.cardRatePerDay) return null;
    const card = Number(approval.cardRatePerDay);
    if (card <= 0) return null;
    return ((card - Number(approval.requestedRatePerDay)) / card) * 100;
}

function age(iso: string, now: number): string {
    const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours}h`;
    return `${Math.round(hours / 24)}d`;
}

const shortId = (id: string) => `PA-${id.slice(-6).toUpperCase()}`;

/**
 * The DR 10 approval queue: requests on the left, the case on the right, a
 * decision at the bottom.
 *
 * A request here is a listing whose publisher priced it under the rate card's
 * floor. What the approver sees is the same arithmetic the gate ran — card
 * rate, floor, the number asked for — with the model's guardrails checked
 * against it and the decisions already made on the same card for comparison.
 *
 * E10-2: status, source and the listing are the server's cuts, and the
 * list is paged by the list contract — the counts on the chips are the
 * server's, taken with the status facet removed. The "similar closed
 * deals" are drawn from the page in hand, so they are the decided cases
 * the current filters show, not every decision ever made on the card.
 */
export function ApprovalsView({ page, settings, filters, onFiltersChange, onChanged }: ApprovalsViewProps) {
    // Null before hydration; ages and overdue states wait for the clock rather than guess.
    const now = useNow() ?? 0;
    const approvals = page.items;
    const [selectedId, setSelectedId] = React.useState<string | undefined>(
        approvals.find((approval) => approval.status === "PENDING")?.id ?? approvals[0]?.id
    );
    const [note, setNote] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    const visible = approvals;
    const selected = approvals.find((approval) => approval.id === selectedId) ?? visible[0];

    const count = (status: PriceApprovalStatus | "ALL") =>
        status === "ALL" ? Object.values(page.counts).reduce((sum, n) => sum + n, 0) : (page.counts[status] ?? 0);
    const pageCount = Math.max(1, Math.ceil(page.total / page.pageSize));

    async function decide(approve: boolean) {
        if (!selected) return;
        if (!approve && !note.trim()) {
            toast.error("Add a decision note before rejecting.");
            return;
        }
        setBusy(true);
        try {
            await rateCardService.decide(selected.id, approve, note.trim() || undefined);
            toast.success(`${shortId(selected.id)} ${approve ? "approved" : "rejected"}`, {
                description: approve
                    ? "The listing keeps the requested rate."
                    : selected.source === "CARD_REVISION"
                      ? "The listing comes off the market unless a running order holds it."
                      : "The listing stays unpublished until it is repriced.",
            });
            setNote("");
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not record the decision.");
        } finally {
            setBusy(false);
        }
    }

    const threshold = Number(settings.approvalThresholdPct);
    const ceiling = Number(settings.discountCeilingPct);

    const detail = selected
        ? (() => {
              const card = selected.cardRatePerDay ? Number(selected.cardRatePerDay) : null;
              const floor = selected.floorRatePerDay ? Number(selected.floorRatePerDay) : null;
              const requested = Number(selected.requestedRatePerDay);
              const pct = discountPct(selected);
              const floorPct = card && floor ? Math.round((floor / card) * 100) : null;
              const belowFloorBy = floor !== null && requested < floor ? floor - requested : 0;

              const facts: [string, string][] = [
                  ["Listing", selected.listingTitle ?? selected.listingId],
                  /* Lot E (Q67/Q97): who asked, and — on a card revision — the
                     clock the publisher was given. A rejection before that
                     date answers 409 GRACE_PERIOD_RUNNING. */
                  ["Source", APPROVAL_SOURCE_LABEL[selected.source] ?? selected.source],
                  ...(selected.source === "CARD_REVISION"
                      ? ([["Grace until", selected.graceUntil ? formatDate(selected.graceUntil) : "No grace set"]] as [string, string][])
                      : []),
                  ["Rate card", selected.rateCardId ? `Card ${selected.rateCardId.slice(-6).toUpperCase()}` : "None covers it"],
                  ["Requested rate", `${money(selected.requestedRatePerDay)} / day`],
                  ["Card rate", card !== null ? `${money(selected.cardRatePerDay)} / day` : "—"],
                  ["Requested on", formatDate(selected.createdAt)],
                  ["Reason", selected.reason ?? "None given"],
              ];
              if (selected.heldByRunningOrder) facts.push(["Held", "A running order stopped the rejection; decide again once it completes"]);
              if (selected.decidedAt) facts.push(["Decided on", formatDate(selected.decidedAt)]);
              if (selected.decisionNote) facts.push(["Decision note", selected.decisionNote]);

              const metrics: [string, string][] = [
                  ["Card rate", money(selected.cardRatePerDay)],
                  ["Floor", money(selected.floorRatePerDay)],
                  ["Requested", money(selected.requestedRatePerDay)],
                  ["Discount", pct === null ? "—" : `${pct.toFixed(1)}%`],
                  ["Below floor by", belowFloorBy > 0 ? formatINR(belowFloorBy) : "Not below"],
              ];

              const ruleTrace = [
                  { rule: "Card rate", effect: "—", running: money(selected.cardRatePerDay) },
                  {
                      rule: floorPct !== null ? `Floor (${floorPct}% of card)` : "Floor",
                      effect: floorPct !== null ? `× ${(floorPct / 100).toFixed(2)}` : "—",
                      running: money(selected.floorRatePerDay),
                  },
                  {
                      rule: "Requested rate",
                      effect: pct === null ? "—" : `−${pct.toFixed(1)}%`,
                      running: money(selected.requestedRatePerDay),
                  },
              ];

              const checks = [
                  {
                      name: "Above the floor",
                      ok: floor === null || requested >= floor,
                      detail:
                          floor === null
                              ? "No floor on this card"
                              : requested >= floor
                                ? `${money(selected.requestedRatePerDay)} clears the ${money(selected.floorRatePerDay)} floor`
                                : `${formatINR(belowFloorBy)} a day under the floor`,
                  },
                  {
                      name: `Within the ${threshold.toFixed(0)}% approval threshold`,
                      ok: pct !== null && pct < threshold,
                      detail: pct === null ? "No card rate to compare" : `${pct.toFixed(1)}% off the card rate`,
                  },
                  {
                      name: `Within the ${ceiling.toFixed(0)}% discount ceiling`,
                      ok: pct !== null && pct <= ceiling,
                      detail:
                          pct === null
                              ? "No card rate to compare"
                              : pct <= ceiling
                                ? "Inside the ceiling the model allows"
                                : "Past the ceiling — approving this sets a precedent",
                  },
                  {
                      name: "Reason given",
                      ok: Boolean(selected.reason?.trim()),
                      detail: selected.reason?.trim() ? "The requester explained the price" : "No reason on the request",
                  },
              ];

              const similar = approvals
                  .filter(
                      (other) =>
                          other.id !== selected.id &&
                          other.status !== "PENDING" &&
                          (selected.rateCardId ? other.rateCardId === selected.rateCardId : true)
                  )
                  .slice(0, 6);

              return { facts, metrics, ruleTrace, checks, similar };
          })()
        : null;

    return (
        <div className="space-y-5">
            <PageHeader
                title="Price approval queue"
                subtitle="Discounts below the floor or above guardrails wait here"
                actions={
                    <FilterChips<PriceApprovalStatus | "ALL">
                        chips={STATUS_CHIPS.map((chip) => ({ ...chip, count: count(chip.value) }))}
                        value={filters.status}
                        onChange={(status) => onFiltersChange({ status })}
                    />
                }
            />

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                    <Label htmlFor="pa-source" className="text-xs">
                        Source
                    </Label>
                    <Select value={filters.source} onValueChange={(source) => onFiltersChange({ source: source as PriceApprovalSource | "ALL" })}>
                        <SelectTrigger id="pa-source">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Any source</SelectItem>
                            {SOURCES.map((source) => (
                                <SelectItem key={source} value={source}>
                                    {APPROVAL_SOURCE_LABEL[source]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1">
                    <Label htmlFor="pa-listing" className="text-xs">
                        Listing id
                    </Label>
                    <Input
                        id="pa-listing"
                        value={filters.listingId}
                        placeholder="Exact id"
                        className="font-mono text-xs"
                        onChange={(event) => onFiltersChange({ listingId: event.target.value })}
                    />
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
                {/* Deal list */}
                <Card className="h-fit overflow-hidden rounded-lg border-border shadow-none">
                    {visible.length === 0 ? (
                        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                            {filters.status === "PENDING" && filters.source === "ALL" && !filters.listingId
                                ? "Nothing waiting. A request appears here when a publisher prices under the floor."
                                : "No request matches these filters."}
                        </p>
                    ) : (
                        <ul className="divide-y">
                            {visible.map((approval) => {
                                const active = approval.id === selected?.id;
                                const pct = discountPct(approval);
                                const impact =
                                    approval.cardRatePerDay !== null
                                        ? Number(approval.cardRatePerDay) - Number(approval.requestedRatePerDay)
                                        : null;
                                return (
                                    <li key={approval.id}>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedId(approval.id)}
                                            className={cn(
                                                "w-full px-4 py-3.5 text-left transition-colors",
                                                active ? "bg-primary/[0.04]" : "hover:bg-muted/50"
                                            )}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-xs text-muted-foreground">{shortId(approval.id)}</span>
                                                <StatusBadge status={STATUS_META[stateOf(approval, now)]} />
                                            </div>
                                            <p className="mt-0.5 truncate text-sm font-medium text-foreground">
                                                {approval.listingTitle ?? approval.listingId}
                                            </p>
                                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                                {APPROVAL_SOURCE_LABEL[approval.source] ?? approval.source}
                                                {approval.source === "CARD_REVISION" && approval.graceUntil
                                                    ? ` · grace until ${formatDate(approval.graceUntil)}`
                                                    : ""}
                                                {approval.heldByRunningOrder ? " · held by a running order" : ""}
                                            </p>
                                            <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                                                <span className="text-muted-foreground">
                                                    Discount {pct === null ? "—" : `${pct.toFixed(1)}%`}
                                                </span>
                                                <span className="font-medium text-danger">
                                                    {impact !== null && impact > 0 ? `−${formatINR(impact)} / day` : ""}
                                                </span>
                                                <span className="text-muted-foreground">{age(approval.createdAt, now)}</span>
                                            </div>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {page.total > page.pageSize && (
                        <div className="flex items-center justify-between gap-2 border-t px-4 py-2.5 text-xs text-muted-foreground">
                            <Button variant="outline" size="sm" className="h-7 bg-card" disabled={page.page <= 1} onClick={() => onFiltersChange({ page: page.page - 1 })}>
                                Previous
                            </Button>
                            <span className="tabular-nums">
                                Page {page.page} of {pageCount} · {page.total} request{page.total === 1 ? "" : "s"}
                            </span>
                            <Button variant="outline" size="sm" className="h-7 bg-card" disabled={page.page >= pageCount} onClick={() => onFiltersChange({ page: page.page + 1 })}>
                                Next
                            </Button>
                        </div>
                    )}
                </Card>

                {/* Deal detail */}
                {selected && detail && (
                    <div className="space-y-4 xl:col-span-2">
                        <Card className="rounded-lg border-border p-5 shadow-none">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div>
                                    <p className="text-xs text-muted-foreground">{shortId(selected.id)}</p>
                                    <h2 className="mt-0.5 text-lg font-semibold text-foreground">
                                        {selected.listingTitle ?? selected.listingId}
                                    </h2>
                                </div>
                                <StatusBadge status={STATUS_META[stateOf(selected, now)]} />
                            </div>
                            <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                                {detail.facts.map(([label, value]) => (
                                    <div key={label} className="flex items-start justify-between gap-4">
                                        <dt className="shrink-0 text-muted-foreground">{label}</dt>
                                        <dd className="text-right font-medium text-foreground">{value}</dd>
                                    </div>
                                ))}
                            </dl>
                            <div className="mt-4 grid grid-cols-2 gap-2 border-t pt-4 sm:grid-cols-5">
                                {detail.metrics.map(([label, value]) => (
                                    <div key={label} className="rounded-md bg-muted/60 px-2.5 py-2">
                                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                            {label}
                                        </p>
                                        <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{value}</p>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        <div className="grid gap-4 lg:grid-cols-2">
                            <Card className="overflow-hidden rounded-lg border-border shadow-none">
                                <h3 className="px-5 pb-3 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Rule trace
                                </h3>
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-y bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                            <th className="px-5 py-2">Rule</th>
                                            <th className="px-5 py-2 text-right">Effect</th>
                                            <th className="px-5 py-2 text-right">Running</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {detail.ruleTrace.map((trace) => (
                                            <tr key={trace.rule} className="border-b last:border-0">
                                                <td className="px-5 py-2.5 text-foreground">{trace.rule}</td>
                                                <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">
                                                    {trace.effect}
                                                </td>
                                                <td className="px-5 py-2.5 text-right font-medium tabular-nums">
                                                    {trace.running}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </Card>

                            <Card className="rounded-lg border-border p-5 shadow-none">
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Guardrail checks
                                </h3>
                                <ul className="mt-3 space-y-3">
                                    {detail.checks.map((check) => (
                                        <li key={check.name} className="flex items-start gap-2.5">
                                            <span
                                                className={cn(
                                                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                                                    check.ok ? "bg-success-soft" : "bg-danger-soft"
                                                )}
                                            >
                                                {check.ok ? (
                                                    <Check className="size-3 text-success" />
                                                ) : (
                                                    <X className="size-3 text-danger" />
                                                )}
                                            </span>
                                            <div>
                                                <p className="text-sm font-medium text-foreground">{check.name}</p>
                                                <p className="text-xs text-muted-foreground">{check.detail}</p>
                                            </div>
                                        </li>
                                    ))}
                                </ul>

                                <h3 className="mt-5 border-t pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Similar closed deals
                                </h3>
                                {detail.similar.length === 0 ? (
                                    <p className="mt-2 text-xs text-muted-foreground">
                                        No decided request on this card in the rows shown. Switch the status chip to Approved or Rejected to see the decisions.
                                    </p>
                                ) : (
                                    <table className="mt-2 w-full text-xs">
                                        <thead>
                                            <tr className="text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                                <th className="py-1.5">Listing</th>
                                                <th className="py-1.5 text-right">Discount</th>
                                                <th className="py-1.5 text-right">Closed</th>
                                                <th className="py-1.5 text-right">Outcome</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {detail.similar.map((deal) => {
                                                const pct = discountPct(deal);
                                                return (
                                                    <tr key={deal.id} className="border-t">
                                                        <td className="max-w-40 truncate py-2 font-medium text-foreground">
                                                            {deal.listingTitle ?? deal.listingId}
                                                        </td>
                                                        <td className="py-2 text-right">{pct === null ? "—" : `${pct.toFixed(1)}%`}</td>
                                                        <td className="py-2 text-right text-muted-foreground">
                                                            {deal.decidedAt ? formatDate(deal.decidedAt) : "—"}
                                                        </td>
                                                        <td className="py-2 text-right">
                                                            {deal.status === "APPROVED" ? "Approved" : "Rejected"}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </Card>
                        </div>

                        <Card className="rounded-lg border-border p-5 shadow-none">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Decision
                            </h3>
                            {selected.status === "PENDING" ? (
                                <>
                                    <Textarea
                                        value={note}
                                        onChange={(event) => setNote(event.target.value)}
                                        placeholder="Add a decision note for the deal record…"
                                        className="mt-3 min-h-20 resize-none"
                                    />
                                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                        <p className="text-xs text-muted-foreground">
                                            Requests waiting longer than 48 hours show as overdue.
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                className="bg-card text-danger hover:text-danger"
                                                disabled={busy}
                                                onClick={() => void decide(false)}
                                            >
                                                Reject discount
                                            </Button>
                                            <Button disabled={busy} onClick={() => void decide(true)}>
                                                Approve discount
                                            </Button>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <p className="mt-3 text-sm text-muted-foreground">
                                    {selected.status === "APPROVED" ? "Approved" : "Rejected"}
                                    {selected.decidedAt ? ` on ${formatDate(selected.decidedAt)}` : ""}
                                    {selected.decisionNote ? ` — “${selected.decisionNote}”` : "."}
                                </p>
                            )}
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
}
