"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { BookOpen, ExternalLink, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { trainingService, type CreateResourceInput, type TrainingResource } from "@/services/training";
import { Field } from "../module-fields";
import { TRAINING_TITLE, TrainingNav } from "../training-nav";

interface LibraryViewProps {
    resources: TrainingResource[];
    /** Refetches after a create actually lands. */
    onChanged: () => void;
}

/**
 * The flat library — no DR 10 frame and no console screen before this one.
 * `GET /training` is what the agent app's training tab and the publisher
 * pane both read; `POST /training` was ADMIN-only on the backend with
 * nothing in the console calling it, so the create dialog here is the first
 * way ops have had to add a resource without a database client.
 */
export function LibraryView({ resources, onChanged }: LibraryViewProps) {
    const [creating, setCreating] = React.useState(false);

    const columns = React.useMemo<ColumnDef<TrainingResource>[]>(
        () => [
            {
                id: "title",
                accessorKey: "title",
                header: ({ column }) => <SortableHeader column={column}>Title</SortableHeader>,
                cell: ({ row }) => (
                    <div className="min-w-0 max-w-[24rem]">
                        <p className="font-medium text-foreground">{row.original.title}</p>
                        {row.original.subtitle && <p className="truncate text-xs text-muted-foreground">{row.original.subtitle}</p>}
                    </div>
                ),
            },
            {
                id: "category",
                accessorKey: "category",
                header: ({ column }) => <SortableHeader column={column}>Category</SortableHeader>,
                cell: ({ row }) => <span className="text-muted-foreground">{row.original.category}</span>,
            },
            {
                id: "topic",
                accessorFn: (row) => row.topic ?? "",
                header: "Topic",
                cell: ({ row }) => <span className="text-muted-foreground">{row.original.topic ?? "—"}</span>,
            },
            {
                id: "duration",
                accessorFn: (row) => row.duration ?? "",
                header: "Duration",
                cell: ({ row }) => <span className="text-muted-foreground">{row.original.duration ?? "—"}</span>,
            },
            {
                id: "links",
                header: "Links",
                enableSorting: false,
                cell: ({ row }) => (
                    <span className="flex items-center gap-3 text-xs">
                        {row.original.videoUrl && (
                            <a href={row.original.videoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
                                Video <ExternalLink className="size-3" aria-hidden />
                            </a>
                        )}
                        {row.original.documentUrl && (
                            <a href={row.original.documentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
                                Document <ExternalLink className="size-3" aria-hidden />
                            </a>
                        )}
                        {!row.original.videoUrl && !row.original.documentUrl && <span className="text-muted-foreground">—</span>}
                    </span>
                ),
            },
            {
                id: "added",
                accessorKey: "createdAt",
                header: ({ column }) => <SortableHeader column={column}>Added</SortableHeader>,
                cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(row.original.createdAt)}</span>,
            },
        ],
        [],
    );

    return (
        <div className="space-y-5">
            <PageHeader
                title={TRAINING_TITLE}
                subtitle={`${resources.length} ${resources.length === 1 ? "resource" : "resources"} in the library both apps read`}
                actions={
                    <Button onClick={() => setCreating(true)}>
                        <Plus className="mr-1.5 size-4" />
                        New resource
                    </Button>
                }
            />
            <TrainingNav />
            <DataTable
                columns={columns}
                data={resources}
                searchPlaceholder="Search title, category or topic"
                initialPageSize={10}
                emptyState={
                    <EmptyState
                        icon={BookOpen}
                        title="The library is empty"
                        description="A resource is a video or a document an agent or a publisher can open from their app's training tab. It is not a module and has no quiz."
                        action={
                            <Button onClick={() => setCreating(true)}>
                                <Plus className="mr-1.5 size-4" />
                                New resource
                            </Button>
                        }
                    />
                }
            />
            <NewResourceDialog open={creating} onOpenChange={setCreating} onCreated={onChanged} />
        </div>
    );
}

function NewResourceDialog({
    open,
    onOpenChange,
    onCreated,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: () => void;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                {/* Mounted only while open, so the form is fresh each time. */}
                <ResourceForm onClose={() => onOpenChange(false)} onCreated={onCreated} />
            </DialogContent>
        </Dialog>
    );
}

interface ResourceValues {
    title: string;
    category: string;
    subtitle: string;
    topic: string;
    duration: string;
    videoUrl: string;
    documentUrl: string;
}

const isUrl = (value: string) => {
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
};

/** The optional fields go on the wire only when typed; the schema has no null for them. */
export function resourceBody(values: ResourceValues): CreateResourceInput {
    const body: CreateResourceInput = { title: values.title.trim(), category: values.category.trim() };
    if (values.subtitle.trim()) body.subtitle = values.subtitle.trim();
    if (values.topic.trim()) body.topic = values.topic.trim();
    if (values.duration.trim()) body.duration = values.duration.trim();
    if (values.videoUrl.trim()) body.videoUrl = values.videoUrl.trim();
    if (values.documentUrl.trim()) body.documentUrl = values.documentUrl.trim();
    return body;
}

function ResourceForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [values, setValues] = React.useState<ResourceValues>({
        title: "",
        category: "",
        subtitle: "",
        topic: "",
        duration: "",
        videoUrl: "",
        documentUrl: "",
    });
    const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
    const [formError, setFormError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const problems: Partial<Record<keyof ResourceValues, string>> = {};
    if (!values.title.trim()) problems.title = "A title is what the app lists.";
    if (!values.category.trim()) problems.category = "The tab the app files it under.";
    if (values.videoUrl.trim() && !isUrl(values.videoUrl.trim())) problems.videoUrl = "A full http(s) URL, or empty.";
    if (values.documentUrl.trim() && !isUrl(values.documentUrl.trim())) problems.documentUrl = "A full http(s) URL, or empty.";
    const ready = Object.keys(problems).length === 0;

    const set = (key: keyof ResourceValues) => (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setValues((current) => ({ ...current, [key]: value }));
    };
    const errorFor = (key: keyof ResourceValues) => fieldErrors[key]?.[0] ?? (values[key] ? problems[key] : undefined);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        setFieldErrors({});
        setFormError(null);
        try {
            const created = await trainingService.createResource(resourceBody(values));
            toast.success(`${created.title} added`, { description: "In both apps' training tabs from their next read." });
            onCreated();
            onClose();
        } catch (cause) {
            if (cause instanceof ApiError) {
                setFieldErrors(cause.fieldErrors);
                setFormError(cause.message);
            } else {
                setFormError(cause instanceof Error ? cause.message : "Could not add the resource.");
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>New resource</DialogTitle>
                <DialogDescription>
                    A video or a document for the library. It is listed at once in both apps; it is not a module and
                    has no quiz.
                </DialogDescription>
            </DialogHeader>
            <Field id="rs-title" label="Title" error={errorFor("title")}>
                <Input id="rs-title" value={values.title} onChange={set("title")} autoComplete="off" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
                <Field id="rs-category" label="Category" hint="The app's filter tab — Onboarding, Sales, Compliance…" error={errorFor("category")}>
                    <Input id="rs-category" value={values.category} onChange={set("category")} autoComplete="off" />
                </Field>
                <Field id="rs-topic" label="Topic" optional error={errorFor("topic")}>
                    <Input id="rs-topic" value={values.topic} onChange={set("topic")} autoComplete="off" />
                </Field>
            </div>
            <Field id="rs-subtitle" label="Subtitle" optional error={errorFor("subtitle")}>
                <Input id="rs-subtitle" value={values.subtitle} onChange={set("subtitle")} autoComplete="off" />
            </Field>
            <Field id="rs-duration" label="Duration" optional hint="As the app prints it — “12 min”." error={errorFor("duration")}>
                <Input id="rs-duration" value={values.duration} onChange={set("duration")} autoComplete="off" className="sm:w-40" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
                <Field id="rs-video" label="Video URL" optional error={errorFor("videoUrl")}>
                    <Input id="rs-video" value={values.videoUrl} onChange={set("videoUrl")} inputMode="url" placeholder="https://" autoComplete="off" />
                </Field>
                <Field id="rs-document" label="Document URL" optional error={errorFor("documentUrl")}>
                    <Input id="rs-document" value={values.documentUrl} onChange={set("documentUrl")} inputMode="url" placeholder="https://" autoComplete="off" />
                </Field>
            </div>
            {formError && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p>}
            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onClose}>
                    Cancel
                </Button>
                <Button type="submit" disabled={!ready || busy}>
                    {busy ? "Adding…" : "Add resource"}
                </Button>
            </DialogFooter>
        </form>
    );
}
