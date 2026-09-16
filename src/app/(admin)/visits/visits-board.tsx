"use client";

import * as React from "react";
import { CalendarClock, MoreHorizontal, Search, Send, Timer } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { FilterChips, type FilterChip } from "@/components/adx/filter-chips";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { agentLabel, type AgentSummary } from "@/services/agents";
import {
    VISIT_BOARD_COLUMNS,
    VISIT_COLUMN_OF,
    VISIT_STATUSES,
    VISIT_STATUS_META,
    expiresInLabel,
    visitKindLabel,
    visitsService,
    whereLabel,
    type VisitRow,
    type VisitStatus,
    type VisitsPage,
} from "@/services/visits";
import { DispatchVisitDialog } from "./dispatch-dialog";

interface VisitsBoardProps {
    page: VisitsPage;
    /** YYYY-MM-DD, or "" for every day. */
    date: string;
    onDateChange: (date: string) => void;
    /** Today's date in the server's calendar, for the "Today" control. */
    today: () => string;
    status: VisitStatus | "ALL";
    onStatusChange: (status: VisitStatus | "ALL") => void;
    q: string;
    onQChange: (q: string) => void;
    /** The roster, for naming the agent on a card and filling the pickers. */
    agents: AgentSummary[];
    onChanged: () => void;
}

/**
 * The dispatch board.
 *
 * No DR 10 frame covers this screen, so it borrows the order pipeline's
 * idiom: one column per stage of the day, a card per visit. Unlike that board
 * nothing is dragged here — a visit's lifecycle belongs to the agent holding
 * it (accept, schedule, start, complete happen from the field app), and the
 * three things ADX can do to a card are in its menu: hand it to a different
 * agent, move its slot, or stop it.
 *
 * Every write goes to the API and is said only after it lands. A reassign is
 * not a rename: the server treats it as a fresh offer to the new agent, with
 * a fresh 25-minute clock, and the dialog says so before asking.
 */
