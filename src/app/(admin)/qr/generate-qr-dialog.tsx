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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import {
    QR_TYPES,
    QR_TYPE_DESCRIPTION,
    QR_TYPE_LABEL,
    SCANNING_ROLES,
    qrService,
    type QrType,
    type ScanningRole,
} from "@/services/qr";
import { USER_ROLE_META } from "@/types";
import { RefSearchPicker, type PickedRef } from "./ref-search-picker";

/**
 * Minting a code from the desk — `POST /qr` (K-B1).
 *
 * The type, what it names (found on that type's own roster), and the roles
 * that may scan it; none ticked means any scanning role. The schema takes
 * no expiry — a code minted here is open-ended, and only the module's own
 * callers (an access grant, a pickup code) set one — so no expiry field is
 * drawn rather than one that would be dropped on the wire.
 */

interface GenerateQrDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onGenerated: () => void;
}

export function GenerateQrDialog({ open, onOpenChange, onGenerated }: GenerateQrDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">{open && <GenerateForm onCancel={() => onOpenChange(false)} onGenerated={onGenerated} />}</DialogContent>
        </Dialog>
    );
}

function GenerateForm({ onCancel, onGenerated }: { onCancel: () => void; onGenerated: () => void }) {
    const [type, setType] = React.useState<QrType>("SITE");
    const [ref, setRef] = React.useState<PickedRef | null>(null);
    const [roles, setRoles] = React.useState<ScanningRole[]>([]);
    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const changeType = (next: QrType) => {
        setType(next);
        setRef(null);
    };

    const toggle = (role: ScanningRole, on: boolean) =>
        setRoles((current) => (on ? [...current.filter((item) => item !== role), role] : current.filter((item) => item !== role)));

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!ref) {
            setError("Pick what the code names.");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const result = await qrService.generate({ type, refId: ref.id, allowedRoles: roles });
            toast.success(`${QR_TYPE_LABEL[type]} code minted`, { description: `Code ${result.qrId} for ${ref.label}.` });
            onGenerated();
            onCancel();
        } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Could not mint the code.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={submit} noValidate>
            <DialogHeader>
                <DialogTitle>Generate a QR code</DialogTitle>
                <DialogDescription>A signed code for one subject. It stays live until it is deactivated or regenerated.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid gap-1.5">
                    <Label htmlFor="qr-type">Type</Label>
                    <Select value={type} onValueChange={(value) => changeType(value as QrType)}>
                        <SelectTrigger id="qr-type">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {QR_TYPES.map((option) => (
                                <SelectItem key={option} value={option}>
                                    {QR_TYPE_LABEL[option]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{QR_TYPE_DESCRIPTION[type]}</p>
                </div>

                <RefSearchPicker id="qr-ref" type={type} value={ref} onChange={setRef} />

                <fieldset className="grid gap-2">
                    <legend className="text-sm font-medium text-foreground">Who may scan it</legend>
                    <p className="text-xs text-muted-foreground">None ticked means any scanning role. Print partners never scan.</p>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                        {SCANNING_ROLES.map((role) => (
                            <label key={role} className="flex items-center gap-2.5 rounded-md border px-3 py-2">
                                <Checkbox checked={roles.includes(role)} onCheckedChange={(state) => toggle(role, state === true)} aria-label={USER_ROLE_META[role].label} />
                                <span className="text-sm text-foreground">{USER_ROLE_META[role].label}</span>
                            </label>
                        ))}
                    </div>
                </fieldset>

                {error && (
                    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                        {error}
                    </p>
                )}
            </div>
            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                    {submitting ? "Minting…" : "Generate"}
                </Button>
            </DialogFooter>
        </form>
    );
}
