"use client";

import * as React from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilterChips } from "@/components/adx/filter-chips";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import type { StatusMeta } from "@/types";

type Channel = "Email" | "SMS" | "Push";
type DeliveryStatus = "delivered" | "bounced" | "retrying";

const statusMeta: Record<DeliveryStatus, StatusMeta> = {
    delivered: { label: "Delivered", tone: "success" },
    bounced: { label: "Bounced", tone: "danger" },
    retrying: { label: "Retrying", tone: "warning" },
};

interface DeliveryLog {
    id: string;
    time: string;
    channel: Channel;
    template: string;
    recipient: string;
    status: DeliveryStatus;
    attempts: number;
    failureReason?: string;
    attemptTrail: { index: number; time: string; status: string; detail: string }[];
    providerResponse: string;
}

const logs: DeliveryLog[] = [
    {
        id: "dl_1", time: "10:42 AM", channel: "Email", template: "Payout due reminder", recipient: "sanjay@sharmahoardings.in", status: "delivered", attempts: 1,
        attemptTrail: [{ index: 1, time: "10:42:04", status: "Delivered", detail: "Accepted by mx.google.com in 240ms" }],
        providerResponse: "250 2.0.0 OK 1720412522",
    },
    {
        id: "dl_2", time: "10:38 AM", channel: "SMS", template: "OTP sign-in", recipient: "+91 98450 •••23", status: "delivered", attempts: 1,
        attemptTrail: [{ index: 1, time: "10:38:11", status: "Delivered", detail: "MSG91 route 4, 1 credit" }],
        providerResponse: "MSG91: message-id 7f2a-4419",
    },
    {
        id: "dl_3", time: "10:31 AM", channel: "Email", template: "KYC approved", recipient: "mohit@metrowalls.co.in", status: "bounced", attempts: 3, failureReason: "Mailbox full",
        attemptTrail: [
            { index: 1, time: "10:31:02", status: "Deferred", detail: "452 4.2.2 mailbox full" },
            { index: 2, time: "10:33:40", status: "Deferred", detail: "452 4.2.2 mailbox full" },
            { index: 3, time: "10:39:15", status: "Bounced", detail: "Permanent failure after retries" },
        ],
        providerResponse: "552 5.2.2 Quota exceeded",
    },
    {
        id: "dl_4", time: "10:24 AM", channel: "Push", template: "Order assigned", recipient: "Ravi Kumar (agent app)", status: "delivered", attempts: 1,
        attemptTrail: [{ index: 1, time: "10:24:01", status: "Delivered", detail: "FCM priority high" }],
        providerResponse: "FCM: projects/adx/messages/88291",
    },
    {
        id: "dl_5", time: "10:12 AM", channel: "Email", template: "Dispute update", recipient: "legal@hindustanpaints.in", status: "retrying", attempts: 2, failureReason: "Connection timed out",
        attemptTrail: [
            { index: 1, time: "10:12:08", status: "Timeout", detail: "No response in 30s" },
            { index: 2, time: "10:18:30", status: "Timeout", detail: "No response in 30s, next retry 10:48" },
        ],
        providerResponse: "451 4.4.1 Timeout waiting for MX",
    },
    {
        id: "dl_6", time: "9:58 AM", channel: "SMS", template: "Payout settled", recipient: "+91 97400 •••22", status: "delivered", attempts: 1,
        attemptTrail: [{ index: 1, time: "09:58:44", status: "Delivered", detail: "MSG91 route 4, 1 credit" }],
        providerResponse: "MSG91: message-id 8c1b-2210",
    },
];

type ChipValue = "all" | Channel;

export function DeliveryLogsView() {
    const [chip, setChip] = React.useState<ChipValue>("all");
    const [selectedId, setSelectedId] = React.useState(logs[0].id);

    const visible = chip === "all" ? logs : logs.filter((log) => log.channel === chip);
    const selected = logs.find((log) => log.id === selectedId) ?? visible[0];

    return (
        <div className="space-y-5">
            <PageHeader
                title="Delivery logs"
                subtitle="Every transactional message, last 24 hours"
                actions={
                    <Button
                        variant="outline"
                        className="bg-card"
                        onClick={() => toast.success("Delivery log exported")}
                    >
                        Export
                    </Button>
                }
            />

            <FilterChips<ChipValue>
                value={chip}
                onChange={setChip}
                chips={[
                    { value: "all", label: "All", count: logs.length },
                    { value: "Email", label: "Email", count: logs.filter((l) => l.channel === "Email").length },
                    { value: "SMS", label: "SMS", count: logs.filter((l) => l.channel === "SMS").length },
                    { value: "Push", label: "Push", count: logs.filter((l) => l.channel === "Push").length },
                ]}
            />

            <div className="grid gap-4 xl:grid-cols-3">
                <Card className="overflow-hidden rounded-lg border-border shadow-none xl:col-span-2">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                <th className="px-5 py-2.5">Timestamp</th>
                                <th className="px-4 py-2.5">Channel</th>
                                <th className="px-4 py-2.5">Template</th>
                                <th className="px-4 py-2.5">Recipient</th>
                                <th className="px-4 py-2.5">Status</th>
                                <th className="px-4 py-2.5 text-right">Attempts</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((log) => (
                                <tr
                                    key={log.id}
                                    onClick={() => setSelectedId(log.id)}
                                    className={cn(
                                        "cursor-pointer border-b transition-colors last:border-0",
                                        selected?.id === log.id ? "bg-primary/[0.04]" : "hover:bg-muted/40"
                                    )}
                                >
                                    <td className="px-5 py-3 text-muted-foreground">{log.time}</td>
                                    <td className="px-4 py-3">
                                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                                            {log.channel}
                                        </code>
                                    </td>
                                    <td className="px-4 py-3 font-medium text-foreground">
                                        {log.template}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">{log.recipient}</td>
                                    <td className="px-4 py-3">
                                        <div>
                                            <StatusBadge status={statusMeta[log.status]} />
                                            {log.failureReason && (
                                                <p className="mt-0.5 text-xs text-danger">
                                                    {log.failureReason}
                                                </p>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums">{log.attempts}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>

                {selected && (
                    <Card className="h-fit rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Message detail
                        </h3>
                        <p className="mt-2 text-sm font-semibold text-foreground">{selected.template}</p>
                        <p className="text-xs text-muted-foreground">
                            {selected.channel} · {selected.recipient}
                        </p>

                        <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Attempts
                        </h4>
                        <ol className="mt-2 space-y-2.5">
                            {selected.attemptTrail.map((attempt) => (
                                <li key={attempt.index} className="flex items-start gap-2.5 text-sm">
                                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                                        {attempt.index}
                                    </span>
                                    <div>
                                        <p className="text-foreground">
                                            <span className="font-medium">{attempt.status}</span>{" "}
                                            <span className="text-xs text-muted-foreground">
                                                {attempt.time}
                                            </span>
                                        </p>
                                        <p className="text-xs text-muted-foreground">{attempt.detail}</p>
                                    </div>
                                </li>
                            ))}
                        </ol>

                        <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Provider response
                        </h4>
                        <code className="mt-2 block rounded-md bg-muted px-3 py-2 text-xs">
                            {selected.providerResponse}
                        </code>

                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-4 h-8 w-full bg-card"
                            onClick={() => toast.success("Message queued for resend")}
                        >
                            Resend message
                        </Button>
                    </Card>
                )}
            </div>
        </div>
    );
}
