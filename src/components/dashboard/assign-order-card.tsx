"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { Agent, Order } from "@/types";

interface AssignOrderCardProps {
    openOrders: Order[];
    agents: Agent[];
}

/** Dashboard quick form, routes an open order to a field agent. */
export function AssignOrderCard({ openOrders, agents }: AssignOrderCardProps) {
    const [orderId, setOrderId] = React.useState(openOrders[0]?.id ?? "");
    const [agentId, setAgentId] = React.useState(agents[0]?.id ?? "");
    const [priority, setPriority] = React.useState("normal");
    const [due, setDue] = React.useState("today-2pm");

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const order = openOrders.find((candidate) => candidate.id === orderId);
        const agent = agents.find((candidate) => candidate.id === agentId);
        if (!order || !agent) return;
        toast.success(`Order #${order.number} assigned to ${agent.name}`, {
            description: "The agent has been notified in the field app.",
        });
    };

    return (
        <Card className="flex flex-col rounded-lg border-border p-5 shadow-none">
            <div>
                <h2 className="text-base font-semibold text-foreground">Assign order</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                    Route an open order to an agent
                </p>
            </div>

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
                                    #{order.number} {order.type}
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
                            {agents.map((agent) => (
                                <SelectItem key={agent.id} value={agent.id}>
                                    {agent.name} · {agent.area}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <Label>Priority</Label>
                        <Select value={priority} onValueChange={setPriority}>
                            <SelectTrigger className="h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="low">Low</SelectItem>
                                <SelectItem value="normal">Normal</SelectItem>
                                <SelectItem value="high">High</SelectItem>
                                <SelectItem value="urgent">Urgent</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Due</Label>
                        <Select value={due} onValueChange={setDue}>
                            <SelectTrigger className="h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="today-2pm">Today 2:00 PM</SelectItem>
                                <SelectItem value="today-6pm">Today 6:00 PM</SelectItem>
                                <SelectItem value="tomorrow-10am">Tomorrow 10:00 AM</SelectItem>
                                <SelectItem value="tomorrow-4pm">Tomorrow 4:00 PM</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="mt-auto flex justify-end pt-1">
                    <Button type="submit">Assign order</Button>
                </div>
            </form>
        </Card>
    );
}
