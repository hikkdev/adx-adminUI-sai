"use client";

import * as React from "react";
import Link from "next/link";
import { MoreHorizontal, Pencil, ShieldCheck, UserCog, UserPlus, UserRoundPlus } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { FilterChips } from "@/components/adx/filter-chips";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDate, formatDateTime } from "@/lib/format";
import type { RoleConfig } from "@/services/roles";
import {
    USER_SORTS,
    USER_SORT_LABEL,
    USER_STATES,
    USER_STATE_LABEL,
    USER_STATUS_META,
    twoFactorLabel,
    twoFactorResetClears,
    usersService,
    type EditableUser,
    type UserRow,
    type UserSort,
    type UserState,
    type UsersDirectory,
} from "@/services/users";
import { CreateUserDialog } from "../create-user-dialog";
import { EditUserDialog } from "../edit-user-dialog";
import { InviteDialog } from "../invite-dialog";
import { UsersNav } from "../users-nav";
import type { AdminsFacets } from "./admins-loader";
import { ChangeRoleDialog } from "./change-role-dialog";

/**
 * The console's own operators — the Admin users tab under Users (Lot K2).
 *
 * Every row is `GET /users?role=ADMIN`: name, email, phone, the console
 * role, the second factor the next sign-in asks for (Authenticator / SMS /
 * Not set, off `twoFactor`), the last sign-in and the state. The row menu
 * is Open, Edit (the Lot K dialog, over the detail read), Change role
 * (`PUT /users/:id/role-config`, the system role disabled for a
 * non-holder), Reset 2FA (the confirm names what is cleared — the email
 * backup, the app, the codes) and Deactivate / Reactivate. The header's
 * Invite admin is the invitation with a role config; Create admin is the
 * Lot K create dialog with ADMIN preset.
 *
 * The operator's own row offers no Reset 2FA and no Deactivate: one's own
 * app is set up and turned off on the account page, and the server refuses
 * to let the last super admin deactivate anyway (LAST_SUPER_ADMIN). Change
 * role stays, as on the roles roster — the same pin answers a self-demotion.
 */

interface AdminsViewProps {
    directory: UsersDirectory;
    facets: AdminsFacets;
    onFacetsChange: (next: AdminsFacets) => void;
    query: string;
    onQueryChange: (value: string) => void;
    roles: RoleConfig[];
    /** The session's user id, so the operator's own row offers no self-moves. */
    operatorId: string | null;
    operatorIsSuperAdmin: boolean;
    onChanged: () => void;
}

type RowAction = { kind: "deactivate" | "reactivate" | "reset-2fa"; row: UserRow };

const message = (caught: unknown, fallback: string) => (caught instanceof ApiError ? caught.message : fallback);

/** The 2FA column's tone: the app is the stronger factor, SMS the ordinary one, nothing at all is a warning. */
function twoFactorTone(row: UserRow): "success" | "info" | "warning" {
    const label = twoFactorLabel(row.twoFactor);
    return label === "Authenticator" ? "success" : label === "SMS" ? "info" : "warning";
}

