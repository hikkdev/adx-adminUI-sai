"use client";

import * as React from "react";
import { Info, Paperclip, Search, Send } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { FilterChips } from "@/components/adx/filter-chips";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { StatusBadge } from "@/components/adx/status-badge";
import { FieldList } from "@/components/adx/simple-table";
import { formatDateTime } from "@/lib/format";
import { REQUESTER_ROLE_LABEL, shapeThread, slaBadge, supportService, type TicketPatch, type TicketQueuePage } from "@/services/support";
import { agentLabel, type AgentSummary } from "@/services/agents";
import type { UserRow } from "@/services/users";
import {
    TICKET_PRIORITIES,
    TICKET_PRIORITY_META,
    TICKET_STATUS_META,
    type Ticket,
    type TicketMessage,
    type TicketPriority,
} from "@/types";
import type { KindChip, QueueChip, QueueFacets } from "./support-loader";
import { RequesterRail } from "./requester-rail";

interface SupportConsoleProps {
    page: TicketQueuePage;
    facets: QueueFacets;
    onFacetsChange: (facets: QueueFacets) => void;
    /** The field agents, for "Who is on this". */
    agents: AgentSummary[];
    /** The console's own ADMIN users, for the ops-owner picker. */
    admins: UserRow[];
    onChanged?: () => void;
}

/** "3d", "4h", "12m" — how long somebody has been waiting. */
function since(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(ms) || ms < 0) return "";
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}

/** The value the two "nobody" choices use: a Radix Select item may not carry "". */
const NOBODY = "__nobody__";

/** The chip value for "any team": a team is free text, so the sentinel cannot collide with one of at most 60 letters. */
const ANY_TEAM = "__any_team__";

/**
 * The teams the chips offer: the queue's `teams[]` facet (E10-1 — the
 * distinct teams across the whole queue, not the page), plus the one in
 * force so the chip that narrowed the view stays drawn. A page older than
 * the facet falls back to the teams on its rows, which is all it can name.
 */
export function teamChipsOf(page: { teams?: string[]; items: { team: string | null }[] }, inForce: string | null): string[] {
    const teams = new Set<string>(page.teams ?? []);
    if (!page.teams) for (const item of page.items) if (item.team) teams.add(item.team);
    if (inForce) teams.add(inForce);
    return [...teams].sort((a, b) => a.localeCompare(b));
}

/** "Ravi Kumar · Publisher", or the login's id when the row carries no requester. */
export function requesterLine(ticket: Ticket): string {
    const requester = ticket.requester;
    if (!requester) return ticket.userId;
    const name = requester.name?.trim() || requester.userId;
    return requester.role ? `${name} · ${REQUESTER_ROLE_LABEL[requester.role]}` : name;
}

/**
 * The support desk — DR 10 "Support · /support".
 *
 * Everything on it is real. The queue is `GET /support/tickets/queue` under
 * the chips (Open, Mine, All; issues or feedback; the team), the priority
 * picker, the breached toggle and the search; every row names who raised it
 * (E7-3); selecting a ticket reads its thread by id and the requester rail
 * beside it; the composer posts a
 * reply that reaches the raiser signed "ADX Support", or — with the switch
 * on — an internal note the requester never sees, drawn in the amber the
 * frame gives it. Resolve, Reopen and "Waiting on the requester" are the
 * same PATCH the priority and the ops owner go through; WAITING pauses the
 * SLA clock, and the badge on the row says so.
 *
 * Assignment is the write with reach: putting a field agent on a request is
 * what later authorises delegated access to the requester's account, so it
 * is ADMIN-only and the actor is recorded.
 */
