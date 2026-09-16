"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDate, formatMoney } from "@/lib/format";
import {
    SUBSCRIPTION_STATE_META,
    formatRate,
    graceUntil,
    orderIsTrial,
    revenueService,
    sourceLabel,
    subscriptionOrderStatusMeta,
    subscriptionState,
    type PublisherPlan,
    type SubscriptionOrder,
} from "@/services/revenue";
import { settingsReadApi, settingsService } from "@/services/settings";
import type { PublisherSubscription } from "@/types/revenue";
import { GrantDialog } from "../../packages/subscriptions/grant-dialog";

/**
 * The orders read's three answers: the rows; the self-service purchase
 * switched off (`503 FEATURE_OFF` on `GET /revenue/subscription-orders`),
 * which is an answer about the app and not a failure; or a read that
 * failed for any other reason.
 */
export type OrdersFacts = { kind: "READ"; items: SubscriptionOrder[] } | { kind: "OFF" } | { kind: "FAILED" };

/**
 * What the publisher page reads for the card — Lot J leftover (b): four
 * reads, each degrading on its own. Null only when finance is off.
 */
export interface PublisherSubscriptionFacts {
    /** The publisher's whole set; null when the read failed. */
    subscriptions: PublisherSubscription[] | null;
    /** The newest orders, the desk's page size cut to a handful. */
    orders: OrdersFacts;
    /** The catalogue, for the grant dialog; empty when the read failed (the button says so by being disabled). */
    plans: PublisherPlan[];
    /** Lot J2: the publisher policy's grace, for the "in grace" note; 0 when the platform row could not be read. */
    graceDays: number;
}

const ordersFacts = (cause: unknown): OrdersFacts =>
    cause instanceof ApiError && cause.code === "FEATURE_OFF" ? { kind: "OFF" } : { kind: "FAILED" };

/** The card's reads, keyed on the profile id the revenue module names. Each failure is that section's, not the card's. */
export async function readPublisherSubscriptionFacts(publisherId: string): Promise<PublisherSubscriptionFacts> {
    const [subscriptions, orders, plans, graceDays] = await Promise.all([
        revenueService.subscriptions(publisherId).catch(() => null),
        revenueService
            .subscriptionOrders({ publisherId, pageSize: 5 })
            .then((page): OrdersFacts => ({ kind: "READ", items: page.items }))
            .catch(ordersFacts),
        revenueService.plans().catch(() => []),
        settingsReadApi()
            ? settingsService
                  .get()
                  .then((settings) => settings.subscriptions?.publisher.graceDays ?? 0)
                  .catch(() => 0)
            : Promise.resolve(0),
    ]);
    return { subscriptions, orders, plans, graceDays };
}

interface SubscriptionCardProps {
    publisher: { id: string; name: string };
    facts: PublisherSubscriptionFacts | null;
    onChanged: () => void;
}

/**
 * The running term, the queued ones, and — Lot J2 — the newest ended term
 * still inside the policy's grace, from the whole set the read sent.
 */
export function splitSubscriptions(rows: PublisherSubscription[], graceDays = 0, now = new Date()) {
    const running = rows.find((row) => subscriptionState(row, now) === "RUNNING") ?? null;
    const upcoming = rows.filter((row) => subscriptionState(row, now) === "UPCOMING");
    const inGrace = running ? null : (rows.find((row) => graceUntil(row, graceDays, now) !== null) ?? null);
    return { running, upcoming, inGrace };
}

/**
 * The publisher's subscription — Lot J-C. The running plan with its rate,
 * where it came from and when it ends, whether it renews on its own, what
 * is queued after it, an ended term still in grace, and the last orders the
 * app raised (a trial marked as one); Grant and End are the desk's own
 * actions, with the publisher fixed. Each section degrades on its own.
 */
