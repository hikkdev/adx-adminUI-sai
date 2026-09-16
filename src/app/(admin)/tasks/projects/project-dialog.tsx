"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CityCombobox } from "@/components/adx/city-combobox";
import { ApiError } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { departmentsService, type DepartmentView } from "@/services/departments";
import { CITY_STAGES } from "@/services/geo";
import { EMPTY_PROJECT_DRAFT, createProjectBody, projectDraftError, projectDraftOf, projectPatchOf, workService, type ProjectDraft, type WorkPerson, type WorkProject } from "@/services/work";
import { WORK_PROJECT_KIND_LABEL, type WorkProjectKind } from "@/types";
import { PeoplePicker } from "../people-picker";

interface ProjectDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The project being edited; absent for a new one. The kind never moves after creation. */
    project?: WorkProject | null;
    /** The city name to show for a REGION project being edited, when the table already knows it. */
    cityName?: string;
    /** The kind a new project opens on. */
    initialKind?: WorkProjectKind;
    onSaved: (project: WorkProject) => void;
}

/**
 * Lot AB, package AB-C: the one dialog for `POST /work/projects` and
 * `PATCH /work/projects/:id`. A DEPARTMENT project names a department
 * (the HR module's list, `GET /hr/departments`); a REGION one names a
 * catalogued city (`GET /geo/cities?q=`, the pick's id — free text never
 * reaches the wire). The owner comes from `GET /work/people`. On edit the
 * kind is fixed and only what moved goes on the PATCH.
 */
export function ProjectDialog({ open, onOpenChange, project, cityName = "", initialKind = "DEPARTMENT", onSaved }: ProjectDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* Mounted only while open, and keyed on the project, so the form's state starts from its props every time. */}
            {open && <ProjectForm key={project?.id ?? "new"} project={project ?? null} cityName={cityName} initialKind={initialKind} onSaved={onSaved} onClose={() => onOpenChange(false)} />}
        </Dialog>
    );
}

interface ProjectFormProps {
    project: WorkProject | null;
    cityName: string;
    initialKind: WorkProjectKind;
    onSaved: (project: WorkProject) => void;
    onClose: () => void;
}

