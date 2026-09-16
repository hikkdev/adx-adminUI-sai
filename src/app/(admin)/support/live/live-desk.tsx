"use client";

import * as React from "react";
import { MessageSquareDashed, Radio } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/adx/empty-state";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { staleLabel, type Presence } from "@/lib/use-presence";
import {
    clock,
    firstResponseLeftMs,
    firstResponseTookMs,
    sortInbox,
    waitedLabel,
    type CannedReply,
    type InboxStreamEvent,
    type LiveInboxFacets,
    type LiveInboxPage,
    type LiveInboxRow,
} from "@/services/live-chat";
import { ChatPane } from "./chat-pane";
import { PlanBadge } from "./plan-badge";

interface LiveDeskProps {
    page: LiveInboxPage;
    presence: Presence;
    canned: CannedReply[];
    /** The last thing the desk's stream said, drawn as the "just now" line under the header. */
    lastEvent: InboxStreamEvent | null;
    /** The two toggles above the list — `?mine=1`, `?unassigned=1` — read off the URL by the loader. */
    facets: LiveInboxFacets;
    onFacetsChange: (next: LiveInboxFacets) => void;
    onChanged: () => void;
}

/**
 * A clock that ticks.
 *
 * The first-response countdown is the one number on this screen that changes
 * without anything happening, so it is driven by a second hand rather than by
 * a re-read. One interval for the whole list; every row reads the same now.
 */
function useNow(intervalMs = 1000): number {
    const [now, setNow] = React.useState(() => Date.now());
    React.useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(timer);
    }, [intervalMs]);
    return now;
}

/** "Ravi Kumar", or the login id when the row carries no name. */
function requesterName(row: LiveInboxRow): string {
    return row.requester.name?.trim() || row.requester.userId;
}

/**
 * The operator's Online / Offline switch.
 *
 * It reflects the server, not the click: `PUT /support/presence` then a fresh
 * `GET /support/presence`, so the state the switch shows is the state the
 * assigner will read. That is also why it survives a reload — there is nothing
 * local to lose.
 */
function PresenceToggle({ presence, now }: { presence: Presence; now: number }) {
    const [pending, setPending] = React.useState(false);

    const toggle = async (next: boolean) => {
        setPending(true);
        try {
            await presence.setOnline(next);
            toast.success(next ? "You are on the live desk" : "You are off the live desk", {
                description: next
                    ? "New chats can be assigned to you while this console keeps its presence alive."
                    : "Nothing new will be assigned to you. Chats you already hold stay yours.",
            });
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not change your presence.");
        } finally {
            setPending(false);
        }
    };

    return (
        <div className="flex items-center gap-3 rounded-md border px-3 py-2">
            <span
                aria-hidden
                className={cn("size-2 shrink-0 rounded-full", presence.online ? "bg-success" : "bg-muted-foreground/40")}
            />
            <div className="min-w-0">
                <Label htmlFor="live-presence" className="cursor-pointer text-sm font-medium">
                    {presence.online ? "Online" : "Offline"}
                </Label>
                <p className="text-xs text-muted-foreground">
                    {presence.online
                        ? `${presence.myOpenChats} open chat${presence.myOpenChats === 1 ? "" : "s"}`
                        : "Not taking new chats"}
                </p>
                {/* A roster read that failed keeps the last roster on screen and
                    says how old it is — the operator is still on as far as the
                    server knows, so the switch stays exactly where it was. */}
                {presence.stale && (
                    <p className="text-[11px] text-warning" data-testid="presence-stale">
                        {staleLabel(presence.lastReadAt, now)}
                    </p>
                )}
            </div>
            <Switch
                id="live-presence"
                checked={presence.online}
                disabled={pending || presence.busy || presence.loading}
                onCheckedChange={(next) => void toggle(next)}
                aria-label="Online at the live desk"
            />
        </div>
    );
}

/** The countdown, and what it turns into once an answer has come. */
function FirstResponse({ row, targetSec, now }: { row: LiveInboxRow; targetSec: number; now: number }) {
    const left = firstResponseLeftMs(row, targetSec, now);
    if (left === null) {
        const took = firstResponseTookMs(row);
        return (
            <span className={cn("tabular-nums", row.firstResponseBreached ? "text-danger" : "text-muted-foreground")}>
                {took === null ? "Answered" : `Answered in ${clock(took)}`}
            </span>
        );
    }
    const late = left <= 0;
    return (
        <span
            className={cn("tabular-nums font-medium", late ? "text-danger" : "text-muted-foreground")}
            title={late ? "Past the first-response target" : "Time left on the first-response target"}
        >
            {late ? `+${clock(left)} over` : `${clock(left)} left`}
        </span>
    );
}

