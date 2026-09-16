"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-client";
import { departmentCreateBody, departmentPatch, departmentsService, toDepartmentDraft, type DepartmentView } from "@/services/departments";
import { employeesService, personLabel, type Person } from "@/services/employees";

interface DepartmentDialogProps {
    /** Null adds; a row edits. */
    department: DepartmentView | null;
    /** Every department, for the parent picker; the one being edited is left out of its own options. */
    departments: DepartmentView[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}

/** The pickers' value for "nobody" and "no parent". */
const NONE = "__none__";

/**
 * `POST /hr/departments` and `PATCH /hr/departments/:id` — Lot G (Q122).
 *
 * The head is an Employee row, picked from the people registry (`GET
 * /hr/people?kind=STAFF`); G11-1: every STAFF row carries `employeeId`,
 * the Employee row's id `headId` takes, so the registry is the one read —
 * no directory cross-read to match logins to records. A 409 is a name or
 * code already taken, a 404 a head who has no HR record; the message says
 * which.
 */
export function DepartmentDialog({ department, departments, open, onOpenChange, onSaved }: DepartmentDialogProps) {
    const [draft, setDraft] = React.useState(() => toDepartmentDraft(department));
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    /** Staff with an HR record, keyed by the Employee row's id — what `headId` takes. */
    const [heads, setHeads] = React.useState<{ id: string; label: string }[] | null>(null);

    React.useEffect(() => {
        if (!open) return;
        let cancelled = false;
        employeesService
            .people({ kind: "STAFF" })
            .then((people) => {
                if (cancelled) return;
                const options = people
                    .filter((person): person is Extract<Person, { kind: "STAFF" }> => person.kind === "STAFF")
                    .flatMap((person) => (person.employeeId ? [{ id: person.employeeId, label: personLabel(person) }] : []))
                    .sort((a, b) => a.label.localeCompare(b.label));
                setHeads(options);
            })
            .catch(() => {
                if (!cancelled) setHeads([]);
            });
        return () => {
            cancelled = true;
        };
    }, [open]);

    const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft((current) => ({ ...current, [key]: value }));

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setSaving(true);
        try {
            if (department) {
                const patch = departmentPatch(department, draft);
                if (typeof patch === "string") {
                    setError(patch);
                    return;
                }
                if (patch) await departmentsService.update(department.id, patch);
                toast.success(`${draft.name.trim() || department.name} updated`);
            } else {
                const parsed = departmentCreateBody(draft);
                if (!parsed.body) {
                    setError(parsed.problem);
                    return;
                }
                const created = await departmentsService.create(parsed.body);
                toast.success(`${created.name} added`, { description: `Code ${created.code}.` });
            }
            onOpenChange(false);
            onSaved();
        } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Could not save the department.");
        } finally {
            setSaving(false);
        }
    };

    const parents = departments.filter((candidate) => candidate.id !== department?.id);
    /* A head or parent the row names but the options do not know stays
       selectable, so an edit that does not touch it does not silently drop it. */
    const headOptions =
        draft.headId && heads && !heads.some((head) => head.id === draft.headId)
            ? [{ id: draft.headId, label: department?.head?.name ?? department?.head?.designation ?? draft.headId }, ...heads]
            : (heads ?? []);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <form onSubmit={submit} noValidate>
                    <DialogHeader>
                        <DialogTitle>{department ? `Edit ${department.name}` : "New department"}</DialogTitle>
                        <DialogDescription>
                            A name and a code, who heads it, the regions it covers and how many roles are open — a figure ops keep by
                            hand, because hiring stays in the HR tool.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                            <div className="grid gap-1.5">
                                <Label htmlFor="dept-name">Name</Label>
                                <Input id="dept-name" value={draft.name} onChange={(event) => set("name", event.target.value)} placeholder="e.g. Field operations" autoFocus />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="dept-code">Code</Label>
                                <Input
                                    id="dept-code"
                                    value={draft.code}
                                    onChange={(event) => set("code", event.target.value.toUpperCase())}
                                    placeholder={department ? department.code : "From the name"}
                                    maxLength={16}
                                    className="font-mono uppercase"
                                />
                            </div>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="dept-description">Description</Label>
                            <Textarea
                                id="dept-description"
                                value={draft.description}
                                onChange={(event) => set("description", event.target.value)}
                                placeholder="What the team owns, in a sentence."
                                rows={2}
                                maxLength={500}
                            />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-1.5">
                                <Label htmlFor="dept-head">Department head</Label>
                                <Select value={draft.headId || NONE} onValueChange={(value) => set("headId", value === NONE ? "" : value)}>
                                    <SelectTrigger id="dept-head">
                                        <SelectValue placeholder={heads === null ? "Reading the registry…" : "Nobody yet"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE}>Nobody yet</SelectItem>
                                        {headOptions.map((head) => (
                                            <SelectItem key={head.id} value={head.id}>
                                                {head.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">Staff with an HR record.</p>
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="dept-parent">Sits under</Label>
                                <Select value={draft.parentId || NONE} onValueChange={(value) => set("parentId", value === NONE ? "" : value)}>
                                    <SelectTrigger id="dept-parent">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE}>Top level</SelectItem>
                                        {parents.map((parent) => (
                                            <SelectItem key={parent.id} value={parent.id}>
                                                {parent.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                            <div className="grid gap-1.5">
                                <Label htmlFor="dept-regions">Regions covered</Label>
                                <Input
                                    id="dept-regions"
                                    value={draft.regions}
                                    onChange={(event) => set("regions", event.target.value)}
                                    placeholder="Delhi NCR, Karnataka, Tamil Nadu"
                                />
                                <p className="text-xs text-muted-foreground">Comma-separated.</p>
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="dept-open-roles">Open roles</Label>
                                <Input
                                    id="dept-open-roles"
                                    inputMode="numeric"
                                    value={draft.openRoles}
                                    onChange={(event) => set("openRoles", event.target.value)}
                                />
                            </div>
                        </div>
                        {department && (
                            <label className="flex items-center justify-between gap-4 rounded-md border px-3 py-2.5">
                                <span>
                                    <span className="block text-sm font-medium text-foreground">Active</span>
                                    <span className="block text-xs text-muted-foreground">An inactive department stays on its records but is listed under the Inactive chip.</span>
                                </span>
                                <Switch checked={draft.isActive} onCheckedChange={(checked) => set("isActive", checked)} aria-label="Active" />
                            </label>
                        )}
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
                            {saving ? "Saving…" : department ? "Save" : "Add department"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
