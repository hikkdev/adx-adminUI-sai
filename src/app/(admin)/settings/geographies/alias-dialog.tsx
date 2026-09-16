"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CITY_ALIAS_MAX, citiesService, parseAliases } from "@/services/cities";

interface AliasDialogProps {
    /** The city whose spellings are edited; null keeps the dialog closed. */
    city: { slug: string; name: string; aliases: string[] } | null;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}

/**
 * Teach the resolver another spelling — kept from the pre-Lot V screen,
 * still `PATCH /pricing/cities/:slug { aliases }` since the resolver is
 * pricing's. The server slugifies each on the way in.
 */
export function AliasDialog({ city, onOpenChange, onSaved }: AliasDialogProps) {
    return (
        <Dialog open={city !== null} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">{city && <AliasForm key={city.slug} city={city} onClose={() => onOpenChange(false)} onSaved={onSaved} />}</DialogContent>
        </Dialog>
    );
}

function AliasForm({ city, onClose, onSaved }: { city: NonNullable<AliasDialogProps["city"]>; onClose: () => void; onSaved: () => void }) {
    const [text, setText] = React.useState(city.aliases.join("\n"));
    const [error, setError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const aliases = parseAliases(text);
    const unchanged = aliases.join("\n") === city.aliases.join("\n");

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (unchanged || busy) return;
        setBusy(true);
        setError(null);
        try {
            const next = await citiesService.update(city.slug, { aliases });
            toast.success(`${city.name} answers to ${next.aliases.length} spelling${next.aliases.length === 1 ? "" : "s"}`, {
                description: "The resolver and the per-city counts read them on the next lookup.",
            });
            onSaved();
            onClose();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not save the aliases.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <DialogHeader>
                <DialogTitle>Also written as</DialogTitle>
                <DialogDescription>
                    Every other spelling that should resolve to <code className="rounded bg-muted px-1 py-0.5 text-xs">{city.slug}</code> — one per
                    line. The server slugifies each on the way in, so case and spacing do not matter.
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
                <Label htmlFor="city-aliases">Spellings</Label>
                <Textarea id="city-aliases" value={text} onChange={(event) => setText(event.target.value)} rows={5} placeholder={"Bangalore\nBengaluru Urban"} />
                <p className="text-xs text-muted-foreground">
                    {aliases.length}/{CITY_ALIAS_MAX}. Saving with none clears the list.
                </p>
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button type="submit" disabled={unchanged || busy}>
                    {busy ? "Saving…" : "Save aliases"}
                </Button>
            </DialogFooter>
        </form>
    );
}
