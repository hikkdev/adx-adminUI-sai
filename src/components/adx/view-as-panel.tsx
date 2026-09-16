"use client";

import * as React from "react";
import { Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { formatDateTime } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { useNow } from "@/lib/use-now";
import {
    IMPERSONATION_REASON_MAX,
    IMPERSONATION_REASON_MIN,
    impersonationService,
    impersonationTargetLabel,
    type ImpersonationStart,
} from "@/services/users";

/** One of the party's own endpoints the panel reads through the view-as token. */
export interface ViewAsRead {
    /** The card's heading. */
    title: string;
    /** The party's own route, e.g. `/publishers/me`. */
    path: string;
}

/** What a publisher sees: their profile, their dashboard, their wallet. */
export const PUBLISHER_READS: readonly ViewAsRead[] = [
    { title: "Profile · GET /publishers/me", path: "/publishers/me" },
    { title: "Dashboard · GET /publishers/me/dashboard", path: "/publishers/me/dashboard" },
    { title: "Wallet · GET /payouts/wallet", path: "/payouts/wallet" },
];

interface ViewAsProps {
    /** The sign-in account behind the party. Null when the owner has not claimed one yet. */
    userId: string | null;
    partyName: string;
    reads: readonly ViewAsRead[];
    children: (controls: { start: (() => void) | null }) => React.ReactNode;
}

/**
 * Read-only view-as (Lot A, Q27) — what "Start audited session" always meant.
 *
 * The admin says why, `POST /users/:id/impersonate` mints a fifteen-minute
 * read-only token for the party, and the panel reads the party's own
 * endpoints with it — nothing else on the console is touched, because the
 * token lives in this component's state and the api client's `bearer`
 * option, never in the session store. The banner stays up for as long as
 * the panel is open; End posts `/users/impersonations/:id/end` and the row
 * is the record. Both ends are audited against the target user.
 *
 * Render-prop rather than a button: the menu item that opens it is drawn by
 * the page, and it offers nothing when there is no account to look through.
 */
export function ViewAs({ userId, partyName, reads, children }: ViewAsProps) {
    const live = isLive("users");
    const [asking, setAsking] = React.useState(false);
    const [session, setSession] = React.useState<ImpersonationStart | null>(null);

    const start = live && userId ? () => setAsking(true) : null;

    return (
        <>
            {children({ start })}
            {userId && (
                <ReasonDialog
                    open={asking}
                    onOpenChange={setAsking}
                    userId={userId}
                    partyName={partyName}
                    onStarted={(started) => {
                        setAsking(false);
                        setSession(started);
                    }}
                />
            )}
            {session && <ViewAsPanel session={session} reads={reads} onEnded={() => setSession(null)} />}
        </>
    );
}

/* ------------------------------------------------------------------ */
/* The reason                                                          */
/* ------------------------------------------------------------------ */

function ReasonDialog({
    open,
    onOpenChange,
    userId,
    partyName,
    onStarted,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    userId: string;
    partyName: string;
    onStarted: (session: ImpersonationStart) => void;
}) {
    const [reason, setReason] = React.useState("");
    const [error, setError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const trimmed = reason.trim();
    const ready = trimmed.length >= IMPERSONATION_REASON_MIN && trimmed.length <= IMPERSONATION_REASON_MAX;

    const handleOpenChange = (next: boolean) => {
        if (!next) {
            setReason("");
            setError(null);
        }
        onOpenChange(next);
    };

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        setError(null);
        try {
            const started = await impersonationService.start(userId, trimmed);
            setReason("");
            onStarted(started);
        } catch (cause) {
            setError(
                cause instanceof ApiError
                    ? (cause.fieldErrors.reason?.[0] ?? cause.message)
                    : cause instanceof Error
                      ? cause.message
                      : "Could not open the session.",
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md">
                <form onSubmit={submit} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>View as {partyName}</DialogTitle>
                        <DialogDescription>
                            A read-only look at what {partyName} sees, for fifteen minutes. The reason is recorded
                            against their account and read back in an audit; every request is refused unless it is
                            a read.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-1.5">
                        <Label htmlFor="view-as-reason">Why</Label>
                        <Textarea
                            id="view-as-reason"
                            value={reason}
                            rows={3}
                            maxLength={IMPERSONATION_REASON_MAX}
                            placeholder="Ticket #4821 — the publisher says the rate on their screen differs from ours."
                            onChange={(event) => setReason(event.target.value)}
                            autoFocus
                        />
                        <p className="text-xs text-muted-foreground">
                            {error ?? `A sentence somebody can read back later — at least ${IMPERSONATION_REASON_MIN} characters.`}
                        </p>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" className="bg-card" onClick={() => handleOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={!ready || busy}>
                            {busy ? "Opening…" : "Start read-only session"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

/* ------------------------------------------------------------------ */
/* The panel                                                           */
/* ------------------------------------------------------------------ */

type ReadState = { status: "loaded"; value: unknown } | { status: "failed"; message: string };

/** Every read at once; one failing leaves the others standing. */
async function readAll(accessToken: string, reads: readonly ViewAsRead[]): Promise<Record<string, ReadState>> {
    const settled = await Promise.allSettled(reads.map((read) => impersonationService.readAs(accessToken, read.path)));
    const out: Record<string, ReadState> = {};
    reads.forEach((read, index) => {
        const result = settled[index];
        if (result.status === "fulfilled") {
            out[read.path] = { status: "loaded", value: result.value };
        } else {
            const cause: unknown = result.reason;
            out[read.path] = {
                status: "failed",
                message: cause instanceof ApiError ? `${cause.code}: ${cause.message}` : "Could not reach the ADX backend.",
            };
        }
    });
    return out;
}

function ViewAsPanel({
    session,
    reads,
    onEnded,
}: {
    session: ImpersonationStart;
    reads: readonly ViewAsRead[];
    onEnded: () => void;
}) {
    const [ending, setEnding] = React.useState(false);
    /* A minute's tick is fine: the token's own 401 is what actually ends a read. */
    const now = useNow();
    const expired = now !== null && new Date(session.expiresAt).getTime() <= now;
    const label = impersonationTargetLabel(session.target);

    const resource = useApiResource<Record<string, ReadState>>(`view-as:${session.sessionId}`, () =>
        readAll(session.accessToken, reads),
    );

    const end = async () => {
        setEnding(true);
        try {
            await impersonationService.end(session.sessionId);
            toast.success(`Stopped viewing as ${label}`, { description: "The session is closed and recorded." });
        } catch (cause) {
            // The token expires on its own; the row is what matters, and a
            // failed end is reported rather than trapping the admin in the panel.
            toast.error(cause instanceof Error ? cause.message : "Could not close the session; it expires on its own.");
        } finally {
            setEnding(false);
            onEnded();
        }
    };

    return (
        <Sheet
            open
            onOpenChange={(open) => {
                if (!open && !ending) void end();
            }}
        >
            <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
                {/* The banner: persistent for the life of the panel, and the only way out ends the session. */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-warning-soft px-5 py-3">
                    <div className="flex min-w-0 items-center gap-2 text-sm">
                        <Eye className="size-4 shrink-0 text-warning" aria-hidden />
                        <span className="truncate">
                            <span className="font-medium text-foreground">Viewing as {label}</span>
                            <span className="text-muted-foreground"> (read-only)</span>
                            <span className="text-muted-foreground">
                                {" "}
                                · {expired ? "expired" : `until ${formatDateTime(session.expiresAt)}`}
                            </span>
                        </span>
                    </div>
                    <Button size="sm" variant="outline" className="h-8 bg-card" disabled={ending} onClick={() => void end()}>
                        {ending ? "Ending…" : "End"}
                    </Button>
                </div>

                <SheetHeader className="px-5 pt-4 text-left">
                    <SheetTitle>What {label} sees</SheetTitle>
                    <SheetDescription>
                        Their own endpoints, read with a fifteen-minute token that the backend refuses every write
                        under. Shown as the API answers it; nothing here is the console&apos;s reading.
                    </SheetDescription>
                </SheetHeader>

                <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                    {expired && (
                        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                            The token has expired. End the session and start another if you still need the view.
                        </p>
                    )}
                    {reads.map((read) => (
                        <JsonCard
                            key={read.path}
                            title={read.title}
                            state={resource.data?.[read.path] ?? (resource.error ? { status: "failed", message: resource.error } : null)}
                        />
                    ))}
                </div>
            </SheetContent>
        </Sheet>
    );
}

/** `state` is null while the read is still in flight. */
function JsonCard({ title, state }: { title: string; state: ReadState | null }) {
    return (
        <Card className="overflow-hidden rounded-lg border-border shadow-none">
            <div className="border-b bg-muted/50 px-4 py-2">
                <h3 className="font-mono text-xs font-medium text-muted-foreground">{title}</h3>
            </div>
            {state === null ? (
                <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Reading…
                </div>
            ) : state.status === "failed" ? (
                <p className="px-4 py-4 text-sm text-danger">{state.message}</p>
            ) : (
                <pre className="max-h-96 overflow-auto px-4 py-3 font-mono text-xs leading-relaxed text-foreground">
                    {JSON.stringify(state.value, null, 2)}
                </pre>
            )}
        </Card>
    );
}
