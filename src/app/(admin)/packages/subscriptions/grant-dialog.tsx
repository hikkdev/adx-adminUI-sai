"use client";

import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
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
import { ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { cn } from "@/lib/utils";
import {
    PLAN_MONEY,
    formatRate,
    pctToFraction,
    revenueService,
    type PublisherPlan,
    type SubscriptionGrant,
} from "@/services/revenue";
import { supplyService, type RosterPublisher } from "@/services/supply";
import type { SubscriptionTierName } from "@/types/revenue";

export interface GrantDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The catalogue, for the tier picker and the prefill. */
    plans: PublisherPlan[];
    /** Fixed when the dialog opens from a publisher's own page; picked from the roster otherwise. */
    publisher?: { id: string; name: string } | null;
    onGranted: () => void;
}

/** Today as the date input wants it, in the operator's own calendar. */
export function todayInput(now = new Date()): string {
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
}

/** The plan a fresh form starts on: the first active one, else the first. */
export function defaultTier(plans: PublisherPlan[]): SubscriptionTierName | null {
    return (plans.find((plan) => plan.active) ?? plans[0])?.tier ?? null;
}

const planFor = (plans: PublisherPlan[], tier: SubscriptionTierName | null): PublisherPlan | null =>
    plans.find((row) => row.tier === tier) ?? null;

/**
 * The console's grant — `POST /revenue/subscriptions`.
 *
 * The publisher is picked from the roster the way the dispatch dialog picks
 * one; the tier from the plans; the price and the rate are PREFILLED from
 * the chosen plan and stay editable, because a negotiated grant may carry a
 * rate the catalogue does not sell. Whatever is on screen is what is sent:
 * the API would fill both from the plan when omitted, but sending the
 * figures the operator saw is what makes the grant say what they meant.
 */
