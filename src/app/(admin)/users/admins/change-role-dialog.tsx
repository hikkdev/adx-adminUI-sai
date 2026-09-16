"use client";

import * as React from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ApiError } from "@/lib/api-client";
import type { RoleConfig } from "@/services/roles";
import { usersService } from "@/services/users";

/**
 * Changing an admin's console role — `PUT /users/:id/role-config` (Lot K2).
 *
 * The list is the role list plus "Super admin (no role)", which under the
 * launch rule is every permission, so removing a role is a widening. The
 * system role — `isSystem`, the seeded super-admin role — is drawn but
 * disabled unless the operator holds it: the server refuses the grant with
 * 403 SUPER_ADMIN_ONLY otherwise, and a choice that cannot be saved should
 * not look like one. The server's other pin — the last member of the
 * system role cannot be moved off it (409 LAST_SUPER_ADMIN) — is printed
 * off the refusal rather than guessed at here.
 */

/** The picker's value for "no role", which `PUT` takes as `null`. */
export const NO_ROLE = "__none__";

/**
 * Whether the operator may hand out the system role — the server's own
 * rule (`assertActingIsSuperAdmin`): a member of the system role, or an
 * admin with no role at all under the launch rule. A role the list does
 * not know reads as not the system one: the grant would be refused, so the
 * option stays disabled.
 */
export function operatorIsSuperAdmin(roleConfig: { id: string } | null, roles: readonly RoleConfig[]): boolean {
    if (roleConfig === null) return true;
    return roles.some((role) => role.id === roleConfig.id && role.isSystem);
}

export interface RoleChoice {
    value: string;
    name: string;
    description: string | null;
    /** The system role, for somebody who cannot grant it. */
    disabled: boolean;
    isSystem: boolean;
}

/** The rows the dialog draws: no-role first, then the list; a current role the list lacks is kept so the value shows. */
export function roleChoices(roles: readonly RoleConfig[], current: { id: string; name: string } | null, superAdmin: boolean): RoleChoice[] {
    const choices: RoleChoice[] = [
        { value: NO_ROLE, name: "Super admin (no role)", description: "Every permission, under the launch rule.", disabled: false, isSystem: false },
        ...roles.map((role) => ({
            value: role.id,
            name: role.name,
            description: role.description,
            disabled: role.isSystem && !superAdmin,
            isSystem: role.isSystem,
        })),
    ];
    if (current && !roles.some((role) => role.id === current.id)) {
        choices.push({ value: current.id, name: current.name, description: null, disabled: false, isSystem: false });
    }
    return choices;
}

interface ChangeRoleDialogProps {
    user: { id: string; displayName: string; roleConfig: { id: string; name: string } | null } | null;
    roles: RoleConfig[];
    /** Whether the signed-in operator may grant the system role. */
    operatorIsSuperAdmin: boolean;
    onOpenChange: (open: boolean) => void;
    onChanged: () => void;
}

export function ChangeRoleDialog({ user, roles, operatorIsSuperAdmin: superAdmin, onOpenChange, onChanged }: ChangeRoleDialogProps) {
    return (
        <Dialog open={user !== null} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                {user && (
                    <ChangeRoleForm user={user} roles={roles} superAdmin={superAdmin} onCancel={() => onOpenChange(false)} onChanged={onChanged} />
                )}
            </DialogContent>
        </Dialog>
    );
}

function ChangeRoleForm({
    user,
    roles,
    superAdmin,
    onCancel,
    onChanged,
}: {
    user: NonNullable<ChangeRoleDialogProps["user"]>;
    roles: RoleConfig[];
    superAdmin: boolean;
    onCancel: () => void;
    onChanged: () => void;
}) {
    const [value, setValue] = React.useState<string>(user.roleConfig?.id ?? NO_ROLE);
    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const choices = roleChoices(roles, user.roleConfig, superAdmin);
    const unchanged = value === (user.roleConfig?.id ?? NO_ROLE);

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (unchanged) {
            onCancel();
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const result = await usersService.setRoleConfig(user.id, value === NO_ROLE ? null : value);
            toast.success(
                result.roleConfig
                    ? `${user.displayName} now holds ${result.roleConfig.name}`
                    : `${user.displayName} holds no role — every permission, under the launch rule`,
            );
            onChanged();
            onCancel();
        } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Could not change the role.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={submit} noValidate>
            <DialogHeader>
                <DialogTitle>Change role</DialogTitle>
                <DialogDescription>
                    What {user.displayName} may do in this console. The change takes effect at their next request — the permissions
                    ride in the token.
                </DialogDescription>
            </DialogHeader>

            <div className="py-4">
                <RadioGroup value={value} onValueChange={setValue} aria-label="Console role" className="gap-1.5">
                    {choices.map((choice) => (
                        <label
                            key={choice.value}
                            className={
                                choice.disabled
                                    ? "flex cursor-not-allowed items-start gap-2.5 rounded-md border px-3 py-2 opacity-60"
                                    : "flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 hover:bg-muted/40"
                            }
                        >
                            <RadioGroupItem value={choice.value} disabled={choice.disabled} aria-label={choice.name} className="mt-0.5" />
                            <span className="min-w-0">
                                <span className="block text-sm font-medium text-foreground">{choice.name}</span>
                                <span className="block text-xs text-muted-foreground">
                                    {choice.disabled
                                        ? "Only a super admin can grant the super-admin role."
                                        : (choice.description ?? (choice.isSystem ? "The seeded super-admin role; its last member cannot be moved off it." : ""))}
                                </span>
                            </span>
                        </label>
                    ))}
                </RadioGroup>

                {error && (
                    <p role="alert" className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                        {error}
                    </p>
                )}
            </div>

            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="submit" disabled={submitting || unchanged}>
                    {submitting ? "Saving…" : "Change role"}
                </Button>
            </DialogFooter>
        </form>
    );
}