function ProjectForm({ project, cityName, initialKind, onSaved, onClose }: ProjectFormProps) {
    const hr = isLive("employees");
    const [draft, setDraft] = React.useState<ProjectDraft>(() => (project ? projectDraftOf(project, cityName) : { ...EMPTY_PROJECT_DRAFT, kind: initialKind }));
    const [busy, setBusy] = React.useState(false);
    const editing = Boolean(project);

    const departments = useApiResource<DepartmentView[]>(`work:project-dialog:departments:${hr}`, () => (hr ? departmentsService.listAll().catch(() => [] as DepartmentView[]) : Promise.resolve([])));
    const departmentItems = React.useMemo(
        () =>
            (departments.data ?? []).map((department) => ({
                value: department.id,
                label: department.name,
                description: department.code,
            })),
        [departments.data],
    );

    const patch = (partial: Partial<ProjectDraft>) => setDraft((current) => ({ ...current, ...partial }));

    const save = async () => {
        const error = projectDraftError(draft);
        if (error) {
            toast.error(error);
            return;
        }
        setBusy(true);
        try {
            if (project) {
                const body = projectPatchOf(project, draft);
                if (!body) {
                    toast.info("Nothing changed.");
                    onClose();
                    return;
                }
                const saved = await workService.projects.patch(project.id, body);
                toast.success(`${saved.displayId ?? saved.name} updated`);
                onSaved(saved);
            } else {
                const created = await workService.projects.create(createProjectBody(draft));
                toast.success(`${created.displayId ?? created.name} opened`, {
                    description: `A ${WORK_PROJECT_KIND_LABEL[created.kind].toLowerCase()} project.`,
                });
                onSaved(created);
            }
            onClose();
        } catch (caught) {
            toast.error(caught instanceof ApiError ? caught.message : editing ? "Could not save the project." : "Could not open the project.");
        } finally {
            setBusy(false);
        }
    };

    const known: WorkPerson[] = project ? [project.owner] : [];

    return (
        <DialogContent className="sm:max-w-lg" onInteractOutside={(event) => busy && event.preventDefault()} onEscapeKeyDown={(event) => busy && event.preventDefault()}>
            <DialogHeader>
                <DialogTitle>{editing ? "Edit project" : "New project"}</DialogTitle>
                <DialogDescription>
                    {editing
                        ? `${WORK_PROJECT_KIND_LABEL[draft.kind]} project — the kind is fixed; everything else can move.`
                        : "A frame for a department's or a region's tasks and issues, with an owner from the registry."}
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-1">
                <div className="grid gap-1.5">
                    <Label htmlFor="project-name">Name</Label>
                    <Input id="project-name" value={draft.name} onChange={(event) => patch({ name: event.target.value })} placeholder="e.g. Q4 sales push, Pune launch" />
                </div>
                <div className="grid gap-1.5">
                    <Label htmlFor="project-description">Description</Label>
                    <Textarea id="project-description" rows={2} value={draft.description} onChange={(event) => patch({ description: event.target.value })} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                        <Label htmlFor="project-kind">Kind</Label>
                        <Select value={draft.kind} onValueChange={(value) => patch({ kind: value as WorkProjectKind })} disabled={editing}>
                            <SelectTrigger id="project-kind">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(Object.keys(WORK_PROJECT_KIND_LABEL) as WorkProjectKind[]).map((kind) => (
                                    <SelectItem key={kind} value={kind}>
                                        {WORK_PROJECT_KIND_LABEL[kind]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {draft.kind === "DEPARTMENT" ? (
                        <div className="grid gap-1.5">
                            <Label htmlFor="project-department">Department</Label>
                            <Combobox
                                id="project-department"
                                items={departmentItems}
                                value={draft.departmentId}
                                onValueChange={(departmentId) => patch({ departmentId })}
                                placeholder={hr ? "Pick a department" : "Departments read the HR module"}
                                searchPlaceholder="Search departments"
                                emptyText={departments.loading ? "Reading the departments…" : "No department matches."}
                                disabled={!hr}
                            />
                        </div>
                    ) : (
                        <div className="grid gap-1.5">
                            <Label htmlFor="project-city">City</Label>
                            <CityCombobox
                                id="project-city"
                                value={draft.cityName}
                                stages={CITY_STAGES}
                                placeholder="Search the catalogue"
                                onChange={(cityName, city) => patch({ cityName, cityId: city?.id ?? "" })}
                            />
                            <p className="text-xs text-muted-foreground">{draft.cityId ? "A catalogued city." : "Pick a city from the catalogue — a name alone is not enough here."}</p>
                        </div>
                    )}
                </div>
                <div className="grid gap-1.5">
                    <Label htmlFor="project-owner">Owner</Label>
                    <PeoplePicker
                        id="project-owner"
                        value={draft.ownerUserId ? [draft.ownerUserId] : []}
                        known={known}
                        onChange={(userIds) => patch({ ownerUserId: userIds[userIds.length - 1] ?? "" })}
                        placeholder="Search staff"
                    />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                        <Label htmlFor="project-starts">Starts</Label>
                        <Input id="project-starts" type="date" value={draft.startsAt} onChange={(event) => patch({ startsAt: event.target.value })} />
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="project-ends">Ends</Label>
                        <Input id="project-ends" type="date" value={draft.endsAt} onChange={(event) => patch({ endsAt: event.target.value })} />
                    </div>
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" className="bg-card" onClick={onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button onClick={() => void save()} disabled={busy}>
                    {busy ? "Saving…" : editing ? "Save changes" : "Open project"}
                </Button>
            </DialogFooter>
        </DialogContent>
    );
}
