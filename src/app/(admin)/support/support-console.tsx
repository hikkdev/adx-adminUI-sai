"use client";

import * as React from "react";
import Link from "next/link";
import { Paperclip, Search, Send } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FilterChips } from "@/components/adx/filter-chips";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { StatusBadge } from "@/components/adx/status-badge";
import { FieldList } from "@/components/adx/simple-table";
import { formatINR } from "@/lib/format";
import { TICKET_STATUS_META, type Ticket } from "@/types";

interface SupportConsoleProps {
    tickets: Ticket[];
}

type ChipValue = "open" | "mine" | "all";

export function SupportConsole({ tickets }: SupportConsoleProps) {
    const [chip, setChip] = React.useState<ChipValue>("open");
    const [search, setSearch] = React.useState("");
    const [selectedId, setSelectedId] = React.useState(tickets[0]?.id);
    const [reply, setReply] = React.useState("");
    const [internal, setInternal] = React.useState(false);

    const openCount = tickets.filter((ticket) => ticket.status !== "resolved").length;
    const mineCount = tickets.filter((ticket) => ticket.mine).length;

    const visible = tickets
        .filter((ticket) =>
            chip === "open" ? ticket.status !== "resolved" : chip === "mine" ? ticket.mine : true
        )
        .filter((ticket) =>
            `${ticket.subject} ${ticket.requester}`.toLowerCase().includes(search.toLowerCase())
        );

    const selected = tickets.find((ticket) => ticket.id === selectedId) ?? visible[0];

    const sendReply = () => {
        if (!reply.trim()) return;
        toast.success(internal ? "Internal note added" : `Reply sent to ${selected?.requester}`);
        setReply("");
    };

    return (
        <div className="grid gap-4 xl:grid-cols-12">
            {/* Queue pane */}
            <Card className="flex flex-col overflow-hidden rounded-lg border-border shadow-none xl:col-span-3">
                <div className="space-y-3 border-b p-4">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search tickets…"
                            className="h-9 pl-8"
                        />
                    </div>
                    <FilterChips<ChipValue>
                        value={chip}
                        onChange={setChip}
                        chips={[
                            { value: "open", label: "Open", count: openCount },
                            { value: "mine", label: "Mine", count: mineCount },
                            { value: "all", label: "All" },
                        ]}
                    />
                </div>
                <ul className="flex-1 divide-y overflow-y-auto">
                    {visible.map((ticket) => (
                        <li key={ticket.id}>
                            <button
                                type="button"
                                onClick={() => setSelectedId(ticket.id)}
                                className={cn(
                                    "w-full px-4 py-3 text-left transition-colors",
                                    ticket.id === selected?.id
                                        ? "bg-primary/[0.04]"
                                        : "hover:bg-muted/50"
                                )}
                            >
                                <p className="truncate text-sm font-medium text-foreground">
                                    {ticket.subject}
                                </p>
                                <div className="mt-1 flex items-center justify-between gap-2">
                                    <span className="text-xs text-muted-foreground">{ticket.team}</span>
                                    <span className="text-xs text-muted-foreground">{ticket.ago}</span>
                                </div>
                            </button>
                        </li>
                    ))}
                </ul>
            </Card>

            {/* Conversation pane */}
            {selected && (
                <Card className="flex min-h-[70vh] flex-col overflow-hidden rounded-lg border-border shadow-none xl:col-span-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                            <h2 className="text-base font-semibold text-foreground">
                                {selected.subject}
                            </h2>
                            <StatusBadge status={TICKET_STATUS_META[selected.status]} />
                            {selected.priority === "high" && (
                                <StatusBadge status={{ label: "High", tone: "danger" }} />
                            )}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 bg-card"
                            onClick={() => toast.success(`Ticket ${selected.id} resolved`)}
                        >
                            Resolve ticket
                        </Button>
                    </div>

                    <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                        {selected.messages.map((message) => {
                            if (message.kind === "system") {
                                return (
                                    <p
                                        key={message.id}
                                        className="text-center text-xs text-muted-foreground"
                                    >, {message.body}, </p>
                                );
                            }
                            const isSupport = message.kind === "support" || message.kind === "internal";
                            return (
                                <div
                                    key={message.id}
                                    className={cn("flex gap-2.5", isSupport && "flex-row-reverse")}
                                >
                                    <InitialsAvatar name={message.from} size="sm" className="mt-1" />
                                    <div
                                        className={cn(
                                            "max-w-[75%] rounded-lg px-3.5 py-2.5",
                                            message.kind === "internal"
                                                ? "bg-warning-soft"
                                                : isSupport
                                                  ? "bg-primary text-primary-foreground"
                                                  : "bg-muted"
                                        )}
                                    >
                                        {message.kind === "internal" && (
                                            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-warning">
                                                Internal note
                                            </p>
                                        )}
                                        <p className="text-sm">{message.body}</p>
                                        {message.attachment && (
                                            <p
                                                className={cn(
                                                    "mt-2 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs",
                                                    isSupport ? "bg-white/10" : "bg-card"
                                                )}
                                            >
                                                <Paperclip className="size-3.5" />
                                                {message.attachment.name} · {message.attachment.size}
                                            </p>
                                        )}
                                        <p
                                            className={cn(
                                                "mt-1.5 text-[10px]",
                                                message.kind === "internal"
                                                    ? "text-warning/80"
                                                    : isSupport
                                                      ? "text-primary-foreground/70"
                                                      : "text-muted-foreground"
                                            )}
                                        >
                                            {message.from} · {message.at}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="border-t p-4">
                        <div className="flex items-center gap-2">
                            <Input
                                value={reply}
                                onChange={(event) => setReply(event.target.value)}
                                onKeyDown={(event) => event.key === "Enter" && sendReply()}
                                placeholder={
                                    internal
                                        ? "Add an internal note (not visible to the requester)…"
                                        : `Write a public reply to ${selected.requester.split(" ")[0]}…`
                                }
                                className={cn("h-10", internal && "bg-warning-soft")}
                            />
                            <Button onClick={sendReply} className="h-10 shrink-0">
                                <Send className="mr-1.5 size-4" />
                                Send
                            </Button>
                        </div>
                        <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                            <Switch checked={internal} onCheckedChange={setInternal} />
                            Internal note, only visible to the support team
                        </label>
                    </div>
                </Card>
            )}

            {/* Context rail */}
            {selected && (
                <div className="space-y-4 xl:col-span-3">
                    <Card className="rounded-lg border-border p-4 shadow-none">
                        <div className="flex items-center gap-3">
                            <InitialsAvatar name={selected.requester} size="lg" />
                            <div>
                                <p className="text-sm font-semibold text-foreground">
                                    {selected.requester}
                                </p>
                                <p className="text-xs text-muted-foreground">{selected.requesterRole}</p>
                            </div>
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                            {[
                                ["Wallet", formatINR(selected.wallet)],
                                ["Open orders", String(selected.openOrders)],
                                ["Tickets", String(selected.ticketCount)],
                            ].map(([label, value]) => (
                                <div key={label} className="rounded-md bg-muted/60 px-1 py-2">
                                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                        {label}
                                    </p>
                                    <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
                                        {value}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </Card>

                    <Card className="rounded-lg border-border p-4 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Ticket properties
                        </h3>
                        <FieldList
                            className="mt-3"
                            items={[
                                ["Assignee", selected.assignee],
                                ["Team", selected.team],
                                ["Created", selected.createdAt],
                                ["SLA", selected.slaLeft],
                            ]}
                        />
                    </Card>

                    <Card className="rounded-lg border-border p-4 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Recent activity
                        </h3>
                        <ul className="mt-3 space-y-2.5">
                            {selected.recentActivity.map((activity) => (
                                <li
                                    key={activity.label}
                                    className="flex items-center justify-between gap-3 text-sm"
                                >
                                    <span className="min-w-0 flex-1 truncate text-foreground">
                                        {activity.label}
                                    </span>
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                        {activity.ago}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </Card>

                    <div className="grid gap-2">
                        <Button variant="outline" className="bg-card" asChild>
                            <Link href="/publishers">View in admin</Link>
                        </Button>
                        <Button
                            variant="outline"
                            className="bg-card"
                            onClick={() =>
                                toast.info("Audited session started, every action will be logged.")
                            }
                        >
                            Start audited session
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
