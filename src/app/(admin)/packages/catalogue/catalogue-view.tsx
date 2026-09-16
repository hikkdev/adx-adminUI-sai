"use client";

import * as React from "react";
import Link from "next/link";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/adx/page-header";
import { SectionCard } from "@/components/adx/section-card";
import { ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
    ADD_ON_CODE,
    CATALOGUE_MONEY,
    catalogueService,
    entitlementLabel,
    entitlementText,
    LIVE_CHAT_ENTITLEMENT,
    parseSortOrder,
    planHasLiveChat,
    SORT_ORDER_MAX,
    SORT_ORDER_MIN,
    toAddOnCode,
    type AddOn,
    type Catalogue,
    type EntitlementValue,
    type Entitlements,
    type Plan,
    type PlanPatch,
} from "@/services/packages";
import { CATALOGUE_SUBTITLE, CATALOGUE_TITLE } from "./catalogue-constants";

interface CatalogueViewProps {
    catalogue: Catalogue;
    /** Re-read after any write, so the cards show what the next sale is priced on. */
    onChanged: () => void;
}

/**
 * The catalogue editor — Lot D (Q94). No DR 10 frame draws the console side
 * (DR 02's frames draw the agent's plan picker), so this composes the
 * console's own cards and tables: a card per plan with the price edited in
 * place, the entitlements edited as copy, the POPULAR flag and the active
 * switch; then the add-on table with a row editor and a create dialog.
 *
 * Two things the page says out loud because the module's invariants do:
 * a sale keeps its snapshot, so nothing here re-rates anything already
 * sold; and the entitlements are copy — the card lists them, nothing
 * enforces them. Money stays the decimal string off the wire end to end.
 */
