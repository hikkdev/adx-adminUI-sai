"use client";

import * as React from "react";
import { toast } from "sonner";
import { ChevronLeft, Plus, Search, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import {
    ActiveFilters,
    FilterPanel,
    type Facet,
    type FilterSelection,
} from "@/components/adx/filter-panel";
import { cn } from "@/lib/utils";
import { formatDate, formatNumber } from "@/lib/format";
import {
    CONDITION_FIELDS,
    CONDITION_OPERATORS,
    TEMPLATE_AUDIENCE_META,
    TEMPLATE_CHANNEL_META,
    TEMPLATE_DELAY_META,
    TEMPLATE_EVENTS,
    TEMPLATE_STATUS_META,
    type MergeVariable,
    type NotificationTemplate,
    type TemplateAudience,
    type TemplateCategory,
    type TemplateChannel,
    type TemplateCondition,
    type TemplateDelay,
    type TemplateEvent,
    type TemplateSending,
    type TemplateStatus,
} from "@/types";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus as PlusIcon, X } from "lucide-react";

interface TemplatesViewProps {
    templates: NotificationTemplate[];
    variables: MergeVariable[];
}

const CHANNEL_ORDER: TemplateChannel[] = ["email", "sms", "push"];

/** Replace merge tokens with their sample values for the preview. */
function render(text: string, variables: MergeVariable[]) {
    return variables.reduce(
        (out, variable) => out.split(variable.token).join(variable.sample),
        text
    );
}

function tokensUsed(template: NotificationTemplate, variables: MergeVariable[]) {
    const haystack = Object.values(template.content)
        .map((c) => `${c?.subject ?? ""} ${c?.title ?? ""} ${c?.body ?? ""}`)
        .join(" ");
    return variables.filter((v) => haystack.includes(v.token));
}

/* ------------------------------------------------------------------ */
/* Library                                                             */
/* ------------------------------------------------------------------ */

