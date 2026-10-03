"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Loader2, UserPlus, UserRoundPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CloseAccountDialog } from "@/components/adx/close-account-dialog";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { SortableHeader, selectionColumn } from "@/components/adx/data-table";
import { DeleteAccountConfirm, DeleteBlockedDialog } from "@/components/adx/delete-account";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { PartyContactCell, PartyNameCell, ROSTER_MENU_LABEL, RosterRowMenu, type RosterMenuEntry } from "@/components/adx/party-roster-columns";
import { RosterSearch, RosterSelect, StatusSelect } from "@/components/adx/party-roster-filter-bar";
import { useRosterPermission } from "@/components/adx/party-roster-row-actions";
import { PartyRosterTable, type PartyRosterView } from "@/components/adx/party-roster-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { useOptionalAuth } from "@/lib/auth";
import { failureMessage, runEach, type BulkPlan } from "@/lib/bulk";
import { formatDate, formatDateTime } from "@/lib/format";
import { ROSTER_ANY } from "@/services/party-roster";
import type { RoleConfig } from "@/services/roles";
import {
    DEFAULT_USERS_STATUS,
    USERS_ROLE_FACETS,
    USERS_STATUS_OPTIONS,
    USER_PARTY_LABEL,
    USER_STATE_PILL,
    accountLifecycleService,
    isUsersStatusFacet,
    userPartyHref,
    userRowState,
    usersService,
    usersStatusCounts,
    type DeleteBlocker,
    type UserRow,
    type UsersDirectory,
} from "@/services/users";
import { USER_ROLE_META } from "@/types";
import { CreateUserDialog } from "./create-user-dialog";
import { InviteDialog } from "./invite-dialog";
import { UsersNav } from "./users-nav";
import { roleFacetOf, type UsersFacets } from "./users-loader";
import { accountsCount, announceResult, deletePlanLine, planDelete, planStatusMove, skippedSentence, type DeletePlan, type StatusMove } from "./users-bulk";

/**
 * Users › Accounts: every login on ADX — 2 Oct 2026 (the owner: "UI looks
 * pretty weird compared to rest of the console and there is no bulk action
 * buttons, also no delete users button still").
 *
 * The party directories' layout, reused rather than copied: the shared
 * header, the shared filter bar's controls in the same order (Search · Any
 * role · Status, Columns on the right), the roster table with its row
 * checkboxes, Columns menu, paging and "Showing …" foot, the roster's Name
 * and Contact cells, and the roster's "⋯" menu. Status is the rosters'
 * Status select over the users route's `state` facet and its counts; there
 * are no number cards, no sort select and no chip row (sorting is by the
 * column headers).
 *
 * Under the person's name, what the login holds (2 Oct 2026, the owner: "as
 * if they're not linked at all"): "Publisher · Skyline Outdoor Media", each
 * linking to its page, so the person here can be matched with the business
 * the directories and the KYC queues name.
 *
 * Row menu: View details; then Deactivate / Reactivate (`system.edit`, not
 * on a closed or erased account, not on one's own) and Delete account…
 * (`system.accounts`), which asks `GET /users/:id/deletable` first and
 * either confirms or lists what stands in the way, with Close account
 * instead. The bulk bar does the same per ticked account, a few at a time,
 * and keeps the failed ones ticked. Pending invitations live on Admin users;
 * here a one-line notice points there.
 */

interface UsersViewProps {
    directory: UsersDirectory;
    facets: UsersFacets;
    onFacetsChange: (next: UsersFacets) => void;
    query: string;
    onQueryChange: (value: string) => void;
    /** Open console invitations, for the one-line notice. */
    invitesWaiting: number;
    roles: RoleConfig[];
    /** A changed filter is being read under the rows on screen. */
    refreshing?: boolean;
    onChanged: () => void;
}

/** The permission the activation route (`PATCH /users/:id`) checks. */
export const USERS_EDIT_PERMISSION = "system.edit";
/** The permission `DELETE /users/:id` checks. */
export const USERS_DELETE_PERMISSION = "system.accounts";

/** How many of a login's parties the Name cell names before "+N more". */
const PARTIES_SHOWN = 2;

const ROLE_OPTIONS = USERS_ROLE_FACETS.map((role) => ({ value: role, label: USER_ROLE_META[role].label }));

type Single = { kind: StatusMove; row: UserRow } | null;
type SingleDelete = { row: UserRow; deletable: boolean; blockers: DeleteBlocker[] } | null;
type BulkMove = { move: StatusMove; plan: BulkPlan<UserRow>; keep: (rows: UserRow[]) => void } | null;
type BulkDelete = { plan: DeletePlan; keep: (rows: UserRow[]) => void } | null;