export function CatalogueView({ catalogue, onChanged }: CatalogueViewProps) {
    const [adding, setAdding] = React.useState(false);

    return (
        <div className="space-y-6">
            <PageHeader
                size="section"
                title={CATALOGUE_TITLE}
                subtitle={CATALOGUE_SUBTITLE}
                actions={
                    <Button variant="outline" className="bg-card" asChild>
                        <Link href="/packages/sales">Open the sales book</Link>
                    </Button>
                }
            />

            <Card className="rounded-lg border-border bg-muted/40 p-4 shadow-none">
                <p className="text-sm text-foreground">
                    <span className="font-medium">Sales keep their snapshot.</span> A change here prices the{" "}
                    <em>next</em> sale only: every plan already sold keeps the name, the price and the lines it was
                    bought on, and a retired plan or add-on stays on the receipts that carried it.
                </p>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    The entitlements on a card are copy. They are what the plan promises and the app lists — nothing in
                    the platform reads or enforces them.
                </p>
            </Card>

            <section aria-label="Plans" className="grid gap-4 lg:grid-cols-3">
                {catalogue.plans.map((plan) => (
                    <PlanCard key={plan.tier} plan={plan} onChanged={onChanged} />
                ))}
            </section>

            <SectionCard
                title="Add-ons"
                description="Extras any plan can carry, priced per month. Retiring one hides it from the next sale; it stays on every receipt that already has it."
                actions={
                    <Button size="sm" onClick={() => setAdding(true)}>
                        <Plus className="mr-1.5 size-4" />
                        Add add-on
                    </Button>
                }
                contentClassName="p-0"
            >
                {catalogue.addOns.length === 0 ? (
                    <p className="px-5 py-10 text-center text-sm text-muted-foreground">No add-ons yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                    <th className="px-4 py-2.5 font-medium">Add-on</th>
                                    <th className="px-4 py-2.5 font-medium">Code</th>
                                    <th className="px-4 py-2.5 font-medium">Per month</th>
                                    <th className="px-4 py-2.5 font-medium">Order</th>
                                    <th className="px-4 py-2.5 font-medium">Active</th>
                                    <th className="px-4 py-2.5 font-medium text-right">
                                        <span className="sr-only">Edit</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {catalogue.addOns.map((addOn) => (
                                    <AddOnRow key={addOn.code} addOn={addOn} onChanged={onChanged} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </SectionCard>

            <NewAddOnDialog
                open={adding}
                onOpenChange={setAdding}
                onCreated={() => {
                    setAdding(false);
                    onChanged();
                }}
            />
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* A plan                                                              */
/* ------------------------------------------------------------------ */

function PlanCard({ plan, onChanged }: { plan: Plan; onChanged: () => void }) {
    const [busy, setBusy] = React.useState(false);
    const [editingCopy, setEditingCopy] = React.useState(false);

    const patch = async (body: PlanPatch, done: string) => {
        setBusy(true);
        try {
            await catalogueService.updatePlan(plan.tier, body);
            toast.success(done, { description: "Priced into the next sale; nothing already sold changes." });
            onChanged();
            return true;
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The change did not reach ADX.");
            return false;
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card
            className={cn(
                "flex flex-col rounded-lg border-border p-5 shadow-none",
                !plan.active && "border-dashed bg-muted/30",
            )}
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
                    <Label htmlFor={`plan-active-${plan.tier}`} className="text-xs text-muted-foreground">
                        Active
                    </Label>
                    <Switch
                        id={`plan-active-${plan.tier}`}
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
                    id={`plan-order-${plan.tier}`}
                    value={plan.sortOrder}
                    disabled={busy || plan.id === null}
                    label={`${plan.name} sort order`}
                    onSave={(sortOrder) => patch({ sortOrder }, `${plan.name} is drawn at position ${sortOrder}`)}
                />
            </div>

            {plan.id === null && (
                <p className="mt-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                    The catalogue has no row for this tier. Switching it on seeds it with the name and price the
                    platform ships.
                </p>
            )}
            {plan.id !== null && !plan.active && (
                <p className="mt-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                    Retired: no new sale can be priced on it, and the app does not list it. Every sale that carried it
                    keeps its snapshot. Switch it on to reactivate it.
                </p>
            )}

            <div className="mt-4">
                <InlinePrice
                    value={plan.pricePerMonth}
                    disabled={busy}
                    label={`${plan.name} price per month`}
                    onSave={(pricePerMonth) => patch({ pricePerMonth }, `${plan.name} is now ${formatMoney(pricePerMonth)} a month`)}
                />
            </div>

            <div className="mt-3 min-h-10">
                {plan.description ? (
                    <p className="text-sm text-muted-foreground">{plan.description}</p>
                ) : (
                    <p className="text-sm italic text-muted-foreground/70">No description on the card.</p>
                )}
            </div>

            <div className="mt-4 border-t pt-4">
                <EntitlementsEditor
                    value={plan.entitlements}
                    disabled={busy}
                    onSave={(entitlements) => patch({ entitlements }, `${plan.name}'s promises updated`)}
                />
            </div>

            {/* Lot I: the one entitlement the platform reads rather than prints.
                `liveChat: false` is what takes this plan's advertisers off the
                live desk; absent or true, they are on it. */}
            <div className="mt-4 flex items-start justify-between gap-3 border-t pt-4">
                <div className="min-w-0">
                    <Label htmlFor={`plan-live-chat-${plan.tier}`} className="text-sm font-medium text-foreground">
                        Live chat
                    </Label>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        Unlike the promises above, this one is read: an advertiser on an active sale of this plan can
                        open a live chat while it is on, and keeps the ticket thread while it is off. Existing sales
                        follow the plan here, not their snapshot.
                    </p>
                </div>
                <Switch
                    id={`plan-live-chat-${plan.tier}`}
                    checked={planHasLiveChat(plan.entitlements)}
                    disabled={busy || plan.id === null}
                    aria-label={`Live chat on ${plan.name}`}
                    onCheckedChange={(next) =>
                        void patch(
                            { entitlements: { ...plan.entitlements, [LIVE_CHAT_ENTITLEMENT]: next } },
                            next ? `${plan.name} includes live chat` : `${plan.name} no longer includes live chat`,
                        )
                    }
                />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
                <div className="flex items-center gap-2">
                    <Switch
                        id={`plan-popular-${plan.tier}`}
                        checked={plan.isPopular}
                        disabled={busy}
                        onCheckedChange={(next) =>
                            void patch({ isPopular: next }, next ? `${plan.name} carries the POPULAR flag` : `POPULAR flag off ${plan.name}`)
                        }
                    />
                    <Label htmlFor={`plan-popular-${plan.tier}`} className="text-xs text-muted-foreground">
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

/** Name and description, in a dialog: two fields that read better with room than inline. */
function PlanCopyDialog({
    open,
    onOpenChange,
    plan,
    onSave,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    plan: Plan;
    onSave: (body: PlanPatch) => Promise<void>;
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

    const ready = name.trim().length >= 1 && name.trim().length <= 80 && description.trim().length <= 300;

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        try {
            await onSave({ name: name.trim(), description: description.trim() ? description.trim() : null });
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
                            The name and the line under it on the plan card. Sales already made keep the name they were
                            bought under.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-1.5">
                        <Label htmlFor={`plan-name-${plan.tier}`}>Name</Label>
                        <Input
                            id={`plan-name-${plan.tier}`}
                            value={name}
                            maxLength={80}
                            onChange={(event) => setName(event.target.value)}
                            autoComplete="off"
                        />
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor={`plan-description-${plan.tier}`}>
                            Description <span className="ml-1 font-normal text-muted-foreground">optional</span>
                        </Label>
                        <Textarea
                            id={`plan-description-${plan.tier}`}
                            value={description}
                            maxLength={300}
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

/* ------------------------------------------------------------------ */
/* The price, edited in place                                          */
/* ------------------------------------------------------------------ */

function InlinePrice({
    value,
    label,
    disabled,
    onSave,
}: {
    /** Decimal string. */
    value: string;
    label: string;
    disabled?: boolean;
    onSave: (next: string) => Promise<boolean>;
}) {
    const [editing, setEditing] = React.useState(false);
    const [draft, setDraft] = React.useState(value);
    const [busy, setBusy] = React.useState(false);

    const trimmed = draft.trim();
    const valid = CATALOGUE_MONEY.test(trimmed);
    const changed = trimmed !== value;

    const begin = () => {
        setDraft(value);
        setEditing(true);
    };

    const save = async () => {
        if (!valid || busy) return;
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
                <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                    {formatMoney(value)}
                </span>
                <span className="text-sm text-muted-foreground">/ month</span>
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
            <span className="text-sm text-muted-foreground">₹</span>
            <Input
                autoFocus
                inputMode="decimal"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                aria-label={label}
                aria-invalid={!valid || undefined}
                className="h-9 max-w-40 tabular-nums"
                onKeyDown={(event) => {
                    if (event.key === "Escape") setEditing(false);
                }}
            />
            <Button type="submit" size="icon" className="size-8" disabled={!valid || busy} aria-label="Save price">
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

/* ------------------------------------------------------------------ */
/* Entitlements — copy, edited as copy                                 */
/* ------------------------------------------------------------------ */

interface EntitlementDraft {
    key: string;
    value: string;
    /** "Unlimited" is the seed's `null`; a checkbox would imply a gate. */
    unlimited: boolean;
}

const toDrafts = (value: Entitlements): EntitlementDraft[] =>
    Object.entries(value).map(([key, item]) => ({
        key,
        value: item === null ? "" : String(item),
        unlimited: item === null,
    }));

/** Back to what the API stores: a number stays a number, true/false stay booleans, the rest is text. */
function fromDraft(draft: EntitlementDraft): EntitlementValue {
    if (draft.unlimited) return null;
    const text = draft.value.trim();
    if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
    if (text === "true") return true;
    if (text === "false") return false;
    return text;
}

function EntitlementsEditor({
    value,
    disabled,
    onSave,
}: {
    value: Entitlements;
    disabled?: boolean;
    onSave: (next: Entitlements) => Promise<boolean>;
}) {
    const [editing, setEditing] = React.useState(false);
    const [drafts, setDrafts] = React.useState<EntitlementDraft[]>([]);
    const [busy, setBusy] = React.useState(false);

    const entries = Object.entries(value);

    const begin = () => {
        setDrafts(toDrafts(value));
        setEditing(true);
    };

    const update = (index: number, patch: Partial<EntitlementDraft>) =>
        setDrafts((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

    const keys = drafts.map((row) => row.key.trim());
    const valid =
        drafts.every((row) => row.key.trim().length >= 1 && row.key.trim().length <= 60 && row.value.length <= 200) &&
        new Set(keys).size === keys.length;

    const save = async () => {
        if (!valid || busy) return;
        const next: Entitlements = {};
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
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">What the card promises</p>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={disabled} onClick={begin}>
                        <Pencil className="mr-1 size-3" />
                        Edit copy
                    </Button>
                </div>
                {entries.length === 0 ? (
                    <p className="mt-2 text-sm italic text-muted-foreground/70">Nothing listed on the card.</p>
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
                <p className="mt-2 text-[11px] text-muted-foreground/80">Listed on the card; enforced nowhere.</p>
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
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">What the card promises</p>
            {drafts.map((row, index) => (
                <div key={index} className="flex items-center gap-1.5">
                    <Input
                        value={row.key}
                        maxLength={60}
                        placeholder="campaignsPerMonth"
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
                <p className="text-xs text-danger">Every line needs a key of its own, up to 60 characters.</p>
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
/* Add-ons                                                             */
/* ------------------------------------------------------------------ */

function AddOnRow({ addOn, onChanged }: { addOn: AddOn; onChanged: () => void }) {
    const [busy, setBusy] = React.useState(false);
    const [editing, setEditing] = React.useState(false);
    const [name, setName] = React.useState(addOn.name);
    const [description, setDescription] = React.useState(addOn.description ?? "");

    const patch = async (body: Parameters<typeof catalogueService.updateAddOn>[1], done: string) => {
        setBusy(true);
        try {
            await catalogueService.updateAddOn(addOn.code, body);
            toast.success(done, { description: "On the next sale; every receipt that has it keeps it." });
            onChanged();
            return true;
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The change did not reach ADX.");
            return false;
        } finally {
            setBusy(false);
        }
    };

    const begin = () => {
        setName(addOn.name);
        setDescription(addOn.description ?? "");
        setEditing(true);
    };

    const saveCopy = async () => {
        const trimmed = name.trim();
        if (!trimmed || trimmed.length > 80 || description.trim().length > 300) return;
        const ok = await patch(
            { name: trimmed, description: description.trim() ? description.trim() : null },
            `${trimmed} updated`,
        );
        if (ok) setEditing(false);
    };

    return (
        <tr className="border-b align-top last:border-0">
            <td className="px-4 py-3">
                {editing ? (
                    <form
                        className="space-y-2"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void saveCopy();
                        }}
                    >
                        <Input
                            value={name}
                            maxLength={80}
                            onChange={(event) => setName(event.target.value)}
                            aria-label={`${addOn.code} name`}
                            className="h-8"
                        />
                        <Textarea
                            value={description}
                            maxLength={300}
                            rows={2}
                            onChange={(event) => setDescription(event.target.value)}
                            aria-label={`${addOn.code} description`}
                            placeholder="What it gives the advertiser"
                        />
                        <div className="flex gap-2">
                            <Button type="submit" size="sm" className="h-7" disabled={busy || !name.trim()}>
                                {busy ? "Saving…" : "Save"}
                            </Button>
                            <Button type="button" size="sm" variant="outline" className="h-7 bg-card" disabled={busy} onClick={() => setEditing(false)}>
                                Cancel
                            </Button>
                        </div>
                    </form>
                ) : (
                    <div>
                        <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                            {addOn.name}
                            {!addOn.active && (
                                <Badge variant="secondary" className="rounded-sm">
                                    Inactive
                                </Badge>
                            )}
                        </p>
                        {addOn.description && <p className="text-xs text-muted-foreground">{addOn.description}</p>}
                    </div>
                )}
            </td>
            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{addOn.code}</td>
            <td className="px-4 py-3">
                <InlinePrice
                    value={addOn.pricePerMonth}
                    label={`${addOn.name} price per month`}
                    disabled={busy}
                    onSave={(pricePerMonth) => patch({ pricePerMonth }, `${addOn.name} is now ${formatMoney(pricePerMonth)} a month`)}
                />
            </td>
            <td className="px-4 py-3">
                <SortOrderField
                    id={`addon-order-${addOn.code}`}
                    value={addOn.sortOrder}
                    disabled={busy}
                    label={`${addOn.name} sort order`}
                    compact
                    onSave={(sortOrder) => patch({ sortOrder }, `${addOn.name} is drawn at position ${sortOrder}`)}
                />
            </td>
            <td className="px-4 py-3">
                <Switch
                    checked={addOn.active}
                    disabled={busy}
                    aria-label={addOn.active ? `Retire ${addOn.name}` : `Reactivate ${addOn.name}`}
                    onCheckedChange={(next) =>
                        void patch({ isActive: next }, next ? `${addOn.name} is back on sale` : `${addOn.name} retired`)
                    }
                />
            </td>
            <td className="px-4 py-3 text-right">
                {!editing && (
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={busy} onClick={begin}>
                        <Pencil className="mr-1 size-3" />
                        Edit
                    </Button>
                )}
            </td>
        </tr>
    );
}

/**
 * E7-3: `sortOrder`, edited in place — an integer 0–100, saved on blur or
 * Enter, and only when it changed. The apps draw the rows in this order.
 */
function SortOrderField({
    id,
    value,
    disabled,
    label,
    compact,
    onSave,
}: {
    id: string;
    value: number | null;
    disabled: boolean;
    label: string;
    compact?: boolean;
    onSave: (sortOrder: number) => Promise<boolean>;
}) {
    const [draft, setDraft] = React.useState(value === null ? "" : String(value));
    const commit = () => {
        const next = parseSortOrder(draft);
        if (next === null) {
            setDraft(value === null ? "" : String(value));
            if (draft.trim()) toast.error(`The sort order is a whole number from ${SORT_ORDER_MIN} to ${SORT_ORDER_MAX}.`);
            return;
        }
        if (next === value) return;
        void onSave(next).then((ok) => {
            if (!ok) setDraft(value === null ? "" : String(value));
        });
    };
    return (
        <div className={cn("flex items-center gap-2", compact ? "" : "text-xs text-muted-foreground")}>
            {!compact && <Label htmlFor={id}>Sort order</Label>}
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
                maxLength={3}
            />
        </div>
    );
}

const EMPTY_ADD_ON = { code: "", name: "", pricePerMonth: "", description: "" };

function NewAddOnDialog({
    open,
    onOpenChange,
    onCreated,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: () => void;
}) {
    const [fields, setFields] = React.useState(EMPTY_ADD_ON);
    const [codeTouched, setCodeTouched] = React.useState(false);
    const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
    const [formError, setFormError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    /* The code follows the name until somebody types one of their own. */
    const code = codeTouched ? fields.code : toAddOnCode(fields.name);
    const ready =
        fields.name.trim().length >= 1 &&
        fields.name.trim().length <= 80 &&
        ADD_ON_CODE.test(code) &&
        code.length >= 2 &&
        code.length <= 60 &&
        CATALOGUE_MONEY.test(fields.pricePerMonth.trim()) &&
        fields.description.trim().length <= 300;

    const reset = () => {
        setFields(EMPTY_ADD_ON);
        setCodeTouched(false);
        setFieldErrors({});
        setFormError(null);
    };

    const handleOpenChange = (next: boolean) => {
        if (!next) reset();
        onOpenChange(next);
    };

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        setFieldErrors({});
        setFormError(null);
        try {
            const created = await catalogueService.createAddOn({
                code,
                name: fields.name.trim(),
                pricePerMonth: fields.pricePerMonth.trim(),
                ...(fields.description.trim() ? { description: fields.description.trim() } : {}),
            });
            toast.success(`${created.name} is on the shelf`, {
                description: `${created.code} · ${formatMoney(created.pricePerMonth)} a month, from the next sale.`,
            });
            reset();
            onCreated();
        } catch (cause) {
            if (cause instanceof ApiError) {
                setFieldErrors(cause.fieldErrors);
                setFormError(cause.message);
            } else {
                setFormError(cause instanceof Error ? cause.message : "Could not add the add-on.");
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md">
                <form onSubmit={submit} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>Add an add-on</DialogTitle>
                        <DialogDescription>
                            An extra any plan can carry. The code is its key on every receipt from now on and cannot
                            change once it exists.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-1.5">
                        <Label htmlFor="addon-name">Name</Label>
                        <Input
                            id="addon-name"
                            value={fields.name}
                            maxLength={80}
                            autoComplete="off"
                            placeholder="Premium analytics"
                            onChange={(event) => setFields((current) => ({ ...current, name: event.target.value }))}
                        />
                        {fieldErrors.name?.[0] && <p className="text-xs text-danger">{fieldErrors.name[0]}</p>}
                    </div>

                    <div className="grid gap-1.5">
                        <Label htmlFor="addon-code">Code</Label>
                        <Input
                            id="addon-code"
                            value={code}
                            maxLength={60}
                            autoComplete="off"
                            className="font-mono"
                            placeholder="PREMIUM_ANALYTICS"
                            onChange={(event) => {
                                setCodeTouched(true);
                                setFields((current) => ({ ...current, code: event.target.value.toUpperCase() }));
                            }}
                        />
                        <p className="text-xs text-muted-foreground">
                            {fieldErrors.code?.[0] ?? "UPPER_SNAKE_CASE, starting with a letter. 409 if it already exists."}
                        </p>
                    </div>

                    <div className="grid gap-1.5">
                        <Label htmlFor="addon-price">Price per month</Label>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">₹</span>
                            <Input
                                id="addon-price"
                                inputMode="decimal"
                                value={fields.pricePerMonth}
                                autoComplete="off"
                                placeholder="2500"
                                className="tabular-nums"
                                onChange={(event) => setFields((current) => ({ ...current, pricePerMonth: event.target.value }))}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {fieldErrors.pricePerMonth?.[0] ?? "Rupees, up to two decimals."}
                        </p>
                    </div>

                    <div className="grid gap-1.5">
                        <Label htmlFor="addon-description">
                            Description <span className="ml-1 font-normal text-muted-foreground">optional</span>
                        </Label>
                        <Textarea
                            id="addon-description"
                            value={fields.description}
                            maxLength={300}
                            rows={2}
                            placeholder="Longer history and per-site breakdowns."
                            onChange={(event) => setFields((current) => ({ ...current, description: event.target.value }))}
                        />
                    </div>

                    {formError && (
                        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" className="bg-card" onClick={() => handleOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={!ready || busy}>
                            {busy ? "Adding…" : "Add add-on"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
