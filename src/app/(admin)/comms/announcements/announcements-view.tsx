"use client";

import * as React from "react";
import { Loader2, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CityCombobox } from "@/components/adx/city-combobox";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime, formatNumber } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import {
    ANNOUNCEMENT_AUDIENCES,
    ANNOUNCEMENT_STATUS_META,
    AUDIENCE_LABEL,
    BODY_MAX,
    TITLE_MAX,
    announcementProblem,
    announcementsService,
    canCancel,
    channelsFor,
    deliveredCounts,
    previewKey,
    smsAllowed,
    type Announcement,
    type AnnouncementAudience,
    type AnnouncementChannel,
    type AnnouncementImportance,
    type AnnouncementInput,
    type AnnouncementsPage,
    type PreviewCount,
} from "@/services/announcements";
import { CHANNEL_LABEL } from "@/services/comms";
import type { CityStage } from "@/services/geo";

interface AnnouncementsViewProps {
    page: AnnouncementsPage;
    onChanged: () => void;
}

/** The stages a city with accounts in it can be at — the active ones; a typed search still reaches every stage. */
const ANNOUNCEMENT_CITY_STAGES: readonly CityStage[] = ["LAUNCHED", "SEEDING", "PAUSED"];

/** What the operator is about to send, with the reach as it stood when Send was pressed; nothing is stored yet. */
interface Pending {
    input: AnnouncementInput;
    preview: PreviewCount;
    scheduledAt: string | null;
}

