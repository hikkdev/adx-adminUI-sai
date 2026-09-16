"use client";

import * as React from "react";
import Link from "next/link";
import { Gavel, Printer, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { StatusBadge } from "@/components/adx/status-badge";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { useFeature } from "@/lib/use-feature";
import { cn } from "@/lib/utils";
import {
    AUTO_INVITE_RADIUS_KM,
    DEFAULT_QUOTE_WINDOW_HOURS,
    PRINT_JOB_LADDER,
    PRINT_JOB_STATUS_META,
    QUOTE_REQUEST_STATUS_META,
    QUOTE_STATUS_META,
    awardBody,
    awardNeedsNote,
    canApproveCost,
    canAward,
    canRequestQuotes,
    deadlineCountdown,
    defaultAward,
    defaultDeadline,
    nextJobStatuses,
    partnerMovesLine,
    printPartnerService,
    specsFromOrder,
    standingQuotes,
    type PrintJob,
    type PrintJobStatus,
    type PrintPartner,
    type PrintQuote,
    type PrintQuoteRequest,
} from "@/services/print-partners";
import type { Order } from "@/types";

/** An amount as the wire wants it: digits, optionally two decimal places. */
const AMOUNT = /^\d+(\.\d{1,2})?$/;

/** The order statuses a job may be opened against — `PRINTABLE_ORDER_STATUSES`. */
const PRINTABLE: Order["status"][] = [
    "PENDING_PRINT",
    "SELF_INSTALL",
    "PENDING_AGENT",
    "AGENT_REJECTED",
    "SLOT_PROPOSED",
    "SLOT_CONFIRMED",
    "IN_PROGRESS",
    "PENDING_OTP",
    "PENDING_APPROVAL",
    "COMPLETED",
];

/**
 * The print shop on this order (Lot B, B4b; Lot H, Q147).
 *
 * One job per order, opened at a partner on the roster once the publisher
 * has accepted — by hand, or by the **award** of a quote request: ops raise
 * the request with the specs, the partners in reach quote until the
 * deadline, the quotes read back ranked with the lowest marked, and the
 * award opens the job at the winner for the quoted price. The ladder is then
 * walked by the shop from the app (accept, printing, ready, handover by
 * scan) or entered by ops as it reports back — forward only, never back.
 * Approving the cost is the money: one movement into the partner's wallet,
 * net of TDS under 194C, keyed on the job so a second approval returns the
 * first.
 */
export function OrderPrintingCard({ order, onChanged }: { order: Order; onChanged?: () => void }) {
    const live = isLive("printPartners");
    const { can } = useAuth();
    const mayApprove = can("finance.approve");
    const quotesOn = useFeature("partners.quotes").enabled === true;

    const job = useApiResource<PrintJob | null>(`order:print-job:${order.id}:${order.status}:${live}`, () =>
        live ? printPartnerService.jobForOrder(order.id) : Promise.resolve(null),
    );
    const request = useApiResource<{
        latest: PrintQuoteRequest | null;
        readAt: Date;
    }>(`order:print-quote-request:${order.id}:${order.status}:${live}:${quotesOn}`, async () => ({
        latest: live && quotesOn ? await printPartnerService.quoteRequestForOrder(order.id).catch(() => null) : null,
        readAt: new Date(),
    }));
    const [requesting, setRequesting] = React.useState(false);

    if (!live) return null;

    const current = job.data;
    const latest = request.data?.latest ?? null;
    const readAt = request.data?.readAt ?? null;
    const canOpen = PRINTABLE.includes(order.status) && (current === null || current?.status === "CANCELLED");
    const reload = () => {
        job.reload();
        request.reload();
        onChanged?.();
    };

    return (
        <Card className="rounded-lg border-border p-5 shadow-none">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-base font-semibold text-foreground">Printing</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">The shop printing this order, what it quoted, and what ADX pays it.</p>
                </div>
                <Link href="/print-partners" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
                    Print partners
                </Link>
            </div>

            {job.error ? (
                <p className="mt-4 text-sm text-muted-foreground">{job.error}</p>
            ) : job.loading && current === null ? (
                <p className="mt-4 text-sm text-muted-foreground">Looking for the job…</p>
            ) : current && current.status !== "CANCELLED" ? (
                <JobPanel
                    orderId={order.id}
                    job={current}
                    awardedOn={latest?.status === "AWARDED" && latest.awardedQuoteId === current.awardedQuoteId ? latest : null}
                    mayApprove={mayApprove}
                    onChanged={reload}
                />
            ) : latest && latest.status === "OPEN" ? (
                <QuoteRequestPanel
                    orderId={order.id}
                    request={latest}
                    readAt={readAt}
                    declined={current?.status === "CANCELLED" ? current : null}
                    onChanged={reload}
                />
            ) : (
                <div className="mt-4 space-y-4">
                    {current?.status === "CANCELLED" && (
                        <p className="text-sm text-muted-foreground">
                            The previous job at this order was cancelled
                            {current.declineReason ? ` — the shop declined: ${current.declineReason}` : current.notes ? ` — ${current.notes}` : ""}.
                            Opening a new one reopens it at the partner named now.
                        </p>
                    )}
                    {latest && latest.status !== "OPEN" && (
                        <p className="text-sm text-muted-foreground">
                            The last quote request {QUOTE_REQUEST_STATUS_META[latest.status].label.toLowerCase()}
                            {latest.status === "EXPIRED"
                                ? ` on ${formatDateTime(latest.deadlineAt)} with nobody quoting${latest.reinvitedAt ? ", after one re-invite" : ""}`
                                : latest.status === "AWARDED"
                                  ? ` ${formatDateTime(latest.updatedAt)}, and the job it opened was cancelled`
                                  : ""}
                            . Raise another, or name a shop.
                        </p>
                    )}
                    {canOpen ? (
                        <>
                            {quotesOn && (
                                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/30 p-4">
                                    <div className="flex items-start gap-3">
                                        <Gavel className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" strokeWidth={1.5} />
                                        <div>
                                            <p className="text-sm font-medium text-foreground">Ask the partners in reach to quote</p>
                                            <p className="text-xs text-muted-foreground">
                                                The active shops taking requests in {order.city ?? "the order's city"} or within{" "}
                                                {AUTO_INVITE_RADIUS_KM} km, rate-card partners first, quote until the deadline (
                                                {DEFAULT_QUOTE_WINDOW_HOURS} h by default). The lowest is awarded unless you say why not.
                                            </p>
                                        </div>
                                    </div>
                                    <Button disabled={!canRequestQuotes(latest)} onClick={() => setRequesting(true)}>
                                        Request quotes
                                    </Button>
                                </div>
                            )}
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                {quotesOn ? "Or name a shop" : "Name a shop"}
                            </p>
                            <OpenJobForm orderId={order.id} onOpened={reload} />
                        </>
                    ) : (
                        <div className="flex items-start gap-3">
                            <Printer className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" strokeWidth={1.5} />
                            <p className="text-sm text-muted-foreground">
                                No print job on this order. One can be opened once the publisher has accepted it — not before, and not after it is
                                cancelled.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {quotesOn && <RequestQuotesDialog open={requesting} onOpenChange={setRequesting} order={order} onRaised={reload} />}
        </Card>
    );
}

/* ------------------------------------------------------------------ */
/* Lot H: raising a quote request                                      */
/* ------------------------------------------------------------------ */

interface SpecLine {
    key: string;
    value: string;
}

/** ISO → what `<input type="datetime-local">` holds, in the browser's zone. */
function toLocalInput(iso: string): string {
    const date = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function RequestQuotesDialog({
    open,
    onOpenChange,
    order,
    onRaised,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    order: Order;
    onRaised: () => void;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Request quotes</DialogTitle>
                    <DialogDescription>
                        The specs go to every invited shop; each quotes a price and a turnaround, sealed from the others, until the deadline. The
                        lowest is awarded unless you name another with a note.
                    </DialogDescription>
                </DialogHeader>
                {/* Mounted with the content, so the form starts fresh — prefilled from the order — on every open. */}
                <RequestQuotesForm order={order} onClose={() => onOpenChange(false)} onRaised={onRaised} />
            </DialogContent>
        </Dialog>
    );
}

function RequestQuotesForm({ order, onClose, onRaised }: { order: Order; onClose: () => void; onRaised: () => void }) {
    /* Prefilled from the order: the spot's size and material, the artwork. */
    const [lines, setLines] = React.useState<SpecLine[]>(() => {
        const prefilled = Object.entries(specsFromOrder(order)).map(([key, value]) => ({ key, value: String(value) }));
        return prefilled.length ? prefilled : [{ key: "size", value: "" }];
    });
    const [notes, setNotes] = React.useState("");
    /* The clock the deadline is checked against — when the form opened; the backend checks again on submit. */
    const [openedAt] = React.useState(() => Date.now());
    const [deadline, setDeadline] = React.useState(() => toLocalInput(defaultDeadline(new Date(openedAt))));
    const [mode, setMode] = React.useState<"AUTO" | "PICK">("AUTO");
    const [picked, setPicked] = React.useState<string[]>([]);
    const [busy, setBusy] = React.useState(false);
    const [reachHint, setReachHint] = React.useState<string | null>(null);

    const partners = useApiResource<PrintPartner[]>("print-partners:active", async () => {
        const page = await printPartnerService.list({
            active: true,
            pageSize: 100,
        });
        return page.items;
    });

    const specs = React.useMemo(() => {
        const out: Record<string, string> = {};
        for (const line of lines) {
            const key = line.key.trim();
            const value = line.value.trim();
            if (key && value) out[key] = value;
        }
        if (notes.trim()) out.notes = notes.trim();
        return out;
    }, [lines, notes]);

    const deadlineIso = deadline ? new Date(deadline).toISOString() : undefined;
    const deadlineOk = !deadline || new Date(deadline).getTime() > openedAt;
    const valid = Object.keys(specs).length > 0 && deadlineOk && (mode === "AUTO" || picked.length > 0);

    async function raise() {
        setBusy(true);
        try {
            const created = await printPartnerService.requestQuotes(order.id, {
                specs,
                ...(deadlineIso ? { deadlineAt: deadlineIso } : {}),
                invite: mode === "AUTO" ? "AUTO" : picked,
            });
            toast.success(`${created.invited.length} partner${created.invited.length === 1 ? "" : "s"} asked to quote`, {
                description: `${created.invited.map((partner) => partner.name).join(", ")} — until ${formatDateTime(created.deadlineAt)}.`,
            });
            onClose();
            onRaised();
        } catch (cause) {
            if (cause instanceof ApiError && cause.code === "NO_PARTNERS_IN_REACH") {
                setReachHint(cause.message);
                setMode("PICK");
            } else {
                toast.error(cause instanceof Error ? cause.message : "The request did not reach ADX.");
            }
        } finally {
            setBusy(false);
        }
    }

    const roster = partners.data ?? [];

    return (
        <>
            <div className="space-y-4">
                <div className="space-y-1.5">
                    <Label>Specs</Label>
                    <div className="space-y-2">
                        {lines.map((line, index) => (
                            <div key={index} className="flex items-center gap-2">
                                <Input
                                    value={line.key}
                                    onChange={(event) =>
                                        setLines((prev) => prev.map((row, i) => (i === index ? { ...row, key: event.target.value } : row)))
                                    }
                                    placeholder="size"
                                    className="w-32"
                                    aria-label={`Spec ${index + 1} name`}
                                />
                                <Input
                                    value={line.value}
                                    onChange={(event) =>
                                        setLines((prev) => prev.map((row, i) => (i === index ? { ...row, value: event.target.value } : row)))
                                    }
                                    placeholder="10 x 20 ft"
                                    aria-label={`Spec ${index + 1} value`}
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                                    disabled={lines.length === 1}
                                    aria-label="Remove spec"
                                >
                                    ×
                                </Button>
                            </div>
                        ))}
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="bg-card"
                        onClick={() => setLines((prev) => [...prev, { key: "", value: "" }])}
                    >
                        Add a line
                    </Button>
                    <p className="text-xs text-muted-foreground">
                        Prefilled from the spot — its size, category and placement — and the artwork the advertiser attached. Add the material,
                        quantity, finish.
                    </p>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="quote-notes">Notes to the shops</Label>
                    <Textarea
                        id="quote-notes"
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        rows={2}
                        maxLength={1000}
                        placeholder="Optional."
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="quote-deadline">Quotes close</Label>
                    <Input
                        id="quote-deadline"
                        type="datetime-local"
                        value={deadline}
                        onChange={(event) => setDeadline(event.target.value)}
                        aria-invalid={!deadlineOk || undefined}
                    />
                    <p className="text-xs text-muted-foreground">
                        {deadlineOk
                            ? `${DEFAULT_QUOTE_WINDOW_HOURS} hours by default. A request nobody answers is re-invited once, then expires.`
                            : "The deadline has to be in the future."}
                    </p>
                </div>
                <div className="space-y-2">
                    <Label>Who is asked</Label>
                    <RadioGroup value={mode} onValueChange={(value) => setMode(value as "AUTO" | "PICK")} className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 text-sm">
                            <RadioGroupItem value="AUTO" id="invite-auto" />
                            Everyone in reach
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <RadioGroupItem value="PICK" id="invite-pick" />
                            Partners I pick
                        </label>
                    </RadioGroup>
                    {reachHint && <p className="text-xs text-danger">{reachHint}</p>}
                    {mode === "AUTO" ? (
                        <p className="text-xs text-muted-foreground">
                            Active shops taking requests in {order.city ?? "the order's city"} or within {AUTO_INVITE_RADIUS_KM} km of the site,
                            rate-card partners first.
                        </p>
                    ) : (
                        <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                            {partners.loading && roster.length === 0 ? (
                                <p className="p-2 text-xs text-muted-foreground">Loading the roster…</p>
                            ) : roster.length === 0 ? (
                                <p className="p-2 text-xs text-muted-foreground">Nobody is on the roster.</p>
                            ) : (
                                roster.map((partner) => {
                                    const checked = picked.includes(partner.id);
                                    return (
                                        <label
                                            key={partner.id}
                                            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                                        >
                                            <Checkbox
                                                checked={checked}
                                                onCheckedChange={(state) =>
                                                    setPicked((prev) =>
                                                        state === true ? [...prev, partner.id] : prev.filter((id) => id !== partner.id),
                                                    )
                                                }
                                            />
                                            <span className="min-w-0 flex-1 truncate">
                                                {partner.name}
                                                {partner.city ? <span className="text-muted-foreground"> · {partner.city}</span> : null}
                                            </span>
                                            {partner.rateCard.hasRateCard && <StatusBadge status={{ label: "Rate card", tone: "success" }} />}
                                            {!partner.acceptsQuoteRequests && <StatusBadge status={{ label: "No requests", tone: "neutral" }} />}
                                        </label>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button onClick={() => void raise()} disabled={busy || !valid}>
                    {busy ? "Sending…" : "Send the request"}
                </Button>
            </DialogFooter>
        </>
    );
}

/* ------------------------------------------------------------------ */
/* Lot H: the request, the quotes, the award                           */
/* ------------------------------------------------------------------ */

function QuoteRequestPanel({
    orderId,
    request,
    readAt,
    declined,
    onChanged,
}: {
    orderId: string;
    request: PrintQuoteRequest;
    /** When the request was read — the clock the countdown runs from. */
    readAt: Date | null;
    /** The CANCELLED job behind a reopened request — the shop that declined, with its reason. */
    declined: PrintJob | null;
    onChanged: () => void;
}) {
    const [awarding, setAwarding] = React.useState(false);
    const countdown = deadlineCountdown(request.deadlineAt, readAt ?? new Date(request.updatedAt));
    const standing = standingQuotes(request);
    const lowest = defaultAward(request);
    const decided = request.quotes.filter((quote) => quote.status !== "SUBMITTED");

    return (
        <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                        Out for quotes — {request.invitedPartnerIds.length} shop
                        {request.invitedPartnerIds.length === 1 ? "" : "s"} asked
                        {request.inviteMode === "AUTO" ? " (everyone in reach)" : " (named)"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Quotes close {formatDateTime(request.deadlineAt)} ·{" "}
                        <span className={cn(countdown.passed && "text-danger")}>{countdown.label}</span>
                        {request.reinvitedAt ? ` · re-invited ${formatDateTime(request.reinvitedAt)}` : ""}
                        {" · raised "}
                        {formatDateTime(request.createdAt)}
                    </p>
                </div>
                <StatusBadge status={QUOTE_REQUEST_STATUS_META[request.status]} />
            </div>

            {declined?.declineReason && (
                <p className="rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-foreground">
                    {declined.partner?.name ?? "The awarded shop"} declined the job
                    {declined.partnerDeclinedAt ? ` on ${formatDateTime(declined.partnerDeclinedAt)}` : ""}: {declined.declineReason}. The request is
                    open again for the others.
                </p>
            )}

            <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {Object.entries(request.specs)
                    .filter(([, value]) => typeof value === "string" || typeof value === "number")
                    .map(([key, value]) => (
                        <div key={key} className="flex gap-1">
                            <dt>{key}</dt>
                            <dd className="text-foreground">{String(value)}</dd>
                        </div>
                    ))}
            </dl>

            {standing.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    {countdown.passed
                        ? "Nobody quoted before the deadline. The nightly job re-invites once, then the request expires and a shop can be named."
                        : "No quote yet. The shops asked see the specs and the deadline in the app."}
                </p>
            ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                    {standing.map((quote) => (
                        <QuoteRow key={quote.id} quote={quote} lowest={quote.id === lowest?.id} />
                    ))}
                </ul>
            )}

            {decided.length > 0 && (
                <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">
                        {decided.length} quote{decided.length === 1 ? "" : "s"} no longer standing
                    </summary>
                    <ul className="mt-2 divide-y divide-border rounded-md border border-border">
                        {decided.map((quote) => (
                            <QuoteRow key={quote.id} quote={quote} lowest={false} />
                        ))}
                    </ul>
                </details>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                    {lowest
                        ? `The award takes ${lowest.partner.name}'s ${formatMoney(lowest.amount)} unless another is named with a note. A past deadline closes quoting, not deciding.`
                        : "The award needs at least one standing quote."}
                </p>
                <Button disabled={!canAward(request)} onClick={() => setAwarding(true)}>
                    <Trophy className="mr-1.5 size-4" />
                    Award
                </Button>
            </div>

            <AwardDialog open={awarding} onOpenChange={setAwarding} orderId={orderId} request={request} onAwarded={onChanged} />
        </div>
    );
}

function QuoteRow({ quote, lowest }: { quote: PrintQuote; lowest: boolean }) {
    return (
        <li className={cn("flex flex-wrap items-center gap-3 px-3 py-2.5", lowest && "bg-success-soft")}>
            <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
                    <Link href={`/print-partners/${quote.partner.id}`} className="underline-offset-4 hover:underline">
                        {quote.partner.name}
                    </Link>
                    {quote.partner.hasRateCard && <StatusBadge status={{ label: "Rate card", tone: "success" }} />}
                    {lowest && <StatusBadge status={{ label: "Lowest", tone: "success" }} />}
                    {!quote.partner.isActive && <StatusBadge status={{ label: "Off the roster", tone: "neutral" }} />}
                </p>
                <p className="text-xs text-muted-foreground">
                    {[quote.partner.city, `${quote.turnaroundDays}-day turnaround`, `quoted ${formatDateTime(quote.submittedAt)}`]
                        .filter(Boolean)
                        .join(" · ")}
                    {quote.note ? ` · ${quote.note}` : ""}
                </p>
            </div>
            <p className={cn("text-sm tabular-nums", lowest ? "font-semibold text-foreground" : "text-foreground")}>{formatMoney(quote.amount)}</p>
            {quote.status !== "SUBMITTED" && <StatusBadge status={QUOTE_STATUS_META[quote.status]} />}
        </li>
    );
}

function AwardDialog({
    open,
    onOpenChange,
    orderId,
    request,
    onAwarded,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    orderId: string;
    request: PrintQuoteRequest;
    onAwarded: () => void;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Award the print job</DialogTitle>
                    <DialogDescription>
                        The lowest quote is picked for you. Naming another needs a note saying why — it is kept on the audit row.
                    </DialogDescription>
                </DialogHeader>
                {/* Mounted with the content, so the pick starts at the lowest on every open. */}
                <AwardForm orderId={orderId} request={request} onClose={() => onOpenChange(false)} onAwarded={onAwarded} />
            </DialogContent>
        </Dialog>
    );
}

function AwardForm({
    orderId,
    request,
    onClose,
    onAwarded,
}: {
    orderId: string;
    request: PrintQuoteRequest;
    onClose: () => void;
    onAwarded: () => void;
}) {
    const lowest = defaultAward(request);
    const [quoteId, setQuoteId] = React.useState<string | null>(lowest?.id ?? null);
    const [note, setNote] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [refused, setRefused] = React.useState<string | null>(null);

    const needsNote = awardNeedsNote(request, quoteId);
    const body = awardBody(request, quoteId, note);
    const chosen = standingQuotes(request).find((quote) => quote.id === quoteId) ?? null;

    async function award() {
        if (!body) return;
        setBusy(true);
        try {
            const result = await printPartnerService.award(orderId, body);
            toast.success(`Awarded to ${result.quote.partner.name} at ${formatMoney(result.quote.amount)}`, {
                description: result.overridden
                    ? "Not the lowest — your note is on the audit row. The job is open; the shop is told, the others are told they were passed over."
                    : "The job is open at the quoted price; the shop is told, the others are told they were passed over.",
            });
            onClose();
            onAwarded();
        } catch (cause) {
            if (cause instanceof ApiError && cause.code === "NOTE_REQUIRED") setRefused(cause.message);
            else toast.error(cause instanceof Error ? cause.message : "The award did not go through.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <div className="space-y-4">
                <RadioGroup value={quoteId ?? ""} onValueChange={setQuoteId} className="space-y-2">
                    {standingQuotes(request).map((quote) => (
                        <label
                            key={quote.id}
                            className={cn(
                                "flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 text-sm",
                                quote.id === lowest?.id && "border-success/40 bg-success-soft",
                            )}
                        >
                            <RadioGroupItem value={quote.id} id={`award-${quote.id}`} />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium text-foreground">
                                    {quote.partner.name}
                                    {quote.id === lowest?.id ? " · lowest" : ""}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                    {quote.turnaroundDays}-day turnaround
                                    {quote.partner.hasRateCard ? " · rate card" : ""}
                                </span>
                            </span>
                            <span className="tabular-nums text-foreground">{formatMoney(quote.amount)}</span>
                        </label>
                    ))}
                </RadioGroup>
                {needsNote && (
                    <div className="space-y-1.5">
                        <Label htmlFor="award-note">Why not the lowest?</Label>
                        <Textarea
                            id="award-note"
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            rows={2}
                            maxLength={500}
                            placeholder={
                                lowest
                                    ? `${lowest.partner.name} quoted ${formatMoney(lowest.amount)}; say why ${chosen?.partner.name ?? "this shop"} instead.`
                                    : ""
                            }
                            aria-invalid={note.trim().length > 0 && note.trim().length < 3 ? true : undefined}
                        />
                        <p className="text-xs text-muted-foreground">
                            Required — at least three characters. Kept on the PRINT_QUOTE_AWARDED audit row.
                        </p>
                    </div>
                )}
                {refused && <p className="text-xs text-danger">{refused}</p>}
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button onClick={() => void award()} disabled={busy || !body}>
                    {busy ? "Awarding…" : chosen ? `Award ${formatMoney(chosen.amount)}` : "Award"}
                </Button>
            </DialogFooter>
        </>
    );
}

/* ------------------------------------------------------------------ */
/* Opening a job                                                       */
/* ------------------------------------------------------------------ */

function OpenJobForm({ orderId, onOpened }: { orderId: string; onOpened: () => void }) {
    const partners = useApiResource<PrintPartner[]>("print-partners:active", async () => {
        const page = await printPartnerService.list({
            active: true,
            pageSize: 100,
        });
        return page.items;
    });
    const [partnerId, setPartnerId] = React.useState("");
    const [quotedCost, setQuotedCost] = React.useState("");
    const [notes, setNotes] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    const costValid = quotedCost.trim() === "" || AMOUNT.test(quotedCost.trim());

    async function open() {
        setBusy(true);
        try {
            await printPartnerService.openJob(orderId, {
                printPartnerId: partnerId,
                quotedCost: quotedCost.trim() || null,
                notes: notes.trim() || null,
            });
            toast.success("Print job opened", {
                description: "The shop is on the order; record its progress as it reports back.",
            });
            setPartnerId("");
            setQuotedCost("");
            setNotes("");
            onOpened();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not open the job.");
        } finally {
            setBusy(false);
        }
    }

    const roster = partners.data ?? [];

    return (
        <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="print-partner">Print partner</Label>
                <Select value={partnerId} onValueChange={setPartnerId}>
                    <SelectTrigger id="print-partner">
                        <SelectValue placeholder={partners.loading ? "Loading the roster…" : "Choose a shop on the roster"} />
                    </SelectTrigger>
                    <SelectContent>
                        {roster.map((partner) => (
                            <SelectItem key={partner.id} value={partner.id}>
                                {partner.name}
                                {partner.city ? ` · ${partner.city}` : ""}
                                {partner.turnaroundDays !== null ? ` · ${partner.turnaroundDays}d` : ""}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {!partners.loading && roster.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                        Nobody is on the roster.{" "}
                        <Link href="/print-partners/roster" className="underline underline-offset-4">
                            Add a print partner
                        </Link>{" "}
                        first.
                    </p>
                )}
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="print-quoted">Quoted cost</Label>
                <Input
                    id="print-quoted"
                    inputMode="decimal"
                    value={quotedCost}
                    onChange={(event) => setQuotedCost(event.target.value)}
                    placeholder="Optional"
                    className="tabular-nums"
                    aria-invalid={!costValid || undefined}
                />
            </div>
            <div className="space-y-1.5 sm:col-span-3">
                <Label htmlFor="print-notes">Notes for the record</Label>
                <Textarea
                    id="print-notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={2}
                    placeholder="Sizes, material, anything agreed with the shop. Optional."
                />
            </div>
            <div className="flex justify-end sm:col-span-3">
                <Button disabled={busy || !partnerId || !costValid} onClick={() => void open()}>
                    {busy ? "Opening…" : "Open print job"}
                </Button>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* The job                                                             */
/* ------------------------------------------------------------------ */

function JobPanel({
    orderId,
    job,
    awardedOn,
    mayApprove,
    onChanged,
}: {
    orderId: string;
    job: PrintJob;
    /** Lot H: the request this job was awarded on, when it was — its winning quote and the override note. */
    awardedOn: PrintQuoteRequest | null;
    mayApprove: boolean;
    onChanged: () => void;
}) {
    const [actualCost, setActualCost] = React.useState(job.actualCost ?? "");
    const [busy, setBusy] = React.useState(false);
    const [moving, setMoving] = React.useState<PrintJobStatus | null>(null);
    const [approving, setApproving] = React.useState(false);

    const reached = PRINT_JOB_LADDER.indexOf(job.status);
    const next = nextJobStatuses(job);
    const locked = job.costApprovedAt !== null;
    const winning = awardedOn?.quotes.find((quote) => quote.id === awardedOn.awardedQuoteId) ?? null;
    const moves = partnerMovesLine(job);
    const costDirty = actualCost.trim() !== (job.actualCost ?? "");
    const costValid = actualCost.trim() === "" || AMOUNT.test(actualCost.trim());

    async function run(label: string, action: () => Promise<unknown>, description?: string) {
        setBusy(true);
        try {
            await action();
            toast.success(label, description ? { description } : undefined);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "That did not go through.");
        } finally {
            setBusy(false);
            setMoving(null);
            setApproving(false);
        }
    }

    return (
        <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                        {job.partner ? (
                            <Link href={`/print-partners/${job.partner.id}`} className="underline-offset-4 hover:underline">
                                {job.partner.name}
                            </Link>
                        ) : (
                            <Link href={`/print-partners/${job.printPartnerId}`} className="underline-offset-4 hover:underline">
                                Print partner
                            </Link>
                        )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {[job.partner?.contactName, job.partner?.mobile, job.partner?.address, job.partner?.city].filter(Boolean).join(" · ") ||
                            "The agent collects from this shop."}
                    </p>
                </div>
                <StatusBadge status={PRINT_JOB_STATUS_META[job.status]} />
            </div>

            {/* The ladder, forward only. */}
            <ol className="flex flex-wrap items-center gap-2">
                {PRINT_JOB_LADDER.map((rung, index) => (
                    <li
                        key={rung}
                        className={cn(
                            "rounded-full border px-2.5 py-0.5 text-xs",
                            index <= reached ? "border-success/40 bg-success-soft text-foreground" : "text-muted-foreground",
                        )}
                    >
                        {PRINT_JOB_STATUS_META[rung].label}
                    </li>
                ))}
            </ol>

            {(job.awardedQuoteId || moves) && (
                <div className="space-y-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    {job.awardedQuoteId && (
                        <p>
                            <Trophy className="mr-1 inline size-3.5 align-[-2px]" />
                            Awarded on a quote
                            {winning ? ` — ${formatMoney(winning.amount)}, ${winning.turnaroundDays}-day turnaround` : ""}
                            {awardedOn?.awardNote ? ` · not the lowest: ${awardedOn.awardNote}` : ""}
                            {awardedOn
                                ? ` · ${standingQuotes(awardedOn).length + awardedOn.quotes.filter((q) => q.status !== "SUBMITTED").length} quotes in`
                                : ""}
                        </p>
                    )}
                    {moves && (
                        <p>
                            From the app: {moves}
                            {job.handoverConfirmedAt
                                ? ` (${formatDateTime(job.handoverConfirmedAt)})`
                                : job.partnerAcceptedAt
                                  ? ` (${formatDateTime(job.partnerAcceptedAt)})`
                                  : ""}
                        </p>
                    )}
                </div>
            )}

            <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div>
                    <dt className="text-xs text-muted-foreground">Quoted</dt>
                    <dd className="tabular-nums text-foreground">{formatMoney(job.quotedCost)}</dd>
                </div>
                <div>
                    <dt className="text-xs text-muted-foreground">Requested</dt>
                    <dd className="text-foreground">{formatDate(job.requestedAt)}</dd>
                </div>
                <div>
                    <dt className="text-xs text-muted-foreground">{job.collectedAt ? "Collected" : job.readyAt ? "Ready since" : "Ready"}</dt>
                    <dd className="text-foreground">
                        {job.collectedAt ? formatDate(job.collectedAt) : job.readyAt ? formatDate(job.readyAt) : "Not yet"}
                    </dd>
                </div>
            </dl>

            <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                    <Label htmlFor="print-actual">Actual cost</Label>
                    <div className="flex items-center gap-2">
                        <Input
                            id="print-actual"
                            inputMode="decimal"
                            value={actualCost}
                            onChange={(event) => setActualCost(event.target.value)}
                            placeholder="What the shop billed"
                            className="tabular-nums"
                            disabled={locked || busy}
                            aria-invalid={!costValid || undefined}
                        />
                        {!locked && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="bg-card"
                                disabled={busy || !costDirty || !costValid}
                                onClick={() =>
                                    void run("Cost recorded", () =>
                                        printPartnerService.updateJob(orderId, {
                                            actualCost: actualCost.trim() || null,
                                        }),
                                    )
                                }
                            >
                                Save
                            </Button>
                        )}
                    </div>
                    {locked && (
                        <p className="text-xs text-muted-foreground">
                            Approved {job.costApprovedAt ? formatDate(job.costApprovedAt) : ""} and locked — the number that was paid is the number. A
                            wrong one is reversed from the ledger, never edited.
                        </p>
                    )}
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="print-move">Move to</Label>
                    <Select value="" onValueChange={(value) => setMoving(value as PrintJobStatus)} disabled={busy || next.length === 0}>
                        <SelectTrigger id="print-move">
                            <SelectValue placeholder={next.length ? "As the shop reports back" : "Nothing further"} />
                        </SelectTrigger>
                        <SelectContent>
                            {next.map((rung) => (
                                <SelectItem key={rung} value={rung}>
                                    {PRINT_JOB_STATUS_META[rung].label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex items-end justify-end">
                    <Button
                        disabled={busy || locked || !canApproveCost(job) || !mayApprove}
                        title={
                            !mayApprove
                                ? "Needs the finance.approve permission."
                                : locked
                                  ? "Already approved."
                                  : !canApproveCost(job)
                                    ? "Needs the job READY or COLLECTED with an actual cost above zero."
                                    : undefined
                        }
                        onClick={() => setApproving(true)}
                    >
                        {locked ? "Cost approved" : "Approve cost"}
                    </Button>
                </div>
            </div>

            <ConfirmDialog
                open={moving !== null}
                onOpenChange={(open) => !open && setMoving(null)}
                title={
                    moving === "CANCELLED"
                        ? "Cancel this print job?"
                        : `Mark the job ${PRINT_JOB_STATUS_META[moving ?? "REQUESTED"].label.toLowerCase()}?`
                }
                description={
                    moving === "CANCELLED"
                        ? "The job moves nowhere after this; a new one has to be opened. Nothing is paid."
                        : "Forward only. A rung may be skipped and never walked back — a job that was ready and is printing again is two jobs and a reason, not an edit."
                }
                confirmLabel={moving === "CANCELLED" ? "Cancel job" : "Move"}
                destructive={moving === "CANCELLED"}
                busy={busy}
                onConfirm={() =>
                    moving &&
                    void run(`Job ${PRINT_JOB_STATUS_META[moving].label.toLowerCase()}`, () =>
                        printPartnerService.updateJob(orderId, { status: moving }),
                    )
                }
            />

            <ConfirmDialog
                open={approving}
                onOpenChange={setApproving}
                title="Approve the print cost?"
                description={`${formatMoney(job.actualCost)} is posted to the partner's wallet net of TDS under 194C, against cost of sales. One movement, keyed on the job: a second approval returns the first. The wallet then holds net-of-tax money and the withdrawal deducts nothing.`}
                confirmLabel="Approve and pay into the wallet"
                busy={busy}
                onConfirm={() =>
                    void run(
                        "Print cost approved",
                        async () => {
                            const approval = await printPartnerService.approveCost(orderId);
                            return approval;
                        },
                        "Net of TDS, into the partner's wallet. Raise its withdrawal from the partner page.",
                    )
                }
            />
        </div>
    );
}
