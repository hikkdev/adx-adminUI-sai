"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertCircle, MoreHorizontal, Search, ShieldCheck } from "lucide-react";
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { FieldList } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDate, formatDateTime } from "@/lib/format";
import {
    ERASURE_STATUSES,
    ERASURE_STATUS_META,
    ERASURE_VIA_LABEL,
    accountLifecycleService,
    dueLabel,
    dueTone,
    personLabel,
    type ErasureRequest,
    type ErasureStatus,
    type ListPage,
} from "@/services/users";
import { UsersNav } from "../users-nav";

interface ErasureViewProps {
    page: ListPage<ErasureRequest>;
    status: ErasureStatus | "ALL";
    onStatusChange: (status: ErasureStatus | "ALL") => void;
    query: string;
    onQueryChange: (value: string) => void;
    onChanged: () => void;
}

type Act = "approve" | "refuse" | "execute";

/**
 * The erasure queue.
 *
 * No DR 10 frame draws it, so it is composed from the console's own parts.
 * The three acts are the server's four gates minus the ask: a DPO approves
 * (and signs by name), an admin refuses (with a reason), an admin executes —
 * and only an APPROVED request can be executed, so the menu offers each act
 * only where the status admits it rather than as a button that always fails.
 */
export function ErasureView({ page, status, onStatusChange, query, onQueryChange, onChanged }: ErasureViewProps) {
    const [target, setTarget] = React.useState<{ request: ErasureRequest; act: Act } | null>(null);
    const [detail, setDetail] = React.useState<ErasureRequest | null>(null);

    const columns = React.useMemo<ColumnDef<ErasureRequest>[]>(
        () => [
            {
                id: "person",
                accessorFn: (row) => personLabel(row.user, row.userId),
                header: ({ column }) => <SortableHeader column={column}>Person</SortableHeader>,
                cell: ({ row }) => {
                    const label = personLabel(row.original.user, row.original.userId);
                    return (
                        <div className="flex items-center gap-2.5">
                            <InitialsAvatar name={label} size="sm" />
                            <div className="min-w-0">
                                <p className="font-medium text-foreground">{label}</p>
                                <p className="text-[11px] text-muted-foreground">
                                    {row.original.user?.mobile ?? row.original.userId}
                                    {/* Erasure needs a closed account; the desk should
                                        see at a glance which requests can move. */}
                                    {row.original.user && !row.original.user.closedAt && (
                                        <span className="ml-1.5 text-warning">· account still open</span>
                                    )}
                                </p>
                            </div>
                        </div>
                    );
                },
            },
            {
                id: "via",
                accessorKey: "requestedVia",
                header: "Asked",
                cell: ({ row }) => (
                    <div className="text-xs text-muted-foreground">
                        <p className="text-foreground">{ERASURE_VIA_LABEL[row.original.requestedVia] ?? row.original.requestedVia}</p>
                        <p className="tabular-nums">{formatDateTime(row.original.requestedAt)}</p>
                    </div>
                ),
            },
            {
                id: "due",
                accessorKey: "dueAt",
                header: ({ column }) => <SortableHeader column={column}>Due</SortableHeader>,
                cell: ({ row }) => (
                    <div>
                        <StatusBadge status={{ label: dueLabel(row.original), tone: dueTone(row.original) }} />
                        <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">{formatDate(row.original.dueAt)}</p>
                    </div>
                ),
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => (
                    <div>
                        <StatusBadge status={ERASURE_STATUS_META[row.original.status]} />
                        {row.original.dpoName && (
                            <p className="mt-1 text-[11px] text-muted-foreground">Signed by {row.original.dpoName}</p>
                        )}
                        {row.original.retainUntil && (
                            <p className="mt-1 text-[11px] text-muted-foreground">Books kept to {formatDate(row.original.retainUntil)}</p>
                        )}
                    </div>
                ),
            },
            {
                id: "actions",
                enableHiding: false,
                size: 48,
                cell: ({ row }) => {
                    const request = row.original;
                    const canApprove = request.status === "PENDING";
                    const canRefuse = request.status === "PENDING" || request.status === "APPROVED";
                    const canExecute = request.status === "APPROVED";
                    return (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-8" onClick={(event) => event.stopPropagation()}>
                                    <MoreHorizontal className="size-4" />
                                    <span className="sr-only">Row actions</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56" onClick={(event) => event.stopPropagation()}>
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem onSelect={() => setDetail(request)}>View request</DropdownMenuItem>
                                {canApprove && (
                                    <DropdownMenuItem onSelect={() => setTarget({ request, act: "approve" })}>
                                        Approve as DPO
                                    </DropdownMenuItem>
                                )}
                                {canExecute && (
                                    <DropdownMenuItem
                                        className="text-danger focus:text-danger"
                                        onSelect={() => setTarget({ request, act: "execute" })}
                                    >
                                        Carry out the erasure
                                    </DropdownMenuItem>
                                )}
                                {canRefuse && (
                                    <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onSelect={() => setTarget({ request, act: "refuse" })}>
                                            Refuse
                                        </DropdownMenuItem>
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    );
                },
            },
        ],
        [],
    );

    const shown = page.items.length;
    const open = (page.counts.PENDING ?? 0) + (page.counts.APPROVED ?? 0);

    return (
        <div className="space-y-5">
            <UsersNav />
            <PageHeader
                title="Erasure requests"
                subtitle={
                    shown < page.total
                        ? `${open} open · showing the first ${shown} of ${page.total} — narrow the status to see the rest`
                        : `${open} open · ${page.total} request${page.total === 1 ? "" : "s"}`
                }
            />
            <DataTable
                columns={columns}
                data={page.items}
                initialPageSize={10}
                onRowClick={setDetail}
                emptyState={
                    <EmptyState
                        icon={ShieldCheck}
                        title="No erasure requests"
                        description="Nobody has asked to be forgotten under this filter. A request is raised by the person from the app, or from a closed account's page at the desk."
                    />
                }
                toolbar={
                    <>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                            <Input
                                value={query}
                                onChange={(event) => onQueryChange(event.target.value)}
                                placeholder="Name or mobile"
                                aria-label="Search erasure requests"
                                className="h-9 w-[240px] bg-card pl-8"
                            />
                        </div>
                        <Select value={status} onValueChange={(value) => onStatusChange(value as ErasureStatus | "ALL")}>
                            <SelectTrigger className="h-9 w-[240px] bg-card">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Status: All</SelectItem>
                                {ERASURE_STATUSES.map((value) => (
                                    <SelectItem key={value} value={value}>
                                        {ERASURE_STATUS_META[value].label} ({page.counts[value] ?? 0})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </>
                }
            />

            {target && (
                <ErasureActionDialog
                    request={target.request}
                    act={target.act}
                    onClose={() => setTarget(null)}
                    onDone={onChanged}
                />
            )}
            {detail && <ErasureDetailDialog request={detail} onClose={() => setDetail(null)} />}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* The acts                                                            */
/* ------------------------------------------------------------------ */

const ACT_COPY: Record<Act, { title: string; description: string; confirm: string }> = {
    approve: {
        title: "Approve the erasure",
        description:
            "The DPO's signature. The account has to be closed first; the server refuses otherwise. Nothing is erased yet — an admin carries it out as a separate step.",
        confirm: "Approve",
    },
    refuse: {
        title: "Refuse the erasure",
        description: "Recorded on the request with your reason. The person keeps the right to ask again.",
        confirm: "Refuse",
    },
    execute: {
        title: "Carry out the erasure",
        description:
            "Irreversible. Name, contact details, addresses, GSTINs, every KYC document and its files are blanked across the person's profiles. Wallet, ledger and withdrawal rows stay, naming nobody, until the retention window ends.",
        confirm: "Erase this person",
    },
};

/**
 * Approve, refuse or execute — one dialog, three bodies.
 *
 * Each act's inline error stays on screen rather than flashing in a toast,
 * because the usual refusal — 409 ERASURE_NOT_ALLOWED, "close the account
 * first" — is one the operator has to go and act on.
 */
function ErasureActionDialog({
    request,
    act,
    onClose,
    onDone,
}: {
    request: ErasureRequest;
    act: Act;
    onClose: () => void;
    onDone: () => void;
}) {
    const [dpoName, setDpoName] = React.useState("");
    const [reason, setReason] = React.useState("");
    const [typed, setTyped] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    /* The person's identity on the platform is their number; the User row
       has no display id of its own. Typing it back is the one gate the
       console adds to the server's four, because this is the act that
       cannot be undone. */
    const confirmToken = request.user?.mobile ?? request.userId;

    const ready =
        act === "approve"
            ? dpoName.trim().length >= 2
            : act === "refuse"
              ? reason.trim().length >= 3
              : typed.trim() === confirmToken;

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        setError(null);
        try {
            if (act === "approve") {
                await accountLifecycleService.approveErasure(request.id, dpoName);
                toast.success("Erasure approved", { description: "An admin can now carry it out from this queue." });
            } else if (act === "refuse") {
                await accountLifecycleService.refuseErasure(request.id, reason);
                toast.success("Erasure refused");
            } else {
                const done = await accountLifecycleService.executeErasure(request.id);
                const footprint = done.footprint;
                toast.success("Person erased", {
                    description: footprint
                        ? `${footprint.profilesAnonymised.length} profile${footprint.profilesAnonymised.length === 1 ? "" : "s"} anonymised, ${footprint.kycRecordsMasked.length} KYC record${footprint.kycRecordsMasked.length === 1 ? "" : "s"} masked, ${footprint.documentsDeleted} document${footprint.documentsDeleted === 1 ? "" : "s"} deleted.${done.retainUntil ? ` Books kept to ${formatDate(done.retainUntil)}.` : ""}`
                        : undefined,
                });
            }
            onDone();
            onClose();
        } catch (cause) {
            setError(
                cause instanceof ApiError
                    ? cause.message
                    : cause instanceof Error
                      ? cause.message
                      : "The request could not be recorded.",
            );
        } finally {
            setBusy(false);
        }
    }

    const copy = ACT_COPY[act];

    return (
        <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{copy.title}</DialogTitle>
                    <DialogDescription>
                        {personLabel(request.user, request.userId)}
                        {request.user?.mobile ? ` · ${request.user.mobile}` : ""}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <p className="text-sm text-muted-foreground">{copy.description}</p>

                    {act === "approve" && (
                        <div className="grid gap-1.5">
                            <Label htmlFor="erasure-dpo">DPO name</Label>
                            <Input
                                id="erasure-dpo"
                                value={dpoName}
                                onChange={(event) => setDpoName(event.target.value)}
                                placeholder="Who is signing this off"
                                className="h-9"
                                autoFocus
                            />
                            <p className="text-xs text-muted-foreground">
                                Kept on the request. "The DPO approved it" is not a record; a name is.
                            </p>
                        </div>
                    )}

                    {act === "refuse" && (
                        <div className="grid gap-1.5">
                            <Label htmlFor="erasure-reason">Reason</Label>
                            <Textarea
                                id="erasure-reason"
                                value={reason}
                                onChange={(event) => setReason(event.target.value)}
                                placeholder="Why the request is refused"
                                rows={3}
                                autoFocus
                            />
                            <p className="text-xs text-muted-foreground">At least 3 characters.</p>
                        </div>
                    )}

                    {act === "execute" && (
                        <div className="grid gap-1.5">
                            <Label htmlFor="erasure-confirm">
                                Type <span className="font-mono">{confirmToken}</span> to confirm
                            </Label>
                            <Input
                                id="erasure-confirm"
                                value={typed}
                                onChange={(event) => setTyped(event.target.value)}
                                placeholder={confirmToken}
                                className="h-9 font-mono"
                                autoComplete="off"
                                autoFocus
                            />
                            {request.dpoName && (
                                <p className="text-xs text-muted-foreground">
                                    Approved by {request.dpoName}
                                    {request.approvedAt ? ` on ${formatDate(request.approvedAt)}` : ""}.
                                </p>
                            )}
                        </div>
                    )}

                    {error && (
                        <p className="flex items-start gap-2 text-sm text-danger" role="alert">
                            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                            {error}
                        </p>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                            Cancel
                        </Button>
                        <Button type="submit" variant={act === "execute" ? "destructive" : "default"} disabled={!ready || busy}>
                            {busy ? "Working…" : copy.confirm}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

/** The request, read-only: every date and name it carries. */
function ErasureDetailDialog({ request, onClose }: { request: ErasureRequest; onClose: () => void }) {
    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Erasure request</DialogTitle>
                    <DialogDescription>
                        {personLabel(request.user, request.userId)}
                        {request.user?.mobile ? ` · ${request.user.mobile}` : ""}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={ERASURE_STATUS_META[request.status]} />
                        <StatusBadge status={{ label: dueLabel(request), tone: dueTone(request) }} />
                    </div>
                    {request.reason && (
                        <div className="rounded-md bg-muted/50 px-3 py-2.5 text-sm">
                            <p className="text-foreground">{request.reason}</p>
                        </div>
                    )}
                    <FieldList
                        items={[
                            ["Asked", `${ERASURE_VIA_LABEL[request.requestedVia] ?? request.requestedVia} · ${formatDateTime(request.requestedAt)}`],
                            ["Due", formatDate(request.dueAt)],
                            ["Account closed", request.user?.closedAt ? formatDate(request.user.closedAt) : "Not yet — required before approval"],
                            ["Approved", request.approvedAt ? `${request.dpoName ?? "DPO"} · ${formatDateTime(request.approvedAt)}` : "—"],
                            ["Carried out", request.completedAt ? formatDateTime(request.completedAt) : "—"],
                            ["Books kept until", request.retainUntil ? formatDate(request.retainUntil) : "—"],
                        ]}
                    />
                    {request.refusedReason && (
                        <div className="rounded-md border px-3 py-2.5 text-sm">
                            <p className="text-xs font-medium text-muted-foreground">Refused because</p>
                            <p className="mt-1 text-foreground">{request.refusedReason}</p>
                        </div>
                    )}
                    {request.user && request.status !== "DONE" && (
                        <p className="text-xs text-muted-foreground">
                            <Link href={`/users/${request.user.id}`} className="underline underline-offset-4 hover:text-foreground">
                                Open the account
                            </Link>
                        </p>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
