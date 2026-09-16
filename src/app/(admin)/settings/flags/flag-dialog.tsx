"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-client";
import {
    FLAG_NOTE_MAX,
    ROLLOUT_LIMITS,
    flagPatch,
    flagsService,
    parseRollout,
    parseRolloutDraft,
    rolloutLabel,
    rolloutRulesLabel,
    rolloutToDraft,
    type FeatureFlag,
    type RolloutDraft,
} from "@/services/flags";

interface FlagDialogProps {
    flag: FeatureFlag | null;
    onOpenChange: (open: boolean) => void;
    /** Called after the PATCH lands, so the list refetches. */
    onSaved: () => void;
}

const NO_VARIANT = "__default__";

/**
 * The rollout editor: the switch, the percentage, the variant, the three
 * rule lists — roles, cities, named accounts — and a note on why.
 *
 * It sends a patch — only what moved — so widening the percentage does not
 * re-send a variant somebody else is switching. The rules are validated
 * here the way `rolloutSchema` validates them on the server, so the
 * refusal names the line rather than the field.
 */
export function FlagDialog({ flag, onOpenChange, onSaved }: FlagDialogProps) {
    return (
        <Dialog open={flag !== null} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                {/* Mounted only while open, so the form is fresh each time. */}
                {flag && <FlagForm flag={flag} onClose={() => onOpenChange(false)} onSaved={onSaved} />}
            </DialogContent>
        </Dialog>
    );
}

function FlagForm({ flag, onClose, onSaved }: { flag: FeatureFlag; onClose: () => void; onSaved: () => void }) {
    const [enabled, setEnabled] = React.useState(flag.enabled);
    const [percent, setPercent] = React.useState(String(flag.rolloutPercent));
    const [variant, setVariant] = React.useState<string | null>(flag.variant ?? null);
    const [rules, setRules] = React.useState<RolloutDraft>(() => rolloutToDraft(flag.rollout));
    const [note, setNote] = React.useState("");
    const [error, setError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const percentValue = parseRollout(percent);
    const parsedRules = parseRolloutDraft(rules);
    const valid = percentValue !== null && Object.keys(parsedRules.errors).length === 0;
    const patch = valid ? flagPatch(flag, { enabled, rolloutPercent: percentValue, variant, rollout: parsedRules.rollout, note }) : null;
    const preview = percentValue === null ? null : rolloutLabel({ enabled, rolloutPercent: percentValue });
    const rulesPreview = rolloutRulesLabel(parsedRules.rollout);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!patch || busy) return;
        setBusy(true);
        setError(null);
        try {
            const next = await flagsService.set(flag.key, patch);
            toast.success(`${flag.key} · ${rolloutLabel(next)}`, {
                description: "Takes effect within 30 seconds everywhere. Recorded with your name in the audit log.",
            });
            onSaved();
            onClose();
        } catch (cause) {
            setError(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "Could not move the flag.");
        } finally {
            setBusy(false);
        }
    }

    const setRule = (axis: keyof RolloutDraft) => (event: React.ChangeEvent<HTMLTextAreaElement>) =>
        setRules((current) => ({ ...current, [axis]: event.target.value }));

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <DialogHeader>
                <DialogTitle>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-sm">{flag.key}</code>
                </DialogTitle>
                <DialogDescription>{flag.description ?? "No description on this flag."}</DialogDescription>
            </DialogHeader>

            <label className="flex items-center justify-between gap-4">
                <span>
                    <span className="block text-sm font-medium text-foreground">Enabled</span>
                    <span className="block text-xs text-muted-foreground">Off is off for everyone, whatever the rollout says.</span>
                </span>
                <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Enabled" data-testid="flag-enabled" />
            </label>

            <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <Label htmlFor="flag-rollout">Rollout</Label>
                    <div className="flex items-center gap-2">
                        <Input
                            id="flag-rollout"
                            inputMode="numeric"
                            value={percent}
                            onChange={(event) => setPercent(event.target.value)}
                            className="w-24"
                            aria-invalid={percentValue === null || undefined}
                        />
                        <span className="text-sm text-muted-foreground">% of users</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {percentValue === null ? "A whole number from 0 to 100." : `${preview}. Under 100, each person is bucketed once and keeps the same answer.`}
                    </p>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="flag-variant">Variant</Label>
                    {flag.variants.length ? (
                        <Select value={variant ?? NO_VARIANT} onValueChange={(value) => setVariant(value === NO_VARIANT ? null : value)}>
                            <SelectTrigger id="flag-variant" className="bg-card" aria-label="Variant">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NO_VARIANT}>Default implementation</SelectItem>
                                {flag.variants.map((item) => (
                                    <SelectItem key={item} value={item}>
                                        {item}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : (
                        <p className="py-2 text-sm text-muted-foreground">This feature declares no variants.</p>
                    )}
                </div>
            </div>

            <fieldset className="space-y-3">
                <legend className="text-sm font-medium text-foreground">Who the rollout reaches</legend>
                <p className="text-xs text-muted-foreground">
                    Named accounts are an allowlist — while the list is set, nobody else is on. Roles and cities narrow the percentage
                    bucket. One per line, or comma-separated; leave every list empty for no rules.
                    {rulesPreview ? ` Now: ${rulesPreview}.` : ""}
                </p>
                {(
                    [
                        ["userIds", "Named accounts", `User ids, at most ${ROLLOUT_LIMITS.userIds}.`],
                        ["roles", "Roles", `ADMIN, AGENT, PUBLISHER, ADVERTISER, AGENT_PUBLISHER… at most ${ROLLOUT_LIMITS.roles}.`],
                        ["cities", "Cities", `As the party's profile spells them, at most ${ROLLOUT_LIMITS.cities}.`],
                    ] as const
                ).map(([axis, label, hint]) => (
                    <div key={axis} className="space-y-1">
                        <Label htmlFor={`flag-rule-${axis}`}>{label}</Label>
                        <Textarea
                            id={`flag-rule-${axis}`}
                            value={rules[axis]}
                            onChange={setRule(axis)}
                            rows={2}
                            className="font-mono text-xs"
                            aria-invalid={parsedRules.errors[axis] ? true : undefined}
                            data-testid={`flag-rule-${axis}`}
                        />
                        <p className={parsedRules.errors[axis] ? "text-xs text-danger" : "text-xs text-muted-foreground"}>
                            {parsedRules.errors[axis] ?? hint}
                        </p>
                    </div>
                ))}
            </fieldset>

            <div className="space-y-1.5">
                <Label htmlFor="flag-note">Why</Label>
                <Textarea
                    id="flag-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value.slice(0, FLAG_NOTE_MAX))}
                    placeholder="Widening to the Bengaluru pilot after Friday's numbers."
                    rows={2}
                />
                <p className="text-xs text-muted-foreground">
                    Optional, {note.length}/{FLAG_NOTE_MAX}. Kept on the change row for whoever reads the history next.
                </p>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button type="submit" disabled={!patch || busy} data-testid="flag-save">
                    {busy ? "Saving…" : patch ? "Move flag" : valid ? "Nothing changed" : "Fix the rules first"}
                </Button>
            </DialogFooter>
        </form>
    );
}
