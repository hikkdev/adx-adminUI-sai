"use client";

import * as React from "react";
import Link from "next/link";
import { Lock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
    countHeld,
    entryLabel,
    rolesService,
    withEntryToggled,
    type Capabilities,
    type PermissionEntry,
    type PermissionGroup,
    type RoleConfig,
} from "@/services/roles";
import { UsersNav } from "../users-nav";
import { RoleRuleNote } from "./roles-nav";

/**
 * The role builder — the DR 10 frame `Roles · /roles` (5102:15888), a tab
 * of Users at `/users/roles` since 24 Sep 2026 (`/roles` redirects): what an
 * admin role may do sits beside the people who hold one.
 *
 * The frame's layout is kept: the role list on the left with "n members ·
 * held of total", the editor on the right with a section per module group
 * — its name, "held of total" at the far right, every entry as a box in
 * two columns — and a Save button that lights up when something changed.
 * The boxes are the backend's catalogue rather than the wireframe's
 * thirteen: the group's tiers (View / Edit / Approve, named after the
 * group) and then its named capabilities. The tiers nest by convention
 * and the console keeps the convention in `withEntryToggled`: ticking
 * Approve grants View and Edit too, unticking View drops the two above it.
 *
 * Every write goes to `/roles-config`. A system role's definition is not
 * editable (the backend refuses; the screen does not offer); deleting one,
 * or a role somebody still holds, shows the API's own 409 sentence.
 */

interface RoleBuilderProps {
    capabilities: Capabilities;
    roles: RoleConfig[];
    onChanged: () => void;
}

const message = (caught: unknown, fallback: string) => (caught instanceof ApiError ? caught.message : fallback);

