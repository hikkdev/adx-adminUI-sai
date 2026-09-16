"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/adx/status-badge";
import {
    AGENT_ORDER_TYPES,
    ORDER_TYPE_LABEL,
    WEEKDAYS,
    WEEKDAY_LABEL,
    agentService,
    type UpdateAgentInput,
} from "@/services/agents";
import { AGENT_STATUS_META, type Agent, type AgentOrderType, type Weekday } from "@/types";

interface EditAgentDialogProps {
    agent: Agent;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Re-read the agent after a save. */
    onSaved: () => void;
}

interface Draft {
    city: string;
    state: string;
    businessName: string;
    territory: string;
    homeZone: string;
    radiusKm: string;
    workingDays: Weekday[];
    hoursFrom: string;
    hoursTo: string;
    autoAcceptInZone: boolean;
    orderTypes: AgentOrderType[];
    maxActiveOrders: string;
}

const draftOf = (agent: Agent): Draft => ({
    city: agent.city ?? "",
    state: agent.state ?? "",
    businessName: agent.businessName ?? "",
    territory: agent.territory ?? "",
    homeZone: agent.homeZone ?? "",
    radiusKm: agent.radiusKm === null ? "" : String(agent.radiusKm),
    workingDays: agent.workingDays,
    hoursFrom: agent.hoursFrom ?? "",
    hoursTo: agent.hoursTo ?? "",
    autoAcceptInZone: agent.autoAcceptInZone,
    orderTypes: agent.orderTypes,
    maxActiveOrders: agent.maxActiveOrders === null ? "" : String(agent.maxActiveOrders),
});

const text = (value: string): string | null => (value.trim() ? value.trim() : null);
const integer = (value: string): number | null => (value.trim() ? Number(value) : null);

/**
 * Only what changed goes on the wire: the API leaves an omitted key alone
 * and clears one sent as null, so a save that touched one field is one field.
 *
 * The status is not here. Since Lot A it is derived: BLOCK_NEW on the agent
 * sets it SUSPENDED and lifting BLOCK_NEW restores it, so the Suspend and
 * Reinstate dialogs on the profile page are the only door, and this patch
 * never carries a `status` that could let work through a live suspension.
 */
export function patchOf(agent: Agent, draft: Draft): UpdateAgentInput {
    const patch: UpdateAgentInput = {};
    const textFields = ["city", "state", "businessName", "territory", "homeZone"] as const;
    for (const key of textFields) {
        const next = text(draft[key]);
        if (next !== agent[key]) patch[key] = next;
    }
    if (integer(draft.radiusKm) !== agent.radiusKm) patch.radiusKm = integer(draft.radiusKm);
    if (integer(draft.maxActiveOrders) !== agent.maxActiveOrders) patch.maxActiveOrders = integer(draft.maxActiveOrders);
    if (text(draft.hoursFrom) !== agent.hoursFrom) patch.hoursFrom = text(draft.hoursFrom);
    if (text(draft.hoursTo) !== agent.hoursTo) patch.hoursTo = text(draft.hoursTo);
    if (draft.autoAcceptInZone !== agent.autoAcceptInZone) patch.autoAcceptInZone = draft.autoAcceptInZone;
    const sameSet = <T,>(a: T[], b: T[]) => a.length === b.length && a.every((item) => b.includes(item));
    if (!sameSet(draft.workingDays, agent.workingDays)) patch.workingDays = WEEKDAYS.filter((day) => draft.workingDays.includes(day));
    if (!sameSet(draft.orderTypes, agent.orderTypes)) patch.orderTypes = AGENT_ORDER_TYPES.filter((type) => draft.orderTypes.includes(type));
    return patch;
}

/**
 * The profile as ops keeps it (D5): DR 07's edit-profile and work-preferences
 * screens, plus the facts only the desk decides — the territory and whether
 * the agent is offered work.
 */
