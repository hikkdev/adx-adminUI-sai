"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import {
    HOLIDAY_KINDS,
    HOLIDAY_KIND_META,
    employeesService,
    holidayKindOf,
    type Holiday,
    type HolidayKind,
    type HolidayPatch,
} from "@/services/employees";

interface HolidayDialogProps {
    /** Null adds; a row edits. */
    holiday: Holiday | null;
    defaultYear: number;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}

/**
 * `POST /hr/holidays` and `PATCH /hr/holidays/:id`. A blank region is a
 * national day; the kind (Lot G, Q123) is Public unless picked otherwise,
 * which is also the server's default. A 409 is another holiday already on
 * that day for that region, and the message says so.
 */
export function HolidayDialog({ holiday, defaultYear, open, onOpenChange, onSaved }: HolidayDialogProps) {
    const [form, setForm] = React.useState({
        date: holiday?.date ?? `${defaultYear}-01-01`,
        name: holiday?.name ?? "",
        region: holiday?.region ?? "",
        kind: (holiday ? holidayKindOf(holiday) : "PUBLIC") as HolidayKind,
    });
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const name = form.name.trim();
        if (!name) {
            setError("Name the holiday.");
            return;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
            setError("Pick a day.");
            return;
        }
        setSaving(true);
        setError(null);
        try {
            if (holiday) {
                const patch: HolidayPatch = {};
                if (form.date !== holiday.date) patch.date = form.date;
                if (name !== holiday.name) patch.name = name;
                if ((form.region.trim() || null) !== holiday.region) patch.region = form.region.trim() || null;
                if (form.kind !== holidayKindOf(holiday)) patch.kind = form.kind;
                if (Object.keys(patch).length) await employeesService.updateHoliday(holiday.id, patch);
                toast.success(`${name} updated`);
            } else {
                await employeesService.createHoliday({ date: form.date, name, region: form.region, kind: form.kind });
                toast.success(`${name} added to the calendar`);
            }
            onOpenChange(false);
            onSaved();
        } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Could not save the holiday.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <form onSubmit={submit} noValidate>
                    <DialogHeader>
                        <DialogTitle>{holiday ? `Edit ${holiday.name}` : "Add holiday"}</DialogTitle>
                        <DialogDescription>
                            A day off the staff diary shades. Leave the region blank for a national day; Optional is a restricted holiday a
                            person may choose rather than one everyone has off.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-1.5">
                            <Label htmlFor="holiday-name">Holiday</Label>
                            <Input
                                id="holiday-name"
                                value={form.name}
                                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                                placeholder="e.g. Pongal"
                                autoFocus
                            />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="grid gap-1.5">
                                <Label htmlFor="holiday-kind">Type</Label>
                                <Select value={form.kind} onValueChange={(value) => setForm((current) => ({ ...current, kind: value as HolidayKind }))}>
                                    <SelectTrigger id="holiday-kind">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {HOLIDAY_KINDS.map((kind) => (
                                            <SelectItem key={kind} value={kind}>
                                                {HOLIDAY_KIND_META[kind].label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="holiday-date">Date</Label>
                                <Input
                                    id="holiday-date"
                                    type="date"
                                    value={form.date}
                                    onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                                />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="holiday-region">Region</Label>
                                <Input
                                    id="holiday-region"
                                    value={form.region}
                                    onChange={(event) => setForm((current) => ({ ...current, region: event.target.value }))}
                                    placeholder="National"
                                    maxLength={40}
                                />
                            </div>
                        </div>
                        {error && (
                            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                                {error}
                            </p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" className="bg-card" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? "Saving…" : holiday ? "Save" : "Add holiday"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
