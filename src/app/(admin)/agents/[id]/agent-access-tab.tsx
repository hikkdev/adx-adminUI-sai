"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime } from "@/lib/format";
import { accessService, grantState, type GrantView, type ScanView } from "@/services/access";

/**
 * What one agent holds and has scanned (D6).
 *
 * Two tables: every grant the agent has ever been given — which account,
 * for what, until when, and whether ops can still withdraw it — and every
 * scan they have made, refusals included, because a refused scan is the
 * interesting kind. Null props mean the API is off, and the tab says so.
 */
export function AgentAccessTab({
    grants,
    scans,
    onChanged,
}: {
    grants: GrantView[] | null;
    scans: ScanView[] | null;
    onChanged?: () => void;
}) {
    const [revoking, setRevoking] = React.useState<GrantView | null>(null);
    const [busy, setBusy] = React.useState(false);

    if (grants === null || scans === null) {
        return (
            <Card className="rounded-lg border-border p-5 shadow-none">
                <p className="text-sm text-muted-foreground">
                    Grants and scans are read from the API, and the console is not connected to it. Turn
                    the API on to see what this agent holds.
                </p>
            </Card>
        );
    }

    const revoke = async () => {
        if (!revoking) return;
        setBusy(true);
        try {
            await accessService.revoke(revoking.id);
            toast.success(`Access withdrawn from ${revoking.party}`);
            setRevoking(null);
            onChanged?.();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The withdrawal did not reach ADX.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <h3 className="text-base font-semibold text-foreground">Grants held</h3>
                <SimpleTable<GrantView>
                    rows={grants}
                    rowKey={(grant) => grant.id}
                    emptyMessage="This agent has never been given access to anyone's account."
                    columns={[
                        {
                            key: "party",
                            label: "Account",
                            render: (grant) => (
                                <div className="min-w-0">
                                    <p className="font-medium text-foreground">{grant.party}</p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {grant.purpose} · {grant.scope} · “{grant.reason}”
                                    </p>
                                </div>
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
            </div>

            <div className="space-y-2">
                <h3 className="text-base font-semibold text-foreground">Scans made</h3>
                <p className="text-sm text-muted-foreground">
                    Every code this agent has pointed their phone at, refusals included.
                </p>
                <SimpleTable<ScanView>
                    rows={scans}
                    rowKey={(scan) => scan.id}
                    emptyMessage="No scans recorded for this agent."
                    columns={[
                        {
                            key: "at",
                            label: "When",
                            render: (scan) => <span className="text-muted-foreground">{formatDateTime(scan.at)}</span>,
                        },
                        { key: "code", label: "Code", render: (scan) => <span className="font-mono text-xs">{scan.code}</span> },
                        {
                            key: "outcome",
                            label: "Outcome",
                            render: (scan) => (
                                <StatusBadge status={{ label: scan.outcome, tone: scan.refused ? "danger" : "success" }} />
                            ),
                        },
                        {
                            key: "distance",
                            label: "Distance",
                            render: (scan) => <span className="text-muted-foreground">{scan.distance ?? "—"}</span>,
                        },
                    ]}
                />
            </div>

            <ConfirmDialog
                open={revoking !== null}
                onOpenChange={(open) => !open && setRevoking(null)}
                title="Withdraw this access?"
                description={
                    revoking
                        ? `The agent loses access to ${revoking.party} now, and the code that opened it stops resolving.`
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
