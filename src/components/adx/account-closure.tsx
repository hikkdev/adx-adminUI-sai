"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, Lock } from "lucide-react";
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CloseAccountDialog } from "@/components/adx/close-account-dialog";
import { ApiError } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { formatDate } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import {
    ERASURE_VIA_LABEL,
    accountLifecycleService,
    type ClosedState,
    type ErasureVia,
} from "@/services/users";
import type { AccountClosureFacts } from "@/types";

/**
 * What a person's page hands its header so it can offer the close.
 *
 * `requestClose` is null when there is nothing to offer: the API is off, the
 * account is already closed, or the party has no sign-in account yet (a
 * publisher opened at the desk whose owner has not claimed it — there is no
 * `User` to close).
 */
/** What the banner needs: the account's id and its closure columns. */
export type ClosedFacts = Pick<ClosedState, "id" | "closedAt" | "closeReason">;

export interface AccountClosureSlot {
    /** Opens the dialog. Null when the close cannot be offered. */
    requestClose: (() => void) | null;
    /** The closure columns, once known. Null while loading, off, or with no account. */
    closed: ClosedFacts | null;
}

interface AccountClosureProps {
    /** The `User.id` behind the party, or null when nobody has claimed it yet. */
    userId: string | null | undefined;
    /** What to call them in the dialog and the banner. */
    name: string;
    /**
     * E6 / E10-1: the closure columns as the party read joined them (`user`
     * on `GET /publishers/:id`, `/advertisers/:id` and `/agents/:id`). Pass
     * them and nothing is read here; leave the prop off and the columns
     * come off `GET /users/:id` as before. `null` means the read said no
     * account backs the profile.
     */
    closed?: AccountClosureFacts | null;
    /** After a case is opened or decided, so the page re-reads its own record. */
    onChanged?: () => void;
    children: (slot: AccountClosureSlot) => React.ReactNode;
}

/**
 * The closure state of the account behind a page, drawn once.
 *
 * The columns live on `User`. Since E6 the publisher and advertiser reads
 * join them as `user { closedAt, closeReason }`, and since E10-1 the agent
 * read does too, so every party page hands them in and nothing is read
 * twice; `GET /users/:id` is read here only by a caller that passes no
 * `closed` prop. The banner goes above whatever the
 * page draws; the page decides where the button goes (its action row, its
 * menu) through the render prop, so the two share one state and one dialog
 * without a portal or a context.
 *
 * With the users domain off there is no banner and no button: a closure is
 * an act against a real account and there is no fixture to pretend on.
 */
export function AccountClosure({ userId, name, closed: given, onChanged, children }: AccountClosureProps) {
    const live = isLive("users") && !!userId;
    const [open, setOpen] = React.useState(false);
    const known = given !== undefined;

    const state = useApiResource<ClosedState | null>(
        `users:closed-state:${userId ?? "none"}:${live}:${known ? "given" : "read"}`,
        () => (live && userId && !known ? accountLifecycleService.closedState(userId) : Promise.resolve(null)),
    );

    const closed: ClosedFacts | null = known
        ? given && userId
            ? { id: userId, closedAt: given.closedAt, closeReason: given.closeReason }
            : null
        : (state.data ?? null);
    const requestClose = live && closed && !closed.closedAt ? () => setOpen(true) : null;

    return (
        <>
            {closed?.closedAt && <ClosedBanner closed={closed} name={name} />}
            {children({ requestClose, closed })}
            {live && userId && (
                <CloseAccountDialog
                    userId={userId}
                    name={name}
                    open={open}
                    onOpenChange={setOpen}
                    onChanged={() => {
                        state.reload();
                        onChanged?.();
                    }}
                />
            )}
        </>
    );
}

/**
 * "Closed on 1 Sep 2026 — Owner retired." Kept rather than removed, and the
 * page says so. The one thing left to do to a closed account is offered here:
 * asking for the person behind it to be erased.
 */
