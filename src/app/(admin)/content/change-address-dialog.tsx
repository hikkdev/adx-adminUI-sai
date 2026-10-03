"use client";

import * as React from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addressChangeLine, pathProblem, sitePagesService, type SitePageRow } from "@/services/site-pages";

interface ChangeAddressDialogProps {
    /** The page whose address moves; null closes the dialog. */
    page: SitePageRow | null;
    onOpenChange: (open: boolean) => void;
    /** Addresses already answered, pages and redirect sources alike. */
    takenPaths: readonly string[];
    onChanged: () => void;
}

/**
 * PB-1: a page's address, moved. The old one keeps a permanent redirect to
 * the new one, and any redirect that pointed at the old address is pointed
 * at the new one (no chains). "Only admins can change the addresses." —
 * the desk opens this only for `content.addresses`; the server refuses
 * everyone else with 403 regardless, and a 409 when the address is locked.
 */
export function ChangeAddressDialog({ page, onOpenChange, takenPaths, onChanged }: ChangeAddressDialogProps) {
    if (!page) return <Dialog open={false} onOpenChange={onOpenChange} />;
    return <ChangeAddressForm key={page.key} page={page} onOpenChange={onOpenChange} takenPaths={takenPaths} onChanged={onChanged} />;
}

function ChangeAddressForm({ page, onOpenChange, takenPaths, onChanged }: ChangeAddressDialogProps & { page: SitePageRow }) {
    const [path, setPath] = React.useState(page.path);
    const [busy, setBusy] = React.useState(false);
    const trimmed = path.trim();
    const unchanged = trimmed === page.path;
    const problem = pathProblem(trimmed, page) ?? (!unchanged && takenPaths.includes(trimmed) ? "Another page or a redirect already answers this address." : null);
    const ready = !problem && !unchanged;

    async function submit() {
        if (!ready || busy) return;
        setBusy(true);
        try {
            await sitePagesService.update(page.key, { path: trimmed });
            toast.success("Address changed", { description: `${page.path} redirects to ${trimmed} for good.` });
            onChanged();
            onOpenChange(false);
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 409) toast.error("This page's address is locked and cannot change.");
            else toast.error(cause instanceof ApiError ? cause.message : "The address did not change.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open onOpenChange={(next) => (!next && !busy ? onOpenChange(false) : undefined)}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Change the address of “{page.title}”</DialogTitle>
                    <DialogDescription>
                        {page.kind === "SYSTEM" && page.internalPath && page.internalPath.includes(":")
                            ? "This page carries a param — keep it in the new address in the same place."
                            : "Every link that used the old address still lands: a permanent redirect is kept."}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-1.5">
                    <Label htmlFor="change-address-path">New address</Label>
                    <Input
                        id="change-address-path"
                        value={path}
                        onChange={(event) => setPath(event.target.value)}
                        className="font-mono"
                        autoFocus
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                void submit();
                            }
                        }}
                        data-testid="change-address-path"
                    />
                    <p className={cn("text-xs", problem ? "text-danger" : "text-muted-foreground")} data-testid="change-address-line">
                        {problem ?? (unchanged ? "Type the new address." : `${addressChangeLine(page.path, trimmed)} — a permanent redirect will be kept.`)}
                    </p>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" className="bg-card" onClick={() => onOpenChange(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={() => void submit()} disabled={!ready || busy} data-testid="change-address-submit">
                        {busy ? "Changing…" : "Change address"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
