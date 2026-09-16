"use client";

import * as React from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/adx/page-header";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
    ANALYTICS_LEVELS,
    PLAN_ENTITLEMENT_FIELDS,
    PLAN_MONEY,
    PLAN_SORT_ORDER_MAX,
    entitlementLabel,
    entitlementText,
    formatRate,
    freeFormEntitlements,
    pctToFraction,
    revenueService,
    type PlanEntitlementField,
    type PlanEntitlementValue,
    type PlanEntitlements,
    type PublisherPlan,
    type PublisherPlanPatch,
} from "@/services/revenue";

interface PublisherPlansViewProps {
    plans: PublisherPlan[];
    /** Re-read after any write, so the cards show what the next purchase is priced on. */
    onChanged: () => void;
}

/**
 * The publisher plan editor — Lot J-C over Lot J-B1's catalogue. No DR 10
 * frame draws it, so it composes the console's own cards the way the
 * advertiser editor beside it does: a card per tier with the price and the
 * commission rate edited in place, the typed entitlements as the controls
 * they are, the free-form ones as copy, the POPULAR flag and the active
 * switch.
 *
 * Every write is one `PATCH /revenue/plans/:tier` carrying only the field
 * that changed, followed by a re-read. Two things the page says out loud
 * because the module's invariants do: an edit prices the NEXT purchase
 * only — every subscription and order keeps its own copies — and the
 * entitlements are copy, all but `liveChat`, which a rule reads.
 */