export function EditAgentDialog({ agent, open, onOpenChange, onSaved }: EditAgentDialogProps) {
    const [draft, setDraft] = React.useState<Draft>(() => draftOf(agent));
    const [saving, setSaving] = React.useState(false);

    const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
    const toggle = <T,>(list: T[], item: T): T[] => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

    const hoursOutOfOrder = Boolean(draft.hoursFrom && draft.hoursTo && draft.hoursFrom >= draft.hoursTo);

    const save = async () => {
        if (hoursOutOfOrder) {
            toast.error("Hours must start before they end.");
            return;
        }
        const patch = patchOf(agent, draft);
        if (Object.keys(patch).length === 0) {
            onOpenChange(false);
            return;
        }
        setSaving(true);
        try {
            await agentService.update(agent.id, patch);
            toast.success("Profile saved");
            onOpenChange(false);
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The profile did not reach ADX.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (next) setDraft(draftOf(agent));
                onOpenChange(next);
            }}
        >
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Edit profile</DialogTitle>
                    <DialogDescription>
                        Where {agent.name ?? agent.mobile} works and when. Saved to the profile the field app
                        reads. Whether they are offered work is a suspension, set from the profile page.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5">
                    <section className="space-y-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Standing</h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label>Status</Label>
                                <div className="flex h-9 items-center" data-testid="agent-status-readonly">
                                    <StatusBadge status={AGENT_STATUS_META[agent.status]} />
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Derived, not edited: Block new on the profile page suspends them from the sweep,
                                    and reinstating lifts it.
                                </p>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="agent-territory">Territory</Label>
                                <Input
                                    id="agent-territory"
                                    value={draft.territory}
                                    onChange={(event) => set("territory", event.target.value)}
                                    placeholder="Bengaluru South"
                                />
                            </div>
                        </div>
                    </section>

                    <section className="space-y-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Profile</h3>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="agent-city">City</Label>
                                <Input id="agent-city" value={draft.city} onChange={(event) => set("city", event.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="agent-state">State</Label>
                                <Input id="agent-state" value={draft.state} onChange={(event) => set("state", event.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="agent-business">Business / org</Label>
                                <Input
                                    id="agent-business"
                                    value={draft.businessName}
                                    onChange={(event) => set("businessName", event.target.value)}
                                    placeholder="Independent agent"
                                />
                            </div>
                        </div>
                    </section>

                    <section className="space-y-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Service area</h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="agent-zone">Home zone</Label>
                                <Input
                                    id="agent-zone"
                                    value={draft.homeZone}
                                    onChange={(event) => set("homeZone", event.target.value)}
                                    placeholder="Koramangala"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="agent-radius">Radius (km)</Label>
                                <Input
                                    id="agent-radius"
                                    type="number"
                                    min={1}
                                    max={100}
                                    value={draft.radiusKm}
                                    onChange={(event) => set("radiusKm", event.target.value)}
                                    placeholder="8"
                                />
                            </div>
                        </div>
                    </section>

                    <section className="space-y-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Availability</h3>
                        <div className="flex flex-wrap gap-3">
                            {WEEKDAYS.map((day) => (
                                <label key={day} className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                        checked={draft.workingDays.includes(day)}
                                        onCheckedChange={() => set("workingDays", toggle(draft.workingDays, day))}
                                        aria-label={WEEKDAY_LABEL[day]}
                                    />
                                    {WEEKDAY_LABEL[day]}
                                </label>
                            ))}
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="agent-hours-from">Hours from</Label>
                                <Input
                                    id="agent-hours-from"
                                    type="time"
                                    value={draft.hoursFrom}
                                    onChange={(event) => set("hoursFrom", event.target.value)}
                                    aria-invalid={hoursOutOfOrder || undefined}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="agent-hours-to">Hours to</Label>
                                <Input
                                    id="agent-hours-to"
                                    type="time"
                                    value={draft.hoursTo}
                                    onChange={(event) => set("hoursTo", event.target.value)}
                                    aria-invalid={hoursOutOfOrder || undefined}
                                />
                            </div>
                            <div className="flex items-end justify-between gap-3 pb-2">
                                <Label htmlFor="agent-auto-accept" className="leading-snug">
                                    Auto-accept in their zone
                                </Label>
                                <Switch
                                    id="agent-auto-accept"
                                    checked={draft.autoAcceptInZone}
                                    onCheckedChange={(checked) => set("autoAcceptInZone", checked)}
                                />
                            </div>
                        </div>
                    </section>

                    <section className="space-y-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Orders</h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Order types</Label>
                                <div className="flex flex-wrap gap-3">
                                    {AGENT_ORDER_TYPES.map((type) => (
                                        <label key={type} className="flex items-center gap-2 text-sm">
                                            <Checkbox
                                                checked={draft.orderTypes.includes(type)}
                                                onCheckedChange={() => set("orderTypes", toggle(draft.orderTypes, type))}
                                                aria-label={ORDER_TYPE_LABEL[type]}
                                            />
                                            {ORDER_TYPE_LABEL[type]}
                                        </label>
                                    ))}
                                </div>
                                <p className="text-xs text-muted-foreground">None ticked means any.</p>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="agent-max-orders">Max active orders</Label>
                                <Input
                                    id="agent-max-orders"
                                    type="number"
                                    min={1}
                                    max={20}
                                    value={draft.maxActiveOrders}
                                    onChange={(event) => set("maxActiveOrders", event.target.value)}
                                    placeholder="No cap"
                                />
                                <p className="text-xs text-muted-foreground">
                                    The sweep stops offering once they hold this many.
                                </p>
                            </div>
                        </div>
                    </section>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={() => void save()} disabled={saving || hoursOutOfOrder}>
                        Save changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
