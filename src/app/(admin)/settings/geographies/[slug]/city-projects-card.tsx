"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, FolderKanban, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { personName, workService, type WorkListPage, type WorkProject } from "@/services/work";
import { PeoplePicker } from "@/app/(admin)/tasks/people-picker";

interface CityProjectsCardProps {
    cityId: string;
    cityName: string;
    /** `settings.edit` or `work.edit` — who may open a project here. */
    mayCreate: boolean;
}

/**
 * Lot AA: the city's REGION projects — `GET /work/projects?cityId=` — on
 * its page under Geographies, with a way to open one (`POST /work/projects
 * { kind: REGION, cityId }`): a launch plan, an audit drive. The tasks
 * under a project are the Tasks section's; this card is the door.
 */
export function CityProjectsCard({ cityId, cityName, mayCreate }: CityProjectsCardProps) {
    const live = isLive("work");
    const projects = useApiResource<WorkListPage<WorkProject> | null>(`work:city-projects:${cityId}:${live}`, () =>
        live ? workService.projects.list({ cityId, pageSize: 20, sort: "newest" }) : Promise.resolve(null),
    );
    const [open, setOpen] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [draft, setDraft] = React.useState({ name: "", description: "", ownerUserId: [] as string[] });

    if (!live) return null;

    const create = async () => {
        if (!draft.name.trim()) {
            toast.error("Give the project a name.");
            return;
        }
        if (!draft.ownerUserId[0]) {
            toast.error("Pick who owns it.");
            return;
        }
        setBusy(true);
        try {
            const project = await workService.projects.create({
                name: draft.name.trim(),
                ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
                kind: "REGION",
                cityId,
                ownerUserId: draft.ownerUserId[0],
            });
            toast.success(`${project.displayId ?? project.name} opened`, { description: `A region project for ${cityName}.` });
            setOpen(false);
            setDraft({ name: "", description: "", ownerUserId: [] });
            projects.reload();
        } catch (caught) {
            toast.error(caught instanceof ApiError ? caught.message : "Could not open the project.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card className="rounded-lg border-border p-4 shadow-none" data-testid="city-projects">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <FolderKanban className="size-4 text-muted-foreground" aria-hidden />
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Region projects</h3>
                </div>
                <div className="flex items-center gap-3">
                    <Link href="/tasks" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                        Tasks
                        <ArrowRight className="size-3.5" />
                    </Link>
                    {mayCreate && (
                        <Button size="sm" variant="outline" className="bg-card" onClick={() => setOpen(true)}>
                            <Plus className="size-3.5" />
                            New project
                        </Button>
                    )}
                </div>
            </div>

            {projects.loading && !projects.data ? (
                <p className="mt-3 text-xs text-muted-foreground">Reading the projects…</p>
            ) : projects.error ? (
                <p className="mt-3 text-xs text-danger">{projects.error}</p>
            ) : projects.data && projects.data.items.length ? (
                <ul className="mt-3 divide-y">
                    {projects.data.items.map((project) => (
                        <li key={project.id} className="flex items-center gap-3 py-2.5">
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
                                <p className="text-xs text-muted-foreground">
                                    {project.displayId ?? project.id} · owned by {personName(project.owner)}
                                </p>
                            </div>
                            <StatusBadge status={project.status === "ARCHIVED" ? { label: "Archived", tone: "neutral" } : { label: "Active", tone: "success" }} />
                            <Link href={`/tasks/new?projectId=${encodeURIComponent(project.id)}`} className="text-xs font-medium text-primary hover:underline">
                                Add task
                            </Link>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="mt-3 text-xs text-muted-foreground">No project frames {cityName}&apos;s work yet — a launch plan or an audit drive starts here.</p>
            )}

            <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>New region project</DialogTitle>
                        <DialogDescription>A frame for {cityName}&apos;s tasks and issues, with an owner from the registry.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-1">
                        <div className="grid gap-1.5">
                            <Label htmlFor="project-name">Name</Label>
                            <Input id="project-name" value={draft.name} onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))} placeholder={`e.g. ${cityName} launch`} />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="project-description">Description</Label>
                            <Textarea id="project-description" rows={2} value={draft.description} onChange={(event) => setDraft((d) => ({ ...d, description: event.target.value }))} />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="project-owner">Owner</Label>
                            <PeoplePicker id="project-owner" value={draft.ownerUserId} onChange={(userIds) => setDraft((d) => ({ ...d, ownerUserId: userIds.slice(-1) }))} placeholder="Search staff" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="bg-card" onClick={() => setOpen(false)} disabled={busy}>
                            Cancel
                        </Button>
                        <Button onClick={() => void create()} disabled={busy}>
                            Open project
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
