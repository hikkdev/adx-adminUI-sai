"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import type { RoleConfig } from "@/services/roles";
import {
    USERS_ROLE_FACETS,
    contactTakenMessage,
    contactTakenOf,
    usersService,
    type UsersRoleFacet,
} from "@/services/users";
import { USER_ROLE_META } from "@/types";

/**
 * Creating a person from the desk — `POST /users` (K-B1).
 *
 * For the account the desk opens on somebody's behalf: a mobile (the
 * sign-in identity — their OTP goes there), a name, an email if they have
 * one, and at least one role. An ADMIN can be handed a console role in the
 * same breath (`roleConfigId`, through the role-config rules). Invite stays
 * the path for a colleague who should set their own password: this one
 * creates the account now, with no password, and the person signs in with
 * a code. A 409 CONTACT_TAKEN is printed as whose the value already is.
 */

const NO_ROLE = "__none__";

interface CreateUserDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    roles: RoleConfig[];
    onCreated: () => void;
    /**
     * Lot K2: the roles ticked when the form opens — the Admin users tab
     * opens it with ADMIN preset and titles it "Create admin". The boxes
     * stay live; it is a starting point, not a lock.
     */
    presetRoles?: readonly UsersRoleFacet[];
}

export function CreateUserDialog({ open, onOpenChange, roles, onCreated, presetRoles }: CreateUserDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                {open && <CreateUserForm roles={roles} presetRoles={presetRoles} onCancel={() => onOpenChange(false)} onCreated={onCreated} />}
            </DialogContent>
        </Dialog>
    );
}

function CreateUserForm({
    roles,
    presetRoles,
    onCancel,
    onCreated,
}: {
    roles: RoleConfig[];
    presetRoles?: readonly UsersRoleFacet[];
    onCancel: () => void;
    onCreated: () => void;
}) {
    const adminPreset = presetRoles?.includes("ADMIN") ?? false;
    const [name, setName] = React.useState("");
    const [mobile, setMobile] = React.useState("");
    const [email, setEmail] = React.useState("");
    const [picked, setPicked] = React.useState<UsersRoleFacet[]>(() => [...(presetRoles ?? [])]);
    const [roleConfigId, setRoleConfigId] = React.useState<string>(NO_ROLE);
    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const isAdmin = picked.includes("ADMIN");

    const toggle = (role: UsersRoleFacet, on: boolean) =>
        setPicked((current) => (on ? [...current.filter((item) => item !== role), role] : current.filter((item) => item !== role)));

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const number = mobile.trim();
        if (!number) {
            setError("Enter the mobile number they will sign in with.");
            return;
        }
        if (picked.length === 0) {
            setError("Pick at least one role.");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const created = await usersService.create({
                mobile: number,
                ...(name.trim() ? { name: name.trim() } : {}),
                ...(email.trim() ? { email: email.trim().toLowerCase() } : {}),
                roles: picked,
                ...(isAdmin && roleConfigId !== NO_ROLE ? { roleConfigId } : {}),
            });
            toast.success(`${created.name ?? created.mobile} created`, {
                description: "No password yet — they sign in with a code to that number.",
            });
            onCreated();
            onCancel();
        } catch (caught) {
            const taken = contactTakenOf(caught);
            setError(taken ? contactTakenMessage(taken) : caught instanceof ApiError ? caught.message : "Could not create the account.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={submit} noValidate>
            <DialogHeader>
                <DialogTitle>{adminPreset ? "Create admin" : "Create user"}</DialogTitle>
                <DialogDescription>
                    The account exists the moment this saves and the person signs in with a code to the number. To let a
                    colleague set their own password, send an invitation instead.
                </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                        <Label htmlFor="create-user-name">Name</Label>
                        <Input id="create-user-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" autoFocus />
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="create-user-mobile">Mobile</Label>
                        <Input
                            id="create-user-mobile"
                            value={mobile}
                            onChange={(event) => setMobile(event.target.value)}
                            inputMode="tel"
                            placeholder="+91 98450 12345"
                            autoComplete="off"
                        />
                    </div>
                </div>

                <div className="grid gap-1.5">
                    <Label htmlFor="create-user-email">Email (optional)</Label>
                    <Input id="create-user-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" />
                </div>

                <fieldset className="grid gap-2">
                    <legend className="text-sm font-medium text-foreground">Roles</legend>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                        {USERS_ROLE_FACETS.map((role) => (
                            <label key={role} className="flex items-start gap-2.5 rounded-md border px-3 py-2">
                                <Checkbox
                                    checked={picked.includes(role)}
                                    onCheckedChange={(state) => toggle(role, state === true)}
                                    aria-label={USER_ROLE_META[role].label}
                                    className="mt-0.5"
                                />
                                <span>
                                    <span className="block text-sm font-medium text-foreground">{USER_ROLE_META[role].label}</span>
                                    <span className="block text-xs text-muted-foreground">{USER_ROLE_META[role].description}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                </fieldset>

                {isAdmin && (
                    <div className="grid gap-1.5">
                        <Label htmlFor="create-user-role-config">Console role</Label>
                        <Select value={roleConfigId} onValueChange={setRoleConfigId}>
                            <SelectTrigger id="create-user-role-config">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NO_ROLE}>Super admin (no role — every permission)</SelectItem>
                                {roles.map((role) => (
                                    <SelectItem key={role.id} value={role.id}>
                                        {role.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            The second factor is on from the first sign-in. The system super-admin role can only be granted by a super admin.
                        </p>
                    </div>
                )}

                {error && (
                    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                        {error}
                    </p>
                )}
            </div>

            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                    {submitting ? "Creating…" : adminPreset ? "Create admin" : "Create user"}
                </Button>
            </DialogFooter>
        </form>
    );
}
