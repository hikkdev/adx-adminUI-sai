"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
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
import { employeesService, holidayKindMeta, holidayRegionMeta, splitHolidays, weekdayOf, type Holiday } from "@/services/employees";
import { EmployeesNav } from "../employees-nav";
import { HolidayDialog } from "./holiday-dialog";

interface HolidaysViewProps {
    holidays: Holiday[];
    year: number;
    /** YYYY-MM-DD in the Indian day. */
    today: string;
    onYearChange: (year: number) => void;
    onChanged: () => void;
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
 */
export function HolidaysView({ holidays, year, today, onYearChange, onChanged }: HolidaysViewProps) {
    const { upcoming, past } = splitHolidays(holidays, today);
    const [editing, setEditing] = React.useState<Holiday | "new" | null>(null);
    const [deleting, setDeleting] = React.useState<Holiday | null>(null);
    const [busy, setBusy] = React.useState(false);

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
        { key: "name", label: "Holiday", render: (row) => row.name },
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
                        <Button onClick={() => setEditing("new")}>
                            <Plus className="size-4" />
                            Add holiday
                        </Button>
                    </>
                }
            />
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
                        ? `${formatDate(deleting.date)} stops shading the staff diary. The boot seed does not put a deleted national day back under a different name, but it does re-add a missing one.`
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
