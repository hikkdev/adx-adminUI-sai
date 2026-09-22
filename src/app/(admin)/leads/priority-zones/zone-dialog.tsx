"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { LEAD_SIDE_LABEL, leadsService, type LeadSide, type PriorityZone, type Ring } from "@/services/leads";

const BOTH = "BOTH";
const AMOUNT = /^\d{1,7}(\.\d{1,2})?$/;

/** A Date as the `<input type="datetime-local">` value, in the browser's zone. */
function localInput(iso: string | null): string {
    if (!iso) return "";
    const date = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The default window a new zone takes: from now, for two weeks. */
function defaultWindow(now = new Date()): { startsAt: string; endsAt: string } {
    return { startsAt: localInput(now.toISOString()), endsAt: localInput(new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()) };
}

interface Draft {
    name: string;
    side: LeadSide | typeof BOTH;
    category: string;
    topUp: string;
    startsAt: string;
    endsAt: string;
    budgetCap: string;
    isActive: boolean;
}

const fromZone = (zone: PriorityZone | null): Draft =>
    zone
        ? { name: zone.name, side: zone.side ?? BOTH, category: zone.category ?? "", topUp: Number(zone.topUp) > 0 ? String(Number(zone.topUp)) : "", startsAt: localInput(zone.startsAt), endsAt: localInput(zone.endsAt), budgetCap: zone.budgetCap ? String(Number(zone.budgetCap)) : "", isActive: zone.isActive }
        : { name: "", side: BOTH, category: "", topUp: "", ...defaultWindow(), budgetCap: "", isActive: true };

/**
 * LH5 (D7): a priority zone — a drawn area, a category, or both, worth a
 * fixed top-up per activation for a while, under its own budget and the
 * platform's monthly cap. From the map the ring comes with it; from the
 * desk a zone is a category (a "walls this fortnight" push).
 */
export function ZoneDialog({
    open,
    onOpenChange,
    zone,
    polygon,
    defaultTopUp,
    onSaved,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Editing this one; null creates. */
    zone: PriorityZone | null;
    /** The ring a new zone takes, from the map's draw tool; none from the desk. */
    polygon?: Ring | null;
    /** The platform's default top-up, printed as the placeholder. */
    defaultTopUp?: string;
    onSaved: (zone: PriorityZone) => void;
}) {
    const [draft, setDraft] = React.useState<Draft>(fromZone(zone));
    const [busy, setBusy] = React.useState(false);
    const [wasOpen, setWasOpen] = React.useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) setDraft(fromZone(zone));
    }
    const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

    const creating = zone === null;
    const hasRing = creating ? Boolean(polygon && polygon.length >= 3) : zone.polygon !== null;
    const problems = {
        name: draft.name.trim().length < 2,
        shape: creating && !hasRing && draft.category.trim() === "",
        topUp: draft.topUp.trim() !== "" && !AMOUNT.test(draft.topUp.trim()),
        budgetCap: draft.budgetCap.trim() !== "" && !AMOUNT.test(draft.budgetCap.trim()),
        window: !draft.startsAt || !draft.endsAt || new Date(draft.endsAt) <= new Date(draft.startsAt),
    };
    const valid = !Object.values(problems).some(Boolean);

    async function submit() {
        if (!valid || busy) return;
        setBusy(true);
        try {
            const common = {
                name: draft.name.trim(),
                topUp: draft.topUp.trim() ? Number(draft.topUp) : 0,
                startsAt: new Date(draft.startsAt).toISOString(),
                endsAt: new Date(draft.endsAt).toISOString(),
                budgetCap: draft.budgetCap.trim() ? Number(draft.budgetCap) : null,
            };
            const saved = creating
                ? await leadsService.createPriorityZone({
                      ...common,
                      ...(draft.side !== BOTH ? { side: draft.side } : {}),
                      ...(polygon && polygon.length >= 3 ? { polygon } : {}),
                      ...(draft.category.trim() ? { category: draft.category.trim() } : {}),
                  })
                : await leadsService.updatePriorityZone(zone.id, { ...common, isActive: draft.isActive });
            toast.success(creating ? `${saved.name} is live` : `${saved.name} saved`);
            onOpenChange(false);
            onSaved(saved);
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "That did not reach ADX.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg" data-testid="zone-dialog">
                <DialogHeader>
                    <DialogTitle>{creating ? "Save as a priority zone" : `Edit ${zone.name}`}</DialogTitle>
                    <DialogDescription>
                        {hasRing
                            ? "An activation inside the area pays the agent the standard rate plus this top-up, until the window closes or the budget is spent."
                            : "Without an area the zone is a category push: every activation of the category pays the top-up, until the window closes or the budget is spent."}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="zone-name">Name</Label>
                        <Input id="zone-name" value={draft.name} onChange={(event) => set("name", event.target.value)} maxLength={80} placeholder="Koramangala walls, September" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label>Side</Label>
                            <Select value={draft.side} onValueChange={(value) => set("side", value as Draft["side"])} disabled={!creating}>
                                <SelectTrigger aria-label="Side">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={BOTH}>Both sides</SelectItem>
                                    <SelectItem value="PUBLISHER">{LEAD_SIDE_LABEL.PUBLISHER}</SelectItem>
                                    <SelectItem value="ADVERTISER">{LEAD_SIDE_LABEL.ADVERTISER}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="zone-category">Category{hasRing ? " (optional)" : ""}</Label>
                            <Input id="zone-category" value={draft.category} onChange={(event) => set("category", event.target.value)} maxLength={60} placeholder="Wall" disabled={!creating} aria-invalid={problems.shape || undefined} />
                        </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="zone-top-up">Top-up per activation (₹)</Label>
                            <Input id="zone-top-up" inputMode="decimal" value={draft.topUp} onChange={(event) => set("topUp", event.target.value)} placeholder={defaultTopUp ? `${defaultTopUp} — the platform's default` : "The platform's default"} aria-invalid={problems.topUp || undefined} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="zone-budget">Budget cap (₹)</Label>
                            <Input id="zone-budget" inputMode="decimal" value={draft.budgetCap} onChange={(event) => set("budgetCap", event.target.value)} placeholder="No cap" aria-invalid={problems.budgetCap || undefined} />
                        </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="zone-starts">From</Label>
                            <Input id="zone-starts" type="datetime-local" value={draft.startsAt} onChange={(event) => set("startsAt", event.target.value)} aria-invalid={problems.window || undefined} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="zone-ends">Until</Label>
                            <Input id="zone-ends" type="datetime-local" value={draft.endsAt} onChange={(event) => set("endsAt", event.target.value)} aria-invalid={problems.window || undefined} />
                        </div>
                    </div>
                    {problems.window && draft.startsAt && draft.endsAt ? <p className="text-xs text-danger">The zone must end after it starts.</p> : null}
                    {!creating ? (
                        <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                            <span>Zone on</span>
                            <Switch checked={draft.isActive} onCheckedChange={(value) => set("isActive", value)} aria-label="Zone on" />
                        </label>
                    ) : null}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button onClick={() => void submit()} disabled={busy || !valid} data-testid="zone-save">
                        {busy ? "Saving…" : creating ? "Save zone" : "Save"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