export function PublisherPlansView({ plans, onChanged }: PublisherPlansViewProps) {
    return (
        <div className="space-y-6">
            <PageHeader
                size="section"
                title="Publisher plans"
                subtitle="The three tiers a publisher can subscribe to, and the commission rate each one grants"
            />

            <Card className="rounded-lg border-border bg-muted/40 p-4 shadow-none">
                <p className="text-sm text-foreground">
                    <span className="font-medium">An edit prices the next purchase only.</span> Every subscription
                    already sold — granted here or bought in the app — keeps the rate and the price it was sold on,
                    and every order keeps its quote. Nothing here re-rates anything.
                </p>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    The entitlements on a card are copy the app lists, with one exception: <em>Live chat</em> is read
                    by the support desk, and switching it off takes the tier&apos;s subscribers off live chat.
                </p>
            </Card>

            {plans.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">The catalogue has no plans yet.</p>
            ) : (
                <section aria-label="Publisher plans" className="grid gap-4 lg:grid-cols-3">
                    {plans.map((plan) => (
                        <PublisherPlanCard key={plan.tier} plan={plan} onChanged={onChanged} />
                    ))}
                </section>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* A plan                                                              */
/* ------------------------------------------------------------------ */

export function PublisherPlanCard({ plan, onChanged }: { plan: PublisherPlan; onChanged: () => void }) {
    const [busy, setBusy] = React.useState(false);
    const [editingCopy, setEditingCopy] = React.useState(false);

    /* One PATCH with the diff only, then the re-read. */
    const patch = async (body: PublisherPlanPatch, done: string) => {
        setBusy(true);
        try {
            await revenueService.updatePlan(plan.tier, body);
            toast.success(done, { description: "Priced into the next purchase; nothing already sold changes." });
            onChanged();
            return true;
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The change did not reach ADX.");
            return false;
        } finally {
            setBusy(false);
        }
    };

    const setEntitlement = (key: string, value: PlanEntitlementValue, done: string) =>
        patch({ entitlements: { ...plan.entitlements, [key]: value } }, done);

    return (
        <Card
            className={cn(
                "flex flex-col rounded-lg border-border p-5 shadow-none",
                !plan.active && "border-dashed bg-muted/30",
            )}
            data-testid={`plan-card-${plan.tier}`}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-foreground">{plan.name}</h3>
                        {plan.isPopular && <Badge className="rounded-sm">Popular</Badge>}
                        {!plan.active && <Badge variant="secondary" className="rounded-sm">Inactive</Badge>}
                    </div>
                    <p className="mt-0.5 font-mono text-[11px] tracking-wide text-muted-foreground">{plan.tier}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Label htmlFor={`pplan-active-${plan.tier}`} className="text-xs text-muted-foreground">
                        Active
                    </Label>
                    <Switch
                        id={`pplan-active-${plan.tier}`}
                        checked={plan.active}
                        disabled={busy}
                        aria-label={plan.active ? `Retire ${plan.name}` : `Reactivate ${plan.name}`}
                        onCheckedChange={(next) =>
                            void patch({ isActive: next }, next ? `${plan.name} is on sale again` : `${plan.name} is off the shelf`)
                        }
                    />
                </div>
            </div>

            <div className="mt-3">
                <SortOrderField
                    id={`pplan-order-${plan.tier}`}
                    value={plan.sortOrder}
                    disabled={busy}
                    label={`${plan.name} sort order`}
                    onSave={(sortOrder) => patch({ sortOrder }, `${plan.name} is drawn at position ${sortOrder}`)}
                />
            </div>

            {!plan.active && (
                <p className="mt-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                    Retired: no new purchase or grant can be priced on it, and the app does not list it. Every
                    subscription that carried it keeps its rate. Switch it on to reactivate it.
                </p>
            )}

            <div className="mt-4">
                <InlineValue
                    value={plan.pricePerMonth}
                    display={formatMoney(plan.pricePerMonth)}
                    suffix="/ month"
                    prefix="₹"
                    label={`${plan.name} price per month`}
                    valid={(draft) => PLAN_MONEY.test(draft)}
                    disabled={busy}
                    onSave={(pricePerMonth) => patch({ pricePerMonth }, `${plan.name} is now ${formatMoney(pricePerMonth)} a month`)}
                />
            </div>

            <div className="mt-2">
                <InlineValue
                    value={plan.commissionPct}
                    display={formatRate(plan.ratePct)}
                    suffix="commission on every booking"
                    prefix="%"
                    label={`${plan.name} commission rate`}
                    valid={(draft) => pctToFraction(draft) !== null}
                    disabled={busy}
                    onSave={(pct) => {
                        const ratePct = pctToFraction(pct);
                        if (ratePct === null) return Promise.resolve(false);
                        return patch({ ratePct }, `${plan.name} grants a ${pct}% commission rate`);
                    }}
                    small
                />
                <p className="mt-1 text-[11px] text-muted-foreground/80">
                    The rate ADX takes from a subscriber&apos;s bookings, in place of the platform default.
                </p>
            </div>

            <div className="mt-3 min-h-10">
                {plan.description ? (
                    <p className="text-sm text-muted-foreground">{plan.description}</p>
                ) : (
                    <p className="text-sm italic text-muted-foreground/70">No description on the card.</p>
                )}
            </div>

            <div className="mt-4 space-y-3 border-t pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">What the plan includes</p>
                {PLAN_ENTITLEMENT_FIELDS.map((field) => (
                    <TypedEntitlement
                        key={field.key}
                        plan={plan}
                        field={field}
                        enforced={plan.enforcedKeys.includes(field.key)}
                        disabled={busy}
                        onChange={(value, done) => setEntitlement(field.key, value, done)}
                    />
                ))}
            </div>

            <div className="mt-4 border-t pt-4">
                <FreeFormEntitlements
                    plan={plan}
                    disabled={busy}
                    onSave={(entitlements) => patch({ entitlements }, `${plan.name}'s promises updated`)}
                />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
                <div className="flex items-center gap-2">
                    <Switch
                        id={`pplan-popular-${plan.tier}`}
                        checked={plan.isPopular}
                        disabled={busy}
                        onCheckedChange={(next) =>
                            void patch({ isPopular: next }, next ? `${plan.name} carries the POPULAR flag` : `POPULAR flag off ${plan.name}`)
                        }
                    />
                    <Label htmlFor={`pplan-popular-${plan.tier}`} className="text-xs text-muted-foreground">
                        Popular flag
                    </Label>
                </div>
                <Button variant="outline" size="sm" className="h-8 bg-card" disabled={busy} onClick={() => setEditingCopy(true)}>
                    <Pencil className="mr-1.5 size-3.5" />
                    Edit name &amp; copy
                </Button>
            </div>

            <PlanCopyDialog
                open={editingCopy}
                onOpenChange={setEditingCopy}
                plan={plan}
                onSave={async (body) => {
                    const ok = await patch(body, `${body.name ?? plan.name} updated`);
                    if (ok) setEditingCopy(false);
                }}
            />
        </Card>
    );
}

/* ------------------------------------------------------------------ */
/* The typed entitlements                                              */
/* ------------------------------------------------------------------ */

function TypedEntitlement({
    plan,
    field,
    enforced,
    disabled,
    onChange,
}: {
    plan: PublisherPlan;
    field: PlanEntitlementField;
    enforced: boolean;
    disabled: boolean;
    onChange: (value: PlanEntitlementValue, done: string) => Promise<boolean>;
}) {
    const id = `pplan-${field.key}-${plan.tier}`;
    const value = plan.entitlements[field.key];

    const head = (
        <div className="min-w-0">
            <Label htmlFor={id} className="text-sm font-medium text-foreground">
                {field.label}
                {enforced && (
                    <Badge variant="secondary" className="ml-2 rounded-sm text-[10px]">
                        Enforced
                    </Badge>
                )}
            </Label>
            {enforced && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                    The one the platform reads: off, this tier&apos;s subscribers keep the ticket thread and lose the live
                    desk. Existing subscriptions follow the plan here, not their copy.
                </p>
            )}
        </div>
    );

    if (field.kind === "boolean") {
        /* Absent is "yes" for live chat (only an explicit false excludes) and "no" for the rest. */
        const checked = field.key === "liveChat" ? value !== false : value === true;
        return (
            <div className="flex items-start justify-between gap-3">
                {head}
                <Switch
                    id={id}
                    checked={checked}
                    disabled={disabled}
                    aria-label={`${field.label} on ${plan.name}`}
                    onCheckedChange={(next) =>
                        void onChange(next, next ? `${plan.name} includes ${field.label.toLowerCase()}` : `${plan.name} no longer includes ${field.label.toLowerCase()}`)
                    }
                />
            </div>
        );
    }

    if (field.kind === "number") {
        return (
            <div className="flex items-start justify-between gap-3">
                {head}
                <NumberField
                    id={id}
                    value={typeof value === "number" ? value : null}
                    disabled={disabled}
                    label={`${field.label} on ${plan.name}`}
                    onSave={(next) => onChange(next, `${plan.name} includes ${next} ${field.label.toLowerCase()}`)}
                />
            </div>
        );
    }

    const level = typeof value === "string" && (ANALYTICS_LEVELS as readonly string[]).includes(value) ? value : "";
    return (
        <div className="flex items-start justify-between gap-3">
            {head}
            <Select
                value={level}
                disabled={disabled}
                onValueChange={(next) => void onChange(next, `${plan.name} includes ${next.toLowerCase()} analytics`)}
            >
                <SelectTrigger id={id} className="h-8 w-[130px] bg-card text-xs" aria-label={`${field.label} on ${plan.name}`}>
                    <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                    {ANALYTICS_LEVELS.map((option) => (
                        <SelectItem key={option} value={option}>
                            {option === "BASIC" ? "Basic" : "Advanced"}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

/** An integer 0–1000 saved on blur or Enter, and only when it changed. */
function NumberField({
    id,
    value,
    disabled,
    label,
    onSave,
}: {
    id: string;
    value: number | null;
    disabled: boolean;
    label: string;
    onSave: (next: number) => Promise<boolean>;
}) {
    const [draft, setDraft] = React.useState(value === null ? "" : String(value));
    const commit = () => {
        const trimmed = draft.trim();
        if (!/^\d{1,4}$/.test(trimmed) || Number(trimmed) > PLAN_SORT_ORDER_MAX) {
            setDraft(value === null ? "" : String(value));
            if (trimmed) toast.error(`A whole number from 0 to ${PLAN_SORT_ORDER_MAX}.`);
            return;
        }
        const next = Number(trimmed);
        if (next === value) return;
        void onSave(next).then((ok) => {
            if (!ok) setDraft(value === null ? "" : String(value));
        });
    };
    return (
        <Input
            id={id}
            inputMode="numeric"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => event.key === "Enter" && commit()}
            disabled={disabled}
            aria-label={label}
            placeholder="—"
            className="h-8 w-16 text-center tabular-nums"
            maxLength={4}
        />
    );
}

/* ------------------------------------------------------------------ */
/* Free-form entitlements — copy, edited as copy                       */
/* ------------------------------------------------------------------ */

interface EntitlementDraft {
    key: string;
    value: string;
    /** "Unlimited" is the seed's `null`; a checkbox would imply a gate. */
    unlimited: boolean;
}

const toDrafts = (value: PlanEntitlements): EntitlementDraft[] =>
    Object.entries(value).map(([key, item]) => ({
        key,
        value: item === null ? "" : String(item),
        unlimited: item === null,
    }));

/** Back to what the API stores: a number stays a number, true/false stay booleans, the rest is text. */
function fromDraft(draft: EntitlementDraft): PlanEntitlementValue {
    if (draft.unlimited) return null;
    const text = draft.value.trim();
    if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
    if (text === "true") return true;
    if (text === "false") return false;
    return text;
}

/** The keys the typed controls above do not draw. Saved as the whole object, so the typed ones are kept. */
function FreeFormEntitlements({
    plan,
    disabled,
    onSave,
}: {
    plan: PublisherPlan;
    disabled: boolean;
    onSave: (next: PlanEntitlements) => Promise<boolean>;
}) {
    const [editing, setEditing] = React.useState(false);
    const [drafts, setDrafts] = React.useState<EntitlementDraft[]>([]);
    const [busy, setBusy] = React.useState(false);

    const free = freeFormEntitlements(plan.entitlements);
    const entries = Object.entries(free);

    const begin = () => {
        setDrafts(toDrafts(free));
        setEditing(true);
    };

    const update = (index: number, patch: Partial<EntitlementDraft>) =>
        setDrafts((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

    const keys = drafts.map((row) => row.key.trim());
    const valid =
        drafts.every((row) => row.key.trim().length >= 1 && row.key.trim().length <= 60 && row.value.length <= 200) &&
        new Set(keys).size === keys.length &&
        keys.every((key) => !(key in plan.entitlements) || key in free);

    const save = async () => {
        if (!valid || busy) return;
        const next: PlanEntitlements = {};
        for (const [key, value] of Object.entries(plan.entitlements)) {
            if (!(key in free)) next[key] = value;
        }
        for (const row of drafts) next[row.key.trim()] = fromDraft(row);
        setBusy(true);
        try {
            if (await onSave(next)) setEditing(false);
        } finally {
            setBusy(false);
        }
    };

    if (!editing) {
        return (
            <div>
                <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Other promises</p>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={disabled} onClick={begin}>
                        <Pencil className="mr-1 size-3" />
                        Edit copy
                    </Button>
                </div>
                {entries.length === 0 ? (
                    <p className="mt-2 text-sm italic text-muted-foreground/70">Nothing else on the card.</p>
                ) : (
                    <dl className="mt-2 space-y-1.5 text-sm">
                        {entries.map(([key, item]) => (
                            <div key={key} className="flex items-center justify-between gap-4">
                                <dt className="text-muted-foreground">{entitlementLabel(key)}</dt>
                                <dd className="font-medium tabular-nums text-foreground">{entitlementText(item)}</dd>
                            </div>
                        ))}
                    </dl>
                )}
                <p className="mt-2 text-[11px] text-muted-foreground/80">Listed in the app; enforced nowhere.</p>
            </div>
        );
    }

    return (
        <form
            className="space-y-2"
            onSubmit={(event) => {
                event.preventDefault();
                void save();
            }}
        >
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Other promises</p>
            {drafts.map((row, index) => (
                <div key={index} className="flex items-center gap-1.5">
                    <Input
                        value={row.key}
                        maxLength={60}
                        placeholder="listingsPerMonth"
                        aria-label={`Promise ${index + 1} key`}
                        onChange={(event) => update(index, { key: event.target.value })}
                        className="h-8 flex-1 font-mono text-xs"
                    />
                    <Input
                        value={row.unlimited ? "" : row.value}
                        maxLength={200}
                        placeholder={row.unlimited ? "Unlimited" : "8"}
                        disabled={row.unlimited}
                        aria-label={`Promise ${index + 1} value`}
                        onChange={(event) => update(index, { value: event.target.value })}
                        className="h-8 w-24"
                    />
                    <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <input
                            type="checkbox"
                            checked={row.unlimited}
                            onChange={(event) => update(index, { unlimited: event.target.checked })}
                            aria-label={`Promise ${index + 1} unlimited`}
                        />
                        ∞
                    </label>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={`Remove promise ${index + 1}`}
                        onClick={() => setDrafts((current) => current.filter((_, i) => i !== index))}
                    >
                        <X className="size-3.5" />
                    </Button>
                </div>
            ))}
            <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 bg-card text-xs"
                onClick={() => setDrafts((current) => [...current, { key: "", value: "", unlimited: false }])}
            >
                <Plus className="mr-1 size-3" />
                Add a line
            </Button>
            {!valid && drafts.length > 0 && (
                <p className="text-xs text-danger">
                    Every line needs a key of its own, up to 60 characters, and not one of the typed keys above.
                </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" className="h-8 bg-card" disabled={busy} onClick={() => setEditing(false)}>
                    Cancel
                </Button>
                <Button type="submit" size="sm" className="h-8" disabled={!valid || busy}>
                    {busy ? "Saving…" : "Save copy"}
                </Button>
            </div>
        </form>
    );
}

/* ------------------------------------------------------------------ */
/* A value edited in place — the price, the rate                       */
/* ------------------------------------------------------------------ */

function InlineValue({
    value,
    display,
    prefix,
    suffix,
    label,
    valid,
    disabled,
    small,
    onSave,
}: {
    /** The editable text. */
    value: string;
    /** What the card shows when not editing. */
    display: string;
    prefix: string;
    suffix: string;
    label: string;
    valid: (draft: string) => boolean;
    disabled?: boolean;
    small?: boolean;
    onSave: (next: string) => Promise<boolean>;
}) {
    const [editing, setEditing] = React.useState(false);
    const [draft, setDraft] = React.useState(value);
    const [busy, setBusy] = React.useState(false);

    const trimmed = draft.trim();
    const ok = valid(trimmed);
    const changed = trimmed !== value;

    const begin = () => {
        setDraft(value);
        setEditing(true);
    };

    const save = async () => {
        if (!ok || busy) return;
        if (!changed) {
            setEditing(false);
            return;
        }
        setBusy(true);
        try {
            if (await onSave(trimmed)) setEditing(false);
        } finally {
            setBusy(false);
        }
    };

    if (!editing) {
        return (
            <div className="flex items-baseline gap-2">
                <span className={cn("font-semibold tabular-nums tracking-tight text-foreground", small ? "text-lg" : "text-2xl")}>
                    {display}
                </span>
                <span className="text-sm text-muted-foreground">{suffix}</span>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="ml-auto size-7"
                    disabled={disabled}
                    onClick={begin}
                    aria-label={`Edit ${label}`}
                >
                    <Pencil className="size-3.5" />
                </Button>
            </div>
        );
    }

    return (
        <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
                event.preventDefault();
                void save();
            }}
        >
            <span className="text-sm text-muted-foreground">{prefix}</span>
            <Input
                autoFocus
                inputMode="decimal"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                aria-label={label}
                aria-invalid={!ok || undefined}
                className="h-9 max-w-40 tabular-nums"
                onKeyDown={(event) => {
                    if (event.key === "Escape") setEditing(false);
                }}
            />
            <Button type="submit" size="icon" className="size-8" disabled={!ok || busy} aria-label={`Save ${label}`}>
                <Check className="size-4" />
            </Button>
            <Button
                type="button"
                size="icon"
                variant="outline"
                className="size-8 bg-card"
                disabled={busy}
                onClick={() => setEditing(false)}
                aria-label="Cancel"
            >
                <X className="size-4" />
            </Button>
        </form>
    );
}

/** `sortOrder`, edited in place — an integer 0–1000, saved on blur or Enter, and only when it changed. */
function SortOrderField({
    id,
    value,
    disabled,
    label,
    onSave,
}: {
    id: string;
    value: number;
    disabled: boolean;
    label: string;
    onSave: (sortOrder: number) => Promise<boolean>;
}) {
    return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Label htmlFor={id}>Sort order</Label>
            <NumberField id={id} value={value} disabled={disabled} label={label} onSave={onSave} />
        </div>
    );
}

/** Name and description, in a dialog: two fields that read better with room than inline. */
function PlanCopyDialog({
    open,
    onOpenChange,
    plan,
    onSave,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    plan: PublisherPlan;
    onSave: (body: PublisherPlanPatch) => Promise<void>;
}) {
    const [name, setName] = React.useState(plan.name);
    const [description, setDescription] = React.useState(plan.description ?? "");
    const [busy, setBusy] = React.useState(false);

    /* A fresh form every time the dialog opens, from the row as it now is. */
    const handleOpenChange = (next: boolean) => {
        if (next) {
            setName(plan.name);
            setDescription(plan.description ?? "");
        }
        onOpenChange(next);
    };

    const ready = name.trim().length >= 2 && name.trim().length <= 80 && description.trim().length <= 500;

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        try {
            /* The diff only: a field unchanged is not sent. */
            const body: PublisherPlanPatch = {};
            if (name.trim() !== plan.name) body.name = name.trim();
            const nextDescription = description.trim() ? description.trim() : null;
            if (nextDescription !== (plan.description ?? null)) body.description = nextDescription;
            if (Object.keys(body).length === 0) {
                onOpenChange(false);
                return;
            }
            await onSave(body);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md">
                <form onSubmit={submit} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>Edit {plan.name}</DialogTitle>
                        <DialogDescription>
                            The name and the line under it on the plan card. Subscriptions already sold keep the name
                            they were bought under.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-1.5">
                        <Label htmlFor={`pplan-name-${plan.tier}`}>Name</Label>
                        <Input
                            id={`pplan-name-${plan.tier}`}
                            value={name}
                            maxLength={80}
                            onChange={(event) => setName(event.target.value)}
                            autoComplete="off"
                        />
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor={`pplan-description-${plan.tier}`}>
                            Description <span className="ml-1 font-normal text-muted-foreground">optional</span>
                        </Label>
                        <Textarea
                            id={`pplan-description-${plan.tier}`}
                            value={description}
                            maxLength={500}
                            rows={3}
                            onChange={(event) => setDescription(event.target.value)}
                        />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" className="bg-card" onClick={() => handleOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={!ready || busy}>
                            {busy ? "Saving…" : "Save"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
