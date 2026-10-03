"use client";

import * as React from "react";
import { CalendarSync, ChevronLeft, ChevronRight, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { PageHeader } from "@/components/adx/page-header";
import { SimpleTable, type SimpleColumn } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import {
    TENTATIVE_HOLIDAY_META,
    employeesService,
    holidayCalendarLine,
    holidayKindMeta,
    holidayRegionMeta,
    holidaySourceMeta,
    splitHolidays,
    syncCountsLine,
    weekdayOf,
    type Holiday,
    type HolidayCalendarView,
} from "@/services/employees";
import { EmployeesNav } from "../employees-nav";
import { HolidayDialog } from "./holiday-dialog";

interface HolidaysViewProps {
    holidays: Holiday[];
    year: number;
    /** YYYY-MM-DD in the Indian day. */
    today: string;
    /** HC-1: the public calendar the page follows and its last run; null when that read is not available. */
    calendar?: HolidayCalendarView | null;
    /** HC-1: `hr.edit` — the one permission "Sync now" needs. */
    maySync?: boolean;
    onYearChange: (year: number) => void;
    onChanged: () => void;
    /** HC-1: after a sync (worked or not) — the list and the line under the header both move. */
    onSynced?: () => void;
}

/**
 * The DR 10 frame `Holidays · /employees/holidays` (`5102:31121`).
 *
 * The frame's two tables — still to come, earlier this year — with their
 * Date, Day, Holiday and Type columns are kept. Type prints Public /
 * Optional from the row's `kind` (Lot G, Q123 — a gazetted day everyone
 * has off, or a restricted one a person may choose); the region a holiday
 * belongs to, which the column stood in for before Lot G, is the badge
 * beside it. The frame had no controls; the year stepper, Add holiday and
 * the row menu are the four routes the module owns, drawn in the same
 * idiom as the other desks.
 *
 * HC-1 (1 Oct 2026): the days come from a public holiday calendar. "Sync
 * now" sits beside Add holiday; one line under the header says where the
 * days come from and how the last sync went; each row says whether the
 * calendar keeps it or a person added it, and whether its date is still
 * tentative. Deleting a calendar row hides it for good; editing one makes
 * it the editor's, and the calendar stops updating it.
 */
export function HolidaysView({ holidays, year, today, calendar = null, maySync = false, onYearChange, onChanged, onSynced }: HolidaysViewProps) {
    const { upcoming, past } = splitHolidays(holidays, today);
    const [editing, setEditing] = React.useState<Holiday | "new" | null>(null);
    const [deleting, setDeleting] = React.useState<Holiday | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [syncing, setSyncing] = React.useState(false);
    const calendarLine = holidayCalendarLine(calendar);
    const syncFailed = Boolean(calendar?.enabled && calendar.lastSync?.error);

    const sync = async () => {
        setSyncing(true);
        try {
            const result = await employeesService.syncHolidays();
            toast.success("Holidays synced", { description: `${syncCountsLine(result)}.` });
        } catch (caught) {
            toast.error(caught instanceof ApiError ? caught.message : "Could not sync the holidays.");
        } finally {
            setSyncing(false);
            (onSynced ?? onChanged)();
        }
    };

    const remove = async () => {
        if (!deleting) return;
        setBusy(true);
        try {
            await employeesService.deleteHoliday(deleting.id);
            toast.success(`${deleting.name} removed from ${formatDate(deleting.date)}`);
            setDeleting(null);
            onChanged();
        } catch (caught) {
            toast.error(caught instanceof ApiError ? caught.message : "Could not remove the holiday.");
        } finally {
            setBusy(false);
        }
    };

    const columns = (firstLabel: string, muted: boolean): SimpleColumn<Holiday>[] => [
        {
            key: "date",
            label: firstLabel,
            render: (row) => (
                <span className={muted ? "text-muted-foreground" : "font-medium text-foreground"}>{formatDate(row.date)}</span>
            ),
        },
        { key: "day", label: "Day", render: (row) => weekdayOf(row.date) },
        {
            key: "name",
            label: "Holiday",
            render: (row) => {
                const source = holidaySourceMeta(row);
                return (
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span>{row.name}</span>
                        {source && <StatusBadge status={source} />}
                        {row.tentative && <StatusBadge status={TENTATIVE_HOLIDAY_META} />}
                    </div>
                );
            },
        },
        { key: "type", label: "Type", render: (row) => <StatusBadge status={holidayKindMeta(row)} /> },
        { key: "region", label: "Region", render: (row) => <StatusBadge status={holidayRegionMeta(row)} /> },
        {
            key: "actions",
            label: "",
            className: "w-10 text-right",
            render: (row) => (
                <DropdownMenu>
                    <DropdownMenuTrigger
                        aria-label={`Actions for ${row.name}`}
                        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditing(row)}>
                            <Pencil className="size-4" />
                            Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-danger focus:text-danger" onClick={() => setDeleting(row)}>
                            <Trash2 className="size-4" />
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            ),
        },
    ];

    return (
        <div className="space-y-5">
            <PageHeader
                title="Holidays"
                subtitle={`Holiday calendar ${year} · ${upcoming.length} still to come`}
                actions={
                    <>
                        <div className="flex items-center gap-1 rounded-md border bg-card">
                            <button
                                type="button"
                                onClick={() => onYearChange(year - 1)}
                                aria-label="Previous year"
                                className="rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground"
                            >
                                <ChevronLeft className="size-4" />
                            </button>
                            <span className="min-w-12 text-center text-sm font-medium tabular-nums text-foreground">{year}</span>
                            <button
                                type="button"
                                onClick={() => onYearChange(year + 1)}
                                aria-label="Next year"
                                className="rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground"
                            >
                                <ChevronRight className="size-4" />
                            </button>
                        </div>
                        {maySync && calendar && (
                            <Button
                                variant="outline"
                                className="bg-card"
                                disabled={syncing || !calendar.enabled}
                                onClick={() => void sync()}
                                title={calendar.enabled ? undefined : "Calendar sync is off. Turn it on in Settings › Integrations."}
                            >
                                <RefreshCw className={syncing ? "size-4 animate-spin" : "size-4"} />
                                {syncing ? "Syncing…" : "Sync now"}
                            </Button>
                        )}
                        <Button onClick={() => setEditing("new")}>
                            <Plus className="size-4" />
                            Add holiday
                        </Button>
                    </>
                }
            />
            {calendarLine && (
                <p
                    data-testid="holiday-calendar-line"
                    className={`-mt-2 flex items-center gap-1.5 text-xs ${syncFailed ? "text-danger" : "text-muted-foreground"}`}
                >
                    <CalendarSync className="size-3.5 shrink-0" />
                    {calendarLine}
                </p>
            )}
            <EmployeesNav />
            <div className="grid gap-4 xl:grid-cols-2">
                <SimpleTable
                    columns={columns("Upcoming", false)}
                    rows={upcoming}
                    rowKey={(row) => row.id}
                    emptyMessage={`No holidays left in ${year}.`}
                />
                <SimpleTable
                    columns={columns("Earlier this year", true)}
                    rows={past}
                    rowKey={(row) => row.id}
                    emptyMessage={`Nothing in ${year} has passed yet.`}
                />
            </div>

            <HolidayDialog
                key={editing === "new" ? "new" : (editing?.id ?? "closed")}
                holiday={editing === "new" ? null : editing}
                defaultYear={year}
                open={editing !== null}
                onOpenChange={(open) => !open && setEditing(null)}
                onSaved={onChanged}
            />
            <ConfirmDialog
                open={deleting !== null}
                onOpenChange={(open) => !open && setDeleting(null)}
                title={deleting ? `Delete ${deleting.name}?` : "Delete holiday?"}
                description={
                    deleting
                        ? deleting.source === "CALENDAR"
                            ? `${formatDate(deleting.date)} stops shading the staff diary. It won't come back at the next sync.`
                            : `${formatDate(deleting.date)} stops shading the staff diary.`
                        : ""
                }
                confirmLabel="Delete"
                destructive
                busy={busy}
                onConfirm={() => void remove()}
            />
        </div>
    );
}
