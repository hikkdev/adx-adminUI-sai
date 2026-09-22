"use client";

import * as React from "react";
import Link from "next/link";
import { PhoneCall, PhoneOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/adx/empty-state";
import { FilterChips } from "@/components/adx/filter-chips";
import { PageHeader } from "@/components/adx/page-header";
import { SectionCard } from "@/components/adx/section-card";
import { SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { CALL_OUTCOME_LABEL, LEAD_SIDE_LABEL, outreachService, TEMPERATURE_META, temperatureMeta, type CallOutcome, type LeadSide, type LeadTemperature, type TeleRow } from "@/services/leads";
import type { TeleData, TeleFilter } from "./tele-queue-loader";

/** "Answered 2 d ago · 3 tries" — how the last call went, for the row. */
export function lastCallLine(row: Pick<TeleRow, "lastCall" | "attempts">): string {
    if (!row.lastCall) return row.attempts ? `${row.attempts} tries` : "Never called";
    const outcome = row.lastCall.outcome ? CALL_OUTCOME_LABEL[row.lastCall.outcome] : "Placed";
    return `${outcome} · ${formatDateTime(row.lastCall.at)}${row.attempts > 1 ? ` · ${row.attempts} tries` : ""}`;
}

/**
 * LH6: the tele-team's queue — cold leads with a number nobody holds,
 * hottest first. Call through ADX when telephony is set up (the lead sees
 * the masked number); log the call by hand when it is not; the callback
 * column shows what a missed call or the IVR asked for.
 */
export function TeleQueueView({ data, filter, onFilter, onChanged }: { data: TeleData; filter: TeleFilter; onFilter: (filter: TeleFilter) => void; onChanged: () => void }) {
    const [logging, setLogging] = React.useState<TeleRow | null>(null);
    const [q, setQ] = React.useState(filter.q);
    const canDial = Boolean(data.telephony?.configured);
    const pages = Math.max(1, Math.ceil(data.queue.total / data.queue.pageSize));

    async function dial(row: TeleRow) {
        try {
            const result = await outreachService.call(row.id);
            toast.success(`Ringing you — then ${row.businessName}`, { description: `They see ${result.maskedNumber}.${result.recording ? " Recorded after the consent line." : ""}` });
            onChanged();
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 503) {
                toast.error(cause.message);
                setLogging(row);
            } else toast.error(cause instanceof Error ? cause.message : "Could not place the call.");
        }
    }

    return (
        <div className="space-y-5" data-testid="tele-desk">
            <PageHeader
                title="Tele queue"
                subtitle="Cold leads with a number that nobody holds — the tele team's list, hottest first. A call that is answered is the first contact; a callback asked for by a missed call or the IVR shows here too."
                actions={
                    <StatusBadge status={canDial ? { label: `Calls via ${data.telephony?.provider ?? "ADX"}`, tone: "success" } : { label: "Calling not set up — log by hand", tone: "neutral" }} />
                }
            />
            <div className="flex flex-wrap items-center gap-3">
                <FilterChips
                    chips={(Object.keys(TEMPERATURE_META) as LeadTemperature[]).map((value) => ({ value, label: TEMPERATURE_META[value].label }))}
                    value={filter.temperature}
                    onChange={(value) => onFilter({ ...filter, temperature: value as LeadTemperature, page: 1 })}
                />
                <FilterChips
                    chips={[{ value: "ALL", label: "Both sides" }, ...(Object.keys(LEAD_SIDE_LABEL) as LeadSide[]).map((value) => ({ value, label: LEAD_SIDE_LABEL[value] }))]}
                    value={filter.side}
                    onChange={(value) => onFilter({ ...filter, side: value as LeadSide | "ALL", page: 1 })}
                />
                <form
                    className="flex items-center gap-2"
                    onSubmit={(event) => {
                        event.preventDefault();
                        onFilter({ ...filter, q: q.trim(), page: 1 });
                    }}
                >
                    <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Business, contact or number" className="h-8 w-56" data-testid="tele-search" />
                    <Button size="sm" variant="outline" type="submit">
                        Search
                    </Button>
                </form>
            </div>
            <SectionCard title={`${data.queue.total} ${data.queue.total === 1 ? "lead" : "leads"} to call`} description="Unclaimed, open, with a number. Hottest first, then the longest untouched.">
                {data.queue.items.length === 0 ? (
                    <EmptyState icon={PhoneOff} title="Nobody to call" description="Every lead of this temperature is either held by an agent or has no number." className="py-12" />
                ) : (
                    <SimpleTable<TeleRow>
                        rows={data.queue.items}
                        rowKey={(row) => row.id}
                        columns={[
                            {
                                key: "lead",
                                label: "Lead",
                                render: (row) => (
                                    <div>
                                        <Link href={`/leads/${row.id}`} className="font-medium text-primary hover:underline" data-testid={`tele-open-${row.id}`}>
                                            {row.businessName}
                                        </Link>
                                        <p className="text-xs text-muted-foreground">
                                            {LEAD_SIDE_LABEL[row.side]}
                                            {row.city ? ` · ${row.city}` : ""}
                                            {row.contactName ? ` · ${row.contactName}` : ""}
                                        </p>
                                    </div>
                                ),
                            },
                            { key: "phone", label: "Number", render: (row) => <span className="tabular-nums">{row.phone ?? "—"}</span> },
                            { key: "score", label: "Score", render: (row) => <StatusBadge status={{ label: `${temperatureMeta(row.temperature).label}${row.score !== null ? ` · ${row.score}` : ""}`, tone: temperatureMeta(row.temperature).tone }} /> },
                            { key: "last", label: "Last call", render: (row) => <span className="text-xs text-muted-foreground">{lastCallLine(row)}</span> },
                            { key: "callback", label: "Callback", render: (row) => (row.callbackDue ? <StatusBadge status={{ label: `Due ${formatDateTime(row.callbackDue)}`, tone: "warning" }} /> : <span className="text-xs text-muted-foreground">—</span>) },
                            {
                                key: "actions",
                                label: "",
                                className: "text-right",
                                render: (row) => (
                                    <div className="flex justify-end gap-1">
                                        {canDial ? (
                                            <Button size="sm" className="h-7" onClick={() => void dial(row)} data-testid={`tele-call-${row.id}`}>
                                                <PhoneCall className="mr-1 size-3" /> Call
                                            </Button>
                                        ) : null}
                                        <Button size="sm" variant="outline" className="h-7" onClick={() => setLogging(row)} data-testid={`tele-log-${row.id}`}>
                                            Log call
                                        </Button>
                                    </div>
                                ),
                            },
                        ]}
                    />
                )}
                {pages > 1 ? (
                    <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted-foreground">
                        <Button size="sm" variant="outline" disabled={filter.page <= 1} onClick={() => onFilter({ ...filter, page: filter.page - 1 })}>
                            Previous
                        </Button>
                        <span>
                            Page {data.queue.page} of {pages}
                        </span>
                        <Button size="sm" variant="outline" disabled={filter.page >= pages} onClick={() => onFilter({ ...filter, page: filter.page + 1 })}>
                            Next
                        </Button>
                    </div>
                ) : null}
            </SectionCard>
            <LogCallDialog row={logging} onOpenChange={(open) => (!open ? setLogging(null) : undefined)} onLogged={onChanged} />
        </div>
    );
}

function LogCallDialog({ row, onOpenChange, onLogged }: { row: TeleRow | null; onOpenChange: (open: boolean) => void; onLogged: () => void }) {
    const [outcome, setOutcome] = React.useState<CallOutcome>("ANSWERED");
    const [note, setNote] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    async function submit() {
        if (!row || busy) return;
        setBusy(true);
        try {
            await outreachService.logCall(row.id, { outcome, ...(note.trim() ? { note: note.trim() } : {}) });
            toast.success(`Logged — ${CALL_OUTCOME_LABEL[outcome].toLowerCase()}`);
            setNote("");
            onOpenChange(false);
            onLogged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not log the call.");
        } finally {
            setBusy(false);
        }
    }
    return (
        <Dialog open={row !== null} onOpenChange={onOpenChange}>
            <DialogContent data-testid="tele-log-dialog">
                <DialogHeader>
                    <DialogTitle>Log a call{row ? ` · ${row.businessName}` : ""}</DialogTitle>
                    <DialogDescription>{row?.phone ? `Dialled ${row.phone} from your own phone — what came of it.` : "What came of the call."}</DialogDescription>
                </DialogHeader>
                <div className="space-y-1.5">
                    <Label htmlFor="tele-outcome">Outcome</Label>
                    <Select value={outcome} onValueChange={(value) => setOutcome(value as CallOutcome)}>
                        <SelectTrigger id="tele-outcome" className="h-9" data-testid="tele-outcome">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {(Object.keys(CALL_OUTCOME_LABEL) as CallOutcome[]).map((value) => (
                                <SelectItem key={value} value={value}>
                                    {CALL_OUTCOME_LABEL[value]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="tele-note">Note</Label>
                    <Textarea id="tele-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What they said" />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button onClick={() => void submit()} disabled={busy} data-testid="tele-log-save">
                        {busy ? "Saving…" : "Log the call"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
