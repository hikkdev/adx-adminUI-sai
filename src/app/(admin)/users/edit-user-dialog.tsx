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
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-client";
import {
    USER_REASON_MAX,
    USER_REASON_MIN,
    contactTakenMessage,
    contactTakenOf,
    displayNameOf,
    editFormOf,
    userEditDiff,
    usersService,
    type EditableUser,
    type UserEditForm,
} from "@/services/users";

/**
 * Editing a person from the desk — `PATCH /users/:id` (K-B1).
 *
 * The body is the diff alone (`userEditDiff`): a field is sent only when it
 * differs from the row, so a form saved unchanged sends nothing and never
 * asks for a reason. Moving the mobile or the email is the highest-trust
 * edit in the console — it moves the sign-in identity and the code
 * destination in one write — so those two demand a reason and the dialog
 * says what moves. A 409 CONTACT_TAKEN is printed as whose the value
 * already is, off the error's details rather than its message.
 *
 * An admin's mobile is never moved from here: the server refuses it
 * (USE_SELF_SERVICE_FLOW) and the field says so before anyone types.
 */

interface EditUserDialogProps {
    user: EditableUser & { roles?: readonly string[] };
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}

export function EditUserDialog({ user, open, onOpenChange, onSaved }: EditUserDialogProps) {
    /* Mounted fresh on every open, so the form starts from the row without an effect. */
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                {open && <EditUserForm user={user} onCancel={() => onOpenChange(false)} onSaved={onSaved} />}
            </DialogContent>
        </Dialog>
    );
}

function EditUserForm({
    user,
    onCancel,
    onSaved,
}: {
    user: EditableUser & { roles?: readonly string[] };
    onCancel: () => void;
    onSaved: () => void;
}) {
    const [form, setForm] = React.useState<UserEditForm>(() => editFormOf(user));
    const [reason, setReason] = React.useState("");
    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const isAdmin = user.roles?.includes("ADMIN") ?? false;
    const { body, movesIdentity } = userEditDiff(user, form);
    const changed = Object.keys(body).length > 0;
    const reasonShort = reason.trim().length < USER_REASON_MIN;

    const set = (key: keyof UserEditForm) => (event: React.ChangeEvent<HTMLInputElement>) =>
        setForm((current) => ({ ...current, [key]: event.target.value }));

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!changed) {
            onCancel();
            return;
        }
        if (movesIdentity && reasonShort) {
            setError(`Say why the sign-in ${body.mobile ? "mobile" : "email"} is moving — at least ${USER_REASON_MIN} characters.`);
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            await usersService.update(user.id, movesIdentity ? { ...body, reason: reason.trim() } : body);
            toast.success(`${displayNameOf(user)} updated`, {
                description: movesIdentity
                    ? body.mobile
                        ? "Sign-in moved to the new number and every session ended."
                        : "The email moved; codes and reset links go to the new address."
                    : undefined,
            });
            onSaved();
            onCancel();
        } catch (caught) {
            const taken = contactTakenOf(caught);
            setError(taken ? contactTakenMessage(taken) : caught instanceof ApiError ? caught.message : "Could not save the changes.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={submit} noValidate>
            <DialogHeader>
                <DialogTitle>Edit {displayNameOf(user)}</DialogTitle>
                <DialogDescription>
                    Only what changes is sent. Moving the mobile or the email moves where this person signs in and
                    where their codes go, and needs a reason.
                </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
                <div className="grid gap-1.5">
                    <Label htmlFor="edit-user-name">Name</Label>
                    <Input id="edit-user-name" value={form.name} onChange={set("name")} autoComplete="off" autoFocus />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                        <Label htmlFor="edit-user-mobile">Mobile</Label>
                        <Input
                            id="edit-user-mobile"
                            value={form.mobile}
                            onChange={set("mobile")}
                            inputMode="tel"
                            autoComplete="off"
                            disabled={isAdmin}
                            title={isAdmin ? "An admin moves their own number from their device, with a code at each end" : undefined}
                        />
                        <p className="text-xs text-muted-foreground">
                            {isAdmin
                                ? "An admin's number moves only from their own device, with a code at each end."
                                : "The sign-in identity. Changing it ends every session on the old number."}
                        </p>
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="edit-user-email">Email</Label>
                        <Input id="edit-user-email" type="email" value={form.email} onChange={set("email")} autoComplete="off" />
                        <p className="text-xs text-muted-foreground">Where reset links and the email backup code go.</p>
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                        <Label htmlFor="edit-user-language">Language</Label>
                        <Input id="edit-user-language" value={form.language} onChange={set("language")} placeholder="en, hi, kn…" autoComplete="off" />
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="edit-user-avatar">Avatar URL</Label>
                        <Input id="edit-user-avatar" type="url" value={form.avatarUrl} onChange={set("avatarUrl")} placeholder="https://…" autoComplete="off" />
                    </div>
                </div>

                {movesIdentity && (
                    <div className="grid gap-1.5 rounded-md border border-warning/40 bg-warning-soft p-3">
                        <p className="text-sm font-medium text-foreground">
                            {body.mobile && body.email
                                ? "The mobile and the email are moving."
                                : body.mobile
                                  ? `Sign-in moves from ${user.mobile} to ${body.mobile}.`
                                  : `The email moves from ${user.email ?? "none"} to ${body.email}.`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {body.mobile
                                ? "Every session on the old number ends now and the old number is told. "
                                : ""}
                            The reason is written on the audit row; it is the one field nobody can reconstruct later.
                        </p>
                        <Label htmlFor="edit-user-reason" className="mt-1">
                            Reason
                        </Label>
                        <Textarea
                            id="edit-user-reason"
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            rows={2}
                            maxLength={USER_REASON_MAX}
                            placeholder="Owner asked by phone on the support line; identity confirmed against the KYC record."
                        />
                        <p className="text-xs text-muted-foreground">
                            {reason.trim().length}/{USER_REASON_MAX} — at least {USER_REASON_MIN} characters.
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
                <Button type="submit" disabled={submitting || !changed || (movesIdentity && reasonShort)}>
                    {submitting ? "Saving…" : changed ? "Save changes" : "Nothing changed"}
                </Button>
            </DialogFooter>
        </form>
    );
}
