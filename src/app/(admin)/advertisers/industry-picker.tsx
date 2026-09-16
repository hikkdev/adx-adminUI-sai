"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { advertiserService } from "@/services/advertisers";

/** The picker's value for "not set". */
export const NO_INDUSTRY = "__none__";

interface IndustryPickerProps {
    id: string;
    /** The industry in force, or "" for none. */
    value: string;
    onChange: (industry: string) => void;
    disabled?: boolean;
}

/**
 * The industry picklist — Lot G (Q119): `GET /advertisers/industries`, a
 * constant list in code, the only values the profile accepts. The picker
 * offers exactly what the server serves; a value already on the row that
 * the list no longer names stays selectable so an edit that does not touch
 * it does not drop it. While the list is being read, or when it could not
 * be, the trigger says so rather than offering a guess.
 */
export function IndustryPicker({ id, value, onChange, disabled }: IndustryPickerProps) {
    const live = isLive("advertisers");
    const industries = useApiResource<string[]>(`advertisers:industries:${live}`, () => (live ? advertiserService.industries() : Promise.resolve([])));
    const options = industries.data ?? [];
    const withCurrent = value && !options.includes(value) ? [value, ...options] : options;

    return (
        <Select value={value || NO_INDUSTRY} onValueChange={(next) => onChange(next === NO_INDUSTRY ? "" : next)} disabled={disabled || industries.loading}>
            <SelectTrigger id={id} className="h-9" aria-label="Industry">
                <SelectValue placeholder={industries.loading ? "Reading the list…" : industries.error ? "The list could not be read" : "Not set"} />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={NO_INDUSTRY}>Not set</SelectItem>
                {withCurrent.map((industry) => (
                    <SelectItem key={industry} value={industry}>
                        {industry}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

interface EditIndustryDialogProps {
    advertiserId: string;
    advertiserName: string;
    current: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}

/** `PATCH /advertisers/:id { industry }` — clearing sends null. 400 for a value off the list, and the message says so. */
export function EditIndustryDialog({ advertiserId, advertiserName, current, open, onOpenChange, onSaved }: EditIndustryDialogProps) {
    const [value, setValue] = React.useState(current ?? "");
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if ((value || null) === (current ?? null)) {
            onOpenChange(false);
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await advertiserService.update(advertiserId, { industry: value || null });
            toast.success(value ? `${advertiserName} is in ${value}` : `Industry cleared for ${advertiserName}`);
            onOpenChange(false);
            onSaved();
        } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Could not save the industry.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-sm">
                <form onSubmit={submit} noValidate>
                    <DialogHeader>
                        <DialogTitle>Industry</DialogTitle>
                        <DialogDescription>One of the platform's list, so the analytics can group on it. A new industry is a line in the backend's constant, not a free string.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-1.5 py-4">
                        <Label htmlFor="advertiser-industry-edit">Industry</Label>
                        <IndustryPicker id="advertiser-industry-edit" value={value} onChange={setValue} />
                        {error && (
                            <p role="alert" className="mt-2 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                                {error}
                            </p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" className="bg-card" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? "Saving…" : "Save"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
