"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { isLive } from "@/lib/api-config";
import { formatDateTime } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { accessService, grantState, type GrantView } from "@/services/access";

/**
 * Who currently has access to somebody else's account (D6).
 *
 * Every grant still open, platform-wide: which party lent it, to which agent,
 * for what, and until when — with the one thing ops can do about it, which
 * is withdraw it early. The code dies with the grant, so a withdrawn grant
 * cannot be scanned back into life. Read from the API only; with the API off
 * the page says so instead of inventing a history for somebody.
 */
export function AccessView() {
    const live = isLive("access");
    const resource = useApiResource<GrantView[]>(`access:open:${live}`, () => accessService.open());
    const [revoking, setRevoking] = React.useState<GrantView | null>(null);
    const [busy, setBusy] = React.useState(false);

    const revoke = async () => {
        if (!revoking) return;
        setBusy(true);
        try {
            await accessService.revoke(revoking.id);
            toast.success(`Access withdrawn from ${revoking.party}`, {
                description: "The code that opened it no longer resolves.",
            });
            setRevoking(null);
            resource.reload();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The withdrawal did not reach ADX.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-5">
            <PageHeader
                title="Access grants"
                subtitle="Every account an ADX agent can currently act on, and the authority they hold to do it"
            />

            {!live ? (
                <Card className="rounded-lg border-border p-5 shadow-none">
                    <p className="text-sm text-muted-foreground">
                        Grants are read from the API, and the console is not connected to it. Turn the API
                        on to see who has access right now.
                    </p>
                </Card>
            ) : (
                <ResourceBoundary resource={resource}>
                    {(grants) => (
                        <SimpleTable<GrantView>
                            rows={grants}
                            rowKey={(grant) => grant.id}
                            emptyMessage="Nobody holds access to anyone's account right now."
                            columns={[
                                {
                                    key: "party",
                                    label: "Account",
                                    render: (grant) => (
                                        <div className="min-w-0">
                                            <p className="font-medium text-foreground">{grant.party}</p>
                                            <p className="truncate text-xs text-muted-foreground">
                                                {grant.purpose} · {grant.scope}
                                            </p>
                                        </div>
                                    ),
                                },
                                {
                                    key: "agent",
                                    label: "Agent",
                                    render: (grant) => (
                                        <Link
                                            href={`/agents/${grant.agentId}`}
                                            className="font-mono text-xs text-foreground underline-offset-4 hover:underline"
                                        >
                                            {grant.agentId}
                                        </Link>
                                    ),
                                },
                                {
                                    key: "reason",
                                    label: "Asked for",
                                    render: (grant) => (
                                        <span className="text-muted-foreground">“{grant.reason}”</span>
                                    ),
                                },
                                {
                                    key: "window",
                                    label: "Window",
                                    render: (grant) => (
                                        <span className="text-muted-foreground">
                                            {formatDateTime(grant.from)}
                                            {grant.until ? ` → ${formatDateTime(grant.until)}` : ""}
                                        </span>
                                    ),
                                },
                                {
                                    key: "status",
                                    label: "Status",
                                    render: (grant) => <StatusBadge status={grantState(grant.status)} />,
                                },
                                {
                                    key: "revoke",
                                    label: "",
                                    render: (grant) =>
                                        grant.canRevoke ? (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 px-2 text-xs text-danger hover:text-danger"
                                                onClick={() => setRevoking(grant)}
                                            >
                                                Withdraw
                                            </Button>
                                        ) : null,
                                },
                            ]}
                        />
                    )}
                </ResourceBoundary>
            )}

            <ConfirmDialog
                open={revoking !== null}
                onOpenChange={(open) => !open && setRevoking(null)}
                title="Withdraw this access?"
                description={
                    revoking
                        ? `The agent loses access to ${revoking.party} now, and the code that opened it stops resolving. The account's owner sees the withdrawal in their own record.`
                        : ""
                }
                confirmLabel="Withdraw access"
                destructive
                busy={busy}
                onConfirm={revoke}
            />
        </div>
    );
}