export function RoleBuilder({ capabilities, roles, onChanged }: RoleBuilderProps) {
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    /** The edited permission list, or null when the selected role is untouched. */
    const [draft, setDraft] = React.useState<{ roleId: string; permissions: string[] } | null>(null);
    const [saving, setSaving] = React.useState(false);
    const [createOpen, setCreateOpen] = React.useState(false);
    const [creating, setCreating] = React.useState(false);
    const [newName, setNewName] = React.useState("");
    const [newDescription, setNewDescription] = React.useState("");
    const [deleteOpen, setDeleteOpen] = React.useState(false);
    const [deleting, setDeleting] = React.useState(false);

    const selected = roles.find((role) => role.id === selectedId) ?? roles[0] ?? null;
    const permissions = draft && selected && draft.roleId === selected.id ? draft.permissions : selected?.permissions ?? [];
    const dirty = !!draft && draft.roleId === selected?.id;
    const editable = !!selected && !selected.isSystem;
    const total = capabilities.permissions.length;

    const select = (id: string) => {
        setSelectedId(id);
        setDraft(null);
    };

    const edit = (next: string[]) => {
        if (!selected || !editable) return;
        setDraft({ roleId: selected.id, permissions: next });
    };

    const save = async () => {
        if (!selected || !dirty) return;
        setSaving(true);
        try {
            await rolesService.update(selected.id, { permissions });
            setDraft(null);
            toast.success("Permissions saved", {
                description: "Members of this role are signed out so their next session carries the change.",
            });
            onChanged();
        } catch (caught) {
            toast.error(message(caught, "Could not save the role."));
        } finally {
            setSaving(false);
        }
    };

    const create = async () => {
        const name = newName.trim();
        if (name.length < 1) {
            toast.error("Give the role a name.");
            return;
        }
        setCreating(true);
        try {
            const role = await rolesService.create({
                name,
                ...(newDescription.trim() ? { description: newDescription.trim() } : {}),
                permissions: [],
            });
            setCreateOpen(false);
            setNewName("");
            setNewDescription("");
            setSelectedId(role.id);
            setDraft(null);
            toast.success(`${role.name} created`, { description: "Pick its permissions, then save." });
            onChanged();
        } catch (caught) {
            toast.error(message(caught, "Could not create the role."));
        } finally {
            setCreating(false);
        }
    };

    const remove = async () => {
        if (!selected) return;
        setDeleting(true);
        try {
            const result = await rolesService.remove(selected.id);
            setDeleteOpen(false);
            setSelectedId(null);
            setDraft(null);
            toast.success(result?.message ?? `${selected.name} deleted`);
            onChanged();
        } catch (caught) {
            /* 409 on a system role or one with members: the API says which. */
            toast.error(message(caught, "Could not delete the role."));
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="space-y-5">
            <UsersNav />

            <PageHeader
                title="Roles and permissions"
                subtitle="What each admin role can see and do"
                actions={
                    <Button onClick={() => setCreateOpen(true)}>
                        <Plus className="size-4" />
                        New role
                    </Button>
                }
            />

            <RoleRuleNote />

            <div className="grid items-start gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
                {/* Role list ---------------------------------------------- */}
                <Card className="rounded-lg border-border shadow-none">
                    <ul className="divide-y">
                        {roles.map((role) => (
                            <li key={role.id}>
                                <button
                                    type="button"
                                    onClick={() => select(role.id)}
                                    aria-current={selected?.id === role.id ? "true" : undefined}
                                    className={cn(
                                        "flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                                        selected?.id === role.id ? "bg-muted/60" : "hover:bg-muted/40"
                                    )}
                                >
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-medium text-foreground">
                                            {role.name}
                                        </span>
                                        <span className="block text-xs tabular-nums text-muted-foreground">
                                            {role.memberCount} {role.memberCount === 1 ? "member" : "members"} ·{" "}
                                            {countHeld(role.permissions, capabilities.permissions)} of {total}
                                        </span>
                                    </span>
                                    {role.isSystem && (
                                        <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label="System role" />
                                    )}
                                </button>
                            </li>
                        ))}
                    </ul>
                </Card>

                {/* Role editor -------------------------------------------- */}
                {selected ? (
                    <Card className="rounded-lg border-border shadow-none">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
                            <div className="min-w-0">
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <h2 className="text-base font-semibold text-foreground">{selected.name}</h2>
                                    {selected.isSystem && (
                                        <StatusBadge status={{ label: "System role", tone: "neutral" }} />
                                    )}
                                </div>
                                {selected.description && (
                                    <p className="mt-0.5 text-sm text-muted-foreground">{selected.description}</p>
                                )}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                {!selected.isSystem && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`Delete ${selected.name}`}
                                        onClick={() => setDeleteOpen(true)}
                                    >
                                        <Trash2 className="size-4" />
                                    </Button>
                                )}
                                <Button onClick={save} disabled={!dirty || saving}>
                                    {saving ? "Saving…" : "Save changes"}
                                </Button>
                            </div>
                        </div>

                        {selected.isSystem && (
                            <p className="border-b bg-muted/40 px-5 py-2.5 text-xs text-muted-foreground">
                                System roles cannot be edited or deleted. Who holds one is changed on the{" "}
                                <Link href="/users/admins" className="text-primary underline-offset-4 hover:underline">
                                    Admin users
                                </Link>
                                {" "}tab.
                            </p>
                        )}

                        <div className="divide-y">
                            {capabilities.groups.map((group) => (
                                <GroupSection
                                    key={group.id}
                                    group={group}
                                    permissions={permissions}
                                    editable={editable && !saving}
                                    onToggle={(entry) => edit(withEntryToggled(permissions, group, entry))}
                                />
                            ))}
                        </div>
                    </Card>
                ) : (
                    <Card className="rounded-lg border-border p-10 text-center shadow-none">
                        <p className="text-sm font-medium text-foreground">No roles yet</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Create a role to start assigning permissions.
                        </p>
                    </Card>
                )}
            </div>

            {/* Create role ---------------------------------------------- */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>New role</DialogTitle>
                        <DialogDescription>
                            It starts with no permissions; grant them after creating.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-1">
                        <div className="grid gap-1.5">
                            <Label htmlFor="role-name">Role name</Label>
                            <Input
                                id="role-name"
                                value={newName}
                                onChange={(event) => setNewName(event.target.value)}
                                placeholder="e.g. Campaign manager"
                                onKeyDown={(event) => event.key === "Enter" && void create()}
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="role-description">Description</Label>
                            <Input
                                id="role-description"
                                value={newDescription}
                                onChange={(event) => setNewDescription(event.target.value)}
                                placeholder="Optional — who this role is for"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="bg-card" onClick={() => setCreateOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={() => void create()} disabled={creating}>
                            {creating ? "Creating…" : "Create role"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title={`Delete ${selected?.name ?? "role"}?`}
                description={
                    selected?.memberCount
                        ? `${selected.memberCount} ${selected.memberCount === 1 ? "member holds" : "members hold"} this role. The API refuses to delete a role with members — move them first.`
                        : "The role is removed for good."
                }
                confirmLabel="Delete role"
                destructive
                busy={deleting}
                onConfirm={() => void remove()}
            />
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* One module group: its name, its count, its boxes                    */
/* ------------------------------------------------------------------ */

interface GroupSectionProps {
    group: PermissionGroup;
    permissions: readonly string[];
    editable: boolean;
    onToggle: (entry: PermissionEntry) => void;
}

/**
 * The group's name with "held of total" at the far right, then every entry
 * as a box in two columns, the rows 32px tall. The frame sets the name flush
 * under the rule with all its air below; on the real card that read as a
 * heading crammed against the line, so the section is padded evenly instead
 * — 16 above the name, 12 to the rows, 16 below. A system role's rows are
 * dimmed rather than hidden, so what Super admin holds stays readable.
 *
 * A plain section rather than a fieldset: a `legend` is painted inside the
 * fieldset's border area, so under `divide-y` the rule between groups ran
 * straight through every heading.
 */
function GroupSection({ group, permissions, editable, onToggle }: GroupSectionProps) {
    const held = new Set(permissions);
    const granted = group.permissions.filter((entry) => held.has(entry.id)).length;
    const headingId = `role-group-${group.id}`;

    return (
        <section aria-labelledby={headingId} className="px-5 py-4">
            <div className="flex items-center justify-between gap-3">
                <h3 id={headingId} className="text-sm font-semibold text-foreground">
                    {group.label}
                </h3>
                <span className="text-xs tabular-nums text-muted-foreground">
                    {granted} of {group.permissions.length}
                </span>
            </div>
            <div className="mt-3 grid gap-1 sm:grid-cols-2">
                {group.permissions.map((entry) => (
                    <label
                        key={entry.id}
                        className={cn(
                            "flex h-8 items-center gap-2.5 rounded-md px-2",
                            editable ? "cursor-pointer hover:bg-muted/50" : "cursor-default opacity-70"
                        )}
                    >
                        <Checkbox
                            checked={held.has(entry.id)}
                            disabled={!editable}
                            onCheckedChange={() => onToggle(entry)}
                        />
                        <span className="text-sm text-foreground">{entryLabel(group, entry)}</span>
                    </label>
                ))}
            </div>
        </section>
    );
}
