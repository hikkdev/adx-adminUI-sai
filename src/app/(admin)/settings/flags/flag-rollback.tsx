"use client";

import * as React from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { ApiError } from "@/lib/api-client";
import { FLAG_NOTE_MAX, flagsService, rolloutLabel, rolloutRulesLabel, type FeatureFlag, type FlagPosition } from "@/services/flags";

interface FlagRollbackProps {
    flag: FeatureFlag | null;
    onOpenChange: (open: boolean) => void;
    onDone: () => void;
}

/** "On · 40% · variant treatment · ADMIN" — a position in one line, for the confirm. */
export function positionLabel(position: FlagPosition): string {
    const parts = [rolloutLabel(position)];
    if (position.variant) parts.push(`variant ${position.variant}`);
    const rules = rolloutRulesLabel(position.rollout);
    if (rules) parts.push(rules);
    return parts.join(" · ");
}

/**
 * `POST /flags/:key/rollback`, confirmed: back to `lastGoodState`, the
 * position before the last change. The server keeps the current position
 * as the new `lastGoodState`, so a rollback can itself be rolled back —
 * which is why the confirm names both. The button that opens this is
 * disabled while the flag has never moved, where the server would answer
 * 409; a stale row that gets through still hears the 409 as a toast.
 */
export function FlagRollback({ flag, onOpenChange, onDone }: FlagRollbackProps) {
    const [note, setNote] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    async function confirm() {
        if (!flag || busy) return;
        setBusy(true);
        try {
            const next = await flagsService.rollback(flag.key, note);
            toast.success(`${flag.key} rolled back · ${rolloutLabel(next)}`, {
                description: "Takes effect within 30 seconds everywhere. Recorded with your name in the audit log.",
            });
            setNote("");
            onDone();
            onOpenChange(false);
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "Could not roll the flag back.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <ConfirmDialog
            open={flag !== null}
            onOpenChange={(open) => {
                if (!open) setNote("");
                onOpenChange(open);
            }}
            title={flag ? `Roll back ${flag.key}?` : "Roll back"}
            description={
                flag?.lastGoodState
                    ? `Back to ${positionLabel(flag.lastGoodState)}. It is ${positionLabel(flag)} now, and that position is kept so this rollback can be rolled back.`
                    : "This flag has never moved, so there is nothing to go back to."
            }
            confirmLabel="Roll back"
            destructive
            busy={busy}
            disabled={!flag?.lastGoodState}
            onConfirm={() => void confirm()}
        >
            <div className="space-y-1.5">
                <Label htmlFor="rollback-note">Why</Label>
                <Textarea
                    id="rollback-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value.slice(0, FLAG_NOTE_MAX))}
                    placeholder="Checkout errors since the 40% step."
                    rows={2}
                />
                <p className="text-xs text-muted-foreground">Optional, {note.length}/{FLAG_NOTE_MAX}.</p>
            </div>
        </ConfirmDialog>
    );
}