export function SupportConsole({ page, facets, onFacetsChange, agents, admins, onChanged }: SupportConsoleProps) {
    const tickets = page.items;
    const [selectedId, setSelectedId] = React.useState<string | undefined>(tickets[0]?.id);
    const [reply, setReply] = React.useState("");
    const [internal, setInternal] = React.useState(false);
    const [assigning, setAssigning] = React.useState(false);
    // Keyed on the ticket it belongs to, so switching tickets shows nothing
    // stale and a load is "in flight" whenever the key does not match.
    const [thread, setThread] = React.useState<{ ticketId: string; messages: TicketMessage[] | null } | null>(null);
    const [sending, setSending] = React.useState(false);
    const [patching, setPatching] = React.useState(false);
    const [reload, setReload] = React.useState(0);

    const openCount = (page.counts.OPEN ?? 0) + (page.counts.WAITING ?? 0);
    const allCount = Object.values(page.counts).reduce((sum, n) => sum + n, 0);

    const selected = tickets.find((ticket) => ticket.id === selectedId) ?? tickets[0];
    const threadTicketId = selected?.id;

    /** The thread, read by id whenever the selection changes or a reload is
     *  asked for. A read that lands after the operator has moved on to another
     *  ticket is dropped rather than shown under the wrong one. */
    React.useEffect(() => {
        if (!threadTicketId) return;
        let cancelled = false;
        supportService
            .ticket(threadTicketId)
            .then((full) => {
                if (!cancelled) setThread({ ticketId: threadTicketId, messages: shapeThread(full) });
            })
            .catch(() => {
                if (!cancelled) setThread({ ticketId: threadTicketId, messages: null });
            });
        return () => {
            cancelled = true;
        };
    }, [threadTicketId, reload]);

    const current = thread && thread.ticketId === threadTicketId ? thread : null;
    const threadState: "idle" | "loading" | "error" = !current ? "loading" : current.messages === null ? "error" : "idle";
    const messages: TicketMessage[] = current?.messages ?? [];

    const setChip = (chip: QueueChip) => onFacetsChange({ ...facets, chip });
    const teamChips = teamChipsOf(page, facets.team);

    const sendReply = async () => {
        if (!reply.trim() || !selected) return;
        setSending(true);
        try {
            await supportService.reply(selected.id, reply.trim(), internal);
            setReply("");
            toast.success(internal ? "Internal note added" : "Reply sent", {
                description: internal
                    ? "Only the support team sees it. Nothing was sent to the requester."
                    : "Signed ADX Support; the requester has been told.",
            });
            setReload((n) => n + 1);
            // A public reply is the first response; the row's clock moves.
            if (!internal) onChanged?.();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not send the reply.");
        } finally {
            setSending(false);
        }
    };

    async function patch(ticket: Ticket, input: TicketPatch, success: string, description?: string) {
        setPatching(true);
        try {
            await supportService.patch(ticket.id, input);
            toast.success(success, description ? { description } : undefined);
            onChanged?.();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not change the ticket.");
        } finally {
            setPatching(false);
        }
    }

    async function assign(ticketId: string, agentId: string | null) {
        setAssigning(true);
        try {
            await supportService.assign(ticketId, agentId);
            toast.success(agentId ? "Agent put on this request" : "Agent taken off");
            onChanged?.();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not change the assignment.");
        } finally {
            setAssigning(false);
        }
    }

    const assignedTo = (ticket: Ticket): string => {
        if (!ticket.assignedAgentId) return "Nobody yet";
        const agent = agents.find((candidate) => candidate.id === ticket.assignedAgentId);
        return agent ? agentLabel(agent) : ticket.assignedAgentId;
    };

    const ownerName = (ticket: Ticket): string => {
        if (!ticket.assignedAdminUserId) return "Nobody yet";
        return admins.find((user) => user.id === ticket.assignedAdminUserId)?.displayName ?? ticket.assignedAdminUserId;
    };

    const label = (ticket: Ticket) => ticket.displayId ?? ticket.id;

    return (
        <div className="grid gap-4 xl:grid-cols-12">
            {/* Queue pane */}
            <Card className="flex flex-col overflow-hidden rounded-lg border-border shadow-none xl:col-span-3">
                <div className="space-y-3 border-b p-4">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={facets.q}
                            onChange={(event) => onFacetsChange({ ...facets, q: event.target.value })}
                            placeholder="Search tickets…"
                            className="h-9 pl-8"
                        />
                    </div>
                    <FilterChips<QueueChip>
                        value={facets.chip}
                        onChange={setChip}
                        chips={[
                            { value: "open", label: "Open", count: facets.chip === "mine" ? undefined : openCount },
                            { value: "mine", label: "Mine", count: facets.chip === "mine" ? page.total : undefined },
                            { value: "all", label: "All", count: facets.chip === "mine" ? undefined : allCount },
                        ]}
                    />
                    <FilterChips<KindChip>
                        value={facets.kind}
                        onChange={(kind) => onFacetsChange({ ...facets, kind })}
                        chips={[
                            { value: "ALL", label: "Issues & feedback" },
                            { value: "ISSUE", label: "Issues" },
                            { value: "FEEDBACK", label: "Feedback" },
                        ]}
                    />
                    {teamChips.length > 0 && (
                        <FilterChips<string>
                            value={facets.team ?? ANY_TEAM}
                            onChange={(team) => onFacetsChange({ ...facets, team: team === ANY_TEAM ? null : team })}
                            chips={[{ value: ANY_TEAM, label: "Any team" }, ...teamChips.map((team) => ({ value: team, label: team }))]}
                        />
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                        <Select
                            value={facets.priority}
                            onValueChange={(value) => onFacetsChange({ ...facets, priority: value as TicketPriority | "ALL" })}
                        >
                            <SelectTrigger className="h-8 w-[140px] bg-card text-xs" aria-label="Priority">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Any priority</SelectItem>
                                {TICKET_PRIORITIES.map((priority) => (
                                    <SelectItem key={priority} value={priority}>
                                        {TICKET_PRIORITY_META[priority].label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Switch
                                checked={facets.breached}
                                onCheckedChange={(breached) => onFacetsChange({ ...facets, breached })}
                                aria-label="Breached only"
                            />
                            Breached
                        </label>
                    </div>
                </div>
                <ul className="flex-1 divide-y overflow-y-auto">
                    {tickets.length === 0 && (
                        <li className="p-4 text-sm text-muted-foreground">Nothing in this view.</li>
                    )}
                    {tickets.map((ticket) => {
                        const sla = slaBadge(ticket.sla, ticket.status);
                        return (
                            <li key={ticket.id}>
                                <button
                                    type="button"
                                    onClick={() => setSelectedId(ticket.id)}
                                    className={cn(
                                        "w-full px-4 py-3 text-left transition-colors",
                                        selected?.id === ticket.id ? "bg-muted" : "hover:bg-muted/50"
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="truncate text-sm font-medium text-foreground">{ticket.title}</p>
                                        {(ticket.priority === "URGENT" || ticket.priority === "HIGH") && (
                                            <StatusBadge status={TICKET_PRIORITY_META[ticket.priority]} />
                                        )}
                                    </div>
                                    <p className="mt-0.5 truncate text-xs text-foreground/80" data-testid="queue-requester">
                                        {requesterLine(ticket)}
                                    </p>
                                    <div className="mt-1 flex items-center justify-between gap-2">
                                        <span className="truncate text-xs text-muted-foreground">
                                            {ticket.displayId ? `${ticket.displayId} · ` : ""}
                                            <span className="capitalize">{ticket.category.toLowerCase().replace(/_/g, " ")}</span>
                                            {ticket.kind === "FEEDBACK" ? " · feedback" : ""}
                                            {ticket.assignedAgentId === null && ticket.status !== "CLOSED" ? " · unassigned" : ""}
                                        </span>
                                        <span className="shrink-0 text-xs text-muted-foreground">{since(ticket.createdAt)}</span>
                                    </div>
                                    {sla && (
                                        <p
                                            className={cn(
                                                "mt-1 text-[11px] font-medium",
                                                sla.tone === "danger"
                                                    ? "text-danger"
                                                    : sla.tone === "warning"
                                                      ? "text-warning"
                                                      : "text-muted-foreground"
                                            )}
                                        >
                                            {sla.label}
                                        </p>
                                    )}
                                </button>
                            </li>
                        );
                    })}
                </ul>
                {page.total > tickets.length && (
                    <p className="border-t px-4 py-2 text-xs text-muted-foreground">
                        Showing the first {tickets.length} of {page.total}. Narrow the view to see the rest.
                    </p>
                )}
            </Card>

            {/* Conversation pane */}
            {selected && (
                <Card className="flex min-h-[70vh] flex-col overflow-hidden rounded-lg border-border shadow-none xl:col-span-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
                        <div className="flex flex-wrap items-center gap-2.5">
                            {selected.displayId && (
                                <span className="font-mono text-xs text-muted-foreground">{selected.displayId}</span>
                            )}
                            <h2 className="text-base font-semibold text-foreground">{selected.title}</h2>
                            {selected.kind === "FEEDBACK" && <StatusBadge status={{ label: "Feedback", tone: "info" }} />}
                            <StatusBadge status={TICKET_STATUS_META[selected.status]} />
                            <StatusBadge status={TICKET_PRIORITY_META[selected.priority]} />
                        </div>
                        <div className="flex items-center gap-2">
                            {selected.status === "OPEN" && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 bg-card"
                                    disabled={patching}
                                    onClick={() =>
                                        void patch(
                                            selected,
                                            { status: "WAITING" },
                                            `${label(selected)} waiting on the requester`,
                                            "The SLA clock is paused until they reply; they have been told."
                                        )
                                    }
                                >
                                    Waiting on the requester
                                </Button>
                            )}
                            {selected.status === "WAITING" && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 bg-card"
                                    disabled={patching}
                                    onClick={() =>
                                        void patch(selected, { status: "OPEN" }, `${label(selected)} back in the queue`, "The wait is banked and the clock runs again.")
                                    }
                                >
                                    Resume
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 bg-card"
                                disabled={patching}
                                onClick={() =>
                                    selected.status === "CLOSED"
                                        ? void patch(selected, { status: "OPEN" }, `${label(selected)} reopened`, "The requester has been told.")
                                        : void patch(selected, { status: "CLOSED" }, `${label(selected)} resolved`, "The requester has been told.")
                                }
                            >
                                {selected.status === "CLOSED" ? "Reopen ticket" : "Resolve ticket"}
                            </Button>
                        </div>
                    </div>

                    <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                        {/* What the requester wrote is on the ticket itself. */}
                        <div className="rounded-lg bg-muted px-3.5 py-2.5">
                            <p className="text-sm">{selected.description}</p>
                            {selected.attachmentUrls && selected.attachmentUrls.length > 0 && (
                                <ul className="mt-2 flex flex-wrap gap-2">
                                    {selected.attachmentUrls.map((url, index) => (
                                        <li key={url}>
                                            <a
                                                href={url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex items-center gap-1.5 rounded-md bg-card px-2 py-1.5 text-xs text-foreground underline-offset-2 hover:underline"
                                            >
                                                <Paperclip className="size-3.5" aria-hidden />
                                                Attachment {index + 1}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <p className="mt-1.5 text-[10px] text-muted-foreground">
                                {selected.requester?.name?.trim() || "Requester"} · {formatDateTime(selected.createdAt)}
                            </p>
                        </div>

                        {messages.map((message) => {
                            const isSupport = message.kind === "support" || message.kind === "internal";
                            return (
                                <div key={message.id} className={cn("flex gap-2.5", isSupport && "flex-row-reverse")}>
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

                        {threadState === "loading" && messages.length === 0 && (
                            <p className="text-center text-xs text-muted-foreground">Loading the conversation…</p>
                        )}
                        {threadState === "error" && (
                            <div className="flex items-start gap-3 rounded-lg border border-dashed p-4">
                                <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                                <div>
                                    <p className="text-sm font-medium text-foreground">Could not load the conversation</p>
                                    <Button
                                        variant="link"
                                        size="sm"
                                        className="h-auto p-0 text-sm"
                                        onClick={() => {
                                            setThread(null);
                                            setReload((n) => n + 1);
                                        }}
                                    >
                                        Try again
                                    </Button>
                                </div>
                            </div>
                        )}
                        {threadState === "idle" && messages.length === 0 && (
                            <p className="text-center text-xs text-muted-foreground">
                                No replies yet. What the requester wrote is above.
                            </p>
                        )}
                    </div>

                    <div className="border-t p-4">
                        <div className="flex items-center gap-2">
                            <Input
                                value={reply}
                                onChange={(event) => setReply(event.target.value)}
                                onKeyDown={(event) => event.key === "Enter" && void sendReply()}
                                disabled={sending}
                                placeholder={internal ? "Add an internal note (not visible to the requester)…" : "Reply as ADX Support…"}
                                className={cn("h-10", internal && "bg-warning-soft")}
                            />
                            <Button
                                onClick={() => void sendReply()}
                                className="h-10 shrink-0"
                                disabled={sending || !reply.trim()}
                                variant={internal ? "outline" : "default"}
                            >
                                <Send className="mr-1.5 size-4" />
                                {internal ? "Save note" : "Send"}
                            </Button>
                        </div>
                        <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                            <Switch checked={internal} onCheckedChange={setInternal} aria-label="Internal note" />
                            Internal note, only visible to the support team
                        </label>
                    </div>
                </Card>
            )}

            {/* Context rail */}
            {selected && (
                <div className="space-y-4 xl:col-span-3">
                    {/* E7-3: who raised it, keyed on the ticket so a switch re-reads. */}
                    <RequesterRail key={selected.id} ticketId={selected.id} />

                    <Card className="rounded-lg border-border p-4 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Who is on this
                        </h3>
                        <p className="mt-2 text-sm text-foreground">{assignedTo(selected)}</p>
                        <Select
                            value={selected.assignedAgentId ?? NOBODY}
                            onValueChange={(value) => void assign(selected.id, value === NOBODY ? null : value)}
                            disabled={assigning}
                        >
                            <SelectTrigger className="mt-3 h-9" aria-label="Field agent">
                                <SelectValue placeholder="Put an agent on it" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NOBODY}>Nobody</SelectItem>
                                {agents.map((agent) => (
                                    <SelectItem key={agent.id} value={agent.id}>
                                        {agentLabel(agent)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="mt-2 text-xs text-muted-foreground">
                            Whoever is on this request is the only agent the requester can scan into their account.
                        </p>
                    </Card>

                    <Card className="rounded-lg border-border p-4 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Ticket properties
                        </h3>
                        <div className="mt-3 space-y-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="ticket-owner" className="text-xs text-muted-foreground">
                                    Assignee
                                </Label>
                                <Select
                                    value={selected.assignedAdminUserId ?? NOBODY}
                                    onValueChange={(value) =>
                                        void patch(
                                            selected,
                                            { assignedAdminUserId: value === NOBODY ? null : value },
                                            value === NOBODY ? "Ops owner taken off" : "Ops owner set"
                                        )
                                    }
                                    disabled={patching}
                                >
                                    <SelectTrigger id="ticket-owner" className="h-9">
                                        <SelectValue placeholder="Nobody yet" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NOBODY}>Nobody</SelectItem>
                                        {admins.map((user) => (
                                            <SelectItem key={user.id} value={user.id}>
                                                {user.displayName}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="ticket-priority" className="text-xs text-muted-foreground">
                                    Priority
                                </Label>
                                <Select
                                    value={selected.priority}
                                    onValueChange={(value) =>
                                        void patch(
                                            selected,
                                            { priority: value as TicketPriority },
                                            `${label(selected)} set to ${TICKET_PRIORITY_META[value as TicketPriority].label.toLowerCase()}`,
                                            "Both SLA clocks were recomputed from when the ticket was raised."
                                        )
                                    }
                                    disabled={patching}
                                >
                                    <SelectTrigger id="ticket-priority" className="h-9">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {TICKET_PRIORITIES.map((priority) => (
                                            <SelectItem key={priority} value={priority}>
                                                {TICKET_PRIORITY_META[priority].label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <TeamField key={selected.id} ticket={selected} disabled={patching} onSave={(team) => patch(selected, { team }, team ? `Team set to ${team}` : "Team cleared")} />
                        </div>
                        <FieldList
                            className="mt-3"
                            items={[
                                ["Owner", ownerName(selected)],
                                ["Category", selected.category],
                                ["Created", formatDateTime(selected.createdAt)],
                                ["SLA", <SlaLine key="sla" ticket={selected} />],
                                ["First response", selected.firstRespondedAt ? formatDateTime(selected.firstRespondedAt) : "Not yet"],
                                ["Order", selected.relatedOrderId ?? "—"],
                                ["Ticket", selected.displayId ?? selected.id],
                            ]}
                        />
                    </Card>
                </div>
            )}
        </div>
    );
}

/** The SLA line on the properties card: the badge, and the two due dates under it. */
function SlaLine({ ticket }: { ticket: Ticket }) {
    const badge = slaBadge(ticket.sla, ticket.status);
    if (!badge) return <span>—</span>;
    return (
        <span
            className={cn(
                "font-medium",
                badge.tone === "danger" ? "text-danger" : badge.tone === "warning" ? "text-warning" : "text-foreground"
            )}
        >
            {badge.label}
        </span>
    );
}

/** The team is a free label the desk sorts by; saved on blur or Enter, cleared with an empty string. */
function TeamField({ ticket, disabled, onSave }: { ticket: Ticket; disabled: boolean; onSave: (team: string | null) => Promise<void> }) {
    const [team, setTeam] = React.useState(ticket.team ?? "");
    const commit = () => {
        const next = team.trim() || null;
        if (next === (ticket.team ?? null)) return;
        void onSave(next);
    };
    return (
        <div className="space-y-1.5">
            <Label htmlFor="ticket-team" className="text-xs text-muted-foreground">
                Team
            </Label>
            <Input
                id="ticket-team"
                value={team}
                onChange={(event) => setTeam(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => event.key === "Enter" && commit()}
                placeholder="Payments, Fulfilment…"
                className="h-9"
                disabled={disabled}
                maxLength={60}
            />
        </div>
    );
}
