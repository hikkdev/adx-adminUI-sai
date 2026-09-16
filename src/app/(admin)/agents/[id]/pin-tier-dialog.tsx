"use client";

import * as React from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-client";
import { agentService, tierLabel } from "@/services/agents";
import { AGENT_TIERS, TIER_LEVELS, TIER_NAME_LABEL, type TierLevel, type TierName } from "@/services/growth";

interface PinTierDialogProps {
    agentId: string;
    agentName: string;
    /** Pin a rung, or hand it back to the ladder. */
    mode: "pin" | "unpin";
    /** The rung in force, as the default for a pin. */
    current: { tier: TierName | string; level: TierLevel | string; label: string };
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Called after the write actually lands, so the page refetches. */
    onSaved: () => void;
}

/** The schema's floor for a reason. */
const REASON_MIN = 3;
const REASON_MAX = 300;

/**
 * Pinning a tier from the desk.
 *
 * `PATCH /agents/:id` deliberately cannot write the tier; this is the
 * explicit door — it needs a reason, it is recorded as a tier event with
 * who did it, and it is logged. A pinned rung is left where ops put it on
 * every read until it is unpinned, when the ladder takes it back on the
 * agent's next read.
 */
export function PinTierDialog({ agentId, agentName, mode, current, open, onOpenChange, onSaved }: PinTierDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                {/* Mounted only while open, so the form is fresh each time. */}
                <PinForm
                    agentId={agentId}
                    agentName={agentName}
                    mode={mode}
                    current={current}
                    onClose={() => onOpenChange(false)}
                    onSaved={onSaved}
                />
            </DialogContent>
        </Dialog>
    );
}

const isTier = (value: string): value is TierName => AGENT_TIERS.includes(value as TierName);
const isLevel = (value: string): value is TierLevel => TIER_LEVELS.includes(value as TierLevel);

function PinForm({
    agentId,
    agentName,
    mode,
    current,
    onClose,
    onSaved,
}: Omit<PinTierDialogProps, "open" | "onOpenChange"> & { onClose: () => void }) {
    const [tier, setTier] = React.useState<TierName>(isTier(current.tier) ? current.tier : "BRONZE");
    const [level, setLevel] = React.useState<TierLevel>(isLevel(current.level) ? current.level : "I");
    const [reason, setReason] = React.useState("");
    const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
    const [formError, setFormError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const trimmed = reason.trim();
    const ready = trimmed.length >= REASON_MIN && trimmed.length <= REASON_MAX;

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        setFieldErrors({});
        setFormError(null);
        try {
            const view = await agentService.pinTier(
                agentId,
                mode === "pin" ? { tier, level, reason: trimmed } : { tier: null, reason: trimmed },
            );
            if (mode === "pin") {
                toast.success(`${agentName} pinned at ${view.current.label}`, {
                    description: "Left there on every read until unpinned. Recorded as a tier event and logged.",
                });
            } else {
                toast.success(`${agentName} unpinned`, {
                    description: `Back on the ladder: ${view.current.label} from their onboarded accounts.`,
                });
            }
            onSaved();
            onClose();
        } catch (cause) {
            if (cause instanceof ApiError) {
                setFieldErrors(cause.fieldErrors);
                setFormError(cause.message);
            } else {
                setFormError(cause instanceof Error ? cause.message : "Could not change the tier.");
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>{mode === "pin" ? "Pin a tier" : "Unpin the tier"}</DialogTitle>
                <DialogDescription>
                    {mode === "pin"
                        ? `${agentName} is ${current.label} today. A pinned rung stays where you put it whatever the ladder says, until it is unpinned.`
                        : `${agentName} is pinned at ${current.label}. Unpinning hands the rung back to the ladder on their next read.`}
                </DialogDescription>
            </DialogHeader>

            {mode === "pin" && (
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                        <Label htmlFor="pin-tier">Tier</Label>
                        <Select value={tier} onValueChange={(value) => setTier(value as TierName)}>
                            <SelectTrigger id="pin-tier" className="h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {AGENT_TIERS.map((value) => (
                                    <SelectItem key={value} value={value}>
                                        {TIER_NAME_LABEL[value]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {fieldErrors.tier?.[0] && <p className="text-xs text-danger">{fieldErrors.tier[0]}</p>}
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="pin-level">Level</Label>
                        <Select value={level} onValueChange={(value) => setLevel(value as TierLevel)}>
                            <SelectTrigger id="pin-level" className="h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {TIER_LEVELS.map((value) => (
                                    <SelectItem key={value} value={value}>
                                        {value}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {fieldErrors.level?.[0] && <p className="text-xs text-danger">{fieldErrors.level[0]}</p>}
                    </div>
                    <p className="text-xs text-muted-foreground sm:col-span-2">
                        Pins {agentName} at {tierLabel(tier, level)}.
                    </p>
                </div>
            )}

            <div className="grid gap-1.5">
                <Label htmlFor="pin-reason">Reason</Label>
                <Textarea
                    id="pin-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={3}
                    maxLength={REASON_MAX}
                    placeholder={mode === "pin" ? "Territory lead for the quarter." : "Quarter over; back to the ladder."}
                />
                <p className="text-xs text-muted-foreground">
                    {fieldErrors.reason?.[0] ?? "Required, at least three characters. Recorded on the tier event and in the activity log."}
                </p>
            </div>

            {formError && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p>}

            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onClose}>
                    Cancel
                </Button>
                <Button type="submit" disabled={!ready || busy}>
                    {busy ? "Saving…" : mode === "pin" ? "Pin tier" : "Unpin"}
                </Button>
            </DialogFooter>
        </form>
    );
}