function Library({
    templates,
    variables,
    onOpen,
}: {
    templates: NotificationTemplate[];
    variables: MergeVariable[];
    onOpen: (template: NotificationTemplate) => void;
}) {
    const [query, setQuery] = React.useState("");
    const [selection, setSelection] = React.useState<FilterSelection>({});

    const facets: Facet[] = React.useMemo(
        () => [
            {
                id: "status",
                label: "Status",
                options: (
                    Object.keys(TEMPLATE_STATUS_META) as TemplateStatus[]
                ).map((value) => ({
                    value,
                    label: TEMPLATE_STATUS_META[value].label,
                    count: templates.filter((t) => t.status === value).length,
                })),
            },
            {
                id: "category",
                label: "Area",
                options: Array.from(new Set(templates.map((t) => t.category))).map((value) => ({
                    value,
                    label: value,
                    count: templates.filter((t) => t.category === value).length,
                })),
            },
            {
                id: "channel",
                label: "Channel",
                options: CHANNEL_ORDER.map((channel) => ({
                    value: channel,
                    label: TEMPLATE_CHANNEL_META[channel].label,
                    count: templates.filter((t) => Boolean(t.content[channel])).length,
                })),
            },
        ],
        [templates]
    );

    const visible = React.useMemo(() => {
        const needle = query.trim().toLowerCase();
        const statuses = selection.status ?? [];
        const categories = selection.category ?? [];
        const channels = selection.channel ?? [];
        return templates.filter((template) => {
            if (statuses.length && !statuses.includes(template.status)) return false;
            if (categories.length && !categories.includes(template.category)) return false;
            if (channels.length && !channels.some((c) => template.content[c as TemplateChannel]))
                return false;
            if (!needle) return true;
            return [template.name, template.trigger, template.category]
                .join(" ")
                .toLowerCase()
                .includes(needle);
        });
    }, [templates, query, selection]);

    const live = templates.filter((t) => t.status === "live");
    const sent = templates.reduce((sum, t) => sum + t.sent30d, 0);

    return (
        <div className="space-y-5">
            <PageHeader
                title="Notification templates"
                subtitle={`${live.length} live templates sent ${formatNumber(sent)} messages in the last 30 days`}
                actions={
                    <Button onClick={() => toast.info("Start from a blank template or duplicate an existing one.")}>
                        <Plus className="size-4" />
                        New template
                    </Button>
                }
            />

            <div className="space-y-3">
                <FilterPanel
                    facets={facets}
                    selection={selection}
                    onChange={setSelection}
                    resultCount={visible.length}
                    search={{
                        value: query,
                        onChange: setQuery,
                        placeholder: "Template name or trigger",
                    }}
                />
                <ActiveFilters
                    facets={facets}
                    selection={selection}
                    onChange={setSelection}
                    resultCount={visible.length}
                />
            </div>

            {visible.length ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {visible.map((template) => {
                        const preview =
                            template.content.email?.subject ??
                            template.content.push?.title ??
                            template.content.sms?.body ??
                            "";
                        return (
                            <Card
                                key={template.id}
                                className="flex flex-col rounded-lg border-border shadow-none transition-colors hover:border-foreground/20"
                            >
                                <button
                                    type="button"
                                    onClick={() => onOpen(template)}
                                    className="flex-1 rounded-t-lg px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <h3 className="text-sm font-semibold text-foreground">
                                            {template.name}
                                        </h3>
                                        <StatusBadge status={TEMPLATE_STATUS_META[template.status]} />
                                    </div>
                                    <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                                        {template.trigger}
                                    </p>
                                    <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                                            {template.sending.event}
                                        </code>
                                        <span>
                                            to {TEMPLATE_AUDIENCE_META[template.sending.audience]}
                                        </span>
                                        {template.sending.conditions.length > 0 && (
                                            <span className="text-foreground">
                                                · {template.sending.conditions.length} condition
                                                {template.sending.conditions.length === 1 ? "" : "s"}
                                            </span>
                                        )}
                                    </p>
                                    {preview && (
                                        <p className="mt-3 truncate rounded-md bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground">
                                            {render(preview, variables)}
                                        </p>
                                    )}
                                </button>
                                <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
                                    <div className="flex gap-1">
                                        {CHANNEL_ORDER.filter((c) => template.content[c]).map((c) => (
                                            <span
                                                key={c}
                                                className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                                            >
                                                {TEMPLATE_CHANNEL_META[c].label}
                                            </span>
                                        ))}
                                    </div>
                                    <p className="text-xs tabular-nums text-muted-foreground">
                                        {template.sent30d
                                            ? `${formatNumber(template.sent30d)} sent`
                                            : "Not sending"}
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
                        Clear the filters, or create a template for this area.
                    </p>
                </Card>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Sending rules                                                       */
/* ------------------------------------------------------------------ */

function SendingRules({
    rules,
    onChange,
}: {
    rules: TemplateSending;
    onChange: (next: TemplateSending) => void;
}) {
    const set = (patch: Partial<TemplateSending>) => onChange({ ...rules, ...patch });

    const setCondition = (id: string, patch: Partial<TemplateCondition>) =>
        set({
            conditions: rules.conditions.map((condition) =>
                condition.id === id ? { ...condition, ...patch } : condition
            ),
        });

    const addCondition = () =>
        set({
            conditions: [
                ...rules.conditions,
                {
                    id: `c-${rules.conditions.length + 1}-${rules.conditions.length}`,
                    field: CONDITION_FIELDS[0],
                    operator: CONDITION_OPERATORS[0],
                    value: "",
                },
            ],
        });

    return (
        <Card className="rounded-lg border-border shadow-none">
            <div className="border-b px-5 py-3">
                <h3 className="text-sm font-semibold text-foreground">When this sends</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    The event that fires it, and the conditions that must hold
                </p>
            </div>

            <div className="space-y-4 px-5 py-4">
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="tpl-event">Trigger event</Label>
                        <Select
                            value={rules.event}
                            onValueChange={(value) => set({ event: value as TemplateEvent })}
                        >
                            <SelectTrigger id="tpl-event">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {TEMPLATE_EVENTS.map((event) => (
                                    <SelectItem key={event} value={event}>
                                        {event}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="tpl-audience">Send to</Label>
                        <Select
                            value={rules.audience}
                            onValueChange={(value) => set({ audience: value as TemplateAudience })}
                        >
                            <SelectTrigger id="tpl-audience">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(
                                    Object.keys(TEMPLATE_AUDIENCE_META) as TemplateAudience[]
                                ).map((audience) => (
                                    <SelectItem key={audience} value={audience}>
                                        {TEMPLATE_AUDIENCE_META[audience]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Conditions -------------------------------------------- */}
                <div className="space-y-2 border-t pt-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-medium text-foreground">Conditions</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {rules.conditions.length
                                    ? "Every condition must hold before it sends"
                                    : "No conditions — sends on every matching event"}
                            </p>
                        </div>
                        <Button variant="outline" size="sm" className="bg-card" onClick={addCondition}>
                            <PlusIcon className="size-3.5" />
                            Add
                        </Button>
                    </div>

                    {rules.conditions.map((condition) => (
                        <div
                            key={condition.id}
                            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                        >
                            <Select
                                value={condition.field}
                                onValueChange={(value) =>
                                    setCondition(condition.id, {
                                        field: value as TemplateCondition["field"],
                                    })
                                }
                            >
                                <SelectTrigger aria-label="Condition field">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {CONDITION_FIELDS.map((field) => (
                                        <SelectItem key={field} value={field}>
                                            {field}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select
                                value={condition.operator}
                                onValueChange={(value) =>
                                    setCondition(condition.id, {
                                        operator: value as TemplateCondition["operator"],
                                    })
                                }
                            >
                                <SelectTrigger aria-label="Condition operator">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {CONDITION_OPERATORS.map((operator) => (
                                        <SelectItem key={operator} value={operator}>
                                            {operator}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Input
                                value={condition.value}
                                placeholder="Value"
                                aria-label="Condition value"
                                onChange={(event) =>
                                    setCondition(condition.id, { value: event.target.value })
                                }
                            />
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Remove condition on ${condition.field}`}
                                onClick={() =>
                                    set({
                                        conditions: rules.conditions.filter(
                                            (c) => c.id !== condition.id
                                        ),
                                    })
                                }
                            >
                                <X className="size-4" />
                            </Button>
                        </div>
                    ))}
                </div>

                {/* Delivery controls ------------------------------------- */}
                <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="tpl-delay">Send</Label>
                        <Select
                            value={rules.delay}
                            onValueChange={(value) => set({ delay: value as TemplateDelay })}
                        >
                            <SelectTrigger id="tpl-delay">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(Object.keys(TEMPLATE_DELAY_META) as TemplateDelay[]).map((d) => (
                                    <SelectItem key={d} value={d}>
                                        {TEMPLATE_DELAY_META[d]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="tpl-cap">Max per recipient each week</Label>
                        <Input
                            id="tpl-cap"
                            type="number"
                            min="0"
                            value={rules.weeklyCap}
                            onChange={(event) => set({ weeklyCap: Number(event.target.value) })}
                            className="tabular-nums"
                        />
                        <p className="text-xs text-muted-foreground">
                            {rules.weeklyCap === 0 ? "Uncapped" : "Extra sends are dropped"}
                        </p>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-4 border-t pt-4">
                    <div>
                        <p className="text-sm font-medium text-foreground">Respect quiet hours</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Hold between 9pm and 8am in the recipient's city
                        </p>
                    </div>
                    <Switch
                        checked={rules.respectQuietHours}
                        onCheckedChange={(checked) => set({ respectQuietHours: checked })}
                    />
                </div>
            </div>
        </Card>
    );
}

/* ------------------------------------------------------------------ */
/* Editor                                                              */
/* ------------------------------------------------------------------ */

function Editor({
    template,
    variables,
    onBack,
    onSave,
}: {
    template: NotificationTemplate;
    variables: MergeVariable[];
    onBack: () => void;
    onSave: (next: NotificationTemplate) => void;
}) {
    const available = CHANNEL_ORDER.filter((c) => template.content[c]);
    const [channel, setChannel] = React.useState<TemplateChannel>(available[0] ?? "email");
    const [draft, setDraft] = React.useState(template.content);
    const [rules, setRules] = React.useState(template.sending);
    const bodyRef = React.useRef<HTMLTextAreaElement>(null);

    React.useEffect(() => {
        setDraft(template.content);
        setRules(template.sending);
        setChannel(CHANNEL_ORDER.filter((c) => template.content[c])[0] ?? "email");
    }, [template]);

    const current = draft[channel];
    const limit = TEMPLATE_CHANNEL_META[channel].limit;
    const used = tokensUsed({ ...template, content: draft }, variables);

    const update = (patch: Partial<{ subject: string; title: string; body: string }>) =>
        setDraft((prev) => ({
            ...prev,
            [channel]: { ...(prev[channel] ?? { body: "" }), ...patch },
        }));

    const insert = (token: string) => {
        const el = bodyRef.current;
        const body = current?.body ?? "";
        if (!el) {
            update({ body: `${body}${token}` });
            return;
        }
        const start = el.selectionStart ?? body.length;
        const end = el.selectionEnd ?? body.length;
        update({ body: body.slice(0, start) + token + body.slice(end) });
        window.requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(start + token.length, start + token.length);
        });
    };

    const renderedBody = render(current?.body ?? "", variables);

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
                            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                                {template.name}
                            </h1>
                            <StatusBadge status={TEMPLATE_STATUS_META[template.status]} />
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{template.trigger}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {template.category} · edited {formatDate(template.updatedAt)} by{" "}
                            {template.updatedBy}
                            {template.deliveryRate !== null &&
                                ` · ${template.deliveryRate}% delivered over ${formatNumber(template.sent30d)} sends`}
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <Button
                            variant="outline"
                            className="bg-card"
                            onClick={() => toast.success("Test sent to priya.rao@adx.co.in")}
                        >
                            <Send className="size-4" />
                            Send test
                        </Button>
                        <Button
                            onClick={() => {
                                onSave({ ...template, content: draft, sending: rules });
                                toast.success(`"${template.name}" published`);
                            }}
                        >
                            Publish changes
                        </Button>
                    </div>
                </div>
            </div>

            <div className="grid items-start gap-4 xl:grid-cols-2">
                {/* Compose ------------------------------------------------ */}
                <div className="space-y-4">
                    <SendingRules rules={rules} onChange={setRules} />

                    <Card className="rounded-lg border-border shadow-none">
                        <div className="flex gap-1 border-b px-5 pt-3">
                            {CHANNEL_ORDER.map((option) => {
                                const enabled = Boolean(draft[option]);
                                return (
                                    <button
                                        key={option}
                                        type="button"
                                        onClick={() =>
                                            enabled
                                                ? setChannel(option)
                                                : setDraft((prev) => ({
                                                      ...prev,
                                                      [option]: { body: "" },
                                                  }))
                                        }
                                        className={cn(
                                            "relative -mb-px border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors",
                                            channel === option && enabled
                                                ? "border-primary text-foreground"
                                                : "border-transparent text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        {TEMPLATE_CHANNEL_META[option].label}
                                        {!enabled && (
                                            <span className="ml-1.5 text-xs font-normal opacity-60">
                                                add
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="space-y-4 px-5 py-4">
                            {channel === "email" && (
                                <div className="space-y-1.5">
                                    <Label htmlFor="tpl-subject">Subject line</Label>
                                    <Input
                                        id="tpl-subject"
                                        value={current?.subject ?? ""}
                                        onChange={(event) => update({ subject: event.target.value })}
                                    />
                                </div>
                            )}
                            {channel === "push" && (
                                <div className="space-y-1.5">
                                    <Label htmlFor="tpl-title">Notification title</Label>
                                    <Input
                                        id="tpl-title"
                                        value={current?.title ?? ""}
                                        onChange={(event) => update({ title: event.target.value })}
                                    />
                                </div>
                            )}
                            <div className="space-y-1.5">
                                <div className="flex items-end justify-between gap-3">
                                    <Label htmlFor="tpl-body">Message</Label>
                                    {limit && (
                                        <span
                                            className={cn(
                                                "text-xs tabular-nums",
                                                renderedBody.length > limit
                                                    ? "text-danger"
                                                    : "text-muted-foreground"
                                            )}
                                        >
                                            {renderedBody.length} / {limit} rendered
                                        </span>
                                    )}
                                </div>
                                <Textarea
                                    id="tpl-body"
                                    ref={bodyRef}
                                    rows={channel === "email" ? 8 : 4}
                                    value={current?.body ?? ""}
                                    onChange={(event) => update({ body: event.target.value })}
                                    className="font-mono text-xs leading-6"
                                />
                            </div>
                        </div>
                    </Card>

                    <Card className="rounded-lg border-border shadow-none">
                        <div className="border-b px-5 py-3">
                            <h3 className="text-sm font-semibold text-foreground">Merge variables</h3>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                Click to insert at the cursor. {used.length} in use.
                            </p>
                        </div>
                        <ul className="divide-y">
                            {variables.map((variable) => {
                                const inUse = used.some((u) => u.token === variable.token);
                                return (
                                    <li key={variable.token}>
                                        <button
                                            type="button"
                                            onClick={() => insert(variable.token)}
                                            className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                        >
                                            <code
                                                className={cn(
                                                    "shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px]",
                                                    inUse
                                                        ? "bg-primary/10 text-primary"
                                                        : "bg-muted text-muted-foreground"
                                                )}
                                            >
                                                {variable.token}
                                            </code>
                                            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                                                {variable.helper}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </Card>
                </div>

                {/* Preview ------------------------------------------------ */}
                <Card className="rounded-lg border-border shadow-none xl:sticky xl:top-20">
                    <div className="border-b px-5 py-3">
                        <h3 className="text-sm font-semibold text-foreground">
                            {TEMPLATE_CHANNEL_META[channel].label} preview
                        </h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Rendered with sample values
                        </p>
                    </div>

                    <div className="p-5">
                        {channel === "email" && (
                            <div className="overflow-hidden rounded-lg border">
                                <div className="border-b bg-muted/40 px-4 py-2.5">
                                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                        Subject
                                    </p>
                                    <p className="mt-0.5 text-sm font-medium text-foreground">
                                        {render(current?.subject ?? "", variables)}
                                    </p>
                                </div>
                                <div className="bg-card px-4 py-4">
                                    <p className="text-base font-semibold tracking-tight text-foreground">
                                        ADX.
                                    </p>
                                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground">
                                        {renderedBody}
                                    </p>
                                    <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                                        You are receiving this because you have an ADX account.
                                    </p>
                                </div>
                            </div>
                        )}

                        {channel === "sms" && (
                            <div className="mx-auto max-w-sm">
                                <div className="rounded-2xl rounded-bl-sm bg-muted px-4 py-3">
                                    <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                                        {renderedBody}
                                    </p>
                                </div>
                                <p className="mt-2 text-center text-xs text-muted-foreground">
                                    Delivered as {Math.max(1, Math.ceil(renderedBody.length / 160))} SMS
                                    segment{renderedBody.length > 160 ? "s" : ""}
                                </p>
                            </div>
                        )}

                        {channel === "push" && (
                            <div className="mx-auto max-w-sm rounded-xl border bg-card px-4 py-3 shadow-sm">
                                <div className="flex items-center gap-2">
                                    <span className="flex size-5 items-center justify-center rounded bg-primary text-[9px] font-semibold text-primary-foreground">
                                        A
                                    </span>
                                    <p className="text-xs font-medium text-muted-foreground">ADX</p>
                                    <p className="ml-auto text-xs text-muted-foreground">now</p>
                                </div>
                                <p className="mt-2 text-sm font-semibold text-foreground">
                                    {render(current?.title ?? "", variables)}
                                </p>
                                <p className="mt-0.5 text-sm leading-6 text-muted-foreground">
                                    {renderedBody}
                                </p>
                            </div>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */

export function TemplatesView({ templates: seed, variables }: TemplatesViewProps) {
    const [templates, setTemplates] = React.useState(seed);
    const [openId, setOpenId] = React.useState<string | null>(null);

    const open = templates.find((template) => template.id === openId) ?? null;

    if (open) {
        return (
            <Editor
                template={open}
                variables={variables}
                onBack={() => setOpenId(null)}
                onSave={(next) =>
                    setTemplates((current) =>
                        current.map((template) => (template.id === next.id ? next : template))
                    )
                }
            />
        );
    }

    return (
        <Library
            templates={templates}
            variables={variables}
            onOpen={(template) => setOpenId(template.id)}
        />
    );
}
