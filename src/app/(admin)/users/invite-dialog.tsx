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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";
import type { RoleConfig } from "@/services/roles";
import { usersService, type InviteMethod } from "@/services/users";

/**
 * Invite an address to the console (Q26) — `POST /users/invites`.
 *
 * Nobody signs themselves up for an admin account: the address gets a
 * one-week link, confirms a mobile number as it accepts (that is where the
 * sign-in codes go), and the account is created at acceptance. The role is
 * attached then too. "No role" is the launch rule — every permission.
 */

const NO_ROLE = "__none__";

interface InviteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    roles: RoleConfig[];
    onInvited: () => void;
}

export function InviteDialog({ open, onOpenChange, roles, onInvited }: InviteDialogProps) {
    const [email, setEmail] = React.useState("");
    const [roleId, setRoleId] = React.useState<string>(NO_ROLE);
    const [method, setMethod] = React.useState<InviteMethod>("PASSWORD");
    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const reset = () => {
        setEmail("");
        setRoleId(NO_ROLE);
        setMethod("PASSWORD");
        setError(null);
    };

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const address = email.trim();
        if (!address) {
            setError("Enter the work email to invite.");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const invite = await usersService.invite({
                email: address,
                method,
                ...(roleId !== NO_ROLE ? { roleConfigId: roleId } : {}),
            });
            toast.success(`Invitation sent to ${invite.email}`, {
                description: "The link expires in seven days. Resend or revoke it from the panel.",
            });
            reset();
            onOpenChange(false);
            onInvited();
        } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Could not send the invitation.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) reset();
                onOpenChange(next);
            }}
        >
            <DialogContent className="sm:max-w-md">
                <form onSubmit={submit} noValidate>
                    <DialogHeader>
                        <DialogTitle>Invite user</DialogTitle>
                        <DialogDescription>
                            They get a one-week link, confirm the mobile their sign-in codes will go to, and the
                            account is created as they accept.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        <div className="grid gap-1.5">
                            <Label htmlFor="invite-email">Work email</Label>
                            <Input
                                id="invite-email"
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                placeholder="name@adx.co"
                                autoComplete="off"
                                autoFocus
                            />
                        </div>

                        <div className="grid gap-1.5">
                            <Label htmlFor="invite-role">Console role</Label>
                            <Select value={roleId} onValueChange={setRoleId}>
                                <SelectTrigger id="invite-role">
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
                        </div>

                        <fieldset className="grid gap-2">
                            <legend className="text-sm font-medium text-foreground">How they will sign in</legend>
                            <RadioGroup value={method} onValueChange={(value) => setMethod(value as InviteMethod)}>
                                <label className="flex items-start gap-2.5 rounded-md border px-3 py-2.5">
                                    <RadioGroupItem value="PASSWORD" className="mt-0.5" />
                                    <span>
                                        <span className="block text-sm font-medium text-foreground">Password</span>
                                        <span className="block text-xs text-muted-foreground">
                                            They choose one as they accept.
                                        </span>
                                    </span>
                                </label>
                                <label className="flex items-start gap-2.5 rounded-md border px-3 py-2.5">
                                    <RadioGroupItem value="GOOGLE" className="mt-0.5" />
                                    <span>
                                        <span className="block text-sm font-medium text-foreground">Google Workspace</span>
                                        <span className="block text-xs text-muted-foreground">
                                            {apiConfig.googleClientId
                                                ? "They sign in with the Workspace account at this address."
                                                : "The console has no Google client ID configured, so this sign-in will not be offered on the accept screen until it does."}
                                        </span>
                                    </span>
                                </label>
                            </RadioGroup>
                        </fieldset>

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
                        <Button type="submit" disabled={submitting}>
                            {submitting ? "Sending…" : "Send invitation"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
