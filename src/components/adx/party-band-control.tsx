"use client";

import * as React from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api as http } from "@/lib/api-client";
import { PARTY_BANDS, PARTY_BAND_LABEL, type PartyBand } from "@/services/agent-applications";

interface PartyBandControlProps {
    party: "publishers" | "advertisers";
    partyId: string;
    /** The band on the record; an older server sends none, and INDIVIDUAL is what it means. */
    value: PartyBand | string | null | undefined;
    onChanged?: () => void;
    className?: string;
}

/**
 * AG-5: the importance band on a publisher or an advertiser — ADX's own
 * judgement about who it is dealing with. It decides the withdrawal ladder
 * (publishers, since Lot B) and, since AG-5, which grade of agent the
 * account's work is routed to (Settings › Agent routing). Set from the desk
 * alone, through its own door, and logged.
 */
export function PartyBandControl({ party, partyId, value, onChanged, className }: PartyBandControlProps) {
    const current = (PARTY_BANDS as string[]).includes(value ?? "") ? (value as PartyBand) : "INDIVIDUAL";
    const [busy, setBusy] = React.useState(false);

    const change = async (next: PartyBand) => {
        if (next === current) return;
        setBusy(true);
        try {
            await http.patch(`/${party}/${encodeURIComponent(partyId)}/band`, { sizeBand: next });
            toast.success(`Band set to ${PARTY_BAND_LABEL[next]}`, { description: "Dispatch reads it from the next offer." });
            onChanged?.();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The band did not change.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={className} data-testid="party-band">
            <Label htmlFor={`band-${partyId}`} className="text-xs text-muted-foreground">
                Importance band
            </Label>
            <Select value={current} onValueChange={(v) => void change(v as PartyBand)} disabled={busy}>
                <SelectTrigger id={`band-${partyId}`} className="mt-1 h-9 bg-card" data-testid="party-band-select">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {PARTY_BANDS.map((band) => (
                        <SelectItem key={band} value={band}>
                            {PARTY_BAND_LABEL[band]}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">Decides which grade of agent handles this account, and the withdrawal ladder.</p>
        </div>
    );
}