/** A `datetime-local` value as an ISO instant, or null when blank or unparseable. */
const toInstant = (local: string): string | null => {
    if (!local) return null;
    const date = new Date(local);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/**
 * Announcements — the compose form over `POST /announcements`, the live
 * reach from `POST /announcements/preview-count` (E10-2), the send from
 * `POST /:id/send` and the history from `GET /announcements`.
 *
 * The reach is shown while the operator types — debounced, and asked
 * only when something that decides the audience moved (audience, city,
 * channels, importance), never on a keystroke in the body. Nothing is
 * stored until Send: the confirmation dialog repeats the reach, and only
 * Confirm drafts the announcement and sends or books it, so backing out
 * leaves no row behind. SMS is offered only with a CRITICAL announcement
 * (Q130) — the checkbox is disabled otherwise and the body never carries
 * it. The seeded priority and expiry controls are gone: the server has
 * importance in place of priority and no expiry. G10/G11-2: Push is a
 * channel again — the dispatcher's push rail carries it to every device
 * on file — and the reach prints `push` (devices, one per phone) beside
 * in-app, email and SMS.
 */
export function AnnouncementsView({ page, onChanged }: AnnouncementsViewProps) {
    const [title, setTitle] = React.useState("");
    const [message, setMessage] = React.useState("");
    const [audience, setAudience] = React.useState<AnnouncementAudience>("ALL");
    /** Free text over the city combobox — empty is everywhere; the server matches each account's free-text city. */
    const [city, setCity] = React.useState("");
    const [email, setEmail] = React.useState(true);
    const [sms, setSms] = React.useState(false);
    const [push, setPush] = React.useState(false);
    const [importance, setImportance] = React.useState<AnnouncementImportance>("NORMAL");
    const [sendNow, setSendNow] = React.useState(true);
    const [scheduledLocal, setScheduledLocal] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [pending, setPending] = React.useState<Pending | null>(null);
    const [cancelling, setCancelling] = React.useState<string | null>(null);

    const selected: AnnouncementChannel[] = [
        "IN_APP",
        ...(email ? (["EMAIL"] as const) : []),
        ...(sms ? (["SMS"] as const) : []),
        ...(push ? (["PUSH"] as const) : []),
    ];
    const channels = channelsFor(selected, importance);
    const input: AnnouncementInput = {
        title,
        body: message,
        audience,
        city: city.trim() || null,
        channels,
        importance,
    };
    const problem = announcementProblem(input);
    const scheduledAt = sendNow ? null : toInstant(scheduledLocal);
    const scheduleProblem = !sendNow && !scheduledAt ? "Pick a date and time to schedule for." : null;

    /**
     * The live reach. The key is the preview body itself, settled 400 ms
     * after the last change, so the request is about exactly what the key
     * names rather than whatever the form holds when the timer fires.
     */
    const settledKey = useDebounced(previewKey(input), 400);
    const reach = useApiResource<PreviewCount>(`comms:announcements:preview:${settledKey}`, () =>
        announcementsService.previewDraft(JSON.parse(settledKey) as AnnouncementInput),
    );
    const reachStale = reach.loading || settledKey !== previewKey(input);

    const reset = () => {
        setTitle("");
        setMessage("");
        setCity("");
        setSms(false);
        setPush(false);
        setImportance("NORMAL");
        setSendNow(true);
        setScheduledLocal("");
    };

    /** Step one: the confirmation, over the reach already on screen. Nothing is stored yet. */
    const prepare = () => {
        const blocker = problem ?? scheduleProblem;
        if (blocker) {
            toast.error(blocker);
            return;
        }
        if (!reach.data) {
            toast.error(reach.error ?? "Still counting the reach — try again in a moment.");
            return;
        }
        setPending({ input, preview: reach.data, scheduledAt });
    };

    /** Step two: draft it, then send or book it — the only moment a row is written. */
    const confirm = async () => {
        if (!pending) return;
        setBusy(true);
        let drafted: Announcement | null = null;
        try {
            drafted = await announcementsService.create(pending.input);
            const sent = await announcementsService.send(drafted.id, pending.scheduledAt);
            toast.success(sent.status === "SCHEDULED" ? "Announcement scheduled" : "Announcement sending", {
                description:
                    sent.status === "SCHEDULED" && sent.scheduledAt
                        ? `${AUDIENCE_LABEL[sent.audience]} · ${formatDateTime(sent.scheduledAt)}`
                        : `${AUDIENCE_LABEL[sent.audience]} · ${sent.channels.map((c) => CHANNEL_LABEL[c].toLowerCase()).join(", ")}`,
            });
            setPending(null);
            reset();
            onChanged();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not send the announcement.", {
                // A draft the send refused is a real row now; it appears in the history with its Cancel.
                description: drafted ? "The draft was saved; it is in the history below and can be sent or cancelled from there." : undefined,
            });
            if (drafted) {
                setPending(null);
                onChanged();
            }
        } finally {
            setBusy(false);
        }
    };

    /** Backing out closes the dialog; there is no draft to discard. */
    const back = () => setPending(null);

    const cancelRow = async (row: Announcement) => {
        setCancelling(row.id);
        try {
            const cancelled = await announcementsService.cancel(row.id);
            toast.success(`"${cancelled.title}" cancelled`, {
                description: row.status === "SENDING" ? "The send stops between batches; people already reached keep the message." : undefined,
            });
            onChanged();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not cancel the announcement.");
        } finally {
            setCancelling(null);
        }
    };

    return (
        <div className="space-y-5">
            <PageHeader title="Announcements" subtitle="Broadcast product and policy updates to the marketplace" />

            <div className="grid gap-4 xl:grid-cols-2">
                {/* Compose */}
                <Card className="rounded-lg border-border p-5 shadow-none">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Compose</h3>
                    <div className="mt-4 space-y-4">
                        <div className="space-y-1.5">
                            <div className="flex items-end justify-between gap-3">
                                <Label htmlFor="ann-title">Title</Label>
                                <span className="text-xs tabular-nums text-muted-foreground">
                                    {title.trim().length} / {TITLE_MAX}
                                </span>
                            </div>
                            <Input id="ann-title" value={title} maxLength={TITLE_MAX} onChange={(event) => setTitle(event.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <div className="flex items-end justify-between gap-3">
                                <Label htmlFor="ann-body">Message body</Label>
                                <span className="text-xs tabular-nums text-muted-foreground">
                                    {message.trim().length} / {formatNumber(BODY_MAX)}
                                </span>
                            </div>
                            <Textarea
                                id="ann-body"
                                value={message}
                                maxLength={BODY_MAX}
                                onChange={(event) => setMessage(event.target.value)}
                                className="min-h-24 resize-none"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Audience</Label>
                            <div className="flex flex-wrap gap-1.5">
                                {ANNOUNCEMENT_AUDIENCES.map((option) => (
                                    <button
                                        key={option}
                                        type="button"
                                        onClick={() => setAudience(option)}
                                        className={cn(
                                            "h-8 rounded-full border px-3 text-xs font-medium transition-colors",
                                            audience === option ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
                                        )}
                                    >
                                        {AUDIENCE_LABEL[option]}
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground">Live, verified accounts holding the role — never admins or partners.</p>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="ann-city">City</Label>
                            <CityCombobox id="ann-city" value={city} onChange={setCity} placeholder="Everywhere" stages={ANNOUNCEMENT_CITY_STAGES} maxLength={80} />
                            <p className="text-xs text-muted-foreground">Leave empty for everywhere; a city narrows the reach to accounts in it.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="ann-importance">Importance</Label>
                                <Select
                                    value={importance}
                                    onValueChange={(value) => {
                                        const next = value as AnnouncementImportance;
                                        setImportance(next);
                                        if (!smsAllowed(next)) setSms(false);
                                    }}
                                >
                                    <SelectTrigger id="ann-importance">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="NORMAL">Normal</SelectItem>
                                        <SelectItem value="CRITICAL">Critical</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Channels</Label>
                            <div className="flex flex-wrap gap-4">
                                <label className="flex items-center gap-2 text-sm">
                                    <Checkbox checked disabled aria-label="In-app" />
                                    In-app
                                    <span className="text-xs text-muted-foreground">always</span>
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <Checkbox checked={email} onCheckedChange={(checked) => setEmail(checked === true)} aria-label="Email" />
                                    Email
                                </label>
                                <label className={cn("flex items-center gap-2 text-sm", !smsAllowed(importance) && "text-muted-foreground")}>
                                    <Checkbox
                                        checked={sms && smsAllowed(importance)}
                                        disabled={!smsAllowed(importance)}
                                        onCheckedChange={(checked) => setSms(checked === true)}
                                        aria-label="SMS"
                                    />
                                    SMS
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <Checkbox checked={push} onCheckedChange={(checked) => setPush(checked === true)} aria-label="Push" />
                                    Push
                                </label>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {smsAllowed(importance)
                                    ? "A critical notice may go by SMS at any hour; it is sent as the ANNOUNCEMENT_CRITICAL kind on the rail in use."
                                    : "SMS goes only with a critical announcement. Email carries an unsubscribe link; in-app is the record."}
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label>Schedule</Label>
                            <div className="flex gap-4 text-sm">
                                {[
                                    ["Send now", true],
                                    ["Schedule for later", false],
                                ].map(([label, isNow]) => (
                                    <label key={String(label)} className="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            name="ann-schedule"
                                            checked={sendNow === isNow}
                                            onChange={() => setSendNow(Boolean(isNow))}
                                            className="size-3.5 accent-[hsl(359.5_85.5%_29.8%)]"
                                        />
                                        {label}
                                    </label>
                                ))}
                            </div>
                            {!sendNow && (
                                <Input
                                    type="datetime-local"
                                    value={scheduledLocal}
                                    onChange={(event) => setScheduledLocal(event.target.value)}
                                    aria-label="Schedule for"
                                />
                            )}
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t pt-4">
                            <p className="text-xs text-muted-foreground">
                                {problem ?? scheduleProblem ?? `Goes by ${channels.map((c) => CHANNEL_LABEL[c].toLowerCase()).join(", ")}.`}
                            </p>
                            <Button onClick={prepare} disabled={busy || Boolean(problem) || Boolean(scheduleProblem) || !reach.data}>
                                {sendNow ? "Send announcement" : "Schedule announcement"}
                            </Button>
                        </div>
                    </div>
                </Card>

                {/* Reach, preview + history */}
                <div className="space-y-4">
                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reach right now</h3>
                            {reachStale && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Counting" />}
                        </div>
                        {reach.data ? (
                            <>
                                <dl className={cn("mt-3 grid grid-cols-2 gap-3 text-center transition-opacity sm:grid-cols-4", reachStale && "opacity-60")}>
                                    <Reach label="In-app" count={reach.data.inApp} />
                                    <Reach label="Email" count={reach.data.email} muted={!channels.includes("EMAIL")} />
                                    <Reach label="SMS" count={reach.data.sms} muted={!channels.includes("SMS")} />
                                    <Reach label="Push" count={reach.data.push} hint="devices" muted={!channels.includes("PUSH")} />
                                </dl>
                                <p className="mt-2 text-xs text-muted-foreground">
                                    {reach.data.smsNote ??
                                        `${formatNumber(reach.data.audience)} people in the audience right now. Email skips anyone who unsubscribed; push counts devices, one per phone; each person is reached once per channel.`}
                                </p>
                            </>
                        ) : (
                            <p className="mt-3 text-sm text-muted-foreground">{reach.error ?? "Counting who this would reach…"}</p>
                        )}
                    </Card>

                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">In-app banner preview</h3>
                        <div className="mt-3 flex items-start gap-3 rounded-lg border border-info/20 bg-info-soft p-3.5">
                            <Megaphone className="mt-0.5 size-4 shrink-0 text-info" />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-foreground">{title.trim() || "Title"}</p>
                                <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{message.trim() || "The message, as the bell shows it."}</p>
                            </div>
                        </div>
                    </Card>

                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent announcements</h3>
                        {page.items.length ? (
                            <ul className="mt-3 divide-y">
                                {page.items.map((item) => (
                                    <HistoryRow key={item.id} item={item} busy={cancelling === item.id} onCancel={() => cancelRow(item)} />
                                ))}
                            </ul>
                        ) : (
                            <p className="mt-3 text-sm text-muted-foreground">Nothing sent yet.</p>
                        )}
                    </Card>
                </div>
            </div>

            <Dialog open={pending !== null} onOpenChange={(open) => !open && !busy && back()}>
                <DialogContent>
                    {pending && (
                        <>
                            <DialogHeader>
                                <DialogTitle>{pending.scheduledAt ? "Schedule this announcement?" : "Send this announcement?"}</DialogTitle>
                                <DialogDescription>
                                    &ldquo;{pending.input.title.trim()}&rdquo; to {AUDIENCE_LABEL[pending.input.audience].toLowerCase()}
                                    {pending.input.city ? ` in ${pending.input.city}` : ""}
                                    {pending.scheduledAt ? ` at ${formatDateTime(pending.scheduledAt)}` : " now"}. The draft is written when you confirm.
                                </DialogDescription>
                            </DialogHeader>
                            <dl className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
                                <Reach label="In-app" count={pending.preview.inApp} />
                                <Reach label="Email" count={pending.preview.email} muted={!pending.input.channels.includes("EMAIL")} />
                                <Reach label="SMS" count={pending.preview.sms} muted={!pending.input.channels.includes("SMS")} />
                                <Reach label="Push" count={pending.preview.push} hint="devices" muted={!pending.input.channels.includes("PUSH")} />
                            </dl>
                            <p className="text-xs text-muted-foreground">
                                {pending.preview.smsNote ??
                                    `${formatNumber(pending.preview.audience)} people in the audience right now. Email skips anyone who unsubscribed; push counts devices, one per phone; each person is reached once per channel.`}
                            </p>
                            <DialogFooter>
                                <Button variant="outline" onClick={back} disabled={busy}>
                                    Back
                                </Button>
                                <Button onClick={confirm} disabled={busy}>
                                    {pending.scheduledAt ? "Confirm schedule" : "Confirm send"}
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

/** One tile of the reach. `count` undefined is a backend that does not serve the figure — "—", never zero. */
function Reach({ label, count, hint, muted }: { label: string; count: number | undefined; hint?: string; muted?: boolean }) {
    return (
        <div className={cn("rounded-lg border p-3", muted && "opacity-50")}>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {label}
                {hint ? <span className="ml-1 normal-case tracking-normal">({hint})</span> : null}
            </dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">{count === undefined ? "—" : formatNumber(count)}</dd>
        </div>
    );
}

function HistoryRow({ item, busy, onCancel }: { item: Announcement; busy: boolean; onCancel: () => void }) {
    const delivered = deliveredCounts(item);
    const when =
        item.status === "SENT" && item.sentAt
            ? formatDateTime(item.sentAt)
            : item.status === "SCHEDULED" && item.scheduledAt
              ? `for ${formatDateTime(item.scheduledAt)}`
              : formatDateTime(item.createdAt);
    const reach =
        item.status === "SENT"
            ? `${formatNumber(delivered.total)} delivered${
                  delivered.byChannel.length
                      ? ` (${delivered.byChannel.map((c) => `${formatNumber(c.reached)} ${CHANNEL_LABEL[c.channel as keyof typeof CHANNEL_LABEL] ?? c.channel}`).join(", ")})`
                      : ""
              }`
            : item.status === "SENDING"
              ? `${formatNumber(item.recipientCount)} recipients`
              : `${AUDIENCE_LABEL[item.audience]}${item.city ? ` · ${item.city}` : ""}`;

    return (
        <li className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                    {when} · {reach}
                    {item.importance === "CRITICAL" ? " · critical" : ""}
                </p>
            </div>
            {canCancel(item.status) && (
                <Button variant="ghost" size="sm" className="h-7" disabled={busy} onClick={onCancel}>
                    Cancel
                </Button>
            )}
            <StatusBadge status={ANNOUNCEMENT_STATUS_META[item.status]} />
        </li>
    );
}
