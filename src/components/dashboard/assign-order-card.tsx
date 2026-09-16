"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { useInstallationMode } from "@/lib/use-installation-mode";
import { agentLabel, agentService, type AgentSummary } from "@/services/agents";
import { orderService } from "@/services/orders";
import type { Order } from "@/types";

/** Waiting for somebody to be put on them. */
const UNSTAFFED: Order["status"][] = ["PENDING_AGENT", "PENDING_PUBLISHER"];

/** An amount as the wire wants it: digits, optionally two decimal places. */
const AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;

/**
 * Routes an open order to a field agent.
 *
 * This used to be four dropdowns and a toast: it picked from fixture orders,
 * offered a priority and a due time the model never had, and reported success
 * without sending anything. `POST /orders/:id/assign-agent` is real, so the card
 * now loads open orders and the agent directory from the API and actually
 * assigns.
 *
 * Priority and due time are gone rather than kept as decoration — an order has
 * neither, and a form that collects a field nothing stores teaches an operator
 * something false about the system. The agent fee (Lot B, Q102) is drawn by
 * the same rule: only while the platform pays installations PER_ORDER, which
 * is the only time the resolver reads it.
 *
 * The roster is `GET /agents` and nothing else: the fixture agents this
 * card used to be handed while the domain was on seeds are gone with the
 * domain, so with the API off the picker is empty and the card says so.
 */
export function AssignOrderCard() {
    const live = isLive("orders");

    const resource = useApiResource<{ orders: Order[]; agents: AgentSummary[] }>(
        `dashboard:assign:${live}`,
        async () => {
            const orders = await orderService.list();
            return {
                orders: orders.filter((order) => UNSTAFFED.includes(order.status)),
                agents: isLive("agents") ? await agentService.list() : [],
            };
        }
    );

    const [orderId, setOrderId] = React.useState("");
    const [agentId, setAgentId] = React.useState("");
    const [agentFee, setAgentFee] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const mode = useInstallationMode();
    const perOrder = live && mode === "PER_ORDER";
    const feeValid = !perOrder || agentFee.trim() === "" || AMOUNT.test(agentFee.trim());

    const openOrders = resource.data?.orders ?? [];
    const options = (resource.data?.agents ?? []).map((agent) => ({ id: agent.id, label: agentLabel(agent) }));

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const order = openOrders.find((candidate) => candidate.id === orderId);
        const agent = options.find((candidate) => candidate.id === agentId);
        if (!order || !agent) return;

        if (!live) {
            toast.success(`${order.listing} assigned to ${agent.label}`, {
                description: "Fixture data — nothing was sent.",
            });
            return;
        }

        setBusy(true);
        try {
            await orderService.assignAgent(order.id, agent.id, perOrder ? agentFee.trim() || undefined : undefined);
            toast.success(`${order.listing} assigned to ${agent.label}`, {
                description: "The agent has been notified in the field app.",
            });
            setOrderId("");
            setAgentFee("");
            resource.reload();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not assign that order.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card className="flex flex-col rounded-lg border-border p-5 shadow-none">
            <div>
                <h2 className="text-base font-semibold text-foreground">Assign order</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                    Route an open order to an agent
                </p>
            </div>

            {resource.error ? (
                <p className="mt-4 text-sm text-muted-foreground">{resource.error}</p>
            ) : openOrders.length === 0 && !resource.loading ? (
                <p className="mt-4 text-sm text-muted-foreground">
                    Nothing is waiting for an agent.{" "}
                    <Link href="/orders" className="underline underline-offset-4">
                        Open the orders board
                    </Link>
                    .
                </p>
            ) : (
                <form onSubmit={handleSubmit} className="mt-4 flex flex-1 flex-col gap-4">
                    <div className="space-y-1.5">
                        <Label>Order</Label>
                        <Select value={orderId} onValueChange={setOrderId}>
                            <SelectTrigger className="h-9">
                                <SelectValue placeholder="Select an open order" />
                            </SelectTrigger>
                            <SelectContent>
                                {openOrders.map((order) => (
                                    <SelectItem key={order.id} value={order.id}>
                                        {order.listing}
                                        {order.city ? ` · ${order.city}` : ""}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label>Agent</Label>
                        <Select value={agentId} onValueChange={setAgentId}>
                            <SelectTrigger className="h-9">
                                <SelectValue placeholder="Select an agent" />
                            </SelectTrigger>
                            <SelectContent>
                                {options.length === 0 && (
                                    <p className="px-2 py-1.5 text-xs text-muted-foreground">
                                        {live ? "No agents on the roster." : "Agents read the API; the console is not connected."}
                                    </p>
                                )}
                                {options.map((agent) => (
                                    <SelectItem key={agent.id} value={agent.id}>
                                        {agent.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {perOrder && (
                        <div className="space-y-1.5">
                            <Label htmlFor="assign-agent-fee">Agent fee</Label>
                            <Input
                                id="assign-agent-fee"
                                inputMode="decimal"
                                value={agentFee}
                                onChange={(event) => setAgentFee(event.target.value)}
                                placeholder="Flat rate if blank"
                                className="h-9 tabular-nums"
                                aria-invalid={!feeValid || undefined}
                            />
                            <p className="text-xs text-muted-foreground">
                                Per-order mode: quoted on the offer and paid at sign-off.
                            </p>
                        </div>
                    )}

                    <div className="mt-auto flex justify-end pt-1">
                        <Button type="submit" disabled={busy || !orderId || !agentId || !feeValid}>
                            {busy ? "Assigning…" : "Assign order"}
                        </Button>
                    </div>
                </form>
            )}
        </Card>
    );
}
