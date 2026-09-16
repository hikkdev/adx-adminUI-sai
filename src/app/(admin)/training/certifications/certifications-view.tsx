"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Award } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import {
    CERTIFICATION_STATUS_META,
    certificationStatus,
    certifiedAgentLabel,
    trainingService,
    type CertificationRow,
} from "@/services/training";
import { TRAINING_TITLE, TrainingNav } from "../training-nav";

interface CertificationsViewProps {
    rows: CertificationRow[];
    /** Refetches after a revoke actually lands. */
    onChanged: () => void;
}

/** The schema's own floor on a reason. */
const MIN_REASON = 3;
const MAX_REASON = 300;

/**
 * Who has passed the curriculum — no DR 10 frame, so a plain desk table:
 * the agent (named, with their AGT- id, linked to their page), the ADX-CERT
 * identifier the apps share as text, when it was issued, and whether it
 * still stands. Decision 13: there is no PDF, so there is nothing to
 * download and the button is not drawn.
 *
 * The one write is Revoke, which asks for a reason because the server
 * refuses one shorter than three characters and logs whatever is given.
 */
export function CertificationsView({ rows, onChanged }: CertificationsViewProps) {
    const [revoking, setRevoking] = React.useState<CertificationRow | null>(null);

    const columns = React.useMemo<ColumnDef<CertificationRow>[]>(
        () => [
            {
                id: "agent",
                accessorFn: (row) => certifiedAgentLabel(row),
                header: ({ column }) => <SortableHeader column={column}>Agent</SortableHeader>,
                cell: ({ row }) => (
                    <Link
                        href={`/agents/${row.original.agentId}`}
                        className="block min-w-0 underline-offset-4 hover:underline"
                    >
                        <p className="font-medium text-foreground">{certifiedAgentLabel(row.original)}</p>
                        {row.original.agentDisplayId && row.original.agentName && (
                            <p className="text-xs text-muted-foreground">{row.original.agentDisplayId}</p>
                        )}
                    </Link>
                ),
            },
            {
                id: "certificate",
                accessorKey: "certificateId",
                header: "Certificate",
                cell: ({ row }) => <span className="font-mono text-xs text-foreground">{row.original.certificateId}</span>,
            },
            {
                id: "issued",
                accessorKey: "issuedAt",
                header: ({ column }) => <SortableHeader column={column}>Issued</SortableHeader>,
                cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(row.original.issuedAt)}</span>,
            },
            {
                id: "status",
                accessorFn: (row) => certificationStatus(row),
                header: "Status",
                cell: ({ row }) => {
                    const status = certificationStatus(row.original);
                    return (
                        <div className="min-w-0">
                            <StatusBadge status={CERTIFICATION_STATUS_META[status]} />
                            {status === "REVOKED" && row.original.revokedAt && (
                                <p className="mt-1 max-w-[18rem] truncate text-xs text-muted-foreground" title={row.original.revokedReason ?? undefined}>
                                    {formatDate(row.original.revokedAt)}
                                    {row.original.revokedReason ? ` · ${row.original.revokedReason}` : ""}
                                </p>
                            )}
                        </div>
                    );
                },
            },
            {
                id: "actions",
                enableHiding: false,
                size: 96,
                cell: ({ row }) =>
                    certificationStatus(row.original) === "ACTIVE" ? (
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 bg-card text-danger hover:text-danger"
                            onClick={() => setRevoking(row.original)}
                        >
                            Revoke
                        </Button>
                    ) : null,
            },
        ],
        [],
    );

    const active = rows.filter((row) => !row.revokedAt).length;

    return (
        <div className="space-y-5">
            <PageHeader
                title={TRAINING_TITLE}
                subtitle={
                    rows.length
                        ? `${active} certified · ${rows.length - active} revoked`
                        : "Nobody has passed the whole curriculum yet"
                }
            />
            <TrainingNav />
            <DataTable
                columns={columns}
                data={rows}
                searchPlaceholder="Search agent or certificate"
                initialPageSize={10}
                emptyState={
                    <EmptyState
                        icon={Award}
                        title="No certificates yet"
                        description="A certificate is minted the moment an agent passes the last active module. There is no separate exam and no PDF: the identifier here is the certificate."
                    />
                }
            />
            <RevokeDialog
                row={revoking}
                onOpenChange={(open) => {
                    if (!open) setRevoking(null);
                }}
                onRevoked={onChanged}
            />
        </div>
    );
}

function RevokeDialog({
    row,
    onOpenChange,
    onRevoked,
}: {
    row: CertificationRow | null;
    onOpenChange: (open: boolean) => void;
    onRevoked: () => void;
}) {
    return (
        <Dialog open={row !== null} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                {/* Mounted only while open, so the reason is fresh each time. */}
                {row && <RevokeForm row={row} onClose={() => onOpenChange(false)} onRevoked={onRevoked} />}
            </DialogContent>
        </Dialog>
    );
}

function RevokeForm({ row, onClose, onRevoked }: { row: CertificationRow; onClose: () => void; onRevoked: () => void }) {
    const [reason, setReason] = React.useState("");
    const [error, setError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const trimmed = reason.trim();
    const ready = trimmed.length >= MIN_REASON && trimmed.length <= MAX_REASON;

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        setError(null);
        try {
            await trainingService.revoke(row.id, trimmed);
            // Said only after the API answered; a toast over a refused revoke
            // would leave a certificate standing that ops believes is gone.
            toast.success(`${row.certificateId} revoked`, {
                description: `${certifiedAgentLabel(row)} is no longer certified. The reason is on the audit log.`,
            });
            onRevoked();
            onClose();
        } catch (cause) {
            setError(cause instanceof ApiError || cause instanceof Error ? cause.message : "Could not revoke the certificate.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>Revoke {row.certificateId}</DialogTitle>
                <DialogDescription>
                    {certifiedAgentLabel(row)} loses their certification at once. Their passed modules stay passed; the
                    certificate is not re-minted by itself.
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
                <Label htmlFor="revoke-reason">Reason</Label>
                <Textarea
                    id="revoke-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={3}
                    placeholder="Why the certificate is being withdrawn"
                    autoFocus
                />
                <p className="text-xs text-muted-foreground">Logged with the revocation. At least {MIN_REASON} characters.</p>
            </div>
            {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onClose}>
                    Cancel
                </Button>
                <Button type="submit" variant="destructive" disabled={!ready || busy}>
                    {busy ? "Revoking…" : "Revoke certificate"}
                </Button>
            </DialogFooter>
        </form>
    );
}
