"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, ChevronLeft, Plus, Send, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { ActiveFilters, FilterPanel, type Facet, type FilterSelection } from "@/components/adx/filter-panel";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { formatNumber } from "@/lib/format";
import {
    CHANNEL_LABEL,
    EMPTY_STATS,
    NOTIFICATION_CHANNELS,
    PUSH_BODY_MAX,
    PUSH_TITLE_MAX,
    TEMPLATE_CHANNELS,
    TEMPLATE_STATUSES,
    TEMPLATE_STATUS_META,
    commsService,
    draftOf,
    draftVariables,
    emptyDraft,
    eventVariablesDiff,
    formatDeliveryRate,
    sumTemplateStats,
    templateInput,
    templatePatch,
    templateProblem,
    type CommsEvent,
    type CommsTemplate,
    type NotificationChannel,
    type TemplateDraft,
    type TemplateStatus,
    type TemplatesPage,
} from "@/services/comms";
import type { CommsSettings } from "@/services/settings";
import type { TemplateVocabulary } from "./templates-loader";

interface TemplatesViewProps {
    page: TemplatesPage;
    /** The events the code raises and the DLT kinds — what the editor checks a draft against. */
    vocabulary: TemplateVocabulary;
    selection: FilterSelection;
    onSelectionChange: (next: FilterSelection) => void;
    q: string;
    onSearch: (q: string) => void;
    onChanged: () => void;
}

const SMS_SEGMENT = 160;

/** A body with its `{{names}}` marked, so the eye finds the variables. */
function Placeholders({ text, className }: { text: string; className?: string }) {
    const parts = text.split(/(\{\{\s*[A-Za-z0-9_]+\s*\}\})/g);
    return (
        <span className={cn("whitespace-pre-wrap", className)}>
            {parts.map((part, index) =>
                /^\{\{\s*[A-Za-z0-9_]+\s*\}\}$/.test(part) ? (
                    <mark key={index} className="rounded bg-primary/10 px-1 font-mono text-[0.85em] text-primary">
                        {part}
                    </mark>
                ) : (
                    <React.Fragment key={index}>{part}</React.Fragment>
                ),
            )}
        </span>
    );
}

function ChannelChip({ channel }: { channel: NotificationChannel }) {
    return (
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {CHANNEL_LABEL[channel]}
        </span>
    );
}

/**
 * E10-2: the card's 30 days — what left, what a rail confirmed, what failed,
 * and the rate the server computed over sent and failed. Email has no
 * delivery report, so "delivered" stays 0 on an email-only template and
 * the line says so rather than printing a zero that reads as a failure.
 */
