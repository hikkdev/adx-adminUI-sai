"use client";

import * as React from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { ApiError } from "@/lib/api-client";
import {
    FLAG_NOTE_MAX,
    bulkNoteError,
    flagsService,
    parseRollout,
    type BulkFlagPatch,
    type BulkFlagResult,
    type FeatureFlag,
} from "@/services/flags";

/** What the bar asked for. A variant action carries the list every selected row shares (`sharedVariantsOf`). */
export type BulkAction = { kind: "on" } | { kind: "off" } | { kind: "percent" } | { kind: "variant"; variants: string[] } | { kind: "rollback" };

interface BulkConfirmProps {
    action: BulkAction | null;
    /** The rows the action lands on — the checked ones, or every row the filter leaves. */
    flags: FeatureFlag[];
    onOpenChange: (open: boolean) => void;
    /** After the request lands: the caller clears the selection and reloads. */
    onDone: (result: BulkFlagResult) => void;
}

const KEYS_SHOWN = 10;
const NO_VARIANT = "__default__";

/** "a, b, c … and N more" — the first ten keys, then the count of the rest. */
export function keysPreview(keys: readonly string[], shown = KEYS_SHOWN): { shown: string[]; more: number } {
    return { shown: keys.slice(0, shown), more: Math.max(0, keys.length - shown) };
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** The one-line verdict the toast prints and the collapsible under it — the skipped keys with the server's reason for each. */
export function bulkResultSummary(result: BulkFlagResult, verb: string): string {
    const updated = plural(result.updated.length, "flag");
    return result.skipped.length ? `${updated} ${verb} · ${result.skipped.length} skipped` : `${updated} ${verb}`;
}

function SkippedList({ skipped }: { skipped: BulkFlagResult["skipped"] }) {
    return (
        <div className="space-y-1">
            <p>Takes effect within 30 seconds everywhere. Recorded with your name in the audit log.</p>
            {skipped.length > 0 && (
                <details className="text-xs">
                    <summary className="cursor-pointer select-none font-medium">Why {plural(skipped.length, "key")} skipped</summary>
                    <ul className="mt-1 space-y-0.5">
                        {skipped.map((item) => (
                            <li key={item.key}>
                                <code className="rounded bg-muted px-1 py-0.5">{item.key}</code> — {item.reason}
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </div>
    );
}

const TITLE: Record<BulkAction["kind"], (count: string) => string> = {
    on: (count) => `Turn on ${count}?`,
    off: (count) => `Turn off ${count}?`,
    percent: (count) => `Set the rollout of ${count}?`,
    variant: (count) => `Set the variant of ${count}?`,
    rollback: (count) => `Roll back ${count}?`,
};

const DESCRIPTION: Record<BulkAction["kind"], string> = {
    on: "Every key below is switched on at its current rollout, in one transaction. A key already on is skipped and not written.",
    off: "Every key below is switched off, in one transaction — off is off for everyone, whatever the rollout says. A key already off is skipped.",
    percent: "Every key below gets the same percentage, in one transaction. The switch, the variant and the rules are left as they are.",
    variant: "Every key below runs the same variant, in one transaction. Only offered while every selected key declares that variant.",
    rollback: "Every key below goes back to the position before its last change, in one transaction. A key that has never moved is skipped, and each current position is kept so the rollback can be rolled back.",
};

const VERB: Record<BulkAction["kind"], string> = {
    on: "turned on",
    off: "turned off",
    percent: "moved",
    variant: "moved",
    rollback: "rolled back",
};

/**
 * L-B on the console: one confirm for the five bulk actions. It lists the
 * keys (the first ten, then "and N more"), takes the field the action needs
 * — the percentage, the variant — and the note the bulk routes demand
 * (4-500 characters; there is no bulk move without a reason), then posts
 * ONE request: `POST /flags/bulk` with the patch, or `POST
 * /flags/bulk/rollback`. The answer's `updated` / `skipped` counts are the
 * toast, and the skipped reasons sit in a collapsible under it.
 */
export function BulkConfirm({ action, flags, onOpenChange, onDone }: BulkConfirmProps) {
    /* Mounted only while open, so the note and the field are fresh each time. */
    if (!action) return null;
    return <BulkConfirmBody action={action} flags={flags} onOpenChange={onOpenChange} onDone={onDone} />;
}

function BulkConfirmBody({ action, flags, onOpenChange, onDone }: BulkConfirmProps & { action: BulkAction }) {
    const [note, setNote] = React.useState("");
    const [percent, setPercent] = React.useState("");
    const [variant, setVariant] = React.useState<string | null | undefined>(undefined);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const keys = flags.map((flag) => flag.key);
    const preview = keysPreview(keys);
    const noteError = bulkNoteError(note);
    const percentValue = parseRollout(percent);

    const patch: BulkFlagPatch | null =
        action.kind === "on"
            ? { enabled: true }
            : action.kind === "off"
              ? { enabled: false }
              : action.kind === "percent"
                ? percentValue === null
                    ? null
                    : { rolloutPercent: percentValue }
                : action.kind === "variant"
                  ? variant === undefined
                      ? null
                      : { variant }
                  : null;

    const ready = keys.length > 0 && noteError === null && (action.kind === "rollback" || patch !== null);

    async function confirm() {
        if (!ready || busy) return;
        setBusy(true);
        setError(null);
        try {
            const result = action.kind === "rollback" ? await flagsService.bulkRollback(keys, note) : await flagsService.bulk(keys, patch!, note);
            toast.success(bulkResultSummary(result, VERB[action.kind]), { description: <SkippedList skipped={result.skipped} /> });
            onDone(result);
            onOpenChange(false);
        } catch (cause) {
            setError(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "The bulk move did not reach ADX.");
        } finally {
            setBusy(false);
        }
    }

    const count = plural(keys.length, "flag");

    return (
        <ConfirmDialog
            open
            onOpenChange={onOpenChange}
            title={TITLE[action.kind](count)}
            description={DESCRIPTION[action.kind]}
            confirmLabel={action.kind === "rollback" ? "Roll back" : action.kind === "off" ? "Turn off" : action.kind === "on" ? "Turn on" : "Apply"}
            destructive={action.kind === "off" || action.kind === "rollback"}
            busy={busy}
            disabled={!ready}
            onConfirm={() => void confirm()}
        >
            <div className="space-y-4">
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs" data-testid="bulk-keys">
                    <ul className="space-y-0.5">
                        {preview.shown.map((key) => (
                            <li key={key}>
                                <code>{key}</code>
                            </li>
                        ))}
                    </ul>
                    {preview.more > 0 && <p className="mt-1 text-muted-foreground">and {preview.more} more</p>}
                </div>

                {action.kind === "percent" && (
                    <div className="space-y-1.5">
                        <Label htmlFor="bulk-percent">Rollout</Label>
                        <div className="flex items-center gap-2">
                            <Input
                                id="bulk-percent"
                                inputMode="numeric"
                                value={percent}
                                onChange={(event) => setPercent(event.target.value)}
                                className="w-24"
                                autoFocus
                                aria-invalid={percent !== "" && percentValue === null ? true : undefined}
                            />
                            <span className="text-sm text-muted-foreground">% of users</span>
                        </div>
                        <p className="text-xs text-muted-foreground">A whole number from 0 to 100. Under 100, each person is bucketed once per flag and keeps the same answer.</p>
                    </div>
                )}

                {action.kind === "variant" && (
                    <div className="space-y-1.5">
                        <Label htmlFor="bulk-variant">Variant</Label>
                        <Select
                            value={variant === undefined ? "" : (variant ?? NO_VARIANT)}
                            onValueChange={(value) => setVariant(value === NO_VARIANT ? null : value)}
                        >
                            <SelectTrigger id="bulk-variant" className="bg-card" aria-label="Variant">
                                <SelectValue placeholder="Pick a variant" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NO_VARIANT}>Default implementation</SelectItem>
                                {action.variants.map((item) => (
                                    <SelectItem key={item} value={item}>
                                        {item}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">Every selected flag declares {action.variants.join(", ")}.</p>
                    </div>
                )}

                <div className="space-y-1.5">
                    <Label htmlFor="bulk-note">Why</Label>
                    <Textarea
                        id="bulk-note"
                        value={note}
                        onChange={(event) => setNote(event.target.value.slice(0, FLAG_NOTE_MAX))}
                        placeholder="Incident 4231 — pausing every experiment on the agent app."
                        rows={2}
                        aria-invalid={note.trim() && noteError ? true : undefined}
                    />
                    <p className={note.trim() && noteError ? "text-xs text-danger" : "text-xs text-muted-foreground"}>
                        {note.trim() && noteError ? noteError : `Required, ${note.length}/${FLAG_NOTE_MAX}. Kept on every change row this writes.`}
                    </p>
                </div>

                {error && <p className="text-sm text-danger">{error}</p>}
            </div>
        </ConfirmDialog>
    );
}
