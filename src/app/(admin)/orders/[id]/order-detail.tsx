"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronLeft, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActivityTimeline } from "@/components/adx/activity-timeline";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { FieldList } from "@/components/adx/simple-table";
import { KpiCard } from "@/components/adx/kpi-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate, formatDateTime, formatINR, formatMoney } from "@/lib/format";
import { isLive } from "@/lib/api-config";
import { useInstallationMode } from "@/lib/use-installation-mode";
import { opsOverridesFor, orderService, type OpsOverride } from "@/services/orders";
import { PickupCodeCard } from "./pickup-code-card";
import { OrderJourneyCard } from "./order-journey-card";
import { OrderMilestonesCard } from "./order-milestones-card";
import { OrderOffersCard } from "./order-offers-card";
import { OPS_OVERRIDE_COPY, OPS_REASON_MIN, OpsOverrideDialog, ReasonField, ReassignAgentDialog } from "./order-ops-dialogs";
import { OrderPayoutCard } from "./order-payout-card";
import { OrderPrintingCard } from "./order-printing-card";
import {
    ORDER_PIPELINE_STAGES,
    ORDER_STAGE_OF,
    ORDER_STATUS_META,
    type Order,
} from "@/types";

/**
 * One order.
 *
 * The header used to carry "Reassign agent" and "Mark complete", neither of
 * which did anything. The three buttons here are the three decisions ADX
 * actually gets to make on somebody else's order, and each appears only in the
 * state where the endpoint would accept it — a button that 409s is a worse
 * answer than a button that is not there.
 */

/** The phases an order passes through, in order. "Not proceeding" is not one of
 *  them: it is where an order stops, not a step towards finishing. */
const JOURNEY = ORDER_PIPELINE_STAGES.filter((stage) => stage.id !== "stopped");

/** An amount as the wire wants it: digits, optionally two decimal places. */
const AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;

