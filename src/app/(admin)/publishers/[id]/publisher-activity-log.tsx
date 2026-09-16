"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { formatDateTime } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import {
    ACCOUNT_ACTIVITY_KINDS,
    ACCOUNT_ACTIVITY_KIND_LABEL,
    activityKindLabel,
    publisherService,
    type AccountActivityKind,
    type PublisherActivityPage,
} from "@/services/publishers";

interface PublisherActivityLogProps {
    publisherId: string;
    /** Whether the row has an agent to log against; without one the API answers 409 and the form says so up front. */
    hasAgent: boolean;
    /** The summary feed reads the same rows back as `ACTIVITY`, so a write re-reads the page. */
    onLogged?: () => void;
}

/**
 * R-C: the action log on the publisher — Check-in, Follow-up, Called,
 * Messaged, Note — written over `POST /publishers/:id/activity` and read
 * back from `GET …/activity`, the mirror of the advertiser's (decision 14).
 *
 * The five kinds are a row of toggles rather than a dropdown: there are
 * five, they never grow without the enum growing, and a call is logged in
 * two clicks. The note is optional; the API refuses an empty one, so a
 * blank box is simply not sent.
 */
export function PublisherActivityLog({ publisherId, hasAgent, onLogged }: PublisherActivityLogProps) {
    const live = isLive("supply");
    const [kind, setKind] = React.useState<AccountActivityKind>("CALLED");
    const [note, setNote] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const log = useApiResource<PublisherActivityPage | null>(`publisher:${publisherId}:activity:${live}`, () =>
        live ? publisherService.activity(publisherId).catch(() => null) : Promise.resolve(null),
    );

    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        try {
            await publisherService.logActivity(publisherId, { kind, note });
            toast.success(`${ACCOUNT_ACTIVITY_KIND_LABEL[kind]} logged`);
            setNote("");
            log.reload();
            onLogged?.();
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 409) {
                toast.error("This account has no agent to log against.");
            } else if (cause instanceof ApiError && cause.status === 403) {
                toast.error("Only the agent this publisher is attributed to, or an admin, can log here.");
            } else {
                toast.error(cause instanceof Error ? cause.message : "That did not reach ADX.");
            }
        } finally {
            setBusy(false);
        }
    }

    const items = log.data?.items ?? [];

    return (
        <Card className="rounded-lg border-border p-5 shadow-none" data-testid="publisher-activity-log">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-semibold text-foreground">Action log</h3>
                {log.data && (
                    <span className="text-xs text-muted-foreground">
                        {log.data.total === 1 ? "1 entry" : `${log.data.total} entries`}
                    </span>
                )}
            </div>

            <form onSubmit={submit} className="mt-3 space-y-3" aria-label="Log an activity">
                <fieldset className="space-y-2" disabled={busy || !live}>
                    <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Log an activity</legend>
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kind">
                        {ACCOUNT_ACTIVITY_KINDS.map((option) => (
                            <Button
                                key={option}
                                type="button"
                                size="sm"
                                variant={option === kind ? "default" : "outline"}
                                role="radio"
                                aria-checked={option === kind}
                                onClick={() => setKind(option)}
                            >
                                {ACCOUNT_ACTIVITY_KIND_LABEL[option]}
                            </Button>
                        ))}
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor={`activity-note-${publisherId}`} className="sr-only">
                            Note
                        </Label>
                        <Textarea
                            id={`activity-note-${publisherId}`}
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            maxLength={1000}
                            rows={2}
                            placeholder="What was said or agreed (optional)"
                        />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                            {!live
                                ? "Logging reads the API; connect the console to the ADX backend first."
                                : hasAgent
                                  ? "Recorded against the publisher's agent; the summary feed reads it back."
                                  : "This account has no agent yet — attribute it before logging against it."}
                        </p>
                        <Button type="submit" size="sm" disabled={busy || !live}>
                            {busy ? "Logging…" : "Log activity"}
                        </Button>
                    </div>
                </fieldset>
            </form>

            {!live ? null : log.loading && !log.data ? (
                <p className="mt-4 text-sm text-muted-foreground">Reading the log…</p>
            ) : log.data === null ? (
                <p className="mt-4 text-sm text-muted-foreground">The log could not be read just now.</p>
            ) : items.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">Nothing logged on this account yet.</p>
            ) : (
                <ol className="mt-4 divide-y divide-border" data-testid="publisher-activity-entries">
                    {items.map((entry) => (
                        <li key={entry.id} className="flex items-start justify-between gap-4 py-2.5 text-sm">
                            <div className="min-w-0">
                                <p className="font-medium text-foreground">{activityKindLabel(entry.kind)}</p>
                                {entry.note && <p className="text-xs text-muted-foreground">{entry.note}</p>}
                            </div>
                            <time dateTime={entry.at} className="shrink-0 text-xs text-muted-foreground">
                                {formatDateTime(entry.at)}
                            </time>
                        </li>
                    ))}
                </ol>
            )}
        </Card>
    );
}
