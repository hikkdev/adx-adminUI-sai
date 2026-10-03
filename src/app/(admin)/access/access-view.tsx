"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { DataTable } from "@/components/adx/data-table";
import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { StatusBadge } from "@/components/adx/status-badge";
import { isLive } from "@/lib/api-config";
import { runEach } from "@/lib/bulk";
import { formatDateTime } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { accessService, grantState, type GrantView } from "@/services/access";

/** "1 account" / "3 accounts". */
const accounts = (count: number) => `${count} ${count === 1 ? "account" : "accounts"}`;

/** The toast a bulk withdrawal ends with: "3 withdrawn", or "2 withdrawn, 1 failed — try those again". */
export function withdrawSummary(done: number, failed: number): string {
    return failed === 0 ? `${done} withdrawn` : `${done} withdrawn, ${failed} failed — try those again`;
}

interface PendingBulk {
    /** The grants the run works on, held so the dialog's count does not move while it runs. */
    rows: GrantView[];
    /** The table's own selection, narrowed to the grants that failed once the run is over. */
    keep: (rows: GrantView[]) => void;
}

/**
 * Who currently has access to somebody else's account (D6).
 *
 * Every grant still open, platform-wide: which party lent it, to which agent,
 * for what, and until when — with the one thing ops can do about it, which
 * is withdraw it early. The code dies with the grant, so a withdrawn grant
 * cannot be scanned back into life. Read from the API only; with the API off
 * the page says so instead of inventing a history for somebody.
 *
 * 2 Oct 2026: the console's one list layout — search, Columns, row checkboxes
 * and a bulk bar — in place of a bare table. Bulk withdraw is for an agent who
 * leaves or loses their phone: every grant they hold goes at once. There is no
 * bulk route, so it is the single withdrawal called once per grant (each its
 * own permission check and audit row); the grants that fail stay ticked.
 */
export function AccessView() {
    const live = isLive("access");
    const resource = useApiResource<GrantView[]>(`access:open:${live}`, () => accessService.open());
    const [revoking, setRevoking] = React.useState<GrantView | null>(null);
    const [bulk, setBulk] = React.useState<PendingBulk | null>(null);
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

    const revokeAll = async () => {
        if (!bulk || bulk.rows.length === 0) return;
        setBusy(true);
        // Never throws: every grant lands in done or failed, with what the API said.
        const outcome = await runEach(bulk.rows, (grant) => accessService.revoke(grant.id));
        const title = withdrawSummary(outcome.done.length, outcome.failed.length);
        if (outcome.failed.length === 0) {
            toast.success(title);
        } else {
            const description = outcome.failed.map((failure) => `${failure.row.party} — ${failure.message}`).join("\n");
            const options = { description, classNames: { description: "whitespace-pre-line" }, duration: 12_000 };
            if (outcome.done.length === 0) toast.error(title, options);
            else toast.warning(title, options);
        }
        // The withdrawn grants leave the list on the reload; the failed ones stay ticked for another go.
        bulk.keep(outcome.failed.map((failure) => failure.row));
        setBusy(false);
        setBulk(null);
        resource.reload();
    };

    const columns = React.useMemo<ColumnDef<GrantView>[]>(
        () => [
            {
                id: "account",
                // An accessor makes the column searchable; a column with only a cell is skipped by the search.
                accessorFn: (grant) => grant.party,
                header: "Account",
                cell: ({ row: { original: grant } }) => (
                    <div className="min-w-0">
                        <p className="font-medium text-foreground">{grant.party}</p>
                        <p className="truncate text-xs text-muted-foreground">
                            {grant.purpose} · {grant.scope}
                        </p>
                    </div>
                ),
            },
            {
                id: "agent",
                accessorFn: (grant) => [grant.agentName, grant.agentDisplayId].filter(Boolean).join(" "),
                header: "Agent",
                cell: ({ row: { original: grant } }) => (
                    <div className="min-w-0">
                        <Link
                            href={`/agents/${grant.agentId}`}
                            className="font-medium text-foreground underline-offset-4 hover:underline"
                            data-testid={`grant-agent-${grant.id}`}
                        >
                            {grant.agentName}
                        </Link>
                        {grant.agentDisplayId && grant.agentDisplayId !== grant.agentName ? (
                            <p className="truncate font-mono text-[11px] tabular-nums text-muted-foreground">
                                {grant.agentDisplayId}
                            </p>
                        ) : null}
                    </div>
                ),
            },
            {
                id: "asked for",
                accessorFn: (grant) => grant.reason,
                header: "Asked for",
                cell: ({ row: { original: grant } }) => (
                    <span className="text-muted-foreground">“{grant.reason}”</span>
                ),
            },
            {
                id: "window",
                header: "Window",
                cell: ({ row: { original: grant } }) => (
                    <span className="text-muted-foreground">
                        {formatDateTime(grant.from)}
                        {grant.until ? ` → ${formatDateTime(grant.until)}` : ""}
                    </span>
                ),
            },
            {
                id: "status",
                header: "Status",
                cell: ({ row: { original: grant } }) => <StatusBadge status={grantState(grant.status)} />,
            },
            {
                id: "actions",
                header: "",
                enableHiding: false,
                cell: ({ row: { original: grant } }) =>
                    grant.canRevoke ? (
                        <div className="flex justify-end">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs text-danger hover:text-danger"
                                onClick={() => setRevoking(grant)}
                                data-testid={`grant-withdraw-${grant.id}`}
                            >
                                Withdraw
                            </Button>
                        </div>
                    ) : null,
            },
        ],
        []
    );

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
                        <DataTable<GrantView, unknown>
                            columns={columns}
                            data={grants}
                            getRowId={(grant) => grant.id}
                            searchPlaceholder="Search account, agent or what was asked"
                            emptyState={
                                <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                    Nobody holds access to anyone&apos;s account right now.
                                </p>
                            }
                            bulkActions={(selected, _clear, keep) => {
                                const rows = selected.filter((grant) => grant.canRevoke);
                                return (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 bg-card text-danger hover:text-danger"
                                        disabled={rows.length === 0 || busy}
                                        onClick={() => setBulk({ rows, keep })}
                                        data-testid="grant-withdraw-selected"
                                    >
                                        Withdraw selected ({rows.length})
                                    </Button>
                                );
                            }}
                        />
                    )}
                </ResourceBoundary>
            )}

            <ConfirmDialog
                open={revoking !== null}
                onOpenChange={(open) => !open && !busy && setRevoking(null)}
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

            <ConfirmDialog
                open={bulk !== null}
                onOpenChange={(open) => !open && !busy && setBulk(null)}
                title={bulk ? `Withdraw access from ${accounts(bulk.rows.length)}?` : ""}
                description="The agents lose access now and the codes that opened it stop resolving. Each account's owner sees the withdrawal in their record."
                confirmLabel="Withdraw access"
                destructive
                busy={busy}
                onConfirm={() => void revokeAll()}
            />
        </div>
    );
}
