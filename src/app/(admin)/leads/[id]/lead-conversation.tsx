"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Phone, PhoneCall, Play, Send, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/adx/status-badge";
import { fetchPrivateBlob } from "@/components/adx/private-file";
import { ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import {
    CALL_OUTCOME_LABEL,
    channelLabel,
    MANUAL_CHANNELS,
    MESSAGE_STATUS_LABEL,
    messagePreview,
    messageTone,
    OUTREACH_CHANNELS,
    outreachService,
    REACH_MODE_LABEL,
    runLine,
    type CallOutcome,
    type ChannelState,
    type LeadDetail,
    type LeadMessage,
    type LeadThread,
    type MessageDirection,
    type OutreachChannel,
} from "@/services/leads";

/**
 * LH6: the unified conversation on a lead — every message on every
 * channel in one thread, the composer that offers only the channels that
 * would go (and says why the rest would not), click-to-call with the
 * recording player, a touch logged by hand, and the sequence the lead is
 * walking.
 */
export function LeadConversation({ lead, onChanged }: { lead: LeadDetail; onChanged: () => void }) {
    const resource = useApiResource<LeadThread>(`lead:${lead.id}:thread`, () => outreachService.thread(lead.id));
    const thread = resource.data;
    const [logging, setLogging] = React.useState<"touch" | "call" | null>(null);
    const closed = lead.status === "CONVERTED" || lead.status === "LOST";

    const reload = () => {
        resource.reload();
        onChanged();
    };

    return (
        <Card className="rounded-lg border-border p-5 shadow-none" data-testid="lead-conversation">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-foreground">Conversation</h3>
                {!closed && thread ? (
                    <div className="flex items-center gap-2">
                        <CallButton lead={lead} channels={thread.channels} onLogInstead={() => setLogging("call")} onPlaced={reload} />
                        <Button size="sm" variant="outline" onClick={() => setLogging("touch")} data-testid="lead-log-touch">
                            Log a touch
                        </Button>
                    </div>
                ) : null}
            </div>

            {resource.loading && !thread ? (
                <p className="mt-3 text-sm text-muted-foreground">Reading the thread…</p>
            ) : resource.error ? (
                <p className="mt-3 text-sm text-danger">{resource.error}</p>
            ) : thread ? (
                <div className="mt-4 space-y-4">
                    <SequenceLine lead={lead} thread={thread} closed={closed} onChanged={reload} />
                    <Thread messages={thread.messages} />
                    {!closed ? <Composer lead={lead} channels={thread.channels} onSent={reload} /> : null}
                </div>
            ) : null}

            <TouchDialog leadId={lead.id} open={logging === "touch"} onOpenChange={(open) => setLogging(open ? "touch" : null)} onLogged={reload} />
            <CallLogDialog leadId={lead.id} open={logging === "call"} onOpenChange={(open) => setLogging(open ? "call" : null)} onLogged={reload} />
        </Card>
    );
}

/* ── the thread ────────────────────────────────────────────────────── */

function Thread({ messages }: { messages: LeadMessage[] }) {
    if (messages.length === 0) return <p className="text-sm text-muted-foreground">Nothing has been said yet — the first message, call or touch starts the thread.</p>;
    return (
        <ol className="max-h-[28rem] space-y-2 overflow-y-auto pr-1" data-testid="lead-thread">
            {messages.map((message) => (
                <MessageRow key={message.id} message={message} />
            ))}
        </ol>
    );
}

function MessageRow({ message }: { message: LeadMessage }) {
    const inbound = message.direction === "INBOUND";
    const Arrow = inbound ? ArrowDownLeft : ArrowUpRight;
    return (
        <li className={inbound ? "flex justify-start" : "flex justify-end"} data-testid={`lead-message-${message.id}`}>
            <div className={`max-w-[85%] rounded-lg border px-3 py-2 ${inbound ? "bg-muted/40" : "bg-card"}`}>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Arrow className="size-3" />
                    <span className="font-medium text-foreground">{channelLabel(message.channel)}</span>
                    <span>·</span>
                    <span>{formatDateTime(message.at)}</span>
                    {message.status !== "RECEIVED" ? <StatusBadge status={{ label: MESSAGE_STATUS_LABEL[message.status], tone: messageTone(message.status) }} className="ml-1" /> : null}
                    {message.templateKey ? <span className="rounded bg-muted px-1 font-mono text-[10px]">{message.templateKey}</span> : null}
                </div>
                <p className="mt-1 whitespace-pre-line text-sm text-foreground">{message.channel === "CALL" ? messagePreview(message, 200) : message.body}</p>
                {message.error ? <p className="mt-1 text-xs text-warning">{message.error}</p> : null}
                {message.scheduledFor && message.status === "QUEUED" ? <p className="mt-1 text-xs text-muted-foreground">Leaves after the quiet hours — {formatDateTime(message.scheduledFor)}</p> : null}
                {message.channel === "CALL" && message.maskedNumber ? <p className="mt-1 text-xs text-muted-foreground">They saw {message.maskedNumber}</p> : null}
                {message.recordingUrl ? <RecordingPlayer url={message.recordingUrl} /> : null}
            </div>
        </li>
    );
}

/** The consented recording, fetched with the token into an object URL the browser can play. */
export function RecordingPlayer({ url }: { url: string }) {
    const [src, setSrc] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    React.useEffect(() => () => {
        if (src) URL.revokeObjectURL(src);
    }, [src]);
    async function load() {
        if (busy) return;
        setBusy(true);
        try {
            const blob = await fetchPrivateBlob(url);
            setSrc(URL.createObjectURL(blob));
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not fetch the recording.");
        } finally {
            setBusy(false);
        }
    }
    if (src) return <audio controls src={src} className="mt-2 h-8 w-full" data-testid="lead-recording-player" />;
    return (
        <Button size="sm" variant="outline" className="mt-2 h-7" disabled={busy} onClick={() => void load()} data-testid="lead-recording-play">
            <Play className="mr-1 size-3" /> {busy ? "Fetching…" : "Play the recording"}
        </Button>
    );
}

/* ── the sequence ──────────────────────────────────────────────────── */

function SequenceLine({ lead, thread, closed, onChanged }: { lead: LeadDetail; thread: LeadThread; closed: boolean; onChanged: () => void }) {
    const [busy, setBusy] = React.useState(false);
    const line = runLine(thread.run);
    const running = thread.run !== null && thread.run.stoppedAt === null;
    async function run(work: () => Promise<unknown>, label: string) {
        setBusy(true);
        try {
            await work();
            toast.success(label);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "That did not reach ADX.");
        } finally {
            setBusy(false);
        }
    }
    return (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed px-3 py-2" data-testid="lead-sequence">
            <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Sequence</span> · {line ?? (lead.temperature ? "not enrolled" : "no temperature yet")}
            </p>
            {!closed ? (
                running ? (
                    <Button size="sm" variant="ghost" className="h-7" disabled={busy} onClick={() => void run(() => outreachService.stopSequence(lead.id), "Sequence stopped")} data-testid="lead-sequence-stop">
                        <Square className="mr-1 size-3" /> Stop
                    </Button>
                ) : (
                    <Button size="sm" variant="ghost" className="h-7" disabled={busy || !lead.temperature} onClick={() => void run(() => outreachService.enrol(lead.id, { force: true }), "Enrolled")} data-testid="lead-sequence-enrol">
                        Enrol
                    </Button>
                )
            ) : null}
        </div>
    );
}

