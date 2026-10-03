"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
    ENTITY_PICKER_BUTTON,
    ENTITY_PICKER_HEADING,
    ENTITY_PICKER_HELPER,
    type KycEntityType,
    type KycEntityTypeOption,
} from "@/services/kyc-entity-types";

interface EntityTypeChoicesProps {
    /** What the server allows for this party — `details.options` of the 409. */
    options: KycEntityTypeOption[];
    value: KycEntityType | null;
    onChange: (value: KycEntityType) => void;
    disabled?: boolean;
    /** Keeps the radios' ids apart when two lists are on one page. */
    idPrefix?: string;
}

/**
 * The entity types a party may verify as, one to a line, with the one line
 * of guidance under the whole list — the picker's body, shared by the
 * dialog below and by "Request KYC", which asks inside its own dialog.
 */
export function EntityTypeChoices({ options, value, onChange, disabled, idPrefix = "entity-type" }: EntityTypeChoicesProps) {
    return (
        <div className="space-y-2" data-testid="entity-type-choices">
            <RadioGroup value={value ?? ""} onValueChange={(next) => onChange(next as KycEntityType)} aria-label="Entity type" className="gap-1.5" disabled={disabled}>
                {options.map((option) => (
                    <label key={option.value} className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 has-[[data-state=checked]]:border-primary">
                        <RadioGroupItem value={option.value} id={`${idPrefix}-${option.value}`} />
                        <span className="text-sm text-foreground">{option.label}</span>
                    </label>
                ))}
            </RadioGroup>
            <p className="text-xs text-muted-foreground">{ENTITY_PICKER_HELPER}</p>
        </div>
    );
}

interface EntityTypePickerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Whose account — for the copy. */
    party: string;
    options: KycEntityTypeOption[];
    /** The request is on its way again with the chosen type. */
    busy: boolean;
    onPick: (entityType: KycEntityType) => void;
}

/**
 * "Who is this account for?" — Phase D (the owner, 1 Oct 2026).
 *
 * A Digio start for a publisher, an advertiser or a print partner answers
 * 409 `ENTITY_TYPE_REQUIRED` while the account's entity type is unknown:
 * nothing was stored and nothing went to Digio. This is the small picker
 * that follows — the options the server sent, one choice, and the same
 * request sent again with `{ entityType }`. The type is stored on the
 * account and decides which Digio workflow the check runs on. Agents and
 * employees never see it: their workflow needs no entity type.
 */
export function EntityTypePicker({ open, onOpenChange, party, options, busy, onPick }: EntityTypePickerProps) {
    const [value, setValue] = React.useState<KycEntityType | null>(null);
    return (
        <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
            <DialogContent className="sm:max-w-md" data-testid="entity-type-picker">
                <DialogHeader>
                    <DialogTitle>{ENTITY_PICKER_HEADING}</DialogTitle>
                    <DialogDescription>
                        {party} has no entity type on the account yet, so nothing was sent to Digio. Choose it and the request goes out on that workflow.
                    </DialogDescription>
                </DialogHeader>

                <EntityTypeChoices options={options} value={value} onChange={setValue} disabled={busy} idPrefix="entity-type-picker" />

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button onClick={() => value && onPick(value)} disabled={busy || value === null}>
                        {busy ? "Sending…" : ENTITY_PICKER_BUTTON}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
