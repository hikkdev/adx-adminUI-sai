"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api-client";
import { departmentsService, type DepartmentView } from "@/services/departments";
import {
    EMPLOYMENT_TYPES,
    EMPLOYMENT_TYPE_META,
    WORK_MODES,
    WORK_MODE_META,
    employeePatch,
    employeesService,
    type EmployeeEditDraft,
    type EmployeeRow,
    type EmploymentType,
    type WorkMode,
} from "@/services/employees";

interface EditEmployeeDialogProps {
    employee: EmployeeRow;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}

/** The pickers' value for "none". */
const NONE = "__none__";

const draftOf = (employee: EmployeeRow): EmployeeEditDraft => ({
    departmentId: employee.departmentId ?? "",
    designation: employee.designation ?? "",
    region: employee.region ?? "",
    workMode: employee.workMode ?? "",
    employmentType: employee.employmentType ?? "",
    isActive: employee.isActive,
    externalHrmsId: employee.externalHrmsId ?? "",
});

/**
 * `PUT /employees/:userId` — the fields the console owns: the department
 * record (Lot G, Q122 — picked from `GET /hr/departments`, sent as
 * `departmentId`), designation, region, work mode, employment type
 * (Q140), the active flag and the HR-tool id. Only what moved goes on the
 * wire; a cleared picker or HR-tool id is sent as null, which unlinks. A
 * 409 is another record already carrying that id, and the message says so.
 */
export function EditEmployeeDialog({ employee, open, onOpenChange, onSaved }: EditEmployeeDialogProps) {
    const [form, setForm] = React.useState<EmployeeEditDraft>(() => draftOf(employee));
    const [departments, setDepartments] = React.useState<DepartmentView[] | null>(null);
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!open) return;
        let cancelled = false;
        departmentsService
            .listAll()
            .then((rows) => {
                if (!cancelled) setDepartments(rows);
            })
            .catch(() => {
                if (!cancelled) setDepartments([]);
            });
        return () => {
            cancelled = true;
        };
    }, [open]);

    const set = <K extends keyof EmployeeEditDraft>(key: K, value: EmployeeEditDraft[K]) => setForm((current) => ({ ...current, [key]: value }));

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const patch = employeePatch(employee, form);
        if (!patch) {
            onOpenChange(false);
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await employeesService.update(employee.userId, patch);
            toast.success(`${employee.name}'s record updated`);
            onOpenChange(false);
            onSaved();
        } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Could not save the record.");
        } finally {
            setSaving(false);
        }
    };

    /* The record's own department stays an option even when the list read
       failed or has not landed, so an edit that does not touch it keeps it. */
    const options =
        form.departmentId && departments && !departments.some((row) => row.id === form.departmentId)
            ? [{ id: form.departmentId, name: employee.department ?? form.departmentId }, ...departments]
            : (departments ?? (form.departmentId ? [{ id: form.departmentId, name: employee.department ?? form.departmentId }] : []));

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (next) setForm(draftOf(employee));
                else setError(null);
                onOpenChange(next);
            }}
        >
            <DialogContent className="sm:max-w-lg">
                <form onSubmit={submit} noValidate>
                    <DialogHeader>
                        <DialogTitle>Edit {employee.name}</DialogTitle>
                        <DialogDescription>
                            Department, designation, where and how they work and the active flag are the console's; pay, leave and
                            attendance are the HR tool's.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-1.5">
                                <Label htmlFor="emp-department">Department</Label>
                                <Select value={form.departmentId || NONE} onValueChange={(value) => set("departmentId", value === NONE ? "" : value)}>
                                    <SelectTrigger id="emp-department">
                                        <SelectValue placeholder={departments === null ? "Reading departments…" : "No department"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE}>No department</SelectItem>
                                        {options.map((row) => (
                                            <SelectItem key={row.id} value={row.id}>
                                                {row.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="emp-designation">Designation</Label>
                                <Input
                                    id="emp-designation"
                                    value={form.designation}
                                    onChange={(event) => set("designation", event.target.value)}
                                    placeholder="e.g. Ops Executive"
                                />
                            </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-3">
                            <div className="grid gap-1.5">
                                <Label htmlFor="emp-region">Region</Label>
                                <Input id="emp-region" value={form.region} onChange={(event) => set("region", event.target.value)} placeholder="e.g. Delhi NCR" maxLength={80} />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="emp-work-mode">Work mode</Label>
                                <Select value={form.workMode || NONE} onValueChange={(value) => set("workMode", value === NONE ? "" : (value as WorkMode))}>
                                    <SelectTrigger id="emp-work-mode">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE}>Not set</SelectItem>
                                        {WORK_MODES.map((mode) => (
                                            <SelectItem key={mode} value={mode}>
                                                {WORK_MODE_META[mode].label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="emp-employment-type">Employment</Label>
                                <Select value={form.employmentType || NONE} onValueChange={(value) => set("employmentType", value === NONE ? "" : (value as EmploymentType))}>
                                    <SelectTrigger id="emp-employment-type">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE}>Not set</SelectItem>
                                        {EMPLOYMENT_TYPES.map((type) => (
                                            <SelectItem key={type} value={type}>
                                                {EMPLOYMENT_TYPE_META[type].label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="emp-hrms">HR-tool id</Label>
                            <Input
                                id="emp-hrms"
                                value={form.externalHrmsId}
                                onChange={(event) => set("externalHrmsId", event.target.value)}
                                placeholder="The person's id in Zoho People, Keka or greytHR"
                            />
                            <p className="text-xs text-muted-foreground">
                                Unique across records. Blank unlinks; the deep link on the profile is built from it.
                            </p>
                        </div>
                        <label className="flex items-center justify-between gap-4 rounded-md border px-3 py-2.5">
                            <span>
                                <span className="block text-sm font-medium text-foreground">Active</span>
                                <span className="block text-xs text-muted-foreground">
                                    An inactive record leaves the people registry, so the diary cannot assign to them.
                                </span>
                            </span>
                            <Switch checked={form.isActive} onCheckedChange={(checked) => set("isActive", checked)} aria-label="Active" />
                        </label>
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
                            {saving ? "Saving…" : "Save"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