/* ── the composer ──────────────────────────────────────────────────── */

const SENDABLE: readonly OutreachChannel[] = OUTREACH_CHANNELS.filter((c) => c !== "CALL" && !MANUAL_CHANNELS.includes(c));

function Composer({ lead, channels, onSent }: { lead: LeadDetail; channels: ChannelState[]; onSent: () => void }) {
    const reachable = channels.filter((c) => SENDABLE.includes(c.channel) && c.reachable);
    const [channel, setChannel] = React.useState<OutreachChannel | "">("");
    const [body, setBody] = React.useState("");
    const [subject, setSubject] = React.useState("");
    const [templateKey, setTemplateKey] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const chosen = channels.find((c) => c.channel === channel) ?? null;
    const needsTemplate = chosen?.mode === "TEMPLATE";
    const valid = chosen !== null && chosen.reachable && (needsTemplate ? templateKey.trim().length > 0 : body.trim().length > 0);

    async function send() {
        if (!valid || busy || !chosen) return;
        setBusy(true);
        try {
            const outcome = await outreachService.send(lead.id, {
                channel: chosen.channel,
                ...(needsTemplate ? { templateKey: templateKey.trim() } : { body: body.trim() }),
                ...(chosen.channel === "EMAIL" && subject.trim() ? { subject: subject.trim() } : {}),
            });
            toast.success(outcome.outcome === "QUEUED" ? `Queued — leaves after the quiet hours (${formatDateTime(outcome.scheduledFor)})` : `Sent on ${channelLabel(chosen.channel)}`);
            setBody("");
            setSubject("");
            setTemplateKey("");
            onSent();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "Could not send.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-3 rounded-md border p-3" data-testid="lead-composer">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
                <div className="space-y-1.5">
                    <Label htmlFor="compose-channel">Channel</Label>
                    <Select value={channel} onValueChange={(value) => setChannel(value as OutreachChannel)}>
                        <SelectTrigger id="compose-channel" className="h-9" data-testid="compose-channel">
                            <SelectValue placeholder={reachable.length ? "Pick a channel" : "No channel can reach this lead"} />
                        </SelectTrigger>
                        <SelectContent>
                            {channels
                                .filter((c) => SENDABLE.includes(c.channel))
                                .map((c) => (
                                    <SelectItem key={c.channel} value={c.channel} disabled={!c.reachable}>
                                        {channelLabel(c.channel)}
                                        {c.reachable ? (c.mode ? ` · ${REACH_MODE_LABEL[c.mode].toLowerCase()}` : "") : ` · ${c.configured ? "unreachable" : "not set up"}`}
                                    </SelectItem>
                                ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="compose-template">{needsTemplate ? "Approved template" : "Template (optional)"}</Label>
                    <Input id="compose-template" value={templateKey} onChange={(event) => setTemplateKey(event.target.value)} placeholder={needsTemplate ? "lead-seq-publisher-intro" : "A comms template key, or type below"} data-testid="compose-template" />
                </div>
            </div>
            {chosen && !chosen.reachable ? <p className="text-xs text-warning">{chosen.reason}</p> : null}
            {chosen?.channel === "EMAIL" ? (
                <div className="space-y-1.5">
                    <Label htmlFor="compose-subject">Subject</Label>
                    <Input id="compose-subject" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="A note from ADX" />
                </div>
            ) : null}
            {!needsTemplate ? (
                <div className="space-y-1.5">
                    <Label htmlFor="compose-body">Message</Label>
                    <Textarea id="compose-body" rows={3} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Type the message — {{contactName}}, {{businessName}}, {{agentName}} and {{link}} are filled in." data-testid="compose-body" />
                </div>
            ) : (
                <p className="text-xs text-muted-foreground">Outside the 24-hour window WhatsApp allows only an approved template — name the comms template mapped on the Channels card.</p>
            )}
            <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{chosen?.address ? `To ${chosen.address}` : "Quiet hours and the weekly cap apply to every send."}</p>
                <Button size="sm" disabled={!valid || busy} onClick={() => void send()} data-testid="compose-send">
                    <Send className="mr-1.5 size-3.5" /> {busy ? "Sending…" : "Send"}
                </Button>
            </div>
        </div>
    );
}

/* ── the call ──────────────────────────────────────────────────────── */

function CallButton({ lead, channels, onLogInstead, onPlaced }: { lead: LeadDetail; channels: ChannelState[]; onLogInstead: () => void; onPlaced: () => void }) {
    const state = channels.find((c) => c.channel === "CALL") ?? null;
    const [busy, setBusy] = React.useState(false);
    const [placed, setPlaced] = React.useState<{ maskedNumber: string; recording: boolean; consentLine: string | null } | null>(null);
    if (!state) return null;
    if (!state.configured || !state.reachable) {
        return (
            <Button size="sm" variant="outline" onClick={onLogInstead} title={state.reason ?? undefined} data-testid="lead-call-log">
                <Phone className="mr-1.5 size-3.5" /> Log a call
            </Button>
        );
    }
    async function place() {
        if (busy) return;
        setBusy(true);
        try {
            const result = await outreachService.call(lead.id);
            setPlaced({ maskedNumber: result.maskedNumber, recording: result.recording, consentLine: result.consentLine });
            onPlaced();
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 503) {
                toast.error(cause.message, { description: "Dial from your phone and log the call instead." });
                onLogInstead();
            } else toast.error(cause instanceof Error ? cause.message : "Could not place the call.");
        } finally {
            setBusy(false);
        }
    }
    return (
        <>
            <Button size="sm" disabled={busy} onClick={() => void place()} data-testid="lead-call">
                <PhoneCall className="mr-1.5 size-3.5" /> {busy ? "Ringing you…" : "Call"}
            </Button>
            <Dialog open={placed !== null} onOpenChange={(open) => (!open ? setPlaced(null) : undefined)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Your phone is ringing</DialogTitle>
                        <DialogDescription>Pick up and ADX connects {lead.businessName}. They see {placed?.maskedNumber}, never your own number.</DialogDescription>
                    </DialogHeader>
                    {placed?.recording ? <p className="text-sm text-muted-foreground">Recorded — they hear “{placed.consentLine}” before you are connected. The recording is kept 90 days.</p> : <p className="text-sm text-muted-foreground">Not recorded.</p>}
                    <DialogFooter>
                        <Button onClick={() => setPlaced(null)}>Done</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

function CallLogDialog({ leadId, open, onOpenChange, onLogged }: { leadId: string; open: boolean; onOpenChange: (open: boolean) => void; onLogged: () => void }) {
    const [outcome, setOutcome] = React.useState<CallOutcome>("ANSWERED");
    const [duration, setDuration] = React.useState("");
    const [note, setNote] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    async function submit() {
        if (busy) return;
        setBusy(true);
        try {
            await outreachService.logCall(leadId, { outcome, ...(duration ? { durationSec: Math.max(0, Math.round(Number(duration) * 60)) } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
            toast.success("Call logged");
            setNote("");
            setDuration("");
            onOpenChange(false);
            onLogged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not log the call.");
        } finally {
            setBusy(false);
        }
    }
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent data-testid="call-log-dialog">
                <DialogHeader>
                    <DialogTitle>Log a call</DialogTitle>
                    <DialogDescription>A call dialled from your own phone — what came of it.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="call-outcome">Outcome</Label>
                        <Select value={outcome} onValueChange={(value) => setOutcome(value as CallOutcome)}>
                            <SelectTrigger id="call-outcome" className="h-9">
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
                        <Label htmlFor="call-minutes">Minutes</Label>
                        <Input id="call-minutes" type="number" min={0} step={0.5} value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="0" />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="call-note">Note</Label>
                    <Textarea id="call-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What they said" />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button onClick={() => void submit()} disabled={busy} data-testid="call-log-save">
                        {busy ? "Saving…" : "Log the call"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ── a touch by hand ───────────────────────────────────────────────── */

function TouchDialog({ leadId, open, onOpenChange, onLogged }: { leadId: string; open: boolean; onOpenChange: (open: boolean) => void; onLogged: () => void }) {
    const [channel, setChannel] = React.useState<OutreachChannel>("LINKEDIN");
    const [direction, setDirection] = React.useState<MessageDirection>("OUTBOUND");
    const [note, setNote] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    async function submit() {
        if (busy) return;
        setBusy(true);
        try {
            await outreachService.touch(leadId, { channel, direction, ...(note.trim() ? { note: note.trim() } : {}) });
            toast.success("Touch logged");
            setNote("");
            onOpenChange(false);
            onLogged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not log the touch.");
        } finally {
            setBusy(false);
        }
    }
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent data-testid="touch-dialog">
                <DialogHeader>
                    <DialogTitle>Log a touch</DialogTitle>
                    <DialogDescription>A LinkedIn message, a DM typed elsewhere, a walk-in — anything said outside ADX.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="touch-channel">Channel</Label>
                        <Select value={channel} onValueChange={(value) => setChannel(value as OutreachChannel)}>
                            <SelectTrigger id="touch-channel" className="h-9" data-testid="touch-channel">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {OUTREACH_CHANNELS.map((value) => (
                                    <SelectItem key={value} value={value}>
                                        {channelLabel(value)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="touch-direction">Who spoke</Label>
                        <Select value={direction} onValueChange={(value) => setDirection(value as MessageDirection)}>
                            <SelectTrigger id="touch-direction" className="h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="OUTBOUND">We reached out</SelectItem>
                                <SelectItem value="INBOUND">They wrote or came in</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="touch-note">Note</Label>
                    <Textarea id="touch-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What was said" data-testid="touch-note" />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button onClick={() => void submit()} disabled={busy} data-testid="touch-save">
                        {busy ? "Saving…" : "Log it"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** The channels card's summary line on the lead page: what is set up, what is not. */
export function channelsSummary(channels: readonly ChannelState[]): string {
    const on = channels.filter((c) => c.configured && !MANUAL_CHANNELS.includes(c.channel)).map((c) => channelLabel(c.channel));
    return on.length ? `Set up: ${on.join(", ")}` : "No channel is set up yet — see Settings › Integrations › Channels.";
}

export const ChannelsLink = () => (
    <Link href="/settings/integrations" className="text-xs text-primary hover:underline">
        Channels
    </Link>
);
