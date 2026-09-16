"use client";

import * as React from "react";
import Link from "next/link";
import { KeyRound, MoreHorizontal, Pencil, UserPlus, UserRoundPlus } from "lucide-react";
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
import { KpiCard } from "@/components/adx/kpi-card";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDate, formatDateTime } from "@/lib/format";
import type { RoleConfig } from "@/services/roles";
import {
    USERS_ROLE_FACETS,
    USER_SORTS,
    USER_SORT_LABEL,
    USER_STATES,
    USER_STATE_LABEL,
    USER_STATUS_META,
    usersService,
    type EditableUser,
    type Invite,
    type UserRow,
    type UserSort,
    type UserState,
    type UsersDirectory,
    type UsersRoleFacet,
} from "@/services/users";
import { USER_ROLE_META } from "@/types";
import { CreateUserDialog } from "./create-user-dialog";
import { EditUserDialog } from "./edit-user-dialog";
import { InviteDialog } from "./invite-dialog";
import { InvitesPanel } from "./invites-panel";
import { UsersNav } from "./users-nav";
import type { UsersFacets } from "./users-loader";

/**
 * The accounts directory — the DR 10 frame `Users · /users`.
 *
 * The frame's header, KPI row, filter bar and table are kept. Two of its
 * three KPIs and two of its columns are gone rather than filled: "Identity
 * not verified" and "Active without 2FA" have no source on the admin list
 * (KYC lives per party, and the second factor is a rule, not a flag), and
 * neither does a city. The status column says what the API says — an
 * account is active, deactivated, or closed and kept (Q21).
 *
 * K-B1 (the owner, 14 September: "next to impossible to edit a user"): the
 * search reaches the contact rows, the state chips carry the server's
 * counts, the role facet and the sort go to the API and live in the URL,
 * every row links to the person AND carries a menu — Open, Edit,
 * Deactivate / Reactivate, Reset password — and "Create user" sits beside
 * Invite for the account the desk opens on somebody's behalf. Invite stays
 * for the colleague who should set their own password.
 */

const ANY_ROLE = "__any__";

interface UsersViewProps {
    directory: UsersDirectory;
    facets: UsersFacets;
    onFacetsChange: (next: UsersFacets) => void;
    query: string;
    onQueryChange: (value: string) => void;
    invites: Invite[];
    roles: RoleConfig[];
    onChanged: () => void;
}

type RowAction = { kind: "deactivate" | "reactivate" | "reset-password"; row: UserRow };

const message = (caught: unknown, fallback: string) => (caught instanceof ApiError ? caught.message : fallback);

