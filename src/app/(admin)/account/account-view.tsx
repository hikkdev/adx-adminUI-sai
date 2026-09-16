"use client";

import * as React from "react";
import { Eye, EyeOff, Monitor, ShieldCheck } from "lucide-react";
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
import { PageHeader } from "@/components/adx/page-header";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import type { TwoFactorStatus } from "@/services/two-factor";
import { usersService, type WireMe, type WireSession } from "@/services/users";
import { USER_ROLE_META } from "@/types";
import { AuthenticatorCard } from "./authenticator-card";

/**
 * My account — the DR 10 frame `My Account · /account`.
 *
 * The frame's five cards are kept where the API can fill them: Profile
 * (`GET /users/me`, saved with `PATCH /users/me`), Password
 * (`POST /auth/change-password`), Two-factor and Active sessions
 * (`GET /users/me/sessions`, `DELETE /users/me/sessions/:id`). Two things
 * the frame drew are gone rather than faked: "Last changed 3 months ago" —
 * the API does not date a password — and Notification preferences, which
 * have no console-side keys on `/users/me/preferences`.
 *
 * The second factor is a code to the phone on file, or to the email while
 * the backend's three-in-thirty-days backup lasts (Q25) — and, Lot K2, an
 * authenticator app once the operator enrols one on the card below the
 * two-factor card (`GET /auth/2fa/status`; set up, regenerate the recovery
 * codes, turn off). Since E6 `GET /users/me` carries the backup count and
 * when it resets, so the card says the number. "Revoke all other sessions"
 * is the one `DELETE /users/me/sessions` rather than a call per row.
 */

/** The backend's email-fallback budget per thirty days (Q25). */
const EMAIL_BACKUP_USES = 3;

/** Mirrors the backend rule: z.string().min(8). */
const MIN_PASSWORD = 8;

interface AccountViewProps {
    me: WireMe;
    sessions: WireSession[];
    /** Lot K2: the app's enrolment and the platform policy; null when the read failed. */
    twoFactor: TwoFactorStatus | null;
    onChanged: () => void;
}

const message = (caught: unknown, fallback: string) => (caught instanceof ApiError ? caught.message : fallback);