export function ClosedBanner({
    closed,
    name,
}: {
    closed: Pick<ClosedState, "id" | "closedAt" | "closeReason">;
    name: string;
}) {
    const [erasing, setErasing] = React.useState(false);
    if (!closed.closedAt) return null;
    return (
        <div
            role="status"
            className="flex flex-wrap items-start gap-3 rounded-lg border border-border bg-muted px-4 py-3 text-sm"
        >
            <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="min-w-0 flex-1 text-foreground">
                <span className="font-medium">Closed on {formatDate(closed.closedAt)}</span>
                {closed.closeReason ? <span className="text-muted-foreground"> — {closed.closeReason}</span> : null}
                <span className="block text-xs text-muted-foreground">
                    Sign-in is off and the wallet is frozen. The records stay for as long as the law requires.
                </span>
            </p>
            <Button variant="outline" size="sm" className="bg-card" onClick={() => setErasing(true)}>
                Request erasure
            </Button>
            {erasing && (
                <RequestErasureDialog userId={closed.id} name={name} onClose={() => setErasing(false)} />
            )}
        </div>
    );
}

/** The button a page puts in its action row when the slot offers a close. */
export function CloseAccountButton({ slot }: { slot: AccountClosureSlot }) {
    if (!slot.requestClose) return null;
    return (
        <Button variant="outline" className="bg-card text-danger hover:text-danger" onClick={slot.requestClose}>
            Close account
        </Button>
    );
}

const VIA_OPTIONS: ErasureVia[] = ["OPS", "EMAIL", "APP"];

/**
 * `POST /users/:id/erasure` from the desk — the first of the four gates.
 *
 * The channel is asked because the obligation's paper trail starts with how
 * the person asked; the reason is optional because the law does not require
 * one. Asking twice returns the open request rather than a second clock.
 */
function RequestErasureDialog({ userId, name, onClose }: { userId: string; name: string; onClose: () => void }) {
    const [via, setVia] = React.useState<ErasureVia>("OPS");
    const [reason, setReason] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const trimmed = reason.trim();
    const reasonOk = trimmed.length === 0 || (trimmed.length >= 3 && trimmed.length <= 500);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy || !reasonOk) return;
        setBusy(true);
        setError(null);
        try {
            const request = await accountLifecycleService.raiseErasure(userId, {
                requestedVia: via,
                ...(trimmed ? { reason: trimmed } : {}),
            });
            toast.success("Erasure request raised", {
                description: `Due ${formatDate(request.dueAt)}. A DPO approves it under Users → Erasure requests.`,
            });
            onClose();
        } catch (cause) {
            setError(
                cause instanceof ApiError
                    ? cause.message
                    : cause instanceof Error
                      ? cause.message
                      : "Could not raise the request.",
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Request erasure</DialogTitle>
                    <DialogDescription>
                        {name}. Starts the thirty-day clock. Nothing is erased until a DPO approves and an admin
                        carries it out from the{" "}
                        <Link href="/users/erasure" className="underline underline-offset-4">
                            erasure queue
                        </Link>
                        .
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid gap-1.5">
                        <Label htmlFor="erasure-via">How they asked</Label>
                        <Select value={via} onValueChange={(value) => setVia(value as ErasureVia)}>
                            <SelectTrigger id="erasure-via" className="h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {VIA_OPTIONS.map((option) => (
                                    <SelectItem key={option} value={option}>
                                        {ERASURE_VIA_LABEL[option]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="erasure-ask-reason">Reason</Label>
                        <Textarea
                            id="erasure-ask-reason"
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            placeholder="Optional — what the person said"
                            rows={3}
                        />
                        {!reasonOk && <p className="text-xs text-muted-foreground">At least 3 characters, or leave it empty.</p>}
                    </div>
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
                        <Button type="submit" disabled={busy || !reasonOk}>
                            {busy ? "Raising…" : "Raise request"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
