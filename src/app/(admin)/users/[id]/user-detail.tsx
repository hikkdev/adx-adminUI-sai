"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronLeft, Eye, KeyRound, Monitor, MoreHorizontal, Pencil, QrCode, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClosedBanner } from "@/components/adx/account-closure";
import { CloseAccountDialog } from "@/components/adx/close-account-dialog";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { SectionCard } from "@/components/adx/section-card";
import { FieldList } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { PUBLISHER_READS, ViewAs, type ViewAsRead } from "@/components/adx/view-as-panel";
import { ApiError } from "@/lib/api-client";
import { formatDate, formatDateTime } from "@/lib/format";
import { QR_TYPE_LABEL, scanOutcomeMeta, type ScanByRow } from "@/services/qr";
import type { RoleConfig } from "@/services/roles";
import {
    ERASURE_STATUS_META,
    ERASURE_VIA_LABEL,
    PARTY_LINKS,
    USERS_ROLE_FACETS,
    USER_STATUS_META,
    displayNameOf,
    dueLabel,
    dueTone,
    twoFactorLabel,
    twoFactorResetClears,
    userStatusOf,
    usersService,
    type ErasureRequest,
    type UsersRoleFacet,
    type WireActivity,
    type WireContacts,
    type WireSession,
    type WireUserDetail,
} from "@/services/users";
import { USER_ROLE_META } from "@/types";
import { EditUserDialog } from "../edit-user-dialog";
import { ContactsCard } from "./contacts-card";

/**
 * One account — the DR 10 frame `User · /users/usr_001`, rebuilt as a
 * manageable page (K-B1; the owner, 14 September: "next to impossible to
 * edit a user as super admin, add or remove emails, phone numbers etc.").
 *
 * The frame's header (avatar, name, status, email · mobile, actions on the
 * right) and its two-column body are kept. The header now carries the ids,
 * the state chips and a link to every party this person is (`parties` off
 * the detail read). The left column is the Identity card with its Edit
 * dialog (`PATCH /users/:id`, the diff only), the Contacts card ("Emails &
 * phone numbers", every move a route under `/users/:id/contacts`), the
 * Activity card (`GET /users/:id/activity`) and the QR scans card (`GET
 * /qr/scans?scannedById=`). The right column is the Access card: the
 * console role, the roles held (with Grant — `POST /users/roles`; no route
 * takes one away), the second factor with Reset (Lot K2: the factor the
 * next sign-in asks for — the app, with its enrolment date and unused
 * recovery codes, or SMS — and the reset names what it clears), the open
 * sessions, and the account moves — Reset password, Deactivate /
 * Reactivate, Close account, and the read-only View as for a party.
 *
 * The sessions list has no Revoke: there is no admin route that ends
 * somebody else's session short of deactivating the account. The frame's
 * payroll card was a deterministic fixture and is not drawn.
 */

/** The picker's value for "no role", which `PUT` takes as `null`. */
const NO_ROLE = "__none__";

/** What each party sees, read through the view-as token. */
const ADVERTISER_READS: readonly ViewAsRead[] = [{ title: "Profile · GET /advertisers/me", path: "/advertisers/me" }];
const AGENT_READS: readonly ViewAsRead[] = [
    { title: "Profile · GET /agents/me", path: "/agents/me" },
    { title: "Tier · GET /agents/me/tier", path: "/agents/me/tier" },
];
const PRINT_PARTNER_READS: readonly ViewAsRead[] = [
    { title: "Profile · GET /print-partners/me", path: "/print-partners/me" },
    { title: "Earnings · GET /print-partners/me/earnings/summary", path: "/print-partners/me/earnings/summary" },
];

export interface UserDetailProps {
    user: WireUserDetail;
    sessions: WireSession[] | null;
    activity: WireActivity[] | null;
    contacts: WireContacts | null;
    scans: ScanByRow[] | null;
    erasure: ErasureRequest | null;
    /** Roles for the console-role picker; empty when the roles domain is off or the read failed. */
    roles: RoleConfig[];
    onChanged: () => void;
}

type Confirm = "reset-2fa" | "reset-password" | "deactivate" | "reactivate";

const message = (caught: unknown, fallback: string) => (caught instanceof ApiError ? caught.message : fallback);