export function AccountView({ me, sessions, twoFactor, onChanged }: AccountViewProps) {
    const [name, setName] = React.useState(me.name ?? "");
    const [saving, setSaving] = React.useState(false);
    const [passwordOpen, setPasswordOpen] = React.useState(false);
    const [revokingId, setRevokingId] = React.useState<string | null>(null);

    const dirty = name.trim() !== (me.name ?? "").trim();
    const others = sessions.filter((session) => !session.current);

    const saveProfile = async () => {
        const trimmed = name.trim();
        if (!trimmed) {
            toast.error("Your name cannot be blank.");
            return;
        }
        setSaving(true);
        try {
            await usersService.updateMe({ name: trimmed });
            toast.success("Profile updated");
            onChanged();
        } catch (caught) {
            toast.error(message(caught, "Could not save your profile."));
        } finally {
            setSaving(false);
        }
    };

    const revoke = async (session: WireSession) => {
        setRevokingId(session.id);
        try {
            await usersService.revokeMySession(session.id);
            toast.success("Session signed out");
            onChanged();
        } catch (caught) {
            toast.error(message(caught, "Could not revoke that session."));
        } finally {
            setRevokingId(null);
        }
    };

    const revokeOthers = async () => {
        setRevokingId("all");
        try {
            const { revoked } = await usersService.revokeMyOtherSessions();
            toast.success(revoked === 1 ? "1 other session signed out" : `${revoked} other sessions signed out`);
            onChanged();
        } catch (caught) {
            toast.error(message(caught, "Could not revoke every session."));
            onChanged();
        } finally {
            setRevokingId(null);
        }
    };

    const backupUsed = Math.min(me.emailOtpFallbackCount ?? 0, EMAIL_BACKUP_USES);
    const backupLeft = EMAIL_BACKUP_USES - backupUsed;

    return (
        <div className="mx-auto max-w-3xl space-y-5">
            <PageHeader title="My account" subtitle="Profile and security" />

            <SectionCard title="Profile">
                <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="acc-name">Full name</Label>
                        <Input id="acc-name" value={name} onChange={(event) => setName(event.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="acc-email">Email</Label>
                        <Input id="acc-email" value={me.email ?? ""} disabled />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="acc-phone">Phone</Label>
                        <Input id="acc-phone" value={me.mobile} disabled />
                        <p className="text-xs text-muted-foreground">
                            Changed from your own device with a code at each end, never from the desk.
                        </p>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Roles</Label>
                        <p className="flex min-h-10 items-center text-sm text-muted-foreground">
                            {me.roles.map((role) => USER_ROLE_META[role]?.label ?? role).join(", ")}
                        </p>
                    </div>
                </div>
                {dirty && (
                    <div className="mt-5 flex justify-end gap-2 border-t pt-4">
                        <Button variant="outline" onClick={() => setName(me.name ?? "")} disabled={saving}>
                            Discard
                        </Button>
                        <Button onClick={() => void saveProfile()} disabled={saving}>
                            {saving ? "Saving…" : "Save changes"}
                        </Button>
                    </div>
                )}
            </SectionCard>

            <SectionCard title="Password">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <p className="text-sm font-medium text-foreground">Password</p>
                        <p className="text-xs text-muted-foreground">
                            {me.hasPassword ? "Set" : "None yet — you sign in with Google or a code"}
                        </p>
                    </div>
                    <Button variant="outline" className="bg-card" onClick={() => setPasswordOpen(true)}>
                        {me.hasPassword ? "Change password" : "Set a password"}
                    </Button>
                </div>
            </SectionCard>

            <SectionCard title="Two-factor authentication" description="Required on every admin sign-in">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <span className="flex size-9 items-center justify-center rounded-md bg-success-soft">
                            <ShieldCheck className="size-4 text-success" />
                        </span>
                        <div>
                            <p className="text-sm font-medium text-foreground">
                                {twoFactor?.authenticator.enrolled
                                    ? twoFactor.policy.smsAllowedWhenEnrolled
                                        ? `2FA: Authenticator app, or SMS to ${me.mobile}`
                                        : "2FA: Authenticator app — SMS and email are not offered while it is on"
                                    : `2FA: SMS to ${me.mobile}`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {me.email
                                    ? `Email backup to ${me.email} — ${backupLeft} of ${EMAIL_BACKUP_USES} uses left in this thirty days${
                                          me.emailOtpFallbackResetAt ? `, resets ${formatDateTime(me.emailOtpFallbackResetAt)}` : ""
                                      }`
                                    : "No email on file, so no backup channel"}
                                {me.twoFactorRequiredAt ? ` · last challenged ${formatDateTime(me.twoFactorRequiredAt)}` : ""}
                            </p>
                        </div>
                    </div>
                    <StatusBadge status={{ label: "On", tone: "success" }} />
                </div>
            </SectionCard>

            <AuthenticatorCard status={twoFactor} onChanged={onChanged} />

            <SectionCard
                title="Active sessions"
                description={`${sessions.length} signed in`}
                footer={
                    others.length > 0 ? (
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 bg-card text-danger hover:text-danger"
                            disabled={revokingId !== null}
                            onClick={() => void revokeOthers()}
                        >
                            Revoke all other sessions
                        </Button>
                    ) : undefined
                }
            >
                {sessions.length ? (
                    <ul className="divide-y">
                        {sessions.map((session) => (
                            <li key={session.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                                <div className="flex min-w-0 items-center gap-3">
                                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                                        <Monitor className="size-4 text-muted-foreground" />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-foreground">
                                            {session.userAgent ?? "Unknown device"}
                                            {session.current && (
                                                <span className="ml-2 rounded-full bg-success-soft px-1.5 py-0.5 text-[10px] font-medium text-success">
                                                    This device
                                                </span>
                                            )}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {[session.ipAddress, session.lastUsedAt ? `Last used ${formatDateTime(session.lastUsedAt)}` : `Since ${formatDateTime(session.createdAt)}`]
                                                .filter(Boolean)
                                                .join(" · ")}
                                        </p>
                                    </div>
                                </div>
                                {!session.current && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs text-danger hover:text-danger"
                                        disabled={revokingId !== null}
                                        onClick={() => void revoke(session)}
                                    >
                                        Revoke
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="py-4 text-center text-sm text-muted-foreground">No active sessions.</p>
                )}
            </SectionCard>

            <ChangePasswordDialog
                open={passwordOpen}
                onOpenChange={setPasswordOpen}
                hasPassword={me.hasPassword}
                onChanged={onChanged}
            />
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Change password                                                     */
/* ------------------------------------------------------------------ */

interface ChangePasswordDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Without one, `currentPassword` is not asked for: the call doubles as "set my first password". */
    hasPassword: boolean;
    onChanged: () => void;
}

function ChangePasswordDialog({ open, onOpenChange, hasPassword, onChanged }: ChangePasswordDialogProps) {
    const [current, setCurrent] = React.useState("");
    const [next, setNext] = React.useState("");
    const [confirm, setConfirm] = React.useState("");
    const [reveal, setReveal] = React.useState(false);
    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const reset = () => {
        setCurrent("");
        setNext("");
        setConfirm("");
        setError(null);
    };

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (next.length < MIN_PASSWORD) {
            setError(`Choose a password of at least ${MIN_PASSWORD} characters.`);
            return;
        }
        if (next !== confirm) {
            setError("The two passwords do not match.");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            await usersService.changeMyPassword({
                ...(hasPassword ? { currentPassword: current } : {}),
                newPassword: next,
            });
            toast.success(hasPassword ? "Password changed" : "Password set");
            reset();
            onOpenChange(false);
            onChanged();
        } catch (caught) {
            setError(message(caught, "Could not change your password."));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(value) => {
                if (!value) reset();
                onOpenChange(value);
            }}
        >
            <DialogContent className="sm:max-w-sm">
                <form onSubmit={submit} noValidate>
                    <DialogHeader>
                        <DialogTitle>{hasPassword ? "Change password" : "Set a password"}</DialogTitle>
                        <DialogDescription>
                            {hasPassword
                                ? "Your other sessions stay signed in."
                                : "You will still get a code on your phone at every sign-in."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        {hasPassword && (
                            <div className="grid gap-1.5">
                                <Label htmlFor="pw-current">Current password</Label>
                                <Input
                                    id="pw-current"
                                    type={reveal ? "text" : "password"}
                                    value={current}
                                    onChange={(event) => setCurrent(event.target.value)}
                                    autoComplete="current-password"
                                />
                            </div>
                        )}
                        <div className="grid gap-1.5">
                            <Label htmlFor="pw-next">New password</Label>
                            <div className="relative">
                                <Input
                                    id="pw-next"
                                    type={reveal ? "text" : "password"}
                                    value={next}
                                    onChange={(event) => setNext(event.target.value)}
                                    autoComplete="new-password"
                                    className="pr-9"
                                />
                                <button
                                    type="button"
                                    onClick={() => setReveal((value) => !value)}
                                    aria-label={reveal ? "Hide password" : "Show password"}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                </button>
                            </div>
                            <p className="text-xs text-muted-foreground">At least {MIN_PASSWORD} characters.</p>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="pw-confirm">Confirm new password</Label>
                            <Input
                                id="pw-confirm"
                                type={reveal ? "text" : "password"}
                                value={confirm}
                                onChange={(event) => setConfirm(event.target.value)}
                                autoComplete="new-password"
                            />
                        </div>
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
                            {submitting ? "Saving…" : hasPassword ? "Change password" : "Set password"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
