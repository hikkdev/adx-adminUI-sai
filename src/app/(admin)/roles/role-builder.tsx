"use client";

import * as React from "react";
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
import { cn } from "@/lib/utils";
import type { CapabilityGroup, RoleColumn } from "@/types";

interface RoleBuilderProps {
    groups: CapabilityGroup[];
    roles: RoleColumn[];
}

export function RoleBuilder({ groups, roles: seed }: RoleBuilderProps) {
    const [roles, setRoles] = React.useState(seed);
    const [selectedId, setSelectedId] = React.useState(seed[0]?.id ?? "");
    const [dirty, setDirty] = React.useState(false);
    const [createOpen, setCreateOpen] = React.useState(false);
    const [deleteOpen, setDeleteOpen] = React.useState(false);
    const [newName, setNewName] = React.useState("");

    const selected = roles.find((role) => role.id === selectedId) ?? roles[0] ?? null;
    const allCapabilities = groups.flatMap((group) => group.capabilities);

    const toggleGrant = (capabilityId: string) => {
        if (!selected || selected.system) return;
        setRoles((current) =>
            current.map((role) =>
                role.id === selected.id
                    ? {
                          ...role,
                          grants: role.grants.includes(capabilityId)
                              ? role.grants.filter((grant) => grant !== capabilityId)
                              : [...role.grants, capabilityId],
                      }
                    : role
            )
        );
        setDirty(true);
    };

    const createRole = () => {
        const name = newName.trim();
        if (name.length < 3) {
            toast.error("Give the role a name of at least 3 characters.");
            return;
        }
        if (roles.some((role) => role.name.toLowerCase() === name.toLowerCase())) {
            toast.error("A role with that name already exists.");
            return;
        }
        const role: RoleColumn = {
            id: `role_${Date.now()}`,
            name,
            members: 0,
            grants: [],
            system: false,
        };
        setRoles((current) => [...current, role]);
        setSelectedId(role.id);
        setCreateOpen(false);
        setNewName("");
        toast.success(`${name} created`, {
            description: "Pick its capabilities, then save.",
        });
    };

    const deleteRole = () => {
        if (!selected || selected.system) return;
        const previous = roles;
        const name = selected.name;
        setRoles((current) => current.filter((role) => role.id !== selected.id));
        setSelectedId(roles[0]?.id ?? "");
        setDeleteOpen(false);
        toast.success(`${name} deleted`, {
            action: { label: "Undo", onClick: () => setRoles(previous) },
        });
    };

    const save = () => {
        setDirty(false);
        toast.success("Permissions saved", {
            description: "Changes apply on each member's next request.",
        });
    };

    return (
        <div className="space-y-5">
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

            <div className="grid items-start gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
                {/* Role list ---------------------------------------------- */}
                <Card className="rounded-lg border-border shadow-none">
                    <ul className="divide-y">
                        {roles.map((role) => (
                            <li key={role.id}>
                                <button
                                    type="button"
                                    onClick={() => setSelectedId(role.id)}
                                    aria-current={selected?.id === role.id ? "true" : undefined}
                                    className={cn(
                                        "flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                                        selected?.id === role.id
                                            ? "bg-muted/60"
                                            : "hover:bg-muted/40"
                                    )}
                                >
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-medium text-foreground">
                                            {role.name}
                                        </span>
                                        <span className="block text-xs tabular-nums text-muted-foreground">
                                            {role.members} {role.members === 1 ? "member" : "members"} ·{" "}
                                            {role.grants.length} of {allCapabilities.length}
                                        </span>
                                    </span>
                                    {role.system && (
                                        <Lock className="size-3.5 shrink-0 text-muted-foreground" />
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
                            <div className="flex min-w-0 items-center gap-2.5">
                                <h2 className="text-base font-semibold text-foreground">
                                    {selected.name}
                                </h2>
                                {selected.system && (
                                    <StatusBadge status={{ label: "System role", tone: "neutral" }} />
                                )}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                {!selected.system && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`Delete ${selected.name}`}
                                        onClick={() => setDeleteOpen(true)}
                                    >
                                        <Trash2 className="size-4" />
                                    </Button>
                                )}
                                <Button onClick={save} disabled={!dirty}>
                                    Save changes
                                </Button>
                            </div>
                        </div>

                        {selected.system && (
                            <p className="border-b bg-muted/40 px-5 py-2.5 text-xs text-muted-foreground">
                                System roles cannot be edited or deleted.
                            </p>
                        )}

                        <div className="divide-y">
                            {groups.map((group) => {
                                const granted = group.capabilities.filter((capability) =>
                                    selected.grants.includes(capability.id)
                                ).length;
                                return (
                                    <fieldset key={group.id} className="px-5 py-4">
                                        <legend className="flex w-full items-center justify-between gap-3 pb-2">
                                            <span className="text-sm font-semibold text-foreground">
                                                {group.label}
                                            </span>
                                            <span className="text-xs tabular-nums text-muted-foreground">
                                                {granted} of {group.capabilities.length}
                                            </span>
                                        </legend>
                                        <div className="grid gap-1 sm:grid-cols-2">
                                            {group.capabilities.map((capability) => (
                                                <label
                                                    key={capability.id}
                                                    className={cn(
                                                        "flex items-center gap-2.5 rounded-md px-2 py-1.5",
                                                        selected.system
                                                            ? "cursor-default opacity-70"
                                                            : "cursor-pointer hover:bg-muted/50"
                                                    )}
                                                >
                                                    <Checkbox
                                                        checked={selected.grants.includes(capability.id)}
                                                        disabled={selected.system}
                                                        onCheckedChange={() => toggleGrant(capability.id)}
                                                    />
                                                    <span className="text-sm text-foreground">
                                                        {capability.label}
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    </fieldset>
                                );
                            })}
                        </div>
                    </Card>
                ) : (
                    <Card className="rounded-lg border-border p-10 text-center shadow-none">
                        <p className="text-sm font-medium text-foreground">No roles yet</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Create a role to start assigning capabilities.
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
                            It starts with no capabilities; grant them after creating.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-1.5 py-1">
                        <Label htmlFor="role-name">Role name</Label>
                        <Input
                            id="role-name"
                            value={newName}
                            onChange={(event) => setNewName(event.target.value)}
                            placeholder="e.g. Campaign Manager"
                            onKeyDown={(event) => event.key === "Enter" && createRole()}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="bg-card" onClick={() => setCreateOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={createRole}>Create role</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title={`Delete ${selected?.name ?? "role"}?`}
                description={
                    selected?.members
                        ? `${selected.members} members lose this role's access.`
                        : "The role is removed. Undo is available straight after."
                }
                confirmLabel="Delete role"
                destructive
                onConfirm={deleteRole}
            />
        </div>
    );
}
