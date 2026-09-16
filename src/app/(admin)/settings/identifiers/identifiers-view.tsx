"use client";

import * as React from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/adx/page-header";
import { SectionCard } from "@/components/adx/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { identifierService, partyLabel } from "@/services/identifiers";
import { PATTERN_TOKENS, renderIdentifierPreview, type IdentifierFormat } from "@/types";

interface Props {
    /**
     * Every party the server mints for, one row each, in the console's
     * order — `identifierService.formatsForEveryParty()`. The chips are
     * these rows, so a series the server adds shows up here without a
     * console release (Q-C item 4).
     */
    formats: IdentifierFormat[];
    onSaved: () => void;
}

/**
 * What the editor holds for one party. Every row comes from the server,
 * so there is no default prefix here to invent one; a party the list does
 * not carry (it always does) starts blank and invalid until typed.
 */
function draftFor(formats: IdentifierFormat[], party: string) {
    const found = formats.find((f) => f.party === party);
    return {
        prefix: found?.prefix ?? "",
        pattern: found?.pattern ?? "{PREFIX}-{DD}{MM}-{YY}{SEQ}",
        seqPadding: found?.seqPadding ?? 2,
        timeZone: found?.timeZone ?? "Asia/Kolkata",
    };
}

export function IdentifiersView({ formats, onSaved }: Props) {
    const parties = formats.map((format) => format.party as string);
    const [party, setParty] = React.useState<string>(parties[0] ?? "PUBLISHER");
    const [draft, setDraft] = React.useState(() => draftFor(formats, parties[0] ?? "PUBLISHER"));
    const [saving, setSaving] = React.useState(false);
    const [backfilling, setBackfilling] = React.useState(false);

    // Switching party loads that party's format rather than carrying the last
    // one over, which would silently save the wrong shape.
    const selectParty = (next: string) => {
        setParty(next);
        setDraft(draftFor(formats, next));
    };

    const missingSeq = !draft.pattern.includes("{SEQ}");
    const unknownToken = draft.pattern
        .replace(/\{(PREFIX|DD|MM|YY|YYYY|SEQ)\}/g, "")
        .match(/\{[^}]*\}/)?.[0];
    const badPrefix = !/^[A-Z0-9]{1,8}$/.test(draft.prefix);
    const invalid = missingSeq || !!unknownToken || badPrefix;

    const now = new Date();
    const samples = [1, 2, 12].map((seq) => {
        try {
            return renderIdentifierPreview(draft, now, seq);
        } catch {
            // An unrecognised time zone throws inside Intl rather than quietly
            // returning something wrong. Show a dash until it is typed out.
            return "—";
        }
    });

    const save = async () => {
        if (invalid || saving) return;
        setSaving(true);
        try {
            await identifierService.updateFormat(party, draft);
            // Changing the format never rewrites an identifier already issued —
            // those are stored on the party row, so this affects only the next.
            toast.success(`Next ${partyLabel(party).toLowerCase()} identifier: ${samples[0]}`);
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not save the format");
        } finally {
            setSaving(false);
        }
    };

    const backfill = async () => {
        if (backfilling) return;
        setBackfilling(true);
        try {
            const { assigned, remaining } = await identifierService.backfillPublishers();
            toast.success(
                assigned === 0
                    ? "Every publisher already has an identifier"
                    : `Issued ${assigned} identifier${assigned === 1 ? "" : "s"}` +
                          (remaining > 0 ? `, ${remaining} still to go` : "")
            );
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not run the backfill");
        } finally {
            setBackfilling(false);
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Identifiers"
                subtitle="The code shown under each party's name. Changing the shape affects only identifiers issued from now on."
                actions={
                    <Button size="sm" onClick={save} disabled={invalid || saving}>
                        {saving ? "Saving…" : "Save format"}
                    </Button>
                }
            />

            <div className="flex flex-wrap gap-2">
                {parties.map((value) => (
                    <button
                        key={value}
                        type="button"
                        onClick={() => selectParty(value)}
                        className={cn(
                            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                            party === value
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {partyLabel(value)}
                    </button>
                ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard
                    title={`${partyLabel(party)} format`}
                    description="Tokens are replaced when an identifier is issued. Anything else is kept literally."
                >
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="prefix">Prefix</Label>
                            <Input
                                id="prefix"
                                value={draft.prefix}
                                onChange={(e) =>
                                    setDraft({ ...draft, prefix: e.target.value.toUpperCase() })
                                }
                                maxLength={8}
                            />
                            {badPrefix && (
                                <p className="text-xs text-danger">
                                    Up to eight capitals or digits, and not empty.
                                </p>
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="padding">Sequence digits</Label>
                            <Input
                                id="padding"
                                type="number"
                                min={1}
                                max={6}
                                value={draft.seqPadding}
                                onChange={(e) =>
                                    setDraft({ ...draft, seqPadding: Number(e.target.value) || 1 })
                                }
                            />
                            <p className="text-xs text-muted-foreground">
                                A minimum width, not a limit. The 143rd joiner on a two-digit day
                                gets 143, never a repeat.
                            </p>
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                            <Label htmlFor="pattern">Pattern</Label>
                            <Input
                                id="pattern"
                                value={draft.pattern}
                                onChange={(e) => setDraft({ ...draft, pattern: e.target.value })}
                                className="font-mono"
                            />
                            {missingSeq && (
                                <p className="text-xs text-danger">
                                    Include {"{SEQ}"} — without it, two parties joining on the same
                                    day would share an identifier.
                                </p>
                            )}
                            {unknownToken && (
                                <p className="text-xs text-danger">
                                    {unknownToken} is not a token. It would be printed literally.
                                </p>
                            )}
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                            <Label htmlFor="tz">Time zone</Label>
                            <Input
                                id="tz"
                                value={draft.timeZone}
                                onChange={(e) => setDraft({ ...draft, timeZone: e.target.value })}
                            />
                            <p className="text-xs text-muted-foreground">
                                Decides which calendar day a signup falls on. Someone joining at
                                00:30 IST joined today in Bengaluru and yesterday in UTC.
                            </p>
                        </div>
                    </div>
                </SectionCard>

                <div className="space-y-4">
                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <p className="text-xs font-medium text-muted-foreground">
                            Next three issued today
                        </p>
                        <div className="mt-3 space-y-1.5">
                            {samples.map((sample, index) => (
                                <p
                                    key={`${sample}-${index}`}
                                    className={cn(
                                        "font-mono tabular-nums",
                                        index === 0
                                            ? "text-lg font-semibold text-foreground"
                                            : "text-sm text-muted-foreground"
                                    )}
                                >
                                    {sample}
                                </p>
                            ))}
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">
                            The third is the twelfth joiner, so you can see how the sequence reads
                            once a day gets busy.
                        </p>
                    </Card>

                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <p className="text-xs font-medium text-muted-foreground">Tokens</p>
                        <dl className="mt-3 space-y-2">
                            {PATTERN_TOKENS.map(({ token, meaning }) => (
                                <div key={token} className="flex gap-3 text-xs">
                                    <dt className="w-20 shrink-0 font-mono text-foreground">
                                        {token}
                                    </dt>
                                    <dd className="text-muted-foreground">{meaning}</dd>
                                </div>
                            ))}
                        </dl>
                    </Card>

                    {party === "PUBLISHER" && (
                        <Card className="rounded-lg border-border p-5 shadow-none">
                            <p className="text-sm font-medium text-foreground">
                                Publishers from before this existed
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Issues an identifier against each publisher&apos;s own signup date,
                                oldest first, so the date in the code stays true. Safe to run more
                                than once.
                            </p>
                            <Button
                                size="sm"
                                variant="outline"
                                className="mt-3"
                                onClick={backfill}
                                disabled={backfilling}
                            >
                                {backfilling ? "Issuing…" : "Issue missing identifiers"}
                            </Button>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
