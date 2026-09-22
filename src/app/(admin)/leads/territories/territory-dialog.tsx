"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { agentLabel, type AgentSummary } from "@/services/agents";
import { LEAD_SIDE_LABEL, leadsService, type LeadSide, type Ring, type Territory } from "@/services/leads";

/**
 * LH5 (D8): a territory — a name, a side, the agent whose new leads it
 * routes, and the ring drawn on the map. Route-only: the map stays open to
 * every agent of the side. Editing changes the name, the agent or whether
 * it is on; a new ring is drawn on the map page.
 */
export function TerritoryDialog({
    open,
    onOpenChange,
    territory,
    polygon,
    agents,
    onSaved,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Editing this one; null creates. */
    territory: Territory | null;
    /** The ring a new territory takes, from the map's draw tool. */
    polygon?: Ring | null;
    agents: AgentSummary[];
    onSaved: (territory: Territory) => void;
}) {
    const [name, setName] = React.useState("");
    const [side, setSide] = React.useState<LeadSide>("PUBLISHER");
    const [agentId, setAgentId] = React.useState("");
    const [isActive, setIsActive] = React.useState(true);
    const [busy, setBusy] = React.useState(false);
    const [seededFor, setSeededFor] = React.useState<string | null>(null);

    // The form takes the row's values when the dialog opens on a new row — derived, not an effect.
    const seedKey = open ? (territory?.id ?? "new") : null;
    if (seedKey !== seededFor) {
        setSeededFor(seedKey);
        if (seedKey !== null) {
            setName(territory?.name ?? "");
            setSide(territory?.side ?? "PUBLISHER");
            setAgentId(territory?.agentId ?? "");
            setIsActive(territory?.isActive ?? true);
        }
    }

    const creating = territory === null;
    const valid = name.trim().length >= 2 && agentId.length > 0 && (!creating || (polygon && polygon.length >= 3));

    async function submit() {
        if (!valid || busy) return;
        setBusy(true);
        try {
            const saved = creating
                ? await leadsService.createTerritory({ name: name.trim(), side, polygon: polygon!, agentId })
                : await leadsService.updateTerritory(territory.id, { name: name.trim(), agentId, isActive });
            toast.success(creating ? `${saved.name} drawn` : `${saved.name} saved`, { description: creating ? "New leads inside it route to the agent." : undefined });
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
            <DialogContent className="sm:max-w-md" data-testid="territory-dialog">
                <DialogHeader>
                    <DialogTitle>{creating ? "Save as a territory" : `Edit ${territory.name}`}</DialogTitle>
                    <DialogDescription>
                        {creating
                            ? `New leads that land inside this ${polygon?.length ?? 0}-corner area route to the agent first. Every agent of the side still sees the whole map.`
                            : "Route-only: the agent named takes the new leads inside the ring. Draw a new ring on the map to move the boundary."}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="territory-name">Name</Label>
                        <Input id="territory-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Koramangala east" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label>Side</Label>
                            <Select value={side} onValueChange={(value) => setSide(value as LeadSide)} disabled={!creating}>
                                <SelectTrigger aria-label="Side">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="PUBLISHER">{LEAD_SIDE_LABEL.PUBLISHER}</SelectItem>
                                    <SelectItem value="ADVERTISER">{LEAD_SIDE_LABEL.ADVERTISER}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Agent</Label>
                            <Select value={agentId} onValueChange={setAgentId}>
                                <SelectTrigger aria-label="Agent" data-testid="territory-agent">
                                    <SelectValue placeholder="Pick an agent" />
                                </SelectTrigger>
                                <SelectContent>
                                    {agents.map((agent) => (
                                        <SelectItem key={agent.id} value={agent.id}>
                                            {agentLabel(agent)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    {!creating ? (
                        <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                            <span>Routing on</span>
                            <Switch checked={isActive} onCheckedChange={setIsActive} aria-label="Routing on" />
                        </label>
                    ) : null}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button onClick={() => void submit()} disabled={busy || !valid} data-testid="territory-save">
                        {busy ? "Saving…" : creating ? "Save territory" : "Save"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