export function SubscriptionCard({ publisher, facts, onChanged }: SubscriptionCardProps) {
    const [granting, setGranting] = React.useState(false);
    const [ending, setEnding] = React.useState<PublisherSubscription | null>(null);
    const [busy, setBusy] = React.useState(false);

    const { running, upcoming, inGrace } = React.useMemo(
        () => splitSubscriptions(facts?.subscriptions ?? [], facts?.graceDays ?? 0),
        [facts],
    );
    const graceEnds = inGrace ? graceUntil(inGrace, facts?.graceDays ?? 0) : null;

    const end = async () => {
        if (!ending || busy) return;
        setBusy(true);
        try {
            await revenueService.endSubscription(ending.id);
            toast.success(`${ending.planName ?? ending.tier} ended`);
            setEnding(null);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The change did not reach ADX.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <SectionCard
            title="Subscription"
            description="The plan whose commission rate this publisher's bookings carry."
            actions={
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-8 bg-card" asChild>
                        <Link href={`/packages/subscriptions?publisherId=${encodeURIComponent(publisher.id)}`}>Open the book</Link>
                    </Button>
                    <Button size="sm" className="h-8" disabled={!facts || facts.plans.length === 0} onClick={() => setGranting(true)}>
                        Grant
                    </Button>
                </div>
            }
        >
            {facts === null ? (
                <p className="text-sm text-muted-foreground">
                    Subscriptions are read from the revenue API, which this console is not connected to.
                </p>
            ) : (
                <div className="grid gap-5 lg:grid-cols-2">
                    <div className="space-y-4">
                        {facts.subscriptions === null ? (
                            <p className="text-sm text-muted-foreground" data-testid="subscriptions-unread">
                                The subscriptions could not be read just now.
                            </p>
                        ) : running ? (
                            <div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-base font-semibold text-foreground">{running.planName ?? running.tier}</p>
                                    <StatusBadge status={SUBSCRIPTION_STATE_META.RUNNING} />
                                    {running.autoRenew && (
                                        <Badge variant="secondary" className="rounded-sm" data-testid="auto-renew-on">
                                            Auto-renew on
                                        </Badge>
                                    )}
                                </div>
                                <dl className="mt-3 space-y-2 text-sm">
                                    {[
                                        ["Commission rate", formatRate(running.ratePct)],
                                        ["Price", `${formatMoney(running.pricePerMonth)} / month`],
                                        ["Source", sourceLabel(running.source)],
                                        ["Started", formatDate(running.startsAt)],
                                        ["Ends", running.endsAt ? formatDate(running.endsAt) : "Open-ended"],
                                        ["Auto-renew", running.autoRenew ? "On — charged from the wallet" : "Off"],
                                    ].map(([label, value]) => (
                                        <div key={label} className="flex items-center justify-between gap-4">
                                            <dt className="text-muted-foreground">{label}</dt>
                                            <dd className="font-medium tabular-nums text-foreground">{value}</dd>
                                        </div>
                                    ))}
                                </dl>
                                <Button variant="outline" size="sm" className="mt-3 h-8 bg-card" onClick={() => setEnding(running)}>
                                    End subscription
                                </Button>
                            </div>
                        ) : inGrace && graceEnds ? (
                            <div data-testid="in-grace">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-base font-semibold text-foreground">{inGrace.planName ?? inGrace.tier}</p>
                                    <StatusBadge status={SUBSCRIPTION_STATE_META.ENDED} />
                                    <Badge variant="secondary" className="rounded-sm">
                                        In grace
                                    </Badge>
                                </div>
                                <p className="mt-2 text-sm text-muted-foreground">
                                    Ended {formatDate(inGrace.endsAt ?? inGrace.startsAt)}; the entitlements — live chat and the rest —
                                    still answer until {formatDate(graceEnds.toISOString())}. Bookings already carry the platform&apos;s
                                    own rate.
                                </p>
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                No plan running. Bookings carry the platform&apos;s own rate until one is granted here or
                                bought in the app.
                            </p>
                        )}

                        {upcoming.length > 0 && (
                            <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                                {upcoming.map((row) => (
                                    <p key={row.id} className="flex items-center justify-between gap-3">
                                        <span>
                                            <span className="font-medium text-foreground">{row.planName ?? row.tier}</span> from{" "}
                                            {formatDate(row.startsAt)} at {formatRate(row.ratePct)} · {sourceLabel(row.source)}
                                        </span>
                                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setEnding(row)}>
                                            End
                                        </Button>
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>

                    <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Last orders</p>
                        {facts.orders.kind === "OFF" ? (
                            <p className="mt-2 text-sm text-muted-foreground" data-testid="orders-off">
                                Self-service purchase is switched off, so the app raises no orders; a plan is granted here instead.{" "}
                                <Link href="/settings/flags" className="underline underline-offset-4">
                                    Feature flags
                                </Link>
                            </p>
                        ) : facts.orders.kind === "FAILED" ? (
                            <p className="mt-2 text-sm text-muted-foreground" data-testid="orders-unread">
                                The orders could not be read just now.
                            </p>
                        ) : facts.orders.items.length === 0 ? (
                            <p className="mt-2 text-sm text-muted-foreground">No order raised from the app yet.</p>
                        ) : (
                            <ul className="mt-2 divide-y text-sm">
                                {facts.orders.items.map((order) => (
                                    <li key={order.id} className="flex items-center justify-between gap-3 py-2">
                                        <div className="min-w-0">
                                            <p className="flex flex-wrap items-center gap-1.5 font-mono text-xs text-foreground">
                                                {order.reference}
                                                {orderIsTrial(order) && (
                                                    <Badge variant="secondary" className="rounded-sm font-sans" data-testid={`trial-${order.id}`}>
                                                        Trial
                                                    </Badge>
                                                )}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {order.planName} · {orderIsTrial(order) ? "free" : formatMoney(order.total)} · {formatDate(order.createdAt)}
                                            </p>
                                        </div>
                                        <StatusBadge status={subscriptionOrderStatusMeta(order.status)} />
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}

            <GrantDialog
                open={granting}
                onOpenChange={setGranting}
                plans={facts?.plans ?? []}
                publisher={publisher}
                onGranted={onChanged}
            />

            <ConfirmDialog
                open={ending !== null}
                onOpenChange={(open) => !open && setEnding(null)}
                title="End this subscription?"
                description={
                    ending
                        ? `${publisher.name} loses the ${ending.planName ?? ending.tier} rate (${formatRate(ending.ratePct)}) from now. Bookings are charged the ladder's next rung; nothing already accrued changes.`
                        : ""
                }
                confirmLabel="End subscription"
                destructive
                busy={busy}
                onConfirm={() => void end()}
            />
        </SectionCard>
    );
}