export function AdminsView({
    directory,
    facets,
    onFacetsChange,
    query,
    onQueryChange,
    roles,
    operatorId,
    operatorIsSuperAdmin,
    onChanged,
}: AdminsViewProps) {
    const { rows, counts, total } = directory;
    const [inviteOpen, setInviteOpen] = React.useState(false);
    const [createOpen, setCreateOpen] = React.useState(false);
    const [editing, setEditing] = React.useState<(EditableUser & { roles: readonly string[] }) | null>(null);
    const [changingRole, setChangingRole] = React.useState<UserRow | null>(null);
    const [pending, setPending] = React.useState<RowAction | null>(null);
    const [busy, setBusy] = React.useState(false);

    const everyState = counts.ACTIVE + counts.INACTIVE + counts.CLOSED;

    const openEdit = async (row: UserRow) => {
        try {
            /* The row has no avatar; the detail read does, and the dialog diffs against the row it was handed. */
            const detail = await usersService.get(row.id);
            setEditing({
                id: detail.id,
                name: detail.name,
                email: detail.email,
                mobile: detail.mobile,
                language: detail.language,
                avatarUrl: detail.avatarUrl,
                roles: detail.roles,
            });
        } catch (caught) {
            toast.error(message(caught, "Could not read the account."));
        }
    };

    const run = async () => {
        if (!pending) return;
        const { kind, row } = pending;
        setBusy(true);
        try {
            if (kind === "reset-2fa") {
                const result = await usersService.resetTwoFactor(row.id);
                toast.success(result?.message ?? `Second factor reset for ${row.displayName}`);
            } else {
                await usersService.update(row.id, { isActive: kind === "reactivate" });
                toast.success(kind === "deactivate" ? `${row.displayName} deactivated — every session ended` : `${row.displayName} reactivated`);
            }
            setPending(null);
            onChanged();
        } catch (caught) {
            toast.error(message(caught, "Could not update the account."));
        } finally {
            setBusy(false);
        }
    };

    const resetClears = pending?.kind === "reset-2fa" ? twoFactorResetClears(pending.row.twoFactor) : [];

    return (
        <div className="space-y-5">
            <UsersNav />

            <PageHeader
                title="Admin users"
                subtitle="Everyone who can sign in to this console"
                actions={
                    <>
                        <Button variant="outline" className="bg-card" onClick={() => setInviteOpen(true)}>
                            <UserPlus className="size-4" />
                            Invite admin
                        </Button>
                        <Button onClick={() => setCreateOpen(true)}>
                            <UserRoundPlus className="size-4" />
                            Create admin
                        </Button>
                    </>
                }
            />

            <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                    <Input
                        value={query}
                        onChange={(event) => onQueryChange(event.target.value)}
                        placeholder="Name, email, mobile — any contact on the account"
                        className="h-9 max-w-sm bg-card"
                        aria-label="Search admin users"
                    />
                    <Select value={facets.sort} onValueChange={(value) => onFacetsChange({ ...facets, sort: value as UserSort })}>
                        <SelectTrigger className="h-9 w-44 bg-card" aria-label="Sort">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {USER_SORTS.map((sort) => (
                                <SelectItem key={sort} value={sort}>
                                    {USER_SORT_LABEL[sort]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <FilterChips<UserState | "ALL">
                    chips={[
                        { value: "ALL", label: "All", count: everyState },
                        ...USER_STATES.map((state) => ({ value: state, label: USER_STATE_LABEL[state], count: counts[state] })),
                    ]}
                    value={facets.state ?? "ALL"}
                    onChange={(value) => onFacetsChange({ ...facets, state: value === "ALL" ? null : value })}
                />

                <Card className="overflow-hidden rounded-lg border-border shadow-none">
                    {rows.length ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                        <th className="px-4 py-2.5 font-medium">Name</th>
                                        <th className="px-4 py-2.5 font-medium">Email</th>
                                        <th className="px-4 py-2.5 font-medium">Phone</th>
                                        <th className="px-4 py-2.5 font-medium">Role</th>
                                        <th className="px-4 py-2.5 font-medium">2FA</th>
                                        <th className="px-4 py-2.5 font-medium">Last sign-in</th>
                                        <th className="px-4 py-2.5 font-medium">State</th>
                                        <th className="px-2 py-2.5">
                                            <span className="sr-only">Actions</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((user) => {
                                        const self = user.id === operatorId;
                                        const factor = twoFactorLabel(user.twoFactor);
                                        return (
                                            <tr key={user.id} className="border-b last:border-0 hover:bg-muted/30">
                                                <td className="px-4 py-3">
                                                    <Link
                                                        href={`/users/${user.id}`}
                                                        className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                    >
                                                        <InitialsAvatar name={user.displayName} size="sm" />
                                                        <span className="min-w-0">
                                                            <span className="block truncate font-medium text-foreground underline-offset-4 hover:underline">
                                                                {user.displayName}
                                                                {self && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
                                                            </span>
                                                            <span className="block text-xs text-muted-foreground">Joined {formatDate(user.createdAt)}</span>
                                                        </span>
                                                    </Link>
                                                </td>
                                                <td className="px-4 py-3 text-muted-foreground">{user.email ?? "—"}</td>
                                                <td className="px-4 py-3 tabular-nums text-muted-foreground">{user.mobile}</td>
                                                <td className="px-4 py-3 text-muted-foreground">{user.roleConfig?.name ?? "Super admin"}</td>
                                                <td className="px-4 py-3">
                                                    <StatusBadge status={{ label: factor, tone: twoFactorTone(user) }} />
                                                    {factor === "Authenticator" && user.twoFactor && (
                                                        <span className="mt-1 block text-xs text-muted-foreground">
                                                            {user.twoFactor.recoveryCodesLeft} {user.twoFactor.recoveryCodesLeft === 1 ? "code" : "codes"} left
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-muted-foreground">
                                                    {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Never signed in"}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <StatusBadge status={USER_STATUS_META[user.status]} />
                                                </td>
                                                <td className="px-2 py-3 text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${user.displayName}`}>
                                                                <MoreHorizontal className="size-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem asChild>
                                                                <Link href={`/users/${user.id}`}>Open</Link>
                                                            </DropdownMenuItem>
                                                            {user.status !== "closed" && (
                                                                <DropdownMenuItem onSelect={() => void openEdit(user)}>
                                                                    <Pencil className="size-4" />
                                                                    Edit
                                                                </DropdownMenuItem>
                                                            )}
                                                            {user.status !== "closed" && (
                                                                <DropdownMenuItem onSelect={() => setChangingRole(user)}>
                                                                    <UserCog className="size-4" />
                                                                    Change role
                                                                </DropdownMenuItem>
                                                            )}
                                                            {user.status !== "closed" && !self && (
                                                                <>
                                                                    <DropdownMenuItem onSelect={() => setPending({ kind: "reset-2fa", row: user })}>
                                                                        <ShieldCheck className="size-4" />
                                                                        Reset 2FA
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuSeparator />
                                                                    {user.status === "active" ? (
                                                                        <DropdownMenuItem
                                                                            className="text-danger focus:text-danger"
                                                                            onSelect={() => setPending({ kind: "deactivate", row: user })}
                                                                        >
                                                                            Deactivate
                                                                        </DropdownMenuItem>
                                                                    ) : (
                                                                        <DropdownMenuItem onSelect={() => setPending({ kind: "reactivate", row: user })}>
                                                                            Reactivate
                                                                        </DropdownMenuItem>
                                                                    )}
                                                                </>
                                                            )}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="px-5 py-12 text-center text-sm text-muted-foreground">No admin users match these filters.</p>
                    )}
                    {rows.length > 0 && (
                        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
                            {total} {total === 1 ? "admin" : "admins"}
                        </p>
                    )}
                </Card>
            </div>

            <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} roles={roles} onInvited={onChanged} />
            <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} roles={roles} presetRoles={["ADMIN"]} onCreated={onChanged} />
            {editing && <EditUserDialog user={editing} open onOpenChange={(open) => !open && setEditing(null)} onSaved={onChanged} />}
            <ChangeRoleDialog
                user={changingRole ? { id: changingRole.id, displayName: changingRole.displayName, roleConfig: changingRole.roleConfig } : null}
                roles={roles}
                operatorIsSuperAdmin={operatorIsSuperAdmin}
                onOpenChange={(open) => !open && setChangingRole(null)}
                onChanged={onChanged}
            />

            <ConfirmDialog
                open={pending?.kind === "reset-2fa"}
                onOpenChange={(open) => !open && setPending(null)}
                title={`Reset 2FA for ${pending?.row.displayName ?? ""}?`}
                description="Their next sign-in asks for a code to the phone again. This clears:"
                confirmLabel="Reset 2FA"
                busy={busy}
                onConfirm={() => void run()}
            >
                <ul className="list-disc space-y-1 pl-5 text-sm text-foreground" data-testid="reset-2fa-clears">
                    {resetClears.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            </ConfirmDialog>
            <ConfirmDialog
                open={pending?.kind === "deactivate"}
                onOpenChange={(open) => !open && setPending(null)}
                title={`Deactivate ${pending?.row.displayName ?? ""}?`}
                description="Every session ends now and sign-in is refused until the account is reactivated. Nothing is deleted. The last active super admin cannot be deactivated."
                confirmLabel="Deactivate"
                destructive
                busy={busy}
                onConfirm={() => void run()}
            />
            <ConfirmDialog
                open={pending?.kind === "reactivate"}
                onOpenChange={(open) => !open && setPending(null)}
                title={`Reactivate ${pending?.row.displayName ?? ""}?`}
                description="Sign-in is allowed again with the same credentials."
                confirmLabel="Reactivate"
                busy={busy}
                onConfirm={() => void run()}
            />
        </div>
    );
}