function InboxRow({
    row,
    targetSec,
    now,
    selected,
    onSelect,
}: {
    row: LiveInboxRow;
    targetSec: number;
    now: number;
    selected: boolean;
    onSelect: () => void;
}) {
    const waiting = row.waitingSince ? now - new Date(row.waitingSince).getTime() : null;
    return (
        <button
            type="button"
            onClick={onSelect}
            aria-current={selected ? "true" : undefined}
            className={cn(
                "flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted/50",
                selected && "bg-muted/70",
            )}
        >
            <InitialsAvatar name={requesterName(row)} size="md" />
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{requesterName(row)}</span>
                    <PlanBadge plan={row.plan} />
                    {row.unread > 0 && (
                        <span className="ml-auto shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground tabular-nums">
                            {row.unread}
                        </span>
                    )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {row.lastMessage
                        ? `${row.lastMessage.authorName}: ${row.lastMessage.kind === "ATTACHMENT" ? "Attachment" : row.lastMessage.message}`
                        : row.title}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                    <FirstResponse row={row} targetSec={targetSec} now={now} />
                    {waiting !== null && (
                        <span className="text-muted-foreground">waiting {waitedLabel(waiting)}</span>
                    )}
                    <span className="text-muted-foreground">
                        {row.assignedAdmin ? (row.assignedAdmin.name ?? "Assigned") : "Unassigned"}
                    </span>
                    {row.displayId && <span className="text-muted-foreground/70">{row.displayId}</span>}
                </div>
            </div>
        </button>
    );
}

/**
 * One of the two facet toggles above the list.
 *
 * Independent booleans rather than a single-select chip row: "mine" and
 * "unassigned" are both true of nothing at once, but the desk may well want
 * to look at each in turn, and the list contract takes both.
 */
function FacetToggle({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
    return (
        <button
            type="button"
            aria-pressed={on}
            onClick={onToggle}
            className={cn(
                "flex h-7 items-center rounded-full border px-2.5 text-xs font-medium transition-colors",
                on ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
            )}
        >
            {label}
        </button>
    );
}

/** "Priya replied on TKT-…", the last thing the desk's stream said. */
function lastEventLine(event: InboxStreamEvent | null): string | null {
    if (!event) return null;
    const ref = event.displayId ?? event.ticketId;
    if (event.type === "chat") return `New chat from ${event.requesterName ?? "a subscriber"} — ${ref}`;
    if (event.type === "message") return `${event.authorName} on ${ref}: ${event.preview}`;
    return `${ref} has waited ${Math.round(event.waitedSec)}s with no answer`;
}

/**
 * The desk: the roster switch, the inbox, and the chat.
 *
 * The list is ordered by `sortInbox` — breached first, then waiting longest —
 * and never by arrival, because the order is the promise about who gets
 * answered next. The selection follows the list: a chat that leaves the inbox
 * (closed, converted) drops the pane back to the top of the queue rather than
 * leaving a dead thread on screen.
 */
export function LiveDesk({ page, presence, canned, lastEvent, facets, onFacetsChange, onChanged }: LiveDeskProps) {
    const now = useNow();
    const rows = React.useMemo(() => sortInbox(page.items), [page.items]);
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const selected = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null;
    const line = lastEventLine(lastEvent);
    const filtered = facets.mine || facets.unassigned;

    return (
        <div className="space-y-5">
            <PageHeader
                title="Live chat"
                subtitle={`${page.total} open chat${page.total === 1 ? "" : "s"} · first response target ${page.firstResponseTargetSec}s`}
                actions={<PresenceToggle presence={presence} now={now} />}
            />

            {line && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Radio className="size-3.5 shrink-0 text-success" aria-hidden />
                    <span className="truncate">{line}</span>
                </p>
            )}

            <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
                <Card className="overflow-hidden rounded-lg border-border shadow-none">
                    <div className="flex items-center justify-between border-b px-4 py-3">
                        <h2 className="text-sm font-semibold text-foreground">Inbox</h2>
                        <span className="text-xs text-muted-foreground">Breached first, then longest wait</span>
                    </div>
                    <div className="flex items-center gap-1.5 border-b px-4 py-2" aria-label="Inbox filters">
                        <FacetToggle
                            label="Mine"
                            on={facets.mine}
                            onToggle={() => onFacetsChange({ ...facets, mine: !facets.mine })}
                        />
                        <FacetToggle
                            label="Unassigned"
                            on={facets.unassigned}
                            onToggle={() => onFacetsChange({ ...facets, unassigned: !facets.unassigned })}
                        />
                    </div>
                    {rows.length === 0 ? (
                        <EmptyState
                            icon={MessageSquareDashed}
                            title={filtered ? "Nothing under this filter" : "No live chats open"}
                            description={
                                filtered
                                    ? "Open chats are being held by somebody else. Clear the filter to see all of them."
                                    : presence.online
                                      ? "You are on the desk. A new chat from a paid subscriber will land here and be assigned to whoever is holding the fewest."
                                      : "Go online to be handed new chats. Outside the live hours a subscriber's message becomes a ticket instead."
                            }
                            className="py-12"
                        />
                    ) : (
                        <div className="max-h-[70vh] overflow-y-auto">
                            {rows.map((row) => (
                                <InboxRow
                                    key={row.id}
                                    row={row}
                                    targetSec={page.firstResponseTargetSec}
                                    now={now}
                                    selected={selected?.id === row.id}
                                    onSelect={() => setSelectedId(row.id)}
                                />
                            ))}
                        </div>
                    )}
                </Card>

                {selected ? (
                    <ChatPane
                        key={selected.id}
                        row={selected}
                        canned={canned}
                        operators={presence.operators}
                        onChanged={onChanged}
                    />
                ) : (
                    <Card className="rounded-lg border-border shadow-none">
                        <EmptyState
                            icon={MessageSquareDashed}
                            title="Nothing to answer"
                            description="Pick a chat on the left to read it. The thread streams, so a reply from the other side arrives without a refresh."
                            className="py-20"
                        />
                    </Card>
                )}
            </div>
        </div>
    );
}