export function VisitsBoard({
    page,
    date,
    onDateChange,
    today,
    status,
    onStatusChange,
    q,
    onQChange,
    agents,
    onChanged,
}: VisitsBoardProps) {
    const now = useNow();
    const [dispatchOpen, setDispatchOpen] = React.useState(false);
    const [reassignTarget, setReassignTarget] = React.useState<VisitRow | null>(null);
    const [reassignChoice, setReassignChoice] = React.useState("");
    const [rescheduleTarget, setRescheduleTarget] = React.useState<VisitRow | null>(null);
    const [rescheduleValue, setRescheduleValue] = React.useState("");
    const [cancelTarget, setCancelTarget] = React.useState<VisitRow | null>(null);
    const [busy, setBusy] = React.useState(false);

    /** Agent id → how the console says their name. */
    const agentNames = React.useMemo(
        () => new Map(agents.map((agent) => [agent.id, agentLabel(agent)])),
        [agents],
    );
    const agentName = (id: string) => agentNames.get(id) ?? id;

    async function run(label: string, work: () => Promise<unknown>, failed: string) {
        setBusy(true);
        try {
            await work();
            // Said only after the API answered. A toast for a write that did
            // not happen is how a board loses a visit.
            toast.success(label);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : failed);
        } finally {
            setBusy(false);
        }
    }

    const shown = page.items.length;
    /* The chip counts come from the server, computed without the status
       facet, so "All" is their sum rather than `total` — which under a status
       chip is only that status's size. */
    const everything = VISIT_STATUSES.reduce((sum, key) => sum + page.counts[key], 0);
    const chips: FilterChip<VisitStatus | "ALL">[] = [
        { value: "ALL", label: "All", count: everything },
        ...VISIT_STATUSES.map((value) => ({
            value,
            label: VISIT_STATUS_META[value].label,
            count: page.counts[value],
        })),
    ];

    const dayLabel = date ? `on ${formatDate(`${date}T00:00:00`)}` : "across every day";
    const subtitle =
        shown < page.total
            ? `${page.counts.REQUESTED} awaiting an answer · showing the first ${shown} of ${page.total} ${dayLabel} — narrow the status to see the rest`
            : `${page.counts.REQUESTED} awaiting an answer · ${page.total} ${page.total === 1 ? "visit" : "visits"} ${dayLabel}`;

    return (
        <div className="space-y-5">
            <PageHeader
                title="Visits"
                subtitle={subtitle}
                actions={
                    <Button onClick={() => setDispatchOpen(true)}>
                        <Send className="mr-1.5 size-4" />
                        Dispatch visit
                    </Button>
                }
            />

            <div className="flex flex-wrap items-center gap-2">
                <div className="flex h-9 items-center gap-2 rounded-md border bg-card pl-3 pr-1">
                    <Label htmlFor="visits-date" className="text-sm font-normal text-muted-foreground">
                        Day
                    </Label>
                    <Input
                        id="visits-date"
                        type="date"
                        value={date}
                        onChange={(event) => onDateChange(event.target.value)}
                        className="h-7 w-[150px] border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                    />
                    {date ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => onDateChange("")}
                        >
                            Any day
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => onDateChange(today())}
                        >
                            Today
                        </Button>
                    )}
                </div>
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={q}
                        onChange={(event) => onQChange(event.target.value)}
                        placeholder="Search business, locality or city"
                        className="h-9 w-[260px] bg-card pl-8"
                    />
                </div>
            </div>

            {/* The counts come from the server and are computed without this
                filter, so every chip can say how many it would show and the
                row never collapses to the one chip in force. */}
            <FilterChips chips={chips} value={status} onChange={onStatusChange} />

            <div className="grid gap-4 overflow-x-auto pb-2 lg:grid-cols-5">
                {VISIT_BOARD_COLUMNS.map((column) => {
                    const cards = page.items.filter((visit) => VISIT_COLUMN_OF[visit.status] === column.id);
                    return (
                        <div
                            key={column.id}
                            className="flex min-h-[420px] flex-col rounded-lg border bg-muted/40"
                        >
                            <div className="flex items-center justify-between px-3 pb-2 pt-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    {column.title}
                                    <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                                        {cards.length}
                                    </span>
                                </p>
                            </div>

                            <div className="flex-1 space-y-2 px-2.5 pb-3">
                                {cards.map((visit) => {
                                    const expires = expiresInLabel(visit, now);
                                    const closed = visit.status === "COMPLETED" || visit.status === "CANCELLED";
                                    return (
                                        <div key={visit.id} className="rounded-lg border bg-card p-3">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="text-[11px] text-muted-foreground">
                                                        <span className="font-mono tabular-nums">
                                                            {visit.displayId ?? visit.id}
                                                        </span>
                                                    </p>
                                                    <p className="mt-0.5 line-clamp-2 text-sm font-medium text-foreground">
                                                        {visit.businessName}
                                                    </p>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-1">
                                                    <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                        {visitKindLabel(visit.kind)}
                                                    </span>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="-mr-1 size-7"
                                                                disabled={busy}
                                                            >
                                                                <MoreHorizontal className="size-4" />
                                                                <span className="sr-only">Visit actions</span>
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-56">
                                                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                            <DropdownMenuItem
                                                                disabled={closed}
                                                                onSelect={() => {
                                                                    setReassignChoice("");
                                                                    setReassignTarget(visit);
                                                                }}
                                                            >
                                                                Reassign to another agent
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                disabled={closed}
                                                                onSelect={() => {
                                                                    setRescheduleValue(toLocalInput(visit.scheduledFor));
                                                                    setRescheduleTarget(visit);
                                                                }}
                                                            >
                                                                {visit.scheduledFor ? "Reschedule" : "Set a slot"}
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            {/* The server refuses to cancel a completed
                                                                visit — that trip happened — so the item is
                                                                offered disabled rather than as a button
                                                                that always fails. */}
                                                            <DropdownMenuItem
                                                                className="text-danger focus:text-danger"
                                                                disabled={closed}
                                                                onSelect={() => setCancelTarget(visit)}
                                                            >
                                                                Cancel visit
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </div>

                                            <p className="mt-1 truncate text-xs text-muted-foreground">{whereLabel(visit)}</p>

                                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                                {/* The badge the API sent. The console does not
                                                    keep its own opinion of what a request should say. */}
                                                <StatusBadge status={visit.pill} />
                                                {expires && (
                                                    <span
                                                        className={cn(
                                                            "inline-flex items-center gap-1 text-[11px] font-medium",
                                                            expires === "Expiring now" ? "text-danger" : "text-warning",
                                                        )}
                                                    >
                                                        <Timer className="size-3" />
                                                        {expires}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="mt-2.5 flex items-center justify-between gap-2 border-t pt-2.5">
                                                <span className="flex min-w-0 items-center gap-1.5">
                                                    <InitialsAvatar name={agentNames.get(visit.agentId) ?? null} size="sm" />
                                                    {/* `GET /visits` joins no agent, so the name
                                                        comes from the roster when it loaded and
                                                        the id stands in when it did not. */}
                                                    {agentNames.has(visit.agentId) ? (
                                                        <span className="truncate text-xs text-muted-foreground">
                                                            {agentNames.get(visit.agentId)}
                                                        </span>
                                                    ) : (
                                                        <span className="truncate font-mono text-[11px] text-muted-foreground">
                                                            {visit.agentId}
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="shrink-0 text-xs text-muted-foreground">
                                                    {visit.status === "COMPLETED" ? (
                                                        visit.earned !== null ? (
                                                            <span className="font-medium text-success">
                                                                {/* The wallet's figure, printed as sent.
                                                                    Null is a completion with no rate, which
                                                                    is not zero, so it prints nothing. */}
                                                                {formatMoney(visit.earned)} earned
                                                            </span>
                                                        ) : null
                                                    ) : visit.scheduledFor ? (
                                                        <span className="inline-flex items-center gap-1">
                                                            <CalendarClock className="size-3" />
                                                            {formatDateTime(visit.scheduledFor)}
                                                        </span>
                                                    ) : null}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                                {cards.length === 0 && (
                                    <div className="flex h-24 items-center justify-center rounded-lg border border-dashed px-3 text-center text-xs text-muted-foreground/70">
                                        Nothing here
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <DispatchVisitDialog
                open={dispatchOpen}
                onOpenChange={setDispatchOpen}
                agents={agents}
                onDispatched={onChanged}
            />

            <ConfirmDialog
                open={reassignTarget !== null}
                onOpenChange={(open) => !open && setReassignTarget(null)}
                title={reassignTarget ? `Hand ${reassignTarget.businessName} to a different agent?` : "Reassign visit"}
                description="This is a fresh offer, not a rename: the visit goes back to Requested and the new agent gets their own 25-minute clock to accept it, whatever state it was in. The agent it was with is no longer on it."
                confirmLabel="Send the offer"
                busy={busy}
                disabled={reassignChoice === "" || reassignChoice === reassignTarget?.agentId}
                onConfirm={async () => {
                    const target = reassignTarget;
                    const choice = reassignChoice;
                    if (!target || choice === "") return;
                    await run(
                        `${target.businessName} offered to ${agentName(choice)} — they have 25 minutes`,
                        () => visitsService.reassign(target.id, choice),
                        "Could not reassign this visit",
                    );
                    setReassignTarget(null);
                }}
            >
                <div className="space-y-2">
                    <Label htmlFor="visits-reassign-agent">Agent</Label>
                    <Select value={reassignChoice} onValueChange={setReassignChoice}>
                        <SelectTrigger id="visits-reassign-agent" className="h-9">
                            <SelectValue placeholder="Pick an agent" />
                        </SelectTrigger>
                        <SelectContent>
                            {agents.map((agent) => (
                                <SelectItem
                                    key={agent.id}
                                    value={agent.id}
                                    disabled={agent.id === reassignTarget?.agentId}
                                >
                                    {agentLabel(agent)}
                                    {agent.id === reassignTarget?.agentId ? " (already on it)" : ""}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {agents.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                            The agent roster did not load, so there is nobody to pick. Reload the page and
                            try again.
                        </p>
                    )}
                </div>
            </ConfirmDialog>

            <ConfirmDialog
                open={rescheduleTarget !== null}
                onOpenChange={(open) => !open && setRescheduleTarget(null)}
                title={rescheduleTarget ? `When should ${rescheduleTarget.businessName} happen?` : "Reschedule visit"}
                description="The slot the agent sees in their day. Leave it empty to clear the slot so the agent picks one on accepting; a request keeps its clock either way."
                confirmLabel={rescheduleValue ? "Save the slot" : "Clear the slot"}
                busy={busy}
                disabled={rescheduleValue !== "" && Number.isNaN(Date.parse(rescheduleValue))}
                onConfirm={async () => {
                    const target = rescheduleTarget;
                    if (!target) return;
                    const iso = rescheduleValue ? new Date(rescheduleValue).toISOString() : null;
                    await run(
                        iso
                            ? `${target.businessName} moved to ${formatDateTime(iso)}`
                            : `${target.businessName} has no slot until the agent picks one`,
                        () => visitsService.reschedule(target.id, iso),
                        "Could not move this visit",
                    );
                    setRescheduleTarget(null);
                }}
            >
                <div className="space-y-2">
                    <Label htmlFor="visits-reschedule-at">Slot</Label>
                    <Input
                        id="visits-reschedule-at"
                        type="datetime-local"
                        value={rescheduleValue}
                        onChange={(event) => setRescheduleValue(event.target.value)}
                    />
                </div>
            </ConfirmDialog>

            <ConfirmDialog
                open={cancelTarget !== null}
                onOpenChange={(open) => !open && setCancelTarget(null)}
                title={cancelTarget ? `Cancel the visit to ${cancelTarget.businessName}?` : "Cancel visit"}
                description="The agent is taken off it and any open offer is withdrawn. Nothing is deleted — the visit stays on the board under Closed so the next person knows it was called off rather than never booked."
                confirmLabel="Cancel visit"
                destructive
                busy={busy}
                onConfirm={async () => {
                    const target = cancelTarget;
                    if (!target) return;
                    await run(
                        `Cancelled the visit to ${target.businessName}`,
                        () => visitsService.cancel(target.id),
                        "Could not cancel this visit",
                    );
                    setCancelTarget(null);
                }}
            />
        </div>
    );
}

/**
 * An ISO instant as the local wall-clock string a `datetime-local` input takes.
 *
 * Not `iso.slice(0, 16)`: that is the UTC wall clock, which in India is five
 * and a half hours off, and a slot at 10:00 would open in the picker at 04:30.
 */
function toLocalInput(iso: string | null): string {
    if (!iso) return "";
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return "";
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}