/** "Signed in", "Listed a site" — the audit action as a sentence fragment. */
function activityLabel(action: string): string {
    const words = action.toLowerCase().replace(/_/g, " ");
    return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The party the read-only view-as looks through, and what it reads — the first party the account holds. */
function viewAsOf(user: WireUserDetail): { partyName: string; reads: readonly ViewAsRead[] } | null {
    if (user.roles.includes("ADMIN")) return null;
    const { publisher, advertiser, agent, printPartner } = user.parties;
    if (publisher) return { partyName: "publisher", reads: PUBLISHER_READS };
    if (advertiser) return { partyName: "advertiser", reads: ADVERTISER_READS };
    if (agent) return { partyName: "agent", reads: AGENT_READS };
    if (printPartner) return { partyName: "print partner", reads: PRINT_PARTNER_READS };
    return null;
}

export function UserDetail({ user, sessions, activity, contacts, scans, erasure, roles, onChanged }: UserDetailProps) {
    const name = displayNameOf(user);
    const isAdmin = user.roles.includes("ADMIN");
    const status = userStatusOf(user);
    const closed = Boolean(user.closedAt);

    const [confirm, setConfirm] = React.useState<Confirm | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [editing, setEditing] = React.useState(false);
    const [closing, setClosing] = React.useState(false);
    /** The seeded role picked for a grant, confirmed before `POST /users/roles`. */
    const [granting, setGranting] = React.useState<UsersRoleFacet | null>(null);

    const run = async (action: Confirm) => {
        setBusy(true);
        try {
            if (action === "reset-2fa") {
                const result = await usersService.resetTwoFactor(user.id);
                toast.success(result?.message ?? `Second factor reset for ${name}`);
            } else if (action === "reset-password") {
                const result = await usersService.resetPassword(user.id);
                toast.success(result?.message ?? `Reset link sent to ${user.email}`);
            } else {
                await usersService.update(user.id, { isActive: action === "reactivate" });
                toast.success(action === "deactivate" ? `${name} deactivated — every session ended` : `${name} reactivated`);
            }
            setConfirm(null);
            onChanged();
        } catch (caught) {
            toast.error(message(caught, "Could not update the account."));
        } finally {
            setBusy(false);
        }
    };

    const assign = async (value: string) => {
        const roleConfigId = value === NO_ROLE ? null : value;
        if ((user.roleConfig?.id ?? null) === roleConfigId) return;
        setBusy(true);
        try {
            const result = await usersService.setRoleConfig(user.id, roleConfigId);
            toast.success(
                result.roleConfig ? `${name} now holds ${result.roleConfig.name}` : `${name} holds no role — every permission, under the launch rule`,
            );
            onChanged();
        } catch (caught) {
            toast.error(message(caught, "Could not change the role."));
        } finally {
            setBusy(false);
        }
    };

    const grant = async () => {
        if (!granting) return;
        setBusy(true);
        try {
            const result = await usersService.grantRole(user.id, granting);
            toast.success(result?.message ?? `${name} now holds ${USER_ROLE_META[granting].label}`, {
                description: "Every session ended — the roles ride in the token.",
            });
            setGranting(null);
            onChanged();
        } catch (caught) {
            toast.error(message(caught, "Could not grant the role."));
        } finally {
            setBusy(false);
        }
    };

    const grantable = USERS_ROLE_FACETS.filter((role) => !user.roles.includes(role));

    const parties = PARTY_LINKS.flatMap((link) => {
        const party = user.parties[link.key];
        return party ? [{ ...link, party }] : [];
    });
    const viewAs = viewAsOf(user);

    return (
        <div className="space-y-5">
            {closed && <ClosedBanner closed={user} name={name} />}
            <div>
                <Link href="/users/accounts" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
                    <ChevronLeft className="size-4" />
                    Users
                </Link>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <InitialsAvatar name={name} size="lg" />
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2.5">
                                <h1 className="text-2xl font-semibold tracking-tight text-foreground">{name}</h1>
                                <StatusBadge status={USER_STATUS_META[status]} />
                                {isAdmin && <StatusBadge status={{ label: user.roleConfig?.name ?? "Super admin", tone: "info" }} />}
                                {user.twoFactorRequiredAt && <StatusBadge status={{ label: "2FA on", tone: "success" }} />}
                                {user.roles
                                    .filter((role) => role !== "ADMIN")
                                    .map((role) => (
                                        <StatusBadge key={role} status={{ label: USER_ROLE_META[role]?.label ?? role, tone: "neutral" }} />
                                    ))}
                            </div>
                            <p className="mt-0.5 text-sm text-muted-foreground">{[user.email, user.mobile].filter(Boolean).join(" · ")}</p>
                            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                                {user.id}
                                {parties.map((link) => (link.party.displayId ? ` · ${link.party.displayId}` : "")).join("")}
                            </p>
                            {parties.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {parties.map((link) => (
                                        <Link
                                            key={link.key}
                                            href={link.href(link.party.id)}
                                            className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-0.5 text-xs font-medium text-foreground hover:bg-muted"
                                        >
                                            {link.label}
                                            {link.party.displayId && <span className="font-mono text-muted-foreground">{link.party.displayId}</span>}
                                            <ArrowUpRight className="size-3" />
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {!closed && (
                            <Button variant="outline" className="bg-card" onClick={() => setEditing(true)} disabled={busy}>
                                <Pencil className="size-4" />
                                Edit
                            </Button>
                        )}
                        {!closed && (
                            <Button
                                variant="outline"
                                className="bg-card"
                                onClick={() => setConfirm("reset-password")}
                                disabled={busy || !user.email}
                                title={user.email ? undefined : "No email on file to send a link to"}
                            >
                                <KeyRound className="size-4" />
                                Reset password
                            </Button>
                        )}
                        <ViewAs userId={viewAs && status === "active" ? user.id : null} partyName={name} reads={viewAs?.reads ?? PUBLISHER_READS}>
                            {({ start }) => (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" size="icon" className="size-9 bg-card" disabled={busy}>
                                            <MoreHorizontal className="size-4" />
                                            <span className="sr-only">More actions</span>
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        {viewAs && (
                                            <DropdownMenuItem disabled={!start} onSelect={() => start?.()}>
                                                <Eye className="size-4" />
                                                View as {viewAs.partyName} (read-only)
                                            </DropdownMenuItem>
                                        )}
                                        {isAdmin && (
                                            <DropdownMenuItem onSelect={() => setConfirm("reset-2fa")}>
                                                <ShieldCheck className="size-4" />
                                                Reset 2FA
                                            </DropdownMenuItem>
                                        )}
                                        {status === "active" && (
                                            <DropdownMenuItem onSelect={() => setConfirm("deactivate")}>Deactivate</DropdownMenuItem>
                                        )}
                                        {status === "deactivated" && (
                                            <DropdownMenuItem onSelect={() => setConfirm("reactivate")}>Reactivate</DropdownMenuItem>
                                        )}
                                        {!closed && (
                                            <>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => setClosing(true)}>
                                                    Close account
                                                </DropdownMenuItem>
                                            </>
                                        )}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </ViewAs>
                    </div>
                </div>
            </div>

            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
                <div className="min-w-0 space-y-4">
                    <SectionCard
                        title="Identity"
                        description="The profile as the account holds it"
                        actions={
                            !closed && (
                                <Button variant="outline" size="sm" className="h-8 bg-card" onClick={() => setEditing(true)} disabled={busy}>
                                    <Pencil className="size-4" />
                                    Edit
                                </Button>
                            )
                        }
                    >
                        <FieldList
                            items={[
                                ["Name", user.name ?? "—"],
                                ["Mobile", user.mobile],
                                ["Email", user.email ?? "—"],
                                ["Language", user.language ?? "—"],
                                [
                                    "Avatar",
                                    user.avatarUrl ? (
                                        <a href={user.avatarUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                                            {user.avatarUrl}
                                        </a>
                                    ) : (
                                        "—"
                                    ),
                                ],
                                ["Password", user.hasPassword ? "Set" : "None — signs in with OTP or Google"],
                                ["Joined", formatDate(user.createdAt)],
                                ["Last active", user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Never signed in"],
                                ...(user.closedAt
                                    ? ([
                                          ["Closed", formatDateTime(user.closedAt)],
                                          ["Reason", user.closeReason ?? "—"],
                                      ] as [string, React.ReactNode][])
                                    : []),
                            ]}
                        />
                    </SectionCard>

                    <ContactsCard userId={user.id} name={name} contacts={contacts} closed={closed} onChanged={onChanged} />

                    {erasure && (
                        <SectionCard
                            title="Erasure request"
                            description="The open request against this account; decided under Users → Erasure requests"
                            actions={
                                <Link href="/users/erasure" className="text-sm underline underline-offset-4">
                                    Open the queue
                                </Link>
                            }
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                <StatusBadge status={ERASURE_STATUS_META[erasure.status]} />
                                <StatusBadge status={{ label: dueLabel(erasure), tone: dueTone(erasure) }} />
                            </div>
                            <FieldList
                                className="mt-3"
                                items={[
                                    ["Asked", `${formatDateTime(erasure.requestedAt)} · ${ERASURE_VIA_LABEL[erasure.requestedVia]}`],
                                    ["Due", formatDate(erasure.dueAt)],
                                    ["Reason", erasure.reason ?? "—"],
                                    ...(erasure.dpoName ? ([["DPO", erasure.dpoName]] as [string, React.ReactNode][]) : []),
                                ]}
                            />
                        </SectionCard>
                    )}

                    <SectionCard title="Activity" description="What the account and the desk have done to it, newest first" contentClassName="px-5 py-1">
                        {activity === null ? (
                            <p className="py-3 text-sm text-muted-foreground">The activity log could not be read just now.</p>
                        ) : activity.length === 0 ? (
                            <p className="py-3 text-sm text-muted-foreground">Nothing recorded yet.</p>
                        ) : (
                            <ul className="divide-y">
                                {activity.map((entry) => (
                                    <li key={entry.id} className="flex items-start gap-4 py-3">
                                        <span className="w-32 shrink-0 text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</span>
                                        <span className="min-w-0">
                                            <span className="block text-sm font-medium text-foreground">{activityLabel(entry.action)}</span>
                                            <span className="block truncate text-xs text-muted-foreground">
                                                {[entry.module, entry.targetType && entry.targetId ? `${entry.targetType} ${entry.targetId}` : null, entry.userAgent]
                                                    .filter(Boolean)
                                                    .join(" · ")}
                                            </span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </SectionCard>

                    <SectionCard
                        title="QR scans"
                        description="Every code this person has scanned, refusals included"
                        actions={
                            <Link
                                href={`/qr/scans?scannedById=${encodeURIComponent(user.id)}`}
                                className="inline-flex items-center gap-1 text-sm underline underline-offset-4"
                            >
                                <QrCode className="size-4" />
                                Open at the QR desk
                            </Link>
                        }
                        contentClassName="px-5 py-1"
                    >
                        {scans === null ? (
                            <p className="py-3 text-sm text-muted-foreground">The scans could not be read just now.</p>
                        ) : scans.length === 0 ? (
                            <p className="py-3 text-sm text-muted-foreground">Nothing scanned yet.</p>
                        ) : (
                            <ul className="divide-y">
                                {scans.slice(0, 10).map((scan) => (
                                    <li key={scan.id} className="flex items-center gap-4 py-3">
                                        <span className="w-32 shrink-0 text-xs text-muted-foreground">{formatDateTime(scan.createdAt)}</span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm font-medium text-foreground">
                                                {QR_TYPE_LABEL[scan.qr.type] ?? scan.qr.type} · {scan.action ?? "scan"}
                                            </span>
                                            <span className="block truncate font-mono text-xs text-muted-foreground">
                                                {scan.qr.refId} · code {scan.qr.id}
                                            </span>
                                        </span>
                                        <StatusBadge status={scanOutcomeMeta(scan.outcome)} />
                                    </li>
                                ))}
                                {scans.length > 10 && (
                                    <li className="py-3 text-xs text-muted-foreground">{scans.length - 10} more at the QR desk.</li>
                                )}
                            </ul>
                        )}
                    </SectionCard>
                </div>

                <div className="space-y-4">
                    <SectionCard title="Access" description="What this person can do, and where they are signed in">
                        <div className="space-y-5">
                            {isAdmin && (
                                <div>
                                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Console role</p>
                                    <Select value={user.roleConfig?.id ?? NO_ROLE} onValueChange={(value) => void assign(value)} disabled={busy || closed}>
                                        <SelectTrigger aria-label="Console role" className="mt-1.5">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={NO_ROLE}>Super admin (no role — every permission)</SelectItem>
                                            {roles.map((role) => (
                                                <SelectItem key={role.id} value={role.id}>
                                                    {role.name}
                                                </SelectItem>
                                            ))}
                                            {/* A role the list does not know — kept selectable so the value still shows. */}
                                            {user.roleConfig && !roles.some((role) => role.id === user.roleConfig?.id) && (
                                                <SelectItem value={user.roleConfig.id}>{user.roleConfig.name}</SelectItem>
                                            )}
                                        </SelectContent>
                                    </Select>
                                    <p className="mt-1.5 text-xs text-muted-foreground">
                                        Every operator is a Super admin until per-module enforcement is switched on. The system super-admin role is
                                        granted only by a super admin, and its last member cannot be moved off it.
                                    </p>
                                </div>
                            )}

                            <div>
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Roles held</p>
                                <ul className="mt-1.5 divide-y rounded-md border">
                                    {user.roles.map((role) => (
                                        <li key={role} className="px-3 py-2">
                                            <p className="text-sm font-medium text-foreground">{USER_ROLE_META[role]?.label ?? role}</p>
                                            <p className="text-xs text-muted-foreground">{USER_ROLE_META[role]?.description ?? ""}</p>
                                        </li>
                                    ))}
                                    {user.roles.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No roles.</li>}
                                </ul>
                                {!closed && grantable.length > 0 && (
                                    <>
                                        <Select value="" onValueChange={(value) => setGranting(value as UsersRoleFacet)} disabled={busy}>
                                            <SelectTrigger aria-label="Grant a role" className="mt-1.5">
                                                <SelectValue placeholder="Grant a role…" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {grantable.map((role) => (
                                                    <SelectItem key={role} value={role}>
                                                        {USER_ROLE_META[role].label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="mt-1.5 text-xs text-muted-foreground">
                                            A grant ends every session. No route takes a role away; deactivate or close the account instead.
                                        </p>
                                    </>
                                )}
                            </div>

                            <div>
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Second factor</p>
                                <div className="mt-1.5 flex items-start justify-between gap-3 rounded-md border px-3 py-2">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-foreground">
                                            {twoFactorLabel(user.twoFactor) === "Authenticator"
                                                ? "Authenticator app"
                                                : user.twoFactorRequiredAt
                                                  ? `SMS · on since ${formatDate(user.twoFactorRequiredAt)}`
                                                  : isAdmin
                                                    ? "Required on every admin sign-in"
                                                    : "Not required"}
                                        </p>
                                        {user.twoFactor?.method === "AUTHENTICATOR" ? (
                                            <p className="text-xs text-muted-foreground" data-testid="authenticator-summary">
                                                {user.twoFactor.enrolledAt ? `Enrolled ${formatDate(user.twoFactor.enrolledAt)} · ` : ""}
                                                {user.twoFactor.recoveryCodesLeft} recovery {user.twoFactor.recoveryCodesLeft === 1 ? "code" : "codes"} left
                                                {user.email ? ` · SMS to ${user.mobile} and email backup as the policy allows` : ` · SMS to ${user.mobile} as the policy allows`}
                                            </p>
                                        ) : (
                                            <p className="text-xs text-muted-foreground">
                                                {isAdmin
                                                    ? user.email
                                                        ? `SMS to ${user.mobile}; email backup to ${user.email}, three uses in thirty days. No authenticator app enrolled.`
                                                        : `SMS to ${user.mobile}; no email on file, so no backup channel. No authenticator app enrolled.`
                                                    : "A code to the phone at sign-in; the second factor is an admin rule"}
                                            </p>
                                        )}
                                    </div>
                                    {isAdmin && !closed && (
                                        <Button variant="outline" size="sm" className="h-8 shrink-0 bg-card" onClick={() => setConfirm("reset-2fa")} disabled={busy}>
                                            Reset
                                        </Button>
                                    )}
                                </div>
                            </div>

                            <div>
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Sessions{sessions ? ` · ${sessions.length} signed in` : ""}
                                </p>
                                {sessions === null ? (
                                    <p className="mt-1.5 text-sm text-muted-foreground">The sessions could not be read just now.</p>
                                ) : sessions.length === 0 ? (
                                    <p className="mt-1.5 text-sm text-muted-foreground">Not signed in anywhere.</p>
                                ) : (
                                    <ul className="mt-1.5 divide-y rounded-md border">
                                        {sessions.map((session) => (
                                            <li key={session.id} className="flex items-center gap-3 px-3 py-2">
                                                <Monitor className="size-4 shrink-0 text-muted-foreground" />
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium text-foreground">{session.userAgent ?? "Unknown device"}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {[
                                                            session.ipAddress,
                                                            session.lastUsedAt ? `Last used ${formatDateTime(session.lastUsedAt)}` : `Since ${formatDateTime(session.createdAt)}`,
                                                        ]
                                                            .filter(Boolean)
                                                            .join(" · ")}
                                                    </p>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {sessions && sessions.length > 0 && (
                                    <p className="mt-1.5 text-xs text-muted-foreground">
                                        No route ends one of somebody else's sessions; deactivating the account ends them all.
                                    </p>
                                )}
                            </div>

                            {!closed && (
                                <div className="flex flex-wrap gap-2 border-t pt-4">
                                    <Button variant="outline" size="sm" className="h-8 bg-card" onClick={() => setConfirm("reset-password")} disabled={busy || !user.email}>
                                        <KeyRound className="size-4" />
                                        Reset password
                                    </Button>
                                    {status === "active" && (
                                        <Button variant="outline" size="sm" className="h-8 bg-card" onClick={() => setConfirm("deactivate")} disabled={busy}>
                                            Deactivate
                                        </Button>
                                    )}
                                    {status === "deactivated" && (
                                        <Button variant="outline" size="sm" className="h-8 bg-card" onClick={() => setConfirm("reactivate")} disabled={busy}>
                                            Reactivate
                                        </Button>
                                    )}
                                    <Button variant="outline" size="sm" className="h-8 bg-card text-danger hover:text-danger" onClick={() => setClosing(true)} disabled={busy}>
                                        Close account
                                    </Button>
                                </div>
                            )}
                        </div>
                    </SectionCard>
                </div>
            </div>

            <EditUserDialog user={user} open={editing} onOpenChange={setEditing} onSaved={onChanged} />

            <ConfirmDialog
                open={confirm === "reset-password"}
                onOpenChange={(open) => !open && setConfirm(null)}
                title={`Send ${name} a password reset link?`}
                description={`The ordinary reset email goes to ${user.email ?? "their address"}. Their password is unchanged until they use it, and the send is recorded against the account.`}
                confirmLabel="Send reset link"
                busy={busy}
                onConfirm={() => void run("reset-password")}
            />
            <ConfirmDialog
                open={confirm === "reset-2fa"}
                onOpenChange={(open) => !open && setConfirm(null)}
                title={`Reset 2FA for ${name}?`}
                description="Their next sign-in asks for a code to the phone again. The phone is unchanged. This clears:"
                confirmLabel="Reset 2FA"
                busy={busy}
                onConfirm={() => void run("reset-2fa")}
            >
                <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                    {twoFactorResetClears(user.twoFactor).map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            </ConfirmDialog>
            <ConfirmDialog
                open={confirm === "deactivate"}
                onOpenChange={(open) => !open && setConfirm(null)}
                title={`Deactivate ${name}?`}
                description="Every session ends now and sign-in is refused until the account is reactivated. Nothing is deleted."
                confirmLabel="Deactivate"
                destructive
                busy={busy}
                onConfirm={() => void run("deactivate")}
            />
            <ConfirmDialog
                open={confirm === "reactivate"}
                onOpenChange={(open) => !open && setConfirm(null)}
                title={`Reactivate ${name}?`}
                description="Sign-in is allowed again with the same credentials."
                confirmLabel="Reactivate"
                busy={busy}
                onConfirm={() => void run("reactivate")}
            />
            <ConfirmDialog
                open={granting !== null}
                onOpenChange={(open) => !open && setGranting(null)}
                title={granting ? `Grant ${name} the ${USER_ROLE_META[granting].label} role?` : ""}
                description={
                    granting === "ADMIN"
                        ? "Every session ends now, since the roles ride in the token, and the second factor is switched on for the account. Nothing takes a role away again."
                        : granting === "AGENT_PUBLISHER" || granting === "AGENT_ADVERTISER"
                          ? "Every session ends now, since the roles ride in the token, and an agent profile is made for the account. Nothing takes a role away again."
                          : "Every session ends now, since the roles ride in the token. Nothing takes a role away again."
                }
                confirmLabel="Grant role"
                busy={busy}
                onConfirm={() => void grant()}
            />
            <CloseAccountDialog userId={user.id} name={name} open={closing} onOpenChange={setClosing} onChanged={onChanged} />
        </div>
    );
}