function TemplateStatsLine({ template }: { template: CommsTemplate }) {
    const stats = template.stats ?? EMPTY_STATS;
    const emailOnly = template.channels.includes("EMAIL") && !template.channels.includes("SMS");
    return (
        <dl className="grid grid-cols-4 gap-2 border-t px-5 py-3 text-center">
            <Stat label="Sent" value={formatNumber(stats.sent30d)} />
            <Stat label="Delivered" value={emailOnly && stats.delivered30d === 0 ? "n/a" : formatNumber(stats.delivered30d)} hint={emailOnly ? "Email has no delivery report" : undefined} />
            <Stat label="Failed" value={formatNumber(stats.failed30d)} tone={stats.failed30d > 0 ? "danger" : undefined} />
            <Stat label="Rate" value={formatDeliveryRate(stats.deliveryRate)} />
        </dl>
    );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "danger" }) {
    return (
        <div title={hint}>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className={cn("text-sm font-semibold tabular-nums", tone === "danger" ? "text-danger" : "text-foreground")}>{value}</dd>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Library                                                             */
/* ------------------------------------------------------------------ */

function Library({
    page,
    selection,
    onSelectionChange,
    q,
    onSearch,
    onOpen,
    onNew,
}: Omit<TemplatesViewProps, "onChanged" | "vocabulary"> & { onOpen: (template: CommsTemplate) => void; onNew: () => void }) {
    const templates = page.items;
    /** E10-2: the page's 30 days added up — the rate over the sums, not averaged. */
    const totals = sumTemplateStats(templates);

    const facets: Facet[] = React.useMemo(
        () => [
            {
                id: "status",
                label: "Status",
                options: TEMPLATE_STATUSES.map((value) => ({
                    value,
                    label: TEMPLATE_STATUS_META[value].label,
                    count: page.counts[value] ?? 0,
                })),
            },
            {
                id: "channel",
                label: "Channel",
                options: NOTIFICATION_CHANNELS.map((channel) => ({
                    value: channel,
                    label: CHANNEL_LABEL[channel],
                    count: templates.filter((t) => t.channels.includes(channel)).length,
                })).filter((option) => option.count > 0),
            },
        ],
        [page.counts, templates],
    );

    const channels = selection.channel ?? [];
    const visible = channels.length
        ? templates.filter((template) => channels.some((channel) => template.channels.includes(channel as NotificationChannel)))
        : templates;

    const active = page.counts.ACTIVE ?? 0;
    const drafts = page.counts.DRAFT ?? 0;
    const retired = page.counts.RETIRED ?? 0;

    return (
        <div className="space-y-5">
            <PageHeader
                title="Notification templates"
                subtitle={`${active} active template${active === 1 ? "" : "s"} · ${drafts} draft${drafts === 1 ? "" : "s"} · ${retired} retired · ${formatNumber(totals.sent30d)} sent in 30 days, ${formatNumber(totals.failed30d)} failed, ${formatDeliveryRate(totals.deliveryRate)} delivery rate`}
                actions={
                    <Button onClick={onNew}>
                        <Plus className="size-4" />
                        New template
                    </Button>
                }
            />

            <div className="space-y-3">
                <FilterPanel
                    facets={facets}
                    selection={selection}
                    onChange={onSelectionChange}
                    resultCount={visible.length}
                    search={{ value: q, onChange: onSearch, placeholder: "Key, event or subject" }}
                />
                <ActiveFilters facets={facets} selection={selection} onChange={onSelectionChange} resultCount={visible.length} />
            </div>

            {visible.length ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {visible.map((template) => {
                        const preview = template.subject ?? template.smsBody ?? "";
                        return (
                            <Card
                                key={template.key}
                                className="flex flex-col rounded-lg border-border shadow-none transition-colors hover:border-foreground/20"
                            >
                                <button
                                    type="button"
                                    onClick={() => onOpen(template)}
                                    className="flex-1 rounded-t-lg px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <h3 className="text-sm font-semibold text-foreground">{template.key}</h3>
                                        <StatusBadge status={TEMPLATE_STATUS_META[template.status]} />
                                    </div>
                                    <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{template.event}</code>
                                        <span>v{template.version}</span>
                                        {template.isSensitive && (
                                            <span className="inline-flex items-center gap-1 text-foreground">
                                                <ShieldAlert className="size-3" aria-hidden />
                                                Sensitive
                                            </span>
                                        )}
                                    </p>
                                    {preview && (
                                        <p className="mt-3 truncate rounded-md bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground">
                                            <Placeholders text={preview} className="whitespace-nowrap" />
                                        </p>
                                    )}
                                </button>
                                <TemplateStatsLine template={template} />
                                <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
                                    <div className="flex gap-1">
                                        {template.channels.map((channel) => (
                                            <ChannelChip key={channel} channel={channel} />
                                        ))}
                                    </div>
                                    <p className="text-xs tabular-nums text-muted-foreground">
                                        {template.variables.length} variable{template.variables.length === 1 ? "" : "s"} · edited{" "}
                                        {formatDate(template.updatedAt)}
                                    </p>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            ) : (
                <Card className="rounded-lg border-border p-10 text-center shadow-none">
                    <p className="text-sm font-medium text-foreground">No templates match</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {templates.length ? "Clear the filters, or create a template for this event." : "Nothing is stored yet. The seed is written when the server boots."}
                    </p>
                </Card>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Sending rules                                                       */
/* ------------------------------------------------------------------ */

/**
 * Lot G (Q117): the frame's rules card, over the platform's own two rules
 * rather than the seed's per-template conditions, delays and audiences —
 * the dispatcher applies exactly these, platform-wide, to every
 * non-transactional template. Read here; edited on /settings under Comms.
 */
function RulesCard({ rules, transactional }: { rules: CommsSettings | null; transactional: boolean }) {
    const noWindow = rules ? rules.quietHours.from === rules.quietHours.to : false;
    return (
        <Card className="rounded-lg border-border shadow-none">
            <div className="flex items-start justify-between gap-3 border-b px-5 py-3">
                <div>
                    <h3 className="text-sm font-semibold text-foreground">Sending rules</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        {transactional ? "Transactional — this template ignores both rules." : "Non-transactional — both rules apply to this template."}
                    </p>
                </div>
                <Link href="/settings#comms" className="shrink-0 text-xs font-medium text-primary underline-offset-4 hover:underline">
                    Edit under Settings
                </Link>
            </div>
            {rules ? (
                <dl className={cn("grid gap-4 px-5 py-4 sm:grid-cols-2", transactional && "opacity-60")}>
                    <div>
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Quiet hours</dt>
                        <dd className="mt-1 text-sm font-medium tabular-nums text-foreground">
                            {noWindow ? "No window" : `${rules.quietHours.from} – ${rules.quietHours.to}`}
                        </dd>
                        <dd className="text-xs text-muted-foreground">
                            {noWindow
                                ? "Equal edges: nothing is held."
                                : `${rules.quietHours.tz} · a message raised inside the window is held and released at its end.`}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Weekly cap</dt>
                        <dd className="mt-1 text-sm font-medium tabular-nums text-foreground">
                            {rules.weeklyCapPerUser === 0 ? "Off — nothing non-transactional leaves" : `${rules.weeklyCapPerUser} per person a week`}
                        </dd>
                        <dd className="text-xs text-muted-foreground">Every channel together, Monday to Monday IST; a row beyond it is logged as skipped.</dd>
                    </div>
                </dl>
            ) : (
                <p className="px-5 py-4 text-xs text-muted-foreground">
                    The platform row&apos;s <code className="font-mono">comms</code> section could not be read, so the rules in force are not shown here.
                </p>
            )}
        </Card>
    );
}

/* ------------------------------------------------------------------ */
/* Editor                                                              */
/* ------------------------------------------------------------------ */

type Tab = (typeof TEMPLATE_CHANNELS)[number];

function Editor({
    template,
    vocabulary,
    onBack,
    onSaved,
}: {
    /** Null when creating. */
    template: CommsTemplate | null;
    vocabulary: TemplateVocabulary;
    onBack: () => void;
    onSaved: () => void;
}) {
    const [key, setKey] = React.useState(template?.key ?? "");
    const [draft, setDraft] = React.useState<TemplateDraft>(() => (template ? draftOf(template) : emptyDraft()));
    const [tab, setTab] = React.useState<Tab>(draft.channels.includes("EMAIL") || !draft.channels.includes("SMS") ? "EMAIL" : "SMS");
    const [busy, setBusy] = React.useState(false);
    const [testing, setTesting] = React.useState(false);
    const { user } = useAuth();

    const set = (patch: Partial<TemplateDraft>) => setDraft((current) => ({ ...current, ...patch }));

    const toggleChannel = (channel: NotificationChannel, on: boolean) =>
        set({ channels: on ? [...draft.channels, channel] : draft.channels.filter((c) => c !== channel) });

    const variables = draftVariables(draft);
    /** The catalogue entry for the event typed, when the code raises it. */
    const catalogued: CommsEvent | null = vocabulary.events.find((entry) => entry.event === draft.event.trim()) ?? null;
    const diff = eventVariablesDiff(variables, catalogued && catalogued.raisedBy.length > 0 ? catalogued : null);
    const problem = templateProblem(draft, template ? undefined : key);
    const patch = template ? templatePatch(template, draft) : null;
    const dirty = template ? Object.keys(patch ?? {}).length > 0 : true;
    const smsLength = draft.smsBody.length;

    /**
     * Lot G (Q117): the stored row rendered with sample variables to the
     * operator's own email and mobile. The server reads the address off the
     * user row and refuses one in the body, so the button can only ever
     * say where it goes. Unsaved edits are not what is sent — the row is.
     */
    const sendTest = async () => {
        if (!template) return;
        setTesting(true);
        try {
            const outcome = await commsService.sendTest(template.key);
            const left = outcome.deliveries.filter((row) => !row.skipped);
            const skipped = outcome.deliveries.filter((row) => row.skipped);
            toast.success(left.length ? `Test sent to ${user?.email ?? "your address"}` : "Nothing left the dispatcher", {
                description: [
                    left.length ? `${left.map((row) => CHANNEL_LABEL[row.channel]).join(" and ")} attempted now, with sample values.` : null,
                    skipped.length ? `Skipped: ${skipped.map((row) => `${CHANNEL_LABEL[row.channel]} (${row.skipped})`).join(", ")}.` : null,
                    "The rows are in the delivery log under your own masked address.",
                ]
                    .filter(Boolean)
                    .join(" "),
            });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "The test could not be sent.");
        } finally {
            setTesting(false);
        }
    };

    const save = async () => {
        if (problem) {
            toast.error(problem);
            return;
        }
        setBusy(true);
        try {
            if (template) {
                const saved = await commsService.updateTemplate(template.key, patch ?? {});
                toast.success(`"${saved.key}" saved as v${saved.version}`, {
                    description: "The audit trail records the diff.",
                });
            } else {
                const created = await commsService.createTemplate(templateInput(key, draft));
                toast.success(`"${created.key}" created`, { description: `Fires on ${created.event}.` });
            }
            onSaved();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not save the template.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-5">
            <div>
                <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="size-4" />
                    All templates
                </button>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{template?.key ?? "New template"}</h1>
                            <StatusBadge status={TEMPLATE_STATUS_META[draft.status]} />
                            {template && <span className="text-xs text-muted-foreground">v{template.version}</span>}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {template
                                ? `Edited ${formatDate(template.updatedAt)} · every save bumps the version`
                                : "A key is the handle callers raise the event by; it cannot change once created."}
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        {template && (
                            <Button
                                variant="outline"
                                className="bg-card"
                                onClick={sendTest}
                                disabled={testing || busy}
                                title={`Sent to ${user?.email ?? "your own address"} with sample values — the saved version, not unsaved edits.`}
                            >
                                <Send className="size-4" />
                                {testing ? "Sending…" : `Send test to ${user?.email ?? "me"}`}
                            </Button>
                        )}
                        <Button onClick={save} disabled={busy || !dirty}>
                            {template ? "Save changes" : "Create template"}
                        </Button>
                    </div>
                </div>
            </div>

            <div className="grid items-start gap-4 xl:grid-cols-2">
                <div className="space-y-4">
                    <Card className="rounded-lg border-border shadow-none">
                        <div className="border-b px-5 py-3">
                            <h3 className="text-sm font-semibold text-foreground">When this sends</h3>
                            <p className="mt-0.5 text-xs text-muted-foreground">The event that fires it, and the channels it leaves by</p>
                        </div>
                        <div className="space-y-4 px-5 py-4">
                            <div className="grid gap-3 sm:grid-cols-2">
                                {!template && (
                                    <div className="space-y-1.5">
                                        <Label htmlFor="tpl-key">Key</Label>
                                        <Input
                                            id="tpl-key"
                                            value={key}
                                            placeholder="payout-paid"
                                            className="font-mono text-xs"
                                            onChange={(event) => setKey(event.target.value.toLowerCase())}
                                        />
                                    </div>
                                )}
                                <div className="space-y-1.5">
                                    <Label htmlFor="tpl-event">Event</Label>
                                    <Input
                                        id="tpl-event"
                                        value={draft.event}
                                        placeholder="PAYOUT_PAID"
                                        className="font-mono text-xs"
                                        list="tpl-event-catalogue"
                                        onChange={(event) => set({ event: event.target.value.toUpperCase() })}
                                    />
                                    <datalist id="tpl-event-catalogue">
                                        {vocabulary.events
                                            .filter((entry) => entry.raisedBy.length > 0)
                                            .map((entry) => (
                                                <option key={entry.event} value={entry.event}>
                                                    {entry.raisedBy.join(", ")}
                                                </option>
                                            ))}
                                    </datalist>
                                    {draft.event.trim() && !catalogued && (
                                        <p className="text-xs text-warning">No code raises {draft.event.trim()} — the template would never fire.</p>
                                    )}
                                    {catalogued?.note && <p className="text-xs text-muted-foreground">{catalogued.note}</p>}
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="tpl-status">Status</Label>
                                    <Select value={draft.status} onValueChange={(value) => set({ status: value as TemplateStatus })}>
                                        <SelectTrigger id="tpl-status">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {TEMPLATE_STATUSES.map((status) => (
                                                <SelectItem key={status} value={status}>
                                                    {TEMPLATE_STATUS_META[status].label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">Only the ACTIVE template for an event is rendered.</p>
                                </div>
                            </div>

                            <div className="space-y-2 border-t pt-4">
                                <p className="text-sm font-medium text-foreground">Channels</p>
                                <div className="flex flex-wrap gap-4">
                                    {TEMPLATE_CHANNELS.map((channel) => (
                                        <label key={channel} className="flex items-center gap-2 text-sm">
                                            <Switch
                                                checked={draft.channels.includes(channel)}
                                                onCheckedChange={(on) => toggleChannel(channel, on)}
                                                aria-label={CHANNEL_LABEL[channel]}
                                            />
                                            {CHANNEL_LABEL[channel]}
                                        </label>
                                    ))}
                                </div>
                                {draft.channels.some((c) => !(TEMPLATE_CHANNELS as readonly NotificationChannel[]).includes(c)) && (
                                    <p className="text-xs text-muted-foreground">
                                        Also on {draft.channels.filter((c) => !(TEMPLATE_CHANNELS as readonly NotificationChannel[]).includes(c)).map((c) => CHANNEL_LABEL[c]).join(", ")} — in-app copy stays in code.
                                    </p>
                                )}
                            </div>

                            <div className="flex items-center justify-between gap-4 border-t pt-4">
                                <div>
                                    <p className="text-sm font-medium text-foreground">Sensitive</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        An OTP, a sign-in link, a payment link. Never resent from the log; variables purged in a week.
                                    </p>
                                </div>
                                <Switch checked={draft.isSensitive} onCheckedChange={(checked) => set({ isSensitive: checked })} aria-label="Sensitive" />
                            </div>

                            {/* Lot G (Q117): off puts the copy under the platform's quiet hours and weekly cap. */}
                            <div className="flex items-center justify-between gap-4 border-t pt-4">
                                <div>
                                    <p className="text-sm font-medium text-foreground">Transactional</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        An OTP, a decision, a payment, a service notice: leaves at once, whatever the hour. Off, the message waits out the
                                        quiet hours and counts against the weekly cap.
                                    </p>
                                </div>
                                <Switch checked={draft.transactional} onCheckedChange={(checked) => set({ transactional: checked })} aria-label="Transactional" />
                            </div>
                        </div>
                    </Card>

                    <RulesCard rules={vocabulary.rules} transactional={draft.transactional} />

                    <Card className="rounded-lg border-border shadow-none">
                        <div className="flex gap-1 border-b px-5 pt-3">
                            {TEMPLATE_CHANNELS.map((option) => {
                                const enabled = draft.channels.includes(option);
                                return (
                                    <button
                                        key={option}
                                        type="button"
                                        onClick={() => setTab(option)}
                                        className={cn(
                                            "relative -mb-px border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors",
                                            tab === option ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                                        )}
                                    >
                                        {CHANNEL_LABEL[option]}
                                        {!enabled && <span className="ml-1.5 text-xs font-normal opacity-60">off</span>}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="space-y-4 px-5 py-4">
                            {tab === "EMAIL" && (
                                <>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="tpl-subject">Subject line</Label>
                                        <Input id="tpl-subject" value={draft.subject} onChange={(event) => set({ subject: event.target.value })} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="tpl-email-body">Email body</Label>
                                        <Textarea
                                            id="tpl-email-body"
                                            rows={10}
                                            value={draft.emailBody}
                                            onChange={(event) => set({ emailBody: event.target.value })}
                                            className="font-mono text-xs leading-6"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            HTML with <code className="font-mono">{"{{name}}"}</code> placeholders. Every value is escaped on render, so a name cannot become markup.
                                        </p>
                                    </div>
                                </>
                            )}
                            {tab === "PUSH" && (
                                <>
                                    {/* G13-C (G10, Q103): the push copy of its own; blank falls back to the subject and the SMS text. */}
                                    <div className="space-y-1.5">
                                        <div className="flex items-end justify-between gap-3">
                                            <Label htmlFor="tpl-push-title">Push title</Label>
                                            <span className={cn("text-xs tabular-nums", draft.pushTitle.length > PUSH_TITLE_MAX ? "text-danger" : "text-muted-foreground")}>
                                                {draft.pushTitle.length} / {PUSH_TITLE_MAX}
                                            </span>
                                        </div>
                                        <Input id="tpl-push-title" value={draft.pushTitle} onChange={(event) => set({ pushTitle: event.target.value })} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <div className="flex items-end justify-between gap-3">
                                            <Label htmlFor="tpl-push-body">Push body</Label>
                                            <span className={cn("text-xs tabular-nums", draft.pushBody.length > PUSH_BODY_MAX ? "text-danger" : "text-muted-foreground")}>
                                                {draft.pushBody.length} / {PUSH_BODY_MAX}
                                            </span>
                                        </div>
                                        <Textarea
                                            id="tpl-push-body"
                                            rows={4}
                                            value={draft.pushBody}
                                            onChange={(event) => set({ pushBody: event.target.value })}
                                            className="font-mono text-xs leading-6"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            The same <code className="font-mono">{"{{name}}"}</code> placeholders. Left blank, the push shows the subject line and the SMS text instead.
                                        </p>
                                    </div>
                                </>
                            )}
                            {tab === "SMS" && (
                                <>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="tpl-sms-kind">SMS kind</Label>
                                        <Select value={draft.smsKind || "none"} onValueChange={(value) => set({ smsKind: value === "none" ? "" : value })}>
                                            <SelectTrigger id="tpl-sms-kind">
                                                <SelectValue placeholder="Pick the registered kind" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">Not set</SelectItem>
                                                {/* A stored kind the server no longer lists stays selectable so the row can be read and re-pointed. */}
                                                {(vocabulary.sms.kinds.includes(draft.smsKind) || !draft.smsKind ? vocabulary.sms.kinds : [draft.smsKind, ...vocabulary.sms.kinds]).map((kind) => (
                                                    <SelectItem key={kind} value={kind}>
                                                        {kind}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground">
                                            The DLT-registered message the rail renders from. A kind with no registration on the rail in use is skipped, never sent.
                                        </p>
                                    </div>
                                    <div className="space-y-1.5">
                                        <div className="flex items-end justify-between gap-3">
                                            <Label htmlFor="tpl-sms-body">Registered text</Label>
                                            <span className={cn("text-xs tabular-nums", smsLength > SMS_SEGMENT ? "text-warning" : "text-muted-foreground")}>
                                                {smsLength} characters
                                            </span>
                                        </div>
                                        <Textarea
                                            id="tpl-sms-body"
                                            rows={4}
                                            value={draft.smsBody}
                                            onChange={(event) => set({ smsBody: event.target.value })}
                                            className="font-mono text-xs leading-6"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Kept so the log can show what went out; the rail sends the words on its own registration.
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>
                    </Card>
                </div>

                <div className="space-y-4 xl:sticky xl:top-20">
                    <Card className="rounded-lg border-border shadow-none">
                        <div className="border-b px-5 py-3">
                            <h3 className="text-sm font-semibold text-foreground">Variables</h3>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {variables.length
                                    ? `${variables.length} the bodies name. The code raising ${draft.event || "the event"} must supply each one.`
                                    : "None yet — write {{name}} in a body and it appears here."}
                            </p>
                        </div>
                        {/* E10-2: the placeholders typed against what the event's raising code supplies. */}
                        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
                            <div>
                                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">In the bodies</p>
                                {variables.length > 0 ? (
                                    <ul className="mt-2 flex flex-wrap gap-1.5">
                                        {variables.map((name) => {
                                            const missing = diff.missing.includes(name);
                                            return (
                                                <li key={name} className="inline-flex items-center gap-1">
                                                    <code
                                                        className={cn(
                                                            "rounded px-1.5 py-0.5 font-mono text-[11px]",
                                                            missing ? "bg-danger-soft text-danger ring-1 ring-danger/40" : "bg-primary/10 text-primary",
                                                        )}
                                                        title={missing ? `${draft.event.trim()} does not supply ${name}; it would render blank.` : undefined}
                                                    >
                                                        {`{{${name}}}`}
                                                    </code>
                                                    {missing && <AlertTriangle className="size-3 text-danger" aria-label="Not supplied by the event" />}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                ) : (
                                    <p className="mt-2 text-xs text-muted-foreground">None.</p>
                                )}
                            </div>
                            <div>
                                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                    {catalogued && catalogued.raisedBy.length > 0 ? `${catalogued.event} supplies` : "The event supplies"}
                                </p>
                                {catalogued && catalogued.raisedBy.length > 0 ? (
                                    catalogued.variables.length > 0 ? (
                                        <ul className="mt-2 flex flex-wrap gap-1.5">
                                            {catalogued.variables.map((name) => (
                                                <li key={name}>
                                                    <code
                                                        className={cn(
                                                            "rounded px-1.5 py-0.5 font-mono text-[11px]",
                                                            diff.unused.includes(name) ? "bg-muted text-muted-foreground" : "bg-success-soft text-success",
                                                        )}
                                                        title={diff.unused.includes(name) ? "Supplied, but no body names it." : "Named in a body and supplied."}
                                                    >
                                                        {name}
                                                    </code>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="mt-2 text-xs text-muted-foreground">Nothing — the raising code passes no variables.</p>
                                    )
                                ) : (
                                    <p className="mt-2 text-xs text-muted-foreground">
                                        {draft.event.trim() ? "Not in the catalogue, so nothing to check against." : "Name the event to see what its raising code supplies."}
                                    </p>
                                )}
                            </div>
                        </div>
                        {diff.missing.length > 0 && (
                            <p className="flex items-start gap-2 border-t px-5 py-3 text-xs text-danger">
                                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                                <span>
                                    {diff.missing.map((name) => `{{${name}}}`).join(", ")} {diff.missing.length === 1 ? "is" : "are"} not supplied by {draft.event.trim()} — {diff.missing.length === 1 ? "it" : "they"} would render blank in every message.
                                </span>
                            </p>
                        )}
                        {template && template.variables.some((name) => !variables.includes(name)) && (
                            <p className="border-t px-5 py-3 text-xs text-muted-foreground">
                                Dropped since the saved version:{" "}
                                {template.variables
                                    .filter((name) => !variables.includes(name))
                                    .map((name) => `{{${name}}}`)
                                    .join(", ")}
                            </p>
                        )}
                    </Card>

                    <Card className="rounded-lg border-border shadow-none">
                        <div className="border-b px-5 py-3">
                            <h3 className="text-sm font-semibold text-foreground">{CHANNEL_LABEL[tab]} preview</h3>
                            <p className="mt-0.5 text-xs text-muted-foreground">The stored text, placeholders marked. Values are filled in when the event fires.</p>
                        </div>
                        <div className="p-5">
                            {tab === "EMAIL" && (
                                <div className="overflow-hidden rounded-lg border">
                                    <div className="border-b bg-muted/40 px-4 py-2.5">
                                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Subject</p>
                                        <p className="mt-0.5 text-sm font-medium text-foreground">
                                            <Placeholders text={draft.subject || "(no subject)"} />
                                        </p>
                                    </div>
                                    <div className="bg-card px-4 py-4">
                                        <p className="text-base font-semibold tracking-tight text-foreground">ADX.</p>
                                        <p className="mt-3 font-mono text-xs leading-6 text-foreground">
                                            <Placeholders text={draft.emailBody || "(no body)"} />
                                        </p>
                                    </div>
                                </div>
                            )}
                            {tab === "PUSH" && (
                                <div className="mx-auto max-w-sm">
                                    <div className="rounded-xl border bg-card px-4 py-3 shadow-sm">
                                        <div className="flex items-center gap-2">
                                            <span className="flex size-5 items-center justify-center rounded bg-primary text-[9px] font-bold text-primary-foreground" aria-hidden>
                                                A
                                            </span>
                                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">ADX · now</p>
                                        </div>
                                        <p className="mt-2 text-sm font-semibold text-foreground">
                                            <Placeholders text={draft.pushTitle || draft.subject || "(no title)"} />
                                        </p>
                                        <p className="mt-1 text-sm leading-5 text-foreground">
                                            <Placeholders text={draft.pushBody || draft.smsBody || "(no body)"} />
                                        </p>
                                    </div>
                                    <p className="mt-2 text-center text-xs text-muted-foreground">
                                        {draft.pushTitle || draft.pushBody ? "Push copy of its own" : "No push copy — the subject and the SMS text are shown"}
                                    </p>
                                </div>
                            )}
                            {tab === "SMS" && (
                                <div className="mx-auto max-w-sm">
                                    <div className="rounded-2xl rounded-bl-sm bg-muted px-4 py-3">
                                        <p className="text-sm leading-6 text-foreground">
                                            <Placeholders text={draft.smsBody || "(no text)"} />
                                        </p>
                                    </div>
                                    <p className="mt-2 text-center text-xs text-muted-foreground">
                                        {draft.smsKind ? `Rendered by the rail as ${draft.smsKind}` : "No kind set — the dispatcher skips the SMS"}
                                    </p>
                                </div>
                            )}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */

/**
 * The template library and its editor — the DR 10 Comms frame over
 * `GET/POST/PATCH /comms/templates`.
 *
 * The frame's cards are these: key, event, status, a preview of the
 * subject, the channel chips and — since E10-2 — the 30-day sent,
 * delivered and failed counts with the delivery rate, off each row's
 * `stats`, summed into the header line.
 *
 * Lot G (package CG4, Q117): "Send test" is back on the editor over
 * `POST /comms/templates/:key/send-test` — the saved row with sample
 * values, to the signed-in operator's own address, which is what the
 * button says. The rules card is the platform's quiet hours and weekly
 * cap, read off `GET /settings/platform` and edited on /settings under
 * Comms, with a per-template Transactional switch (`transactional` on
 * the row) deciding whether they apply. The seed's audiences and
 * conditions are removed with the decision (Q117): the dispatcher fires
 * on the event alone, to the party the event names — there is no
 * audience to pick and no condition to evaluate, so a control for either
 * would be a rule nothing enforces. Delays went the same way.
 *
 * The editor's Variables card reads `GET /comms/events` — what the code
 * raising the event actually supplies — beside the placeholders typed,
 * and flags one the event does not provide. The SMS kinds come from
 * `GET /comms/sms-kinds` rather than a list typed here.
 *
 * G13-C (`5102:27028`, G10 Q103): PUSH is the third channel the editor
 * switches on, with the row's `pushTitle` / `pushBody` under their own tab
 * and a push preview beside the email and SMS ones; blank push copy shows
 * the subject and the SMS text, which is what the dispatcher does.
 */
export function TemplatesView({ page, vocabulary, selection, onSelectionChange, q, onSearch, onChanged }: TemplatesViewProps) {
    const [openKey, setOpenKey] = React.useState<string | null>(null);
    const [creating, setCreating] = React.useState(false);

    const open = page.items.find((template) => template.key === openKey) ?? null;

    if (creating) {
        return (
            <Editor
                key="new"
                template={null}
                vocabulary={vocabulary}
                onBack={() => setCreating(false)}
                onSaved={() => {
                    setCreating(false);
                    onChanged();
                }}
            />
        );
    }

    if (open) {
        return (
            // Keyed on key and version so a save's re-read remounts the editor
            // on the server's row, and switching templates resets the draft.
            <Editor key={`${open.key}:${open.version}`} template={open} vocabulary={vocabulary} onBack={() => setOpenKey(null)} onSaved={onChanged} />
        );
    }

    return (
        <Library
            page={page}
            selection={selection}
            onSelectionChange={onSelectionChange}
            q={q}
            onSearch={onSearch}
            onOpen={(template) => setOpenKey(template.key)}
            onNew={() => setCreating(true)}
        />
    );
}