/** What the login holds, under the person's name: up to two links, then "+N more". */
export function UserPartiesLine({ row }: { row: UserRow }) {
    const parties = row.parties ?? [];
    if (parties.length === 0) return null;
    const shown = parties.slice(0, PARTIES_SHOWN);
    const rest = parties.slice(PARTIES_SHOWN);
    return (
        <p className="truncate text-[11px] text-muted-foreground" data-testid="user-parties">
            {shown.map((party, index) => (
                <React.Fragment key={`${party.kind}-${party.id}`}>
                    {index > 0 && ", "}
                    <Link href={userPartyHref(party, row.id)} className="underline-offset-4 hover:text-foreground hover:underline">
                        {USER_PARTY_LABEL[party.kind]} · {party.name}
                    </Link>
                </React.Fragment>
            ))}
            {rest.length > 0 && (
                <span title={rest.map((party) => `${USER_PARTY_LABEL[party.kind]} · ${party.name}`).join("\n")}>{` +${rest.length} more`}</span>
            )}
        </p>
    );
}

export function UsersView({ directory, facets, onFacetsChange, query, onQueryChange, invitesWaiting, roles, refreshing = false, onChanged }: UsersViewProps) {
    const router = useRouter();
    const { rows, counts, total } = directory;
    const viewerId = useOptionalAuth()?.user?.id ?? null;
    const canEdit = useRosterPermission(USERS_EDIT_PERMISSION);
    const canDelete = useRosterPermission(USERS_DELETE_PERMISSION);

    const [inviteOpen, setInviteOpen] = React.useState(false);
    const [createOpen, setCreateOpen] = React.useState(false);
    const [single, setSingle] = React.useState<Single>(null);
    const [checkingId, setCheckingId] = React.useState<string | null>(null);
    const [singleDelete, setSingleDelete] = React.useState<SingleDelete>(null);
    const [closing, setClosing] = React.useState<UserRow | null>(null);
    const [bulkMove, setBulkMove] = React.useState<BulkMove>(null);
    const [bulkDelete, setBulkDelete] = React.useState<BulkDelete>(null);
    const [checkingBulk, setCheckingBulk] = React.useState(false);
    const [busy, setBusy] = React.useState(false);

    const statusCounts = usersStatusCounts(counts);
    const filtered = facets.status !== DEFAULT_USERS_STATUS || facets.role !== null || query.trim() !== "";

    /* ---- one account ----------------------------------------------- */

    const askDelete = React.useCallback(async (row: UserRow) => {
        setCheckingId(row.id);
        try {
            const answer = await accountLifecycleService.deletable(row.id);
            setSingleDelete({ row, deletable: answer.deletable, blockers: answer.blockers });
        } catch (cause) {
            toast.error(`Couldn't check ${row.displayName}`, { description: failureMessage(cause) });
        } finally {
            setCheckingId(null);
        }
    }, []);

    const runSingle = async () => {
        if (!single) return;
        const { kind, row } = single;
        setBusy(true);
        try {
            await usersService.update(row.id, { isActive: kind === "reactivate" });
            toast.success(kind === "deactivate" ? `${row.displayName} deactivated. Every session ended.` : `${row.displayName} reactivated`);
            setSingle(null);
            onChanged();
        } catch (cause) {
            toast.error(failureMessage(cause));
        } finally {
            setBusy(false);
        }
    };

    const runSingleDelete = async () => {
        if (!singleDelete) return;
        const { row } = singleDelete;
        setBusy(true);
        try {
            await accountLifecycleService.deleteAccount(row.id);
            toast.success(`${row.displayName} deleted`, { description: "The account had no history, so nothing else changed." });
            setSingleDelete(null);
            onChanged();
        } catch (cause) {
            toast.error(`Can't delete ${row.displayName}`, { description: failureMessage(cause) });
            setSingleDelete(null);
        } finally {
            setBusy(false);
        }
    };

    /* ---- the selection --------------------------------------------- */

    const runBulkMove = async () => {
        if (!bulkMove) return;
        const { move, plan, keep } = bulkMove;
        setBusy(true);
        const outcome = await runEach(plan.apply, (row) => usersService.update(row.id, { isActive: move === "reactivate" }));
        announceResult(outcome);
        // The changed ones may leave this view on the reload; the failed ones stay ticked for another go.
        keep(outcome.failed.map((failure) => failure.row));
        setBusy(false);
        setBulkMove(null);
        onChanged();
    };

    const askBulkDelete = async (selected: UserRow[], keep: (rows: UserRow[]) => void) => {
        setCheckingBulk(true);
        try {
            const plan = await planDelete(selected, viewerId, (id) => accountLifecycleService.deletable(id));
            setBulkDelete({ plan, keep });
        } finally {
            setCheckingBulk(false);
        }
    };

    const runBulkDelete = async () => {
        if (!bulkDelete) return;
        const { plan, keep } = bulkDelete;
        setBusy(true);
        const outcome = await runEach(plan.deletable, (row) => accountLifecycleService.deleteAccount(row.id));
        announceResult(outcome);
        keep(outcome.failed.map((failure) => failure.row));
        setBusy(false);
        setBulkDelete(null);
        onChanged();
    };

    /* ---- the table ------------------------------------------------- */

    const menuOf = React.useCallback(
        (row: UserRow): RosterMenuEntry[] => {
            const own = viewerId !== null && row.id === viewerId;
            const status: RosterMenuEntry[] = [];
            if (canEdit && !own && row.status !== "closed") {
                status.push(
                    row.status === "active"
                        ? { kind: "item", label: "Deactivate", destructive: true, onSelect: () => setSingle({ kind: "deactivate", row }) }
                        : { kind: "item", label: "Reactivate", onSelect: () => setSingle({ kind: "reactivate", row }) },
                );
            }
            if (canDelete && !own) {
                status.push({ kind: "item", label: "Delete account…", destructive: true, disabled: checkingId === row.id, onSelect: () => void askDelete(row) });
            }
            return [
                { kind: "label", label: ROSTER_MENU_LABEL },
                { kind: "item", label: "View details", onSelect: () => router.push(`/users/${row.id}`) },
                ...(status.length > 0 ? ([{ kind: "separator" }] as RosterMenuEntry[]) : []),
                ...status,
            ];
        },
        [askDelete, canDelete, canEdit, checkingId, router, viewerId],
    );

    const columns = React.useMemo<ColumnDef<UserRow>[]>(
        () => [
            selectionColumn<UserRow>(),
            {
                id: "name",
                accessorFn: (row) => row.displayName,
                header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
                cell: ({ row }) => (
                    <PartyNameCell
                        name={row.original.displayName}
                        displayId={row.original.displayId ?? null}
                        idOwner="USER"
                        verified={false}
                        below={<UserPartiesLine row={row.original} />}
                    />
                ),
            },
            {
                id: "contact",
                accessorFn: (row) => `${row.mobile ?? ""} ${row.email ?? ""}`,
                header: "Contact",
                enableSorting: false,
                cell: ({ row }) => <PartyContactCell mobile={row.original.mobile} email={row.original.email} />,
            },
            {
                id: "roles",
                accessorFn: (row) => row.roles.join(" "),
                header: "Roles",
                enableSorting: false,
                cell: ({ row }) => (
                    <div className="flex flex-wrap gap-1">
                        {row.original.roles.map((role) => (
                            <span key={role} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                {USER_ROLE_META[role]?.label ?? role}
                            </span>
                        ))}
                    </div>
                ),
            },
            {
                id: "console-role",
                accessorFn: (row) => (row.roles.includes("ADMIN") ? (row.roleConfig?.name ?? "Super admin") : ""),
                header: "Console role",
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-muted-foreground">
                        {row.original.roles.includes("ADMIN") ? (row.original.roleConfig?.name ?? "Super admin") : "—"}
                    </span>
                ),
            },
            {
                id: "joined",
                accessorFn: (row) => row.createdAt,
                header: ({ column }) => <SortableHeader column={column}>Joined</SortableHeader>,
                cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(row.original.createdAt)}</span>,
            },
            {
                id: "last-active",
                accessorFn: (row) => row.lastLoginAt ?? "",
                header: ({ column }) => <SortableHeader column={column}>Last active</SortableHeader>,
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-muted-foreground">
                        {row.original.lastLoginAt ? formatDateTime(row.original.lastLoginAt) : "Never signed in"}
                    </span>
                ),
            },
            {
                id: "status",
                accessorFn: (row) => userRowState(row),
                header: ({ column }) => <SortableHeader column={column}>Status</SortableHeader>,
                cell: ({ row }) => {
                    const state = userRowState(row.original);
                    const meta = USER_STATE_PILL[state];
                    return (
                        <span title={meta.description} data-testid="account-state-pill" data-state={state}>
                            <StatusBadge status={meta} />
                        </span>
                    );
                },
            },
            {
                id: "actions",
                enableHiding: false,
                enableSorting: false,
                size: 48,
                cell: ({ row }) => <RosterRowMenu entries={menuOf(row.original)} />,
            },
        ],
        [menuOf],
    );

    const view: PartyRosterView<UserRow> = {
        rows,
        total,
        hasMore: false,
        loadingMore: false,
        moreError: null,
        loadMore: () => {},
        refreshing,
    };

    const filterBar = (
        <div className="flex flex-1 flex-wrap items-center gap-2" data-testid="users-filters">
            <RosterSearch value={query} onChange={onQueryChange} placeholder="Search name, business, ID, phone, email" />
            <RosterSelect
                label="Role"
                all="Any role"
                value={facets.role ?? ROSTER_ANY}
                options={ROLE_OPTIONS}
                onChange={(value) => onFacetsChange({ ...facets, role: roleFacetOf(value) })}
            />
            <StatusSelect
                options={USERS_STATUS_OPTIONS}
                value={facets.status}
                counts={statusCounts}
                onChange={(value) => onFacetsChange({ ...facets, status: isUsersStatusFacet(value) ? value : DEFAULT_USERS_STATUS })}
            />
            {filtered && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-9"
                    onClick={() => {
                        onQueryChange("");
                        onFacetsChange({ status: DEFAULT_USERS_STATUS, role: null });
                    }}
                >
                    <X className="mr-1 size-3.5" aria-hidden />
                    Clear
                </Button>
            )}
            {refreshing && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Updating" />}
        </div>
    );

    const bulkBar = (selected: UserRow[], _clear: () => void, keep: (rows: UserRow[]) => void) => {
        const deactivate = planStatusMove(selected, "deactivate", viewerId);
        const reactivate = planStatusMove(selected, "reactivate", viewerId);
        const deletable = selected.filter((row) => !viewerId || row.id !== viewerId).length;
        return (
            <>
                {canEdit && (
                    <>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 bg-card text-danger hover:text-danger"
                            disabled={busy || deactivate.apply.length === 0}
                            onClick={() => setBulkMove({ move: "deactivate", plan: deactivate, keep })}
                            data-testid="users-deactivate-selected"
                        >
                            Deactivate selected ({deactivate.apply.length})
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 bg-card"
                            disabled={busy || reactivate.apply.length === 0}
                            onClick={() => setBulkMove({ move: "reactivate", plan: reactivate, keep })}
                            data-testid="users-reactivate-selected"
                        >
                            Reactivate selected ({reactivate.apply.length})
                        </Button>
                    </>
                )}
                {canDelete && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 bg-card text-danger hover:text-danger"
                        disabled={busy || checkingBulk || deletable === 0}
                        onClick={() => void askBulkDelete(selected, keep)}
                        data-testid="users-delete-selected"
                    >
                        {checkingBulk ? "Checking…" : `Delete selected (${deletable})`}
                    </Button>
                )}
            </>
        );
    };

    const moveCount = bulkMove ? accountsCount(bulkMove.plan.apply.length) : "";
    const deleteCount = bulkDelete ? accountsCount(bulkDelete.plan.deletable.length) : "";

    return (
        <div className="space-y-5">
            <UsersNav />

            <PageHeader
                title="Users"
                subtitle={filtered ? `${total} match these filters` : `${accountsCount(total)} on the marketplace`}
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

            {/* The invitations themselves are on Admin users, where console access is managed: said here once, in a line, only when there are some. */}
            {invitesWaiting > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-2.5 text-sm" data-testid="users-invites-notice">
                    <span>
                        {invitesWaiting === 1 ? "1 invitation is waiting to be accepted" : `${invitesWaiting} invitations are waiting to be accepted`}
                    </span>
                    <Button variant="outline" size="sm" asChild>
                        <Link href="/users/admins#invitations">View</Link>
                    </Button>
                </div>
            )}

            <PartyRosterTable
                columns={columns}
                view={view}
                noun="account"
                filterBar={filterBar}
                onRowClick={(row) => router.push(`/users/${row.id}`)}
                getRowId={(row) => row.id}
                bulkActions={canEdit || canDelete ? bulkBar : undefined}
                emptyState={
                    <EmptyState
                        icon={Users}
                        title={filtered ? "No account matches" : "No accounts yet"}
                        description={filtered ? "Nobody matches these filters." : "Accounts appear here once people sign up or the desk creates them."}
                        action={
                            filtered ? (
                                <Button
                                    variant="outline"
                                    className="bg-card"
                                    onClick={() => {
                                        onQueryChange("");
                                        onFacetsChange({ status: DEFAULT_USERS_STATUS, role: null });
                                    }}
                                >
                                    Clear filters
                                </Button>
                            ) : undefined
                        }
                    />
                }
            />

            <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} roles={roles} onInvited={onChanged} />
            <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} roles={roles} onCreated={onChanged} />

            <ConfirmDialog
                open={single?.kind === "deactivate"}
                onOpenChange={(open) => !open && !busy && setSingle(null)}
                title={`Deactivate ${single?.row.displayName ?? ""}?`}
                description="Every session ends now and sign-in is refused until the account is reactivated. Nothing is deleted."
                confirmLabel="Deactivate"
                destructive
                busy={busy}
                onConfirm={() => void runSingle()}
            />
            <ConfirmDialog
                open={single?.kind === "reactivate"}
                onOpenChange={(open) => !open && !busy && setSingle(null)}
                title={`Reactivate ${single?.row.displayName ?? ""}?`}
                description="Sign-in is allowed again with the same details."
                confirmLabel="Reactivate"
                busy={busy}
                onConfirm={() => void runSingle()}
            />

            {singleDelete?.deletable && (
                <DeleteAccountConfirm
                    name={singleDelete.row.displayName}
                    open
                    onOpenChange={(open) => !open && !busy && setSingleDelete(null)}
                    busy={busy}
                    onConfirm={() => void runSingleDelete()}
                />
            )}
            {singleDelete && !singleDelete.deletable && (
                <DeleteBlockedDialog
                    name={singleDelete.row.displayName}
                    blockers={singleDelete.blockers}
                    open
                    onOpenChange={(open) => !open && setSingleDelete(null)}
                    onCloseInstead={singleDelete.row.status === "closed" ? undefined : () => setClosing(singleDelete.row)}
                />
            )}
            {closing && (
                <CloseAccountDialog
                    userId={closing.id}
                    name={closing.displayName}
                    open
                    onOpenChange={(open) => !open && setClosing(null)}
                    onChanged={onChanged}
                />
            )}

            <ConfirmDialog
                open={bulkMove !== null}
                onOpenChange={(open) => !open && !busy && setBulkMove(null)}
                title={bulkMove ? `${bulkMove.move === "deactivate" ? "Deactivate" : "Reactivate"} ${moveCount}?` : ""}
                description={
                    bulkMove
                        ? [
                              bulkMove.move === "deactivate"
                                  ? "Every session ends now and sign-in is refused until each account is reactivated. Nothing is deleted."
                                  : "Sign-in is allowed again with the same details.",
                              skippedSentence(bulkMove.plan),
                          ]
                              .filter(Boolean)
                              .join(" ")
                        : ""
                }
                confirmLabel={bulkMove ? `${bulkMove.move === "deactivate" ? "Deactivate" : "Reactivate"} ${moveCount}` : "Confirm"}
                destructive={bulkMove?.move === "deactivate"}
                disabled={!bulkMove || bulkMove.plan.apply.length === 0}
                busy={busy}
                onConfirm={() => void runBulkMove()}
            />

            <ConfirmDialog
                open={bulkDelete !== null}
                onOpenChange={(open) => !open && !busy && setBulkDelete(null)}
                title={bulkDelete && bulkDelete.plan.deletable.length > 0 ? `Delete ${deleteCount} permanently?` : "None of these can be deleted"}
                description={bulkDelete ? `${deletePlanLine(bulkDelete.plan)}${bulkDelete.plan.deletable.length > 0 ? " This can't be undone." : ""}` : ""}
                confirmLabel={bulkDelete && bulkDelete.plan.deletable.length > 0 ? `Delete ${deleteCount}` : "Delete"}
                destructive
                disabled={!bulkDelete || bulkDelete.plan.deletable.length === 0}
                busy={busy}
                onConfirm={() => void runBulkDelete()}
            >
                {bulkDelete && (
                    <div className="space-y-3 text-sm" data-testid="users-delete-plan">
                        {bulkDelete.plan.deletable.length > 0 && (
                            <div>
                                <p className="font-medium text-foreground">These have no history and will be deleted:</p>
                                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                                    {bulkDelete.plan.deletable.map((row) => (
                                        <li key={row.id}>{row.displayName}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {bulkDelete.plan.blocked.length > 0 && (
                            <div>
                                <p className="font-medium text-foreground">These have history, so they can&apos;t be deleted: close their accounts instead.</p>
                                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                                    {bulkDelete.plan.blocked.map(({ row, reason }) => (
                                        <li key={row.id}>
                                            {row.displayName}: {reason}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {bulkDelete.plan.ownSkipped && <p className="text-muted-foreground">Your own account is never deleted, so it was left out.</p>}
                    </div>
                )}
            </ConfirmDialog>
        </div>
    );
}
