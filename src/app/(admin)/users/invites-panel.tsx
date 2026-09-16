"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import type { RoleConfig } from "@/services/roles";
import { usersService, type Invite } from "@/services/users";

/**
 * Pending invitations — the panel the `Admin users` wireframe drew beside its
 * table, now over `GET /users/invites`.
 *
 * Open invitations can be resent (a new token, a new week; the old link
 * stops working) or revoked. An expired one can only be resent. Accepted
 * and revoked ones are history and are not listed: the account, or the
 * absence of one, says it.
 */

interface InvitesPanelProps {
    invites: Invite[];
    roles: RoleConfig[];
    onChanged: () => void;
}

export function InvitesPanel({ invites, roles, onChanged }: InvitesPanelProps) {
    const [busyId, setBusyId] = React.useState<string | null>(null);
    const pending = invites.filter((invite) => invite.status === "OPEN" || invite.status === "EXPIRED");
    const roleName = (id: string | null) => (id ? roles.find((role) => role.id === id)?.name ?? "Role" : "Super admin");

    const run = async (invite: Invite, action: "resend" | "revoke") => {
        setBusyId(invite.id);
        try {
            if (action === "resend") {
                await usersService.resendInvite(invite.id);
                toast.success(`Invitation resent to ${invite.email}`, { description: "A new link, valid for seven days." });
            } else {
                await usersService.revokeInvite(invite.id);
                toast.success(`Invitation to ${invite.email} revoked`);
            }
            onChanged();
        } catch (caught) {
            toast.error(caught instanceof ApiError ? caught.message : "Could not update the invitation.");
        } finally {
            setBusyId(null);
        }
    };

    return (
        <Card className="h-fit rounded-lg border-border shadow-none">
            <div className="border-b px-5 py-4">
                <h3 className="text-base font-semibold text-foreground">Pending invites</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">Expire automatically after 7 days</p>
            </div>
            {pending.length ? (
                <ul className="divide-y">
                    {pending.map((invite) => (
                        <li key={invite.id} className="px-5 py-3.5">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-foreground">{invite.email}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {roleName(invite.roleConfigId)} · {invite.method === "GOOGLE" ? "Google" : "Password"} ·{" "}
                                        {invite.status === "EXPIRED"
                                            ? `Expired ${formatDate(invite.expiresAt)}`
                                            : `Sent ${formatDate(invite.createdAt)}`}
                                    </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                    {invite.status === "EXPIRED" && (
                                        <StatusBadge status={{ label: "Expired", tone: "warning" }} />
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs"
                                        disabled={busyId === invite.id}
                                        onClick={() => void run(invite, "resend")}
                                    >
                                        Resend
                                    </Button>
                                    {invite.status === "OPEN" && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2 text-xs text-danger hover:text-danger"
                                            disabled={busyId === invite.id}
                                            onClick={() => void run(invite, "revoke")}
                                        >
                                            Revoke
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">No invitations waiting.</p>
            )}
        </Card>
    );
}