export function OrderDetail({ order, onChanged }: { order: Order; onChanged?: () => void }) {
    const [busy, setBusy] = React.useState(false);
    const [cancelling, setCancelling] = React.useState(false);
    const [cancelReason, setCancelReason] = React.useState("");
    const [printReadyOpen, setPrintReadyOpen] = React.useState(false);
    const [agentFee, setAgentFee] = React.useState("");
    const [reassigning, setReassigning] = React.useState(false);
    const [override, setOverride] = React.useState<OpsOverride | null>(null);
    const mode = useInstallationMode();

    const live = isLive("orders");
    const stage = ORDER_STAGE_OF[order.status];
    const stopped = stage === "stopped";
    const reached = JOURNEY.findIndex((step) => step.id === stage);
    /* Lot D (Q51/Q90): which ops moves the backend would accept right now.
       Evaluated when the order arrives; the page reloads after every write. */
    const moves = opsOverridesFor(order);

    async function run(label: string, action: () => Promise<unknown>) {
        setBusy(true);
        try {
            await action();
            toast.success(label);
            onChanged?.();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "That did not go through.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-5">
            <div>
                <Link
                    href="/orders"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="size-4" />
                    Orders
                </Link>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                            {order.listing}
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {[order.city, order.campaignName].filter(Boolean).join(" · ")}
                            <span className="ml-2 font-mono text-xs">{order.id}</span>
                        </p>
                    </div>
                    {live && (
                        <div className="flex items-center gap-2">
                            {order.status === "PENDING_PRINT" && (
                                <Button
                                    variant="outline"
                                    className="bg-card"
                                    disabled={busy}
                                    onClick={() =>
                                        mode === "PER_ORDER"
                                            ? setPrintReadyOpen(true)
                                            : run("Prints marked ready", () =>
                                                  orderService.printReady(order.id)
                                              )
                                    }
                                >
                                    Prints are ready
                                </Button>
                            )}
                            {moves.acceptPublisher && (
                                <Button variant="outline" className="bg-card" disabled={busy} onClick={() => setOverride("ACCEPT_PUBLISHER")}>
                                    {OPS_OVERRIDE_COPY.ACCEPT_PUBLISHER.title}
                                </Button>
                            )}
                            {moves.confirmSlot && (
                                <Button variant="outline" className="bg-card" disabled={busy} onClick={() => setOverride("CONFIRM_SLOT")}>
                                    {OPS_OVERRIDE_COPY.CONFIRM_SLOT.title}
                                </Button>
                            )}
                            {moves.collectPrints && (
                                <Button variant="outline" className="bg-card" disabled={busy} onClick={() => setOverride("COLLECT_PRINTS")}>
                                    {OPS_OVERRIDE_COPY.COLLECT_PRINTS.title}
                                </Button>
                            )}
                            {moves.reassign && (
                                <Button variant="outline" className="bg-card" disabled={busy} onClick={() => setReassigning(true)}>
                                    Reassign agent
                                </Button>
                            )}
                            {!stopped && order.status !== "COMPLETED" && (
                                <Button
                                    variant="outline"
                                    className="bg-card"
                                    disabled={busy}
                                    onClick={() => setCancelling(true)}
                                >
                                    Cancel order
                                </Button>
                            )}
                            {order.status === "PENDING_APPROVAL" && (
                                <Button
                                    disabled={busy}
                                    onClick={() =>
                                        run("Order signed off", () => orderService.approve(order.id))
                                    }
                                >
                                    Sign off install
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* A9: the package's code, once the prints are ready and until the agent collects. */}
            {live && <PickupCodeCard order={order} />}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                    stat={{
                        id: "status",
                        label: "Status",
                        value: ORDER_STATUS_META[order.status].label,
                    }}
                />
                <KpiCard
                    stat={{
                        id: "budget",
                        label: "Budget",
                        value: order.budget === null ? "—" : formatINR(order.budget),
                    }}
                />
                <KpiCard
                    stat={{
                        id: "flight",
                        label: "Flight",
                        value: order.startDate ? formatDate(order.startDate) : "Not dated",
                        hint: order.endDate ? `to ${formatDate(order.endDate)}` : undefined,
                    }}
                />
                <KpiCard
                    stat={{
                        id: "slot",
                        label: "Install slot",
                        value: order.slotTime ? formatDate(order.slotTime) : "Not agreed",
                    }}
                />
            </div>

            <div className="grid gap-4 lg:grid-cols-5">
                <Card className="rounded-lg border-border p-5 shadow-none lg:col-span-3">
                    <h3 className="text-base font-semibold text-foreground">Progress</h3>
                    {stopped ? (
                        <div className="mt-4 flex items-start gap-3 rounded-lg border border-danger/40 bg-danger-soft p-4">
                            <X className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                            <div>
                                <p className="text-sm font-medium text-foreground">
                                    {ORDER_STATUS_META[order.status].label}
                                </p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    This order stopped before it was installed. It cannot be
                                    restarted — a new order would have to be placed.
                                </p>
                                {order.status === "CANCELLED" && order.cancellationReason && (
                                    <p className="mt-2 text-sm text-foreground">
                                        <span className="font-medium">Reason:</span> {order.cancellationReason}
                                        {order.cancelledAt ? (
                                            <span className="text-muted-foreground"> · {formatDateTime(order.cancelledAt)}</span>
                                        ) : null}
                                    </p>
                                )}
                            </div>
                        </div>
                    ) : (
                        <ol className="mt-5 space-y-0">
                            {JOURNEY.map((step, index) => {
                                const done = index <= reached;
                                const isLast = index === JOURNEY.length - 1;
                                return (
                                    <li key={step.id} className="relative flex gap-3 pb-6 last:pb-0">
                                        {!isLast && (
                                            <span
                                                aria-hidden
                                                className={cn(
                                                    "absolute left-[11px] top-6 h-full w-px",
                                                    done ? "bg-success/40" : "bg-border"
                                                )}
                                            />
                                        )}
                                        <span
                                            className={cn(
                                                "z-10 flex size-6 shrink-0 items-center justify-center rounded-full border bg-card",
                                                done
                                                    ? "border-success bg-success text-white"
                                                    : "text-muted-foreground/50"
                                            )}
                                        >
                                            {done && <Check className="size-3.5" />}
                                        </span>
                                        <div className="pt-0.5">
                                            <p
                                                className={cn(
                                                    "text-sm font-medium",
                                                    done ? "text-foreground" : "text-muted-foreground"
                                                )}
                                            >
                                                {step.title}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {index === reached
                                                    ? ORDER_STATUS_META[order.status].label
                                                    : done
                                                      ? "Done"
                                                      : "Not yet"}
                                            </p>
                                        </div>
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                </Card>

                <Card className="rounded-lg border-border p-5 shadow-none lg:col-span-2">
                    <h3 className="text-base font-semibold text-foreground">Details</h3>
                    <div className="mt-4">
                        <StatusBadge status={ORDER_STATUS_META[order.status]} />
                    </div>
                    <FieldList
                        className="mt-4"
                        items={[
                            ["Site", order.listing],
                            ["City", order.city ?? "—"],
                            ["Campaign", order.campaignName ?? "—"],
                            [
                                "Agent",
                                // Not linked in live mode: the agents directory
                                // still renders fixtures, so a real agent id
                                // would open a page that has never heard of it.
                                order.agent
                                    ? live
                                        ? order.agent
                                        : ((
                                              <Link
                                                  key="agent"
                                                  href={`/agents/${order.agentId}`}
                                                  className="underline-offset-4 hover:underline"
                                              >
                                                  {order.agent}
                                              </Link>
                                          ) as React.ReactNode)
                                    : "Unassigned",
                            ],
                            ["Placed", formatDate(order.createdAt)],
                            [
                                "Flight",
                                order.startDate
                                    ? `${formatDate(order.startDate)}${
                                          order.endDate ? ` – ${formatDate(order.endDate)}` : ""
                                      }`
                                    : "Not dated",
                            ],
                            ["Budget", order.budget === null ? "—" : formatINR(order.budget)],
                        ]}
                    />
                </Card>
            </div>

            {/* Lot B: the shop printing it, and what the installing agent is paid. */}
            {live && (
                <div className="grid gap-4 lg:grid-cols-2">
                    <OrderPrintingCard order={order} onChanged={onChanged} />
                    <OrderPayoutCard order={order} onChanged={onChanged} />
                </div>
            )}

            {/* A12: the steps and the offer on each visit — ops dispatches from here. */}
            {live && <OrderMilestonesCard order={order} />}

            {/* LT-1: the legs as the agent app reported them, and the agent's live line. */}
            {live && <OrderJourneyCard order={order} />}

            {/* Lot D: every offer the order made, and every admin write that named it. */}
            {live && order.offers && (
                <div className="grid gap-4 lg:grid-cols-2">
                    <OrderOffersCard offers={order.offers} escalated={order.agentEscalated ?? false} />
                    <div>
                        <h3 className="mb-3 text-base font-semibold text-foreground">Activity</h3>
                        <ActivityTimeline targets={[{ type: "Order", id: order.id }]} noun="this order" />
                    </div>
                </div>
            )}

            {live && (
                <>
                    <ReassignAgentDialog order={order} open={reassigning} onOpenChange={setReassigning} onDone={onChanged} />
                    {override && (
                        <OpsOverrideDialog
                            order={order}
                            step={override}
                            open
                            onOpenChange={(open) => !open && setOverride(null)}
                            onDone={onChanged}
                        />
                    )}
                </>
            )}

            {/* PER_ORDER only: the fee rides on the print-ready call and is written to the order. */}
            <ConfirmDialog
                open={printReadyOpen}
                onOpenChange={setPrintReadyOpen}
                title="Prints are ready?"
                description="The pickup code is minted and the order moves on to an agent. The platform pays installations per order, so the agent fee for this one is set here; leave it blank to fall back to the flat rate."
                confirmLabel="Mark ready"
                busy={busy}
                disabled={agentFee.trim() !== "" && !AMOUNT.test(agentFee.trim())}
                onConfirm={() =>
                    void run("Prints marked ready", async () => {
                        await orderService.printReady(order.id, agentFee.trim() || undefined);
                        setPrintReadyOpen(false);
                        setAgentFee("");
                    })
                }
            >
                <div className="space-y-1.5">
                    <Label htmlFor="print-ready-fee">Agent fee</Label>
                    <Input
                        id="print-ready-fee"
                        inputMode="decimal"
                        value={agentFee}
                        onChange={(event) => setAgentFee(event.target.value)}
                        placeholder={order.agentFeeAmount ? `Currently ${formatMoney(order.agentFeeAmount)}` : "Flat rate if blank"}
                        className="tabular-nums"
                    />
                    <p className="text-xs text-muted-foreground">
                        Written to the order and quoted on the offer when an agent is assigned.
                    </p>
                </div>
            </ConfirmDialog>

            <ConfirmDialog
                open={cancelling}
                onOpenChange={setCancelling}
                title={`Cancel the order on ${order.listing}?`}
                description="This stops the order for everyone on it — the publisher, the advertiser and any agent already assigned. It cannot be restarted; a new order would have to be placed."
                confirmLabel="Cancel order"
                destructive
                busy={busy}
                disabled={cancelReason.trim().length < OPS_REASON_MIN}
                onConfirm={() =>
                    void run("Order cancelled", async () => {
                        await orderService.cancel(order.id, cancelReason.trim());
                        setCancelling(false);
                        setCancelReason("");
                    })
                }
            >
                <ReasonField
                    id="cancel-reason"
                    value={cancelReason}
                    onChange={setCancelReason}
                    hint="Required. Written on the order beside who cancelled it and when, and on the ORDER_CANCELLED audit row."
                    placeholder="Advertiser withdrew the campaign before print."
                />
            </ConfirmDialog>
        </div>
    );
}
