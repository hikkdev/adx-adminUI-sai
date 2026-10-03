"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { accountLifecycleService, blockersLine, deleteBlockersOf, type DeleteBlocker, type UserDeletable } from "@/services/users";

/**
 * Delete, for an account with no history — 2 Oct 2026 (the owner: "there's
 * no deletion option").
 *
 * `GET /users/:id/deletable` decides: the item is offered only when the
 * server says the account holds nothing (no listings, bookings, wallet,
 * KYC, invoices, campaigns, grants used…). Anything else keeps the account
 * and the page's Close account stands. A closed account offers nothing
 * here, nor does a page whose read failed — never a button that would be
 * refused.
 */
export interface DeleteAccountSlot {
    /** Opens the confirm. Null while the account cannot be deleted (or the read has not said so). */
    requestDelete: (() => void) | null;
    /** The confirm dialog; mount it once on the page. */
    dialog: React.ReactNode;
}

interface UseDeleteAccountOptions {
    /** The `User.id` behind the page; null when nobody has claimed the profile. */
    userId: string | null | undefined;
    /** What to call them in the confirm and the toast. */
    name: string;
    /** Where the desk lands once the account is gone — the directory it came from. */
    directoryHref: string;
    /** The account is closed — nothing to delete then. */
    closed?: boolean;
}

export function useDeleteAccount({ userId, name, directoryHref, closed = false }: UseDeleteAccountOptions): DeleteAccountSlot {
    const router = useRouter();
    const live = isLive("users") && !!userId && !closed;
    const [open, setOpen] = React.useState(false);
    const [busy, setBusy] = React.useState(false);

    /* A failed read offers nothing: the desk can still close the account. */
    const check = useApiResource<UserDeletable | null>(`users:deletable:${userId ?? "none"}:${live}`, () =>
        live && userId ? accountLifecycleService.deletable(userId).catch(() => null) : Promise.resolve(null),
    );

    const confirm = async () => {
        if (!userId) return;
        setBusy(true);
        try {
            await accountLifecycleService.deleteAccount(userId);
            toast.success(`${name} deleted`, { description: "The account had no history, so nothing else changed." });
            setOpen(false);
            router.push(directoryHref);
        } catch (cause) {
            /* History appeared since the page was read — the server's blockers, and Close account instead. */
            const blockers = deleteBlockersOf(cause);
            toast.error(`Can't delete ${name}`, {
                description: blockers.length
                    ? `The account has history now: ${blockersLine(blockers)}. Close the account instead.`
                    : cause instanceof Error
                      ? cause.message
                      : "The delete did not go through.",
            });
            setOpen(false);
            check.reload();
        } finally {
            setBusy(false);
        }
    };

    return {
        requestDelete: live && check.data?.deletable ? () => setOpen(true) : null,
        dialog: live ? <DeleteAccountConfirm name={name} open={open} onOpenChange={(next) => !busy && setOpen(next)} busy={busy} onConfirm={() => void confirm()} /> : null,
    };
}

/** The delete confirm: the one sentence, wherever an account is deleted from (its page, or the accounts list's row menu). */
export function DeleteAccountConfirm({
    name,
    open,
    onOpenChange,
    busy = false,
    onConfirm,
}: {
    name: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    busy?: boolean;
    onConfirm: () => void;
}) {
    return (
        <ConfirmDialog
            open={open}
            onOpenChange={onOpenChange}
            title={`Delete ${name} permanently?`}
            description="This account has no history, so nothing else is affected. This can't be undone."
            confirmLabel="Delete account"
            destructive
            busy={busy}
            onConfirm={onConfirm}
        />
    );
}

/**
 * When `GET /users/:id/deletable` says no: what stands in the way, one line
 * each, and the way that does work, Close account instead. Nothing is
 * offered to close when the account is closed already.
 */
export function DeleteBlockedDialog({
    name,
    blockers,
    open,
    onOpenChange,
    onCloseInstead,
}: {
    name: string;
    blockers: readonly DeleteBlocker[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Opens the Close account flow; omit when the account is already closed. */
    onCloseInstead?: () => void;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md" data-testid="delete-blocked">
                <DialogHeader>
                    <DialogTitle>{`${name} can't be deleted`}</DialogTitle>
                    <DialogDescription>
                        {onCloseInstead
                            ? "This account has history, so it is kept. Close the account instead: sign-in stops and the records stay."
                            : "This account has history, so it is kept."}
                    </DialogDescription>
                </DialogHeader>
                {blockers.length > 0 && (
                    <ul className="divide-y rounded-md border text-sm">
                        {blockers.map((blocker) => (
                            <li key={blocker.kind} className="px-3 py-2 text-foreground">
                                {blockersLine([blocker])}
                            </li>
                        ))}
                    </ul>
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    {onCloseInstead && (
                        <Button
                            variant="destructive"
                            onClick={() => {
                                onOpenChange(false);
                                onCloseInstead();
                            }}
                        >
                            Close account instead
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** The button a page puts beside Close account when it has no overflow menu. Nothing while delete is not offered. */
export function DeleteAccountButton({ slot }: { slot: Pick<DeleteAccountSlot, "requestDelete"> }) {
    if (!slot.requestDelete) return null;
    return (
        <Button variant="outline" className="bg-card text-danger hover:text-danger" onClick={slot.requestDelete} data-testid="delete-account">
            <Trash2 className="mr-1.5 size-4" aria-hidden />
            Delete account
        </Button>
    );
}