export function GrantDialog({ open, onOpenChange, plans, publisher = null, onGranted }: GrantDialogProps) {
    const [publisherId, setPublisherId] = React.useState(publisher?.id ?? "");
    const [tier, setTier] = React.useState<SubscriptionTierName | null>(() => defaultTier(plans));
    const [price, setPrice] = React.useState(() => planFor(plans, defaultTier(plans))?.pricePerMonth ?? "");
    const [rate, setRate] = React.useState(() => planFor(plans, defaultTier(plans))?.commissionPct ?? "");
    const [startsAt, setStartsAt] = React.useState(() => todayInput());
    const [endsAt, setEndsAt] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [formError, setFormError] = React.useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});

    const needsRoster = open && publisher === null;
    const roster = useApiResource<RosterPublisher[]>(`subscriptions:roster:${needsRoster}`, () =>
        needsRoster ? supplyService.roster() : Promise.resolve([]),
    );

    const plan = planFor(plans, tier);

    /* The prefill: the plan's own figures, every time a tier is picked. */
    const pickTier = (next: SubscriptionTierName) => {
        const chosen = planFor(plans, next);
        setTier(next);
        setPrice(chosen?.pricePerMonth ?? "");
        setRate(chosen?.commissionPct ?? "");
    };

    /* A fresh form every time the dialog opens, from the catalogue as it now is. */
    const handleOpenChange = (next: boolean) => {
        if (next) {
            const first = defaultTier(plans);
            const chosen = planFor(plans, first);
            setPublisherId(publisher?.id ?? "");
            setTier(first);
            setPrice(chosen?.pricePerMonth ?? "");
            setRate(chosen?.commissionPct ?? "");
            setStartsAt(todayInput());
            setEndsAt("");
            setFormError(null);
            setFieldErrors({});
        }
        onOpenChange(next);
    };

    const ratePct = pctToFraction(rate);
    const ready =
        publisherId.length > 0 &&
        tier !== null &&
        PLAN_MONEY.test(price.trim()) &&
        ratePct !== null &&
        startsAt.length >= 4 &&
        (endsAt === "" || endsAt >= startsAt);

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!ready || busy || tier === null || ratePct === null) return;
        setBusy(true);
        setFormError(null);
        setFieldErrors({});
        const body: SubscriptionGrant = {
            publisherId,
            tier,
            startsAt,
            ...(endsAt ? { endsAt } : {}),
            ratePct,
            pricePerMonth: price.trim(),
        };
        try {
            const granted = await revenueService.grantSubscription(body);
            toast.success(`${plan?.name ?? tier} granted`, {
                description: `${formatRate(granted.ratePct)} commission from ${startsAt}${endsAt ? ` to ${endsAt}` : ", open-ended"}.`,
            });
            onGranted();
            onOpenChange(false);
        } catch (cause) {
            if (cause instanceof ApiError) {
                setFieldErrors(cause.fieldErrors);
                setFormError(cause.message);
            } else {
                setFormError(cause instanceof Error ? cause.message : "Could not grant the subscription.");
            }
        } finally {
            setBusy(false);
        }
    };

    const rosterItems = React.useMemo(
        () =>
            (roster.data ?? []).map((row) => ({
                value: row.id,
                label: row.name,
                description: [row.displayId, row.city].filter(Boolean).join(" · "),
            })),
        [roster.data],
    );

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <form onSubmit={submit} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>Grant a subscription</DialogTitle>
                        <DialogDescription>
                            A plan given from the console rather than bought in the app. The rate and the price are
                            copied onto the subscription as they stand here; a later change to the plan does not move
                            them.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-1.5">
                        <Label htmlFor="grant-publisher">Publisher</Label>
                        {publisher ? (
                            <p id="grant-publisher" className="text-sm font-medium text-foreground">
                                {publisher.name}
                            </p>
                        ) : (
                            <Combobox
                                id="grant-publisher"
                                items={rosterItems}
                                value={publisherId}
                                onValueChange={setPublisherId}
                                placeholder={roster.loading ? "Loading the roster…" : "Pick a publisher"}
                                searchPlaceholder="Search name, PUB- id or city…"
                                emptyText={roster.error ? "The roster could not be read." : "No publisher matches that."}
                                disabled={busy}
                            />
                        )}
                        {fieldErrors.publisherId?.[0] && <p className="text-xs text-danger">{fieldErrors.publisherId[0]}</p>}
                    </div>

                    <div className="grid gap-1.5">
                        <Label>Plan</Label>
                        <div role="radiogroup" aria-label="Plan" className="grid gap-2 sm:grid-cols-3">
                            {plans.map((row) => (
                                <button
                                    key={row.tier}
                                    type="button"
                                    role="radio"
                                    aria-checked={row.tier === tier}
                                    disabled={busy}
                                    onClick={() => pickTier(row.tier)}
                                    className={cn(
                                        "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                                        row.tier === tier ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/50",
                                        !row.active && "border-dashed",
                                    )}
                                >
                                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                                        {row.name}
                                        {!row.active && (
                                            <Badge variant="secondary" className="rounded-sm text-[10px]">
                                                Retired
                                            </Badge>
                                        )}
                                    </span>
                                    <span className="block text-xs text-muted-foreground">
                                        {formatMoney(row.pricePerMonth)} · {formatRate(row.ratePct)}
                                    </span>
                                </button>
                            ))}
                        </div>
                        {plans.length === 0 && (
                            <p className="text-xs text-muted-foreground">The catalogue has no plans to grant.</p>
                        )}
                        {fieldErrors.tier?.[0] && <p className="text-xs text-danger">{fieldErrors.tier[0]}</p>}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label htmlFor="grant-price">Price per month</Label>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">₹</span>
                                <Input
                                    id="grant-price"
                                    inputMode="decimal"
                                    value={price}
                                    autoComplete="off"
                                    className="tabular-nums"
                                    disabled={busy}
                                    onChange={(event) => setPrice(event.target.value)}
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {fieldErrors.pricePerMonth?.[0] ?? "Prefilled from the plan; rupees, up to two decimals."}
                            </p>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="grant-rate">Commission rate</Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    id="grant-rate"
                                    inputMode="decimal"
                                    value={rate}
                                    autoComplete="off"
                                    className="tabular-nums"
                                    disabled={busy}
                                    onChange={(event) => setRate(event.target.value)}
                                />
                                <span className="text-sm text-muted-foreground">%</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {fieldErrors.ratePct?.[0] ?? "Prefilled from the plan; a percentage, up to two decimals."}
                            </p>
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label htmlFor="grant-starts">Starts</Label>
                            <Input
                                id="grant-starts"
                                type="date"
                                value={startsAt}
                                disabled={busy}
                                onChange={(event) => setStartsAt(event.target.value)}
                            />
                            {fieldErrors.startsAt?.[0] && <p className="text-xs text-danger">{fieldErrors.startsAt[0]}</p>}
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="grant-ends">
                                Ends <span className="ml-1 font-normal text-muted-foreground">optional</span>
                            </Label>
                            <Input
                                id="grant-ends"
                                type="date"
                                value={endsAt}
                                min={startsAt}
                                disabled={busy}
                                onChange={(event) => setEndsAt(event.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                {fieldErrors.endsAt?.[0] ?? "Empty is open-ended: it runs until somebody ends it."}
                            </p>
                        </div>
                    </div>

                    {formError && <p className="text-sm text-danger">{formError}</p>}

                    <DialogFooter>
                        <Button type="button" variant="outline" className="bg-card" disabled={busy} onClick={() => handleOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={!ready || busy}>
                            {busy ? "Granting…" : "Grant"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