export function UsersView({ directory, facets, onFacetsChange, query, onQueryChange, invites, roles, onChanged }: UsersViewProps) {
    const { rows, counts, total } = directory;
    const [inviteOpen, setInviteOpen] = React.useState(false);
    const [createOpen, setCreateOpen] = React.useState(false);
    const [editing, setEditing] = React.useState<(EditableUser & { roles: readonly string[] }) | null>(null);
    const [pending, setPending] = React.useState<RowAction | null>(null);
    const [busy, setBusy] = React.useState(false);

    const everyState = counts.ACTIVE + counts.INACTIVE + counts.CLOSED;

    /* The role counts are over the rows the server answered under the other facets — the list is whole, not paged. */
    const roleCount = (role: UsersRoleFacet) => rows.filter((user) => user.roles.includes(role)).length;

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
            if (kind === "reset-password") {
                const result = await usersService.resetPassword(row.id);
                toast.success(result?.message ?? `Reset link sent to ${row.email}`);
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

    return (
        <div className="space-y-5">
            <UsersNav />

            <PageHeader
                title="Users"
                subtitle="Every account on the marketplace"
                actions={
                    <>
                        <Button variant="outline" className="bg-card" onClick={() => setInviteOpen(true)}>
                            <UserPlus className="size-4" />
                            Invite user
                        </Button>
                        <Button onClick={() => setCreateOpen(true)}>
                            <UserRoundPlus className="size-4" />
                            Create user
                        </Button>
                    </>
                }
            />

            <div className="grid gap-4 md:grid-cols-3">
                <KpiCard stat={{ id: "active", label: "Active accounts", value: String(counts.ACTIVE), hint: `of ${everyState} under this search` }} />
                <KpiCard
                    stat={{
                        id: "inactive",
                        label: "Deactivated",
                        value: String(counts.INACTIVE),
                        hint: counts.INACTIVE ? "Signed out and refused at the door" : "Nobody is locked out",
                    }}
                />
                <KpiCard stat={{ id: "closed", label: "Closed", value: String(counts.CLOSED), hint: "Kept on record, never deleted" }} />
            </div>

            <div className="grid items-start gap-4 xl:grid-cols-3">
                <div className="space-y-3 xl:col-span-2">
                    <div className="flex flex-wrap items-center gap-3">
                        <Input
                            value={query}
                            onChange={(event) => onQueryChange(event.target.value)}
                            placeholder="Name, email, mobile — any contact on the account"
                            className="h-9 max-w-sm bg-card"
                            aria-label="Search users"
                        />
                        <Select
                            value={facets.role ?? ANY_ROLE}
                            onValueChange={(value) => onFacetsChange({ ...facets, role: value === ANY_ROLE ? null : (value as UsersRoleFacet) })}
                        >
                            <SelectTrigger className="h-9 w-48 bg-card" aria-label="Role">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ANY_ROLE}>Any role</SelectItem>
                                {USERS_ROLE_FACETS.map((role) => (
                                    <SelectItem key={role} value={role}>
                                        {USER_ROLE_META[role].label}
                                        {facets.role === null || facets.role === role ? ` (${roleCount(role)})` : ""}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
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
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                        <th className="px-4 py-2.5 font-medium">User</th>
                                        <th className="px-4 py-2.5 font-medium">Roles</th>
                                        <th className="px-4 py-2.5 font-medium">Console role</th>
                                        <th className="px-4 py-2.5 font-medium">Joined</th>
                                        <th className="px-4 py-2.5 font-medium">Last active</th>
                                        <th className="px-4 py-2.5 font-medium">Status</th>
                                        <th className="px-2 py-2.5">
                                            <span className="sr-only">Actions</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((user) => (
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
                                                        </span>
                                                        <span className="block truncate text-xs text-muted-foreground">
                                                            {[user.email, user.mobile].filter(Boolean).join(" · ")}
                                                        </span>
                                                    </span>
                                                </Link>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-wrap gap-1">
                                                    {user.roles.map((role) => (
                                                        <span key={role} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                                            {USER_ROLE_META[role]?.label ?? role}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground">
                                                {user.roles.includes("ADMIN") ? (user.roleConfig?.name ?? "Super admin") : "—"}
                                            </td>
                                            <td className="px-4 py-3 tabular-nums text-muted-foreground">{formatDate(user.createdAt)}</td>
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
                                                            <>
                                                                <DropdownMenuItem onSelect={() => void openEdit(user)}>
                                                                    <Pencil className="size-4" />
                                                                    Edit
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                    disabled={!user.email}
                                                                    onSelect={() => setPending({ kind: "reset-password", row: user })}
                                                                >
                                                                    <KeyRound className="size-4" />
                                                                    Reset password
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
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <p className="px-5 py-12 text-center text-sm text-muted-foreground">No users match these filters.</p>
                        )}
                        {rows.length > 0 && (
                            <p className="border-t px-4 py-2 text-xs text-muted-foreground">
                                {total} {total === 1 ? "account" : "accounts"}
                            </p>
                        )}
                    </Card>
                </div>

                <InvitesPanel invites={invites} roles={roles} onChanged={onChanged} />
            </div>

            <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} roles={roles} onInvited={onChanged} />
            <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} roles={roles} onCreated={onChanged} />
            {editing && (
                <EditUserDialog user={editing} open onOpenChange={(open) => !open && setEditing(null)} onSaved={onChanged} />
            )}

            <ConfirmDialog
                open={pending?.kind === "reset-password"}
                onOpenChange={(open) => !open && setPending(null)}
                title={`Send ${pending?.row.displayName ?? ""} a password reset link?`}
                description={`The ordinary reset email goes to ${pending?.row.email ?? "their address"}. Their password is unchanged until they use it, and the send is recorded against the account.`}
                confirmLabel="Send reset link"
                busy={busy}
                onConfirm={() => void run()}
            />
            <ConfirmDialog
                open={pending?.kind === "deactivate"}
                onOpenChange={(open) => !open && setPending(null)}
                title={`Deactivate ${pending?.row.displayName ?? ""}?`}
                description="Every session ends now and sign-in is refused until the account is reactivated. Nothing is deleted."
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
