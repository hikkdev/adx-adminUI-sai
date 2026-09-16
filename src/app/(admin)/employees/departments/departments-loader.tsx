"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Building2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { ApiError } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import {
    deleteRefusalMessage,
    deleteRefusalOf,
    departmentsService,
    headLabel,
    memberCountLabel,
    openRolesLabel,
    type DepartmentView,
} from "@/services/departments";
import { EmployeesNav, EmployeesOffline } from "../employees-nav";
import { DepartmentDialog } from "./department-dialog";

/**
 * The DR 10 frame `Departments · /employees/departments` (`5102:30522`).
 *
 * The frame's card grid — name, "Head: …", the member count pill, the
 * description, the open-roles line and "View team" — is drawn whole now
 * that Lot G (Q122) gave a department a record of its own: every line is a
 * column on `GET /hr/departments`. The frame had no controls; New, Edit
 * and Delete are the three writes the module owns, drawn in the same idiom
 * as the holidays. A delete is refused by the server while people or
 * departments are still in it, and the dialog prints that refusal.
 */
export function DepartmentsLoader() {
    const live = isLive("employees");
    const resource = useApiResource<DepartmentView[]>(`hr:departments:${live}`, () =>
        live ? departmentsService.listAll() : Promise.resolve([]),
    );
    const [editing, setEditing] = React.useState<DepartmentView | "new" | null>(null);
    const [deleting, setDeleting] = React.useState<DepartmentView | null>(null);
    const [refusal, setRefusal] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const remove = async () => {
        if (!deleting) return;
        setBusy(true);
        setRefusal(null);
        try {
            await departmentsService.remove(deleting.id);
            toast.success(`${deleting.name} deleted`);
            setDeleting(null);
            resource.reload();
        } catch (caught) {
            const why = deleteRefusalOf(caught);
            if (why) setRefusal(deleteRefusalMessage(why, deleting));
            else toast.error(caught instanceof ApiError ? caught.message : "Could not delete the department.");
        } finally {
            setBusy(false);
        }
    };

    if (!live) return <EmployeesOffline title="Departments" subtitle="Team structure with heads, headcount and open roles." />;

    return (
        <div className="space-y-5">
            <PageHeader
                title="Departments"
                subtitle="Team structure with heads, headcount and open roles."
                actions={
                    <Button onClick={() => setEditing("new")}>
                        <Plus className="size-4" />
                        New department
                    </Button>
                }
            />
            <EmployeesNav />
            <ResourceBoundary resource={resource}>
                {(departments) => {
                    if (!departments.length) {
                        return (
                            <EmptyState
                                icon={Building2}
                                title="No departments yet"
                                description="Add the first one here. A department string already on a record becomes a department on the backend's next boot."
                            />
                        );
                    }
                    return (
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {departments.map((department) => {
                                const head = headLabel(department);
                                return (
                                    <Card
                                        key={department.id}
                                        className="group flex flex-col rounded-lg border-border p-5 shadow-none transition-shadow hover:shadow-sm"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <h2 className="truncate text-base font-semibold text-foreground">
                                                    {department.name}
                                                    {!department.isActive && (
                                                        <span className="ml-2 rounded-full bg-muted px-2 py-0.5 align-middle text-[10px] font-medium uppercase text-muted-foreground">
                                                            Inactive
                                                        </span>
                                                    )}
                                                </h2>
                                                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                                    {head ? `Head: ${head}` : "No head yet"}
                                                    {department.parent ? ` · under ${department.parent.name}` : ""}
                                                </p>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-1">
                                                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                                                    {memberCountLabel(department.memberCount)}
                                                </span>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger
                                                        aria-label={`Actions for ${department.name}`}
                                                        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                                    >
                                                        <MoreHorizontal className="size-4" />
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => setEditing(department)}>
                                                            <Pencil className="size-4" />
                                                            Edit
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            className="text-danger focus:text-danger"
                                                            onClick={() => {
                                                                setRefusal(null);
                                                                setDeleting(department);
                                                            }}
                                                        >
                                                            <Trash2 className="size-4" />
                                                            Delete
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </div>
                                        <p className="mt-3 flex-1 text-sm text-muted-foreground">
                                            {department.description ?? (
                                                <span className="italic">No description yet.</span>
                                            )}
                                        </p>
                                        <div className="mt-4 flex items-center justify-between border-t pt-3">
                                            <span className="text-xs text-muted-foreground">{openRolesLabel(department.openRoles)}</span>
                                            <Link
                                                href={`/employees/departments/${encodeURIComponent(department.id)}`}
                                                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                            >
                                                View team
                                                <ArrowRight className="size-3.5" />
                                            </Link>
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                    );
                }}
            </ResourceBoundary>

            <DepartmentDialog
                key={editing === "new" ? "new" : (editing?.id ?? "closed")}
                department={editing === "new" ? null : editing}
                departments={resource.data ?? []}
                open={editing !== null}
                onOpenChange={(open) => !open && setEditing(null)}
                onSaved={resource.reload}
            />
            <ConfirmDialog
                open={deleting !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setDeleting(null);
                        setRefusal(null);
                    }
                }}
                title={deleting ? `Delete ${deleting.name}?` : "Delete department?"}
                description={
                    deleting
                        ? deleting.memberCount > 0
                            ? `${memberCountLabel(deleting.memberCount)} still sit in it, so the server will refuse until they are moved. Nothing is re-rooted or orphaned by a delete.`
                            : "The record goes; no employee row points at it. Nothing is re-rooted or orphaned by a delete."
                        : ""
                }
                confirmLabel="Delete"
                destructive
                busy={busy}
                onConfirm={() => void remove()}
            >
                {refusal && (
                    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                        {refusal}
                    </p>
                )}
            </ConfirmDialog>
        </div>
    );
}
